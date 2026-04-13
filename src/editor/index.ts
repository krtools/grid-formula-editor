// Components
export { FormulaEditor } from './components/FormulaEditor.js';

// Pure functions
export { getCursorContext } from './autocomplete/cursorContext.js';
export { getSuggestions } from './autocomplete/AutocompleteEngine.js';

// Constants
export { DEFAULT_COLORS, DARK_COLORS, BUILTIN_FUNCTIONS } from './constants.js';

// Types
export type {
  ColumnDef,
  FunctionDef,
  FormulaColorConfig,
  FormulaStyleConfig,
  CursorContext,
  AutocompleteSuggestion,
  FormulaChangeInfo,
  FormulaEditorHandle,
  FormulaEditorProps,
} from './types.js';
