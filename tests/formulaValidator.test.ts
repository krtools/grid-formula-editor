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
});
