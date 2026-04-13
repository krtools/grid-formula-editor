import { toNumber, toBoolean, toString } from './coerce.js';

export type FormulaFunction = (...args: unknown[]) => unknown;

export function createBuiltinFunctions(): Map<string, FormulaFunction> {
  const fns = new Map<string, FormulaFunction>();

  // ---- Math ----

  fns.set('ROUND', (n: unknown, decimals: unknown = 0) => {
    const num = toNumber(n);
    const d = toNumber(decimals);
    const factor = Math.pow(10, d);
    return Math.round(num * factor) / factor;
  });

  fns.set('FLOOR', (n: unknown) => Math.floor(toNumber(n)));

  fns.set('CEIL', (n: unknown) => Math.ceil(toNumber(n)));

  fns.set('ABS', (n: unknown) => Math.abs(toNumber(n)));

  fns.set('MIN', (...args: unknown[]) => Math.min(...args.map(toNumber)));

  fns.set('MAX', (...args: unknown[]) => Math.max(...args.map(toNumber)));

  fns.set('MOD', (n: unknown, d: unknown) => {
    const divisor = toNumber(d);
    if (divisor === 0) throw new Error('Division by zero');
    return toNumber(n) % divisor;
  });

  fns.set('POWER', (base: unknown, exp: unknown) =>
    Math.pow(toNumber(base), toNumber(exp)),
  );

  fns.set('SQRT', (n: unknown) => {
    const num = toNumber(n);
    if (num < 0) throw new Error('Cannot take square root of negative number');
    return Math.sqrt(num);
  });

  // ---- String ----

  fns.set('CONCAT', (...args: unknown[]) => args.map(toString).join(''));

  fns.set('LEFT', (text: unknown, n: unknown) =>
    toString(text).slice(0, toNumber(n)),
  );

  fns.set('RIGHT', (text: unknown, n: unknown) => {
    const s = toString(text);
    return s.slice(Math.max(0, s.length - toNumber(n)));
  });

  fns.set('MID', (text: unknown, start: unknown, count: unknown) => {
    const s = toString(text);
    const i = toNumber(start) - 1; // 1-based like Excel
    return s.slice(i, i + toNumber(count));
  });

  fns.set('LEN', (text: unknown) => toString(text).length);

  fns.set('TRIM', (text: unknown) => toString(text).trim());

  fns.set('UPPER', (text: unknown) => toString(text).toUpperCase());

  fns.set('LOWER', (text: unknown) => toString(text).toLowerCase());

  fns.set('SUBSTITUTE', (text: unknown, oldStr: unknown, newStr: unknown) =>
    toString(text).split(toString(oldStr)).join(toString(newStr)),
  );

  // ---- URL ----

  fns.set('URLENCODE', (text: unknown) => encodeURIComponent(toString(text)));

  fns.set('URLDECODE', (text: unknown) => decodeURIComponent(toString(text)));

  // ---- Logical ----
  // IF, AND, OR, IFERROR are handled as special forms in the evaluator
  // for short-circuit / lazy evaluation.

  fns.set('NOT', (val: unknown) => !toBoolean(val));

  // ---- Type / Utility ----

  fns.set('ISNUMBER', (val: unknown) => {
    if (typeof val === 'number') return !Number.isNaN(val);
    if (typeof val === 'string' && val.trim() !== '') return !Number.isNaN(Number(val));
    return false;
  });

  fns.set('ISBLANK', (val: unknown) =>
    val === null || val === undefined || val === '',
  );

  fns.set('VALUE', (text: unknown) => {
    const n = Number(toString(text));
    if (Number.isNaN(n)) throw new Error(`Cannot convert "${text}" to number`);
    return n;
  });

  fns.set('TEXT', (val: unknown) => toString(val));

  fns.set('COALESCE', (...args: unknown[]) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined) return arg;
    }
    return null;
  });

  return fns;
}
