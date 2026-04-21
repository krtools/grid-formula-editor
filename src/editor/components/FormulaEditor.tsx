import * as React from 'react';
import { flushSync } from 'react-dom';
import { tokenizeSafe } from '../../tokenizer.js';
import { parse } from '../../parser.js';
import { Token, TokenType, ASTNode, FormulaParseError } from '../../types.js';
import {
  FormulaEditorProps,
  FormulaEditorHandle,
  FormulaChangeInfo,
  AutocompleteSuggestion,
  CursorContext,
  FunctionDef,
} from '../types.js';
import { BUILTIN_FUNCTIONS } from '../constants.js';
import {
  mergeColors,
  mergeStyles,
  getContainerStyle,
  getEditorStyle,
  getEditorFocusStyle,
  getPlaceholderStyle,
} from '../styles/inlineStyles.js';
import { getCursorContext } from '../autocomplete/cursorContext.js';
import { getSuggestions } from '../autocomplete/AutocompleteEngine.js';
import { getCursorOffset, setCursorOffset, getSelectionRange, setSelectionRange } from '../utils/cursor.js';
import { getExpansionRanges, SelectionRange } from '../utils/expandSelection.js';
import { UndoStack } from '../utils/undoStack.js';
import { validateFormula, FormulaValidationError } from '../validation/formulaValidator.js';
import { buildHighlightedHTML } from './HighlightedContent.js';
import { AutocompleteDropdown } from './AutocompleteDropdown.js';
import { ValidationSquiggles } from './ValidationSquiggles.js';
import { MatchingParens } from './MatchingParens.js';
import { FunctionTooltip } from './FunctionTooltip.js';

const HOVER_TOOLTIP_DELAY_MS = 400;

const WRAP_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

// Walks tokens up to the cursor and classifies the template context:
//   0 = outside any template literal
//   1 = inside template text (between `` ` `` or `}` and `{` or `` ` ``)
//   2 = inside a template interpolation's expression space
// `{` auto-pair only makes sense in state 1 — in state 2 we're in expression
// grammar (possibly inside a nested string literal) where `{` is a plain
// character. `}` step-over only makes sense in state 2, closing the interp.
function templateStateAt(formula: string, cursor: number): 0 | 1 | 2 {
  const { tokens } = tokenizeSafe(formula);
  let state: 0 | 1 | 2 = 0;
  for (const t of tokens) {
    if (t.end > cursor) break;
    if (t.type === TokenType.TEMPLATE_START) state = 1;
    else if (t.type === TokenType.TEMPLATE_END) state = 0;
    else if (t.type === TokenType.TEMPLATE_INTERP_START) state = 2;
    else if (t.type === TokenType.TEMPLATE_INTERP_END) state = 1;
  }
  return state;
}

/**
 * FormulaEditor — a contentEditable React component with syntax highlighting,
 * real-time parse validation, and autocomplete for column/function names.
 */
export const FormulaEditor = React.forwardRef<FormulaEditorHandle, FormulaEditorProps>(
  function FormulaEditor(props, ref) {
    const {
      value: controlledValue,
      defaultValue,
      onChange,
      columns = [],
      functions,
      colors: colorsProp,
      styles: stylesProp,
      placeholder,
      disabled = false,
      readOnly = false,
      className,
      style,
      onFocus,
      onBlur,
      reopenDropdownOnClick = false,
    } = props;

    const isControlled = controlledValue !== undefined;
    const editorRef = React.useRef<HTMLDivElement>(null);
    const initialFormula = isControlled ? controlledValue : (defaultValue || '');
    const [internalValue, setInternalValue] = React.useState(defaultValue || '');
    const [isFocused, setIsFocused] = React.useState(false);
    const [tokens, setTokens] = React.useState<Token[]>(() => tokenizeSafe(initialFormula).tokens);
    const [parseError, setParseError] = React.useState<FormulaParseError | null>(null);
    const [suggestions, setSuggestions] = React.useState<AutocompleteSuggestion[]>([]);
    const [selectedIndex, setSelectedIndex] = React.useState(-1);
    const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number } | null>(null);
    const [showDropdown, setShowDropdown] = React.useState(false);
    const cursorContextRef = React.useRef<CursorContext>({ type: 'none' });
    const pendingCursorRef = React.useRef<number | null>(null);
    const pendingSelectionRef = React.useRef<{ start: number; end: number } | null>(null);
    const undoStackRef = React.useRef(new UndoStack());
    const typingGroupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    // True when the most recent input was a structural char (operator, paren,
    // quote, auto-wrap, etc.) rather than a filter-extending char. Used to
    // suppress dropdown auto-select — a fresh `(` or `+` shouldn't highlight
    // a random suggestion just because the token under the caret happens to
    // match one.
    const suppressAutoSelectRef = React.useRef(false);
    const [validationErrors, setValidationErrors] = React.useState<FormulaValidationError[]>([]);
    const [cursorOffset, setCursorOffsetState] = React.useState(0);
    const [hoveredFunction, setHoveredFunction] = React.useState<{
      def: FunctionDef;
      rect: DOMRect;
    } | null>(null);
    const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverTargetRef = React.useRef<HTMLElement | null>(null);
    // Focus state at the start of a mousedown — used by the click handler
    // to tell "click to focus" (do nothing) from "click while already focused"
    // (re-open the dropdown if appropriate).
    const wasFocusedAtMouseDownRef = React.useRef(false);
    // Alt+Shift+Arrow selection ladder. Built lazily on first expand press from
    // the caret position; preserved across consecutive expand/shrink presses;
    // cleared by any other keypress. `level === -1` means "not yet on the ladder"
    // (caret state), level >= 0 indexes into `ranges`.
    const expandSelRef = React.useRef<{ ranges: SelectionRange[]; level: number } | null>(null);

    const formulaValue = isControlled ? controlledValue : internalValue;
    const mergedColors = React.useMemo(() => mergeColors(colorsProp), [colorsProp]);
    const mergedStyles = React.useMemo(() => mergeStyles(stylesProp), [stylesProp]);
    const functionDefs = functions || BUILTIN_FUNCTIONS;

    // Build known function/column sets for validation
    const knownFunctions = React.useMemo(() => {
      const set = new Set<string>();
      for (const f of functionDefs) set.add(f.name.toUpperCase());
      return set;
    }, [functionDefs]);

    const knownColumns = React.useMemo(() => {
      if (columns.length === 0) return undefined; // no columns defined → skip column validation
      const set = new Set<string>();
      for (const c of columns) set.add(c.name);
      return set;
    }, [columns]);

    // Imperative handle
    React.useImperativeHandle(ref, () => ({
      getValue: () => formulaValue,
      setValue: (v: string) => {
        // flushSync so consumers can call getValue() synchronously after
        // setValue() — otherwise React 18 batches the state update and the
        // next read returns the stale closure value.
        if (!isControlled) {
          flushSync(() => setInternalValue(v));
        }
        processFormula(v, 0);
      },
      focus: () => editorRef.current?.focus(),
      blur: () => editorRef.current?.blur(),
      getElement: () => editorRef.current,
      isDropdownOpen: () => showDropdown,
      getSelectedSuggestion: () =>
        showDropdown && selectedIndex >= 0 ? suggestions[selectedIndex] ?? null : null,
    }));

    // Tokenize + parse on value change
    const processFormula = React.useCallback(
      (formula: string, cursorPos: number) => {
        const { tokens: newTokens, error: tokenError } = tokenizeSafe(formula);
        setTokens(newTokens);

        let ast: ASTNode | null = null;
        let error: FormulaParseError | null = tokenError;
        if (!tokenError && formula.trim().length > 0) {
          try {
            ast = parse(formula);
          } catch (e) {
            if (e instanceof FormulaParseError) {
              error = e;
            }
          }
        }
        setParseError(error);

        // Validation (squiggles)
        const valErrors = validateFormula(newTokens, error, knownFunctions, knownColumns);
        setValidationErrors(valErrors);
        setCursorOffsetState(cursorPos);

        // Autocomplete
        const ctx = getCursorContext(formula, cursorPos);
        cursorContextRef.current = ctx;
        const suggs = getSuggestions(ctx, columns, functionDefs);
        setSuggestions(suggs);
        // Auto-select the first item only when the user has typed a filter
        // (column/function/bracket-column partial) AND the most recent input
        // was a filter-extending char. Fresh dropdowns or ones triggered by
        // structural chars (operators, parens, quotes, auto-wrap) require
        // ArrowDown first so Enter/Tab can't insert a random match.
        const hasPartial = ctx.type === 'column' || ctx.type === 'function' || ctx.type === 'bracket-column';
        const shouldAutoSelect = suggs.length > 0 && hasPartial && !suppressAutoSelectRef.current;
        setSelectedIndex(shouldAutoSelect ? 0 : -1);
        suppressAutoSelectRef.current = false;

        // Show dropdown for suggestions or function-arg signature hints
        const hasSignatureHint = ctx.type === 'function-arg' &&
          functionDefs.some(f => f.name.toUpperCase() === ctx.functionName.toUpperCase() && f.parameters && f.parameters.length > 0);
        setShowDropdown((suggs.length > 0 || hasSignatureHint) && isFocused);

        // Position dropdown
        if (editorRef.current && (suggs.length > 0 || hasSignatureHint)) {
          updateDropdownPosition();
        }

        const info: FormulaChangeInfo = { ast, error, tokens: newTokens };
        onChange?.(formula, info);
      },
      [columns, functionDefs, onChange, isFocused, knownFunctions, knownColumns],
    );

    // Initial tokenization + undo stack seed
    React.useEffect(() => {
      undoStackRef.current.push({ value: formulaValue, cursorPos: formulaValue.length });
      processFormula(formulaValue, 0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Track caret moves (clicks, arrow keys) so the matching-paren highlight
    // follows and — if the dropdown is open — dismiss it when the caret lands
    // in a position with no suggestions or signature hint (e.g. inside plain
    // template text). Typing paths don't need this: processFormula already
    // reconciles dropdown visibility on every input.
    React.useEffect(() => {
      if (!isFocused) return;
      const handler = () => {
        const el = editorRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!el.contains(sel.anchorNode)) return;
        const pos = getCursorOffset(el);
        setCursorOffsetState(pos);

        setShowDropdown(current => {
          if (!current) return current;
          const formula = el.textContent || '';
          const ctx = getCursorContext(formula, pos);
          const hasSuggs = getSuggestions(ctx, columns, functionDefs).length > 0;
          const hasSignatureHint =
            ctx.type === 'function-arg' &&
            functionDefs.some(
              f =>
                f.name.toUpperCase() === ctx.functionName.toUpperCase() &&
                f.parameters &&
                f.parameters.length > 0,
            );
          return hasSuggs || hasSignatureHint ? current : false;
        });
      };
      document.addEventListener('selectionchange', handler);
      return () => document.removeEventListener('selectionchange', handler);
    }, [isFocused, columns, functionDefs]);

    // Hover → function signature tooltip.
    // Event-delegated onto the editor so it keeps working across re-renders
    // that replace the inner highlighted spans. Only function-name spans
    // (those with `data-fn-name`) trigger the tooltip.
    React.useEffect(() => {
      const el = editorRef.current;
      if (!el) return;

      function clearTimer() {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
      }

      function findFnSpan(target: EventTarget | null): HTMLElement | null {
        if (!(target instanceof HTMLElement)) return null;
        return target.closest('[data-fn-name]') as HTMLElement | null;
      }

      function handleOver(e: MouseEvent) {
        const span = findFnSpan(e.target);
        if (!span) return;
        if (hoverTargetRef.current === span) return;
        hoverTargetRef.current = span;
        clearTimer();
        const name = span.getAttribute('data-fn-name');
        if (!name) return;
        const def = functionDefs.find(
          f => f.name.toUpperCase() === name.toUpperCase(),
        );
        if (!def) return;
        const rect = span.getBoundingClientRect();
        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null;
          setHoveredFunction({ def, rect });
        }, HOVER_TOOLTIP_DELAY_MS);
      }

      function handleOut(e: MouseEvent) {
        const span = findFnSpan(e.target);
        if (!span) return;
        // Ignore moves to a descendant of the same span.
        const to = e.relatedTarget;
        if (to instanceof Node && span.contains(to)) return;
        hoverTargetRef.current = null;
        clearTimer();
        setHoveredFunction(null);
      }

      el.addEventListener('mouseover', handleOver);
      el.addEventListener('mouseout', handleOut);
      return () => {
        el.removeEventListener('mouseover', handleOver);
        el.removeEventListener('mouseout', handleOut);
        clearTimer();
      };
    }, [functionDefs]);

    // Drop the tooltip whenever the formula or tokens change — positions
    // would be stale after edits, and a fresh hover re-triggers it.
    React.useEffect(() => {
      setHoveredFunction(null);
      hoverTargetRef.current = null;
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    }, [formulaValue, tokens]);

    // Re-process when controlled value changes
    React.useEffect(() => {
      if (isControlled) {
        const { tokens: newTokens, error: tokenError } = tokenizeSafe(controlledValue);
        setTokens(newTokens);

        let error: FormulaParseError | null = tokenError;
        if (!tokenError && controlledValue.trim().length > 0) {
          try {
            parse(controlledValue);
          } catch (e) {
            if (e instanceof FormulaParseError) error = e;
          }
        }
        setParseError(error);
      }
    }, [controlledValue, isControlled]);

    // Render highlighted HTML
    const highlightedHTML = React.useMemo(
      () => buildHighlightedHTML(formulaValue, tokens, mergedColors),
      [formulaValue, tokens, mergedColors],
    );

    // Restore cursor or selection after render
    React.useLayoutEffect(() => {
      if (!editorRef.current || !isFocused) return;
      if (pendingSelectionRef.current !== null) {
        setSelectionRange(editorRef.current, pendingSelectionRef.current.start, pendingSelectionRef.current.end);
        pendingSelectionRef.current = null;
        pendingCursorRef.current = null;
      } else if (pendingCursorRef.current !== null) {
        setCursorOffset(editorRef.current, pendingCursorRef.current);
        pendingCursorRef.current = null;
      }
    });

    function updateDropdownPosition() {
      const el = editorRef.current;
      if (!el) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        // Fallback: position below the editor
        const rect = el.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 2,
          left: rect.left + window.scrollX,
        });
        return;
      }

      const range = sel.getRangeAt(0);
      const caretRect = range.getBoundingClientRect();

      // Empty contentEditable or collapsed range at start → zero rect; fall back to editor
      if (caretRect.left === 0 && caretRect.top === 0 && caretRect.width === 0) {
        const rect = el.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 2,
          left: rect.left + window.scrollX,
        });
        return;
      }

      setDropdownPosition({
        top: caretRect.bottom + window.scrollY + 2,
        left: caretRect.left + window.scrollX,
      });
    }

    function restoreUndoEntry(entry: { value: string; cursorPos: number } | null) {
      if (!entry) return;
      pendingCursorRef.current = entry.cursorPos;
      if (!isControlled) {
        setInternalValue(entry.value);
      }
      processFormula(entry.value, entry.cursorPos);
      setShowDropdown(false);
    }

    function handleInput() {
      const el = editorRef.current;
      if (!el) return;

      const text = el.textContent || '';
      const cursorPos = getCursorOffset(el);
      pendingCursorRef.current = cursorPos;

      // Undo grouping: small changes within 300ms group together
      const undo = undoStackRef.current;
      const prev = undo.current();
      const isSmallChange = prev && Math.abs(text.length - prev.value.length) <= 2;

      if (isSmallChange && typingGroupTimerRef.current) {
        undo.replaceCurrent({ value: text, cursorPos });
      } else {
        undo.push({ value: text, cursorPos });
      }

      if (typingGroupTimerRef.current) clearTimeout(typingGroupTimerRef.current);
      typingGroupTimerRef.current = setTimeout(() => {
        typingGroupTimerRef.current = null;
      }, 300);

      if (!isControlled) {
        setInternalValue(text);
      }
      processFormula(text, cursorPos);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
      if (disabled || readOnly) return;

      // Alt+Shift+ArrowRight/Left — expand / shrink the selection through the
      // AST hierarchy. The ladder is built from the caret position on the
      // first press and preserved across consecutive expand/shrink presses.
      // Any other keypress falls through to the reset below.
      if (
        e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey &&
        (e.key === 'ArrowRight' || e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
        const el = editorRef.current;
        if (!el) return;
        const isExpand = e.key === 'ArrowRight';
        let state = expandSelRef.current;
        if (!state) {
          const { start } = getSelectionRange(el);
          let ast: ASTNode | null = null;
          try { ast = parse(formulaValue); } catch { /* tolerate parse errors */ }
          const ranges = getExpansionRanges(ast, tokens, start);
          if (ranges.length === 0) return;
          state = { ranges, level: -1 };
          expandSelRef.current = state;
        }
        const newLevel = isExpand
          ? Math.min(state.level + 1, state.ranges.length - 1)
          : Math.max(state.level - 1, -1);
        if (newLevel === state.level) return;
        state.level = newLevel;
        if (newLevel < 0) {
          const { start } = getSelectionRange(el);
          setCursorOffset(el, start);
          expandSelRef.current = null;
        } else {
          const r = state.ranges[newLevel];
          setSelectionRange(el, r.start, r.end);
        }
        return;
      }
      // Any other key resets the expansion ladder — but skip modifier-only
      // keydowns (Alt/Shift/Ctrl/Meta pressed on their own), which fire before
      // the Alt+Shift+Arrow combo completes and would otherwise wipe state.
      if (e.key !== 'Alt' && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta') {
        expandSelRef.current = null;
      }

      // Classify the keystroke: filter-extending chars (letters, digits, `_`)
      // leave auto-select enabled; anything else (operators, punctuation,
      // quotes, parens) suppresses it. Modifier combos and navigation keys
      // (key.length > 1) don't touch the flag — they leave prior state intact.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        suppressAutoSelectRef.current = !/[a-zA-Z0-9_]/.test(e.key);
      }

      // Auto-close string delimiters (`, ", ') when typed with no selection:
      // the delimiter is paired and the caret is placed between. If the caret
      // already sits before a matching closer, step past it instead of
      // stacking a new pair — so typing the natural closer at the end of a
      // string produces `abc` / "abc" / 'abc' rather than doubled delimiters.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '`' || e.key === '"' || e.key === "'")) {
        const el = editorRef.current;
        if (el) {
          const { start, end } = getSelectionRange(el);
          if (start === end) {
            const ch = e.key;
            if (formulaValue.charAt(start) === ch) {
              e.preventDefault();
              pendingCursorRef.current = start + 1;
              processFormula(formulaValue, start + 1);
              return;
            }
            e.preventDefault();
            const newFormula = formulaValue.slice(0, start) + ch + ch + formulaValue.slice(end);
            const newCursor = start + 1;
            if (typingGroupTimerRef.current) {
              clearTimeout(typingGroupTimerRef.current);
              typingGroupTimerRef.current = null;
            }
            undoStackRef.current.push({ value: newFormula, cursorPos: newCursor });
            pendingCursorRef.current = newCursor;
            if (!isControlled) setInternalValue(newFormula);
            processFormula(newFormula, newCursor);
            return;
          }
        }
      }

      // Auto-close template braces (`{`, `}`) when typed with no selection
      // in the correct template context. `{` pairs to `{}` in template text
      // only — it opens an interpolation there. In interpolation-space
      // (including nested string literals like `` `{'|'}` ``) `{` is a plain
      // character and gets no special treatment. `}` steps past an existing
      // `}` when inside an interpolation, so `` `{foo|}` `` + `}` produces
      // `` `{foo}|` `` rather than stacking a second `}`.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '{' || e.key === '}')) {
        const el = editorRef.current;
        if (el) {
          const { start, end } = getSelectionRange(el);
          if (start === end) {
            const state = templateStateAt(formulaValue, start);
            const ch = e.key;
            if (ch === '}' && state === 2 && formulaValue.charAt(start) === '}') {
              e.preventDefault();
              pendingCursorRef.current = start + 1;
              processFormula(formulaValue, start + 1);
              return;
            }
            if (ch === '{' && state === 1) {
              e.preventDefault();
              const newFormula = formulaValue.slice(0, start) + '{}' + formulaValue.slice(end);
              const newCursor = start + 1;
              if (typingGroupTimerRef.current) {
                clearTimeout(typingGroupTimerRef.current);
                typingGroupTimerRef.current = null;
              }
              undoStackRef.current.push({ value: newFormula, cursorPos: newCursor });
              pendingCursorRef.current = newCursor;
              if (!isControlled) setInternalValue(newFormula);
              processFormula(newFormula, newCursor);
              return;
            }
          }
        }
      }

      // Auto-wrap selection with brackets or quotes when the user types
      // the opening character while something is selected.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && WRAP_PAIRS[e.key]) {
        const el = editorRef.current;
        if (el) {
          const { start, end } = getSelectionRange(el);
          if (end > start) {
            e.preventDefault();
            const open = e.key;
            const close = WRAP_PAIRS[open];
            const formula = formulaValue;
            const selected = formula.slice(start, end);
            const newFormula = formula.slice(0, start) + open + selected + close + formula.slice(end);
            const newSelStart = start + 1;
            const newSelEnd = end + 1;

            if (typingGroupTimerRef.current) {
              clearTimeout(typingGroupTimerRef.current);
              typingGroupTimerRef.current = null;
            }
            undoStackRef.current.push({ value: newFormula, cursorPos: newSelEnd });

            pendingSelectionRef.current = { start: newSelStart, end: newSelEnd };
            if (!isControlled) setInternalValue(newFormula);
            processFormula(newFormula, newSelEnd);
            return;
          }
        }
      }

      // Ctrl+Space / Cmd+Space — manually trigger autocomplete
      if (e.key === ' ' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const el = editorRef.current;
        if (!el) return;
        const cursorPos = getCursorOffset(el);
        const ctx = getCursorContext(formulaValue, cursorPos);
        cursorContextRef.current = ctx;
        const suggs = getSuggestions(ctx, columns, functionDefs);
        setSuggestions(suggs);
        const hasPartial = ctx.type === 'column' || ctx.type === 'function' || ctx.type === 'bracket-column';
        setSelectedIndex(suggs.length > 0 && hasPartial ? 0 : -1);
        const hasSignatureHint = ctx.type === 'function-arg' &&
          functionDefs.some(f => f.name.toUpperCase() === ctx.functionName.toUpperCase() && f.parameters && f.parameters.length > 0);
        setShowDropdown(suggs.length > 0 || hasSignatureHint);
        if (suggs.length > 0 || hasSignatureHint) updateDropdownPosition();
        return;
      }

      // Undo: Ctrl+Z
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (typingGroupTimerRef.current) {
          clearTimeout(typingGroupTimerRef.current);
          typingGroupTimerRef.current = null;
        }
        restoreUndoEntry(undoStackRef.current.undo());
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault();
        if (typingGroupTimerRef.current) {
          clearTimeout(typingGroupTimerRef.current);
          typingGroupTimerRef.current = null;
        }
        restoreUndoEntry(undoStackRef.current.redo());
        return;
      }

      // Prevent Enter from inserting newlines (formulas are single-line)
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showDropdown && selectedIndex >= 0 && suggestions[selectedIndex]) {
          insertSuggestion(suggestions[selectedIndex]);
        }
        return;
      }

      if (e.key === 'Tab') {
        if (showDropdown && selectedIndex >= 0 && suggestions[selectedIndex]) {
          e.preventDefault();
          insertSuggestion(suggestions[selectedIndex]);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (showDropdown) {
          e.preventDefault();
          setShowDropdown(false);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        if (showDropdown && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % suggestions.length);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (showDropdown && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        }
        return;
      }

      // Page Up / Down — jump by a page (10 items) inside the dropdown
      if (e.key === 'PageDown') {
        if (showDropdown && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(suggestions.length - 1, prev + 10));
        }
        return;
      }

      if (e.key === 'PageUp') {
        if (showDropdown && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 10));
        }
        return;
      }

      // Home / End — jump to first / last item inside the dropdown
      if (e.key === 'Home') {
        if (showDropdown && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(0);
        }
        return;
      }

      if (e.key === 'End') {
        if (showDropdown && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(suggestions.length - 1);
        }
        return;
      }
    }

    function insertSuggestion(suggestion: AutocompleteSuggestion) {
      const el = editorRef.current;
      if (!el) return;

      const ctx = cursorContextRef.current;
      let replaceStart: number;
      let replaceEnd: number;

      if (ctx.type === 'column' || ctx.type === 'function') {
        replaceStart = ctx.start;
        replaceEnd = ctx.start + ctx.partial.length;
      } else if (ctx.type === 'bracket-column') {
        // Replace only the content between the `[` and the cursor — keep the
        // `[` the user already typed. Bracket-column suggestions carry their
        // own trailing `]`; duplicate-`]` handling is further below, after
        // insertText is available.
        replaceStart = ctx.start + 1;
        replaceEnd = ctx.start + 1 + ctx.partial.length;
      } else {
        // expression-start or function-arg — insert at cursor
        const cursorPos = getCursorOffset(el);
        replaceStart = cursorPos;
        replaceEnd = cursorPos;
      }

      const formula = formulaValue;

      // For function suggestions, we auto-inject `()` and place the caret
      // between them — unless a `(` already follows (ctx.type === 'function'
      // means the tokenizer already saw an LPAREN after the identifier), in
      // which case we skip the parens and jump the caret past the existing one.
      let insertText = suggestion.insertText;
      let newCursorPos: number;

      if (suggestion.type === 'function') {
        if (ctx.type === 'function') {
          // Parens already exist — just replace the identifier, caret goes
          // past the next `(` in the remaining source.
          const afterReplace = formula.slice(replaceEnd);
          const parenRel = afterReplace.indexOf('(');
          newCursorPos =
            parenRel >= 0
              ? replaceStart + insertText.length + parenRel + 1
              : replaceStart + insertText.length;
        } else {
          insertText = insertText + '()';
          const def = functionDefs.find(
            f => f.name.toUpperCase() === suggestion.name.toUpperCase(),
          );
          const isZeroArg = def?.parameters?.length === 0;
          newCursorPos = isZeroArg
            ? replaceStart + insertText.length
            : replaceStart + insertText.length - 1;
        }
      } else {
        // If we're completing a bracket-column and a `]` already sits right
        // after the replaced partial, swallow the suggestion's trailing `]`
        // and land the caret past the existing closer — otherwise `[pri]`
        // would autocomplete to `[price]]`.
        if (
          ctx.type === 'bracket-column' &&
          formula.charAt(replaceEnd) === ']' &&
          insertText.endsWith(']')
        ) {
          insertText = insertText.slice(0, -1);
          newCursorPos = replaceStart + insertText.length + 1;
        } else {
          newCursorPos = replaceStart + insertText.length;
        }
      }

      const newFormula =
        formula.slice(0, replaceStart) + insertText + formula.slice(replaceEnd);

      // Discrete operation — push to undo stack, clear typing group
      if (typingGroupTimerRef.current) {
        clearTimeout(typingGroupTimerRef.current);
        typingGroupTimerRef.current = null;
      }
      undoStackRef.current.push({ value: newFormula, cursorPos: newCursorPos });

      pendingCursorRef.current = newCursorPos;

      if (!isControlled) {
        setInternalValue(newFormula);
      }
      processFormula(newFormula, newCursorPos);

      // Keep dropdown open after a function insertion so the parameter hint
      // shows up for the just-entered call.
      if (suggestion.type !== 'function') {
        setShowDropdown(false);
      }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      // Insert as plain text (strip formatting, prevent newlines)
      const cleanText = text.replace(/[\r\n]/g, ' ');
      document.execCommand('insertText', false, cleanText);
    }

    function handleFocus() {
      setIsFocused(true);
      onFocus?.();
    }

    function handleBlur() {
      // Delay to allow click on dropdown
      setTimeout(() => {
        setIsFocused(false);
        setShowDropdown(false);
        onBlur?.();
      }, 150);
    }

    function handleMouseDown() {
      // Snapshot focus state so handleClick can distinguish "click to focus"
      // from "click while already focused" — only the latter should re-open
      // the dropdown.
      wasFocusedAtMouseDownRef.current = isFocused;
    }

    function handleClick() {
      if (disabled || readOnly) return;
      if (!reopenDropdownOnClick) return;
      if (!wasFocusedAtMouseDownRef.current) return;
      if (showDropdown) return;

      const el = editorRef.current;
      if (!el) return;

      // Don't open while the user has an active selection (drag-select).
      const { start, end } = getSelectionRange(el);
      if (start !== end) return;

      const cursorPos = getCursorOffset(el);
      const ctx = getCursorContext(formulaValue, cursorPos);
      cursorContextRef.current = ctx;
      const suggs = getSuggestions(ctx, columns, functionDefs);

      const hasSignatureHint =
        ctx.type === 'function-arg' &&
        functionDefs.some(
          f =>
            f.name.toUpperCase() === ctx.functionName.toUpperCase() &&
            f.parameters &&
            f.parameters.length > 0,
        );

      if (suggs.length === 0 && !hasSignatureHint) return;

      // Click is a deliberate caret placement — auto-select the first match
      // when there's a filter, so Enter/Tab will insert it.
      const hasPartial =
        ctx.type === 'column' || ctx.type === 'function' || ctx.type === 'bracket-column';
      setSuggestions(suggs);
      setSelectedIndex(hasPartial && suggs.length > 0 ? 0 : -1);
      setShowDropdown(true);
      updateDropdownPosition();
    }

    const containerStyles = getContainerStyle(style);
    const editorStyles: React.CSSProperties = {
      ...getEditorStyle(mergedColors, mergedStyles),
      ...(isFocused ? getEditorFocusStyle(mergedStyles) : {}),
      ...(disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {}),
    };

    const showPlaceholder = formulaValue.length === 0 && !isFocused;

    // Determine partial for highlight matching in dropdown
    const ctx = cursorContextRef.current;
    const partial =
      ctx.type === 'column' || ctx.type === 'function' || ctx.type === 'bracket-column'
        ? ctx.partial
        : undefined;

    // Build signature hint info when inside a function call
    const signatureHint = React.useMemo(() => {
      if (ctx.type !== 'function-arg') return undefined;
      const fn = functionDefs.find(f => f.name.toUpperCase() === ctx.functionName.toUpperCase());
      if (!fn?.parameters || fn.parameters.length === 0) return undefined;
      return { functionDef: fn, argIndex: ctx.argIndex };
    }, [ctx, functionDefs]);

    return (
      <div ref={containerRef} className={className} style={containerStyles}>
        <div
          ref={editorRef}
          contentEditable={!disabled && !readOnly}
          suppressContentEditableWarning
          spellCheck={false}
          style={editorStyles}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: highlightedHTML }}
          data-testid="formula-editor"
        />
        {showPlaceholder && placeholder && (
          <div style={getPlaceholderStyle(mergedColors, mergedStyles)}>
            {placeholder}
          </div>
        )}
        <MatchingParens
          tokens={tokens}
          cursorOffset={cursorOffset}
          editorElement={editorRef.current}
          hasFocus={isFocused}
        />
        <ValidationSquiggles
          errors={validationErrors}
          editorElement={editorRef.current}
          containerElement={containerRef.current}
          cursorOffset={cursorOffset}
          colors={colorsProp}
          styles={stylesProp}
        />
        <AutocompleteDropdown
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          onSelect={insertSuggestion}
          position={dropdownPosition}
          colors={colorsProp}
          styles={stylesProp}
          visible={showDropdown}
          partial={partial}
          signatureHint={signatureHint}
        />
        <FunctionTooltip
          functionDef={hoveredFunction?.def ?? null}
          anchorRect={hoveredFunction?.rect ?? null}
          colors={colorsProp}
          styles={stylesProp}
        />
      </div>
    );
  },
);
