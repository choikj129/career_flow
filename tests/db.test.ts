import { expect, test } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { applications, companies, postings, analyses, statusEvents, aiJobs, resumeVersions } from '@/lib/db/schema';
import { getModelFor, setModelFor } from '@/lib/settings';

const now = () => new Date().toISOString();

test('migrations create tables and enforce unique canonicalUrl', () => {
  const db = makeTestDb();
  db.insert(postings).values({ site: 'wanted', canonicalUrl: 'https://www.wanted.co.kr/wd/1', createdAt: now() }).run();
  expect(() =>
    db.insert(postings).values({ site: 'wanted', canonicalUrl: 'https://www.wanted.co.kr/wd/1', createdAt: now() }).run(),
  ).toThrow();
});

test('getModelFor defaults and persists override', () => {
  const db = makeTestDb();
  expect(getModelFor('analyze_posting', db)).toBe('opus');
  expect(getModelFor('import_resume', db)).toBe('sonnet');
  expect(getModelFor('import_applications', db)).toBe('sonnet');
  setModelFor('analyze_posting', 'sonnet', db);
  expect(getModelFor('analyze_posting', db)).toBe('sonnet');
});

test('siteNote column exists and statusEvents cascade on application delete', () => {
  const db = makeTestDb();
  const c = db.insert(companies).values({ displayName: '토스', createdAt: now() }).returning().get();
  const a = db
    .insert(applications)
    .values({
      companyId: c.id, positionTitle: 'BE', site: 'other', siteNote: '지인 추천', appliedAt: '2026-11-16',
      submittedResume: { kind: 'base', versionId: 1 }, status: 'applied', createdAt: now(),
    })
    .returning().get();
  expect(a.siteNote).toBe('지인 추천');
  db.insert(statusEvents).values({ applicationId: a.id, status: 'applied', at: now() }).run();
  db.delete(applications).where(eq(applications.id, a.id)).run();
  expect(db.select().from(statusEvents).all()).toHaveLength(0);
});

test('analyses cascade on posting delete', () => {
  const db = makeTestDb();
  const rv = db.insert(resumeVersions).values({ versionNo: 1, content: {}, createdAt: now() }).returning().get();
  const job = db.insert(aiJobs).values({ type: 'analyze_posting', payload: {}, status: 'succeeded', createdAt: now() }).returning().get();
  const p = db.insert(postings).values({ site: 'wanted', createdAt: now() }).returning().get();
  db.insert(analyses).values({ postingId: p.id, resumeVersionId: rv.id, result: {}, fitScore: 80, jobId: job.id, createdAt: now() }).run();
  db.delete(postings).where(eq(postings.id, p.id)).run();
  expect(db.select().from(analyses).all()).toHaveLength(0);
});

test('TC-DATA-IDX 조회용 인덱스가 마이그레이션으로 만들어진다', () => {
  const db = makeTestDb();
  const names = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'index'`).map((r) => r.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'applications_company_id_idx',
      'applications_posting_id_idx',
      'analyses_posting_id_idx',
      'ai_jobs_status_idx',
    ]),
  );
});

test('TC-DATA-SEL 작업 목록 조회는 result·usage 를 읽지 않는다', async () => {
  const { enqueueJob, latestJobFor } = await import('@/lib/ai/queue');
  const db = makeTestDb();
  enqueueJob('analyze_posting', { postingId: 5 }, db);
  const job = latestJobFor('analyze_posting', (p) => p?.postingId === 5, db)!;
  expect(job).toBeDefined();
  expect(job).not.toHaveProperty('result');
  expect(job).not.toHaveProperty('usage');
});
