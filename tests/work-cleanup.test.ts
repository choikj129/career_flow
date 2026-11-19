import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { aiJobs } from '@/lib/db/schema';
import { AiError, type AiRunner } from '@/lib/ai/runner';
import {
  cleanupFinishedWorkDirs,
  enqueueJob,
  getJob,
  processNextJob,
  recoverInterruptedJobs,
  type WorkerDeps,
} from '@/lib/ai/queue';
import { makeTestDb } from './helpers/db';

type Handlers = WorkerDeps['handlers'];
const stubRunner: AiRunner = { run: async () => { throw new Error('not used'); } };
const root = () => mkdtempSync(join(tmpdir(), 'cf-clean-'));

describe('D-09 AI 작업 폴더 정리', () => {
  test('TC-WORK-01 성공한 작업의 폴더는 끝나면 지워진다', async () => {
    const db = makeTestDb();
    const workRoot = root();
    const id = enqueueJob('analyze_posting', {}, db);
    let seen = '';
    const handlers = {
      analyze_posting: async ({ workDir }: { workDir: string }) => {
        writeFileSync(join(workDir, 'copy.pdf'), 'x');
        seen = workDir;
        return { result: { ok: 1 } };
      },
    } as unknown as Handlers;
    await processNextJob({ runner: stubRunner, handlers, db, workRoot });
    expect(seen).toBe(join(workRoot, String(id)));
    expect(existsSync(seen)).toBe(false);
    expect(getJob(id, db)).toMatchObject({ status: 'succeeded', result: { ok: 1 } });
  });

  test('TC-WORK-02 실패한 작업의 폴더도 지워지고 실패 사유는 그대로', async () => {
    const db = makeTestDb();
    const workRoot = root();
    const id = enqueueJob('analyze_posting', {}, db);
    let seen = '';
    const handlers = {
      analyze_posting: async ({ workDir }: { workDir: string }) => {
        writeFileSync(join(workDir, 'copy.png'), 'x');
        seen = workDir;
        throw new AiError('auth', '로그인 필요');
      },
    } as unknown as Handlers;
    await processNextJob({ runner: stubRunner, handlers, db, workRoot });
    expect(existsSync(seen)).toBe(false);
    expect(getJob(id, db)).toMatchObject({ status: 'failed', errorKind: 'auth', errorMessage: '로그인 필요' });
  });

  test('TC-WORK-03 시작 시 정리: 끝난 작업(중단 포함) 폴더만 지우고 health·진행 중 작업은 둔다', () => {
    const db = makeTestDb();
    const workRoot = root();
    const mk = (name: string) => {
      mkdirSync(join(workRoot, name), { recursive: true });
      writeFileSync(join(workRoot, name, 'f.txt'), 'x');
    };
    const done = enqueueJob('analyze_posting', {}, db);
    const failed = enqueueJob('analyze_posting', {}, db);
    const interrupted = enqueueJob('analyze_posting', {}, db);
    const queued = enqueueJob('analyze_posting', {}, db);
    db.update(aiJobs).set({ status: 'succeeded' }).where(eq(aiJobs.id, done)).run();
    db.update(aiJobs).set({ status: 'failed' }).where(eq(aiJobs.id, failed)).run();
    db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, interrupted)).run();
    for (const n of [done, failed, interrupted, queued]) mk(String(n));
    mk('health');
    mk('notes'); // 숫자가 아닌 폴더는 건드리지 않는다
    expect(recoverInterruptedJobs(db)).toBe(1); // 중단 작업이 failed가 된다
    expect(cleanupFinishedWorkDirs(db, workRoot)).toBe(3);
    expect(existsSync(join(workRoot, String(done)))).toBe(false);
    expect(existsSync(join(workRoot, String(failed)))).toBe(false);
    expect(existsSync(join(workRoot, String(interrupted)))).toBe(false);
    expect(existsSync(join(workRoot, String(queued)))).toBe(true);
    expect(existsSync(join(workRoot, 'health'))).toBe(true);
    expect(existsSync(join(workRoot, 'notes'))).toBe(true);
  });

  test('TC-WORK-04 작업 루트가 없어도 정리는 0개로 끝난다', () => {
    expect(cleanupFinishedWorkDirs(makeTestDb(), join(root(), 'nope'))).toBe(0);
  });
});
