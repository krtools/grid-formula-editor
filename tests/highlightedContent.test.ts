import { describe, it, expect } from 'vitest';
import { buildHighlightedHTML } from '../src/editor/components/HighlightedContent.js';
import { tokenizeSafe } from '../src/tokenizer.js';
import { DEFAULT_COLORS } from '../src/editor/constants.js';

function highlight(formula: string): string {
  const { tokens } = tokenizeSafe(formula);
  return buildHighlightedHTML(formula, tokens, DEFAULT_COLORS);
}

describe('buildHighlightedHTML', () => {
  it('returns empty string for empty input', () => {
    expect(buildHighlightedHTML('', [], DEFAULT_COLORS)).toBe('');
  });

  it('emits one span per token with the mapped color', () => {
    const html = highlight('42');
    expect(html).toContain(`color:${DEFAULT_COLORS.number}`);
    expect(html).toContain('>42</span>');
  });

  it('uses the functionName color for an identifier followed by LPAREN', () => {
    const html = highlight('ROUND(1, 2)');
    expect(html).toContain(`color:${DEFAULT_COLORS.functionName}`);
    expect(html).toContain('data-fn-name="ROUND"');
  });

  it('uses the column color for an identifier NOT followed by LPAREN', () => {
    const html = highlight('price');
    expect(html).toContain(`color:${DEFAULT_COLORS.column}`);
    expect(html).not.toContain('data-fn-name');
  });

  it('preserves whitespace gaps between tokens as plain text', () => {
    const html = highlight('1 + 2');
    // Three tokens with single spaces between; spaces should appear as
    // raw text outside the spans.
    expect(html).toMatch(/<\/span> <span/);
  });

  it('escapes HTML metacharacters inside token text', () => {
    const html = highlight('"<script>alert(1)</script>"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('marks ERROR tokens with a wavy underline', () => {
    const html = highlight('"unterminated');
    expect(html).toContain('text-decoration:wavy underline');
    expect(html).toContain(`text-decoration-color:${DEFAULT_COLORS.error}`);
  });

  it('renders booleans bold', () => {
    const html = highlight('TRUE');
    expect(html).toContain('font-weight:600');
  });

  it('renders function names bold', () => {
    const html = highlight('ABS(1)');
    // ABS span carries the function-bold weight.
    expect(html).toMatch(/font-weight:600[^>]*>ABS</);
  });

  it('emits the trailing-whitespace tail after the last token', () => {
    const html = highlight('1  ');
    // Two trailing spaces should appear after the closing </span>.
    expect(html).toMatch(/<\/span>\s\s$/);
  });
});
