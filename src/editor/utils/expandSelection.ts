import { ASTNode, Token, TokenType } from '../../types.js';

export interface SelectionRange {
  start: number;
  end: number;
}

/**
 * Token types that make a meaningful level-0 selection. Operators, parens,
 * commas, and template delimiters are skipped — selecting just `+` or a
 * standalone `(` isn't useful.
 */
const EXPANDABLE_TOKEN_TYPES = new Set<TokenType>([
  TokenType.NUMBER,
  TokenType.STRING,
  TokenType.BOOLEAN,
  TokenType.IDENTIFIER,
  TokenType.BRACKET_IDENTIFIER,
  TokenType.TEMPLATE_TEXT,
]);

/**
 * Build the expansion hierarchy for a given cursor offset.
 *
 * Returns ranges sorted smallest-to-largest, each representing one "expand
 * selection" level:
 *   [0] = innermost expandable token containing the offset
 *   [1] = innermost AST node containing the offset
 *   ...
 *   [N] = root (entire formula)
 *
 * Duplicate ranges (e.g. a single-token column ref whose token range equals
 * its AST node range) are collapsed so each step widens the selection.
 */
export function getExpansionRanges(
  ast: ASTNode | null,
  tokens: Token[],
  offset: number,
): SelectionRange[] {
  const ranges: SelectionRange[] = [];

  for (const token of tokens) {
    if (
      offset >= token.start &&
      offset <= token.end &&
      EXPANDABLE_TOKEN_TYPES.has(token.type)
    ) {
      ranges.push({ start: token.start, end: token.end });
      break;
    }
  }

  if (ast) collectAncestors(ast, offset, ranges);

  return dedup(ranges);
}

/** Recursively collect nodes whose [start, end] range contains the offset. */
function collectAncestors(node: ASTNode, offset: number, out: SelectionRange[]): void {
  if (node.start == null || node.end == null) return;
  if (offset < node.start || offset > node.end) return;

  switch (node.type) {
    case 'binary':
      collectAncestors(node.left, offset, out);
      collectAncestors(node.right, offset, out);
      break;
    case 'unary':
      collectAncestors(node.operand, offset, out);
      break;
    case 'function':
      for (const arg of node.args) collectAncestors(arg, offset, out);
      break;
    case 'template':
      for (const expr of node.expressions) collectAncestors(expr, offset, out);
      break;
    // leaves: number, string, boolean, column — no recursion
  }

  out.push({ start: node.start, end: node.end });
}

/** Sort by span size ascending (tiebreak on start) and drop duplicate ranges. */
function dedup(ranges: SelectionRange[]): SelectionRange[] {
  ranges.sort((a, b) => {
    const sizeA = a.end - a.start;
    const sizeB = b.end - b.start;
    return sizeA - sizeB || a.start - b.start;
  });

  const result: SelectionRange[] = [];
  for (const r of ranges) {
    const prev = result[result.length - 1];
    if (prev && prev.start === r.start && prev.end === r.end) continue;
    result.push(r);
  }
  return result;
}
