import { describe, expect, it } from 'vitest';
import { isDraftNewer } from './local-draft';

describe('offline draft recovery', () => {
  it('recovers a draft saved after the database copy', () => {
    expect(isDraftNewer('2026-11-16T12:01:00.000Z', '2026-11-16T12:00:00.000Z')).toBe(true);
  });

  it('keeps the database copy when its timestamp is newer or equal', () => {
    expect(isDraftNewer('2026-11-16T12:00:00.000Z', '2026-11-16T12:00:00.000Z')).toBe(false);
    expect(isDraftNewer('2026-11-16T11:59:00.000Z', '2026-11-16T12:00:00.000Z')).toBe(false);
  });

  it('recovers a valid draft when the visitor has no server map', () => {
    expect(isDraftNewer('2026-11-16T12:00:00.000Z')).toBe(true);
    expect(isDraftNewer('invalid')).toBe(false);
  });
});
