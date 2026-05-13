import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import {
  extractColumnRefs,
  getReferencedColumns,
  renameReferencedColumns,
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

describe('renameReferencedColumns', () => {
  it('renames a bare identifier', () => {
    expect(renameReferencedColumns('price * 2', { price: 'cost' }))
      .toBe('cost * 2');
  });

  it('renames inside a function call', () => {
    expect(renameReferencedColumns('ROUND(price * (1 + taxRate), 2)', {
      price: 'cost',
      taxRate: 'rate',
    })).toBe('ROUND(cost * (1 + rate), 2)');
  });

  it('renames inside a template interpolation', () => {
    expect(renameReferencedColumns('`hello {firstName} {lastName}`', {
      firstName: 'fname',
      lastName: 'lname',
    })).toBe('`hello {fname} {lname}`');
  });

  it('renames a bracket identifier', () => {
    expect(renameReferencedColumns('[First Name] & " " & [Last Name]', {
      'First Name': 'firstName',
      'Last Name': 'lastName',
    })).toBe('firstName & " " & lastName');
  });

  it('emits bracket form when new name needs it (whitespace)', () => {
    expect(renameReferencedColumns('price', { price: 'Unit Price' }))
      .toBe('[Unit Price]');
  });

  it('emits bracket form when new name starts with a digit', () => {
    expect(renameReferencedColumns('x', { x: '1st' })).toBe('[1st]');
  });

  it('emits bracket form when new name is TRUE/FALSE', () => {
    expect(renameReferencedColumns('flag', { flag: 'TRUE' })).toBe('[TRUE]');
    expect(renameReferencedColumns('flag', { flag: 'false' })).toBe('[false]');
  });

  it('does not rename function names', () => {
    expect(renameReferencedColumns('ROUND(price, 2)', { ROUND: 'BAD' }))
      .toBe('ROUND(price, 2)');
  });

  it('preserves whitespace and formatting verbatim', () => {
    expect(renameReferencedColumns('price   +   quantity', { price: 'cost' }))
      .toBe('cost   +   quantity');
  });

  it('does NOT chain renames — single pass over original AST', () => {
    expect(renameReferencedColumns('a + b', { a: 'b', b: 'c' }))
      .toBe('b + c');
  });

  it('returns input unchanged when mapping is empty', () => {
    expect(renameReferencedColumns('a + b', {})).toBe('a + b');
  });

  it('returns input unchanged when no refs match the mapping', () => {
    expect(renameReferencedColumns('a + b', { c: 'd' })).toBe('a + b');
  });

  it('treats a self-rename (old === new) as a no-op', () => {
    expect(renameReferencedColumns('price', { price: 'price' })).toBe('price');
  });

  it('deduplicates rewrites of the same column referenced multiple times', () => {
    expect(renameReferencedColumns('price + price * price', { price: 'cost' }))
      .toBe('cost + cost * cost');
  });

  it('handles a mix of bracket and bare forms of the same name', () => {
    // Same column referenced both ways — both get renamed to the new bare form.
    expect(renameReferencedColumns('price + [price]', { price: 'cost' }))
      .toBe('cost + cost');
  });

  it('throws on a parse error', () => {
    expect(() => renameReferencedColumns('+ + +', { x: 'y' })).toThrow();
  });

  it('throws when a target name is empty', () => {
    expect(() => renameReferencedColumns('price', { price: '' }))
      .toThrow(/empty/);
  });

  it("throws when a target name contains ']'", () => {
    expect(() => renameReferencedColumns('price', { price: 'a]b' }))
      .toThrow(/\]/);
  });
});
