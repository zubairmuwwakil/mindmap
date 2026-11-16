import { afterEach, describe, expect, it, vi } from 'vitest';
import { identifyVisitor, requireCsrf, validLegacyClaimCode } from './visitor';

function visit(cookie?: string) {
  const req = { headers: { cookie }, get: (name: string) => name === 'X-MindSky-CSRF' ? '' : undefined } as any;
  const res = {
    locals: {} as any,
    cookie: vi.fn(),
    set: vi.fn(),
  } as any;
  const next = vi.fn();
  identifyVisitor(req, res, next);
  return { visitor: res.locals.visitor, cookie: res.cookie, next };
}

describe('private visitor identity', () => {
  it('reuses one browser identity but isolates a different browser', () => {
    const first = visit();
    const token = first.cookie.mock.calls[0][1];
    const second = visit(`mindsky-visitor=${token}`);
    const third = visit();
    expect(second.visitor.ownerHash).toBe(first.visitor.ownerHash);
    expect(second.cookie).not.toHaveBeenCalled();
    expect(third.visitor.ownerHash).not.toBe(first.visitor.ownerHash);
  });

  it('rejects map changes without the matching request token', () => {
    const { visitor } = visit();
    const res = { locals: { visitor }, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    requireCsrf({ get: () => 'wrong' } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    requireCsrf({ get: () => visitor.csrfToken } as any, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('legacy claim code', () => {
  const previous = process.env.MINDSKY_LEGACY_CLAIM_CODE;
  afterEach(() => {
    if (previous === undefined) delete process.env.MINDSKY_LEGACY_CLAIM_CODE;
    else process.env.MINDSKY_LEGACY_CLAIM_CODE = previous;
  });

  it('requires a configured long code and an exact match', () => {
    process.env.MINDSKY_LEGACY_CLAIM_CODE = 'a'.repeat(32);
    expect(validLegacyClaimCode('a'.repeat(32))).toBe(true);
    expect(validLegacyClaimCode('b'.repeat(32))).toBe(false);
    process.env.MINDSKY_LEGACY_CLAIM_CODE = 'short';
    expect(validLegacyClaimCode('short')).toBe(false);
  });
});
