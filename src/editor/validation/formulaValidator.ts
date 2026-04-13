import { Token, TokenType, FormulaParseError } from '../../types.js';

export interface FormulaValidationError {
  message: string;
  start: number;
  end: number;
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
