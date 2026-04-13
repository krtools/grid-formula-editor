import { Token, TokenType, FormulaParseError } from '../../types.js';

export interface FormulaValidationError {
  message: string;
  start: number;
  end: number;
  type: 'parse' | 'unknown-function';
}

/**
 * Validates a formula and returns an array of validation errors.
 * Detects parse errors and unknown function names.
 */
export function validateFormula(
  tokens: Token[],
  parseError: FormulaParseError | null,
  knownFunctions: Set<string>,
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

  // Detect unknown functions: IDENTIFIER immediately followed by LPAREN
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      token.type === TokenType.IDENTIFIER &&
      next.type === TokenType.LPAREN &&
      !knownFunctions.has(token.value.toUpperCase())
    ) {
      errors.push({
        message: `Unknown function: ${token.value.toUpperCase()}`,
        start: token.start,
        end: token.end,
        type: 'unknown-function',
      });
    }
  }

  return errors;
}
