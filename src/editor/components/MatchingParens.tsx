import * as React from 'react';
import { Token, TokenType } from '../../types.js';

interface MatchingParensProps {
  tokens: Token[];
  cursorOffset: number;
  editorElement: HTMLElement | null;
  hasFocus: boolean;
}

const OPENERS = new Set<TokenType>([TokenType.LPAREN, TokenType.TEMPLATE_INTERP_START]);
const CLOSERS = new Set<TokenType>([TokenType.RPAREN, TokenType.TEMPLATE_INTERP_END]);

function findMatchingPair(tokens: Token[], cursorOffset: number): [Token, Token] | null {
  const parens = tokens.filter(t => OPENERS.has(t.type) || CLOSERS.has(t.type));
  if (parens.length === 0) return null;

  const isParen = (t: Token) => OPENERS.has(t.type) || CLOSERS.has(t.type);

  // Find the paren token the cursor is adjacent to. Prefer the one to the left
  // (cursor.end == paren.end) so typing after `)` highlights it — matches VS Code.
  let anchor: Token | null = null;
  for (const t of tokens) {
    if (!isParen(t)) continue;
    if (t.end === cursorOffset) { anchor = t; break; }
  }
  if (!anchor) {
    for (const t of tokens) {
      if (!isParen(t)) continue;
      if (t.start === cursorOffset) { anchor = t; break; }
    }
  }
  if (!anchor) return null;

  if (OPENERS.has(anchor.type)) {
    // Scan forward for the matching closer.
    let depth = 0;
    const startIdx = tokens.indexOf(anchor);
    for (let i = startIdx; i < tokens.length; i++) {
      const t = tokens[i];
      if (OPENERS.has(t.type)) depth++;
      else if (CLOSERS.has(t.type)) {
        depth--;
        if (depth === 0) return [anchor, t];
      }
    }
    return null;
  } else {
    // Scan backward for the matching opener.
    let depth = 0;
    const startIdx = tokens.indexOf(anchor);
    for (let i = startIdx; i >= 0; i--) {
      const t = tokens[i];
      if (CLOSERS.has(t.type)) depth++;
      else if (OPENERS.has(t.type)) {
        depth--;
        if (depth === 0) return [t, anchor];
      }
    }
    return null;
  }
}

function findPositionAtOffset(parent: Node, targetOffset: number): { node: Node; offset: number } | null {
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
      const r = walk(node.childNodes[i]);
      if (r) return r;
    }
    return null;
  };
  return walk(parent);
}

function measureRect(editor: HTMLElement, start: number, end: number): { left: number; top: number; width: number; height: number } | null {
  const a = findPositionAtOffset(editor, start);
  const b = findPositionAtOffset(editor, end);
  if (!a || !b) return null;

  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);

  // Use getBoundingClientRect, not getClientRects()[0]: when the range start
  // lands at a span boundary (e.g. end-of-prev-node == start-of-this-node),
  // getClientRects() returns a leading zero-width rect at that boundary. Taking
  // [0] would render a 2px-wide stripe on the left edge of the character.
  const r = range.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;

  const editorRect = editor.getBoundingClientRect();
  return {
    left: r.left - editorRect.left,
    top: r.top - editorRect.top,
    width: Math.max(r.width, 2),
    height: r.height,
  };
}

export function MatchingParens({ tokens, cursorOffset, editorElement, hasFocus }: MatchingParensProps) {
  const [rects, setRects] = React.useState<Array<{ left: number; top: number; width: number; height: number }>>([]);

  React.useEffect(() => {
    if (!editorElement || !hasFocus) { setRects([]); return; }
    const pair = findMatchingPair(tokens, cursorOffset);
    if (!pair) { setRects([]); return; }
    const [open, close] = pair;
    // Skip highlighting when the parens are adjacent (empty body). There's
    // nothing meaningful to guide the eye to, and rendering two narrow rects
    // right next to each other looks like a visual artifact.
    if (open.end === close.start) { setRects([]); return; }
    const r1 = measureRect(editorElement, open.start, open.end);
    const r2 = measureRect(editorElement, close.start, close.end);
    const next: Array<{ left: number; top: number; width: number; height: number }> = [];
    if (r1) next.push(r1);
    if (r2) next.push(r2);
    setRects(next);
  }, [tokens, cursorOffset, editorElement, hasFocus]);

  if (rects.length === 0) return null;

  return (
    <>
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
            backgroundColor: 'rgba(100, 150, 255, 0.25)',
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      ))}
    </>
  );
}
