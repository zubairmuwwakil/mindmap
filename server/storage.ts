import { type User, type InsertUser, type Map, type InsertMap, users, maps } from "@shared/schema";
import { db } from "./db";
import { and, eq, isNull } from "drizzle-orm";
import { pool } from "./db";

// Additive migration: existing shared rows stay intact for the one-time claim.
// Retry after database outages so the static app can still serve offline mode.
let ownershipSchemaReady: Promise<void> | undefined;
export function ensureMapOwnershipSchema(): Promise<void> {
  if (!ownershipSchemaReady) {
    ownershipSchemaReady = (async () => {
      await pool.query("ALTER TABLE maps ADD COLUMN IF NOT EXISTS owner_hash text");
      await pool.query("CREATE INDEX IF NOT EXISTS maps_owner_hash_updated_at_idx ON maps (owner_hash, updated_at)");
    })().catch((error) => {
      ownershipSchemaReady = undefined;
      throw error;
    });
  }
  return ownershipSchemaReady;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Map operations
  getMap(id: number, ownerHash: string): Promise<Map | undefined>;
  listMaps(ownerHash: string): Promise<Map[]>;
  createMap(map: InsertMap, ownerHash: string): Promise<Map>;
  updateMap(id: number, ownerHash: string, map: Partial<InsertMap>): Promise<Map | undefined>;
  deleteMap(id: number, ownerHash: string): Promise<boolean>;
  claimLegacyMaps(ownerHash: string): Promise<Map[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getMap(id: number, ownerHash: string): Promise<Map | undefined> {
    await ensureMapOwnershipSchema();
    const [map] = await db.select().from(maps).where(and(eq(maps.id, id), eq(maps.ownerHash, ownerHash)));
    return map;
  }

  async listMaps(ownerHash: string): Promise<Map[]> {
    await ensureMapOwnershipSchema();
    return await db.select().from(maps).where(eq(maps.ownerHash, ownerHash)).orderBy(maps.updatedAt);
  }

  async createMap(insertMap: InsertMap, ownerHash: string): Promise<Map> {
    await ensureMapOwnershipSchema();
    const [map] = await db.insert(maps).values({ ...insertMap, ownerHash }).returning();
    return map;
  }

  async updateMap(id: number, ownerHash: string, update: Partial<InsertMap>): Promise<Map | undefined> {
    await ensureMapOwnershipSchema();
    const [map] = await db
      .update(maps)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(maps.id, id), eq(maps.ownerHash, ownerHash)))
      .returning();
    return map;
  }

  async deleteMap(id: number, ownerHash: string): Promise<boolean> {
    await ensureMapOwnershipSchema();
    const deleted = await db.delete(maps).where(and(eq(maps.id, id), eq(maps.ownerHash, ownerHash))).returning({ id: maps.id });
    return deleted.length > 0;
  }

  async claimLegacyMaps(ownerHash: string): Promise<Map[]> {
    await ensureMapOwnershipSchema();
    return await db.update(maps).set({ ownerHash }).where(isNull(maps.ownerHash)).returning();
  }
}

export const storage = new DatabaseStorage();
