import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { FormulaEditor } from '../../src/editor/components/FormulaEditor';
import { ColumnDef, FunctionDef, FormulaChangeInfo, FormulaEditorHandle } from '../../src/editor/types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const COLUMNS: ColumnDef[] = [
  { name: 'price', description: 'Unit price' },
  { name: 'quantity', description: 'Item count' },
  { name: 'First Name', label: 'First Name', description: 'Customer first name' },
  { name: 'tax_rate' },
];

const FUNCTIONS: FunctionDef[] = [
  { name: 'ROUND', description: 'Round to N decimals', signature: 'ROUND(value, decimals)' },
  { name: 'IF', description: 'Conditional value', signature: 'IF(cond, then, else)' },
  { name: 'CONCAT', description: 'Join text' },
];

const EDITOR = '[data-testid="formula-editor"]';

async function waitFor(
  fn: () => boolean | Promise<boolean>,
  timeout = 3000,
  interval = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

function editorEl(): HTMLElement {
  return document.querySelector(EDITOR) as HTMLElement;
}

function editorText(): string {
  return editorEl()?.textContent ?? '';
}

describe('FormulaEditor browser tests', () => {
  it('renders with placeholder text', () => {
    renderInto(
      React.createElement(FormulaEditor, {
        placeholder: 'Enter formula...',
        columns: COLUMNS,
      }),
    );
    const container = document.querySelector('[data-testid="formula-editor"]')?.parentElement;
    expect(container?.textContent).toContain('Enter formula...');
  });

  it('renders defaultValue and syntax highlights tokens', () => {
    renderInto(
      React.createElement(FormulaEditor, {
        defaultValue: 'price + 10',
        columns: COLUMNS,
        functions: FUNCTIONS,
      }),
    );
    const editor = editorEl();
    expect(editor.textContent).toBe('price + 10');
    // Should contain span elements for highlighting
    const spans = editor.querySelectorAll('span');
    expect(spans.length).toBeGreaterThan(0);
  });

  it('fires onChange with formula, AST and tokens', async () => {
    let lastFormula = '';
    let lastInfo: FormulaChangeInfo | null = null;

    renderInto(
      React.createElement(FormulaEditor, {
        columns: COLUMNS,
        functions: FUNCTIONS,
        onChange: (formula: string, info: FormulaChangeInfo) => {
          lastFormula = formula;
          lastInfo = info;
        },
      }),
    );

    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.type(locator, '1 + 2');

    await waitFor(() => lastFormula.includes('1 + 2'));
    expect(lastFormula).toContain('1 + 2');
    expect(lastInfo).not.toBeNull();
    expect(lastInfo!.ast).not.toBeNull();
    expect(lastInfo!.error).toBeNull();
    expect(lastInfo!.tokens.length).toBeGreaterThan(0);
  });

  it('reports parse errors for invalid formulas', async () => {
    let lastInfo: FormulaChangeInfo | null = null;

    renderInto(
      React.createElement(FormulaEditor, {
        columns: COLUMNS,
        onChange: (_: string, info: FormulaChangeInfo) => {
          lastInfo = info;
        },
      }),
    );

    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.type(locator, '+ +');

    await waitFor(() => lastInfo?.error !== null);
    expect(lastInfo!.error).not.toBeNull();
  });

  it('shows autocomplete dropdown on typing', async () => {
    renderInto(
      React.createElement(FormulaEditor, {
        columns: COLUMNS,
        functions: FUNCTIONS,
      }),
    );

    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.type(locator, 'pri');

    // Wait for dropdown to appear (portal appended to body)
    const dropdownAppeared = await waitFor(() => {
      const items = document.querySelectorAll('[style*="z-index"]');
      for (const item of items) {
        if (item.textContent?.includes('price')) return true;
      }
      return false;
    });
    expect(dropdownAppeared).toBe(true);
  });

  it('controlled mode reflects value prop', () => {
    renderInto(
      React.createElement(FormulaEditor, {
        value: 'ROUND(price, 2)',
        columns: COLUMNS,
        functions: FUNCTIONS,
      }),
    );
    expect(editorText()).toBe('ROUND(price, 2)');
  });

  it('imperative handle getValue/setValue works', () => {
    let handleRef: FormulaEditorHandle | null = null;

    renderInto(
      React.createElement(FormulaEditor, {
        ref: (h: FormulaEditorHandle | null) => { handleRef = h; },
        defaultValue: 'a + b',
        columns: COLUMNS,
      } as any),
    );

    expect(handleRef).not.toBeNull();
    expect(handleRef!.getValue()).toBe('a + b');

    handleRef!.setValue('x * y');
    expect(handleRef!.getValue()).toBe('x * y');
  });

  it('disabled editor is not editable', () => {
    renderInto(
      React.createElement(FormulaEditor, {
        defaultValue: 'price',
        disabled: true,
        columns: COLUMNS,
      }),
    );
    const el = editorEl();
    expect(el.contentEditable).toBe('false');
  });

  it('readOnly editor is not editable', () => {
    renderInto(
      React.createElement(FormulaEditor, {
        defaultValue: 'price',
        readOnly: true,
        columns: COLUMNS,
      }),
    );
    const el = editorEl();
    expect(el.contentEditable).toBe('false');
  });

  it('Ctrl+Space manually triggers autocomplete', async () => {
    renderInto(
      React.createElement(FormulaEditor, {
        columns: COLUMNS,
        functions: FUNCTIONS,
      }),
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();

    await userEvent.keyboard('{Control>} {/Control}');

    const dropdownAppeared = await waitFor(() => {
      const items = document.querySelectorAll('[style*="z-index"]');
      for (const item of items) {
        if (item.textContent?.includes('price')) return true;
      }
      return false;
    });
    expect(dropdownAppeared).toBe(true);
  });

  it('typing ( with a selection wraps it in parens', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    let lastFormula = 'price';
    renderInto(
      React.createElement(FormulaEditor, {
        ref: (h: FormulaEditorHandle | null) => { handleRef = h; },
        defaultValue: 'price',
        columns: COLUMNS,
        onChange: (formula: string) => { lastFormula = formula; },
      } as any),
    );

    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();

    // Select all
    await userEvent.keyboard('{Control>}a{/Control}');
    // Type opening paren
    await userEvent.keyboard('(');

    await waitFor(() => lastFormula === '(price)');
    expect(handleRef!.getValue()).toBe('(price)');
  });

  it('typing " with a selection wraps it in double quotes', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    let lastFormula = 'hello';
    renderInto(
      React.createElement(FormulaEditor, {
        ref: (h: FormulaEditorHandle | null) => { handleRef = h; },
        defaultValue: 'hello',
        columns: COLUMNS,
        onChange: (formula: string) => { lastFormula = formula; },
      } as any),
    );

    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.keyboard('"');

    await waitFor(() => lastFormula === '"hello"');
    expect(handleRef!.getValue()).toBe('"hello"');
  });

  it('End key jumps selection to last dropdown item', async () => {
    renderInto(
      React.createElement(FormulaEditor, {
        columns: COLUMNS,
        functions: FUNCTIONS,
      }),
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('{Control>} {/Control}');

    await waitFor(() => {
      const items = document.querySelectorAll('[style*="z-index"]');
      return items.length > 0 && (items[0].textContent?.includes('price') ?? false);
    });

    await userEvent.keyboard('{End}');

    // Find the dropdown and verify the last item is highlighted (selected style)
    // The selected item has dropdownSelected background color
    const selected = await waitFor(() => {
      const items = document.querySelectorAll('[style*="z-index"] > div');
      if (items.length === 0) return false;
      const last = items[items.length - 1] as HTMLElement;
      return last.style.backgroundColor !== '' && last.style.backgroundColor !== 'transparent';
    });
    expect(selected).toBe(true);
  });

  it('selecting a function suggestion inserts () and places caret between', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    let lastFormula = '';
    renderInto(
      React.createElement(FormulaEditor, {
        ref: (h: FormulaEditorHandle | null) => { handleRef = h; },
        columns: COLUMNS,
        functions: FUNCTIONS,
        onChange: (formula: string) => { lastFormula = formula; },
      } as any),
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.type(locator, 'ROU');
    await waitFor(() => {
      const items = document.querySelectorAll('[style*="z-index"]');
      for (const item of items) {
        if (item.textContent?.includes('ROUND')) return true;
      }
      return false;
    });
    await userEvent.keyboard('{Tab}');
    await waitFor(() => lastFormula === 'ROUND()');
    expect(handleRef!.getValue()).toBe('ROUND()');
    // Continuing to type should land inside the parens
    await userEvent.type(locator, 'x');
    await waitFor(() => handleRef!.getValue() === 'ROUND(x)');
    expect(handleRef!.getValue()).toBe('ROUND(x)');
  });

  it('selecting a function does not duplicate parens when they already follow', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    let lastFormula = '';
    renderInto(
      React.createElement(FormulaEditor, {
        ref: (h: FormulaEditorHandle | null) => { handleRef = h; },
        defaultValue: 'r()',
        columns: COLUMNS,
        functions: FUNCTIONS,
        onChange: (formula: string) => { lastFormula = formula; },
      } as any),
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Put caret right after `r` (offset 1) using Home + ArrowRight
    await userEvent.keyboard('{Home}{ArrowRight}');
    // Trigger autocomplete — ctx.type is 'function' here because `(` already follows
    await userEvent.keyboard('{Control>} {/Control}');
    await waitFor(() => {
      const items = document.querySelectorAll('[style*="z-index"]');
      for (const item of items) {
        if (item.textContent?.includes('ROUND')) return true;
      }
      return false;
    });
    await userEvent.keyboard('{Tab}');
    await waitFor(() => lastFormula === 'ROUND()');
    expect(handleRef!.getValue()).toBe('ROUND()');
    // Typing should land between the existing parens (caret was moved past `(`)
    await userEvent.type(locator, '1');
    await waitFor(() => handleRef!.getValue() === 'ROUND(1)');
    expect(handleRef!.getValue()).toBe('ROUND(1)');
  });
});
