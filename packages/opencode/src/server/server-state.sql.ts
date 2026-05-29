import { integer, sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const ServerSavedTable = sqliteTable(
  "server_saved",
  {
    key: text().primaryKey(),
    url: text().notNull(),
    display_name: text(),
    username: text(),
    password: text(),
    position: integer().notNull(),
    is_default: integer({ mode: "boolean" }).notNull().default(false),
    last_project: text(),
    ...Timestamps,
  },
  (table) => [index("server_saved_position_idx").on(table.position), index("server_saved_default_idx").on(table.is_default)],
)

export const ServerSavedProjectTable = sqliteTable(
  "server_saved_project",
  {
    server_key: text()
      .notNull()
      .references(() => ServerSavedTable.key, { onDelete: "cascade", onUpdate: "cascade" }),
    worktree: text().notNull(),
    position: integer().notNull(),
    expanded: integer({ mode: "boolean" }).notNull().default(true),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.server_key, table.worktree] }),
    index("server_saved_project_position_idx").on(table.server_key, table.position),
  ],
)
