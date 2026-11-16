import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";

const SECURE_COOKIE = process.env.NODE_ENV === "production" && process.env.MINDSKY_INSECURE_COOKIE !== "1";
const COOKIE_NAME = SECURE_COOKIE ? "__Host-mindsky" : "mindsky-visitor";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type Visitor = { ownerHash: string; csrfToken: string };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function visitorCookie(req: Request): string | undefined {
  const values = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (values.length !== 1) return undefined;
  const token = values[0].slice(COOKIE_NAME.length + 1);
  return TOKEN_PATTERN.test(token) ? token : undefined;
}

export const identifyVisitor: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  let token = visitorCookie(req);
  if (!token) {
    token = randomBytes(32).toString("base64url");
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_AGE_MS,
    });
  }
  res.locals.visitor = {
    ownerHash: hash(`owner:${token}`),
    csrfToken: hash(`csrf:${token}`),
  } satisfies Visitor;
  res.set("Cache-Control", "private, no-store");
  next();
};

export const requireCsrf: RequestHandler = (_req, res, next) => {
  const expected = (res.locals.visitor as Visitor).csrfToken;
  const supplied = _req.get("X-MindSky-CSRF") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ message: "Invalid request token" });
    return;
  }
  next();
};

export function validLegacyClaimCode(code: unknown): boolean {
  const expected = process.env.MINDSKY_LEGACY_CLAIM_CODE;
  if (!expected || expected.length < 32 || typeof code !== "string") return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(code).digest();
  return timingSafeEqual(a, b);
}
