import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { getCompany } from '@/lib/companies/repo';
import { getApplicationForPosting, markApplied } from '@/lib/applications/repo';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { getPosting, registerPosting, saveAnalysis, updatePostingInfo } from '@/lib/postings/repo';

function analysis(company: string, position: string): AnalysisResult {
  return {
    posting: {
      companyDisplayName: company,
      companyLegalName: null,
      positionTitle: position,
      deadline: null,
      employmentType: null,
      location: null,
      summary: '요약',
      requirements: [],
      preferred: [],
      responsibilities: [],
      keywords: [],
    },
    fit: { score: 70, summary: '', strengths: [], gaps: [] },
  } as unknown as AnalysisResult;
}

test('TC-PE-01 registerPosting stores user company and position', () => {
  const db = makeTestDb();
  const r = registerPosting({ url: 'https://example.com/pe1', companyName: '  가상컴퍼니 ', positionTitle: ' 백엔드 ' }, db);
  const p = getPosting(r.postingId, db)!;
  expect(p.positionTitle).toBe('백엔드');
  expect(getCompany(p.companyId!, db)!.displayName).toBe('가상컴퍼니');
});

test('TC-PE-02 blank company/position are left empty; too long throws', () => {
  const db = makeTestDb();
  const r = registerPosting({ url: 'https://example.com/pe2', companyName: '  ', positionTitle: '' }, db);
  const p = getPosting(r.postingId, db)!;
  expect(p.companyId).toBeNull();
  expect(p.positionTitle).toBeNull();
  expect(() => registerPosting({ url: 'https://example.com/pe2b', companyName: 'a'.repeat(101) }, db)).toThrow();
  expect(() => registerPosting({ url: 'https://example.com/pe2c', positionTitle: 'a'.repeat(201) }, db)).toThrow();
});

test('TC-PE-03 saveAnalysis keeps user company and position', () => {
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url: 'https://example.com/pe3', companyName: '내회사', positionTitle: '내포지션' }, db);
  const before = getPosting(r.postingId, db)!.companyId;
  saveAnalysis(r.postingId, resume.id, analysis('AI회사', 'AI포지션'), r.jobId!, db);
  const p = getPosting(r.postingId, db)!;
  expect(p.companyId).toBe(before);
  expect(p.positionTitle).toBe('내포지션');
});

test('TC-PE-04 saveAnalysis fills position when empty, and does not overwrite it on re-analysis', () => {
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url: 'https://example.com/pe4' }, db);
  saveAnalysis(r.postingId, resume.id, analysis('회사A', '첫 포지션'), r.jobId!, db);
  expect(getPosting(r.postingId, db)!.positionTitle).toBe('첫 포지션');
  saveAnalysis(r.postingId, resume.id, analysis('회사A', '둘째 포지션'), r.jobId!, db);
  expect(getPosting(r.postingId, db)!.positionTitle).toBe('첫 포지션');
});

test('TC-PE-05 updatePostingInfo changes company and position, validates, and moves the application company', () => {
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url: 'https://example.com/pe5' }, db);
  saveAnalysis(r.postingId, resume.id, analysis('회사A', '포지션A'), r.jobId!, db);
  markApplied({ postingId: r.postingId }, db);
  updatePostingInfo(r.postingId, { companyName: ' 새회사 ', positionTitle: ' 새 포지션 ' }, db);
  const p = getPosting(r.postingId, db)!;
  expect(p.positionTitle).toBe('새 포지션');
  expect(getCompany(p.companyId!, db)!.displayName).toBe('새회사');
  expect(getApplicationForPosting(r.postingId, db)!.companyId).toBe(p.companyId);
  expect(() => updatePostingInfo(r.postingId, { companyName: ' ', positionTitle: 'x' }, db)).toThrow();
  expect(() => updatePostingInfo(r.postingId, { companyName: 'x', positionTitle: '' }, db)).toThrow();
  expect(() => updatePostingInfo(r.postingId, { companyName: 'a'.repeat(101), positionTitle: 'x' }, db)).toThrow();
  expect(() => updatePostingInfo(r.postingId, { companyName: 'x', positionTitle: 'a'.repeat(201) }, db)).toThrow();
  expect(() => updatePostingInfo(9999, { companyName: 'x', positionTitle: 'y' }, db)).toThrow('공고를 찾을 수 없습니다');
});
