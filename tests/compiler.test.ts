import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import type { FormulaError } from '../src/types.js';

type Row = Record<string, unknown>;

function makeProcessor(
  formulas: Record<string, string>,
  customFunctions?: Record<string, (ctx: { row: Row; column: string }, ...args: unknown[]) => unknown>,
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
// BAIL
// ============================================================

describe('BAIL', () => {
  it('bails to null at top level', () => {
    const proc = makeProcessor({ result: 'BAIL()' });
    const row: Row = {};
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('bails from inside IF', () => {
    const proc = makeProcessor({ result: 'IF(flag, BAIL(), 42)' });
    const row: Row = { flag: true };
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('IFERROR does not catch BAIL', () => {
    const proc = makeProcessor({ result: 'IFERROR(BAIL(), 99)' });
    const row: Row = {};
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('IFERROR does not mask a bail when a real error follows in the same expression', () => {
    // BAIL() sets the flag, 1/0 throws — IFERROR must not return the fallback.
    const proc = makeProcessor({ result: 'IFERROR(BAIL() + a / b, 99)' });
    const row: Row = { a: 1, b: 0 };
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('BAIL in one column does not affect another', () => {
    const proc = makeProcessor({
      a: 'BAIL()',
      b: 'x * 2',
    });
    const row: Row = { x: 5 };
    proc.process(row);
    expect(row.a).toBeNull();
    expect(row.b).toBe(10);
  });

  it('does not route through onError', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'r', formula: 'BAIL()' }],
      get: (row, col) => row[col],
      set: (row, col, value) => { row[col] = value; },
      onError: (e) => { errors.push(e); },
    });
    const row: Row = {};
    proc.process(row);
    expect(row.r).toBeNull();
    expect(errors).toHaveLength(0);
  });
});

// ============================================================
// REQUIRE
// ============================================================

describe('REQUIRE', () => {
  it('returns the value when present', () => {
    const proc = makeProcessor({ result: 'REQUIRE(name)' });
    const row: Row = { name: 'Alice' };
    proc.process(row);
    expect(row.result).toBe('Alice');
  });

  it('bails when value is null', () => {
    const proc = makeProcessor({ result: 'REQUIRE(name)' });
    const row: Row = { name: null };
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('bails when value is undefined', () => {
    const proc = makeProcessor({ result: 'REQUIRE(name)' });
    const row: Row = { name: undefined };
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('bails when value is empty string', () => {
    const proc = makeProcessor({ result: 'REQUIRE(name)' });
    const row: Row = { name: '' };
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('passes through zero and false (not blank)', () => {
    const proc = makeProcessor({
      z: 'REQUIRE(num)',
      f: 'REQUIRE(flag)',
    });
    const row: Row = { num: 0, flag: false };
    proc.process(row);
    expect(row.z).toBe(0);
    expect(row.f).toBe(false);
  });

  it('bails an entire template literal when one ref is blank', () => {
    const proc = makeProcessor({
      url: '`https://example.com/users/{REQUIRE(userId)}/posts/{REQUIRE(postId)}`',
    });
    const row: Row = { userId: 'u1', postId: '' };
    proc.process(row);
    expect(row.url).toBeNull();
  });

  it('template renders fully when all required refs are present', () => {
    const proc = makeProcessor({
      url: '`https://example.com/users/{REQUIRE(userId)}/posts/{REQUIRE(postId)}`',
    });
    const row: Row = { userId: 'u1', postId: 'p42' };
    proc.process(row);
    expect(row.url).toBe('https://example.com/users/u1/posts/p42');
  });

  it('IFERROR does not catch a REQUIRE bail', () => {
    const proc = makeProcessor({ result: 'IFERROR(REQUIRE(name), "fallback")' });
    const row: Row = { name: '' };
    proc.process(row);
    expect(row.result).toBeNull();
  });
});

// ============================================================
// requireTemplateVars compile option
// ============================================================

describe('requireTemplateVars option', () => {
  function makeStrictProcessor(formulas: Record<string, string>) {
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
      requireTemplateVars: true,
    });
  }

  it('default (option off) leaves blank interpolations as empty string', () => {
    const proc = makeProcessor({ greeting: '`Hello {name}!`' });
    const row: Row = { name: null };
    proc.process(row);
    expect(row.greeting).toBe('Hello !');
  });

  it('bails the formula when any interp is blank', () => {
    const proc = makeStrictProcessor({ url: '`users/{userId}/posts/{postId}`' });
    const row: Row = { userId: 'u1', postId: '' };
    proc.process(row);
    expect(row.url).toBeNull();
  });

  it('renders fully when all interps are present', () => {
    const proc = makeStrictProcessor({ url: '`users/{userId}/posts/{postId}`' });
    const row: Row = { userId: 'u1', postId: 'p42' };
    proc.process(row);
    expect(row.url).toBe('users/u1/posts/p42');
  });

  it('OPTIONAL at the interp top level opts out of bail', () => {
    const proc = makeStrictProcessor({ line: '`{firstName} {OPTIONAL(middleName)} {lastName}`' });
    const row: Row = { firstName: 'Ada', middleName: null, lastName: 'Lovelace' };
    proc.process(row);
    expect(row.line).toBe('Ada  Lovelace');
  });

  it('explicit REQUIRE in an interp behaves the same as the auto-wrap', () => {
    const proc = makeStrictProcessor({ url: '`users/{REQUIRE(userId)}`' });
    const rowBlank: Row = { userId: '' };
    proc.process(rowBlank);
    expect(rowBlank.url).toBeNull();

    const rowOk: Row = { userId: 'u1' };
    proc.process(rowOk);
    expect(rowOk.url).toBe('users/u1');
  });

  it('IFERROR cannot catch the implicit require bail', () => {
    const proc = makeStrictProcessor({ url: '`users/{IFERROR(userId, "anon")}`' });
    // IFERROR evaluates userId successfully (no throw) so it returns "".
    // The auto-wrap then sees "" and bails — require-by-default is
    // uncatchable just like explicit REQUIRE.
    const row: Row = { userId: '' };
    proc.process(row);
    expect(row.url).toBeNull();
  });

  it('wraps interps in nested templates', () => {
    const proc = makeStrictProcessor({ wrap: '`outer {`inner {x}`}`' });
    const rowBlank: Row = { x: '' };
    proc.process(rowBlank);
    expect(rowBlank.wrap).toBeNull();

    const rowOk: Row = { x: 'v' };
    proc.process(rowOk);
    expect(rowOk.wrap).toBe('outer inner v');
  });

  it('BAIL() at the top of an interp is left alone', () => {
    const proc = makeStrictProcessor({ msg: '`before {BAIL()} after`' });
    const row: Row = {};
    proc.process(row);
    expect(row.msg).toBeNull();
  });

  it('non-template formulas are unaffected', () => {
    const proc = makeStrictProcessor({ total: 'price * quantity' });
    const row: Row = { price: 4, quantity: 5 };
    proc.process(row);
    expect(row.total).toBe(20);
  });

  it('dependency tracking still picks up refs wrapped in auto-REQUIRE', () => {
    // taxed depends on price; auto-wrapping shouldn't drop that edge, so
    // taxed's evaluation must see the already-computed `price`.
    const proc = makeStrictProcessor({
      price: 'price * 1.1',
      taxed: '`price is {price}`',
    });
    const row: Row = { price: 10 };
    proc.process(row);
    expect(row.taxed).toBe('price is 11');
  });
});

// ============================================================
// OPTIONAL
// ============================================================

describe('OPTIONAL', () => {
  it('returns its argument unchanged when present', () => {
    const proc = makeProcessor({ result: 'OPTIONAL(name)' });
    const row: Row = { name: 'Ada' };
    proc.process(row);
    expect(row.result).toBe('Ada');
  });

  it('passes blank values through as-is (no bail, no coercion)', () => {
    const proc = makeProcessor({ result: 'OPTIONAL(name)' });
    const row: Row = { name: null };
    proc.process(row);
    expect(row.result).toBeNull();
  });

  it('in a template interp, blanks render as empty string (template toString handles it)', () => {
    const proc = makeProcessor({ greeting: '`Hi {OPTIONAL(name)}!`' });
    const row: Row = { name: null };
    proc.process(row);
    expect(row.greeting).toBe('Hi !');
  });
});

// ============================================================
// SELF and self-references
// ============================================================

describe('SELF and self-references', () => {
  it('bare self-ref transforms the raw input', () => {
    const proc = makeProcessor({ price: 'price * 1.1' });
    const row: Row = { price: 10 };
    proc.process(row);
    expect(row.price).toBeCloseTo(11);
  });

  it('SELF() is equivalent to a bare self-ref', () => {
    const proc = makeProcessor({ price: 'SELF() * 1.1' });
    const row: Row = { price: 10 };
    proc.process(row);
    expect(row.price).toBeCloseTo(11);
  });

  it('SELF() returns undefined when no raw input exists', () => {
    const proc = makeProcessor({ derived: 'SELF()' });
    const row: Row = {};
    proc.process(row);
    expect(row.derived).toBeUndefined();
  });

  it('SELF() composes with REQUIRE', () => {
    const proc = makeProcessor({ price: 'REQUIRE(SELF()) * 1.1' });
    const row: Row = {};
    proc.process(row);
    expect(row.price).toBeNull();
  });

  it('mutual cycles are still rejected', () => {
    const errors: FormulaError[] = [];
    compile<Row>({
      columns: [
        { name: 'a', formula: 'b + 1' },
        { name: 'b', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, value) => { row[col] = value; },
      onError: (e) => { errors.push(e); },
    });
    expect(errors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });

  it('self-ref does NOT trigger cycle detection', () => {
    const errors: FormulaError[] = [];
    compile<Row>({
      columns: [{ name: 'price', formula: 'price + 1' }],
      get: (row, col) => row[col],
      set: (row, col, value) => { row[col] = value; },
      onError: (e) => { errors.push(e); },
    });
    expect(errors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(false);
  });

  it('other-column refs still see post-formula computed values', () => {
    const proc = makeProcessor({
      price: 'price * 1.1',
      total: 'price * qty',
    });
    const row: Row = { price: 10, qty: 3 };
    proc.process(row);
    expect(row.price).toBeCloseTo(11);
    expect(row.total).toBeCloseTo(33);
  });

  it('works inside a template interpolation', () => {
    const proc = makeProcessor({
      url: '`https://x/{REQUIRE(SELF())}`',
    });
    const rowA: Row = { url: 'abc' };
    proc.process(rowA);
    expect(rowA.url).toBe('https://x/abc');

    const rowB: Row = { url: '' };
    proc.process(rowB);
    expect(rowB.url).toBeNull();
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
// Phase-specific callbacks: onCompileError / onRuntimeError
// ============================================================

describe('onCompileError / onRuntimeError split', () => {
  it('onCompileError fires for parse error; onRuntimeError does not', () => {
    const compileErrors: FormulaError[] = [];
    const runtimeErrors: FormulaError[] = [];
    compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onCompileError: (e) => { compileErrors.push(e); },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
    });
    expect(compileErrors).toHaveLength(1);
    expect(compileErrors[0].code).toBe('PARSE_ERROR');
    expect(runtimeErrors).toHaveLength(0);
  });

  it('onCompileError fires for circular reference; onRuntimeError does not', () => {
    const compileErrors: FormulaError[] = [];
    const runtimeErrors: FormulaError[] = [];
    compile<Row>({
      columns: [
        { name: 'a', formula: 'b + 1' },
        { name: 'b', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onCompileError: (e) => { compileErrors.push(e); },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
    });
    expect(compileErrors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
    expect(runtimeErrors).toHaveLength(0);
  });

  it('onRuntimeError fires for runtime errors; onCompileError does not', () => {
    const compileErrors: FormulaError[] = [];
    const runtimeErrors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'a / b' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onCompileError: (e) => { compileErrors.push(e); },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
    });
    proc.process({ a: 10, b: 0 });
    expect(compileErrors).toHaveLength(0);
    expect(runtimeErrors).toHaveLength(1);
    expect(runtimeErrors[0].code).toBe('EVAL_ERROR');
  });

  it('legacy onError still fires for both phases when alone', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'result', formula: 'a / b' },
        { name: 'broken', formula: '+ + +' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onError: (e) => { errors.push(e); return undefined; },
    });
    expect(errors.some(e => e.code === 'PARSE_ERROR')).toBe(true);
    proc.process({ a: 10, b: 0 });
    expect(errors.some(e => e.code === 'EVAL_ERROR')).toBe(true);
  });

  it('onCompileError takes precedence over onError for compile phase', () => {
    const compileErrors: FormulaError[] = [];
    const generalErrors: FormulaError[] = [];
    compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onCompileError: (e) => { compileErrors.push(e); },
      onError: (e) => { generalErrors.push(e); return undefined; },
    });
    expect(compileErrors).toHaveLength(1);
    expect(generalErrors).toHaveLength(0);
  });

  it('onRuntimeError takes precedence over onError for runtime phase', () => {
    const runtimeErrors: FormulaError[] = [];
    const generalErrors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: 'a / b' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
      onError: (e) => { generalErrors.push(e); return undefined; },
    });
    proc.process({ a: 10, b: 0 });
    expect(runtimeErrors).toHaveLength(1);
    expect(generalErrors).toHaveLength(0);
  });

  it('onError is the fallback when only onRuntimeError is set: compile errors hit onError', () => {
    const runtimeErrors: FormulaError[] = [];
    const generalErrors: FormulaError[] = [];
    compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
      onError: (e) => { generalErrors.push(e); return undefined; },
    });
    expect(generalErrors.some(e => e.code === 'PARSE_ERROR')).toBe(true);
    expect(runtimeErrors).toHaveLength(0);
  });
});

// ============================================================
// compileErrors exposure on the processor
// ============================================================

describe('compileErrors exposure', () => {
  it('is empty after a clean compile', () => {
    const proc = makeProcessor({ result: 'a + b' });
    expect(proc.compileErrors).toEqual([]);
  });

  it('contains a PARSE_ERROR entry after a parse error in tolerant mode', () => {
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      tolerateCompileErrors: true,
    });
    expect(proc.compileErrors).toHaveLength(1);
    expect(proc.compileErrors[0].code).toBe('PARSE_ERROR');
    expect(proc.compileErrors[0].column).toBe('result');
  });

  it('contains a CIRCULAR_REFERENCE entry after a cycle in tolerant mode', () => {
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'b + 1' },
        { name: 'b', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      tolerateCompileErrors: true,
    });
    expect(proc.compileErrors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });

  it('also populated in non-tolerant mode when a handler is supplied', () => {
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onCompileError: () => {},
    });
    expect(proc.compileErrors).toHaveLength(1);
    expect(proc.compileErrors[0].code).toBe('PARSE_ERROR');
  });
});

// ============================================================
// tolerateCompileErrors: per-row replay
// ============================================================

describe('tolerateCompileErrors', () => {
  it('does not throw on parse error with no handler', () => {
    expect(() =>
      compile<Row>({
        columns: [{ name: 'result', formula: '+ + +' }],
        get: (row, col) => row[col],
        set: (row, col, val) => { row[col] = val; },
        tolerateCompileErrors: true,
      }),
    ).not.toThrow();
  });

  it('does not throw on circular reference with no handler', () => {
    expect(() =>
      compile<Row>({
        columns: [
          { name: 'a', formula: 'b + 1' },
          { name: 'b', formula: 'a + 1' },
        ],
        get: (row, col) => row[col],
        set: (row, col, val) => { row[col] = val; },
        tolerateCompileErrors: true,
      }),
    ).not.toThrow();
  });

  it('replays parse error per row via onRuntimeError', () => {
    const runtimeErrors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
      tolerateCompileErrors: true,
    });
    proc.process({});
    proc.process({});
    expect(runtimeErrors).toHaveLength(2);
    expect(runtimeErrors[0].code).toBe('PARSE_ERROR');
    expect(runtimeErrors[0].severity).toBe('error');
    expect(runtimeErrors[0].column).toBe('result');
  });

  it('replays circular reference per row via onRuntimeError', () => {
    const runtimeErrors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'b + 1' },
        { name: 'b', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { runtimeErrors.push(e); return undefined; },
      tolerateCompileErrors: true,
    });
    proc.process({});
    expect(runtimeErrors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
    expect(runtimeErrors.find(e => e.code === 'CIRCULAR_REFERENCE')!.severity).toBe('error');
  });

  it('non-tolerant mode still throws on parse error without handler', () => {
    expect(() =>
      compile<Row>({
        columns: [{ name: 'result', formula: '+ + +' }],
        get: (row, col) => row[col],
        set: (row, col, val) => { row[col] = val; },
      }),
    ).toThrow();
  });

  it('non-tolerant mode still throws on circular reference without handler', () => {
    expect(() =>
      compile<Row>({
        columns: [
          { name: 'a', formula: 'b + 1' },
          { name: 'b', formula: 'a + 1' },
        ],
        get: (row, col) => row[col],
        set: (row, col, val) => { row[col] = val; },
      }),
    ).toThrow(/Circular reference/);
  });

  it('tolerant mode + fallback: replay handler returns a value, column gets it', () => {
    const proc = compile<Row>({
      columns: [{ name: 'result', formula: '+ + +' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: () => 'oops',
      tolerateCompileErrors: true,
    });
    const row: Row = {};
    proc.process(row);
    expect(row.result).toBe('oops');
  });
});

// ============================================================
// Cascade-on-error vs bail-no-cascade
// ============================================================

describe('cascade-on-error', () => {
  it('runtime error in A cascades DEPENDENCY_ERROR to dependent C', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'x / y' },
        { name: 'c', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { errors.push(e); return undefined; },
    });
    proc.process({ x: 10, y: 0 });
    expect(errors.map(e => e.code)).toEqual(['EVAL_ERROR', 'DEPENDENCY_ERROR']);
    expect(errors[1].column).toBe('c');
    expect(errors[1].cause).toBeDefined();
    expect((errors[1].cause as FormulaError).code).toBe('EVAL_ERROR');
  });

  it('fallback on A means C does NOT cascade — C reads the fallback', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'x / y' },
        { name: 'c', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => {
        errors.push(e);
        return e.column === 'a' ? 0 : undefined;
      },
    });
    const row: Row = { x: 10, y: 0 };
    proc.process(row);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('EVAL_ERROR');
    expect(row.a).toBe(0);
    expect(row.c).toBe(1);
  });

  it('BAIL() in A does NOT cascade — C reads null', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'BAIL()' },
        { name: 'c', formula: 'COALESCE(a, 99)' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { errors.push(e); return undefined; },
    });
    const row: Row = {};
    proc.process(row);
    expect(errors).toHaveLength(0);
    expect(row.a).toBeNull();
    expect(row.c).toBe(99);
  });

  it('REQUIRE on blank does NOT cascade — bails through as null', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'REQUIRE(x)' },
        { name: 'c', formula: 'COALESCE(a, 99)' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { errors.push(e); return undefined; },
    });
    const row: Row = { x: null };
    proc.process(row);
    expect(errors).toHaveLength(0);
    expect(row.a).toBeNull();
    expect(row.c).toBe(99);
  });

  it('diamond: A errors, B and C depend on A, D depends on B and C — all cascade', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'x / y' },
        { name: 'b', formula: 'a + 1' },
        { name: 'c', formula: 'a * 2' },
        { name: 'd', formula: 'b + c' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { errors.push(e); return undefined; },
    });
    proc.process({ x: 10, y: 0 });
    const byCol = Object.fromEntries(errors.map(e => [e.column, e.code]));
    expect(byCol.a).toBe('EVAL_ERROR');
    expect(byCol.b).toBe('DEPENDENCY_ERROR');
    expect(byCol.c).toBe('DEPENDENCY_ERROR');
    expect(byCol.d).toBe('DEPENDENCY_ERROR');
  });

  it('tolerant compile error on A also cascades to dependents', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: '+ + +' },
        { name: 'c', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { errors.push(e); return undefined; },
      tolerateCompileErrors: true,
    });
    proc.process({});
    const byCol = Object.fromEntries(errors.map(e => [e.column, e.code]));
    expect(byCol.a).toBe('PARSE_ERROR');
    expect(byCol.c).toBe('DEPENDENCY_ERROR');
  });

  it('errored column without a runtime handler still cascades', () => {
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [
        { name: 'a', formula: 'x / y' },
        { name: 'c', formula: 'a + 1' },
      ],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      // No onRuntimeError on `a`'s error to simulate the silent-skip case;
      // we only watch `c`.
      onError: (e) => { if (e.column === 'c') errors.push(e); return undefined; },
    });
    proc.process({ x: 10, y: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('DEPENDENCY_ERROR');
  });

  it('self-reference does NOT cascade when self errored — self-refs read raw input', () => {
    // A formula `price + 1` reading its own `price` reads the raw input,
    // not the computed value, so even a hypothetical self-error wouldn't
    // poison itself. Verifying the self-ref carve-out in getColumn.
    const errors: FormulaError[] = [];
    const proc = compile<Row>({
      columns: [{ name: 'price', formula: 'price + 1' }],
      get: (row, col) => row[col],
      set: (row, col, val) => { row[col] = val; },
      onRuntimeError: (e) => { errors.push(e); return undefined; },
    });
    proc.process({ price: 10 });
    expect(errors).toHaveLength(0);
  });
});

// ============================================================
// Custom functions
// ============================================================

describe('custom functions', () => {
  it('registers and calls a custom function', () => {
    const proc = makeProcessor(
      { result: 'DOUBLE(value)' },
      { DOUBLE: (_ctx, n: unknown) => (n as number) * 2 },
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
      { myfunc: (_ctx, n: unknown) => (n as number) + 100 },
    );
    const row: Row = { value: 1 };
    proc.process(row);
    expect(row.result).toBe(101);
  });

  it('passes a FunctionContext with the row and current column', () => {
    let captured: { row: Row; column: string } | null = null;
    const proc = makeProcessor(
      { label: 'TAG(value)' },
      {
        TAG: (ctx, v: unknown) => {
          captured = { row: ctx.row, column: ctx.column };
          return v;
        },
      },
    );
    const row: Row = { value: 'x' };
    proc.process(row);
    expect(captured).not.toBeNull();
    expect(captured!.column).toBe('label');
    expect(captured!.row).toBe(row);
  });

  it('context.row reflects formula-column outputs as they complete', () => {
    const proc = makeProcessor(
      {
        doubled: 'value * 2',
        readDoubled: 'READ(doubled)',
      },
      { READ: (ctx) => (ctx.row as Row).doubled },
    );
    const row: Row = { value: 5 };
    proc.process(row);
    expect(row.readDoubled).toBe(10);
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
