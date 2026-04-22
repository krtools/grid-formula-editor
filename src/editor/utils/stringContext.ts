import { tokenizeSafe } from '../../tokenizer.js';
import { TokenType, Token } from '../../types.js';

export interface StringContext {
  /** The delimiter that opens the enclosing string. */
  delimiter: '"' | "'" | '`';
  /**
   * Offset of the closing delimiter in the formula, or `-1` when the string
   * is unterminated (no closer exists to step past).
   */
  closerPos: number;
}

/**
 * Determine whether the cursor sits inside a string-literal content area.
 * Used by the editor's quote auto-pair logic: inside a string, a typed
 * quote char should not double up — it should insert literally (or step
 * past the closer when it matches the string's own delimiter).
 *
 * Returns the enclosing string's delimiter and the position of its closer
 * (or -1 when unterminated) — or null when the cursor is outside any string.
 *
 * Recognises:
 *   - `"..."` and `'...'` string literals (STRING token) — cursor inside the
 *     content area `[start+1, end-1]`.
 *   - Unterminated `"..."` / `'...'` — ERROR token, cursor in `[start+1, end]`.
 *   - Template text inside backticks (``\`...\```) — both the TEMPLATE_TEXT
 *     token itself and empty template-text regions between delimiters.
 *
 * Does NOT classify expression space inside a template interpolation as
 * "inside a string" — that space is grammar, not string content.
 */
export function getStringContext(formula: string, cursor: number): StringContext | null {
  const { tokens } = tokenizeSafe(formula);

  for (const tok of tokens) {
    if (tok.type === TokenType.STRING) {
      // Terminated: content area is [start+1, end-1]; closer at end-1.
      if (cursor >= tok.start + 1 && cursor <= tok.end - 1) {
        const delimiter = formula[tok.start];
        if (delimiter === '"' || delimiter === "'") {
          return { delimiter, closerPos: tok.end - 1 };
        }
      }
    } else if (tok.type === TokenType.ERROR) {
      // Unterminated `"` / `'` string — opener at tok.start, no closer.
      const opener = formula[tok.start];
      if ((opener === '"' || opener === "'") &&
          cursor >= tok.start + 1 && cursor <= tok.end) {
        return { delimiter: opener, closerPos: -1 };
      }
    }
  }

  // Template text: check the explicit TEMPLATE_TEXT token first, then the
  // empty-text region case (between a template-opening delimiter and its
  // closer with no text in between — tokenizer emits no TEMPLATE_TEXT then).
  for (const tok of tokens) {
    if (tok.type === TokenType.TEMPLATE_TEXT &&
        cursor >= tok.start && cursor <= tok.end) {
      return templateCloser(formula, tokens, tok.end);
    }
  }

  if (inEmptyTemplateTextRegion(tokens, cursor)) {
    return templateCloser(formula, tokens, cursor);
  }

  return null;
}

/**
 * Walks token state up to `cursor` and returns true when the cursor sits in
 * a template-text context — i.e. inside a backtick template but outside any
 * interpolation. Used to detect empty-text regions where no TEMPLATE_TEXT
 * token exists (e.g. `` \`|\` ``, `` \`{x}|{y}\` ``).
 */
function inEmptyTemplateTextRegion(tokens: Token[], cursor: number): boolean {
  let state: 0 | 1 | 2 = 0;
  for (const t of tokens) {
    // Apply a token's state change once the cursor has passed its end —
    // i.e. the delimiter has been consumed at the cursor's position.
    if (t.end > cursor) break;
    if (t.type === TokenType.TEMPLATE_START) state = 1;
    else if (t.type === TokenType.TEMPLATE_END) state = 0;
    else if (t.type === TokenType.TEMPLATE_INTERP_START) state = 2;
    else if (t.type === TokenType.TEMPLATE_INTERP_END) state = 1;
  }
  return state === 1;
}

/**
 * Find the closer for a backtick template when cursor is already inside the
 * template-text region. The closer is the first TEMPLATE_END after the cursor;
 * if the next delimiter is a TEMPLATE_INTERP_START (`{`), there's no
 * backtick-closer on this side, so return -1.
 */
function templateCloser(formula: string, tokens: Token[], from: number): StringContext {
  for (const tok of tokens) {
    if (tok.start < from) continue;
    if (tok.type === TokenType.TEMPLATE_END) {
      return { delimiter: '`', closerPos: tok.start };
    }
    if (tok.type === TokenType.TEMPLATE_INTERP_START) {
      return { delimiter: '`', closerPos: -1 };
    }
  }
  // Unterminated template (no TEMPLATE_END reached).
  void formula;
  return { delimiter: '`', closerPos: -1 };
}
