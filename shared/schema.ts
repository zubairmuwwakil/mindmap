import { pgTable, text, serial, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const maps = pgTable("maps", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nodes: jsonb("nodes").$type<any[]>().notNull(),
  edges: jsonb("edges").$type<any[]>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertMapSchema = createInsertSchema(maps).omit({ id: true, updatedAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Map = typeof maps.$inferSelect;
export type InsertMap = z.infer<typeof insertMapSchema>;
