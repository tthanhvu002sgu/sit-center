import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cameraSessions = sqliteTable("camera_sessions", {
  id: text("id").primaryKey(),
  offer: text("offer"),
  answer: text("answer"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
