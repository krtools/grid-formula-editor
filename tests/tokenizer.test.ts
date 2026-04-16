import { describe, it, expect } from 'vitest';
import { tokenize, tokenizeSafe } from '../src/tokenizer.js';
import { TokenType, FormulaParseError } from '../src/types.js';

describe('tokenize — start/end positions', () => {
  it('simple identifiers', () => {
    const tokens = tokenize('price');
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'price', start: 0, end: 5 });
    expect(tokens[1]).toMatchObject({ type: TokenType.EOF, start: 5, end: 5 });
  });

  it('number literal', () => {
    const tokens = tokenize('42.5');
    expect(tokens[0]).toMatchObject({ type: TokenType.NUMBER, value: '42.5', start: 0, end: 4 });
  });

  it('string literal (double quoted)', () => {
    const tokens = tokenize('"hello"');
    expect(tokens[0]).toMatchObject({ type: TokenType.STRING, value: 'hello', start: 0, end: 7 });
  });

  it('string literal (single quoted)', () => {
    const tokens = tokenize("'world'");
    expect(tokens[0]).toMatchObject({ type: TokenType.STRING, value: 'world', start: 0, end: 7 });
  });

  it('bracket identifier', () => {
    const tokens = tokenize('[First Name]');
    expect(tokens[0]).toMatchObject({
      type: TokenType.BRACKET_IDENTIFIER,
      value: 'First Name',
      start: 0,
      end: 12,
    });
  });

  it('boolean literals', () => {
    const tokens = tokenize('TRUE FALSE');
    expect(tokens[0]).toMatchObject({ type: TokenType.BOOLEAN, value: 'TRUE', start: 0, end: 4 });
    expect(tokens[1]).toMatchObject({ type: TokenType.BOOLEAN, value: 'FALSE', start: 5, end: 10 });
  });

  it('operators with whitespace', () => {
    const tokens = tokenize('a + b');
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, start: 0, end: 1 });
    expect(tokens[1]).toMatchObject({ type: TokenType.PLUS, start: 2, end: 3 });
    expect(tokens[2]).toMatchObject({ type: TokenType.IDENTIFIER, start: 4, end: 5 });
  });

  it('two-character operators', () => {
    const tokens = tokenize('a != b');
    expect(tokens[1]).toMatchObject({ type: TokenType.NEQ, value: '!=', start: 2, end: 4 });
  });

  it('<> operator', () => {
    const tokens = tokenize('a <> b');
    expect(tokens[1]).toMatchObject({ type: TokenType.NEQ, value: '<>', start: 2, end: 4 });
  });

  it('<= and >= operators', () => {
    const tokens = tokenize('a <= b >= c');
    expect(tokens[1]).toMatchObject({ type: TokenType.LTE, start: 2, end: 4 });
    expect(tokens[3]).toMatchObject({ type: TokenType.GTE, start: 7, end: 9 });
  });

  it('parentheses and commas', () => {
    const tokens = tokenize('ROUND(x, 2)');
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'ROUND', start: 0, end: 5 });
    expect(tokens[1]).toMatchObject({ type: TokenType.LPAREN, start: 5, end: 6 });
    expect(tokens[2]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'x', start: 6, end: 7 });
    expect(tokens[3]).toMatchObject({ type: TokenType.COMMA, start: 7, end: 8 });
    expect(tokens[4]).toMatchObject({ type: TokenType.NUMBER, value: '2', start: 9, end: 10 });
    expect(tokens[5]).toMatchObject({ type: TokenType.RPAREN, start: 10, end: 11 });
  });

  it('complex formula positions are contiguous (no gaps except whitespace)', () => {
    const tokens = tokenize('price * quantity + 1');
    // price: 0-5, *: 8-9 (skipped ws at 5,6,7? no — 5 is space, 6 is space? no...)
    // Actually: "price" 0-5, space at 5, "*" at 6, space at 7, "quantity" 8-16, space 16, "+" 17, space 18, "1" 19
    // Wait let me just check:
    // p(0)r(1)i(2)c(3)e(4) (5)*(6) (7)q(8)u(9)a(10)n(11)t(12)i(13)t(14)y(15) (16)+(17) (18)1(19)
    expect(tokens[0]).toMatchObject({ value: 'price', start: 0, end: 5 });
    expect(tokens[1]).toMatchObject({ value: '*', start: 6, end: 7 });
    expect(tokens[2]).toMatchObject({ value: 'quantity', start: 8, end: 16 });
    expect(tokens[3]).toMatchObject({ value: '+', start: 17, end: 18 });
    expect(tokens[4]).toMatchObject({ value: '1', start: 19, end: 20 });
  });

  it('throws FormulaParseError on unexpected character', () => {
    expect(() => tokenize('a @ b')).toThrow(FormulaParseError);
    try {
      tokenize('a @ b');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaParseError);
      expect((e as FormulaParseError).start).toBe(2);
      expect((e as FormulaParseError).end).toBe(3);
    }
  });
});

describe('tokenizeSafe', () => {
  it('tokenizes valid input identically to tokenize()', () => {
    const strict = tokenize('price * quantity');
    const safe = tokenizeSafe('price * quantity');
    expect(safe.error).toBeNull();
    expect(safe.tokens).toEqual(strict);
  });

  it('produces ERROR token for unexpected characters', () => {
    const { tokens, error } = tokenizeSafe('a @ b');
    expect(error).toBeInstanceOf(FormulaParseError);
    expect(error!.start).toBe(2);
    expect(error!.end).toBe(3);

    const errorToken = tokens.find(t => t.type === TokenType.ERROR);
    expect(errorToken).toBeDefined();
    expect(errorToken!.value).toBe('@');
    expect(errorToken!.start).toBe(2);
    expect(errorToken!.end).toBe(3);

    // Still produces tokens for valid parts
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'a' });
    expect(tokens[2]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'b' });
  });

  it('handles unterminated string', () => {
    const { tokens, error } = tokenizeSafe('"hello');
    expect(error).toBeInstanceOf(FormulaParseError);
    expect(error!.message).toMatch(/Unterminated string/);

    const strToken = tokens.find(t => t.type === TokenType.ERROR);
    expect(strToken).toBeDefined();
    expect(strToken!.value).toBe('hello');
    expect(strToken!.start).toBe(0);
    expect(strToken!.end).toBe(6);
  });

  it('handles unterminated bracket identifier', () => {
    const { tokens, error } = tokenizeSafe('[First Name');
    expect(error).toBeInstanceOf(FormulaParseError);
    expect(error!.message).toMatch(/Unterminated bracket/);

    const bracketToken = tokens.find(t => t.type === TokenType.ERROR);
    expect(bracketToken).toBeDefined();
    expect(bracketToken!.value).toBe('First Name');
    expect(bracketToken!.start).toBe(0);
    expect(bracketToken!.end).toBe(11);
  });

  it('continues after errors', () => {
    const { tokens } = tokenizeSafe('a @ b # c');
    // Should have tokens for a, @(error), b, #(error), c, EOF
    const identifiers = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(identifiers).toHaveLength(3);
    expect(identifiers.map(t => t.value)).toEqual(['a', 'b', 'c']);

    const errors = tokens.filter(t => t.type === TokenType.ERROR);
    expect(errors).toHaveLength(2);
  });

  it('only records the first error', () => {
    const { error } = tokenizeSafe('a @ b # c');
    expect(error).toBeInstanceOf(FormulaParseError);
    expect(error!.start).toBe(2); // first error at @
  });

  it('handles empty input', () => {
    const { tokens, error } = tokenizeSafe('');
    expect(error).toBeNull();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });
});

describe('tokenize — template literals', () => {
  it('empty template', () => {
    const tokens = tokenize('``');
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_END,
      TokenType.EOF,
    ]);
    expect(tokens[0]).toMatchObject({ start: 0, end: 1 });
    expect(tokens[1]).toMatchObject({ start: 1, end: 2 });
  });

  it('static text only', () => {
    const tokens = tokenize('`hello`');
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_TEXT,
      TokenType.TEMPLATE_END,
      TokenType.EOF,
    ]);
    expect(tokens[1]).toMatchObject({ value: 'hello', start: 1, end: 6 });
    expect(tokens[2]).toMatchObject({ start: 6, end: 7 });
  });

  it('single interpolation', () => {
    const tokens = tokenize('`{name}`');
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.IDENTIFIER,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_END,
      TokenType.EOF,
    ]);
    expect(tokens[2]).toMatchObject({ value: 'name', start: 2, end: 6 });
  });

  it('mixed text and interpolation', () => {
    const tokens = tokenize('`hi {name}!`');
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_TEXT,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.IDENTIFIER,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_TEXT,
      TokenType.TEMPLATE_END,
      TokenType.EOF,
    ]);
    expect(tokens[1]).toMatchObject({ value: 'hi ', start: 1, end: 4 });
    expect(tokens[5]).toMatchObject({ value: '!', start: 10, end: 11 });
  });

  it('multiple interpolations with no text between', () => {
    const tokens = tokenize('`{a}{b}`');
    const types = tokens.map(t => t.type);
    expect(types).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.IDENTIFIER,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.IDENTIFIER,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_END,
      TokenType.EOF,
    ]);
  });

  it('expression inside interpolation', () => {
    const tokens = tokenize('`result: {ROUND(x, 2)}`');
    const nonEOF = tokens.filter(t => t.type !== TokenType.EOF);
    expect(nonEOF.map(t => t.type)).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_TEXT,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.IDENTIFIER, // ROUND
      TokenType.LPAREN,
      TokenType.IDENTIFIER, // x
      TokenType.COMMA,
      TokenType.NUMBER,
      TokenType.RPAREN,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_END,
    ]);
  });

  it('escape sequences in template text', () => {
    const tokens = tokenize('`a\\`b\\{c\\\\d`');
    const text = tokens.find(t => t.type === TokenType.TEMPLATE_TEXT);
    expect(text).toBeDefined();
    expect(text!.value).toBe('a`b{c\\d');
  });

  it('newline and tab escapes in template text', () => {
    const tokens = tokenize('`a\\nb\\tc`');
    const text = tokens.find(t => t.type === TokenType.TEMPLATE_TEXT);
    expect(text!.value).toBe('a\nb\tc');
  });

  it('literal `}` in template text needs no escape', () => {
    const tokens = tokenize('`a}b`');
    const text = tokens.find(t => t.type === TokenType.TEMPLATE_TEXT);
    expect(text!.value).toBe('a}b');
  });

  it('bracket column inside interpolation', () => {
    const tokens = tokenize('`{[First Name]}`');
    const bracket = tokens.find(t => t.type === TokenType.BRACKET_IDENTIFIER);
    expect(bracket).toMatchObject({ value: 'First Name' });
  });

  it('nested template', () => {
    const tokens = tokenize('`{ `{x}` }`');
    const types = tokens.map(t => t.type).filter(t => t !== TokenType.EOF);
    // outer start, {, inner start, inner {, x, inner }, inner end, inner }, outer end
    expect(types).toEqual([
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.TEMPLATE_START,
      TokenType.TEMPLATE_INTERP_START,
      TokenType.IDENTIFIER,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_END,
      TokenType.TEMPLATE_INTERP_END,
      TokenType.TEMPLATE_END,
    ]);
  });

  it('throws on unterminated template', () => {
    expect(() => tokenize('`hello')).toThrow(FormulaParseError);
  });

  it('throws on unterminated interpolation', () => {
    expect(() => tokenize('`hi {name')).toThrow(FormulaParseError);
  });
});

describe('tokenizeSafe — template literals', () => {
  it('valid template matches strict output', () => {
    const strict = tokenize('`hi {name}!`');
    const { tokens, error } = tokenizeSafe('`hi {name}!`');
    expect(error).toBeNull();
    expect(tokens).toEqual(strict);
  });

  it('unterminated template records error at opening backtick', () => {
    const { tokens, error } = tokenizeSafe('`hello');
    expect(error).toBeInstanceOf(FormulaParseError);
    expect(error!.start).toBe(0);
    expect(tokens[0]).toMatchObject({ type: TokenType.TEMPLATE_START });
    expect(tokens.some(t => t.type === TokenType.TEMPLATE_TEXT && t.value === 'hello')).toBe(true);
  });

  it('unterminated interpolation records error', () => {
    const { tokens, error } = tokenizeSafe('`hi {name');
    expect(error).toBeInstanceOf(FormulaParseError);
    expect(tokens.some(t => t.type === TokenType.TEMPLATE_INTERP_START)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'name')).toBe(true);
  });
});
