import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { enqueueJob } from '@/lib/ai/queue';
import { aiJobs } from '@/lib/db/schema';
import { clearUploads, isInsideDir, summarizeUploads, uploadsInUse } from '@/lib/uploads/cleanup';
import { formatBytes } from '@/lib/uploads/check';
import { makeTestDb } from './helpers/db';
import { makeTmpDir } from './helpers/tmp';

function makeUploads() {
  const base = makeTmpDir('cf-up-');
  mkdirSync(join(base, 'resume'), { recursive: true });
  mkdirSync(join(base, 'import'), { recursive: true });
  writeFileSync(join(base, 'resume', '1-a.pdf'), Buffer.alloc(1000));
  writeFileSync(join(base, 'import', '2-b.png'), Buffer.alloc(500));
  writeFileSync(join(base, 'import', '3-c.png'), Buffer.alloc(24));
  return base;
}

describe('D-09 올린 파일 정리', () => {
  test('TC-UPCLEAN-01 파일 수와 총 크기를 센다(폴더는 세지 않는다)', () => {
    const base = makeUploads();
    expect(summarizeUploads(base)).toEqual({ count: 3, bytes: 1524 });
  });

  test('TC-UPCLEAN-02 폴더가 없으면 0개', () => {
    expect(summarizeUploads(join(tmpdir(), 'cf-no-such-dir-xyz'))).toEqual({ count: 0, bytes: 0 });
  });

  test('TC-UPCLEAN-03 clearUploads: 안의 파일을 모두 지우고 지운 개수·크기를 돌려준다', () => {
    const base = makeUploads();
    const db = makeTestDb();
    expect(clearUploads({ baseDir: base, db })).toEqual({ count: 3, bytes: 1524 });
    expect(summarizeUploads(base)).toEqual({ count: 0, bytes: 0 });
    expect(existsSync(base)).toBe(true); // 업로드 폴더 자체는 남는다
    expect(clearUploads({ baseDir: base, db })).toEqual({ count: 0, bytes: 0 });
  });

  test('TC-UPCLEAN-04 진행 중(대기·실행) 가져오기 작업이 파일을 쓰면 막는다, 끝난 작업이면 허용', () => {
    const base = makeUploads();
    const db = makeTestDb();
    const resume = enqueueJob('import_resume', { filePaths: [join(base, 'resume', '1-a.pdf')] }, db);
    expect(uploadsInUse(db)).toBe(true);
    expect(() => clearUploads({ baseDir: base, db })).toThrow('가져오기 작업이 끝난 뒤');
    expect(summarizeUploads(base).count).toBe(3); // 아무것도 지우지 않았다
    db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, resume)).run();
    expect(uploadsInUse(db)).toBe(true);
    db.update(aiJobs).set({ status: 'succeeded' }).where(eq(aiJobs.id, resume)).run();
    expect(uploadsInUse(db)).toBe(false);
    expect(clearUploads({ baseDir: base, db }).count).toBe(3);
  });

  test('TC-UPCLEAN-05 파일을 쓰지 않는 진행 중 작업(공고 분석, 텍스트만 가져오기)은 막지 않는다', () => {
    const db = makeTestDb();
    enqueueJob('analyze_posting', { postingId: 1 }, db);
    enqueueJob('import_applications', { site: null, pastedText: '텍스트', imagePaths: [] }, db);
    expect(uploadsInUse(db)).toBe(false);
  });

  test('TC-UPCLEAN-06 경로 검사: 업로드 폴더 밖·상위 경로·같은 이름 접두어는 안이 아니다', () => {
    const root = join(tmpdir(), 'cf-root');
    expect(isInsideDir(root, join(root, 'a', 'b.pdf'))).toBe(true);
    expect(isInsideDir(root, root)).toBe(false);
    expect(isInsideDir(root, join(root, '..', 'x.pdf'))).toBe(false);
    expect(isInsideDir(root, join(root, 'a', '..', '..', 'x.pdf'))).toBe(false);
    expect(isInsideDir(root, `${root}-other/x.pdf`)).toBe(false);
  });

  test('TC-UPCLEAN-07 바깥을 가리키는 링크는 링크만 지우고 대상은 건드리지 않는다', () => {
    const base = makeUploads();
    const outside = makeTmpDir('cf-out-');
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    try {
      symlinkSync(outside, join(base, 'link'), 'junction');
    } catch {
      return; // 링크를 만들 수 없는 환경
    }
    clearUploads({ baseDir: base, db: makeTestDb() });
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true);
    expect(existsSync(join(base, 'link'))).toBe(false);
  });

  test('TC-UPCLEAN-08 크기 표시: B, KB, MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(12.34 * 1024 * 1024)).toBe('12.3 MB');
  });
});
