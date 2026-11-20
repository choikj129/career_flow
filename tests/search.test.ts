import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { reachedStages } from '@/lib/applications/stages';
import { applications } from '@/lib/db/schema';
import { addCompanyAlias, findOrCreateCompany } from '@/lib/companies/repo';
import { bulkCreateApplications, changeStatus, markApplied } from '@/lib/applications/repo';
import { registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { searchApplications, groupDashboardRows, getDashboardStats, type DashboardRow } from '@/lib/search/dashboard';

const TODAY = '2026-11-05'; // dr()의 기본 지원일(2026-11-01)에서 4일 뒤: 지원 상태는 대기
import type { ApplicationStatus, SiteId } from '@/lib/domain/types';

type Row = Parameters<typeof bulkCreateApplications>[0][number];
const row = (companyName: string, status: ApplicationStatus, site: SiteId, appliedAt = '2026-11-01'): Row => ({
  companyName,
  positionTitle: `${companyName} 포지션`,
  site,
  appliedAt,
  status,
});

function result(score: number, company = '카카오'): AnalysisResult {
  return {
    posting: {
      companyDisplayName: company,
      companyLegalName: null,
      positionTitle: 'BE',
      experienceRequirement: null,
      employmentType: null,
      location: null,
      deadline: null,
      salary: null,
      responsibilities: [],
      requirements: [],
      preferred: [],
      techStack: [],
    },
    fit: { score, breakdown: [] },
    strengths: [],
    gaps: [],
    preferenceMismatches: [],
    tailoringAdvice: '',
  };
}

test('search finds by legal name and alias', () => {
  const db = makeTestDb();
  findOrCreateCompany({ displayName: '토스', legalName: '(주)비바리퍼블리카' }, db);
  bulkCreateApplications(
    [row('토스', 'applied', 'wanted'), row('토스뱅크', 'applied', 'wanted'), row('카카오', 'applied', 'wanted')],
    db,
  );
  expect(searchApplications({ text: '토스' }, db).map((r) => r.companyName).sort()).toEqual(['토스', '토스뱅크']);
  expect(searchApplications({ text: '비바리' }, db)).toHaveLength(1);
  const kakaoId = searchApplications({ text: '카카오' }, db)[0].companyId;
  addCompanyAlias(kakaoId, 'Kakao', db);
  expect(searchApplications({ text: 'kakao' }, db)).toHaveLength(1);
});

test('search matches position title substring', () => {
  const db = makeTestDb();
  bulkCreateApplications(
    [{ companyName: 'A사', positionTitle: 'Senior Backend Engineer', site: 'wanted', appliedAt: '2026-11-01', status: 'applied' }],
    db,
  );
  expect(searchApplications({ text: 'backend' }, db)).toHaveLength(1);
});

test('filters by status and site, sorted by appliedAt desc', () => {
  const db = makeTestDb();
  bulkCreateApplications(
    [
      row('A', 'applied', 'wanted', '2026-10-01'),
      row('B', 'rejected', 'wanted', '2026-11-05'),
      row('C', 'applied', 'jobkorea', '2026-11-10'),
      row('D', 'applied', 'wanted', '2026-11-20'),
    ],
    db,
  );
  expect(searchApplications({}, db).map((r) => r.companyName)).toEqual(['D', 'C', 'B', 'A']);
  expect(searchApplications({ status: 'applied', site: 'wanted' }, db).map((r) => r.companyName)).toEqual(['D', 'A']);
  expect(searchApplications({ from: '2026-11-01', to: '2026-11-10' }, db).map((r) => r.companyName)).toEqual(['C', 'B']);
});

test('DashboardRow carries fit score and base resume label', () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const v2 = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ url: 'https://www.wanted.co.kr/wd/5' }, db);
  saveAnalysis(reg.postingId, v2.id, result(77), reg.jobId!, db);
  markApplied({ postingId: reg.postingId }, db);
  const r = searchApplications({}, db)[0];
  expect(r).toMatchObject({
    postingId: reg.postingId,
    fitScore: 77,
    resumeLabel: '기본 v2',
    resumeBaseVersionNo: 2,
    interviewRound: null,
  });
});

test('getDashboardStats counts this month and analyzed-not-applied', () => {
  const db = makeTestDb();
  bulkCreateApplications(
    [
      row('A', 'applied', 'wanted', '2026-11-03'),
      row('B', 'interview', 'wanted', '2026-11-10'),
      row('C', 'rejected', 'jobkorea', '2026-10-30'),
    ],
    db,
  );
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ url: 'https://example.com/p' }, db);
  saveAnalysis(reg.postingId, resume.id, result(50, 'Z'), reg.jobId!, db);
  const s = getDashboardStats(new Date(2026, 10, 16), db);
  expect(s.appliedThisMonth).toBe(2);
  expect(s.byStatus).toMatchObject({ applied: 1, interview: 1, rejected: 1, document_passed: 0, final_passed: 0, withdrawn: 0 });
  expect(s.bySite).toMatchObject({ wanted: 2, jobkorea: 1, remember: 0, groupby: 0, other: 0 });
  expect(s.analyzedNotApplied).toBe(1);
});

let n = 0;
function dr(over: Partial<DashboardRow>): DashboardRow {
  n += 1;
  return {
    applicationId: n,
    postingId: null,
    companyId: n,
    companyName: `c${n}`,
    positionTitle: 'p',
    site: 'wanted',
    appliedAt: '2026-11-01',
    status: 'applied',
    interviewRound: null,
    fitScore: null,
    resumeLabel: null,
    resumeBaseVersionNo: null,
    resumeDocFile: null,
    reached: [...reachedStages(over.status ?? 'applied', [])],
    ...over,
  };
}

test('groupDashboardRows by site keeps fixed order and pass rate', () => {
  const rows = [
    dr({ site: 'wanted', status: 'document_passed' }),
    dr({ site: 'wanted', status: 'applied' }),
    dr({ site: 'wanted', status: 'withdrawn' }),
    dr({ site: 'jobkorea', status: 'rejected' }),
  ];
  const g = groupDashboardRows(rows, 'site', TODAY);
  expect(g.map((x) => x.key)).toEqual(['wanted', 'jobkorea']);
  expect(g[0]).toMatchObject({ label: '원티드' });
  expect(g[0].tally).toMatchObject({ passed: 1, sample: 1, pending: 1, withdrawn: 1 });
  expect(g[1].tally).toMatchObject({ passed: 0, rejected: 1, sample: 1 });
});

test('groupDashboardRows by status keeps all six columns', () => {
  const rows = [dr({ status: 'interview', interviewRound: 2 }), dr({ status: 'rejected' }), dr({ status: 'withdrawn' })];
  const g = groupDashboardRows(rows, 'status', TODAY);
  expect(g.map((x) => x.key)).toEqual(['applied', 'document_passed', 'assignment', 'interview', 'final_passed', 'closed']);
  expect(g.find((x) => x.key === 'applied')!.rows).toEqual([]);
  expect(g.find((x) => x.key === 'interview')!.rows).toHaveLength(1);
  expect(g.find((x) => x.key === 'closed')).toMatchObject({ label: '종료' });
  expect(g.find((x) => x.key === 'closed')!.rows).toHaveLength(2);
});

test('groupDashboardRows by resume puts unknown last', () => {
  const rows = [
    dr({ resumeLabel: '기본 v2', resumeBaseVersionNo: 2 }),
    dr({ resumeLabel: '기본 v3', resumeBaseVersionNo: 3 }),
    dr({}),
    dr({ resumeLabel: '기본 v3', resumeBaseVersionNo: 3, status: 'final_passed' }),
  ];
  const g = groupDashboardRows(rows, 'resume', TODAY);
  expect(g.map((x) => x.key)).toEqual(['v3', 'v2', 'none']);
  expect(g[0].rows).toHaveLength(2);
  expect(g[2].label).toBe('모름');
  expect(g[0].tally).toMatchObject({ passed: 1, sample: 1 });
});

test('TC-PAST-31 resume label from submitted document file', () => {
  const db = makeTestDb();
  bulkCreateApplications([row('A', 'applied', 'wanted')], db);
  db.update(applications).set({ submittedDocs: { resume: '이력서_20261102.pdf', career: null, portfolio: null } }).run();
  const r = searchApplications({}, db)[0];
  expect(r.resumeLabel).toBe('이력서 2026-11-02');
  expect(r.resumeDocFile).toBe('이력서_20261102.pdf');
  expect(r.resumeBaseVersionNo).toBeNull();
});

test('TC-PAST-31 groupDashboardRows by resume: base -> files (newest first) -> unknown', () => {
  const rows = [
    dr({}),
    dr({ resumeLabel: '이력서 2026-09-05', resumeDocFile: '이력서_20260905.pdf' }),
    dr({ resumeLabel: '기본 v1', resumeBaseVersionNo: 1 }),
    dr({ resumeLabel: '이력서 2026-11-02', resumeDocFile: '이력서_20261102.pdf' }),
    dr({ resumeLabel: '이력서 2026-11-02', resumeDocFile: '이력서_20261102.pdf' }),
  ];
  const g = groupDashboardRows(rows, 'resume', TODAY);
  expect(g.map((x) => x.key)).toEqual(['v1', 'doc:이력서_20261102.pdf', 'doc:이력서_20260905.pdf', 'none']);
  expect(g[1].label).toBe('이력서 2026-11-02');
  expect(g[1].rows).toHaveLength(2);
});

// A: 서류합격 -> 불합격, B: 서류합격 -> 면접, C: 지원, D: 불합격(이력 없음), E: 서류합격 -> 지원취소, F: 서류합격 -> 지원(되돌림)
function reachedDb() {
  const db = makeTestDb();
  bulkCreateApplications(['A', 'B', 'C', 'D', 'E', 'F'].map((c) => row(c, 'applied', 'wanted')), db);
  const id = (c: string) => searchApplications({ text: c }, db)[0].applicationId;
  changeStatus(id('A'), 'document_passed', {}, db);
  changeStatus(id('A'), 'rejected', {}, db);
  changeStatus(id('B'), 'document_passed', {}, db);
  changeStatus(id('B'), 'interview', { interviewRound: 1 }, db);
  changeStatus(id('D'), 'rejected', {}, db);
  changeStatus(id('E'), 'document_passed', {}, db);
  changeStatus(id('E'), 'withdrawn', {}, db);
  changeStatus(id('F'), 'document_passed', {}, db);
  changeStatus(id('F'), 'applied', {}, db);
  return db;
}
const names = (rows: DashboardRow[]) => rows.map((r) => r.companyName).sort();

test('TC-PAST-51 status filter shows records that passed the stage', () => {
  const db = reachedDb();
  expect(names(searchApplications({ status: 'document_passed' }, db))).toEqual(['A', 'B', 'E']);
  expect(names(searchApplications({ status: 'interview' }, db))).toEqual(['B']);
  expect(names(searchApplications({ status: 'rejected' }, db))).toEqual(['A', 'D']);
  expect(names(searchApplications({ status: 'withdrawn' }, db))).toEqual(['E']);
  expect(names(searchApplications({ status: 'applied' }, db))).toEqual(['C', 'F']);
  expect(names(searchApplications({ status: 'final_passed' }, db))).toEqual([]);
});

test('TC-PAST-52 status board columns stay on the current status', () => {
  const db = reachedDb();
  const g = groupDashboardRows(searchApplications({ status: 'document_passed' }, db), 'status', TODAY);
  expect(names(g.find((x) => x.key === 'closed')!.rows)).toEqual(['A', 'E']);
  expect(names(g.find((x) => x.key === 'interview')!.rows)).toEqual(['B']);
  expect(g.find((x) => x.key === 'document_passed')!.rows).toEqual([]);
});

test('TC-PAST-53 summary counts: reachedCounts follow the filter results, byStatus stays current', () => {
  const db = reachedDb();
  const s = getDashboardStats(new Date(2026, 10, 16), db);
  expect(s.reachedCounts.document_passed).toBe(searchApplications({ status: 'document_passed' }, db).length);
  expect(s.reachedCounts.interview).toBe(searchApplications({ status: 'interview' }, db).length);
  expect(s.reachedCounts.final_passed).toBe(0);
  expect(Object.values(s.byStatus).reduce((a, b) => a + b, 0)).toBe(6);
  expect(s.byStatus.document_passed).toBe(0);
});

test('TC-STATS-14 dashboard group tally uses the stats definition (pending vs no response)', () => {
  const db = makeTestDb();
  bulkCreateApplications(['A', 'B', 'C', 'D'].map((c) => row(c, 'applied', 'wanted')), db);
  const id = (c: string) => searchApplications({ text: c }, db)[0].applicationId;
  changeStatus(id('A'), 'document_passed', {}, db);
  changeStatus(id('A'), 'rejected', {}, db);
  changeStatus(id('B'), 'document_passed', {}, db);
  changeStatus(id('B'), 'interview', { interviewRound: 1 }, db);
  changeStatus(id('D'), 'rejected', {}, db);
  const rows = searchApplications({}, db); // 모두 지원일 2026-11-01
  const [early] = groupDashboardRows(rows, 'site', '2026-11-11'); // +10일
  expect(early.tally).toMatchObject({ passed: 2, sample: 3, pending: 1, noResponse: 0 });
  const [late] = groupDashboardRows(rows, 'site', '2026-12-11'); // +40일
  expect(late.tally).toMatchObject({ passed: 2, sample: 4, pending: 0, noResponse: 1 });
});

test('TC-PAST-54 pass rate counts passed-then-rejected/withdrawn as passed', () => {
  const db = reachedDb();
  const [g] = groupDashboardRows(searchApplications({}, db), 'site', TODAY);
  // passed: A, B, E / sample: passed + 서류합격을 거치지 않은 불합격(D). C는 대기, F는 되돌린 기록(지원, 대기)
  expect(g.tally).toMatchObject({ passed: 3, rejected: 1, sample: 4, pending: 2 });
});

// A: 서류합격 -> 불합격, B: 서류합격 -> 면접, C: 지원, D: 불합격, E: 서류합격 -> 과제 -> 불합격, F: 과제(지금 상태)
function assignmentDb() {
  const db = makeTestDb();
  bulkCreateApplications(['A', 'B', 'C', 'D', 'E', 'F'].map((c) => row(c, 'applied', 'wanted')), db);
  const id = (c: string) => searchApplications({ text: c }, db)[0].applicationId;
  changeStatus(id('A'), 'document_passed', {}, db);
  changeStatus(id('A'), 'rejected', {}, db);
  changeStatus(id('B'), 'document_passed', {}, db);
  changeStatus(id('B'), 'interview', { interviewRound: 1 }, db);
  changeStatus(id('D'), 'rejected', {}, db);
  changeStatus(id('E'), 'document_passed', {}, db);
  changeStatus(id('E'), 'assignment', {}, db);
  changeStatus(id('E'), 'rejected', {}, db);
  changeStatus(id('F'), 'assignment', {}, db);
  return db;
}

test('TC-PAST-62 filters with the assignment stage', () => {
  const db = assignmentDb();
  expect(names(searchApplications({ status: 'assignment' }, db))).toEqual(['E', 'F']);
  expect(names(searchApplications({ status: 'document_passed' }, db))).toEqual(['A', 'B', 'E', 'F']);
  expect(names(searchApplications({ status: 'interview' }, db))).toEqual(['B']);
});

test('TC-PAST-63 status board has six columns in order; cards stay on the current status', () => {
  const db = assignmentDb();
  const g = groupDashboardRows(searchApplications({}, db), 'status', TODAY);
  expect(g.map((x) => x.key)).toEqual(['applied', 'document_passed', 'assignment', 'interview', 'final_passed', 'closed']);
  expect(names(g.find((x) => x.key === 'assignment')!.rows)).toEqual(['F']);
  expect(names(g.find((x) => x.key === 'closed')!.rows)).toEqual(['A', 'D', 'E']);
});

test('TC-PAST-64 reachedCounts and pass rate include assignment records', () => {
  const db = assignmentDb();
  const s = getDashboardStats(new Date(2026, 10, 16), db);
  expect(s.reachedCounts.assignment).toBe(2);
  expect(s.reachedCounts.document_passed).toBe(4);
  const [g] = groupDashboardRows(searchApplications({}, db), 'site', TODAY);
  expect(g.tally.passed).toBe(4); // A, B, E, F
});

test('TC-PAST-76 resumeLabel ignores none in other kinds; resume file label stays', () => {
  const db = makeTestDb();
  bulkCreateApplications([row('A', 'applied', 'wanted')], db);
  db.update(applications).set({ submittedDocs: { resume: '이력서_20261102.pdf', career: 'none', portfolio: 'none' } }).run();
  const r = searchApplications({}, db)[0];
  expect(r.resumeLabel).toBe('이력서 2026-11-02');
  expect(r.resumeDocFile).toBe('이력서_20261102.pdf');
  const g = groupDashboardRows([r], 'resume', TODAY);
  expect(g.map((x) => x.key)).toEqual(['doc:이력서_20261102.pdf']);
});
