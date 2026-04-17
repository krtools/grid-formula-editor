import { Token, TokenType, FormulaParseError } from '../../types.js';

/** A single validation issue produced for the editor's squiggle underlines. */
export interface FormulaValidationError {
  /** Human-readable message — shown as the squiggle's title tooltip. */
  message: string;
  /** Start offset (inclusive) of the offending source range. */
  start: number;
  /** End offset (exclusive) of the offending source range. */
  end: number;
  /** What kind of problem this squiggle marks. */
  type: 'parse' | 'unknown-function' | 'unknown-column';
}

/**
 * Validates a formula and returns an array of validation errors.
 * Detects parse errors, unknown function names, and unknown column references.
 */
export function validateFormula(
  tokens: Token[],
  parseError: FormulaParseError | null,
  knownFunctions: Set<string>,
  knownColumns?: Set<string>,
): FormulaValidationError[] {
  const errors: FormulaValidationError[] = [];

  // Include parse error if present
  if (parseError) {
    errors.push({
      message: parseError.message,
      start: parseError.start,
      end: parseError.end,
      type: 'parse',
    });
  }

  // Detect unclosed parens and unclosed template interpolations.
  // The base parse error for these lands at EOF (zero-width, suppressed by the
  // squiggle renderer and deferred by the cursor-position guard), so emit
  // targeted errors at the opening token instead.
  const openStack: Token[] = [];
  for (const token of tokens) {
    if (token.type === TokenType.LPAREN || token.type === TokenType.TEMPLATE_INTERP_START) {
      openStack.push(token);
    } else if (token.type === TokenType.RPAREN || token.type === TokenType.TEMPLATE_INTERP_END) {
      // Match against top of stack regardless of type — if mismatched the parser
      // will surface its own error.
      if (openStack.length > 0) openStack.pop();
    }
  }
  for (const open of openStack) {
    const message = open.type === TokenType.LPAREN ? 'Unclosed parenthesis' : 'Unclosed interpolation';
    errors.push({ message, start: open.start, end: open.end, type: 'parse' });
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = i < tokens.length - 1 ? tokens[i + 1] : null;

    if (token.type === TokenType.IDENTIFIER) {
      if (next && next.type === TokenType.LPAREN) {
        // Function call — check against known functions
        if (!knownFunctions.has(token.value.toUpperCase())) {
          errors.push({
            message: `Unknown function: ${token.value.toUpperCase()}`,
            start: token.start,
            end: token.end,
            type: 'unknown-function',
          });
        }
      } else if (knownColumns && !knownColumns.has(token.value)) {
        // Column reference — check against known columns (case-sensitive)
        errors.push({
          message: `Unknown column: ${token.value}`,
          start: token.start,
          end: token.end,
          type: 'unknown-column',
        });
      }
    } else if (token.type === TokenType.BRACKET_IDENTIFIER && knownColumns) {
      // Bracket column reference [Name] — value is the inner text without brackets
      if (!knownColumns.has(token.value)) {
        errors.push({
          message: `Unknown column: ${token.value}`,
          start: token.start,
          end: token.end,
          type: 'unknown-column',
        });
      }
    }
  }

  return errors;
}
