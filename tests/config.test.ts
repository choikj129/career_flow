import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { makeTmpDir } from './helpers/tmp';

test('ensureDataDirs creates all dirs under CAREER_FLOW_DATA_DIR', async () => {
  const dir = makeTmpDir('cf-');
  process.env.CAREER_FLOW_DATA_DIR = dir;
  const { config, ensureDataDirs } = await import('@/lib/config');
  ensureDataDirs();
  for (const p of [config.uploadsDir, config.aiWorkDir, config.backupDir, join(config.documentsDir, 'resume'), join(config.documentsDir, 'career'), join(config.documentsDir, 'portfolio')])
    expect(existsSync(p)).toBe(true);
  expect(config.dbPath).toBe(join(dir, 'career-flow.db'));
});
