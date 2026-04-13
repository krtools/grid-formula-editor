import { FormulaColorConfig, FormulaStyleConfig, FunctionDef } from './types.js';

/** Default color palette for light backgrounds (VS Code-inspired). */
export const DEFAULT_COLORS: Required<FormulaColorConfig> = {
  number: '#098658',
  string: '#a31515',
  boolean: '#0000ff',
  column: '#001080',
  bracketColumn: '#001080',
  functionName: '#795e26',
  operator: '#000000',
  paren: '#656d76',
  error: '#cf222e',
  background: '#ffffff',
  text: '#1f2328',
  placeholder: '#656d76',
  cursor: '#1f2328',
  dropdownSelected: '#0969da',
  dropdownHover: '#f6f8fa',
};

/** Dark mode color palette (VS Code Dark-inspired). */
export const DARK_COLORS: Required<FormulaColorConfig> = {
  number: '#b5cea8',
  string: '#ce9178',
  boolean: '#569cd6',
  column: '#9cdcfe',
  bracketColumn: '#9cdcfe',
  functionName: '#dcdcaa',
  operator: '#d4d4d4',
  paren: '#8b949e',
  error: '#f85149',
  background: '#1e1e1e',
  text: '#d4d4d4',
  placeholder: '#6a737d',
  cursor: '#d4d4d4',
  dropdownSelected: '#04395e',
  dropdownHover: '#2a2d2e',
};

/** Default layout/structural styles. */
export const DEFAULT_STYLES: Required<FormulaStyleConfig> = {
  fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
  fontSize: '14px',
  lineHeight: '1.5',

  editorMinHeight: '36px',
  editorPadding: '6px 10px',
  editorBorderWidth: '1px',
  editorBorderColor: '#d0d7de',
  editorBorderRadius: '6px',
  editorFocusBorderColor: '#0969da',
  editorFocusShadow: '0 0 0 3px rgba(9, 105, 218, 0.3)',

  dropdownBorderColor: '#d0d7de',
  dropdownBorderRadius: '6px',
  dropdownShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  dropdownMaxHeight: '240px',
  dropdownMinWidth: '200px',
  dropdownMaxWidth: '380px',
  dropdownZIndex: 99999,
  dropdownItemPadding: '5px 10px',
  dropdownItemFontSize: '13px',
  dropdownItemContentGap: '8px',

  typeBadgeBg: '#eef1f5',
  typeBadgeSelectedBg: 'rgba(255,255,255,0.2)',
  typeBadgeColor: '#656d76',
  typeBadgeSelectedColor: '#ffffff',
};

/** Built-in function definitions for autocomplete. */
export const BUILTIN_FUNCTIONS: FunctionDef[] = [
  // Math
  { name: 'ROUND', description: 'Round to N decimal places', signature: 'ROUND(value, decimals)' },
  { name: 'FLOOR', description: 'Round down to integer', signature: 'FLOOR(value)' },
  { name: 'CEIL', description: 'Round up to integer', signature: 'CEIL(value)' },
  { name: 'ABS', description: 'Absolute value', signature: 'ABS(value)' },
  { name: 'MIN', description: 'Smallest of the arguments', signature: 'MIN(a, b, ...)' },
  { name: 'MAX', description: 'Largest of the arguments', signature: 'MAX(a, b, ...)' },
  { name: 'MOD', description: 'Remainder after division', signature: 'MOD(value, divisor)' },
  { name: 'POWER', description: 'Raise to a power', signature: 'POWER(base, exponent)' },
  { name: 'SQRT', description: 'Square root', signature: 'SQRT(value)' },

  // String
  { name: 'CONCAT', description: 'Join text values', signature: 'CONCAT(a, b, ...)' },
  { name: 'LEFT', description: 'First N characters', signature: 'LEFT(text, count)' },
  { name: 'RIGHT', description: 'Last N characters', signature: 'RIGHT(text, count)' },
  { name: 'MID', description: 'Substring from position', signature: 'MID(text, start, count)' },
  { name: 'LEN', description: 'Text length', signature: 'LEN(text)' },
  { name: 'TRIM', description: 'Remove leading/trailing spaces', signature: 'TRIM(text)' },
  { name: 'UPPER', description: 'Convert to uppercase', signature: 'UPPER(text)' },
  { name: 'LOWER', description: 'Convert to lowercase', signature: 'LOWER(text)' },
  { name: 'SUBSTITUTE', description: 'Replace occurrences of text', signature: 'SUBSTITUTE(text, old, new)' },

  // URL
  { name: 'URLENCODE', description: 'URL-encode text', signature: 'URLENCODE(text)' },
  { name: 'URLDECODE', description: 'URL-decode text', signature: 'URLDECODE(text)' },

  // Logical
  { name: 'IF', description: 'Conditional value', signature: 'IF(condition, then, else)' },
  { name: 'AND', description: 'True if all are true', signature: 'AND(a, b, ...)' },
  { name: 'OR', description: 'True if any is true', signature: 'OR(a, b, ...)' },
  { name: 'NOT', description: 'Negate a boolean', signature: 'NOT(value)' },
  { name: 'IFERROR', description: 'Fallback on error', signature: 'IFERROR(value, fallback)' },

  // Type / Utility
  { name: 'ISNUMBER', description: 'True if value is numeric', signature: 'ISNUMBER(value)' },
  { name: 'ISBLANK', description: 'True if value is empty', signature: 'ISBLANK(value)' },
  { name: 'VALUE', description: 'Convert text to number', signature: 'VALUE(text)' },
  { name: 'TEXT', description: 'Convert to text', signature: 'TEXT(value)' },
  { name: 'COALESCE', description: 'First non-null value', signature: 'COALESCE(a, b, ...)' },
];
