import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { aiJobs } from '@/lib/db/schema';
import { AiError, type AiRunner } from '@/lib/ai/runner';
import {
  JOB_TIMEOUT_MS,
  enqueueJob,
  getJob,
  latestJobFor,
  type JobPayload,
  type WorkerDeps,
  processNextJob,
  recoverInterruptedJobs,
  startWorker,
} from '@/lib/ai/queue';
import { makeTestDb } from './helpers/db';
import { makeTmpDir } from './helpers/tmp';

type Handlers = WorkerDeps['handlers'];
const stubRunner: AiRunner = { run: async () => { throw new Error('not used'); } };
const workRoot = () => makeTmpDir('cf-work-');

describe('job queue', () => {
  test('processes queued jobs one at a time in FIFO order and stores result', async () => {
    const db = makeTestDb();
    const order: number[] = [];
    const a = enqueueJob('analyze_posting', { n: 1 }, db);
    enqueueJob('analyze_posting', { n: 2 }, db);
    const handlers = {
      analyze_posting: async ({ payload }: { payload: JobPayload | null }) => {
        const n = (payload as { n: number }).n;
        order.push(n);
        return { result: { ok: n }, sessionId: 's' };
      },
    } as unknown as Handlers;
    const workRootDir = workRoot();
    expect(await processNextJob({ runner: stubRunner, handlers, db, workRoot: workRootDir })).toBe(true);
    expect(await processNextJob({ runner: stubRunner, handlers, db, workRoot: workRootDir })).toBe(true);
    expect(await processNextJob({ runner: stubRunner, handlers, db, workRoot: workRootDir })).toBe(false);
    expect(order).toEqual([1, 2]);
    expect(getJob(a, db)).toMatchObject({ status: 'succeeded', result: { ok: 1 }, sessionId: 's' });
    expect(getJob(a, db)?.finishedAt).toBeTruthy();
  });

  test('stores AiError kind and message on failure', async () => {
    const db = makeTestDb();
    const id = enqueueJob('analyze_posting', {}, db);
    const handlers = { analyze_posting: async () => { throw new AiError('auth', '로그인 필요'); } } as unknown as Handlers;
    await processNextJob({ runner: stubRunner, handlers, db, workRoot: workRoot() });
    expect(getJob(id, db)).toMatchObject({ status: 'failed', errorKind: 'auth', errorMessage: '로그인 필요' });
  });

  test('non-AiError exception is recorded as cli error', async () => {
    const db = makeTestDb();
    const id = enqueueJob('analyze_posting', {}, db);
    const handlers = { analyze_posting: async () => { throw new Error('boom'); } } as unknown as Handlers;
    await processNextJob({ runner: stubRunner, handlers, db, workRoot: workRoot() });
    expect(getJob(id, db)).toMatchObject({ status: 'failed', errorKind: 'cli', errorMessage: 'boom' });
  });

  test('recovers interrupted jobs', () => {
    const db = makeTestDb();
    const id = enqueueJob('analyze_posting', {}, db);
    db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, id)).run();
    expect(recoverInterruptedJobs(db)).toBe(1);
    expect(getJob(id, db)).toMatchObject({ status: 'failed', errorKind: 'interrupted' });
    expect(getJob(id, db)?.errorMessage).toBe('앱이 재시작되어 중단되었습니다');
  });

  test('creates per-job work dir (D-09: removed once the job ends)', async () => {
    const db = makeTestDb();
    const root = workRoot();
    const id = enqueueJob('analyze_posting', {}, db);
    let seen = '';
    let existedDuringJob = false;
    const handlers = {
      analyze_posting: async ({ workDir }: { workDir: string }) => {
        seen = workDir;
        existedDuringJob = existsSync(workDir);
        return { result: {} };
      },
    } as unknown as Handlers;
    await processNextJob({ runner: stubRunner, handlers, db, workRoot: root });
    expect(seen).toBe(join(root, String(id)));
    expect(existedDuringJob).toBe(true);
    expect(existsSync(seen)).toBe(false);
  });

  test('latestJobFor finds newest matching job', () => {
    const db = makeTestDb();
    enqueueJob('analyze_posting', { postingId: 1 }, db);
    const b = enqueueJob('analyze_posting', { postingId: 1 }, db);
    enqueueJob('analyze_posting', { postingId: 2 }, db);
    expect(latestJobFor('analyze_posting', (p) => p?.postingId === 1, db)?.id).toBe(b);
    expect(latestJobFor('import_resume', () => true, db)).toBeUndefined();
  });

  test('worker runs only one job at a time and stops', async () => {
    const db = makeTestDb();
    enqueueJob('analyze_posting', { n: 1 }, db);
    enqueueJob('analyze_posting', { n: 2 }, db);
    let active = 0;
    let maxActive = 0;
    let finished = 0;
    const handlers = {
      analyze_posting: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 50));
        active--;
        finished++;
        return { result: {} };
      },
    } as unknown as Handlers;
    const stop = startWorker({ runner: stubRunner, handlers, db, pollMs: 10, workRoot: workRoot() });
    for (let i = 0; i < 100 && finished < 2; i++) await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(finished).toBe(2);
    expect(maxActive).toBe(1);
  });

  test('timeouts are 300s', () => {
    expect(Object.values(JOB_TIMEOUT_MS).every((v) => v === 300_000)).toBe(true);
  });
});
