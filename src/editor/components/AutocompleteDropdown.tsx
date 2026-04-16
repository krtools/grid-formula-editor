import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { AutocompleteSuggestion, FunctionDef } from '../types.js';
import { FormulaColorConfig, FormulaStyleConfig } from '../types.js';
import {
  mergeColors,
  mergeStyles,
  getDropdownStyle,
  getDropdownItemStyle,
  getDropdownItemLabelStyle,
  getDropdownItemDescStyle,
  getDropdownItemTypeStyle,
  getSignatureHintStyle,
  getSignatureParamStyle,
  getSignatureDescStyle,
} from '../styles/inlineStyles.js';

interface SignatureHintInfo {
  functionDef: FunctionDef;
  argIndex: number;
}

interface AutocompleteDropdownProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  position: { top: number; left: number } | null;
  colors?: FormulaColorConfig;
  styles?: FormulaStyleConfig;
  visible: boolean;
  partial?: string;
  signatureHint?: SignatureHintInfo;
}

function highlightMatch(
  text: string,
  partial: string | undefined,
  isSelected: boolean,
): React.ReactNode {
  if (!partial || partial.length === 0) return text;

  const lower = text.toLowerCase();
  const partialLower = partial.toLowerCase();
  const idx = lower.indexOf(partialLower);

  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + partial.length);
  const after = text.slice(idx + partial.length);

  const matchStyle: React.CSSProperties = {
    fontWeight: 700,
    textDecoration: 'underline',
    textDecorationColor: isSelected ? 'rgba(255,255,255,0.6)' : '#0969da',
    textUnderlineOffset: '2px',
  };

  return (
    <>
      {before}
      <span style={matchStyle}>{match}</span>
      {after}
    </>
  );
}

export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  position,
  colors,
  styles,
  visible,
  partial,
  signatureHint,
}: AutocompleteDropdownProps) {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  // Refs to each suggestion div, keyed by suggestion index. Using a ref array
  // rather than listRef.children avoids an off-by-one when the signature hint
  // header is rendered as the first child of the dropdown.
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  // Create/destroy portal container
  React.useEffect(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    portalRef.current = container;
    return () => {
      document.body.removeChild(container);
      portalRef.current = null;
    };
  }, []);

  // Scroll selected item into view
  React.useEffect(() => {
    if (selectedIndex < 0) return;
    const item = itemRefs.current[selectedIndex];
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const hasSignature = signatureHint?.functionDef.parameters && signatureHint.functionDef.parameters.length > 0;
  const hasSuggestions = suggestions.length > 0;

  if (!portalRef.current || !visible || (!hasSuggestions && !hasSignature) || !position) {
    return null;
  }

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);
  const dropdownStyle: React.CSSProperties = {
    ...getDropdownStyle(mergedColors, mergedStyles),
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  // Build signature hint header
  let signatureHeader: React.ReactNode = null;
  if (hasSignature && signatureHint) {
    const { functionDef, argIndex } = signatureHint;
    const params = functionDef.parameters!;
    const activeParam = params[Math.min(argIndex, params.length - 1)];
    const isRestParam = activeParam?.rest;

    signatureHeader = (
      <div style={getSignatureHintStyle(mergedColors, mergedStyles)}>
        <span>{functionDef.name}(</span>
        {params.map((p, i) => {
          // For rest params, the active index can exceed the param list length
          const isActive = isRestParam
            ? i === params.length - 1 && argIndex >= i
            : i === argIndex;
          return (
            <React.Fragment key={p.name}>
              {i > 0 && <span>, </span>}
              <span style={getSignatureParamStyle(isActive, mergedColors)}>
                {p.rest ? `...${p.name}` : p.name}
                {p.optional ? '?' : ''}
              </span>
            </React.Fragment>
          );
        })}
        <span>)</span>
        {activeParam?.description && (
          <span style={getSignatureDescStyle(mergedColors)}>
            {activeParam.name}: {activeParam.description}
          </span>
        )}
      </div>
    );
  }

  const content = (
    <div style={dropdownStyle} ref={listRef} onMouseDown={e => e.preventDefault()}>
      {signatureHeader}
      {suggestions.map((suggestion, i) => {
        const isSelected = i === selectedIndex;
        const itemStyle = getDropdownItemStyle(isSelected, mergedColors, mergedStyles);

        return (
          <div
            key={`${suggestion.type}-${suggestion.name}`}
            ref={el => {
              itemRefs.current[i] = el;
            }}
            style={itemStyle}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = isSelected
                ? mergedColors.dropdownSelected
                : mergedColors.dropdownHover;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = isSelected
                ? mergedColors.dropdownSelected
                : 'transparent';
            }}
          >
            <span style={getDropdownItemLabelStyle()}>
              {highlightMatch(suggestion.displayName, partial, isSelected)}
            </span>
            {suggestion.description && (
              <span style={getDropdownItemDescStyle()}>
                {suggestion.description}
              </span>
            )}
            <span style={getDropdownItemTypeStyle(isSelected, mergedStyles)}>
              {suggestion.type === 'function' ? 'fn' : 'col'}
            </span>
          </div>
        );
      })}
    </div>
  );

  return ReactDOM.createPortal(content, portalRef.current);
}
