import * as React from 'react';
import { ASTNode, Token, FormulaParseError } from '../types.js';

/** Column definition for autocomplete suggestions. */
export interface ColumnDef {
  /** Column name as used in formulas (e.g. "price", "First Name"). */
  name: string;
  /** Display label in autocomplete dropdown. Falls back to `name`. */
  label?: string;
  /** Description shown alongside the column in autocomplete. */
  description?: string;
}

/** Parameter definition for a function. */
export interface FunctionParamDef {
  /** Parameter name. */
  name: string;
  /** Type hint (e.g. 'number', 'string', 'boolean', 'any'). */
  type?: string;
  /** Description of this parameter. */
  description?: string;
  /** Whether the parameter is optional. */
  optional?: boolean;
  /** Whether this is a variadic rest parameter (e.g. CONCAT(...values)). */
  rest?: boolean;
}

/** Function definition for autocomplete suggestions. */
export interface FunctionDef {
  /** Function name (e.g. "ROUND", "IF"). */
  name: string;
  /** Description shown in autocomplete (e.g. "Rounds a number to N decimals"). */
  description?: string;
  /** Signature hint (e.g. "ROUND(value, decimals)"). */
  signature?: string;
  /** Parameter definitions for signature hints. */
  parameters?: FunctionParamDef[];
}

/**
 * Color overrides for syntax highlighting and UI elements.
 * All values are CSS color strings. Omitted keys fall back to `DEFAULT_COLORS`.
 */
export interface FormulaColorConfig {
  /** Number literals. */
  number?: string;
  /** String literals (quoted values). */
  string?: string;
  /** Boolean literals (TRUE, FALSE). */
  boolean?: string;
  /** Column references (bare identifiers). */
  column?: string;
  /** Bracket column references ([First Name]). */
  bracketColumn?: string;
  /** Function names (ROUND, IF). */
  functionName?: string;
  /** Arithmetic and comparison operators (+, -, *, /, =, etc.). */
  operator?: string;
  /** Parentheses and commas. */
  paren?: string;
  /** Error tokens (invalid characters). */
  error?: string;
  /** Background color for the editor and dropdown. */
  background?: string;
  /** Default text color. */
  text?: string;
  /** Placeholder text color. */
  placeholder?: string;
  /** Cursor (caret) color. */
  cursor?: string;
  /** Background of the selected dropdown item. */
  dropdownSelected?: string;
  /** Background of hovered dropdown items. */
  dropdownHover?: string;
}

/**
 * Structural style overrides for the editor and dropdown.
 * All string values are CSS values. Omitted keys fall back to defaults.
 */
export interface FormulaStyleConfig {
  /** Font family for input and dropdown. */
  fontFamily?: string;
  /** Base font size for the editor. */
  fontSize?: string;
  /** Line height for the editor. */
  lineHeight?: string;
  /** Minimum height of the editor. */
  editorMinHeight?: string;
  /** Padding inside the editor. */
  editorPadding?: string;
  /** Border width of the editor. */
  editorBorderWidth?: string;
  /** Border color (unfocused). */
  editorBorderColor?: string;
  /** Border radius. */
  editorBorderRadius?: string;
  /** Border color when focused. */
  editorFocusBorderColor?: string;
  /** Box shadow when focused. */
  editorFocusShadow?: string;
  /** Dropdown border color. */
  dropdownBorderColor?: string;
  /** Dropdown border radius. */
  dropdownBorderRadius?: string;
  /** Dropdown box shadow. */
  dropdownShadow?: string;
  /** Dropdown max height before scrolling. */
  dropdownMaxHeight?: string;
  /** Dropdown minimum width. */
  dropdownMinWidth?: string;
  /** Dropdown maximum width. */
  dropdownMaxWidth?: string;
  /** CSS z-index for the dropdown portal. */
  dropdownZIndex?: number;
  /** Padding for dropdown items. */
  dropdownItemPadding?: string;
  /** Font size for dropdown items. */
  dropdownItemFontSize?: string;
  /** Gap between elements inside a dropdown item. */
  dropdownItemContentGap?: string;
  /** Background for type badges (unselected). */
  typeBadgeBg?: string;
  /** Background for type badges (selected). */
  typeBadgeSelectedBg?: string;
  /** Text color for type badges (unselected). */
  typeBadgeColor?: string;
  /** Text color for type badges (selected). */
  typeBadgeSelectedColor?: string;
}

/**
 * Cursor context — describes what the user is typing at the cursor position.
 * Used by the autocomplete engine to determine which suggestions to show.
 */
export type CursorContext =
  | { type: 'column'; partial: string; start: number }
  | { type: 'bracket-column'; partial: string; start: number }
  | { type: 'function'; partial: string; start: number }
  | { type: 'function-arg'; functionName: string; argIndex: number }
  | { type: 'expression-start' }
  | { type: 'none' };

/** A single autocomplete suggestion. */
export interface AutocompleteSuggestion {
  /** 'column' or 'function'. */
  type: 'column' | 'function';
  /** Internal name (column name or function name). */
  name: string;
  /** Display name in the dropdown. */
  displayName: string;
  /** Description shown beside the name. */
  description?: string;
  /** Text to insert when this suggestion is accepted. */
  insertText: string;
}

/** Info passed to the onChange callback alongside the formula string. */
export interface FormulaChangeInfo {
  /** Parsed AST, or null if the formula has errors. */
  ast: ASTNode | null;
  /** Parse error, if any. */
  error: FormulaParseError | null;
  /** Tokens from fault-tolerant tokenization. */
  tokens: Token[];
}

/** Imperative handle for programmatic control of the FormulaEditor. */
export interface FormulaEditorHandle {
  /** Returns the current formula string. */
  getValue: () => string;
  /** Programmatically sets the formula. */
  setValue: (value: string) => void;
  /** Focuses the editor. */
  focus: () => void;
  /** Blurs the editor. */
  blur: () => void;
  /** Returns the underlying contentEditable DOM element. */
  getElement: () => HTMLDivElement | null;
}

/**
 * Props for the FormulaEditor component.
 */
export interface FormulaEditorProps {
  /** Controlled value. When provided, the editor reflects this value. */
  value?: string;
  /** Initial value for uncontrolled usage. Ignored if `value` is provided. */
  defaultValue?: string;
  /** Called on every input change with the formula string and parse info. */
  onChange?: (formula: string, info: FormulaChangeInfo) => void;
  /** Column definitions for autocomplete. */
  columns?: ColumnDef[];
  /** Function definitions for autocomplete. When omitted, built-in functions are used. */
  functions?: FunctionDef[];
  /** Color overrides for syntax highlighting. Merged with DEFAULT_COLORS. */
  colors?: FormulaColorConfig;
  /** Style overrides for layout. Merged with defaults. */
  styles?: FormulaStyleConfig;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /** Whether the editor is disabled (no interaction). */
  disabled?: boolean;
  /** Whether the editor is read-only (selectable but not editable). */
  readOnly?: boolean;
  /** CSS class name applied to the outer container. */
  className?: string;
  /** Inline styles applied to the outer container. */
  style?: React.CSSProperties;
  /** Called when the editor gains focus. */
  onFocus?: () => void;
  /** Called when the editor loses focus. */
  onBlur?: () => void;
}
