import { describe, it, expect } from 'vitest';
import { getCursorContext } from '../src/editor/autocomplete/cursorContext.js';

describe('getCursorContext', () => {
  it('returns expression-start for empty formula', () => {
    expect(getCursorContext('', 0)).toEqual({ type: 'expression-start' });
  });

  it('returns column context for bare identifier', () => {
    const ctx = getCursorContext('pri', 3);
    expect(ctx.type).toBe('column');
    if (ctx.type === 'column') {
      expect(ctx.partial).toBe('pri');
      expect(ctx.start).toBe(0);
    }
  });

  it('returns column context for partial identifier mid-formula', () => {
    const ctx = getCursorContext('a + pr', 6);
    expect(ctx.type).toBe('column');
    if (ctx.type === 'column') {
      expect(ctx.partial).toBe('pr');
    }
  });

  it('returns bracket-column context inside brackets', () => {
    const ctx = getCursorContext('[First', 6);
    expect(ctx.type).toBe('bracket-column');
    if (ctx.type === 'bracket-column') {
      expect(ctx.partial).toBe('First');
    }
  });

  it('returns function context when identifier followed by LPAREN', () => {
    const ctx = getCursorContext('ROUND(', 5);
    expect(ctx.type).toBe('function');
    if (ctx.type === 'function') {
      expect(ctx.partial).toBe('ROUND');
    }
  });

  it('returns expression-start after operator', () => {
    const ctx = getCursorContext('a + ', 4);
    expect(ctx.type).toBe('expression-start');
  });

  it('returns expression-start after LPAREN', () => {
    const ctx = getCursorContext('(', 1);
    expect(ctx.type).toBe('expression-start');
  });

  it('returns function-arg inside function call after LPAREN', () => {
    const ctx = getCursorContext('ROUND(', 6);
    expect(ctx.type).toBe('function-arg');
    if (ctx.type === 'function-arg') {
      expect(ctx.functionName).toBe('ROUND');
      expect(ctx.argIndex).toBe(0);
    }
  });

  it('returns function-arg with correct argIndex after comma', () => {
    const ctx = getCursorContext('ROUND(x, ', 9);
    expect(ctx.type).toBe('function-arg');
    if (ctx.type === 'function-arg') {
      expect(ctx.functionName).toBe('ROUND');
      expect(ctx.argIndex).toBe(1);
    }
  });

  it('returns function-arg for nested function', () => {
    const ctx = getCursorContext('IF(a, ROUND(x, ', 16);
    expect(ctx.type).toBe('function-arg');
    if (ctx.type === 'function-arg') {
      expect(ctx.functionName).toBe('ROUND');
      expect(ctx.argIndex).toBe(1);
    }
  });

  it('returns none when cursor is inside a number literal', () => {
    const ctx = getCursorContext('123', 2);
    expect(ctx.type).toBe('none');
  });

  it('returns none when cursor is inside a string literal', () => {
    const ctx = getCursorContext('"hello"', 3);
    expect(ctx.type).toBe('none');
  });

  it('returns none after completed identifier with no operator', () => {
    const ctx = getCursorContext('price', 5);
    // cursor right at end of identifier — still in column context
    expect(ctx.type).toBe('column');
  });

  it('returns expression-start after comparison operator', () => {
    const ctx = getCursorContext('a >= ', 5);
    expect(ctx.type).toBe('expression-start');
  });
});
