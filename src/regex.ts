import { FormulaEvalError } from './types.js';

export interface RegexOptions {
  /** Whether to set the `g` (global) flag. */
  global: boolean;
  /** `0` = case sensitive (no `i` flag); `1` = case insensitive (`i` flag set). */
  caseSensitivity: number;
}

/**
 * Compile a regex for the REGEX* builtins. Always sets the `u` (Unicode)
 * flag — Unicode-aware matching, surrogate-pair correctness, and `\p{...}`
 * support. Wraps `RegExp` SyntaxError as `FormulaEvalError('FUNCTION_ERROR', ...)`
 * so the runtime error handler can flag it per cell.
 */
export function compileRegex(pattern: string, opts: RegexOptions): RegExp {
  if (opts.caseSensitivity !== 0 && opts.caseSensitivity !== 1) {
    throw new FormulaEvalError(
      'FUNCTION_ERROR',
      `case_sensitivity must be 0 or 1, got ${opts.caseSensitivity}`,
    );
  }
  let flags = 'u';
  if (opts.global) flags += 'g';
  if (opts.caseSensitivity === 1) flags += 'i';
  try {
    return new RegExp(pattern, flags);
  } catch (cause) {
    throw new FormulaEvalError(
      'FUNCTION_ERROR',
      `Invalid regex pattern: ${(cause as Error).message}`,
      cause,
    );
  }
}
