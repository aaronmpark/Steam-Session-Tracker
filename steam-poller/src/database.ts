import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";
import { CompletedSession } from "./types";

const DB_PATH = path.join(process.cwd(), "sessions.db");

// ─── Schema ───────────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS games (
    app_id       TEXT PRIMARY KEY,
    name         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id         TEXT NOT NULL,
    game_name      TEXT NOT NULL,
    started_at     TEXT NOT NULL,
    ended_at       TEXT NOT NULL,
    duration_s     INTEGER NOT NULL,
    synced_to_cloud INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  );
`;

// ─── DB Singleton ─────────────────────────────────────────────────────────────

let db: Database | null = null;

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  // Load existing DB file if it exists, otherwise create fresh
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`📂 Loaded existing database from ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`🆕 Created new database at ${DB_PATH}`);
  }

  db.run(CREATE_TABLES);
  persist(); // save schema immediately
}

// ─── Persist to disk (call after every write) ─────────────────────────────────

function persist(): void {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDb(): Database {
  if (!db) throw new Error("Database not initialized — call initDatabase() first");
  return db;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export function saveSession(session: CompletedSession): number {
  const database = getDb();

  // Upsert game metadata
  database.run(
    `INSERT OR IGNORE INTO games (app_id, name) VALUES (?, ?)`,
    [session.appId, session.gameName]
  );

  // Insert session
  database.run(
    `INSERT INTO sessions (app_id, game_name, started_at, ended_at, duration_s)
     VALUES (?, ?, ?, ?, ?)`,
    [
      session.appId,
      session.gameName,
      session.startedAt.toISOString(),
      session.endedAt.toISOString(),
      session.durationSeconds,
    ]
  );

  persist();

  // Return the new row ID
  const result = database.exec(`SELECT last_insert_rowid() as id`);
  return result[0]?.values[0]?.[0] as number;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: number;
  app_id: string;
  game_name: string;
  started_at: string;
  ended_at: string;
  duration_s: number;
  synced_to_cloud: number;
  created_at: string;
}

export function getAllSessions(): SessionRow[] {
  const result = getDb().exec(
    `SELECT * FROM sessions ORDER BY started_at DESC`
  );
  if (!result.length) return [];
  const [{ columns, values }] = result;
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])) as unknown as SessionRow
  );
}

export function getSessionsByGame(appId: string): SessionRow[] {
  const result = getDb().exec(
    `SELECT * FROM sessions WHERE app_id = ? ORDER BY started_at DESC`,
    [appId]
  );
  if (!result.length) return [];
  const [{ columns, values }] = result;
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])) as unknown as SessionRow
  );
}

export interface GameStats {
  app_id: string;
  game_name: string;
  session_count: number;
  total_seconds: number;
  avg_seconds: number;
  longest_seconds: number;
}

export function getStatsPerGame(): GameStats[] {
  const result = getDb().exec(`
    SELECT
      app_id,
      game_name,
      COUNT(*)         AS session_count,
      SUM(duration_s)  AS total_seconds,
      AVG(duration_s)  AS avg_seconds,
      MAX(duration_s)  AS longest_seconds
    FROM sessions
    GROUP BY app_id
    ORDER BY total_seconds DESC
  `);
  if (!result.length) return [];
  const [{ columns, values }] = result;
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])) as unknown as GameStats
  );
}

export function getUnsyncedSessions(): SessionRow[] {
  const result = getDb().exec(
    `SELECT * FROM sessions WHERE synced_to_cloud = 0 ORDER BY started_at ASC`
  );
  if (!result.length) return [];
  const [{ columns, values }] = result;
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])) as unknown as SessionRow
  );
}

export function markSessionSynced(id: number): void {
  getDb().run(`UPDATE sessions SET synced_to_cloud = 1 WHERE id = ?`, [id]);
  persist();
}
