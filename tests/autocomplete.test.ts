import { describe, it, expect } from 'vitest';
import { getSuggestions } from '../src/editor/autocomplete/AutocompleteEngine.js';
import { getCursorContext } from '../src/editor/autocomplete/cursorContext.js';
import { ColumnDef, FunctionDef } from '../src/editor/types.js';

const columns: ColumnDef[] = [
  { name: 'price', description: 'Unit price' },
  { name: 'quantity' },
  { name: 'First Name', label: 'First Name' },
  { name: 'tax_rate' },
];

const functions: FunctionDef[] = [
  { name: 'ROUND', description: 'Round to N decimals', signature: 'ROUND(value, decimals)' },
  { name: 'IF', description: 'Conditional', signature: 'IF(cond, then, else)' },
  { name: 'CONCAT', description: 'Join text' },
];

describe('getSuggestions', () => {
  it('returns all columns and functions for expression-start', () => {
    const ctx = getCursorContext('', 0);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs.length).toBe(columns.length + functions.length);
  });

  it('filters columns and functions by partial', () => {
    const ctx = getCursorContext('pri', 3);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs.some(s => s.name === 'price')).toBe(true);
    expect(suggs.some(s => s.name === 'quantity')).toBe(false);
  });

  it('matches functions by prefix', () => {
    const ctx = getCursorContext('RO', 2);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs.some(s => s.name === 'ROUND')).toBe(true);
    expect(suggs.some(s => s.name === 'IF')).toBe(false);
  });

  it('case-insensitive matching', () => {
    const ctx = getCursorContext('round', 5);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs.some(s => s.name === 'ROUND')).toBe(true);
  });

  it('wraps column names with spaces in brackets', () => {
    const ctx = getCursorContext('Fir', 3);
    const suggs = getSuggestions(ctx, columns, functions);
    const firstName = suggs.find(s => s.name === 'First Name');
    expect(firstName).toBeDefined();
    expect(firstName!.insertText).toBe('[First Name]');
  });

  it('function suggestions insertText is the bare name (parens handled by editor)', () => {
    const ctx = getCursorContext('ROUND', 5);
    const suggs = getSuggestions(ctx, columns, functions);
    const round = suggs.find(s => s.name === 'ROUND');
    expect(round).toBeDefined();
    expect(round!.insertText).toBe('ROUND');
  });

  it('bracket-column context only suggests columns', () => {
    const ctx = getCursorContext('[pri', 4);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs.every(s => s.type === 'column')).toBe(true);
    expect(suggs.some(s => s.name === 'price')).toBe(true);
  });

  it('bracket-column insertText includes closing bracket', () => {
    const ctx = getCursorContext('[pri', 4);
    const suggs = getSuggestions(ctx, columns, functions);
    const price = suggs.find(s => s.name === 'price');
    expect(price!.insertText).toBe('price]');
  });

  it('function-arg context shows all columns and functions', () => {
    const ctx = getCursorContext('ROUND(', 6);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs.length).toBe(columns.length + functions.length);
  });

  it('returns empty for none context', () => {
    const ctx = getCursorContext('123', 2);
    const suggs = getSuggestions(ctx, columns, functions);
    expect(suggs).toEqual([]);
  });

  it('includes description from column/function defs', () => {
    const ctx = getCursorContext('', 0);
    const suggs = getSuggestions(ctx, columns, functions);
    const price = suggs.find(s => s.name === 'price');
    expect(price!.description).toBe('Unit price');
    const round = suggs.find(s => s.name === 'ROUND');
    expect(round!.description).toBe('Round to N decimals');
  });

  it('columns appear before functions in expression-start', () => {
    const ctx = getCursorContext('', 0);
    const suggs = getSuggestions(ctx, columns, functions);
    const firstFunction = suggs.findIndex(s => s.type === 'function');
    const lastColumn = suggs.length - 1 - [...suggs].reverse().findIndex(s => s.type === 'column');
    expect(lastColumn).toBeLessThan(firstFunction);
  });
});
