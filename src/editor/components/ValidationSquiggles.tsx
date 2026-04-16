import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { FormulaValidationError } from '../validation/formulaValidator.js';
import { FormulaColorConfig, FormulaStyleConfig } from '../types.js';
import { mergeColors, mergeStyles } from '../styles/inlineStyles.js';

interface ValidationSquigglesProps {
  errors: FormulaValidationError[];
  editorElement: HTMLElement | null;
  containerElement: HTMLElement | null;
  cursorOffset: number;
  colors?: FormulaColorConfig;
  styles?: FormulaStyleConfig;
}

interface SquigglyRect {
  left: number;
  top: number;
  width: number;
  height: number;
  error: FormulaValidationError;
}

const MAX_VISIBLE_ERRORS = 30;
const MEASURE_DEBOUNCE_MS = 150;
const TOOLTIP_HEIGHT_ESTIMATE = 28;
const TOOLTIP_GAP = 4;

function findPositionAtOffset(
  parent: Node,
  targetOffset: number,
): { node: Node; offset: number } | null {
  let currentOffset = 0;

  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (currentOffset + len >= targetOffset) {
        return { node, offset: targetOffset - currentOffset };
      }
      currentOffset += len;
      return null;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const result = walk(node.childNodes[i]);
      if (result) return result;
    }
    return null;
  };

  return walk(parent);
}

function getOffsetRects(
  editor: HTMLElement,
  start: number,
  end: number,
): { left: number; top: number; width: number; height: number }[] {
  const startPos = findPositionAtOffset(editor, start);
  const endPos = findPositionAtOffset(editor, end);

  if (!startPos || !endPos) return [];

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const editorRect = editor.getBoundingClientRect();
  const clientRects = range.getClientRects();
  if (clientRects.length === 0) return [];

  const results: { left: number; top: number; width: number; height: number }[] = [];
  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i];
    if (r.width < 1) continue;
    results.push({
      left: r.left - editorRect.left,
      top: r.top - editorRect.top,
      width: Math.max(r.width, 6),
      height: r.height,
    });
  }

  return results;
}

function measureSquigglyRects(
  errors: FormulaValidationError[],
  editor: HTMLElement | null,
  cursorOffset: number,
): SquigglyRect[] {
  if (!editor || errors.length === 0) return [];

  const rects: SquigglyRect[] = [];
  let measured = 0;

  for (const error of errors) {
    if (measured >= MAX_VISIBLE_ERRORS) break;

    // Defer mid-typing errors (unknown column/function) while cursor is
    // within their range — avoids noise as the user types. Parse errors
    // always render.
    if (error.type !== 'parse' && cursorOffset >= error.start && cursorOffset <= error.end) {
      continue;
    }

    const lineRects = getOffsetRects(editor, error.start, error.end);
    for (const pos of lineRects) {
      rects.push({
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        error,
      });
    }
    measured++;
  }

  return rects;
}

function squigglyBgForColor(hexColor: string): string {
  const encoded = hexColor.replace('#', '%23');
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 2 Q2 0 4 2 Q6 4 8 2' stroke='${encoded}' fill='none' stroke-width='0.8'/%3E%3C/svg%3E")`;
}

export function ValidationSquiggles({
  errors,
  editorElement,
  containerElement,
  cursorOffset,
  colors,
  styles,
}: ValidationSquigglesProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [mousePos, setMousePos] = React.useState<{ x: number; clientY: number }>({ x: 0, clientY: 0 });
  const [rects, setRects] = React.useState<SquigglyRect[]>([]);
  const rectsRef = React.useRef<SquigglyRect[]>([]);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const measureTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce DOM measurements
  React.useEffect(() => {
    if (measureTimerRef.current) clearTimeout(measureTimerRef.current);

    if (errors.length === 0) {
      setRects([]);
      rectsRef.current = [];
      setHoveredIndex(null);
      return;
    }

    measureTimerRef.current = setTimeout(() => {
      const measured = measureSquigglyRects(errors, editorElement, cursorOffset);
      setRects(measured);
      rectsRef.current = measured;
    }, MEASURE_DEBOUNCE_MS);

    return () => {
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
    };
  }, [errors, editorElement, cursorOffset]);

  // Mouse tracking for hover tooltips
  React.useEffect(() => {
    const container = containerElement;
    if (!container || !editorElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      const editorRect = editorElement.getBoundingClientRect();
      const mx = e.clientX - editorRect.left;
      const my = e.clientY - editorRect.top;

      let found = -1;
      for (let i = 0; i < rectsRef.current.length; i++) {
        const r = rectsRef.current[i];
        if (mx >= r.left && mx <= r.left + r.width &&
            my >= r.top && my <= r.top + r.height + 6) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        setHoveredIndex(found);
        setMousePos({ x: mx, clientY: e.clientY });
      } else {
        setHoveredIndex(null);
      }
    };

    const handleMouseLeave = () => {
      setHoveredIndex(null);
    };

    const controller = new AbortController();
    container.addEventListener('mousemove', handleMouseMove, { signal: controller.signal });
    container.addEventListener('mouseleave', handleMouseLeave, { signal: controller.signal });
    return () => controller.abort();
  }, [containerElement, editorElement]);

  // Clamp tooltip horizontally
  React.useEffect(() => {
    const el = tooltipRef.current;
    if (!el || hoveredIndex == null) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      const shift = rect.right - window.innerWidth + 8;
      el.style.transform = `translateX(-${shift}px)`;
    } else {
      el.style.transform = '';
    }
  });

  if (rects.length === 0) return null;

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);

  const hoveredRect = hoveredIndex != null ? rects[hoveredIndex] : null;

  return (
    <>
      {rects.map((r, i) => {
        const squigglyColor = r.error.type === 'parse' ? mergedColors.error : '#d97706';
        const svgBg = squigglyBgForColor(squigglyColor);
        const waveTop = r.top + r.height - 2;

        return (
          <div
            key={`wave-${i}`}
            style={{
              position: 'absolute',
              left: `${r.left}px`,
              top: `${waveTop}px`,
              width: `${r.width}px`,
              height: '4px',
              zIndex: 1,
              backgroundImage: svgBg,
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'left top',
              backgroundSize: 'auto 4px',
              pointerEvents: 'none',
            }}
          />
        );
      })}
      {hoveredRect != null && (() => {
        const squigglyColor = hoveredRect.error.type === 'unknown-function' ? '#d97706' : mergedColors.error;
        const editorRect = editorElement?.getBoundingClientRect();
        const fixedLeft = (editorRect?.left ?? 0) + mousePos.x;
        const waveBottomFixed = (editorRect?.top ?? 0) + hoveredRect.top + hoveredRect.height + 2;
        const lineTopFixed = (editorRect?.top ?? 0) + hoveredRect.top;
        const spaceBelow = window.innerHeight - mousePos.clientY;
        const needsFlip = spaceBelow < TOOLTIP_HEIGHT_ESTIMATE + 20;
        const fixedTop = needsFlip
          ? lineTopFixed - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_GAP
          : waveBottomFixed + TOOLTIP_GAP;

        return ReactDOM.createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: 'fixed',
              top: `${fixedTop}px`,
              left: `${fixedLeft}px`,
              zIndex: mergedStyles.dropdownZIndex,
              backgroundColor: mergedColors.background,
              color: squigglyColor,
              border: `1px solid ${squigglyColor}`,
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              fontFamily: mergedStyles.fontFamily,
              lineHeight: '1.4',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              userSelect: 'none',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              maxWidth: '90vw',
            }}
          >
            {hoveredRect.error.message}
          </div>,
          document.body,
        );
      })()}
    </>
  );
}
