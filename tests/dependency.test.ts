import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import {
  extractColumnRefs,
  getReferencedColumns,
} from '../src/dependency.js';

describe('extractColumnRefs', () => {
  it('returns an empty array for a literal-only formula', () => {
    expect(extractColumnRefs(parse('1 + 2'))).toEqual([]);
  });

  it('returns the single referenced column', () => {
    expect(extractColumnRefs(parse('price'))).toEqual(['price']);
  });

  it('returns all referenced columns', () => {
    const refs = extractColumnRefs(parse('price * quantity + tax'));
    expect(refs.sort()).toEqual(['price', 'quantity', 'tax']);
  });

  it('dedupes repeated references', () => {
    expect(extractColumnRefs(parse('price + price * 2'))).toEqual(['price']);
  });

  it('finds refs inside function calls', () => {
    const refs = extractColumnRefs(parse('ROUND(price * (1 + taxRate), 2)'));
    expect(refs.sort()).toEqual(['price', 'taxRate']);
  });

  it('finds refs inside template literal interpolations', () => {
    const refs = extractColumnRefs(parse('`hello {firstName} {lastName}`'));
    expect(refs.sort()).toEqual(['firstName', 'lastName']);
  });

  it('handles bracket-identifier column refs', () => {
    expect(extractColumnRefs(parse('[First Name]'))).toEqual(['First Name']);
  });

  it('finds refs inside unary expressions', () => {
    expect(extractColumnRefs(parse('-price'))).toEqual(['price']);
  });
});

describe('getReferencedColumns (string convenience)', () => {
  it('returns deps for a valid formula', () => {
    expect(getReferencedColumns('price * quantity').sort()).toEqual(['price', 'quantity']);
  });

  it('returns an empty array for a literal-only formula', () => {
    expect(getReferencedColumns('1 + 2')).toEqual([]);
  });

  it('throws on a parse error', () => {
    expect(() => getReferencedColumns('+ + +')).toThrow();
  });
});
