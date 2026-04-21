import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/tokenizer.js';
import { parse } from '../src/parser.js';
import { getExpansionRanges } from '../src/editor/utils/expandSelection.js';
import { ASTNode } from '../src/types.js';

function expand(input: string, offset: number) {
  const tokens = tokenize(input);
  let ast: ASTNode | null = null;
  try { ast = parse(input); } catch { /* tolerate */ }
  return getExpansionRanges(ast, tokens, offset);
}

describe('getExpansionRanges', () => {
  it('single column ref deduplicates token and AST ranges', () => {
    expect(expand('price', 2)).toEqual([{ start: 0, end: 5 }]);
  });

  it('binary expression exposes token then whole binary', () => {
    const ranges = expand('price * 2', 2);
    expect(ranges).toEqual([
      { start: 0, end: 5 }, // price token (dedupes with column ref)
      { start: 0, end: 9 }, // whole binary
    ]);
  });

  it('right operand of binary returns its own hierarchy', () => {
    const ranges = expand('price * 2', 8);
    expect(ranges).toEqual([
      { start: 8, end: 9 },
      { start: 0, end: 9 },
    ]);
  });

  it('function arg returns token then enclosing call', () => {
    const ranges = expand('ROUND(x, 2)', 6);
    expect(ranges).toEqual([
      { start: 6, end: 7 }, // x token (dedupes with column ref)
      { start: 0, end: 11 }, // whole ROUND(...) call
    ]);
  });

  it('caret on function name returns identifier token then call', () => {
    const ranges = expand('ROUND(x, 2)', 0);
    expect(ranges).toEqual([
      { start: 0, end: 5 }, // ROUND identifier token
      { start: 0, end: 11 },
    ]);
  });

  it('caret on operator only returns the enclosing AST node', () => {
    // `+` is not an expandable token type, so only the BinaryExpr applies.
    const ranges = expand('a + b', 2);
    expect(ranges).toEqual([{ start: 0, end: 5 }]);
  });

  it('empty formula yields no ranges', () => {
    expect(expand('', 0)).toEqual([]);
  });

  it('parenthesised expression shares range with its inner expression', () => {
    // `(price)` has no paren-wrapper AST node — parsePrimary returns the
    // inner expression unchanged. Only the column ref range applies.
    const ranges = expand('(price)', 3);
    expect(ranges).toEqual([{ start: 1, end: 6 }]);
  });

  it('template interpolation expands from column to whole template', () => {
    const source = '`hello {name}`';
    const ranges = expand(source, 9); // caret on `a` in `name`
    expect(ranges).toEqual([
      { start: 8, end: 12 }, // name token / column ref (deduped)
      { start: 0, end: source.length }, // whole template
    ]);
  });

  it('nested function call expands inside-out', () => {
    // ROUND(price * 2, 0) — caret on `price`
    const ranges = expand('ROUND(price * 2, 0)', 8);
    expect(ranges).toEqual([
      { start: 6, end: 11 },  // price (token + column ref)
      { start: 6, end: 15 },  // price * 2
      { start: 0, end: 19 },  // whole call
    ]);
  });

  it('template text token under caret is expandable', () => {
    // `hello {name}` — caret on `e` in "hello"
    const source = '`hello {name}`';
    const ranges = expand(source, 3);
    // Template text "hello " spans [1, 7) — the backtick is at 0.
    expect(ranges[0]).toEqual({ start: 1, end: 7 });
    // Then the whole template
    expect(ranges[ranges.length - 1]).toEqual({ start: 0, end: source.length });
  });
});
