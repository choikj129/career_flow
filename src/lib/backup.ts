import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '@/lib/config';
import { getDb, type Db } from '@/lib/db/client';

const KEEP = 30;

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export async function runDailyBackup(
  now: Date = new Date(),
  deps: { db?: Db; backupDir?: string } = {},
): Promise<string | null> {
  const db = deps.db ?? getDb();
  const dir = deps.backupDir ?? config.backupDir;
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `career-flow-${stamp(now)}.db`);
  if (existsSync(target)) return null;
  await db.$client.backup(target);
  const files = readdirSync(dir)
    .filter((f) => /^career-flow-\d{8}\.db$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) unlinkSync(join(dir, f));
  return target;
}
