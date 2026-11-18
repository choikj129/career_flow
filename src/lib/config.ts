import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.CAREER_FLOW_DATA_DIR ?? join(process.cwd(), 'data');

export const config = {
  dataDir,
  dbPath: join(dataDir, 'career-flow.db'),
  uploadsDir: join(dataDir, 'uploads'),
  aiWorkDir: join(dataDir, 'ai-work'),
  browserProfileDir: join(dataDir, 'browser-profile'),
  backupDir: join(dataDir, 'backups'),
  claudeBin: process.env.CLAUDE_BIN ?? 'claude',
};

export function ensureDataDirs(): void {
  for (const dir of [
    config.dataDir,
    config.uploadsDir,
    config.aiWorkDir,
    config.browserProfileDir,
    config.backupDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}
