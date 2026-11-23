import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 테스트가 Temp에 만든 폴더·DB를 기록해 두었다가 파일이 끝나면 지운다(tests/helpers/tmp-setup.ts).
const dirs: string[] = [];
const closers: Array<() => void> = [];

export function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** 지우기 전에 닫아야 하는 것(열린 SQLite 연결 등)을 등록한다. */
export function onTmpCleanup(fn: () => void): void {
  closers.push(fn);
}

/** 실패는 무시한다(Windows에서 열린 파일은 못 지운다). */
export function cleanupTmpDirs(): void {
  for (const fn of closers.splice(0)) {
    try {
      fn();
    } catch {
      /* 무시 */
    }
  }
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      /* 무시 */
    }
  }
}
