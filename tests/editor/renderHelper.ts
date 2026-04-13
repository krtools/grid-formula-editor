/**
 * Minimal React render helper for browser tests.
 * Uses ReactDOM.render for React 16.8+ compatibility.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';

let container: HTMLDivElement | null = null;

export function renderInto(element: React.ReactElement): HTMLDivElement {
  cleanup();
  container = document.createElement('div');
  document.body.appendChild(container);
  ReactDOM.render(element, container);
  return container;
}

export function cleanup() {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
}
