// ============ Tokens ============

/**
 * Discriminator for every token produced by the tokenizer. Used by the
 * parser to select productions and by the editor to drive syntax highlighting.
 */
export enum TokenType {
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  /** Bare identifier: column ref like `price` or function name like `ROUND`. */
  IDENTIFIER = 'IDENTIFIER',
  /** Bracketed column reference, e.g. `[First Name]` — for names with spaces. */
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
  /** Opening backtick of a template literal. */
  TEMPLATE_START = 'TEMPLATE_START',
  /** Literal text inside a template literal (between interpolations). */
  TEMPLATE_TEXT = 'TEMPLATE_TEXT',
  /** Opening `{` of a template interpolation. */
  TEMPLATE_INTERP_START = 'TEMPLATE_INTERP_START',
  /** Closing `}` of a template interpolation. */
  TEMPLATE_INTERP_END = 'TEMPLATE_INTERP_END',
  /** Closing backtick of a template literal. */
  TEMPLATE_END = 'TEMPLATE_END',
  EOF = 'EOF',
  /** Fault-tolerant tokenizer's placeholder for invalid/partial input. */
  ERROR = 'ERROR',
}

/** A single lexeme emitted by the tokenizer. */
export interface Token {
  /** Lexical category. */
  type: TokenType;
  /** Raw source text for the token. */
  value: string;
  /** Start offset (inclusive) in the source formula. */
  start: number;
  /** End offset (exclusive) in the source formula. */
  end: number;
}

// ============ AST ============

/** Any parsed expression node. Distinguish via the `type` discriminator. */
export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ColumnRef
  | UnaryExpr
  | BinaryExpr
  | FunctionCall
  | TemplateLiteral;

/**
 * Source offsets on AST nodes are populated by the parser. They may be absent
 * when a node is constructed programmatically (e.g. by the
 * `requireTemplateVars` compile-time rewrite in `compiler.ts`).
 */
export interface NumberLiteral {
  type: 'number';
  value: number;
  start?: number;
  end?: number;
}

export interface StringLiteral {
  type: 'string';
  value: string;
  start?: number;
  end?: number;
}

export interface BooleanLiteral {
  type: 'boolean';
  value: boolean;
  start?: number;
  end?: number;
}

/** Reference to a column by name (bare or bracketed in source). */
export interface ColumnRef {
  type: 'column';
  /** Column name as it will be looked up via `CompileOptions.get`. */
  name: string;
  start?: number;
  end?: number;
}

export interface UnaryExpr {
  type: 'unary';
  /** The unary operator, e.g. `-`. */
  operator: string;
  /** The operand expression. */
  operand: ASTNode;
  start?: number;
  end?: number;
}

export interface BinaryExpr {
  type: 'binary';
  /** The operator, e.g. `+`, `*`, `=`, `&`. */
  operator: string;
  left: ASTNode;
  right: ASTNode;
  start?: number;
  end?: number;
}

export interface FunctionCall {
  type: 'function';
  /** Function name as written in source (not upper-cased). */
  name: string;
  /** Evaluated positional arguments. */
  args: ASTNode[];
  start?: number;
  end?: number;
}

/**
 * A backtick-delimited template literal with `{expr}` interpolations, e.g.
 * `` `Hello {name}, total: {ROUND(x,2)}` ``. `parts` and `expressions`
 * interleave: output is `parts[0] + toString(expressions[0]) + parts[1] + …`,
 * with `parts.length === expressions.length + 1`.
 */
export interface TemplateLiteral {
  type: 'template';
  parts: string[];
  expressions: ASTNode[];
  start?: number;
  end?: number;
}

// ============ Errors ============

/** Classifies formula errors surfaced via `CompileOptions.onError`. */
export type FormulaErrorCode =
  | 'CIRCULAR_REFERENCE'
  | 'PARSE_ERROR'
  | 'REFERENCE_ERROR'
  | 'TYPE_ERROR'
  | 'EVAL_ERROR'
  | 'FUNCTION_ERROR';

/**
 * Severity of a `FormulaError`.
 * - `fatal` — compile-time; the column cannot be evaluated at all.
 * - `error` — runtime; evaluation failed for this row.
 * - `warning` — recoverable (e.g. a type coercion warning).
 */
export type FormulaErrorSeverity = 'fatal' | 'error' | 'warning';

/** Error payload passed to `CompileOptions.onError`. */
export interface FormulaError {
  /** Machine-readable error code. */
  code: FormulaErrorCode;
  severity: FormulaErrorSeverity;
  /** Name of the formula column that failed. */
  column: string;
  /** Source formula text for the failing column. */
  formula: string;
  /** Columns referenced by the failing formula. */
  referencedColumns: string[];
  /** Human-readable message. */
  message: string;
  /** Underlying error (when applicable) — e.g. the thrown exception from a custom function. */
  cause?: unknown;
}

/** Thrown by the tokenizer/parser. Carries the offending source range. */
export class FormulaParseError extends Error {
  constructor(
    message: string,
    /** Start offset (inclusive) of the offending source range. */
    public start: number,
    /** End offset (exclusive) of the offending source range. */
    public end: number,
  ) {
    super(message);
    this.name = 'FormulaParseError';
  }
}

/** Thrown during evaluation. The compiler wraps it in a `FormulaError` for `onError`. */
export class FormulaEvalError extends Error {
  constructor(
    /** Error code — also used for the enclosing `FormulaError`. */
    public code: FormulaErrorCode,
    message: string,
    /** Underlying error when this wraps another throwable. */
    public originalCause?: unknown,
  ) {
    super(message);
    this.name = 'FormulaEvalError';
  }
}

// ============ Public API ============

/** A single formula column supplied to `compile`. */
export interface FormulaColumn {
  /** Target column name. Writes go back to this key via `CompileOptions.set`. */
  name: string;
  /** Source formula text, e.g. `'price * (1 + taxRate)'`. */
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
  /**
   * When `true`, every template interpolation is treated as if wrapped in
   * `REQUIRE()` — a blank value (null, undefined, or "") in any interp bails
   * the whole formula to `null`. Wrap a single interp in `OPTIONAL(x)` to
   * opt back into the lenient rendering (blank → "") for that one interp.
   * Explicit `REQUIRE(x)` / `BAIL()` at the top of an interp are left alone.
   * Defaults to `false` (legacy behavior: blanks render as "").
   */
  requireTemplateVars?: boolean;
}

export interface CompiledProcessor<T> {
  /** Evaluates every compiled formula column and writes results back via `set`. */
  process(row: T): void;
}
