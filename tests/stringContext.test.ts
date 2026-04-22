import { describe, it, expect } from 'vitest';
import { getStringContext } from '../src/editor/utils/stringContext.js';

describe('getStringContext', () => {
  describe('outside any string', () => {
    it('returns null for an empty formula', () => {
      expect(getStringContext('', 0)).toBeNull();
    });

    it('returns null for bare identifier', () => {
      expect(getStringContext('price', 3)).toBeNull();
    });

    it('returns null at position before a string opener', () => {
      expect(getStringContext('"abc"', 0)).toBeNull();
    });

    it('returns null at position right after a string closer', () => {
      expect(getStringContext('"abc"', 5)).toBeNull();
    });

    it('returns null in function-call argument space', () => {
      expect(getStringContext('ROUND(x, 2)', 9)).toBeNull();
    });

    it('returns null inside bracket identifier (not a string)', () => {
      expect(getStringContext('[First Name]', 5)).toBeNull();
    });
  });

  describe('inside a double-quoted string', () => {
    it('detects content with terminated string — closer at end-1', () => {
      // `"abc"` — positions: 0:" 1:a 2:b 3:c 4:"
      const ctx = getStringContext('"abc"', 2);
      expect(ctx).toEqual({ delimiter: '"', closerPos: 4 });
    });

    it('treats position right after opener as inside', () => {
      expect(getStringContext('"abc"', 1)).toEqual({ delimiter: '"', closerPos: 4 });
    });

    it('treats position right before closer as inside (closer position)', () => {
      expect(getStringContext('"abc"', 4)).toEqual({ delimiter: '"', closerPos: 4 });
    });

    it('detects content of empty string', () => {
      // `""` — positions: 0:" 1:"
      expect(getStringContext('""', 1)).toEqual({ delimiter: '"', closerPos: 1 });
    });
  });

  describe('inside a single-quoted string', () => {
    it('detects content', () => {
      expect(getStringContext("'abc'", 2)).toEqual({ delimiter: "'", closerPos: 4 });
    });

    it('detects content at closer position', () => {
      expect(getStringContext("'abc'", 4)).toEqual({ delimiter: "'", closerPos: 4 });
    });
  });

  describe('unterminated string', () => {
    it('double-quoted with no closer — closerPos is -1', () => {
      // `"abc` — positions: 0:" 1:a 2:b 3:c; cursor at 3 is inside content
      const ctx = getStringContext('"abc', 3);
      expect(ctx).toEqual({ delimiter: '"', closerPos: -1 });
    });

    it('cursor at EOF of unterminated string still inside', () => {
      expect(getStringContext('"abc', 4)).toEqual({ delimiter: '"', closerPos: -1 });
    });

    it('unterminated single-quoted', () => {
      expect(getStringContext("'abc", 2)).toEqual({ delimiter: "'", closerPos: -1 });
    });

    it('cursor before opener of unterminated string is outside', () => {
      expect(getStringContext('"abc', 0)).toBeNull();
    });
  });

  describe('inside backtick template text', () => {
    it('detects plain template text', () => {
      // `` `hello` `` — positions: 0:` 1-5:hello 6:`
      const ctx = getStringContext('`hello`', 3);
      expect(ctx).toEqual({ delimiter: '`', closerPos: 6 });
    });

    it('detects position right after opener', () => {
      expect(getStringContext('`hello`', 1)).toEqual({ delimiter: '`', closerPos: 6 });
    });

    it('detects position right before closer', () => {
      expect(getStringContext('`hello`', 6)).toEqual({ delimiter: '`', closerPos: 6 });
    });

    it('detects empty template (no TEMPLATE_TEXT token emitted)', () => {
      // `` `` `` — positions: 0:` 1:`
      expect(getStringContext('``', 1)).toEqual({ delimiter: '`', closerPos: 1 });
    });

    it('detects template text right before an interpolation (no backtick closer on this side)', () => {
      // `` `hello {name}` `` — cursor before `{`
      const ctx = getStringContext('`hello {name}`', 7);
      expect(ctx).toEqual({ delimiter: '`', closerPos: -1 });
    });

    it('detects template text right after an interpolation — backtick closer found', () => {
      // `` `{name} world` `` — cursor right after `}`
      // positions: 0:` 1:{ 2-5:name 6:} 7-12: world 13:`
      const ctx = getStringContext('`{name} world`', 7);
      expect(ctx).toEqual({ delimiter: '`', closerPos: 13 });
    });

    it('detects empty text region between two interpolations', () => {
      // `` `{a}{b}` `` — cursor between `}` and `{`
      // positions: 0:` 1:{ 2:a 3:} 4:{ 5:b 6:} 7:`
      const ctx = getStringContext('`{a}{b}`', 4);
      expect(ctx).toEqual({ delimiter: '`', closerPos: -1 });
    });
  });

  describe('inside a nested string within a template interpolation', () => {
    it('detects outer single-quoted nested string, not the surrounding template', () => {
      // `` `{'abc'}` `` — cursor at offset 3 (between `'` and `a`)
      // positions: 0:` 1:{ 2:' 3:a 4:b 5:c 6:' 7:} 8:`
      const ctx = getStringContext("`{'abc'}`", 3);
      expect(ctx).toEqual({ delimiter: "'", closerPos: 6 });
    });

    it('detects double-quoted nested string inside template', () => {
      // `` `{"abc"}` ``
      expect(getStringContext('`{"abc"}`', 3)).toEqual({ delimiter: '"', closerPos: 6 });
    });

    it('returns null in interpolation expression space (not inside a string)', () => {
      // `` `{name}` `` — cursor just inside `{`, in expression space
      expect(getStringContext('`{name}`', 2)).toBeNull();
    });

    it('returns null between interp-start and nested string opener', () => {
      // `` `{'abc'}` `` — cursor right after `{`, before `'`
      expect(getStringContext("`{'abc'}`", 2)).toBeNull();
    });
  });

  describe('character at cursor that coincidentally matches a quote', () => {
    it('does not treat an apostrophe inside a double-quoted string as a closer', () => {
      // `"ab'cd"` — cursor right before the `'`
      // positions: 0:" 1:a 2:b 3:' 4:c 5:d 6:"
      // delimiter is `"`, closer at 6, NOT at 3
      const ctx = getStringContext(`"ab'cd"`, 3);
      expect(ctx).toEqual({ delimiter: '"', closerPos: 6 });
    });
  });
});
