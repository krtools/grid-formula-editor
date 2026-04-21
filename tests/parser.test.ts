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

describe('parse — template literals', () => {
  it('empty template collapses to empty StringLiteral', () => {
    const ast = parse('``');
    expect(ast).toMatchObject({ type: 'string', value: '' });
  });

  it('pure text template collapses to StringLiteral', () => {
    const ast = parse('`hello world`');
    expect(ast).toMatchObject({ type: 'string', value: 'hello world' });
  });

  it('template with single interpolation', () => {
    const ast = parse('`Hello {name}`');
    expect(ast).toMatchObject({
      type: 'template',
      parts: ['Hello ', ''],
      expressions: [{ type: 'column', name: 'name' }],
    });
  });

  it('template with multiple interpolations and text', () => {
    const ast = parse('`{a}-{b}!`');
    expect(ast).toMatchObject({
      type: 'template',
      parts: ['', '-', '!'],
      expressions: [
        { type: 'column', name: 'a' },
        { type: 'column', name: 'b' },
      ],
    });
  });

  it('template with function call inside interpolation', () => {
    const ast = parse('`result: {ROUND(x, 2)}`');
    expect(ast.type).toBe('template');
    if (ast.type === 'template') {
      expect(ast.parts).toEqual(['result: ', '']);
      expect(ast.expressions).toHaveLength(1);
      expect(ast.expressions[0]).toMatchObject({ type: 'function', name: 'ROUND' });
    }
  });

  it('escapes resolve in parsed parts', () => {
    const ast = parse('`a\\`b\\{c{x}`');
    expect(ast.type).toBe('template');
    if (ast.type === 'template') {
      expect(ast.parts[0]).toBe('a`b{c');
    }
  });

  it('parse error inside interpolation surfaces position', () => {
    expect(() => parse('`{+}`')).toThrow(FormulaParseError);
  });
});

describe('parse — AST node positions', () => {
  it('column ref carries its token span', () => {
    const ast = parse('price');
    expect(ast.type).toBe('column');
    expect(ast.start).toBe(0);
    expect(ast.end).toBe(5);
  });

  it('binary expression spans its operands', () => {
    const ast = parse('price * 2');
    expect(ast.type).toBe('binary');
    expect(ast.start).toBe(0);
    expect(ast.end).toBe(9);
    if (ast.type === 'binary') {
      expect(ast.left.start).toBe(0);
      expect(ast.left.end).toBe(5);
      expect(ast.right.start).toBe(8);
      expect(ast.right.end).toBe(9);
    }
  });

  it('function call includes the trailing paren', () => {
    const ast = parse('ROUND(x, 2)');
    expect(ast.type).toBe('function');
    expect(ast.start).toBe(0);
    expect(ast.end).toBe(11);
    if (ast.type === 'function') {
      expect(ast.args[0].start).toBe(6);
      expect(ast.args[0].end).toBe(7);
      expect(ast.args[1].start).toBe(9);
      expect(ast.args[1].end).toBe(10);
    }
  });

  it('template literal includes its backticks', () => {
    const source = '`hello {name}`';
    const ast = parse(source);
    expect(ast.type).toBe('template');
    expect(ast.start).toBe(0);
    expect(ast.end).toBe(source.length);
    if (ast.type === 'template') {
      const expr = ast.expressions[0];
      expect(expr.type).toBe('column');
      // name sits at positions 8..12 (after "hello {")
      expect(expr.start).toBe(8);
      expect(expr.end).toBe(12);
    }
  });

  it('unary and power nest their positions correctly', () => {
    const ast = parse('-x ^ 2');
    expect(ast.type).toBe('binary'); // the ^ binds tighter? actually unary wraps power
    // Actually: unary has higher precedence than ^, but let's check what the parser does.
    // parseComparison → parseAddition → parseMultiplication → parsePower → parseUnary
    // parseUnary sees `-`, recurses, parses primary `x`, returns unary(x).
    // Back in parsePower, sees `^`, parses right-hand parsePower → parseUnary → primary 2.
    // Final: binary(^, unary(-, x), 2). So root is binary.
    expect(ast.start).toBe(0);
    expect(ast.end).toBe(6);
    if (ast.type === 'binary') {
      expect(ast.left.type).toBe('unary');
      expect(ast.left.start).toBe(0);
      expect(ast.left.end).toBe(2);
      if (ast.left.type === 'unary') {
        expect(ast.left.operand.start).toBe(1);
        expect(ast.left.operand.end).toBe(2);
      }
    }
  });

  it('parens do not create a separate span — inner expression owns the range', () => {
    const ast = parse('(price)');
    expect(ast.type).toBe('column');
    expect(ast.start).toBe(1);
    expect(ast.end).toBe(6);
  });

  it('bracketed identifier carries the bracket span', () => {
    const ast = parse('[First Name]');
    expect(ast.type).toBe('column');
    expect(ast.start).toBe(0);
    expect(ast.end).toBe(12);
  });
});
