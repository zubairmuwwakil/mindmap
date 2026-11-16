import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { insertMapSchema } from "@shared/schema";
import { identifyVisitor, requireCsrf, validLegacyClaimCode, type Visitor } from "./visitor";

function publicMap<T extends { ownerHash: string | null }>(map: T): Omit<T, "ownerHash"> {
  const { ownerHash: _ownerHash, ...visible } = map;
  return visible;
}

function mapId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Forward a rejected async handler to Express's error middleware.
 *
 * Express 4 does not await route handlers, so a rejected promise never reaches
 * the error handler — it surfaces as an unhandled rejection instead, and Node
 * has terminated the process on those since v15. Every route below queries
 * Postgres, so an unreachable database was not returning 500s: it was killing
 * the server, taking the frontend down with it, and earning a restart that the
 * next request killed again.
 *
 * Express 5 does this natively. Until then, one wrapper per route.
 */
function route(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Answers "is the database reachable?" without touching any table, so it can
  // serve as Render's health check and as the one-line check after a restore.
  app.get("/api/health", route(async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ ok: true, database: "up" });
    } catch (err: any) {
      console.error("[health] database check failed:", err?.message);
      res.status(503).json({ ok: false, database: "down" });
    }
  }));

  app.get("/api/session", identifyVisitor, (_req, res) => {
    res.json({ csrfToken: (res.locals.visitor as Visitor).csrfToken });
  });

  app.use("/api/maps", identifyVisitor);

  app.get("/api/maps", route(async (_req, res) => {
    const ownerHash = (res.locals.visitor as Visitor).ownerHash;
    const maps = await storage.listMaps(ownerHash);
    res.json(maps.map(publicMap));
  }));

  app.post("/api/maps/claim-legacy", requireCsrf, route(async (req, res) => {
    if (!validLegacyClaimCode(req.body?.code)) return res.status(403).json({ message: "Invalid recovery code" });
    const ownerHash = (res.locals.visitor as Visitor).ownerHash;
    const claimed = await storage.claimLegacyMaps(ownerHash);
    res.json({ maps: claimed.map(publicMap) });
  }));

  app.get("/api/maps/:id", route(async (req, res) => {
    const id = mapId(req.params.id);
    if (!id) return res.status(404).send("Map not found");
    const map = await storage.getMap(id, (res.locals.visitor as Visitor).ownerHash);
    if (!map) return res.status(404).send("Map not found");
    res.json(publicMap(map));
  }));

  app.post("/api/maps", requireCsrf, route(async (req, res) => {
    const parsed = insertMapSchema.strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const map = await storage.createMap(parsed.data, (res.locals.visitor as Visitor).ownerHash);
    res.json(publicMap(map));
  }));

  app.patch("/api/maps/:id", requireCsrf, route(async (req, res) => {
    const id = mapId(req.params.id);
    if (!id) return res.status(404).send("Map not found");
    const parsed = insertMapSchema.partial().strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const map = await storage.updateMap(id, (res.locals.visitor as Visitor).ownerHash, parsed.data);
    if (!map) return res.status(404).send("Map not found");
    res.json(publicMap(map));
  }));

  app.delete("/api/maps/:id", requireCsrf, route(async (req, res) => {
    const id = mapId(req.params.id);
    if (!id) return res.status(404).send("Map not found");
    const deleted = await storage.deleteMap(id, (res.locals.visitor as Visitor).ownerHash);
    if (!deleted) return res.status(404).send("Map not found");
    res.sendStatus(204);
  }));

  return httpServer;
}
