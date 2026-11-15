import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

function normalizeParam(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

export async function createSqliteD1(options?: { dbFilePath?: string; migrationsDir?: string }): Promise<D1Database> {
  const SQL = await initSqlJs();
  const dbFilePath = options?.dbFilePath || path.resolve('.data/studio.sqlite');
  const migrationsDir = options?.migrationsDir || path.resolve('migrations');

  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

  let db: Database;
  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  const persist = () => {
    const data = db.export();
    fs.writeFileSync(dbFilePath, Buffer.from(data));
  };

  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const checkStmt = db.prepare('SELECT name FROM _migrations WHERE name = ?');
      checkStmt.bind([file]);
      const alreadyApplied = checkStmt.step();
      checkStmt.free();
      if (alreadyApplied) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      db.exec(sql);
      db.run('INSERT INTO _migrations(name) VALUES (?)', [file]);
      console.log(`[SQLite D1] Applied migration ${file}`);
    }
    persist();
  }

  const queryRows = <T = Record<string, unknown>>(sql: string, params: SqlValue[]): T[] => {
    const stmt = db.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  };

  const runStatement = (sql: string, params: SqlValue[]): D1Result => {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('WITH')) {
      const rows = queryRows(sql, params);
      return { results: rows, success: true };
    }
    const stmt = db.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = db.getRowsModified();
    persist();
    return { results: [], success: true, meta: { changes } };
  };

  const makeStatement = (query: string, bound: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return makeStatement(query, values);
    },
    async first<T = Record<string, unknown>>() {
      const rows = queryRows<T>(query, bound.map(normalizeParam));
      return rows[0] ?? null;
    },
    async all<T = Record<string, unknown>>() {
      const rows = queryRows<T>(query, bound.map(normalizeParam));
      return { results: rows, success: true };
    },
    async run() {
      return runStatement(query, bound.map(normalizeParam));
    },
  });

  return {
    prepare(query: string) {
      return makeStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const results: T[] = [];
      for (const stmt of statements) {
        results.push((await stmt.run()) as T);
      }
      persist();
      return results;
    },
  };
}
