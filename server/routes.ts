import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMapSchema } from "@shared/schema";

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

  app.get("/api/maps", route(async (_req, res) => {
    const maps = await storage.listMaps();
    res.json(maps);
  }));

  app.get("/api/maps/:id", route(async (req, res) => {
    const map = await storage.getMap(Number(req.params.id));
    if (!map) return res.status(404).send("Map not found");
    res.json(map);
  }));

  app.post("/api/maps", route(async (req, res) => {
    const parsed = insertMapSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const map = await storage.createMap(parsed.data);
    res.json(map);
  }));

  app.patch("/api/maps/:id", route(async (req, res) => {
    const map = await storage.updateMap(Number(req.params.id), req.body);
    res.json(map);
  }));

  app.delete("/api/maps/:id", route(async (req, res) => {
    await storage.deleteMap(Number(req.params.id));
    res.sendStatus(204);
  }));

  return httpServer;
}
