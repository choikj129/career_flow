import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { config } from '@/lib/config';

// 테스트가 실제 앱 데이터(data/)에 시험용 공고·키트를 남긴 일이 있었다(2026-11-23).
// 모든 테스트 파일에서 설정이 읽히기 전에 임시 폴더로 정해져 있어야 한다.
describe('테스트 데이터 폴더', () => {
  test('config.dataDir은 실제 data/ 폴더가 아니라 임시 폴더다', () => {
    expect(resolve(config.dataDir)).not.toBe(resolve(join(process.cwd(), 'data')));
    expect(resolve(config.dataDir).startsWith(resolve(tmpdir()))).toBe(true);
    expect(resolve(config.dbPath).startsWith(resolve(tmpdir()))).toBe(true);
  });
});
