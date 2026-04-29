import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function initDb(path: string): Database {
  const db = new Database(path);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const rows = db.query('SELECT version FROM schema_migrations').all() as Array<{
    version: string;
  }>;
  const applied = new Set(rows.map((r) => r.version));
  const dir = join(import.meta.dir, '../migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    db.transaction(() => {
      db.run(sql);
      db.query('INSERT INTO schema_migrations(version) VALUES (?)').run(f);
    })();
    console.log(`[db] migrated ${f}`);
  }
}
