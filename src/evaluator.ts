import { ASTNode, FormulaEvalError } from './types.js';
import { toNumber, toBoolean, toString } from './coerce.js';

export interface EvalContext {
  getColumn: (name: string) => unknown;
  callFunction: (name: string, args: unknown[]) => unknown;
  /**
   * Set to true by BAIL(). The compiler checks this after evaluation and
   * produces a blank (null) value regardless of what the AST returned.
   * Evaluation continues after a bail — wasted work is the price for keeping
   * the check sites to two (here: IFERROR's catch, plus the compiler top-level).
   */
  bailed: boolean;
}

export function evaluate(node: ASTNode, ctx: EvalContext): unknown {
  switch (node.type) {
    case 'number':  return node.value;
    case 'string':  return node.value;
    case 'boolean': return node.value;
    case 'column':  return ctx.getColumn(node.name);

    case 'unary': {
      const operand = evaluate(node.operand, ctx);
      if (node.operator === '-') return -toNumber(operand);
      throw new FormulaEvalError('EVAL_ERROR', `Unknown unary operator: ${node.operator}`);
    }

    case 'binary': {
      const left = evaluate(node.left, ctx);
      const right = evaluate(node.right, ctx);
      return evaluateBinary(node.operator, left, right);
    }

    case 'function':
      return evaluateFunction(node.name, node.args, ctx);

    case 'template': {
      let result = node.parts[0];
      for (let i = 0; i < node.expressions.length; i++) {
        result += toString(evaluate(node.expressions[i], ctx)) + node.parts[i + 1];
      }
      return result;
    }
  }
}

// ---- Special-form functions (lazy / short-circuit evaluation) ----

function evaluateFunction(name: string, args: ASTNode[], ctx: EvalContext): unknown {
  switch (name) {
    case 'IF': {
      const cond = toBoolean(evaluate(args[0], ctx));
      return cond
        ? (args.length > 1 ? evaluate(args[1], ctx) : true)
        : (args.length > 2 ? evaluate(args[2], ctx) : false);
    }

    case 'IFERROR': {
      try {
        return evaluate(args[0], ctx);
      } catch (e) {
        // BAIL is uncatchable. If the try block evaluated BAIL() and then
        // something downstream threw a real error, we must re-throw rather
        // than return the fallback — otherwise IFERROR masks the bail intent.
        if (ctx.bailed) throw e;
        return args.length > 1 ? evaluate(args[1], ctx) : null;
      }
    }

    case 'BAIL': {
      ctx.bailed = true;
      return undefined;
    }

    case 'AND': {
      for (const arg of args) {
        if (!toBoolean(evaluate(arg, ctx))) return false;
      }
      return true;
    }

    case 'OR': {
      for (const arg of args) {
        if (toBoolean(evaluate(arg, ctx))) return true;
      }
      return false;
    }

    default: {
      const evaluated = args.map(a => evaluate(a, ctx));
      return ctx.callFunction(name, evaluated);
    }
  }
}

// ---- Binary operators ----

function evaluateBinary(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    // Arithmetic
    case '+': return toNumber(left) + toNumber(right);
    case '-': return toNumber(left) - toNumber(right);
    case '*': return toNumber(left) * toNumber(right);
    case '/': {
      const divisor = toNumber(right);
      if (divisor === 0) throw new FormulaEvalError('EVAL_ERROR', 'Division by zero');
      return toNumber(left) / divisor;
    }
    case '%': {
      const divisor = toNumber(right);
      if (divisor === 0) throw new FormulaEvalError('EVAL_ERROR', 'Division by zero');
      return toNumber(left) % divisor;
    }
    case '^': return Math.pow(toNumber(left), toNumber(right));

    // String concatenation
    case '&': return toString(left) + toString(right);

    // Comparisons
    case '=':       return looseEqual(left, right);
    case '!=':
    case '<>':      return !looseEqual(left, right);
    case '<':       return compareValues(left, right) < 0;
    case '>':       return compareValues(left, right) > 0;
    case '<=':      return compareValues(left, right) <= 0;
    case '>=':      return compareValues(left, right) >= 0;

    default:
      throw new FormulaEvalError('EVAL_ERROR', `Unknown operator: ${op}`);
  }
}

// ---- Comparison helpers ----

function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return !Number.isNaN(v);
  if (typeof v === 'boolean') return true;
  if (typeof v === 'string' && v.trim() !== '') return !Number.isNaN(Number(v));
  return false;
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === typeof b) return a === b;
  if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);
  return toString(a) === toString(b);
}

function compareValues(left: unknown, right: unknown): number {
  // Both strings → lexicographic
  if (typeof left === 'string' && typeof right === 'string') {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  // Otherwise → numeric
  return toNumber(left) - toNumber(right);
}
