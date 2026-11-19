import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { emptyResume } from '@/lib/resume/schema';
import { saveResumeVersion } from '@/lib/resume/repo';
import { registerPosting, saveAnalysis, deletePosting, listAnalyzedNotApplied, listUnanalyzedPostings } from '@/lib/postings/repo';
import { addCompanyAlias, findOrCreateCompany } from '@/lib/companies/repo';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import {
  markApplied,
  changeStatus,
  getApplicationForPosting,
  listApplicationsForPosting,
  getRecentApplications,
} from '@/lib/applications/repo';
import { searchApplications } from '@/lib/search/dashboard';
import { monthsAgoLocal } from '@/lib/domain/dates';

function analysis(company: string, position: string): AnalysisResult {
  return {
    posting: {
      companyDisplayName: company,
      companyLegalName: null,
      positionTitle: position,
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
    fit: { score: 80, breakdown: [] },
    strengths: [],
    gaps: [],
    preferenceMismatches: [],
    tailoringAdvice: '',
  };
}

function setup() {
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const add = (url: string, company = '카카오', position = '백엔드') => {
    const reg = registerPosting({ url }, db);
    saveAnalysis(reg.postingId, resume.id, analysis(company, position), reg.jobId!, db);
    return reg.postingId;
  };
  return { db, add };
}

const NOW = new Date(2026, 10, 19, 12, 0, 0); // 2026-11-19 로컬

test('TC-REAPPLY-01 같은 공고에 지원 기록을 여러 개 만들 수 있다', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  const a = markApplied({ postingId: p, appliedAt: '2026-05-01' }, db);
  const b = markApplied({ postingId: p, appliedAt: '2026-11-01' }, db);
  expect(b).not.toBe(a);
  expect(listApplicationsForPosting(p, db).map((r) => r.id)).toEqual([b, a]); // 최신순
  expect(getApplicationForPosting(p, db)!.id).toBe(b); // 최신 기록
});

test('TC-REAPPLY-02 지원일이 같으면 나중에 만든 기록이 최신', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  const a = markApplied({ postingId: p, appliedAt: '2026-11-01' }, db);
  const b = markApplied({ postingId: p, appliedAt: '2026-11-01' }, db);
  expect(listApplicationsForPosting(p, db).map((r) => r.id)).toEqual([b, a]);
});

test('TC-REAPPLY-03 기록이 없으면 undefined와 빈 목록', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  expect(getApplicationForPosting(p, db)).toBeUndefined();
  expect(listApplicationsForPosting(p, db)).toEqual([]);
});

test('TC-REAPPLY-04 monthsAgoLocal: 6개월 전 날짜와 말일 보정', () => {
  expect(monthsAgoLocal(new Date(2026, 10, 19), 6)).toBe('2026-05-19');
  expect(monthsAgoLocal(new Date(2026, 7, 31), 6)).toBe('2026-02-28'); // 2월에는 31일이 없다
  expect(monthsAgoLocal(new Date(2026, 2, 5), 6)).toBe('2025-09-05'); // 해를 넘김
  expect(monthsAgoLocal(new Date(2026, 0, 31), 12)).toBe('2025-01-31');
});

test('TC-REAPPLY-05 getRecentApplications: 정확히 6개월 전 날은 포함, 하루 전은 제외', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  const q = add('https://example.com/2');
  const edge = markApplied({ postingId: p, appliedAt: '2026-05-19' }, db);
  markApplied({ postingId: q, appliedAt: '2026-05-18' }, db);
  const r = getRecentApplications(p, { now: NOW }, db);
  expect(r.map((x) => x.id)).toEqual([edge]);
});

test('TC-REAPPLY-06 같은 공고와 같은 회사 기록을 최신순으로, samePosting 표시', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  const other = add('https://example.com/2', '카카오', '프론트엔드');
  const otherCompany = add('https://example.com/3', '네이버');
  const old = markApplied({ postingId: p, appliedAt: '2026-08-01' }, db);
  const sameCo = markApplied({ postingId: other, appliedAt: '2026-10-01' }, db);
  markApplied({ postingId: otherCompany, appliedAt: '2026-10-05' }, db);
  const r = getRecentApplications(p, { now: NOW }, db);
  expect(r.map((x) => [x.id, x.samePosting])).toEqual([
    [sameCo, false],
    [old, true],
  ]);
  expect(r[0]).toMatchObject({ positionTitle: '프론트엔드', site: 'other', status: 'applied', appliedAt: '2026-10-01' });
});

test('TC-REAPPLY-07 별칭·법인명으로 연결된 같은 회사도 포함, 현재 상태 반영', () => {
  const { db, add } = setup();
  const a = add('https://example.com/1', '모빌페이');
  const b = add('https://example.com/2', '모빌리티페이');
  const idA = findOrCreateCompany({ displayName: '모빌페이' }, db);
  addCompanyAlias(idA, '모빌리티페이', db);
  // 별칭은 키만 추가한다. 같은 회사로 합쳐진 공고를 만들기 위해 b의 회사를 a로 맞춘다.
  const pb = db.$client.prepare('update postings set company_id = ? where id = ?');
  pb.run(idA, b);
  const rec = markApplied({ postingId: b, appliedAt: '2026-11-01' }, db);
  changeStatus(rec, 'interview', { interviewRound: 2 }, db);
  const r = getRecentApplications(a, { now: NOW }, db);
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({ id: rec, samePosting: false, status: 'interview', interviewRound: 2 });
});

test('TC-REAPPLY-08 기록이 없거나 6개월이 지났으면 빈 목록, months 조절', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  expect(getRecentApplications(p, { now: NOW }, db)).toEqual([]);
  markApplied({ postingId: p, appliedAt: '2026-01-01' }, db);
  expect(getRecentApplications(p, { now: NOW }, db)).toEqual([]);
  expect(getRecentApplications(p, { now: NOW, months: 12 }, db)).toHaveLength(1);
});

test('TC-REAPPLY-09 여러 기록이 있어도 삭제 거부, 분석한 공고·대시보드 중복 없음', () => {
  const { db, add } = setup();
  const p = add('https://example.com/1');
  const idle = add('https://example.com/2', '네이버');
  markApplied({ postingId: p, appliedAt: '2026-10-01' }, db);
  markApplied({ postingId: p, appliedAt: '2026-11-01' }, db);
  expect(() => deletePosting(p, db)).toThrow('지원 기록이 있는 공고는 삭제할 수 없습니다');
  expect(listAnalyzedNotApplied(db).map((r) => r.postingId)).toEqual([idle]);
  expect(listUnanalyzedPostings(db)).toEqual([]);
  expect(searchApplications({}, db)).toHaveLength(2); // 기록마다 한 줄
});
