/**
 * An undo/redo stack over immutable snapshots.
 *
 * Deliberately free of React and of React Flow: the canvas decides *when* a
 * change is meaningful enough to remember, and this decides *what remembering
 * means*. Keeping the two apart is what makes the rule "drag-end commits, drag
 * does not" a one-line decision at the call site instead of a condition buried
 * in a reducer.
 *
 * Every function returns a new history and never mutates its argument, so a
 * snapshot handed to `commit` can be held elsewhere without being aliased.
 */

export interface History<T> {
  /** Oldest first. The entry a single undo returns to is the last one. */
  readonly past: readonly T[];
  readonly present: T;
  /** Nearest first: the entry a single redo advances to is `future[0]`. */
  readonly future: readonly T[];
}

/**
 * How many steps back the user can go. Each entry is a whole graph, so this is
 * a memory ceiling as much as a UX one; 50 is far past the point where anyone
 * keeps a mental model of what Cmd+Z will do.
 */
export const LIMIT = 50;

export function create<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Structural, not referential. Snapshots are rebuilt on every change, so
 * reference equality would never fire, and `commit` has to be able to tell that
 * a drag-end which moved nothing is not worth a history entry.
 *
 * Relies on stable key order, which holds because snapshots are built by one
 * code path rather than assembled from arbitrary sources.
 */
function same<T>(a: T, b: T): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Record `present` as the new current state.
 *
 * Committing discards the redo branch. That is the standard editor contract:
 * once you undo and then do something new, the future you abandoned is gone.
 */
export function commit<T>(history: History<T>, present: T, limit: number = LIMIT): History<T> {
  if (same(history.present, present)) return history;

  const past = [...history.past, history.present];
  // Drop from the front: the oldest states are the ones nobody returns to.
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present,
    future: [],
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];
  return { past, present, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
