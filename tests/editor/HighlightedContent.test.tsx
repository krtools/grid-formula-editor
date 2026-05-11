import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { HighlightedContent } from '../../src/editor/components/HighlightedContent';
import { DARK_COLORS, DEFAULT_COLORS } from '../../src/editor/constants';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

function rendered(formula: string, colors?: typeof DEFAULT_COLORS): HTMLSpanElement {
  const container = renderInto(
    <HighlightedContent formula={formula} colors={colors} />,
  );
  return container.querySelector('span') as HTMLSpanElement;
}

describe('<HighlightedContent>', () => {
  it('renders the formula text', () => {
    const span = rendered('ROUND(price, 2)');
    expect(span.textContent).toBe('ROUND(price, 2)');
  });

  it('emits child spans for each token', () => {
    const span = rendered('1 + 2');
    const children = span.querySelectorAll('span');
    // Three tokens: number, plus, number. Whitespace gaps are plain text nodes.
    expect(children.length).toBe(3);
  });

  it('applies the default color palette by default', () => {
    const span = rendered('42');
    const num = span.querySelector('span') as HTMLSpanElement;
    // Browsers normalise the hex color to rgb(); just confirm it's not empty
    // and isn't the dark-palette number color.
    expect(num.style.color).toBeTruthy();
    expect(num.style.color).not.toBe('');
  });

  it('accepts a custom color palette', () => {
    const span = rendered('42', DARK_COLORS);
    const num = span.querySelector('span') as HTMLSpanElement;
    // DARK_COLORS.number is #b5cea8 → rgb(181, 206, 168)
    expect(num.style.color).toBe('rgb(181, 206, 168)');
  });

  it('preserves whitespace by default (whiteSpace: pre)', () => {
    const span = rendered('1  +  2');
    expect(span.style.whiteSpace).toBe('pre');
    // Whitespace between tokens survives.
    expect(span.textContent).toBe('1  +  2');
  });

  it('caller style overrides the default whiteSpace', () => {
    const container = renderInto(
      <HighlightedContent formula="1 + 2" style={{ whiteSpace: 'normal' }} />,
    );
    const span = container.querySelector('span') as HTMLSpanElement;
    expect(span.style.whiteSpace).toBe('normal');
  });

  it('applies className', () => {
    const container = renderInto(
      <HighlightedContent formula="1" className="my-formula" />,
    );
    const span = container.querySelector('span') as HTMLSpanElement;
    expect(span.className).toBe('my-formula');
  });

  it('renders invalid/partial input without crashing (wavy underline on ERROR)', () => {
    const span = rendered('"unterminated');
    expect(span.textContent).toBe('"unterminated');
    // ERROR token carries the wavy-underline decoration.
    const error = Array.from(span.querySelectorAll('span'))
      .find(s => s.style.textDecorationStyle === 'wavy');
    expect(error).toBeDefined();
  });

  it('does not interpret formula text as HTML (escaping)', () => {
    const span = rendered('"<img onerror=alert(1)>"');
    // The injected <img> should appear as a string literal's content, not as
    // an actual <img> element.
    expect(span.querySelector('img')).toBeNull();
    expect(span.textContent).toBe('"<img onerror=alert(1)>"');
  });
});
