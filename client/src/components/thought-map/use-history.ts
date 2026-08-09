import { useCallback, useReducer, useRef } from 'react';
import {
  create,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  type History,
} from './history-stack';

/**
 * React binding for the snapshot stack.
 *
 * The history lives in a ref rather than in state so that `stepBack` can hand
 * the caller the restored snapshot synchronously. Returning it from a setState
 * updater would be unreliable — React may defer or double-invoke the updater —
 * and the canvas needs the value in the same tick to push it into React Flow.
 *
 * A render is forced separately, purely so the undo/redo buttons can reflect
 * whether there is anywhere to go.
 */
export interface UseHistory<T> {
  commitSnapshot: (next: T) => void;
  /** The snapshot to apply, or null when there is nothing to undo. */
  stepBack: () => T | null;
  stepForward: () => T | null;
  /** Restart history from `next`, discarding both directions. */
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): UseHistory<T> {
  const ref = useRef<History<T>>(create(initial));
  const [, render] = useReducer((n: number) => n + 1, 0);

  const commitSnapshot = useCallback((next: T) => {
    const before = ref.current;
    ref.current = commit(before, next);
    // commit returns the same object when nothing changed; no need to re-render.
    if (ref.current !== before) render();
  }, []);

  const stepBack = useCallback((): T | null => {
    if (!canUndo(ref.current)) return null;
    ref.current = undo(ref.current);
    render();
    return ref.current.present;
  }, []);

  const stepForward = useCallback((): T | null => {
    if (!canRedo(ref.current)) return null;
    ref.current = redo(ref.current);
    render();
    return ref.current.present;
  }, []);

  const reset = useCallback((next: T) => {
    ref.current = create(next);
    render();
  }, []);

  return {
    commitSnapshot,
    stepBack,
    stepForward,
    reset,
    canUndo: canUndo(ref.current),
    canRedo: canRedo(ref.current),
  };
}
