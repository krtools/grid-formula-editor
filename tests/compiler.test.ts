import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import type { FormulaError } from '../src/types.js';

type Row = Record<string, unknown>;

function makeProcessor(
  formulas: Record<string, string>,
  customFunctions?: Record<string, (...args: unknown[]) => unknown>,
  onError?: (error: FormulaError, row?: Row) => unknown,
) {
  const columns = Object.entries(formulas).map(([name, formula]) => ({ name, formula }));
  return compile<Row>({
    columns,
    get: (row, col) => {
      if (!(col in row)) throw new Error(`Column "${col}" not found`);
      return row[col];
    },
    set: (row, col, value) => {
      row[col] = value;
    },
    functions: customFunctions,
    onError,
  });
}

// ============================================================
// Basic arithmetic
// ============================================================

describe('basic arithmetic', () => {
  it('multiplies columns', () => {
    const proc = makeProcessor({ total: 'price * quantity' });
    const row: Row = { price: 10, quantity: 5 };
    proc.process(row);
    expect(row.total).toBe(50);
  });

  it('adds columns', () => {
    const proc = makeProcessor({ sum: 'a + b' });
    const row: Row = { a: 3, b: 7 };
    proc.process(row);
    expect(row.sum).toBe(10);
  });

  it('subtracts columns', () => {
    const proc = makeProcessor({ diff: 'a - b' });
    const row: Row = { a: 10, b: 3 };
    proc.process(row);
    expect(row.diff).toBe(7);
  });

  it('divides columns', () => {
    const proc = makeProcessor({ ratio: 'a / b' });
    const row: Row = { a: 10, b: 4 };
    proc.process(row);
    expect(row.ratio).toBe(2.5);
  });

  it('modulo', () => {
    const proc = makeProcessor({ remainder: 'a % b' });
    const row: Row = { a: 10, b: 3 };
    proc.process(row);
    expect(row.remainder).toBe(1);
  });

  it('power', () => {
    const proc = makeProcessor({ result: 'a ^ b' });
    const row: Row = { a: 2, b: 10 };
    proc.process(row);
    expect(row.result).toBe(1024);
  });

  it('unary minus', () => {
    const proc = makeProcessor({ neg: '-value' });
    const row: Row = { value: 42 };
    proc.process(row);
    expect(row.neg).toBe(-42);
  });

  it('respects operator precedence (* before +)', () => {
    const proc = makeProcessor({ result: 'a + b * c' });
    const row: Row = { a: 1, b: 2, c: 3 };
    proc.process(row);
    expect(row.result).toBe(7);
  });

  it('parentheses override precedence', () => {
    const proc = makeProcessor({ result: '(a + b) * c' });
    const row: Row = { a: 1, b: 2, c: 3 };
    proc.process(row);
    expect(row.result).toBe(9);
  });

  it('power is right-associative', () => {
    // 2 ^ 3 ^ 2 = 2 ^ (3^2) = 2 ^ 9 = 512  (not (2^3)^2 = 64)
    const proc = makeProcessor({ result: 'a ^ b ^ c' });
    const row: Row = { a: 2, b: 3, c: 2 };
    proc.process(row);
    expect(row.result).toBe(512);
  });

  it('handles numeric literals', () => {
    const proc = makeProcessor({ result: 'price * 1.08' });
    const row: Row = { price: 100 };
    proc.process(row);
    expect(row.result).toBeCloseTo(108);
  });
});

// ============================================================
// String operations
// ============================================================

describe('string operations', () => {
  it('ampersand concatenation', () => {
    const proc = makeProcessor({ full: 'first & " " & last' });
    const row: Row = { first: 'John', last: 'Doe' };
    proc.process(row);
    expect(row.full).toBe('John Doe');
  });

  it('CONCAT function', () => {
    const proc = makeProcessor({ full: 'CONCAT(first, " ", last)' });
    const row: Row = { first: 'Jane', last: 'Doe' };
    proc.process(row);
    expect(row.full).toBe('Jane Doe');
  });

  it('UPPER and LOWER', () => {
    const proc = makeProcessor({
      up: 'UPPER(name)',
      lo: 'LOWER(name)',
    });
    const row: Row = { name: 'Hello World' };
    proc.process(row);
    expect(row.up).toBe('HELLO WORLD');
    expect(row.lo).toBe('hello world');
  });

  it('LEFT, RIGHT, MID', () => {
    const proc = makeProcessor({
      l: 'LEFT(text, 3)',
      r: 'RIGHT(text, 3)',
      m: 'MID(text, 3, 4)',
    });
    const row: Row = { text: 'abcdefgh' };
    proc.process(row);
    expect(row.l).toBe('abc');
    expect(row.r).toBe('fgh');
    expect(row.m).toBe('cdef'); // 1-based start
  });

  it('LEN and TRIM', () => {
    const proc = makeProcessor({
      len: 'LEN(text)',
      trimmed: 'TRIM(text)',
    });
    const row: Row = { text: '  hello  ' };
    proc.process(row);
    expect(row.len).toBe(9);
    expect(row.trimmed).toBe('hello');
  });

  it('SUBSTITUTE', () => {
    const proc = makeProcessor({ result: 'SUBSTITUTE(text, "world", "there")' });
    const row: Row = { text: 'hello world' };
    proc.process(row);
    expect(row.result).toBe('hello there');
  });
});

// ============================================================
// URL functions
// ============================================================

describe('URL functions', () => {
  it('URLENCODE', () => {
    const proc = makeProcessor({ encoded: 'URLENCODE(value)' });
    const row: Row = { value: 'hello world&foo=bar' };
    proc.process(row);
    expect(row.encoded).toBe('hello%20world%26foo%3Dbar');
  });

  it('URLDECODE', () => {
    const proc = makeProcessor({ decoded: 'URLDECODE(value)' });
    const row: Row = { value: 'hello%20world%26foo%3Dbar' };
    proc.process(row);
    expect(row.decoded).toBe('hello world&foo=bar');
  });
});

// ============================================================
// Comparisons
// ============================================================

describe('comparisons', () => {
  it('equality (true)', () => {
    const proc = makeProcessor({ eq: 'a = b' });
    const row: Row = { a: 5, b: 5 };
    proc.process(row);
    expect(row.eq).toBe(true);
  });

  it('equality (false)', () => {
    const proc = makeProcessor({ eq: 'a = b' });
    const row: Row = { a: 5, b: 6 };
    proc.process(row);
    expect(row.eq).toBe(false);
  });

  it('inequality', () => {
    const proc = makeProcessor({ neq: 'a != b' });
    const row: Row = { a: 5, b: 6 };
    proc.process(row);
    expect(row.neq).toBe(true);
  });

  it('<> inequality syntax', () => {
    const proc = makeProcessor({ neq: 'a <> b' });
    const row: Row = { a: 5, b: 6 };
    proc.process(row);
    expect(row.neq).toBe(true);
  });

  it('less / greater than', () => {
    const proc = makeProcessor({
      lt: 'a < b',
      gt: 'a > b',
      lte: 'a <= b',
      gte: 'a >= b',
    });
    const row: Row = { a: 3, b: 5 };
    proc.process(row);
    expect(row.lt).toBe(true);
    expect(row.gt).toBe(false);
    expect(row.lte).toBe(true);
    expect(row.gte).toBe(false);
  });

  it('loose equality coerces string to number', () => {
    const proc = makeProcessor({ eq: 'a = b' });
    const row: Row = { a: '5', b: 5 };
    proc.process(row);
    expect(row.eq).toBe(true);
  });

  it('string comparison is lexicographic', () => {
    const proc = makeProcessor({ lt: 'a < b' });
    const row: Row = { a: 'abc', b: 'def' };
    proc.process(row);
    expect(row.lt).toBe(true);
  });
});

// ============================================================
// Conditional logic
// ============================================================

describe('conditional logic', () => {
  it('IF true branch', () => {
    const proc = makeProcessor({ result: 'IF(amount > 100, "high", "low")' });
    const row: Row = { amount: 200 };
    proc.process(row);
    expect(row.result).toBe('high');
  });

  it('IF false branch', () => {
    const proc = makeProcessor({ result: 'IF(amount > 100, "high", "low")' });
    const row: Row = { amount: 50 };
    proc.process(row);
    expect(row.result).toBe('low');
  });

  it('AND function', () => {
    const proc = makeProcessor({ result: 'IF(AND(a > 0, b > 0), "yes", "no")' });

    const row1: Row = { a: 1, b: 2 };
    proc.process(row1);
    expect(row1.result).toBe('yes');

    const row2: Row = { a: -1, b: 2 };
    proc.process(row2);
    expect(row2.result).toBe('no');
  });

  it('OR function', () => {
    const proc = makeProcessor({ result: 'IF(OR(a > 10, b > 10), "yes", "no")' });
    const row: Row = { a: 5, b: 15 };
    proc.process(row);
    expect(row.result).toBe('yes');
  });

  it('NOT function', () => {
    const proc = makeProcessor({ result: 'NOT(flag)' });
    const row: Row = { flag: true };
    proc.process(row);
    expect(row.result).toBe(false);
  });

  it('IFERROR catches division by zero', () => {
    const proc = makeProcessor({ result: 'IFERROR(a / b, 0)' });
    const row: Row = { a: 10, b: 0 };
    proc.process(row);
    expect(row.result).toBe(0);
  });

  it('IFERROR passes through on success', () => {
    const proc = makeProcessor({ result: 'IFERROR(a / b, 0)' });
    const row: Row = { a: 10, b: 2 };
    proc.process(row);
    expect(row.result).toBe(5);
  });

  it('nested IFERROR', () => {
    // inner fallback also errors → outer catches it
    const proc = makeProcessor({ result: 'IFERROR(IFERROR(a / b, c / d), 99)' });
    const row: Row = { a: 1, b: 0, c: 1, d: 0 };
    proc.process(row);
    expect(row.result).toBe(99);
  });
});

// ============================================================
// Math functions
// ============================================================

describe('math functions', () => {
  it('ROUND', () => {
    const proc = makeProcessor({ result: 'ROUND(value, 2)' });
    const row: Row = { value: 3.14159 };
    proc.process(row);
    expect(row.result).toBe(3.14);
  });

  it('FLOOR and CEIL', () => {
    const proc = makeProcessor({ fl: 'FLOOR(value)', ce: 'CEIL(value)' });
    const row: Row = { value: 3.7 };
    proc.process(row);
    expect(row.fl).toBe(3);
    expect(row.ce).toBe(4);
  });

  it('ABS', () => {
    const proc = makeProcessor({ result: 'ABS(value)' });
    const row: Row = { value: -42 };
    proc.process(row);
    expect(row.result).toBe(42);
  });

  it('MIN and MAX', () => {
    const proc = makeProcessor({ mn: 'MIN(a, b, c)', mx: 'MAX(a, b, c)' });
    const row: Row = { a: 3, b: 1, c: 5 };
    proc.process(row);
    expect(row.mn).toBe(1);
    expect(row.mx).toBe(5);
  });

  it('MOD', () => {
    const proc = makeProcessor({ result: 'MOD(a, b)' });
    const row: Row = { a: 10, b: 3 };
    proc.process(row);
    expect(row.result).toBe(1);
  });

  it('POWER', () => {
    const proc = makeProcessor({ result: 'POWER(2, 8)' });
    const row: Row = {};
    proc.process(row);
    expect(row.result).toBe(256);
  });

  it('SQRT', () => {
    const proc = makeProcessor({ result: 'SQRT(value)' });
    const row: Row = { value: 16 };
    proc.process(row);
    expect(row.result).toBe(4);
  });
});

// ============================================================
// Type / utility functions
// ============================================================

describe('type utilities', () => {
  it('COALESCE returns first non-null', () => {
    const proc = makeProcessor({ result: 'COALESCE(a, b, c)' });
    const row: Row = { a: null, b: undefined, c: 42 };
    proc.process(row);
    expect(row.result).toBe(42);
  });

  it('ISBLANK', () => {
    const proc = makeProcessor({ blank: 'ISBLANK(a)', notBlank: 'ISBLANK(b)' });
    const row: Row = { a: null, b: 'hello' };
    proc.process(row);
    expect(row.blank).toBe(true);
    expect(row.notBlank).toBe(false);
  });

  it('ISNUMBER', () => {
    const proc = makeProcessor({ yes: 'ISNUMBER(a)', no: 'ISNUMBER(b)' });
    const row: Row = { a: 42, b: 'hello' };
    proc.process(row);
    expect(row.yes).toBe(true);
    expect(row.no).toBe(false);
  });

  it('ISNUMBER recognises numeric strings', () => {
    const proc = makeProcessor({ result: 'ISNUMBER(a)' });
    const row: Row = { a: '3.14' };
    proc.process(row);
    expect(row.result).toBe(true);
  });

  it('VALUE parses number from string', () => {
    const proc = makeProcessor({ result: 'VALUE(a)' });
    const row: Row = { a: '123.45' };
    proc.process(row);
    expect(row.result).toBe(123.45);
  });

  it('TEXT converts to string', () => {
    const proc = makeProcessor({ result: 'TEXT(a)' });
    const row: Row = { a: 42 };
    proc.process(row);
    expect(row.result).toBe('42');
  });
});

// ============================================================
// Formula column dependencies
// ============================================================

describe('formula dependencies', () => {
  it('formula column references another formula column', () => {
    const proc = makeProcessor({
      subtotal: 'price * quantity',
      tax: 'subtotal * 0.1',
      total: 'subtotal + tax',
    });
    const row: Row = { price: 100, quantity: 2 };
    proc.process(row);
    expect(row.subtotal).toBe(200);
    expect(row.tax).toBe(20);
    expect(row.total).toBe(220);
  });

  it('resolves correct order regardless of config order', () => {
    const proc = makeProcessor({
      total: 'subtotal + tax',
      tax: 'subtotal * 0.1',
      subtotal: 'price * quantity',
    });
    const row: Row = { price: 50, quantity: 4 };
    proc.process(row);
    expect(row.subtotal).toBe(200);
    expect(row.tax).toBe(20);
    expect(row.total).toBe(220);
  });
});

// ============================================================
// Circular references
// ============================================================

describe('circular references', () => {
  it('detects A ↔ B cycle with full context', () => {
    const errors: FormulaError[] = [];
    const proc = makeProcessor(
      { a: 'b + 1', b: 'a + 1' },
      undefined,
      (err) => { errors.push(err); return undefined; },
    );
    const circErr = errors.find(e => e.code === 'CIRCULAR_REFERENCE');
    expect(circErr).toBeDefined();
    expect(circErr!.severity).toBe('fatal');
    expect(circErr!.formula).toBeTruthy();
    expect(circErr!.referencedColumns.length).toBeGreaterThan(0);

    const row: Row = {};
    proc.process(row);
    expect(row.a).toBeUndefined();
    expect(row.b).toBeUndefined();
  });

  it('detects self-reference', () => {
    const errors: FormulaError[] = [];
    makeProcessor(
      { a: 'a + 1' },
      undefined,
      (err) => { errors.push(err); return undefined; },
    );
    expect(errors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });

  it('throws without onError handler', () => {
    expect(() => makeProcessor({ a: 'b + 1', b: 'a + 1' })).toThrow(
      /Circular reference/,
    );
  });

  it('non-circular columns still process when cycle exists', () => {
    const errors: FormulaError[] = [];
    const proc = makeProcessor(
      { x: 'val + 1', a: 'b + 1', b: 'a + 1' },
      undefined,
      (err) => { errors.push(err); return undefined; },
    );
    const row: Row = { val: 10 };
    proc.process(row);
    expect(row.x).toBe(11);
    expect(row.a).toBeUndefined();
  });
});

// ============================================================
// Error handling
// ============================================================

describe('error handling', () => {
  it('reports getter errors via onError with full context', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'badCol + 1' }],
      get: (_row, col) => {
        throw new Error(`Column "${col}" not found`);
      },
      set: (row, col, val) => { row[col] = val; },
      onError: (err) => { errors.push(err); return undefined; },
    });

    const row: Row = {};
    proc.process(row);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('REFERENCE_ERROR');
    expect(errors[0].column).toBe('result');
    expect(errors[0].formula).toBe('badCol + 1');
    expect(errors[0].referencedColumns).toContain('badCol');
    expect(row.result).toBeUndefined();
  });

  it('onError can provide a fallback value', () => {
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'a / b' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onError: () => -1,
    });

    const row: Row = { a: 10, b: 0 };
    proc.process(row);
    expect(row.result).toBe(-1);
  });

  it('fallback value is available to later formula columns', () => {
    const proc = compile<Row>({
      columns: [
        { name: 'safe', formula: 'a / b' },
        { name: 'doubled', formula: 'safe * 2' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onError: () => 0,
    });

    const row: Row = { a: 10, b: 0 };
    proc.process(row);
    expect(row.safe).toBe(0);
    expect(row.doubled).toBe(0);
  });

  it('reports parse errors via onError with full context', () => {
    const errors: FormulaError[] = [];
    makeProcessor(
      { result: '+ + +' },
      undefined,
      (err) => { errors.push(err); return undefined; },
    );
    const parseErr = errors.find(e => e.code === 'PARSE_ERROR');
    expect(parseErr).toBeDefined();
    expect(parseErr!.column).toBe('result');
    expect(parseErr!.formula).toBe('+ + +');
    expect(parseErr!.severity).toBe('fatal');
  });

  it('throws parse error without onError', () => {
    expect(() => makeProcessor({ result: '+ + +' })).toThrow();
  });

  it('type coercion errors have warning severity and full context', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'a + b' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onError: (err) => { errors.push(err); return undefined; },
    });

    const row: Row = { a: 'not_a_number', b: 5 };
    proc.process(row);
    expect(errors[0].code).toBe('TYPE_ERROR');
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].column).toBe('result');
    expect(errors[0].formula).toBe('a + b');
    expect(errors[0].referencedColumns).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('unknown function reports FUNCTION_ERROR', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'NOPE(a)' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onError: (err) => { errors.push(err); return undefined; },
    });

    const row: Row = { a: 1 };
    proc.process(row);
    expect(errors[0].code).toBe('FUNCTION_ERROR');
  });

  it('error in runtime without onError silently skips column', () => {
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'a / b' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
    });

    const row: Row = { a: 10, b: 0 };
    proc.process(row);
    expect(row.result).toBeUndefined();
  });
});

// ============================================================
// Custom functions
// ============================================================

describe('custom functions', () => {
  it('registers and calls a custom function', () => {
    const proc = makeProcessor(
      { result: 'DOUBLE(value)' },
      { DOUBLE: (n: unknown) => (n as number) * 2 },
    );
    const row: Row = { value: 21 };
    proc.process(row);
    expect(row.result).toBe(42);
  });

  it('custom function overrides a builtin', () => {
    const proc = makeProcessor(
      { result: 'ABS(value)' },
      { ABS: () => 'custom' },
    );
    const row: Row = { value: -5 };
    proc.process(row);
    expect(row.result).toBe('custom');
  });

  it('custom function names are case-insensitive', () => {
    const proc = makeProcessor(
      { result: 'myFunc(value)' },
      { myfunc: (n: unknown) => (n as number) + 100 },
    );
    const row: Row = { value: 1 };
    proc.process(row);
    expect(row.result).toBe(101);
  });
});

// ============================================================
// Bracket identifiers
// ============================================================

describe('bracket identifiers', () => {
  it('supports column names with spaces', () => {
    const proc = makeProcessor({ result: '[Unit Price] * [Qty Sold]' });
    const row: Row = { 'Unit Price': 25, 'Qty Sold': 4 };
    proc.process(row);
    expect(row.result).toBe(100);
  });
});

// ============================================================
// Type coercion
// ============================================================

describe('type coercion', () => {
  it('coerces string to number for arithmetic', () => {
    const proc = makeProcessor({ result: 'a + b' });
    const row: Row = { a: '10', b: 5 };
    proc.process(row);
    expect(row.result).toBe(15);
  });

  it('null / undefined coerce to 0 in arithmetic', () => {
    const proc = makeProcessor({ result: 'a + b' });
    const row: Row = { a: null, b: 5 };
    proc.process(row);
    expect(row.result).toBe(5);
  });

  it('boolean coerces to number (true = 1)', () => {
    const proc = makeProcessor({ result: 'flag + 1' });
    const row: Row = { flag: true };
    proc.process(row);
    expect(row.result).toBe(2);
  });

  it('empty string coerces to 0', () => {
    const proc = makeProcessor({ result: 'a + 5' });
    const row: Row = { a: '' };
    proc.process(row);
    expect(row.result).toBe(5);
  });
});

// ============================================================
// set callback
// ============================================================

describe('set callback', () => {
  it('receives the correct referenced columns', () => {
    const setCalls: { col: string; value: unknown; refs: string[] }[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'total', formula: 'price * quantity' }],
      get: (row, col) => row[col],
      set: (_row, col, value, refs) => {
        setCalls.push({ col, value, refs });
      },
    });

    proc.process({ price: 10, quantity: 5 });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].col).toBe('total');
    expect(setCalls[0].value).toBe(50);
    expect(setCalls[0].refs).toEqual(expect.arrayContaining(['price', 'quantity']));
    expect(setCalls[0].refs).toHaveLength(2);
  });
});

// ============================================================
// Boolean literals
// ============================================================

describe('boolean literals', () => {
  it('TRUE and FALSE literals', () => {
    const proc = makeProcessor({
      a: 'IF(TRUE, "yes", "no")',
      b: 'IF(FALSE, "yes", "no")',
    });
    const row: Row = {};
    proc.process(row);
    expect(row.a).toBe('yes');
    expect(row.b).toBe('no');
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('edge cases', () => {
  it('deeply nested expressions', () => {
    const proc = makeProcessor({ result: '((((a + b) * c) - d) / e)' });
    const row: Row = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    proc.process(row);
    expect(row.result).toBe(1); // ((1+2)*3 - 4) / 5 = 5/5 = 1
  });

  it('processes multiple rows independently', () => {
    const proc = makeProcessor({ total: 'price * quantity' });

    const row1: Row = { price: 10, quantity: 2 };
    const row2: Row = { price: 50, quantity: 3 };
    proc.process(row1);
    proc.process(row2);

    expect(row1.total).toBe(20);
    expect(row2.total).toBe(150);
  });

  it('handles zero formula columns gracefully', () => {
    const proc = compile<Row>({
      columns: [],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
    });
    const row: Row = { a: 1 };
    proc.process(row);
    expect(row).toEqual({ a: 1 }); // unchanged
  });

  it('formula with only a literal', () => {
    const proc = makeProcessor({ result: '42' });
    const row: Row = {};
    proc.process(row);
    expect(row.result).toBe(42);
  });

  it('formula with only a string literal', () => {
    const proc = makeProcessor({ result: '"hello"' });
    const row: Row = {};
    proc.process(row);
    expect(row.result).toBe('hello');
  });
});

// ============================================================
// Template literals
// ============================================================

describe('template literals', () => {
  it('simple interpolation', () => {
    const proc = makeProcessor({ greeting: '`Hello {name}`' });
    const row: Row = { name: 'Alice' };
    proc.process(row);
    expect(row.greeting).toBe('Hello Alice');
  });

  it('multiple interpolations', () => {
    const proc = makeProcessor({ label: '`{first} {last}`' });
    const row: Row = { first: 'Jane', last: 'Doe' };
    proc.process(row);
    expect(row.label).toBe('Jane Doe');
  });

  it('empty template evaluates to empty string', () => {
    const proc = makeProcessor({ empty: '``' });
    const row: Row = {};
    proc.process(row);
    expect(row.empty).toBe('');
  });

  it('coerces number to string', () => {
    const proc = makeProcessor({ label: '`value: {n}`' });
    const row: Row = { n: 42 };
    proc.process(row);
    expect(row.label).toBe('value: 42');
  });

  it('coerces boolean to TRUE/FALSE', () => {
    const proc = makeProcessor({ label: '`active: {flag}`' });
    const row: Row = { flag: true };
    proc.process(row);
    expect(row.label).toBe('active: TRUE');
  });

  it('coerces null/undefined to empty string', () => {
    const proc = makeProcessor({ label: '`name: {x}`' });
    const row: Row = { x: null };
    proc.process(row);
    expect(row.label).toBe('name: ');
  });

  it('function call inside interpolation', () => {
    const proc = makeProcessor({ result: '`pct: {ROUND(margin * 100, 1)}%`' });
    const row: Row = { margin: 0.1234 };
    proc.process(row);
    expect(row.result).toBe('pct: 12.3%');
  });

  it('IF inside interpolation', () => {
    const proc = makeProcessor({ label: '`status: {IF(x > 0, "pos", "neg")}`' });
    const row: Row = { x: 5 };
    proc.process(row);
    expect(row.label).toBe('status: pos');
  });

  it('bracket column inside interpolation', () => {
    const proc = makeProcessor({ label: '`{[First Name]} {[Last Name]}`' });
    const row: Row = { 'First Name': 'Jane', 'Last Name': 'Doe' };
    proc.process(row);
    expect(row.label).toBe('Jane Doe');
  });

  it('escapes in template text', () => {
    const proc = makeProcessor({ label: '`a\\`b\\{c`' });
    const row: Row = {};
    proc.process(row);
    expect(row.label).toBe('a`b{c');
  });

  it('equivalent to & concatenation', () => {
    const procT = makeProcessor({ r: '`a{x}b`' });
    const procC = makeProcessor({ r: '"a" & x & "b"' });

    for (const x of [42, 'hello', true, 0]) {
      const rowT: Row = { x };
      const rowC: Row = { x };
      procT.process(rowT);
      procC.process(rowC);
      expect(rowT.r).toBe(rowC.r);
    }
  });

  it('tracks referenced columns through templates', () => {
    const refs: string[][] = [];
    const columns = [{ name: 'label', formula: '`Hello {firstName} {lastName}`' }];
    const proc = compile<Row>({
      columns,
      get: (row, col) => row[col],
      set: (_row, _col, _value, referencedColumns) => { refs.push(referencedColumns); },
    });
    proc.process({ firstName: 'A', lastName: 'B' });
    expect(refs[0].sort()).toEqual(['firstName', 'lastName']);
  });
});
