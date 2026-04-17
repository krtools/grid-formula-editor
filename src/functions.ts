import { toNumber, toBoolean, toString } from './coerce.js';
import { CompiledFormulaFunction } from './types.js';

export type FormulaFunction = CompiledFormulaFunction;

export function createBuiltinFunctions(): Map<string, FormulaFunction> {
  const fns = new Map<string, FormulaFunction>();

  // ---- Math ----

  fns.set('ROUND', (_ctx, n: unknown, decimals: unknown = 0) => {
    const num = toNumber(n);
    const d = toNumber(decimals);
    const factor = Math.pow(10, d);
    return Math.round(num * factor) / factor;
  });

  fns.set('FLOOR', (_ctx, n: unknown) => Math.floor(toNumber(n)));

  fns.set('CEIL', (_ctx, n: unknown) => Math.ceil(toNumber(n)));

  fns.set('ABS', (_ctx, n: unknown) => Math.abs(toNumber(n)));

  fns.set('MIN', (_ctx, ...args: unknown[]) => Math.min(...args.map(toNumber)));

  fns.set('MAX', (_ctx, ...args: unknown[]) => Math.max(...args.map(toNumber)));

  fns.set('MOD', (_ctx, n: unknown, d: unknown) => {
    const divisor = toNumber(d);
    if (divisor === 0) throw new Error('Division by zero');
    return toNumber(n) % divisor;
  });

  fns.set('POWER', (_ctx, base: unknown, exp: unknown) =>
    Math.pow(toNumber(base), toNumber(exp)),
  );

  fns.set('SQRT', (_ctx, n: unknown) => {
    const num = toNumber(n);
    if (num < 0) throw new Error('Cannot take square root of negative number');
    return Math.sqrt(num);
  });

  // ---- String ----

  fns.set('CONCAT', (_ctx, ...args: unknown[]) => args.map(toString).join(''));

  fns.set('LEFT', (_ctx, text: unknown, n: unknown) =>
    toString(text).slice(0, toNumber(n)),
  );

  fns.set('RIGHT', (_ctx, text: unknown, n: unknown) => {
    const s = toString(text);
    return s.slice(Math.max(0, s.length - toNumber(n)));
  });

  fns.set('MID', (_ctx, text: unknown, start: unknown, count: unknown) => {
    const s = toString(text);
    const i = toNumber(start) - 1; // 1-based like Excel
    return s.slice(i, i + toNumber(count));
  });

  fns.set('LEN', (_ctx, text: unknown) => toString(text).length);

  fns.set('TRIM', (_ctx, text: unknown) => toString(text).trim());

  fns.set('UPPER', (_ctx, text: unknown) => toString(text).toUpperCase());

  fns.set('LOWER', (_ctx, text: unknown) => toString(text).toLowerCase());

  fns.set('SUBSTITUTE', (_ctx, text: unknown, oldStr: unknown, newStr: unknown) =>
    toString(text).split(toString(oldStr)).join(toString(newStr)),
  );

  // ---- URL ----

  fns.set('URLENCODE', (_ctx, text: unknown) => encodeURIComponent(toString(text)));

  fns.set('URLDECODE', (_ctx, text: unknown) => decodeURIComponent(toString(text)));

  // ---- Logical ----
  // IF, AND, OR, IFERROR, BAIL, REQUIRE, SELF are handled as special forms in
  // the evaluator for short-circuit / lazy evaluation and control-flow
  // semantics.

  fns.set('NOT', (_ctx, val: unknown) => !toBoolean(val));

  // ---- Type / Utility ----

  fns.set('ISNUMBER', (_ctx, val: unknown) => {
    if (typeof val === 'number') return !Number.isNaN(val);
    if (typeof val === 'string' && val.trim() !== '') return !Number.isNaN(Number(val));
    return false;
  });

  fns.set('ISBLANK', (_ctx, val: unknown) =>
    val === null || val === undefined || val === '',
  );

  fns.set('VALUE', (_ctx, text: unknown) => {
    const n = Number(toString(text));
    if (Number.isNaN(n)) throw new Error(`Cannot convert "${text}" to number`);
    return n;
  });

  fns.set('TEXT', (_ctx, val: unknown) => toString(val));

  fns.set('COALESCE', (_ctx, ...args: unknown[]) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined) return arg;
    }
    return null;
  });

  return fns;
}
