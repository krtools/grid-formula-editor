import { ASTNode } from './types.js';

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
      // number, string, boolean — no refs
    }
  }

  walk(ast);
  return [...refs];
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
