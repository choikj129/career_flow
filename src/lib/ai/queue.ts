import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { config } from '@/lib/config';
import { getDb, type Db } from '@/lib/db/client';
import { aiJobs } from '@/lib/db/schema';
import type { AiErrorKind, JobType } from '@/lib/domain/types';
import { AiError, type AiRunner } from './runner';

/** 작업 종류마다 모양이 다르다. 처리기가 값을 검사해 쓴다. */
export type JobPayload = Record<string, unknown>;

export type JobRow = typeof aiJobs.$inferSelect;

export type JobHandler = (ctx: {
  jobId: number;
  payload: JobPayload | null;
  runner: AiRunner;
  workDir: string;
  db: Db;
}) => Promise<{ result: unknown; sessionId?: string; usage?: unknown; model?: string }>;

export const JOB_TIMEOUT_MS: Record<JobType, number> = {
  analyze_posting: 300_000,
  import_resume: 300_000,
  import_applications: 300_000,
};

const now = () => new Date().toISOString();

export function enqueueJob(type: JobType, payload: unknown, db: Db = getDb()): number {
  const row = db
    .insert(aiJobs)
    .values({ type, payload, status: 'queued', createdAt: now() })
    .returning({ id: aiJobs.id })
    .get();
  return row.id;
}

export function getJob(id: number, db: Db = getDb()): JobRow | undefined {
  return db.select().from(aiJobs).where(eq(aiJobs.id, id)).get();
}

export type JobSummary = Omit<JobRow, 'result' | 'usage'>;

/** result·usage(큰 JSON)는 읽지 않는다. */
export function latestJobFor(
  type: JobType,
  match: (payload: JobPayload | null) => boolean,
  db: Db = getDb(),
): JobSummary | undefined {
  const rows = db
    .select({
      id: aiJobs.id,
      type: aiJobs.type,
      payload: aiJobs.payload,
      status: aiJobs.status,
      errorKind: aiJobs.errorKind,
      errorMessage: aiJobs.errorMessage,
      sessionId: aiJobs.sessionId,
      model: aiJobs.model,
      createdAt: aiJobs.createdAt,
      startedAt: aiJobs.startedAt,
      finishedAt: aiJobs.finishedAt,
    })
    .from(aiJobs)
    .where(eq(aiJobs.type, type))
    .orderBy(desc(aiJobs.id))
    .all();
  return rows.find((r) => match(r.payload as JobPayload | null));
}

/** 대기 중이거나 실행 중인 작업. 오래된 순. */
export function listActiveJobs(db: Db = getDb()): JobRow[] {
  return db
    .select()
    .from(aiJobs)
    .where(inArray(aiJobs.status, ['queued', 'running']))
    .orderBy(asc(aiJobs.id))
    .all();
}

/** 앱이 꺼지면서 running으로 남은 작업을 실패 처리한다. 처리한 개수를 돌려준다. */
export function recoverInterruptedJobs(db: Db = getDb()): number {
  const res = db
    .update(aiJobs)
    .set({
      status: 'failed',
      errorKind: 'interrupted',
      errorMessage: '앱이 재시작되어 중단되었습니다',
      finishedAt: now(),
    })
    .where(eq(aiJobs.status, 'running'))
    .run();
  return res.changes;
}

export interface WorkerDeps {
  runner: AiRunner;
  handlers: Record<JobType, JobHandler>;
  db?: Db;
  workRoot?: string; // 기본 config.aiWorkDir
}

/** 가장 오래된 queued 작업 하나를 처리한다. 처리했으면 true. */
export async function processNextJob(deps: WorkerDeps): Promise<boolean> {
  const db = deps.db ?? getDb();
  const next = db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.status, 'queued'))
    .orderBy(asc(aiJobs.id))
    .limit(1)
    .get();
  if (!next) return false;

  const claimed = db
    .update(aiJobs)
    .set({ status: 'running', startedAt: now() })
    .where(and(eq(aiJobs.id, next.id), eq(aiJobs.status, 'queued')))
    .run();
  if (claimed.changes === 0) return false;

  try {
    const handler = deps.handlers[next.type];
    if (!handler) throw new AiError('cli', `처리기가 없는 작업 종류입니다: ${next.type}`);
    const workDir = join(deps.workRoot ?? config.aiWorkDir, String(next.id));
    mkdirSync(workDir, { recursive: true });
    const out = await handler({ jobId: next.id, payload: next.payload as JobPayload | null, runner: deps.runner, workDir, db });
    db.update(aiJobs)
      .set({
        status: 'succeeded',
        result: out.result ?? null,
        sessionId: out.sessionId ?? null,
        usage: out.usage ?? null,
        model: out.model ?? null,
        finishedAt: now(),
      })
      .where(eq(aiJobs.id, next.id))
      .run();
  } catch (e) {
    const kind: AiErrorKind = e instanceof AiError ? e.kind : 'cli';
    const message = e instanceof Error ? e.message : String(e);
    db.update(aiJobs)
      .set({
        status: 'failed',
        errorKind: kind,
        errorMessage: message,
        sessionId: e instanceof AiError ? (e.sessionId ?? null) : null,
        finishedAt: now(),
      })
      .where(eq(aiJobs.id, next.id))
      .run();
  }
  return true;
}

/** 폴링 워커를 시작하고 정지 함수를 돌려준다. 한 번에 한 작업만 실행한다. */
export function startWorker(deps: WorkerDeps & { pollMs?: number }): () => void {
  const pollMs = deps.pollMs ?? 1000;
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      while (!stopped && (await processNextJob(deps))) {
        /* 큐가 빌 때까지 계속 */
      }
    } catch (e) {
      console.error('[worker]', e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, pollMs);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
