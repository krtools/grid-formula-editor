import { ColumnDef, FunctionDef, CursorContext, AutocompleteSuggestion } from '../types.js';

/**
 * Produces autocomplete suggestions from a cursor context.
 * Pure function — no DOM or React dependencies.
 */
export function getSuggestions(
  context: CursorContext,
  columns: ColumnDef[],
  functions: FunctionDef[],
): AutocompleteSuggestion[] {
  switch (context.type) {
    case 'column':
      return matchColumnsAndFunctions(context.partial, columns, functions);

    case 'bracket-column':
      return matchColumns(context.partial, columns);

    case 'function':
      return matchFunctions(context.partial, functions);

    case 'expression-start':
    case 'function-arg':
      // Show all columns, then all functions (no partial filter)
      return [
        ...columns.map(columnToSuggestion),
        ...functions.map(functionToSuggestion),
      ];

    case 'none':
      return [];
  }
}

/** Match columns + functions by prefix (case-insensitive). Columns first. */
function matchColumnsAndFunctions(
  partial: string,
  columns: ColumnDef[],
  functions: FunctionDef[],
): AutocompleteSuggestion[] {
  const lower = partial.toLowerCase();

  const matchedColumns = columns
    .filter(c => {
      const name = c.name.toLowerCase();
      const label = (c.label || '').toLowerCase();
      return name.startsWith(lower) || label.startsWith(lower) || name.includes(lower);
    })
    .map(columnToSuggestion);

  const matchedFunctions = functions
    .filter(f => f.name.toLowerCase().startsWith(lower))
    .map(functionToSuggestion);

  return [...matchedColumns, ...matchedFunctions];
}

/** Match columns only by partial (for bracket context). */
function matchColumns(partial: string, columns: ColumnDef[]): AutocompleteSuggestion[] {
  const lower = partial.toLowerCase();
  return columns
    .filter(c => {
      const name = c.name.toLowerCase();
      const label = (c.label || '').toLowerCase();
      return name.startsWith(lower) || label.startsWith(lower) || name.includes(lower);
    })
    .map(c => ({
      type: 'column' as const,
      name: c.name,
      displayName: c.label || c.name,
      description: c.description,
      // Inside brackets — insert just the name (no wrapping brackets, the user already typed [)
      insertText: c.name + ']',
    }));
}

/** Match functions by prefix. */
function matchFunctions(partial: string, functions: FunctionDef[]): AutocompleteSuggestion[] {
  const lower = partial.toLowerCase();
  return functions
    .filter(f => f.name.toLowerCase().startsWith(lower))
    .map(functionToSuggestion);
}

function columnToSuggestion(c: ColumnDef): AutocompleteSuggestion {
  const needsBrackets = /\s/.test(c.name);
  return {
    type: 'column',
    name: c.name,
    displayName: c.label || c.name,
    description: c.description,
    insertText: needsBrackets ? `[${c.name}]` : c.name,
  };
}

function functionToSuggestion(f: FunctionDef): AutocompleteSuggestion {
  return {
    type: 'function',
    name: f.name,
    displayName: f.name,
    description: f.description || f.signature,
    insertText: f.name + '(',
  };
}
