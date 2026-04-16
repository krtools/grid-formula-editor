import * as React from 'react';
import { tokenizeSafe } from '../../tokenizer.js';
import { parse } from '../../parser.js';
import { Token, ASTNode, FormulaParseError } from '../../types.js';
import {
  FormulaEditorProps,
  FormulaEditorHandle,
  FormulaChangeInfo,
  AutocompleteSuggestion,
  CursorContext,
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
import { getCursorOffset, setCursorOffset } from '../utils/cursor.js';
import { UndoStack } from '../utils/undoStack.js';
import { validateFormula, FormulaValidationError } from '../validation/formulaValidator.js';
import { buildHighlightedHTML } from './HighlightedContent.js';
import { AutocompleteDropdown } from './AutocompleteDropdown.js';
import { ValidationSquiggles } from './ValidationSquiggles.js';

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
    const undoStackRef = React.useRef(new UndoStack());
    const typingGroupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [validationErrors, setValidationErrors] = React.useState<FormulaValidationError[]>([]);
    const [cursorOffset, setCursorOffsetState] = React.useState(0);

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
        if (!isControlled) setInternalValue(v);
        processFormula(v, 0);
      },
      focus: () => editorRef.current?.focus(),
      blur: () => editorRef.current?.blur(),
      getElement: () => editorRef.current,
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
        setSelectedIndex(suggs.length > 0 ? 0 : -1);

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

    // Restore cursor after render
    React.useLayoutEffect(() => {
      if (pendingCursorRef.current !== null && editorRef.current && isFocused) {
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
        setSelectedIndex(suggs.length > 0 ? 0 : -1);
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
        replaceStart = ctx.start;
        // Replace from [ to cursor position
        replaceEnd = ctx.start + 1 + ctx.partial.length; // +1 for the [
      } else {
        // expression-start or function-arg — insert at cursor
        const cursorPos = getCursorOffset(el);
        replaceStart = cursorPos;
        replaceEnd = cursorPos;
      }

      const formula = formulaValue;
      const newFormula =
        formula.slice(0, replaceStart) + suggestion.insertText + formula.slice(replaceEnd);
      const newCursorPos = replaceStart + suggestion.insertText.length;

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

      // Hide the suggestion list, but keep dropdown open if we just entered
      // a function call (e.g. inserting "IF(" should show parameter hints)
      if (!suggestion.insertText.endsWith('(')) {
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
          dangerouslySetInnerHTML={{ __html: highlightedHTML }}
          data-testid="formula-editor"
        />
        {showPlaceholder && placeholder && (
          <div style={getPlaceholderStyle(mergedColors, mergedStyles)}>
            {placeholder}
          </div>
        )}
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
      </div>
    );
  },
);
