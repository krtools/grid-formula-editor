import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { FunctionDef, FormulaColorConfig, FormulaStyleConfig } from '../types.js';
import { mergeColors, mergeStyles, getDropdownStyle } from '../styles/inlineStyles.js';
import { SignatureHint } from './SignatureHint.js';

interface FunctionTooltipProps {
  /** The function to describe. When null the tooltip is hidden. */
  functionDef: FunctionDef | null;
  /** Anchor rectangle (viewport-relative) used to position the tooltip above the target. */
  anchorRect: DOMRect | null;
  colors?: FormulaColorConfig;
  styles?: FormulaStyleConfig;
}

/**
 * Hover tooltip for function-name tokens in the editor.
 * Reuses SignatureHint so the content matches the autocomplete dropdown's
 * signature header; positions itself above the hovered token.
 */
export function FunctionTooltip({
  functionDef,
  anchorRect,
  colors,
  styles,
}: FunctionTooltipProps) {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    portalRef.current = container;
    return () => {
      document.body.removeChild(container);
      portalRef.current = null;
    };
  }, []);

  // Position above the anchor; after first render, measure our own rect so
  // the tooltip's bottom aligns a couple pixels above the anchor's top.
  React.useLayoutEffect(() => {
    if (!anchorRect || !functionDef) {
      setPosition(null);
      return;
    }
    const tipEl = tipRef.current;
    const tipHeight = tipEl?.offsetHeight ?? 32;
    setPosition({
      top: anchorRect.top + window.scrollY - tipHeight - 6,
      left: anchorRect.left + window.scrollX,
    });
  }, [anchorRect, functionDef]);

  if (!portalRef.current || !functionDef || !anchorRect) return null;

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);
  const boxStyle: React.CSSProperties = {
    ...getDropdownStyle(mergedColors, mergedStyles),
    padding: 0,
    pointerEvents: 'none',
    // Keep hidden on the first layout pass until we've measured our height.
    top: position ? `${position.top}px` : '-9999px',
    left: position ? `${position.left}px` : '-9999px',
  };

  return ReactDOM.createPortal(
    <div ref={tipRef} style={boxStyle}>
      <SignatureHint
        functionDef={functionDef}
        colors={mergedColors}
        styles={mergedStyles}
        bordered={false}
      />
    </div>,
    portalRef.current,
  );
}
