/**
 * Minimal React render helper for browser tests. Uses React 18's createRoot
 * API, with flushSync on the initial render so tests can query the DOM
 * immediately after calling renderInto (matching the legacy ReactDOM.render
 * synchronous-first-paint contract the tests were written against).
 */
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function renderInto(element: React.ReactElement): HTMLDivElement {
  cleanup();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root!.render(element);
  });
  return container;
}

export function cleanup() {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}
