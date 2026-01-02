import { type User, type InsertUser, type Map, type InsertMap, users, maps } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Map operations
  getMap(id: number): Promise<Map | undefined>;
  listMaps(): Promise<Map[]>;
  createMap(map: InsertMap): Promise<Map>;
  updateMap(id: number, map: Partial<InsertMap>): Promise<Map>;
  deleteMap(id: number): Promise<void>;
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

  async getMap(id: number): Promise<Map | undefined> {
    const [map] = await db.select().from(maps).where(eq(maps.id, id));
    return map;
  }

  async listMaps(): Promise<Map[]> {
    return await db.select().from(maps).orderBy(maps.updatedAt);
  }

  async createMap(insertMap: InsertMap): Promise<Map> {
    const [map] = await db.insert(maps).values(insertMap).returning();
    return map;
  }

  async updateMap(id: number, update: Partial<InsertMap>): Promise<Map> {
    const [map] = await db
      .update(maps)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(maps.id, id))
      .returning();
    if (!map) throw new Error("Map not found");
    return map;
  }

  async deleteMap(id: number): Promise<void> {
    await db.delete(maps).where(eq(maps.id, id));
  }
}

export const storage = new DatabaseStorage();
