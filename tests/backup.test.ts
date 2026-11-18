import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { runDailyBackup } from '@/lib/backup';

test('runDailyBackup creates once per day', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-bk-'));
  const db = makeTestDb();
  const first = await runDailyBackup(new Date('2026-11-16T12:00:00'), { db, backupDir: dir });
  expect(first).toBe(join(dir, 'career-flow-20261116.db'));
  expect(await runDailyBackup(new Date('2026-11-16T12:00:00'), { db, backupDir: dir })).toBeNull();
});

test('runDailyBackup keeps only latest 30', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-bk-'));
  for (let i = 1; i <= 31; i++) writeFileSync(join(dir, `career-flow-202610${String(i).padStart(2, '0')}.db`), 'x');
  await runDailyBackup(new Date('2026-11-16T12:00:00'), { db: makeTestDb(), backupDir: dir });
  expect(readdirSync(dir).filter((f) => f.endsWith('.db'))).toHaveLength(30);
});
