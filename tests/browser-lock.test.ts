import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { acquireBrowserLock, isBrowserBusy, BrowserLockTimeoutError } from '@/lib/extract/browser';
import { extractPostingText } from '@/lib/extract/extract-posting';
import { getJob, processNextJob } from '@/lib/ai/queue';
import { handlers } from '@/lib/ai/tasks';
import { registerPosting } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import type { AiRunner } from '@/lib/ai/runner';

afterEach(() => vi.useRealTimers());

const LOGIN_MSG = '사이트 로그인 창이 열려 있습니다. 창을 닫고 다시 시도하세요';
const neverRunner: AiRunner = {
  run: async () => {
    throw new Error('claude 를 호출하면 안 된다');
  },
};

test('TC-LOCK-01 잠금 대기에는 제한이 있고, 시간이 지나면 대기열에서 빠진다', async () => {
  const release = await acquireBrowserLock();
  await expect(acquireBrowserLock(30)).rejects.toBeInstanceOf(BrowserLockTimeoutError);
  release();
  expect(isBrowserBusy()).toBe(false); // 시간 초과한 대기자에게 잠금이 넘어가지 않는다
});

test('TC-LOCK-02 로그인 창(잠금 보유) 때문에 링크 추출이 제한 시간 뒤 안내와 함께 실패한다', async () => {
  const release = await acquireBrowserLock();
  try {
    await expect(
      extractPostingText('https://example.com/job/1', { lockTimeoutMs: 30 }),
    ).rejects.toMatchObject({ kind: 'extract_failed', message: LOGIN_MSG });
  } finally {
    release();
  }
});

test('TC-LOCK-03 로그인 창이 열린 채로 공고 작업을 처리하면 60초 뒤 실패하고 큐가 다음 작업으로 넘어간다', async () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const withUrl = registerPosting({ url: 'https://example.com/job/1' }, db);
  const withText = registerPosting({ pastedText: '붙여넣은 공고' }, db);
  const release = await acquireBrowserLock();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const workRoot = mkdtempSync(join(tmpdir(), 'cf-work-'));
  const p = processNextJob({ runner: neverRunner, handlers, db, workRoot });
  await vi.advanceTimersByTimeAsync(59_000);
  expect(getJob(withUrl.jobId!, db)!.status).toBe('running');
  await vi.advanceTimersByTimeAsync(2_000);
  await p;
  vi.useRealTimers();
  const job = getJob(withUrl.jobId!, db)!;
  expect(job.status).toBe('failed');
  expect(job.errorKind).toBe('extract_failed');
  expect(job.errorMessage).toBe(LOGIN_MSG);
  // 큐가 멈추지 않는다: 다음 작업이 처리 대상이 된다(실행 자체는 가짜 러너가 막는다)
  expect(getJob(withText.jobId!, db)!.status).toBe('queued');
  expect(await processNextJob({ runner: neverRunner, handlers, db, workRoot })).toBe(true);
  expect(getJob(withText.jobId!, db)!.status).toBe('failed');
  release();
});
