import { afterEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { aiJobs, applications, statusEvents } from '@/lib/db/schema';
import { emptyResume } from '@/lib/resume/schema';
import { saveResumeVersion } from '@/lib/resume/repo';
import { enqueueJob, getJob } from '@/lib/ai/queue';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import {
  findOrCreateCompany,
  searchCompanies,
  addCompanyAlias,
  mergeCompanies,
  getCompany,
  listCompanyKeys,
} from '@/lib/companies/repo';
import {
  registerPosting,
  saveAnalysis,
  getPosting,
  getLatestAnalysis,
  listAnalyses,
  listAnalyzedNotApplied,
  deletePosting,
  listSiteNotes,
  setPostingCompany,
  providePostingText,
  reanalyzePosting,
} from '@/lib/postings/repo';
import {
  markApplied,
  changeStatus,
  getPriorApplications,
  bulkCreateApplications,
  getApplication,
  getApplicationForPosting,
  listStatusEvents,
  updateApplication,
  deleteApplication,
  updateNotes,
} from '@/lib/applications/repo';
import { searchApplications } from '@/lib/search/dashboard';
import { makeTmpDir } from './helpers/tmp';

afterEach(() => vi.useRealTimers());

function analysis(over: Partial<AnalysisResult['posting']> = {}, score = 80): AnalysisResult {
  return {
    posting: {
      companyDisplayName: '카카오',
      companyLegalName: null,
      positionTitle: '백엔드 개발자',
      experienceRequirement: null,
      employmentType: null,
      location: null,
      deadline: '2026-12-31',
      salary: null,
      responsibilities: [],
      requirements: [],
      preferred: [],
      techStack: [],
      ...over,
    },
    fit: { score, breakdown: [] },
    strengths: [],
    gaps: [],
    preferenceMismatches: [],
    tailoringAdvice: '',
  };
}

/** 분석까지 끝난 공고를 만든다. */
function analyzedPosting(
  db: ReturnType<typeof makeTestDb>,
  url: string,
  over: Partial<AnalysisResult['posting']> = {},
) {
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ url }, db);
  saveAnalysis(reg.postingId, resume.id, analysis(over), reg.jobId!, db);
  return { postingId: reg.postingId, resumeId: resume.id };
}

test('registerPosting dedupes canonical url', () => {
  const db = makeTestDb();
  const a = registerPosting({ url: 'https://www.wanted.co.kr/wd/1?utm_source=x' }, db);
  const b = registerPosting({ url: 'https://www.wanted.co.kr/wd/1#apply' }, db);
  expect(b).toEqual({ postingId: a.postingId, existing: true });
  expect(a.jobId).toBeDefined();
  expect(getPosting(a.postingId, db)!.site).toBe('wanted');
});

test('registerPosting with pasted text stores text and needs url or text', () => {
  const db = makeTestDb();
  const r = registerPosting({ pastedText: '공고 본문', siteNote: '지인 추천' }, db);
  const p = getPosting(r.postingId, db)!;
  expect(p.rawText).toBe('공고 본문');
  expect(p.fetchedAt).toBeTruthy();
  expect(p.site).toBe('other');
  expect(p.siteNote).toBe('지인 추천');
  expect(() => registerPosting({}, db)).toThrow();
});

test('providePostingText and reanalyzePosting enqueue analyze jobs', () => {
  const db = makeTestDb();
  const r = registerPosting({ url: 'https://example.com/job/1' }, db);
  const j1 = providePostingText(r.postingId, '붙여넣은 본문', db);
  expect(getPosting(r.postingId, db)!.rawText).toBe('붙여넣은 본문');
  const j2 = reanalyzePosting(r.postingId, db);
  expect(j2).toBeGreaterThan(j1);
  expect(getJob(j2, db)!.payload).toEqual({ postingId: r.postingId });
});

test('findOrCreateCompany matches by legal name and adds new keys', () => {
  const db = makeTestDb();
  const id = findOrCreateCompany({ displayName: '토스', legalName: '(주)비바리퍼블리카' }, db);
  expect(findOrCreateCompany({ displayName: '비바리퍼블리카' }, db)).toBe(id);
  expect(findOrCreateCompany({ displayName: '토스 ', legalName: null }, db)).toBe(id);
});

test('findOrCreateCompany adds a legal name later to an existing company', () => {
  const db = makeTestDb();
  const id = findOrCreateCompany({ displayName: '토스' }, db);
  expect(findOrCreateCompany({ displayName: '토스', legalName: '비바리퍼블리카' }, db)).toBe(id);
  expect(getCompany(id, db)!.legalName).toBe('비바리퍼블리카');
  expect(listCompanyKeys(id, db).map((k) => k.key).sort()).toEqual(['비바리퍼블리카', '토스']);
});

test('saveAnalysis links company once and keeps a user-changed company', () => {
  const db = makeTestDb();
  const { postingId, resumeId } = analyzedPosting(db, 'https://example.com/a');
  const p = getPosting(postingId, db)!;
  expect(p.positionTitle).toBe('백엔드 개발자');
  expect(p.deadline).toBe('2026-12-31');
  const kakao = p.companyId!;
  const other = findOrCreateCompany({ displayName: '네이버' }, db);
  setPostingCompany(postingId, other, db);
  const job2 = reanalyzePosting(postingId, db);
  saveAnalysis(postingId, resumeId, analysis({}, 90), job2, db);
  expect(getPosting(postingId, db)!.companyId).toBe(other);
  expect(kakao).not.toBe(other);
  expect(getLatestAnalysis(postingId, db)!.fitScore).toBe(90);
  expect(listAnalyses(postingId, db)).toHaveLength(2);
});

test('getPriorApplications returns earlier applications to same company from other postings', () => {
  const db = makeTestDb();
  const a = analyzedPosting(db, 'https://example.com/1');
  const reg2 = registerPosting({ url: 'https://example.com/2' }, db);
  saveAnalysis(reg2.postingId, a.resumeId, analysis({ positionTitle: '프론트엔드' }), reg2.jobId!, db);
  const p1 = getPosting(a.postingId, db)!;
  markApplied({ postingId: a.postingId, appliedAt: '2026-11-01' }, db);
  const prior = getPriorApplications(p1.companyId!, { excludePostingId: reg2.postingId }, db);
  expect(prior).toHaveLength(1);
  expect(prior[0]).toMatchObject({
    positionTitle: '백엔드 개발자',
    site: 'other',
    appliedAt: '2026-11-01',
    status: 'applied',
  });
  expect(getPriorApplications(p1.companyId!, { excludePostingId: a.postingId }, db)).toHaveLength(0);
});

test('markApplied before analysis throws', () => {
  const db = makeTestDb();
  const reg = registerPosting({ url: 'https://example.com/x' }, db);
  expect(() => markApplied({ postingId: reg.postingId }, db)).toThrow('분석이 끝난 뒤');
});

test('markApplied records base resume, status event and siteNote', () => {
  const db = makeTestDb();
  const { postingId, resumeId } = analyzedPosting(db, 'https://example.com/y');
  const id = markApplied({ postingId, siteNote: '회사 채용 페이지', notes: '메모' }, db);
  const app = getApplicationForPosting(postingId, db)!;
  expect(app.id).toBe(id);
  expect(app.submittedResume).toEqual({ kind: 'base', versionId: resumeId });
  expect(app.status).toBe('applied');
  expect(app.siteNote).toBe('회사 채용 페이지');
  expect(app.notes).toBe('메모');
  expect(app.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(listStatusEvents(id, db)).toHaveLength(1);
  updateNotes(id, '새 메모', db);
  expect(getApplicationForPosting(postingId, db)!.notes).toBe('새 메모');
});

test('changeStatus to interview requires round and records event', () => {
  const db = makeTestDb();
  const { postingId } = analyzedPosting(db, 'https://example.com/z');
  const id = markApplied({ postingId }, db);
  expect(() => changeStatus(id, 'interview', {}, db)).toThrow();
  changeStatus(id, 'interview', { interviewRound: 2 }, db);
  const app = getApplicationForPosting(postingId, db)!;
  expect(app.status).toBe('interview');
  expect(app.interviewRound).toBe(2);
  expect(listStatusEvents(id, db)).toHaveLength(2);
});

test('bulkCreateApplications links to existing company', () => {
  const db = makeTestDb();
  const kakao = findOrCreateCompany({ displayName: '카카오' }, db);
  const n = bulkCreateApplications(
    [
      { companyName: '(주)카카오', positionTitle: '서버', site: 'wanted', appliedAt: '2026-10-01', status: 'rejected' },
      { companyName: '당근', positionTitle: '백엔드', site: 'other', siteNote: '지인 추천', appliedAt: '2026-10-02', status: 'applied' },
    ],
    db,
  );
  expect(n).toBe(2);
  const rows = searchApplications({}, db);
  expect(rows.find((r) => r.positionTitle === '서버')!.companyId).toBe(kakao);
  const imported = rows.find((r) => r.positionTitle === '백엔드')!;
  expect(imported.postingId).toBeNull();
  expect(imported.resumeLabel).toBeNull();
  expect(imported.resumeBaseVersionNo).toBeNull();
});

test('deletePosting refuses when applied, cascades analyses otherwise', () => {
  const db = makeTestDb();
  const applied = analyzedPosting(db, 'https://example.com/applied');
  markApplied({ postingId: applied.postingId }, db);
  expect(() => deletePosting(applied.postingId, db)).toThrow('지원 기록이 있는 공고는 삭제할 수 없습니다');

  const reg = registerPosting({ url: 'https://example.com/free' }, db);
  saveAnalysis(reg.postingId, applied.resumeId, analysis(), reg.jobId!, db);
  const queued = reanalyzePosting(reg.postingId, db);
  deletePosting(reg.postingId, db);
  expect(getPosting(reg.postingId, db)).toBeUndefined();
  expect(listAnalyses(reg.postingId, db)).toHaveLength(0);
  expect(getJob(queued, db)!.status).toBe('canceled');
});

test('deletePosting refuses while a job is running', () => {
  const db = makeTestDb();
  const reg = registerPosting({ url: 'https://example.com/running' }, db);
  db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, reg.jobId!)).run();
  expect(() => deletePosting(reg.postingId, db)).toThrow('작업이 끝난 뒤 삭제하세요');
  expect(getPosting(reg.postingId, db)).toBeDefined();
});

test('deletePosting ignores jobs of other postings', () => {
  const db = makeTestDb();
  const reg = registerPosting({ url: 'https://example.com/mine' }, db);
  const other = registerPosting({ url: 'https://example.com/other' }, db);
  const otherJob = enqueueJob('analyze_posting', { postingId: other.postingId }, db);
  deletePosting(reg.postingId, db);
  expect(getJob(otherJob, db)!.status).toBe('queued');
});

test('updateApplication relinks company by name; deleteApplication removes events', () => {
  const db = makeTestDb();
  const kakao = findOrCreateCompany({ displayName: '카카오' }, db);
  const { postingId } = analyzedPosting(db, 'https://example.com/u', { companyDisplayName: '네이버' });
  const id = markApplied({ postingId }, db);
  expect(getApplicationForPosting(postingId, db)!.companyId).not.toBe(kakao);

  updateApplication(
    id,
    { companyName: '(주)카카오', positionTitle: '새 포지션', site: 'jobkorea', appliedAt: '2026-09-09' },
    db,
  );
  const app = getApplicationForPosting(postingId, db)!;
  expect(app).toMatchObject({
    companyId: kakao,
    positionTitle: '새 포지션',
    site: 'jobkorea',
    appliedAt: '2026-09-09',
    status: 'applied',
  });

  deleteApplication(id, db);
  expect(db.select().from(statusEvents).where(eq(statusEvents.applicationId, id)).all()).toHaveLength(0);
  expect(getApplicationForPosting(postingId, db)).toBeUndefined();
  expect(listAnalyzedNotApplied(db).map((r) => r.postingId)).toContain(postingId);
});

test('mergeCompanies moves postings, applications and keys', () => {
  const db = makeTestDb();
  const toss = findOrCreateCompany({ displayName: '토스' }, db);
  const viva = findOrCreateCompany({ displayName: '비바리퍼블리카' }, db);
  expect(toss).not.toBe(viva);
  bulkCreateApplications(
    [{ companyName: '토스', positionTitle: 'a', site: 'wanted', appliedAt: '2026-10-01', status: 'applied' }],
    db,
  );
  bulkCreateApplications(
    [{ companyName: '비바리퍼블리카', positionTitle: 'b', site: 'wanted', appliedAt: '2026-10-02', status: 'applied' }],
    db,
  );
  mergeCompanies(toss, viva, db);
  expect(getCompany(viva, db)).toBeUndefined();
  expect(searchApplications({ text: '비바리' }, db)).toHaveLength(2);
  expect(listCompanyKeys(toss, db).map((k) => k.key).sort()).toEqual(['비바리퍼블리카', '토스']);
  expect(() => mergeCompanies(toss, toss, db)).toThrow();
});

test('searchCompanies finds by normalized key with application counts', () => {
  const db = makeTestDb();
  findOrCreateCompany({ displayName: '토스', legalName: '(주)비바리퍼블리카' }, db);
  const kakao = findOrCreateCompany({ displayName: '카카오' }, db);
  addCompanyAlias(kakao, 'Kakao Corp', db);
  bulkCreateApplications(
    [{ companyName: '카카오', positionTitle: 'a', site: 'wanted', appliedAt: '2026-10-01', status: 'applied' }],
    db,
  );
  expect(searchCompanies('비바리', db).map((c) => c.displayName)).toEqual(['토스']);
  const k = searchCompanies('kakao', db);
  expect(k).toHaveLength(1);
  expect(k[0]).toMatchObject({ id: kakao, applicationCount: 1, legalName: null });
  expect(searchCompanies('   ', db)).toEqual([]);
});

test('listSiteNotes returns distinct recent notes', () => {
  vi.useFakeTimers();
  const db = makeTestDb();
  vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  registerPosting({ pastedText: 'a', siteNote: '지인 추천' }, db);
  vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
  registerPosting({ pastedText: 'b', siteNote: '회사 채용 페이지' }, db);
  vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
  bulkCreateApplications(
    [{ companyName: '당근', positionTitle: 'a', site: 'other', siteNote: '지인 추천', appliedAt: '2026-10-01', status: 'applied' }],
    db,
  );
  expect(listSiteNotes(db)).toEqual(['지인 추천', '회사 채용 페이지']);
});

test('listAnalyzedNotApplied returns newest first with latest fit score', () => {
  const db = makeTestDb();
  const a = analyzedPosting(db, 'https://example.com/n1');
  const reg = registerPosting({ url: 'https://example.com/n2' }, db);
  saveAnalysis(reg.postingId, a.resumeId, analysis({ positionTitle: '두번째' }, 55), reg.jobId!, db);
  registerPosting({ url: 'https://example.com/n3' }, db); // 분석 전이라 제외
  const list = listAnalyzedNotApplied(db);
  expect(list.map((r) => r.positionTitle)).toEqual(['두번째', '백엔드 개발자']);
  expect(list[0].fitScore).toBe(55);
});

test('TC-CO-F4 setPostingCompany 는 없는 회사를 거부한다', () => {
  const db = makeTestDb();
  const { postingId } = analyzedPosting(db, 'https://example.com/f4a');
  const before = getPosting(postingId, db)!.companyId;
  expect(() => setPostingCompany(postingId, 99999, db)).toThrow('존재하지 않는 회사입니다');
  expect(getPosting(postingId, db)!.companyId).toBe(before);
});

test('TC-CO-F4 setPostingCompany 는 지원 기록의 회사도 함께 바꾼다', () => {
  const db = makeTestDb();
  const { postingId } = analyzedPosting(db, 'https://example.com/f4b');
  markApplied({ postingId, appliedAt: '2026-11-01' }, db);
  const other = findOrCreateCompany({ displayName: '네이버' }, db);
  setPostingCompany(postingId, other, db);
  expect(getPosting(postingId, db)!.companyId).toBe(other);
  expect(getApplicationForPosting(postingId, db)!.companyId).toBe(other);
});

test('TC-PAST-12 bulkCreateApplications stores notes and document file names', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { applications } = await import('@/lib/db/schema');
  const dir = makeTmpDir('cf-docs-');
  mkdirSync(join(dir, 'resume'), { recursive: true });
  writeFileSync(join(dir, 'resume', '이력서_20261102.pdf'), 'x');
  const db = makeTestDb();
  const base = { companyName: '토스', positionTitle: 'A', site: 'wanted' as const, appliedAt: '2026-11-05', status: 'applied' as const };
  bulkCreateApplications(
    [{ ...base, notes: '메모', submittedDocs: { resume: '이력서_20261102.pdf', career: null, portfolio: null } }],
    db,
    dir,
  );
  const a = db.select().from(applications).get()!;
  expect(a.notes).toBe('메모');
  expect(a.submittedDocs).toEqual({ resume: '이력서_20261102.pdf', career: null, portfolio: null });
});

test('TC-PAST-12 bulkCreateApplications rolls back when a document file is missing', async () => {
  const { applications } = await import('@/lib/db/schema');
  const dir = makeTmpDir('cf-docs-');
  const db = makeTestDb();
  const base = { companyName: '토스', positionTitle: 'A', site: 'wanted' as const, appliedAt: '2026-11-05', status: 'applied' as const };
  expect(() =>
    bulkCreateApplications(
      [base, { ...base, companyName: '당근', submittedDocs: { resume: '이력서_20261102.pdf' } }],
      db,
      dir,
    ),
  ).toThrow('서류 파일을 찾을 수 없습니다: 이력서_20261102.pdf');
  expect(db.select().from(applications).all()).toHaveLength(0);
});

test('TC-PAST-65 changeStatus assignment: no round, one event per save', () => {
  const db = makeTestDb();
  bulkCreateApplications(
    [{ companyName: '토스', positionTitle: 'A', site: 'wanted', appliedAt: '2026-11-05', status: 'applied' }],
    db,
  );
  const id = db.select().from(applications).get()!.id;
  changeStatus(id, 'assignment', { interviewRound: 2, note: '코딩테스트' }, db);
  expect(getApplication(id, db)).toMatchObject({ status: 'assignment', interviewRound: null });
  let ev = listStatusEvents(id, db).filter((e) => e.status === 'assignment');
  expect(ev).toHaveLength(1);
  expect(ev[0]).toMatchObject({ interviewRound: null, note: '코딩테스트' });
  changeStatus(id, 'assignment', { note: '과제 제출' }, db);
  ev = listStatusEvents(id, db).filter((e) => e.status === 'assignment');
  expect(ev.map((e) => e.note)).toEqual(['코딩테스트', '과제 제출']);
});

test('TC-PAST-72 bulkCreateApplications stores none without a file check; resume none throws and saves nothing', async () => {
  const dir = makeTmpDir('cf-docs-');
  const db = makeTestDb();
  const base = { companyName: '토스', positionTitle: 'A', site: 'wanted' as const, appliedAt: '2026-11-05', status: 'applied' as const };
  bulkCreateApplications([{ ...base, submittedDocs: { resume: null, career: 'none', portfolio: 'none' } }], db, dir);
  expect(db.select().from(applications).get()!.submittedDocs).toEqual({ resume: null, career: 'none', portfolio: 'none' });
  expect(() =>
    bulkCreateApplications([{ ...base, companyName: '당근', submittedDocs: { resume: 'none' } }], db, dir),
  ).toThrow('서류 파일을 찾을 수 없습니다: none');
  expect(db.select().from(applications).all()).toHaveLength(1);
});
