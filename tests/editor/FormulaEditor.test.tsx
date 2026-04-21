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
      <FormulaEditor placeholder="Enter formula..." columns={COLUMNS} />,
    );
    const container = document.querySelector('[data-testid="formula-editor"]')?.parentElement;
    expect(container?.textContent).toContain('Enter formula...');
  });

  it('renders defaultValue and syntax highlights tokens', () => {
    renderInto(
      <FormulaEditor defaultValue="price + 10" columns={COLUMNS} functions={FUNCTIONS} />,
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
      <FormulaEditor
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={(formula, info) => {
          lastFormula = formula;
          lastInfo = info;
        }}
      />,
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
      <FormulaEditor
        columns={COLUMNS}
        onChange={(_, info) => {
          lastInfo = info;
        }}
      />,
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
      <FormulaEditor columns={COLUMNS} functions={FUNCTIONS} />,
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
      <FormulaEditor value="ROUND(price, 2)" columns={COLUMNS} functions={FUNCTIONS} />,
    );
    expect(editorText()).toBe('ROUND(price, 2)');
  });

  it('imperative handle getValue/setValue works', () => {
    let handleRef: FormulaEditorHandle | null = null;

    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="a + b"
        columns={COLUMNS}
      />,
    );

    expect(handleRef).not.toBeNull();
    expect(handleRef!.getValue()).toBe('a + b');

    handleRef!.setValue('x * y');
    expect(handleRef!.getValue()).toBe('x * y');
  });

  it('imperative handle exposes dropdown open + selected state', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        columns={COLUMNS}
        functions={FUNCTIONS}
      />,
    );

    expect(handleRef!.isDropdownOpen()).toBe(false);
    expect(handleRef!.getSelectedSuggestion()).toBeNull();

    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Typing `ROU` opens the dropdown and auto-selects ROUND (filter-extending chars)
    await userEvent.type(locator, 'ROU');
    await waitFor(() => handleRef!.isDropdownOpen() && handleRef!.getSelectedSuggestion() !== null);
    expect(handleRef!.isDropdownOpen()).toBe(true);
    const sel = handleRef!.getSelectedSuggestion();
    expect(sel).not.toBeNull();
    expect(sel!.type).toBe('function');
    expect(sel!.name).toBe('ROUND');
  });

  it('clicking while already focused reopens the dropdown when reopenDropdownOnClick is enabled', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="price + quantity"
        columns={COLUMNS}
        functions={FUNCTIONS}
        reopenDropdownOnClick
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);

    // First click just focuses — dropdown should stay closed.
    await locator.click();
    // Give focus event a frame to propagate
    await new Promise(r => setTimeout(r, 50));
    expect(handleRef!.isDropdownOpen()).toBe(false);

    // Second click, now that the editor is focused, should open the dropdown.
    await locator.click();
    await waitFor(() => handleRef!.isDropdownOpen());
    expect(handleRef!.isDropdownOpen()).toBe(true);
  });

  it('clicking while focused does NOT reopen the dropdown by default (flag off)', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="price + quantity"
        columns={COLUMNS}
        functions={FUNCTIONS}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);

    await locator.click();
    await new Promise(r => setTimeout(r, 50));
    expect(handleRef!.isDropdownOpen()).toBe(false);

    // Second click — with the flag off, the dropdown must stay closed.
    await locator.click();
    await new Promise(r => setTimeout(r, 150));
    expect(handleRef!.isDropdownOpen()).toBe(false);
  });

  it('arrow navigation to a no-context caret position dismisses the dropdown', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="42"
        columns={COLUMNS}
        functions={FUNCTIONS}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('{End}');
    await userEvent.type(locator, ' + pri');
    await waitFor(() => handleRef!.isDropdownOpen());
    expect(handleRef!.isDropdownOpen()).toBe(true);

    // Walk the caret back into the number literal (position 2, end of "42") —
    // that's a 'none' context, so the dropdown should dismiss.
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await waitFor(() => !handleRef!.isDropdownOpen());
    expect(handleRef!.isDropdownOpen()).toBe(false);
  });

  it('clicking into template text dismisses an open dropdown', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="`hello world`"
        columns={COLUMNS}
        functions={FUNCTIONS}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();

    // Programmatically place the caret inside the template text, then
    // trigger the dropdown manually via Ctrl+Space — template text has no
    // context, so suggestions are empty and the dropdown shouldn't even open.
    // Instead, simulate: open it by typing something that produces suggestions,
    // then move caret into the template text to test dismissal.
    // Easiest path: append a column reference, open dropdown, then click back.
    await userEvent.keyboard('{End}');
    await userEvent.type(locator, ' + pri');
    await waitFor(() => handleRef!.isDropdownOpen());
    expect(handleRef!.isDropdownOpen()).toBe(true);

    // Move caret into the template body (position 3, inside "hello").
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = 3;
    let node = walker.nextNode();
    let targetNode: Node | null = null;
    let targetOffset = 0;
    while (node) {
      const len = (node.textContent || '').length;
      if (remaining <= len) { targetNode = node; targetOffset = remaining; break; }
      remaining -= len;
      node = walker.nextNode();
    }
    expect(targetNode).not.toBeNull();
    const range = document.createRange();
    range.setStart(targetNode!, targetOffset);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // selectionchange is async — wait for dismissal.
    await waitFor(() => !handleRef!.isDropdownOpen());
    expect(handleRef!.isDropdownOpen()).toBe(false);
  });

  it('typing backtick with empty caret auto-closes it and places caret between', async () => {
    let lastFormula = '';
    let handleRef: FormulaEditorHandle | null = null;
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('`');
    await waitFor(() => lastFormula === '``');
    expect(lastFormula).toBe('``');
    // Caret should sit between the pair — typing text appears inside.
    await userEvent.type(locator, 'hi');
    await waitFor(() => lastFormula === '`hi`');
    expect(lastFormula).toBe('`hi`');
    expect(handleRef).not.toBeNull();
  });

  it('typing backtick before an existing backtick steps over it', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue="``"
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Caret lands at end after click; move between the two backticks.
    await userEvent.keyboard('{Home}{ArrowRight}');
    // Now caret is at position 1 (between `` and ``). Typing ` should
    // step over rather than insert → formula stays the same, caret moves past.
    await userEvent.keyboard('`');
    // Small wait to make sure nothing inserted.
    await new Promise(r => setTimeout(r, 100));
    expect(lastFormula === '``' || lastFormula === '').toBe(true);
    expect(el.textContent).toBe('``');
  });

  it('typing " with empty caret auto-closes it and places caret between', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('"');
    await waitFor(() => lastFormula === '""');
    expect(lastFormula).toBe('""');
    await userEvent.type(locator, 'hi');
    await waitFor(() => lastFormula === '"hi"');
    expect(lastFormula).toBe('"hi"');
  });

  it('typing " before an existing " steps over it', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue={'""'}
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('{Home}{ArrowRight}');
    await userEvent.keyboard('"');
    await new Promise(r => setTimeout(r, 100));
    expect(lastFormula === '""' || lastFormula === '').toBe(true);
    expect(el.textContent).toBe('""');
  });

  it("typing ' with empty caret auto-closes it and places caret between", async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard("'");
    await waitFor(() => lastFormula === "''");
    expect(lastFormula).toBe("''");
    await userEvent.type(locator, 'hi');
    await waitFor(() => lastFormula === "'hi'");
    expect(lastFormula).toBe("'hi'");
  });

  it("typing ' before an existing ' steps over it", async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue={"''"}
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('{Home}{ArrowRight}');
    await userEvent.keyboard("'");
    await new Promise(r => setTimeout(r, 100));
    expect(lastFormula === "''" || lastFormula === '').toBe(true);
    expect(el.textContent).toBe("''");
  });

  it('typing { inside a template auto-closes it and places caret between', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue="``"
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Move caret between the two backticks.
    await userEvent.keyboard('{Home}{ArrowRight}');
    // Escape `{` in userEvent.keyboard DSL with `{{`.
    await userEvent.keyboard('{{');
    await waitFor(() => lastFormula === '`{}`');
    expect(lastFormula).toBe('`{}`');
    // Caret should sit between the braces — typing appears inside.
    await userEvent.type(locator, 'x');
    await waitFor(() => lastFormula === '`{x}`');
    expect(lastFormula).toBe('`{x}`');
  });

  it('typing } before an existing } inside a template steps over it', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue="`{}`"
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Caret at end after click; move to between `{` and `}` (position 2).
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}');
    await userEvent.keyboard('}');
    await new Promise(r => setTimeout(r, 100));
    expect(lastFormula === '`{}`' || lastFormula === '').toBe(true);
    expect(el.textContent).toBe('`{}`');
  });

  it('typing { inside a string literal in a template interpolation does not auto-close', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue="`{''}`"
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Move caret between the two single quotes (position 3).
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}{ArrowRight}');
    await userEvent.keyboard('{{');
    await waitFor(() => lastFormula === "`{'{'}`");
    expect(lastFormula).toBe("`{'{'}`");
  });

  it('typing { outside a template does not auto-close', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={f => { lastFormula = f; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    await userEvent.keyboard('{{');
    await waitFor(() => lastFormula === '{');
    expect(lastFormula).toBe('{');
  });

  it('disabled editor is not editable', () => {
    renderInto(
      <FormulaEditor defaultValue="price" disabled columns={COLUMNS} />,
    );
    const el = editorEl();
    expect(el.contentEditable).toBe('false');
  });

  it('readOnly editor is not editable', () => {
    renderInto(
      <FormulaEditor defaultValue="price" readOnly columns={COLUMNS} />,
    );
    const el = editorEl();
    expect(el.contentEditable).toBe('false');
  });

  it('Ctrl+Space manually triggers autocomplete', async () => {
    renderInto(
      <FormulaEditor columns={COLUMNS} functions={FUNCTIONS} />,
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
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="price"
        columns={COLUMNS}
        onChange={formula => { lastFormula = formula; }}
      />,
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
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="hello"
        columns={COLUMNS}
        onChange={formula => { lastFormula = formula; }}
      />,
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
      <FormulaEditor columns={COLUMNS} functions={FUNCTIONS} />,
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

  it('auto-wraps selection with { }', async () => {
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        defaultValue="`Hello world`"
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={formula => { lastFormula = formula; }}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Select the "world" substring by walking to it from the start.
    // `Hello world` occupies positions 0..12; "world" is at 7..12.
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = 7;
    let startNode: Node | null = null;
    let startOffset = 0;
    let node = walker.nextNode();
    while (node) {
      const len = (node.textContent || '').length;
      if (remaining <= len) { startNode = node; startOffset = remaining; break; }
      remaining -= len;
      node = walker.nextNode();
    }
    let endRemaining = 12;
    let endNode: Node | null = null;
    let endOffset = 0;
    const walker2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n2 = walker2.nextNode();
    while (n2) {
      const len = (n2.textContent || '').length;
      if (endRemaining <= len) { endNode = n2; endOffset = endRemaining; break; }
      endRemaining -= len;
      n2 = walker2.nextNode();
    }
    expect(startNode).not.toBeNull();
    expect(endNode).not.toBeNull();
    range.setStart(startNode!, startOffset);
    range.setEnd(endNode!, endOffset);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // In userEvent.keyboard, `{` is the key-descriptor delimiter; use `{{` for a literal.
    await userEvent.keyboard('{{');
    await waitFor(() => lastFormula === '`Hello {world}`');
    expect(lastFormula).toBe('`Hello {world}`');
  });

  it('auto-wrapping with ( does not auto-select dropdown item', async () => {
    renderInto(
      <FormulaEditor
        defaultValue="price * quantity"
        columns={COLUMNS}
        functions={FUNCTIONS}
      />,
    );
    const el = editorEl();
    const locator = page.elementLocator(el);
    await locator.click();
    // Select the whole formula, then wrap with (
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.keyboard('(');

    // Dropdown may open because cursor is after `quantity`, but nothing
    // should be auto-highlighted — no item should have a non-transparent bg.
    // Give the dropdown a moment to render if it's going to.
    await new Promise(r => setTimeout(r, 100));
    const items = document.querySelectorAll('[style*="z-index"] > div');
    const hasHighlighted = Array.from(items).some(item => {
      const bg = (item as HTMLElement).style.backgroundColor;
      return bg && bg !== 'transparent';
    });
    expect(hasHighlighted).toBe(false);
  });

  it('selecting a function suggestion inserts () and places caret between', async () => {
    let handleRef: FormulaEditorHandle | null = null;
    let lastFormula = '';
    renderInto(
      <FormulaEditor
        ref={h => { handleRef = h; }}
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={formula => { lastFormula = formula; }}
      />,
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
      <FormulaEditor
        ref={h => { handleRef = h; }}
        defaultValue="r()"
        columns={COLUMNS}
        functions={FUNCTIONS}
        onChange={formula => { lastFormula = formula; }}
      />,
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
