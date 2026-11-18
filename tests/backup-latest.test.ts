import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { latestBackupAt } from '@/lib/backup';

describe('latestBackupAt', () => {
  test('null when no backups', () => {
    expect(latestBackupAt(mkdtempSync(join(tmpdir(), 'cf-bk-')))).toBeNull();
    expect(latestBackupAt(join(tmpdir(), 'cf-nonexistent-dir'))).toBeNull();
  });
  test('newest backup file time as ISO', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-bk-'));
    writeFileSync(join(dir, 'career-flow-20260101.db'), 'a');
    writeFileSync(join(dir, 'career-flow-20260102.db'), 'b');
    writeFileSync(join(dir, 'other.txt'), 'c');
    utimesSync(join(dir, 'career-flow-20260101.db'), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(join(dir, 'career-flow-20260102.db'), new Date('2026-01-02T03:00:00Z'), new Date('2026-01-02T03:00:00Z'));
    expect(latestBackupAt(dir)).toBe('2026-01-02T03:00:00.000Z');
  });
});
