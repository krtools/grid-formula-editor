import * as React from 'react';
import { FunctionDef, FormulaColorConfig, FormulaStyleConfig } from '../types.js';
import {
  getSignatureHintStyle,
  getSignatureParamStyle,
  getSignatureDescStyle,
} from '../styles/inlineStyles.js';

interface SignatureHintProps {
  functionDef: FunctionDef;
  /**
   * Index of the argument currently being edited. When undefined or negative,
   * no parameter is highlighted — used for hover tooltips where the caret
   * isn't inside the call.
   */
  argIndex?: number;
  colors: Required<FormulaColorConfig>;
  styles: Required<FormulaStyleConfig>;
  /** When false, omit the bottom border used inside the autocomplete dropdown. */
  bordered?: boolean;
}

/**
 * Renders a function's signature with optional active-parameter highlighting
 * and a description line for the active (or whole function, on hover) parameter.
 * Shared by the autocomplete dropdown header and the function hover tooltip.
 */
export function SignatureHint({
  functionDef,
  argIndex,
  colors,
  styles,
  bordered = true,
}: SignatureHintProps) {
  const params = functionDef.parameters ?? [];
  const hasActive = argIndex !== undefined && argIndex >= 0;
  const restIdx = params.findIndex(p => p.rest);
  const activeIdx = hasActive
    ? (restIdx >= 0 && argIndex! >= restIdx ? restIdx : Math.min(argIndex!, params.length - 1))
    : -1;
  const activeParam = activeIdx >= 0 ? params[activeIdx] : undefined;

  const baseStyle = getSignatureHintStyle(colors, styles);
  const style: React.CSSProperties = bordered
    ? baseStyle
    : { ...baseStyle, borderBottom: 'none' };

  return (
    <div style={style}>
      <span>{functionDef.name}(</span>
      {params.map((p, i) => (
        <React.Fragment key={p.name}>
          {i > 0 && <span>, </span>}
          <span style={getSignatureParamStyle(i === activeIdx, colors)}>
            {p.rest ? `...${p.name}` : p.name}
            {p.optional ? '?' : ''}
          </span>
        </React.Fragment>
      ))}
      <span>)</span>
      {activeParam?.description && (
        <span style={getSignatureDescStyle(colors)}>
          {activeParam.name}: {activeParam.description}
        </span>
      )}
      {!hasActive && functionDef.description && (
        <span style={getSignatureDescStyle(colors)}>
          {functionDef.description}
        </span>
      )}
    </div>
  );
}
