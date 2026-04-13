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
  | FunctionCall;

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

export interface CompileOptions<T> {
  columns: FormulaColumn[];
  get: (row: T, columnName: string) => unknown;
  set: (row: T, columnName: string, value: unknown, referencedColumns: string[]) => void;
  onError?: (error: FormulaError, row?: T) => unknown;
  functions?: Record<string, (...args: unknown[]) => unknown>;
}

export interface CompiledProcessor<T> {
  process(row: T): void;
}
