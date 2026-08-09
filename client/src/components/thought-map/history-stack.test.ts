import { describe, it, expect } from 'vitest';
import { create, commit, undo, redo, canUndo, canRedo, LIMIT } from './history-stack';

/**
 * The stack is tested on plain strings rather than on graphs, because the whole
 * point of the abstraction is that it does not know what it is holding.
 */
describe('history-stack', () => {
  it('starts with a present and nothing to undo or redo', () => {
    const h = create('a');
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('makes the previous present undoable when a snapshot is committed', () => {
    const h = commit(create('a'), 'b');
    expect(h.present).toBe('b');
    expect(canUndo(h)).toBe(true);
    expect(undo(h).present).toBe('a');
  });

  it('round-trips through undo and redo', () => {
    const h = commit(commit(create('a'), 'b'), 'c');
    const back = undo(undo(h));
    expect(back.present).toBe('a');
    expect(redo(redo(back)).present).toBe('c');
  });

  it('treats undo at the start of history as a no-op', () => {
    const h = create('a');
    expect(undo(h)).toEqual(h);
  });

  it('treats redo at the end of history as a no-op', () => {
    const h = commit(create('a'), 'b');
    expect(redo(h)).toEqual(h);
  });

  it('drops the redo branch when a new snapshot is committed after an undo', () => {
    // a -> b -> c, step back to b, then branch to d. c is unreachable.
    const h = commit(commit(create('a'), 'b'), 'c');
    const branched = commit(undo(h), 'd');
    expect(branched.present).toBe('d');
    expect(canRedo(branched)).toBe(false);
    expect(undo(branched).present).toBe('b');
  });

  it('does not commit a snapshot identical to the present', () => {
    // Drag-end fires even when nothing moved; an unchanged snapshot would
    // otherwise cost the user a wasted Cmd+Z that appears to do nothing.
    const h = commit(create('a'), 'a');
    expect(canUndo(h)).toBe(false);
  });

  it('discards the oldest entries past the limit but keeps the present', () => {
    let h = create(0);
    for (let i = 1; i <= LIMIT + 10; i++) h = commit(h, i);
    expect(h.present).toBe(LIMIT + 10);
    expect(h.past).toHaveLength(LIMIT);
    // The oldest survivor is the entry LIMIT steps back, not the original 0.
    expect(h.past[0]).toBe(10);
  });

  it('never mutates the history it is given', () => {
    const h = create('a');
    const frozen = JSON.stringify(h);
    commit(h, 'b');
    undo(commit(h, 'b'));
    expect(JSON.stringify(h)).toBe(frozen);
  });
});
