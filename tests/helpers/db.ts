import { join } from 'node:path';
import { createDb, runMigrations, type Db } from '@/lib/db/client';
import { makeTmpDir, onTmpCleanup } from './tmp';

export function makeTestDb(): Db {
  const dir = makeTmpDir('cf-db-');
  const db = createDb(join(dir, 'test.db'));
  runMigrations(db);
  onTmpCleanup(() => {
    if (db.$client.open) db.$client.close();
  });
  return db;
}
