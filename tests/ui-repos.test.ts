import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { aiJobs } from '@/lib/db/schema';
import { enqueueJob, listActiveJobs } from '@/lib/ai/queue';
import { bulkCreateApplications, getApplication } from '@/lib/applications/repo';
import { searchApplications } from '@/lib/search/dashboard';
import { findOrCreateCompany, getCompanyUsage } from '@/lib/companies/repo';
import {
  getPosting,
  listUnanalyzedPostings,
  providePostingText,
  registerPosting,
  setPostingText,
} from '@/lib/postings/repo';
import { makeTestDb } from './helpers/db';

describe('listActiveJobs', () => {
  test('returns queued and running jobs oldest first, not finished ones', () => {
    const db = makeTestDb();
    const a = enqueueJob('analyze_posting', { postingId: 1 }, db);
    const b = enqueueJob('analyze_posting', { postingId: 2 }, db);
    const c = enqueueJob('analyze_posting', { postingId: 3 }, db);
    const d = enqueueJob('analyze_posting', { postingId: 4 }, db);
    db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, a)).run();
    db.update(aiJobs).set({ status: 'succeeded' }).where(eq(aiJobs.id, c)).run();
    db.update(aiJobs).set({ status: 'failed' }).where(eq(aiJobs.id, d)).run();
    expect(listActiveJobs(db).map((j) => [j.id, j.status])).toEqual([
      [a, 'running'],
      [b, 'queued'],
    ]);
  });
  test('empty when nothing is active', () => {
    expect(listActiveJobs(makeTestDb())).toEqual([]);
  });
});

describe('getApplication', () => {
  test('returns the row or undefined', () => {
    const db = makeTestDb();
    bulkCreateApplications(
      [{ companyName: '토스', positionTitle: '서버', site: 'other', siteNote: '지인 추천', appliedAt: '2026-01-01', status: 'applied' }],
      db,
    );
    expect(getApplication(1, db)).toMatchObject({ positionTitle: '서버', siteNote: '지인 추천' });
    expect(getApplication(99, db)).toBeUndefined();
  });
});

describe('getCompanyUsage', () => {
  test('counts postings and applications of a company', () => {
    const db = makeTestDb();
    const id = findOrCreateCompany({ displayName: '카카오' }, db);
    const other = findOrCreateCompany({ displayName: '네이버' }, db);
    bulkCreateApplications(
      [
        { companyName: '카카오', positionTitle: 'A', site: 'wanted', appliedAt: '2026-01-01', status: 'applied' },
        { companyName: '카카오', positionTitle: 'B', site: 'wanted', appliedAt: '2026-01-02', status: 'applied' },
      ],
      db,
    );
    expect(getCompanyUsage(id, db)).toEqual({ postings: 0, applications: 2 });
    expect(getCompanyUsage(other, db)).toEqual({ postings: 0, applications: 0 });
  });
});

describe('listUnanalyzedPostings', () => {
  test('lists postings without analysis or application, newest first, with latest job status', () => {
    const db = makeTestDb();
    const p1 = registerPosting({ pastedText: '본문 하나' }, db);
    const p2 = registerPosting({ pastedText: '본문 둘', siteNote: '지인 추천' }, db);
    db.update(aiJobs).set({ status: 'failed', errorKind: 'auth' }).where(eq(aiJobs.id, p1.jobId!)).run();
    const rows = listUnanalyzedPostings(db);
    expect(rows.map((r) => r.postingId)).toEqual([p2.postingId, p1.postingId]);
    expect(rows[0]).toMatchObject({ jobStatus: 'queued', siteNote: '지인 추천' });
    expect(rows[1]).toMatchObject({ jobStatus: 'failed' });
  });
});

describe('rawTextSource', () => {
  test('records how the posting text was obtained', () => {
    const db = makeTestDb();
    const pasted = registerPosting({ pastedText: '붙여넣은 본문' }, db);
    expect(getPosting(pasted.postingId, db)?.rawTextSource).toBe('pasted');
    const linked = registerPosting({ url: 'https://www.wanted.co.kr/wd/1' }, db);
    expect(getPosting(linked.postingId, db)?.rawTextSource).toBeNull();
    setPostingText(linked.postingId, '추출한 본문', db, 'extracted');
    expect(getPosting(linked.postingId, db)?.rawTextSource).toBe('extracted');
    providePostingText(linked.postingId, '다시 붙여넣음', db);
    expect(getPosting(linked.postingId, db)?.rawTextSource).toBe('pasted');
  });
});

describe('DashboardRow.siteNote', () => {
  test('carries the source name for other-site records', () => {
    const db = makeTestDb();
    bulkCreateApplications(
      [{ companyName: '토스', positionTitle: '서버', site: 'other', siteNote: '지인 추천', appliedAt: '2026-01-01', status: 'applied' }],
      db,
    );
    expect(searchApplications({}, db)[0].siteNote).toBe('지인 추천');
  });
});
