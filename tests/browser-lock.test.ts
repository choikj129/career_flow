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
import { makeTmpDir } from './helpers/tmp';

afterEach(() => vi.useRealTimers());

const BUSY_MSG = '브라우저를 다른 작업(PDF 만들기 등)이 쓰고 있습니다. 잠시 뒤 다시 시도하세요';
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

test('TC-LOCK-02 브라우저 잠금을 다른 작업이 쥐고 있어 링크 추출이 제한 시간 뒤 안내와 함께 실패한다', async () => {
  const release = await acquireBrowserLock();
  try {
    await expect(
      extractPostingText('https://example.com/job/1', { lockTimeoutMs: 30 }),
    ).rejects.toMatchObject({ kind: 'extract_failed', message: BUSY_MSG });
  } finally {
    release();
  }
});

test('TC-LOCK-03 브라우저 잠금이 잡힌 채로 공고 작업을 처리하면 60초 뒤 실패하고 큐가 다음 작업으로 넘어간다', async () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const withUrl = registerPosting({ url: 'https://example.com/job/1' }, db);
  const withText = registerPosting({ pastedText: '붙여넣은 공고' }, db);
  const release = await acquireBrowserLock();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const workRoot = makeTmpDir('cf-work-');
  const p = processNextJob({ runner: neverRunner, handlers, db, workRoot });
  await vi.advanceTimersByTimeAsync(59_000);
  expect(getJob(withUrl.jobId!, db)!.status).toBe('running');
  await vi.advanceTimersByTimeAsync(2_000);
  await p;
  vi.useRealTimers();
  const job = getJob(withUrl.jobId!, db)!;
  expect(job.status).toBe('failed');
  expect(job.errorKind).toBe('extract_failed');
  expect(job.errorMessage).toBe(BUSY_MSG);
  // 큐가 멈추지 않는다: 다음 작업이 처리 대상이 된다(실행 자체는 가짜 러너가 막는다)
  expect(getJob(withText.jobId!, db)!.status).toBe('queued');
  expect(await processNextJob({ runner: neverRunner, handlers, db, workRoot })).toBe(true);
  expect(getJob(withText.jobId!, db)!.status).toBe('failed');
  release();
});
