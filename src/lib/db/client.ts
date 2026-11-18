import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import { config, ensureDataDirs } from '@/lib/config';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function createDb(path: string): Db {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
}

const g = globalThis as unknown as { __cfDb?: Db };

export function getDb(): Db {
  if (!g.__cfDb) {
    ensureDataDirs();
    g.__cfDb = createDb(config.dbPath);
  }
  return g.__cfDb;
}
