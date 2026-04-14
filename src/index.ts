// Core formula engine
export { compile } from './compiler.js';
export { parse } from './parser.js';
export { tokenize, tokenizeSafe } from './tokenizer.js';
export { createBuiltinFunctions } from './functions.js';
export {
  TokenType,
  FormulaEvalError,
  FormulaParseError,
} from './types.js';
export type {
  FormulaColumn,
  CompileOptions,
  CompiledProcessor,
  FormulaError,
  FormulaErrorCode,
  FormulaErrorSeverity,
  ASTNode,
  Token,
} from './types.js';

// Editor UI
export { FormulaEditor } from './editor/components/FormulaEditor.js';
export { getCursorContext } from './editor/autocomplete/cursorContext.js';
export { getSuggestions } from './editor/autocomplete/AutocompleteEngine.js';
export { validateFormula } from './editor/validation/formulaValidator.js';
export { DEFAULT_COLORS, DARK_COLORS, BUILTIN_FUNCTIONS } from './editor/constants.js';
export type {
  ColumnDef,
  FunctionDef,
  FunctionParamDef,
  FormulaColorConfig,
  FormulaStyleConfig,
  CursorContext,
  AutocompleteSuggestion,
  FormulaChangeInfo,
  FormulaEditorHandle,
  FormulaEditorProps,
} from './editor/types.js';
export type { FormulaValidationError } from './editor/validation/formulaValidator.js';
