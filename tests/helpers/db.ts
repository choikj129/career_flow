import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, runMigrations, type Db } from '@/lib/db/client';

export function makeTestDb(): Db {
  const dir = mkdtempSync(join(tmpdir(), 'cf-db-'));
  const db = createDb(join(dir, 'test.db'));
  runMigrations(db);
  return db;
}
