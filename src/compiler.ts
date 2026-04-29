import { parse } from './parser.js';
import { extractColumnRefs, resolveDependencies } from './dependency.js';
import { evaluate } from './evaluator.js';
import { createBuiltinFunctions } from './functions.js';
import type { EvalContext } from './evaluator.js';
import {
  ASTNode,
  CompileOptions,
  CompiledProcessor,
  FormulaError,
  FormulaErrorCode,
  FormulaErrorSeverity,
  FormulaEvalError,
  FunctionContext,
} from './types.js';

interface CompiledColumn {
  name: string;
  formula: string;
  ast: ASTNode;
  refs: string[];
}

// Walks the AST in place and wraps every template interpolation expression
// in a synthetic REQUIRE(...) call, except when the top-level is already a
// bail-aware form (REQUIRE, OPTIONAL, BAIL) — those either do the right
// thing already or opt out explicitly. Used only when the compile option
// `requireTemplateVars` is true.
function wrapTemplateInterpolations(node: ASTNode): void {
  switch (node.type) {
    case 'template':
      for (let i = 0; i < node.expressions.length; i++) {
        const expr = node.expressions[i];
        const skip =
          expr.type === 'function' &&
          (expr.name === 'REQUIRE' || expr.name === 'OPTIONAL' || expr.name === 'BAIL');
        if (!skip) {
          node.expressions[i] = { type: 'function', name: 'REQUIRE', args: [expr] };
        }
        wrapTemplateInterpolations(node.expressions[i]);
      }
      return;
    case 'binary':
      wrapTemplateInterpolations(node.left);
      wrapTemplateInterpolations(node.right);
      return;
    case 'unary':
      wrapTemplateInterpolations(node.operand);
      return;
    case 'function':
      for (const arg of node.args) wrapTemplateInterpolations(arg);
      return;
  }
}

export function compile<T>(options: CompileOptions<T>): CompiledProcessor<T> {
  const {
    columns,
    get,
    set,
    onError,
    onCompileError,
    onRuntimeError,
    functions: customFunctions,
    requireTemplateVars,
    tolerateCompileErrors,
  } = options;

  // Resolve callback handlers. Phase-specific callbacks take precedence; the
  // legacy `onError` is the unified fallback so existing callers keep working.
  const handleCompileError: ((error: FormulaError) => unknown) | undefined =
    onCompileError ?? onError;
  const handleRuntimeError: ((error: FormulaError, row: T) => unknown) | undefined =
    onRuntimeError ?? onError;

  // ---- Build function registry ----

  const functionRegistry = createBuiltinFunctions();
  if (customFunctions) {
    for (const [name, fn] of Object.entries(customFunctions)) {
      functionRegistry.set(name.toUpperCase(), fn as (
        ctx: FunctionContext<unknown>,
        ...args: unknown[]
      ) => unknown);
    }
  }

  // ---- Parse all formulas ----

  const compiled = new Map<string, CompiledColumn>();
  const failedColumns = new Set<string>();
  const compileErrors: FormulaError[] = [];

  for (const col of columns) {
    try {
      const ast = parse(col.formula);
      if (requireTemplateVars) wrapTemplateInterpolations(ast);
      const refs = extractColumnRefs(ast);
      compiled.set(col.name, { name: col.name, formula: col.formula, ast, refs });
    } catch (cause) {
      failedColumns.add(col.name);
      const error: FormulaError = {
        code: 'PARSE_ERROR',
        severity: 'fatal',
        column: col.name,
        formula: col.formula,
        referencedColumns: [],
        message: `Failed to parse formula for "${col.name}": ${(cause as Error).message}`,
        cause,
      };
      compileErrors.push(error);
      if (handleCompileError) {
        handleCompileError(error);
      } else if (!tolerateCompileErrors) {
        throw new Error(error.message);
      }
    }
  }

  // ---- Dependency resolution ----

  const formulaLookup = new Map(columns.map(c => [c.name, c.formula]));
  const formulaNames = new Set(compiled.keys());
  const depGraph = new Map<string, string[]>();
  for (const [name, col] of compiled) {
    // Self-edges are allowed — a formula referencing its own column reads the
    // pre-formula raw input (see rawValues snapshot below), not the computed
    // output, so there's no real dependency cycle.
    depGraph.set(name, col.refs.filter(r => formulaNames.has(r) && r !== name));
  }

  const { sorted, cycles } = resolveDependencies(depGraph);

  const circularColumns = new Set<string>();
  for (const cycle of cycles) {
    for (const name of cycle) circularColumns.add(name);
    const primaryCol = cycle[0];
    const primaryCompiled = compiled.get(primaryCol);
    const error: FormulaError = {
      code: 'CIRCULAR_REFERENCE',
      severity: 'fatal',
      column: primaryCol,
      formula: formulaLookup.get(primaryCol) ?? '',
      referencedColumns: primaryCompiled?.refs ?? [],
      message: `Circular reference detected: ${cycle.join(' \u2192 ')}`,
    };
    compileErrors.push(error);
    if (handleCompileError) {
      handleCompileError(error);
    } else if (!tolerateCompileErrors) {
      throw new Error(error.message);
    }
  }

  // ---- Evaluation order (exclude broken columns) ----

  const evalOrder: CompiledColumn[] = sorted
    .filter(name => !failedColumns.has(name) && !circularColumns.has(name))
    .map(name => compiled.get(name)!)
    .filter(Boolean);

  // ---- Processor ----

  return {
    compileErrors,
    process(row: T): void {
      const formulaValues = new Map<string, unknown>();
      // Columns that errored on this row, with the originating FormulaError.
      // Reading any of these via getColumn cascades a DEPENDENCY_ERROR.
      // Bailed columns are NOT in here — bails return null and propagate
      // normally without poisoning dependents.
      const erroredColumns = new Map<string, FormulaError>();

      // Snapshot raw inputs for every formula column so self-references
      // (`price: 'price + 1'` or `price: 'SELF() + 1'`) resolve to the raw
      // input, not the formula output. formulaValues won't have the current
      // column yet during its own evaluation, so getColumn reads from this
      // snapshot. Note: this doesn't make process() idempotent across calls —
      // set() mutates the row, so a second process() sees the prior output.
      const rawValues = new Map<string, unknown>();
      for (const col of evalOrder) {
        try {
          rawValues.set(col.name, get(row, col.name));
        } catch {
          rawValues.set(col.name, undefined);
        }
      }

      // Tolerant pre-loop: replay each compile error as a per-row runtime
      // error. Honors the same fallback semantics as the runtime catch — if
      // the handler returns a value, use it; otherwise mark the column
      // errored so dependents cascade.
      if (tolerateCompileErrors) {
        for (const compileError of compileErrors) {
          const replay: FormulaError = {
            ...compileError,
            severity: 'error',
          };
          if (handleRuntimeError) {
            const fallback = handleRuntimeError(replay, row);
            if (fallback !== undefined) {
              formulaValues.set(replay.column, fallback);
              set(row, replay.column, fallback, replay.referencedColumns);
              continue;
            }
          }
          erroredColumns.set(replay.column, replay);
        }
      }

      for (const col of evalOrder) {
        const ctx: EvalContext = {
          bailed: false,
          currentColumn: col.name,

          getColumn(name: string): unknown {
            // Cascade: if a dependency errored on this row, propagate. Don't
            // do this for self-references (rawValues has the pre-formula
            // input, which is what self-refs are supposed to read).
            if (name !== col.name && erroredColumns.has(name)) {
              throw new FormulaEvalError(
                'DEPENDENCY_ERROR',
                `Cannot read column "${name}": dependency errored on this row`,
                erroredColumns.get(name),
              );
            }
            if (formulaValues.has(name)) return formulaValues.get(name);
            // Self-ref during current column's eval: formulaValues is empty,
            // rawValues has the pre-formula input.
            if (rawValues.has(name)) return rawValues.get(name);
            try {
              return get(row, name);
            } catch (cause) {
              throw new FormulaEvalError(
                'REFERENCE_ERROR',
                `Error reading column "${name}": ${(cause as Error).message}`,
                cause,
              );
            }
          },

          callFunction(name: string, args: unknown[]): unknown {
            const fn = functionRegistry.get(name);
            if (!fn) {
              throw new FormulaEvalError('FUNCTION_ERROR', `Unknown function: ${name}`);
            }
            const fnCtx: FunctionContext<T> = { row, column: col.name };
            try {
              return fn(fnCtx as FunctionContext<unknown>, ...args);
            } catch (cause) {
              if (cause instanceof FormulaEvalError) throw cause;
              throw new FormulaEvalError(
                'FUNCTION_ERROR',
                `Error in function ${name}: ${(cause as Error).message}`,
                cause,
              );
            }
          },
        };

        try {
          const value = evaluate(col.ast, ctx);
          // BAIL() produces a blank value, not an error. If the formula
          // bailed, discard whatever the AST ultimately returned.
          if (ctx.bailed) {
            formulaValues.set(col.name, null);
            set(row, col.name, null, col.refs);
            continue;
          }
          formulaValues.set(col.name, value);
          set(row, col.name, value, col.refs);
        } catch (cause) {
          // Downstream errors after BAIL are absorbed — once bailed, the
          // formula's output is null regardless of what else blew up.
          if (ctx.bailed) {
            formulaValues.set(col.name, null);
            set(row, col.name, null, col.refs);
            continue;
          }

          let code: FormulaErrorCode = 'EVAL_ERROR';
          let severity: FormulaErrorSeverity = 'error';
          let originalCause: unknown = cause;

          if (cause instanceof FormulaEvalError) {
            code = cause.code;
            severity = cause.code === 'TYPE_ERROR' ? 'warning' : 'error';
            originalCause = cause.originalCause ?? cause;
          }

          const error: FormulaError = {
            code,
            severity,
            column: col.name,
            formula: col.formula,
            referencedColumns: col.refs,
            message: `Error evaluating "${col.name}": ${(cause as Error).message}`,
            cause: originalCause,
          };

          if (handleRuntimeError) {
            const fallback = handleRuntimeError(error, row);
            if (fallback !== undefined) {
              formulaValues.set(col.name, fallback);
              set(row, col.name, fallback, col.refs);
              continue;
            }
          }
          // No fallback supplied — mark errored so dependents cascade with
          // a DEPENDENCY_ERROR rather than silently reading stale raw input.
          erroredColumns.set(col.name, error);
        }
      }
    },
  };
}
