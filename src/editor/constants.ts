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
  {
    name: 'ROUND', description: 'Round to N decimal places', signature: 'ROUND(value, decimals)',
    parameters: [
      { name: 'value', type: 'number', description: 'The number to round' },
      { name: 'decimals', type: 'number', description: 'Number of decimal places', optional: true },
    ],
  },
  {
    name: 'FLOOR', description: 'Round down to integer', signature: 'FLOOR(value)',
    parameters: [{ name: 'value', type: 'number', description: 'The number to round down' }],
  },
  {
    name: 'CEIL', description: 'Round up to integer', signature: 'CEIL(value)',
    parameters: [{ name: 'value', type: 'number', description: 'The number to round up' }],
  },
  {
    name: 'ABS', description: 'Absolute value', signature: 'ABS(value)',
    parameters: [{ name: 'value', type: 'number', description: 'The number' }],
  },
  {
    name: 'MIN', description: 'Smallest of the arguments', signature: 'MIN(a, b, ...)',
    parameters: [{ name: 'values', type: 'number', description: 'Numbers to compare', rest: true }],
  },
  {
    name: 'MAX', description: 'Largest of the arguments', signature: 'MAX(a, b, ...)',
    parameters: [{ name: 'values', type: 'number', description: 'Numbers to compare', rest: true }],
  },
  {
    name: 'MOD', description: 'Remainder after division', signature: 'MOD(value, divisor)',
    parameters: [
      { name: 'value', type: 'number', description: 'The dividend' },
      { name: 'divisor', type: 'number', description: 'The divisor' },
    ],
  },
  {
    name: 'POWER', description: 'Raise to a power', signature: 'POWER(base, exponent)',
    parameters: [
      { name: 'base', type: 'number', description: 'The base number' },
      { name: 'exponent', type: 'number', description: 'The exponent' },
    ],
  },
  {
    name: 'SQRT', description: 'Square root', signature: 'SQRT(value)',
    parameters: [{ name: 'value', type: 'number', description: 'The number' }],
  },

  // String
  {
    name: 'CONCAT', description: 'Join text values', signature: 'CONCAT(a, b, ...)',
    parameters: [{ name: 'values', type: 'string', description: 'Text values to join', rest: true }],
  },
  {
    name: 'LEFT', description: 'First N characters', signature: 'LEFT(text, count)',
    parameters: [
      { name: 'text', type: 'string', description: 'The source text' },
      { name: 'count', type: 'number', description: 'Number of characters' },
    ],
  },
  {
    name: 'RIGHT', description: 'Last N characters', signature: 'RIGHT(text, count)',
    parameters: [
      { name: 'text', type: 'string', description: 'The source text' },
      { name: 'count', type: 'number', description: 'Number of characters' },
    ],
  },
  {
    name: 'MID', description: 'Substring from position', signature: 'MID(text, start, count)',
    parameters: [
      { name: 'text', type: 'string', description: 'The source text' },
      { name: 'start', type: 'number', description: 'Start position (1-based)' },
      { name: 'count', type: 'number', description: 'Number of characters' },
    ],
  },
  {
    name: 'LEN', description: 'Text length', signature: 'LEN(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to measure' }],
  },
  {
    name: 'TRIM', description: 'Remove leading/trailing spaces', signature: 'TRIM(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to trim' }],
  },
  {
    name: 'UPPER', description: 'Convert to uppercase', signature: 'UPPER(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to convert' }],
  },
  {
    name: 'LOWER', description: 'Convert to lowercase', signature: 'LOWER(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to convert' }],
  },
  {
    name: 'SUBSTITUTE', description: 'Replace occurrences of text', signature: 'SUBSTITUTE(text, old, new)',
    parameters: [
      { name: 'text', type: 'string', description: 'The source text' },
      { name: 'old', type: 'string', description: 'Text to find' },
      { name: 'new', type: 'string', description: 'Replacement text' },
    ],
  },

  // URL
  {
    name: 'URLENCODE', description: 'URL-encode text', signature: 'URLENCODE(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to encode' }],
  },
  {
    name: 'URLDECODE', description: 'URL-decode text', signature: 'URLDECODE(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to decode' }],
  },

  // Logical
  {
    name: 'IF', description: 'Conditional value', signature: 'IF(condition, then, else)',
    parameters: [
      { name: 'condition', type: 'boolean', description: 'The condition to test' },
      { name: 'then', type: 'any', description: 'Value if true' },
      { name: 'else', type: 'any', description: 'Value if false' },
    ],
  },
  {
    name: 'AND', description: 'True if all are true', signature: 'AND(a, b, ...)',
    parameters: [{ name: 'values', type: 'boolean', description: 'Boolean values to test', rest: true }],
  },
  {
    name: 'OR', description: 'True if any is true', signature: 'OR(a, b, ...)',
    parameters: [{ name: 'values', type: 'boolean', description: 'Boolean values to test', rest: true }],
  },
  {
    name: 'NOT', description: 'Negate a boolean', signature: 'NOT(value)',
    parameters: [{ name: 'value', type: 'boolean', description: 'The value to negate' }],
  },
  {
    name: 'IFERROR', description: 'Fallback on error', signature: 'IFERROR(value, fallback)',
    parameters: [
      { name: 'value', type: 'any', description: 'The expression to try' },
      { name: 'fallback', type: 'any', description: 'Value if error occurs' },
    ],
  },

  // Type / Utility
  {
    name: 'ISNUMBER', description: 'True if value is numeric', signature: 'ISNUMBER(value)',
    parameters: [{ name: 'value', type: 'any', description: 'The value to test' }],
  },
  {
    name: 'ISBLANK', description: 'True if value is empty', signature: 'ISBLANK(value)',
    parameters: [{ name: 'value', type: 'any', description: 'The value to test' }],
  },
  {
    name: 'VALUE', description: 'Convert text to number', signature: 'VALUE(text)',
    parameters: [{ name: 'text', type: 'string', description: 'The text to convert' }],
  },
  {
    name: 'TEXT', description: 'Convert to text', signature: 'TEXT(value)',
    parameters: [{ name: 'value', type: 'any', description: 'The value to convert' }],
  },
  {
    name: 'COALESCE', description: 'First non-null value', signature: 'COALESCE(a, b, ...)',
    parameters: [{ name: 'values', type: 'any', description: 'Values to check', rest: true }],
  },
  {
    name: 'BAIL', description: 'Force the whole formula to empty (uncatchable)', signature: 'BAIL()',
    parameters: [],
  },
  {
    name: 'REQUIRE', description: 'Return value, or bail the whole formula if blank', signature: 'REQUIRE(value)',
    parameters: [{ name: 'value', type: 'any', description: 'Value that must be non-blank' }],
  },
  {
    name: 'OPTIONAL', description: 'Identity; marks a template interpolation as allowed-to-be-blank under requireTemplateVars', signature: 'OPTIONAL(value)',
    parameters: [{ name: 'value', type: 'any', description: 'Value that may be blank' }],
  },
  {
    name: 'SELF', description: "This column's pre-formula input value (alias for referencing the column by its own name)", signature: 'SELF()',
    parameters: [],
  },
];
