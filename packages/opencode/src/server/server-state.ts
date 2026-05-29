import z from "zod"
import { Database, eq } from "@/storage/db"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { ServerSavedProjectTable, ServerSavedTable } from "./server-state.sql"

const StoredProject = z.object({
  worktree: z.string(),
  expanded: z.boolean(),
})

const StoredServer = z.object({
  key: z.string(),
  url: z.string(),
  displayName: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
})

export const ServerState = z.object({
  list: z.array(StoredServer),
  default: z.string().optional(),
  projects: z.record(z.string(), z.array(StoredProject)),
  lastProject: z.record(z.string(), z.string()),
})

export type ServerState = z.infer<typeof ServerState>
export type StoredServer = z.infer<typeof StoredServer>
export type StoredProject = z.infer<typeof StoredProject>

export const ServerStateUpdatedEvent = BusEvent.define("global.server.updated", z.object({}))

type Tx = Parameters<typeof Database.use>[0] extends (db: infer T) => unknown ? T : never

function emitUpdated() {
  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: ServerStateUpdatedEvent.type,
      properties: {},
    },
  })
}

function rows() {
  const list = Database.use((db) => db.select().from(ServerSavedTable).all()).sort((a, b) => a.position - b.position)
  const projectRows = Database.use((db) => db.select().from(ServerSavedProjectTable).all())
  return { list, projectRows }
}

function state() {
  const { list, projectRows } = rows()
  const projects = projectRows
    .sort((a, b) => a.position - b.position)
    .reduce<Record<string, StoredProject[]>>((acc, row) => {
      const current = acc[row.server_key] ?? []
      current.push({ worktree: row.worktree, expanded: row.expanded })
      acc[row.server_key] = current
      return acc
    }, {})

  const lastProject = list.reduce<Record<string, string>>((acc, row) => {
    if (row.last_project) acc[row.key] = row.last_project
    return acc
  }, {})

  const out: ServerState = {
    list: list.map((row) => ({
      key: row.key,
      url: row.url,
      displayName: row.display_name ?? undefined,
      username: row.username ?? undefined,
      password: row.password ?? undefined,
    })),
    default: list.find((row) => row.is_default)?.key,
    projects,
    lastProject,
  }

  return out
}

function nextPosition() {
  const list = Database.use((db) => db.select().from(ServerSavedTable).all())
  return list.length === 0 ? 0 : Math.max(...list.map((row) => row.position)) + 1
}

function replaceProjects(tx: Tx, key: string, projects: StoredProject[]) {
  tx.delete(ServerSavedProjectTable).where(eq(ServerSavedProjectTable.server_key, key)).run()
  if (projects.length === 0) return
  tx.insert(ServerSavedProjectTable)
    .values(
      projects.map((project, position) => ({
        server_key: key,
        worktree: project.worktree,
        position,
        expanded: project.expanded,
        time_created: Date.now(),
        time_updated: Date.now(),
      })),
    )
    .run()
}

export namespace SavedServer {
  export const State = ServerState

  export function get() {
    return state()
  }

  export function replace(input: ServerState) {
    const parsed = ServerState.parse(input)
    Database.transaction((tx) => {
      tx.delete(ServerSavedProjectTable).run()
      tx.delete(ServerSavedTable).run()

      parsed.list.forEach((server, position) => {
        tx.insert(ServerSavedTable)
          .values({
            key: server.key,
            url: server.url,
            display_name: server.displayName ?? null,
            username: server.username ?? null,
            password: server.password ?? null,
            position,
            is_default: parsed.default === server.key,
            last_project: parsed.lastProject[server.key] ?? null,
            time_created: Date.now(),
            time_updated: Date.now(),
          })
          .run()
        replaceProjects(tx, server.key, parsed.projects[server.key] ?? [])
      })
    })
    emitUpdated()
    return get()
  }

  export function add(input: StoredServer) {
    const server = StoredServer.parse(input)
    Database.use((db) =>
      db.insert(ServerSavedTable)
        .values({
          key: server.key,
          url: server.url,
          display_name: server.displayName ?? null,
          username: server.username ?? null,
          password: server.password ?? null,
          position: nextPosition(),
          is_default: false,
          last_project: null,
          time_created: Date.now(),
          time_updated: Date.now(),
        })
        .onConflictDoUpdate({
          target: ServerSavedTable.key,
          set: {
            url: server.url,
            display_name: server.displayName ?? null,
            username: server.username ?? null,
            password: server.password ?? null,
            time_updated: Date.now(),
          },
        })
        .run(),
    )
    emitUpdated()
    return get()
  }

  export function update(key: string, input: StoredServer) {
    const server = StoredServer.parse(input)
    const row = Database.use((db) => db.select().from(ServerSavedTable).where(eq(ServerSavedTable.key, key)).get())
    if (!row) return
    Database.transaction((tx) => {
      tx.update(ServerSavedTable)
        .set({
          key: server.key,
          url: server.url,
          display_name: server.displayName ?? null,
          username: server.username ?? null,
          password: server.password ?? null,
          time_updated: Date.now(),
        })
        .where(eq(ServerSavedTable.key, key))
        .run()
    })
    emitUpdated()
    return get()
  }

  export function remove(key: string) {
    Database.use((db) => db.delete(ServerSavedTable).where(eq(ServerSavedTable.key, key)).run())
    emitUpdated()
    return get()
  }

  export function setDefault(key?: string) {
    Database.transaction((tx) => {
      tx.update(ServerSavedTable).set({ is_default: false, time_updated: Date.now() }).run()
      if (!key) return
      tx.update(ServerSavedTable)
        .set({ is_default: true, time_updated: Date.now() })
        .where(eq(ServerSavedTable.key, key))
        .run()
    })
    emitUpdated()
    return get()
  }

  export function setProjects(key: string, input: StoredProject[]) {
    const projects = z.array(StoredProject).parse(input)
    Database.transaction((tx) => {
      replaceProjects(tx, key, projects)
      tx.update(ServerSavedTable).set({ time_updated: Date.now() }).where(eq(ServerSavedTable.key, key)).run()
    })
    emitUpdated()
    return get()
  }

  export function setLastProject(key: string, directory?: string) {
    Database.use((db) =>
      db.update(ServerSavedTable)
        .set({
          last_project: directory ?? null,
          time_updated: Date.now(),
        })
        .where(eq(ServerSavedTable.key, key))
        .run(),
    )
    emitUpdated()
    return get()
  }
}
