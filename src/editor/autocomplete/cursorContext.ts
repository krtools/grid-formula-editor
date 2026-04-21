import { tokenizeSafe } from '../../tokenizer.js';
import { TokenType, Token } from '../../types.js';
import { CursorContext } from '../types.js';

/**
 * Determines the cursor context from a formula string and cursor offset.
 * Used by the autocomplete engine to decide what suggestions to show.
 *
 * Pure function — no DOM or React dependencies.
 */
export function getCursorContext(formula: string, cursorOffset: number): CursorContext {
  if (formula.length === 0) {
    return { type: 'expression-start' };
  }

  const { tokens } = tokenizeSafe(formula);

  // Find the token at or just before the cursor
  const tokensNoEOF = tokens.filter(t => t.type !== TokenType.EOF);

  if (tokensNoEOF.length === 0) {
    return { type: 'expression-start' };
  }

  // Find which token the cursor is inside or right after
  let currentToken: Token | null = null;
  for (const token of tokensNoEOF) {
    if (cursorOffset >= token.start && cursorOffset <= token.end) {
      currentToken = token;
      break;
    }
  }

  // When the cursor sits at the start of a token with a whitespace gap to
  // the preceding token, classify based on the preceding token if it's a
  // separator — so `IF(x, |)` gives the same function-arg context as
  // `IF(x,|)`. Fall through when the preceding token doesn't yield a
  // meaningful context (e.g. `a |+ b` — prev is an identifier).
  if (currentToken && cursorOffset === currentToken.start) {
    const idx = tokensNoEOF.indexOf(currentToken);
    const prev = idx > 0 ? tokensNoEOF[idx - 1] : null;
    if (prev && prev.end < currentToken.start) {
      const afterPrev = classifyAfterSeparator(prev, tokensNoEOF);
      if (afterPrev) return afterPrev;
    }
  }

  // If cursor is past all tokens (e.g. in trailing whitespace), use the last token for context
  if (!currentToken && cursorOffset >= tokensNoEOF[tokensNoEOF.length - 1].end) {
    const last = tokensNoEOF[tokensNoEOF.length - 1];
    const afterLast = classifyAfterSeparator(last, tokensNoEOF);
    if (afterLast) return afterLast;
    // Otherwise no autocomplete (cursor after a completed identifier/literal)
    return { type: 'none' };
  }

  if (!currentToken) {
    return { type: 'expression-start' };
  }

  // Cursor is inside an identifier — could be column or function
  if (currentToken.type === TokenType.IDENTIFIER) {
    const partial = formula.slice(currentToken.start, cursorOffset);

    // Check if the next non-whitespace token after this identifier is LPAREN
    // (making this a function call). But only if cursor is still typing the name.
    const nextToken = findNextNonWhitespace(tokensNoEOF, currentToken);
    if (nextToken && nextToken.type === TokenType.LPAREN) {
      return { type: 'function', partial, start: currentToken.start };
    }

    // Also treat as potential function if partial matches function-name pattern
    // (all uppercase) — helps during typing before the paren exists
    return { type: 'column', partial, start: currentToken.start };
  }

  // Cursor inside a bracket identifier
  if (currentToken.type === TokenType.BRACKET_IDENTIFIER) {
    // partial is what's inside the brackets so far (excluding the opening [)
    const raw = formula.slice(currentToken.start, cursorOffset);
    const partial = raw.startsWith('[') ? raw.slice(1) : raw;
    return { type: 'bracket-column', partial, start: currentToken.start };
  }

  // Cursor inside or right after an LPAREN, or after a comma — function arg context
  if (currentToken.type === TokenType.LPAREN || currentToken.type === TokenType.COMMA) {
    const fnInfo = findEnclosingFunction(tokensNoEOF, currentToken);
    if (fnInfo) {
      return { type: 'function-arg', functionName: fnInfo.name, argIndex: fnInfo.argIndex };
    }
    return { type: 'expression-start' };
  }

  // Cursor right after an opening `{` of a template interpolation — expression start
  if (currentToken.type === TokenType.TEMPLATE_INTERP_START) {
    return { type: 'expression-start' };
  }

  // After an operator — expression start
  if (isOperatorOrSeparator(currentToken.type)) {
    return { type: 'expression-start' };
  }

  // ERROR token that looks like an unterminated bracket identifier
  if (currentToken.type === TokenType.ERROR) {
    const raw = formula.slice(currentToken.start, cursorOffset);
    if (raw.startsWith('[')) {
      const partial = raw.slice(1);
      return { type: 'bracket-column', partial, start: currentToken.start };
    }
  }

  // Inside a literal (number, string, boolean) or other error token
  return { type: 'none' };
}

function isOperatorOrSeparator(type: TokenType): boolean {
  return (
    type === TokenType.PLUS ||
    type === TokenType.MINUS ||
    type === TokenType.STAR ||
    type === TokenType.SLASH ||
    type === TokenType.PERCENT ||
    type === TokenType.CARET ||
    type === TokenType.AMPERSAND ||
    type === TokenType.EQ ||
    type === TokenType.NEQ ||
    type === TokenType.LT ||
    type === TokenType.GT ||
    type === TokenType.LTE ||
    type === TokenType.GTE ||
    type === TokenType.COMMA ||
    type === TokenType.LPAREN
  );
}

/**
 * Classify the context when the cursor sits after a given "preceding" token
 * (separated by whitespace). Returns null if the preceding token isn't a
 * separator/operator that yields a meaningful context on its own — in which
 * case callers should fall through to their normal classification.
 */
function classifyAfterSeparator(prev: Token, tokens: Token[]): CursorContext | null {
  if (prev.type === TokenType.COMMA || prev.type === TokenType.LPAREN) {
    const fnInfo = findEnclosingFunction(tokens, prev);
    if (fnInfo) {
      return { type: 'function-arg', functionName: fnInfo.name, argIndex: fnInfo.argIndex };
    }
    return { type: 'expression-start' };
  }
  if (prev.type === TokenType.TEMPLATE_INTERP_START) {
    return { type: 'expression-start' };
  }
  if (isOperatorOrSeparator(prev.type)) {
    return { type: 'expression-start' };
  }
  return null;
}

function findNextNonWhitespace(tokens: Token[], after: Token): Token | null {
  let found = false;
  for (const t of tokens) {
    if (found) return t;
    if (t === after) found = true;
  }
  return null;
}

/**
 * Walk backward from a LPAREN or COMMA to find the enclosing function name
 * and compute the argument index.
 */
function findEnclosingFunction(
  tokens: Token[],
  at: Token,
): { name: string; argIndex: number } | null {
  const idx = tokens.indexOf(at);
  if (idx < 0) return null;

  let parenDepth = 0;
  let commaCount = 0;

  for (let i = idx; i >= 0; i--) {
    const t = tokens[i];
    if (t.type === TokenType.RPAREN) {
      parenDepth++;
    } else if (t.type === TokenType.LPAREN) {
      if (parenDepth > 0) {
        parenDepth--;
      } else {
        // This is our enclosing LPAREN. Check if preceded by an identifier.
        if (i > 0 && tokens[i - 1].type === TokenType.IDENTIFIER) {
          return { name: tokens[i - 1].value, argIndex: commaCount };
        }
        return null;
      }
    } else if (t.type === TokenType.COMMA && parenDepth === 0) {
      commaCount++;
    }
  }

  return null;
}
