/**
 * DOM cursor utilities for contentEditable elements.
 * Converts between character offsets and DOM Selection/Range positions.
 */

/** Count the character offset from the start of `root` to the current selection start. */
export function getCursorOffset(element: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  return countOffsetTo(element, range.startContainer, range.startOffset);
}

/** Place the caret at a character offset within a contentEditable element. */
export function setCursorOffset(element: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const result = findNodeAtOffset(element, offset);
  if (!result) return;

  const range = document.createRange();
  range.setStart(result.node, result.offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Walk text nodes to count character offset up to a specific DOM position. */
function countOffsetTo(root: Node, targetNode: Node, targetOffset: number): number {
  let count = 0;
  let found = false;

  function walk(node: Node): boolean {
    if (found) return true;

    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        count += targetOffset;
      } else {
        for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
          if (walk(node.childNodes[i])) return true;
        }
      }
      found = true;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      count += (node.textContent || '').length;
      return false;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
    }
    return false;
  }

  walk(root);
  return count;
}

/** Find the DOM node and offset corresponding to a character offset. */
function findNodeAtOffset(
  parent: Node,
  targetOffset: number,
): { node: Node; offset: number } | null {
  let currentOffset = 0;

  function walk(node: Node): { node: Node; offset: number } | null {
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
  }

  const result = walk(parent);
  if (result) return result;

  // Fallback: place at end
  const lastText = getLastTextNode(parent);
  if (lastText) {
    return { node: lastText, offset: (lastText.textContent || '').length };
  }
  return { node: parent, offset: 0 };
}

function getLastTextNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const result = getLastTextNode(node.childNodes[i]);
    if (result) return result;
  }
  return null;
}
