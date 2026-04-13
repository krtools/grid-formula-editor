import { describe, it, expect } from 'vitest';
import { UndoStack } from '../src/editor/utils/undoStack';

describe('UndoStack', () => {
  it('starts with nothing to undo or redo', () => {
    const stack = new UndoStack();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
    expect(stack.current()).toBe(null);
    expect(stack.undo()).toBe(null);
    expect(stack.redo()).toBe(null);
  });

  it('push + undo + redo cycle', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    stack.push({ value: 'abc', cursorPos: 3 });

    expect(stack.current()!.value).toBe('abc');
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);

    const undone = stack.undo();
    expect(undone!.value).toBe('ab');
    expect(stack.canRedo()).toBe(true);

    const redone = stack.redo();
    expect(redone!.value).toBe('abc');
    expect(stack.canRedo()).toBe(false);
  });

  it('push after undo discards redo history', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    stack.push({ value: 'abc', cursorPos: 3 });

    stack.undo(); // → ab
    stack.push({ value: 'ax', cursorPos: 2 });

    expect(stack.current()!.value).toBe('ax');
    expect(stack.canRedo()).toBe(false);
    expect(stack.length).toBe(3); // a, ab, ax
  });

  it('deduplicates identical values', () => {
    const stack = new UndoStack();
    stack.push({ value: 'hello', cursorPos: 3 });
    stack.push({ value: 'hello', cursorPos: 5 });

    expect(stack.length).toBe(1);
    expect(stack.current()!.cursorPos).toBe(5);
  });

  it('replaceCurrent updates the top entry', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    stack.replaceCurrent({ value: 'abc', cursorPos: 3 });

    expect(stack.length).toBe(2);
    expect(stack.current()!.value).toBe('abc');

    const undone = stack.undo();
    expect(undone!.value).toBe('a');
  });

  it('replaceCurrent on empty stack pushes', () => {
    const stack = new UndoStack();
    stack.replaceCurrent({ value: 'x', cursorPos: 1 });
    expect(stack.length).toBe(1);
    expect(stack.current()!.value).toBe('x');
  });

  it('respects max size', () => {
    const stack = new UndoStack(3);
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'b', cursorPos: 1 });
    stack.push({ value: 'c', cursorPos: 1 });
    stack.push({ value: 'd', cursorPos: 1 });

    expect(stack.length).toBe(3);
    // Oldest 'a' was trimmed
    const u1 = stack.undo();
    expect(u1!.value).toBe('c');
    const u2 = stack.undo();
    expect(u2!.value).toBe('b');
    expect(stack.canUndo()).toBe(false);
  });

  it('clear resets the stack', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'b', cursorPos: 1 });
    stack.clear();

    expect(stack.length).toBe(0);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
    expect(stack.current()).toBe(null);
  });

  it('undo returns null at the bottom of the stack', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    expect(stack.undo()).toBe(null);
  });

  it('redo returns null at the top of the stack', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    expect(stack.redo()).toBe(null);
  });
});
