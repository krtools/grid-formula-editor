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
} from './types.js';

interface CompiledColumn {
  name: string;
  formula: string;
  ast: ASTNode;
  refs: string[];
}

export function compile<T>(options: CompileOptions<T>): CompiledProcessor<T> {
  const { columns, get, set, onError, functions: customFunctions } = options;

  // ---- Build function registry ----

  const functionRegistry = createBuiltinFunctions();
  if (customFunctions) {
    for (const [name, fn] of Object.entries(customFunctions)) {
      functionRegistry.set(name.toUpperCase(), fn);
    }
  }

  // ---- Parse all formulas ----

  const compiled = new Map<string, CompiledColumn>();
  const failedColumns = new Set<string>();

  for (const col of columns) {
    try {
      const ast = parse(col.formula);
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
      if (onError) {
        onError(error);
      } else {
        throw new Error(error.message);
      }
    }
  }

  // ---- Dependency resolution ----

  const formulaLookup = new Map(columns.map(c => [c.name, c.formula]));
  const formulaNames = new Set(compiled.keys());
  const depGraph = new Map<string, string[]>();
  for (const [name, col] of compiled) {
    depGraph.set(name, col.refs.filter(r => formulaNames.has(r)));
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
    if (onError) {
      onError(error);
    } else {
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
    process(row: T): void {
      const formulaValues = new Map<string, unknown>();

      for (const col of evalOrder) {
        const ctx: EvalContext = {
          bailed: false,

          getColumn(name: string): unknown {
            if (formulaValues.has(name)) return formulaValues.get(name);
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
            try {
              return fn(...args);
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

          if (onError) {
            const fallback = onError(error, row);
            if (fallback !== undefined) {
              formulaValues.set(col.name, fallback);
              set(row, col.name, fallback, col.refs);
            }
          }
        }
      }
    },
  };
}
