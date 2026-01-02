import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMapSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/maps", async (_req, res) => {
    const maps = await storage.listMaps();
    res.json(maps);
  });

  app.get("/api/maps/:id", async (req, res) => {
    const map = await storage.getMap(Number(req.params.id));
    if (!map) return res.status(404).send("Map not found");
    res.json(map);
  });

  app.post("/api/maps", async (req, res) => {
    const parsed = insertMapSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const map = await storage.createMap(parsed.data);
    res.json(map);
  });

  app.patch("/api/maps/:id", async (req, res) => {
    const map = await storage.updateMap(Number(req.params.id), req.body);
    res.json(map);
  });

  app.delete("/api/maps/:id", async (req, res) => {
    await storage.deleteMap(Number(req.params.id));
    res.sendStatus(204);
  });

  return httpServer;
}
