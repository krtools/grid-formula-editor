// ============ Tokens ============

export enum TokenType {
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  IDENTIFIER = 'IDENTIFIER',
  BRACKET_IDENTIFIER = 'BRACKET_IDENTIFIER',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  CARET = 'CARET',
  AMPERSAND = 'AMPERSAND',
  EQ = 'EQ',
  NEQ = 'NEQ',
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',
  TEMPLATE_START = 'TEMPLATE_START',
  TEMPLATE_TEXT = 'TEMPLATE_TEXT',
  TEMPLATE_INTERP_START = 'TEMPLATE_INTERP_START',
  TEMPLATE_INTERP_END = 'TEMPLATE_INTERP_END',
  TEMPLATE_END = 'TEMPLATE_END',
  EOF = 'EOF',
  ERROR = 'ERROR',
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

// ============ AST ============

export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ColumnRef
  | UnaryExpr
  | BinaryExpr
  | FunctionCall
  | TemplateLiteral;

export interface NumberLiteral {
  type: 'number';
  value: number;
}

export interface StringLiteral {
  type: 'string';
  value: string;
}

export interface BooleanLiteral {
  type: 'boolean';
  value: boolean;
}

export interface ColumnRef {
  type: 'column';
  name: string;
}

export interface UnaryExpr {
  type: 'unary';
  operator: string;
  operand: ASTNode;
}

export interface BinaryExpr {
  type: 'binary';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface FunctionCall {
  type: 'function';
  name: string;
  args: ASTNode[];
}

export interface TemplateLiteral {
  type: 'template';
  parts: string[];
  expressions: ASTNode[];
}

// ============ Errors ============

export type FormulaErrorCode =
  | 'CIRCULAR_REFERENCE'
  | 'PARSE_ERROR'
  | 'REFERENCE_ERROR'
  | 'TYPE_ERROR'
  | 'EVAL_ERROR'
  | 'FUNCTION_ERROR';

export type FormulaErrorSeverity = 'fatal' | 'error' | 'warning';

export interface FormulaError {
  code: FormulaErrorCode;
  severity: FormulaErrorSeverity;
  column: string;
  formula: string;
  referencedColumns: string[];
  message: string;
  cause?: unknown;
}

export class FormulaParseError extends Error {
  constructor(
    message: string,
    public start: number,
    public end: number,
  ) {
    super(message);
    this.name = 'FormulaParseError';
  }
}

export class FormulaEvalError extends Error {
  constructor(
    public code: FormulaErrorCode,
    message: string,
    public originalCause?: unknown,
  ) {
    super(message);
    this.name = 'FormulaEvalError';
  }
}

// ============ Public API ============

export interface FormulaColumn {
  name: string;
  formula: string;
}

/**
 * Context passed as the first argument to every registered function call.
 * Gives the function access to the row and current formula column at
 * evaluation time — useful for functions whose result depends on row state
 * beyond their explicit arguments.
 */
export interface FunctionContext<T = unknown> {
  /** The row currently being processed. */
  row: T;
  /** The name of the formula column currently being evaluated. */
  column: string;
}

/**
 * Signature for functions registered via `CompileOptions.functions`.
 * The first argument is always a `FunctionContext`; subsequent arguments are
 * the evaluated call arguments as passed in the formula.
 */
export type CompiledFormulaFunction<T = unknown> = (
  ctx: FunctionContext<T>,
  ...args: unknown[]
) => unknown;

export interface CompileOptions<T> {
  /** The formula columns to compile. */
  columns: FormulaColumn[];
  /** Reads the value of `columnName` from `row`. Called for every column reference. */
  get: (row: T, columnName: string) => unknown;
  /**
   * Writes the computed `value` back onto `row` under `columnName`.
   * `referencedColumns` is the list of columns the formula referenced —
   * useful for invalidation or dependency tracking.
   */
  set: (row: T, columnName: string, value: unknown, referencedColumns: string[]) => void;
  /**
   * Called when a formula fails to compile or evaluate. Optional return value
   * is used as the column's value when recoverable (non-fatal) errors occur.
   * When omitted, fatal errors throw and runtime errors produce no value.
   */
  onError?: (error: FormulaError, row?: T) => unknown;
  /**
   * User-registered functions, callable from formulas by name (case-insensitive).
   * Each function receives a `FunctionContext` as its first argument, followed
   * by the evaluated arguments. Custom functions with the same name as a
   * built-in override it.
   */
  functions?: Record<string, CompiledFormulaFunction<T>>;
}

export interface CompiledProcessor<T> {
  /** Evaluates every compiled formula column and writes results back via `set`. */
  process(row: T): void;
}
