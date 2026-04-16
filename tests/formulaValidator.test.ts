import { describe, it, expect } from 'vitest';
import { tokenizeSafe } from '../src/tokenizer';
import { parse } from '../src/parser';
import { FormulaParseError } from '../src/types';
import { validateFormula } from '../src/editor/validation/formulaValidator';
import { BUILTIN_FUNCTIONS } from '../src/editor/constants';

const KNOWN = new Set(BUILTIN_FUNCTIONS.map(f => f.name.toUpperCase()));

function getParseError(formula: string): FormulaParseError | null {
  try {
    parse(formula);
    return null;
  } catch (e) {
    if (e instanceof FormulaParseError) return e;
    throw e;
  }
}

describe('validateFormula', () => {
  it('returns empty array for valid formula', () => {
    const formula = 'ROUND(price * quantity, 2)';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors).toEqual([]);
  });

  it('includes parse error when present', () => {
    const formula = 'price *';
    const { tokens } = tokenizeSafe(formula);
    const parseError = getParseError(formula);
    expect(parseError).not.toBeNull();
    const errors = validateFormula(tokens, parseError, KNOWN);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some(e => e.type === 'parse')).toBe(true);
  });

  it('detects unknown function', () => {
    const formula = 'FOO(x)';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors).toEqual([
      {
        message: 'Unknown function: FOO',
        start: 0,
        end: 3,
        type: 'unknown-function',
      },
    ]);
  });

  it('known functions are not flagged (case-insensitive)', () => {
    const formula = 'round(x, 2)';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors).toEqual([]);
  });

  it('detects multiple unknown functions', () => {
    const formula = 'FOO(BAR(x))';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors.filter(e => e.type === 'unknown-function')).toHaveLength(2);
    expect(errors[0].message).toBe('Unknown function: FOO');
    expect(errors[1].message).toBe('Unknown function: BAR');
  });

  it('does not flag identifiers that are not followed by LPAREN', () => {
    const formula = 'price + quantity';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors).toEqual([]);
  });

  it('returns both parse error and unknown function error', () => {
    const formula = 'FOO(x) +';
    const { tokens } = tokenizeSafe(formula);
    const parseError = getParseError(formula);
    const errors = validateFormula(tokens, parseError, KNOWN);
    expect(errors.some(e => e.type === 'parse')).toBe(true);
    expect(errors.some(e => e.type === 'unknown-function')).toBe(true);
  });

  it('works with user-defined function set', () => {
    const custom = new Set(['MYFUNC']);
    const formula = 'MYFUNC(x)';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, custom);
    expect(errors).toEqual([]);
  });

  it('detects unknown column reference', () => {
    const cols = new Set(['price', 'quantity']);
    const formula = 'price + foo';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors).toEqual([
      { message: 'Unknown column: foo', start: 8, end: 11, type: 'unknown-column' },
    ]);
  });

  it('detects unknown bracket column reference', () => {
    const cols = new Set(['price', 'First Name']);
    const formula = '[Last Name] + price';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors).toEqual([
      { message: 'Unknown column: Last Name', start: 0, end: 11, type: 'unknown-column' },
    ]);
  });

  it('does not flag known columns', () => {
    const cols = new Set(['price', 'quantity']);
    const formula = 'price * quantity';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors).toEqual([]);
  });

  it('skips column validation when knownColumns is undefined', () => {
    const formula = 'anyColumn + anotherColumn';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors).toEqual([]);
  });

  it('column names are case-sensitive', () => {
    const cols = new Set(['Price']);
    const formula = 'price + Price';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Unknown column: price');
  });

  it('does not flag template static text', () => {
    const cols = new Set(['name']);
    const formula = '`Hello world`';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors).toEqual([]);
  });

  it('detects unknown column inside template interpolation', () => {
    const cols = new Set(['price']);
    const formula = '`value: {pricez}`';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors.some(e => e.type === 'unknown-column' && e.message === 'Unknown column: pricez')).toBe(true);
  });

  it('detects unknown function inside template interpolation', () => {
    const formula = '`{FOO(x)}`';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN);
    expect(errors.some(e => e.type === 'unknown-function' && e.message === 'Unknown function: FOO')).toBe(true);
  });

  it('accepts valid template with known refs', () => {
    const cols = new Set(['firstName', 'lastName']);
    const formula = '`{firstName} {lastName}`';
    const { tokens } = tokenizeSafe(formula);
    const errors = validateFormula(tokens, null, KNOWN, cols);
    expect(errors).toEqual([]);
  });
});
