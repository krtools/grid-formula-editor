import * as React from 'react';
import { Token, TokenType } from '../../types.js';
import { FormulaColorConfig } from '../types.js';
import { getTokenColor } from '../styles/inlineStyles.js';

interface HighlightedContentProps {
  formula: string;
  tokens: Token[];
  colors: Required<FormulaColorConfig>;
}

/**
 * Builds highlighted HTML from tokens. Returns an HTML string for use
 * with dangerouslySetInnerHTML on the contentEditable element.
 *
 * Each token becomes a <span> with the appropriate color. Whitespace gaps
 * between tokens are inserted as plain text nodes.
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

    parts.push(
      `<span style="color:${color};font-weight:${fontWeight};${errorDecoration}">${escapeHTML(text)}</span>`
    );

    lastEnd = token.end;
  }

  // Trailing text after last token
  if (lastEnd < formula.length) {
    parts.push(escapeHTML(formula.slice(lastEnd)));
  }

  return parts.join('');
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
 * React component that renders the highlighted formula.
 * This is a convenience wrapper around buildHighlightedHTML.
 */
export function HighlightedContent({ formula, tokens, colors }: HighlightedContentProps) {
  const html = React.useMemo(
    () => buildHighlightedHTML(formula, tokens, colors),
    [formula, tokens, colors],
  );

  return <>{html}</>;
}
