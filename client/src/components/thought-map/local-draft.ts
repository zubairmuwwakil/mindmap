/**
 * The browser-only fallback for when the API cannot reach Postgres.
 *
 * This is deliberately a fallback and not a second source of truth: the canvas
 * always tries the server first, and only writes here when that fails. The UI
 * says which one it is using, so "saved" never means "saved in Postgres" when
 * it did not.
 *
 * Every access is wrapped: storage can be disabled, full, or throw in private
 * windows, and a failed fallback must not break the canvas.
 */
const KEY = "mindsky:draft:v1";

export type LocalDraft<N, E> = { nodes: N[]; edges: E[]; savedAt: string };

export function readDraft<N, E>(): LocalDraft<N, E> | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Returns false when the browser would not store it either. */
export function writeDraft<N, E>(nodes: N[], edges: E[]): boolean {
  try {
    const draft: LocalDraft<N, E> = { nodes, edges, savedAt: new Date().toISOString() };
    window.localStorage.setItem(KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
