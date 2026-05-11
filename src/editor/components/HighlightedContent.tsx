import * as React from 'react';
import { tokenizeSafe } from '../../tokenizer.js';
import { Token, TokenType } from '../../types.js';
import { FormulaColorConfig } from '../types.js';
import { mergeColors, getTokenColor } from '../styles/inlineStyles.js';

/**
 * Props for {@link HighlightedContent}. The component tokenizes the formula
 * internally (via the fault-tolerant tokenizer, so partial/invalid input
 * still renders — broken regions show with a wavy underline).
 */
export interface HighlightedContentProps {
  /** The formula source to highlight. */
  formula: string;
  /**
   * Partial color overrides. Any missing keys fall back to `DEFAULT_COLORS`.
   * Pass `DARK_COLORS` to use the dark palette.
   */
  colors?: FormulaColorConfig;
  /** Additional class name on the rendered `<span>`. */
  className?: string;
  /**
   * Additional inline styles. `whiteSpace: 'pre'` is applied by default to
   * preserve formula whitespace; override here if you want collapsing.
   */
  style?: React.CSSProperties;
}

/**
 * Builds highlighted HTML from tokens. Returns an HTML string for use
 * with dangerouslySetInnerHTML on the contentEditable element.
 *
 * Each token becomes a <span> with the appropriate color. Whitespace gaps
 * between tokens are inserted as plain text nodes. Function-name identifier
 * tokens receive `data-fn-name` so hover tooltips can look them up.
 */
export function buildHighlightedHTML(
  formula: string,
  tokens: Token[],
  colors: Required<FormulaColorConfig>,
): string {
  if (formula.length === 0) return '';

  const parts: string[] = [];
  let lastEnd = 0;

  for (const token of tokens) {
    if (token.type === TokenType.EOF) continue;

    // Insert whitespace gap between tokens
    if (token.start > lastEnd) {
      parts.push(escapeHTML(formula.slice(lastEnd, token.start)));
    }

    const text = formula.slice(token.start, token.end);
    const isFunctionName = isTokenFunctionName(token, tokens);
    const color = getTokenColor(token.type, colors, isFunctionName);

    let fontWeight = 'normal';
    if (isFunctionName || token.type === TokenType.BOOLEAN) {
      fontWeight = '600';
    }

    const errorDecoration = token.type === TokenType.ERROR
      ? 'text-decoration:wavy underline;text-decoration-color:' + colors.error + ';'
      : '';

    const fnAttr = isFunctionName ? ` data-fn-name="${escapeHTMLAttr(text)}"` : '';

    parts.push(
      `<span style="color:${color};font-weight:${fontWeight};${errorDecoration}"${fnAttr}>${escapeHTML(text)}</span>`
    );

    lastEnd = token.end;
  }

  // Trailing text after last token
  if (lastEnd < formula.length) {
    parts.push(escapeHTML(formula.slice(lastEnd)));
  }

  return parts.join('');
}

function escapeHTMLAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Determines if an IDENTIFIER token is a function name by checking
 * if the next non-EOF token is LPAREN.
 */
function isTokenFunctionName(token: Token, allTokens: Token[]): boolean {
  if (token.type !== TokenType.IDENTIFIER) return false;
  const idx = allTokens.indexOf(token);
  for (let i = idx + 1; i < allTokens.length; i++) {
    if (allTokens[i].type === TokenType.EOF) continue;
    return allTokens[i].type === TokenType.LPAREN;
  }
  return false;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a syntax-highlighted formula as a single inline `<span>`. The
 * formula is tokenized internally with the fault-tolerant tokenizer, so
 * partial/invalid input still renders (broken regions show with a wavy
 * underline). Each token becomes a colored child `<span>` via
 * {@link buildHighlightedHTML}.
 *
 * The component uses `dangerouslySetInnerHTML` — the HTML is built from
 * tokenizer output we fully control, and every text segment is escaped by
 * {@link buildHighlightedHTML}, so user-supplied formula text cannot break
 * out of its token span.
 */
export function HighlightedContent({
  formula,
  colors,
  className,
  style,
}: HighlightedContentProps) {
  const merged = React.useMemo(() => mergeColors(colors), [colors]);
  const html = React.useMemo(() => {
    const { tokens } = tokenizeSafe(formula);
    return buildHighlightedHTML(formula, tokens, merged);
  }, [formula, merged]);

  return (
    <span
      className={className}
      style={{ whiteSpace: 'pre', ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
