import { parse } from './parser.js';
import { ASTNode } from './types.js';

/**
 * Returns the de-duplicated list of column names referenced by `formula`.
 * Convenience around `parse(formula)` + {@link extractColumnRefs}. Throws
 * `FormulaParseError` on invalid syntax — wrap in a try/catch if you want
 * lenient behavior.
 *
 * Order matches first-appearance in the AST walk; callers that need a
 * stable order should sort the result themselves.
 */
export function getReferencedColumns(formula: string): string[] {
  return extractColumnRefs(parse(formula));
}

export function extractColumnRefs(ast: ASTNode): string[] {
  const refs = new Set<string>();

  function walk(node: ASTNode): void {
    switch (node.type) {
      case 'column':
        refs.add(node.name);
        break;
      case 'binary':
        walk(node.left);
        walk(node.right);
        break;
      case 'unary':
        walk(node.operand);
        break;
      case 'function':
        for (const arg of node.args) walk(arg);
        break;
      case 'template':
        for (const expr of node.expressions) walk(expr);
        break;
      // number, string, boolean — no refs
    }
  }

  walk(ast);
  return [...refs];
}

const BARE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Returns `name` formatted for embedding in a formula's source. Emits the
 * bare identifier when it matches the tokenizer's bare-identifier rule and
 * isn't the reserved boolean `TRUE`/`FALSE`; otherwise wraps in brackets.
 *
 * Throws when the name is empty or contains `]`, since the bracket form
 * has no escape for the closing bracket and the result wouldn't round-trip.
 */
function formatColumnName(name: string): string {
  if (name === '') {
    throw new Error('Column name cannot be empty');
  }
  if (name.includes(']')) {
    throw new Error(
      `Column name cannot contain ']': ${JSON.stringify(name)}`,
    );
  }
  if (BARE_IDENTIFIER_PATTERN.test(name)) {
    const upper = name.toUpperCase();
    if (upper !== 'TRUE' && upper !== 'FALSE') {
      return name;
    }
  }
  return `[${name}]`;
}

/**
 * Rewrites a formula's column references using `mapping` (old → new) and
 * returns the new formula source. Whitespace, operator spacing, comments,
 * and any text that isn't a renamed column ref is preserved verbatim
 * (the rewrite is string splicing against parser-emitted source offsets).
 *
 * The rewrite is a single pass over the original AST, so chained renames
 * are not applied — given `{ a: 'b', b: 'c' }`, the formula `a + b`
 * becomes `b + c`, not `c + c`.
 *
 * Function names are never touched — `ROUND(price, 2)` with
 * `{ ROUND: 'X' }` is unchanged. Only `ColumnRef` nodes are rewritten.
 *
 * If the new name isn't a bare-safe identifier (contains spaces / special
 * chars, starts with a digit, or is `TRUE`/`FALSE`), it's emitted as a
 * bracket identifier. New names containing `]` or empty strings throw —
 * neither is representable in formula source.
 *
 * Throws `FormulaParseError` when the input formula is invalid. Wrap in
 * try/catch for lenient handling.
 */
export function renameReferencedColumns(
  formula: string,
  mapping: Record<string, string>,
): string {
  if (Object.keys(mapping).length === 0) return formula;

  const ast = parse(formula);

  interface RefEdit {
    start: number;
    end: number;
    replacement: string;
  }
  const edits: RefEdit[] = [];

  function walk(node: ASTNode): void {
    switch (node.type) {
      case 'column': {
        const next = mapping[node.name];
        if (
          next !== undefined &&
          next !== node.name &&
          node.start !== undefined &&
          node.end !== undefined
        ) {
          edits.push({
            start: node.start,
            end: node.end,
            replacement: formatColumnName(next),
          });
        }
        break;
      }
      case 'binary':
        walk(node.left);
        walk(node.right);
        break;
      case 'unary':
        walk(node.operand);
        break;
      case 'function':
        for (const arg of node.args) walk(arg);
        break;
      case 'template':
        for (const expr of node.expressions) walk(expr);
        break;
      // number, string, boolean — no refs
    }
  }
  walk(ast);

  if (edits.length === 0) return formula;

  // Splice right-to-left so earlier offsets stay valid as we mutate.
  edits.sort((a, b) => b.start - a.start);
  let out = formula;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}

export interface DependencyResult {
  sorted: string[];
  cycles: string[][];
}

/**
 * Topologically sorts formula columns by their inter-formula dependencies.
 * Returns the sorted order and any detected cycles.
 *
 * @param graph  Map of formula column name → formula column names it depends on
 */
export function resolveDependencies(
  graph: Map<string, string[]>,
): DependencyResult {
  const sorted: string[] = [];
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string, path: string[]): void {
    if (visited.has(name)) return;

    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), name]);
      }
      return;
    }

    // Not a formula column — always available (data column)
    if (!graph.has(name)) {
      visited.add(name);
      return;
    }

    visiting.add(name);
    for (const dep of graph.get(name)!) {
      visit(dep, [...path, name]);
    }
    visiting.delete(name);
    visited.add(name);
    sorted.push(name);
  }

  for (const name of graph.keys()) {
    if (!visited.has(name)) {
      visit(name, []);
    }
  }

  return { sorted, cycles };
}
