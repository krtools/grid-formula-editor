import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { FormulaParseError } from '../src/types.js';

describe('parse — structured errors', () => {
  it('throws FormulaParseError on unexpected token', () => {
    expect(() => parse('+ +')).toThrow(FormulaParseError);
  });

  it('error has start and end positions', () => {
    try {
      parse('a + @');
    } catch (e) {
      // The tokenizer throws FormulaParseError for '@'
      expect(e).toBeInstanceOf(FormulaParseError);
      expect((e as FormulaParseError).start).toBe(4);
      expect((e as FormulaParseError).end).toBe(5);
    }
  });

  it('unexpected trailing token error has position', () => {
    try {
      parse('a b');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaParseError);
      const pe = e as FormulaParseError;
      expect(pe.start).toBe(2); // 'b' starts at position 2
      expect(pe.end).toBe(3);
    }
  });

  it('missing closing paren error has position', () => {
    try {
      parse('ROUND(x, 2');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaParseError);
      // Error at EOF token position (expected RPAREN but got EOF)
      const pe = e as FormulaParseError;
      expect(pe.start).toBe(10);
    }
  });

  it('error message includes position info', () => {
    try {
      parse(')');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaParseError);
      expect((e as FormulaParseError).message).toContain('position');
    }
  });
});

describe('parse — AST correctness (sanity)', () => {
  it('parses simple arithmetic', () => {
    const ast = parse('a + b');
    expect(ast.type).toBe('binary');
    if (ast.type === 'binary') {
      expect(ast.operator).toBe('+');
      expect(ast.left).toMatchObject({ type: 'column', name: 'a' });
      expect(ast.right).toMatchObject({ type: 'column', name: 'b' });
    }
  });

  it('parses function call', () => {
    const ast = parse('ROUND(x, 2)');
    expect(ast.type).toBe('function');
    if (ast.type === 'function') {
      expect(ast.name).toBe('ROUND');
      expect(ast.args).toHaveLength(2);
    }
  });

  it('parses bracket identifier', () => {
    const ast = parse('[First Name]');
    expect(ast).toMatchObject({ type: 'column', name: 'First Name' });
  });
});
