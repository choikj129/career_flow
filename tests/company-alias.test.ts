import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { findOrCreateCompany, listCompanyKeys, searchCompanies } from '@/lib/companies/repo';
import { getPosting, registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { AnalysisResult, analysisOutputSchema } from '@/lib/ai/tasks/schemas';
import type { Db } from '@/lib/db/client';

function posting(company: string, aliases?: string[]) {
  return {
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
    ...(aliases ? { companyAliases: aliases } : {}),
  };
}
function analysis(company: string, aliases?: string[]) {
  return {
    posting: posting(company, aliases),
    fit: { score: 70, breakdown: [{ category: 'requirements', score: 70, reason: '근거' }] },
    strengths: [],
    gaps: [],
    preferenceMismatches: [],
    tailoringAdvice: '',
  } as AnalysisResult;
}
function setup(db: Db, company: string, url: string) {
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url, companyName: company }, db);
  return { resume, r };
}
const aliasKeys = (db: Db, id: number) => listCompanyKeys(id, db).filter((k) => k.kind === 'alias').map((k) => k.key);

test('TC-CA-01 saveAnalysis adds aliases to the posting company and search finds it', () => {
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url: 'https://example.com/ca1' }, db);
  saveAnalysis(r.postingId, resume.id, analysis('Zeta AI', ['제타 AI', '  제타에이아이  ']), r.jobId!, db);
  const id = getPosting(r.postingId, db)!.companyId!;
  expect(aliasKeys(db, id)).toHaveLength(2);
  expect(searchCompanies('제타', db).map((c) => c.id)).toEqual([id]);
  expect(searchCompanies('제타에이아이', db).map((c) => c.id)).toEqual([id]);
});

test('TC-CA-02 aliases attach to the user-entered company; duplicates and display-name key are skipped', () => {
  const db = makeTestDb();
  const { resume, r } = setup(db, '가상컴퍼니', 'https://example.com/ca2');
  const id = getPosting(r.postingId, db)!.companyId!;
  saveAnalysis(r.postingId, resume.id, analysis('Other', ['가상 컴퍼니', '하나', '하나', '  ', 'x'.repeat(51)]), r.jobId!, db);
  saveAnalysis(r.postingId, resume.id, analysis('Other', ['하나']), r.jobId!, db);
  expect(aliasKeys(db, id)).toHaveLength(1);
  expect(searchCompanies('하나', db).map((c) => c.id)).toEqual([id]);
});

test('TC-CA-03 an alias equal to another company key is skipped and the analysis still saves', () => {
  const db = makeTestDb();
  const other = findOrCreateCompany({ displayName: '다른회사' }, db);
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url: 'https://example.com/ca3' }, db);
  saveAnalysis(r.postingId, resume.id, analysis('Eta Corp', ['다른회사', '에타']), r.jobId!, db);
  const id = getPosting(r.postingId, db)!.companyId!;
  expect(id).not.toBe(other);
  expect(aliasKeys(db, id)).toHaveLength(1);
  expect(searchCompanies('다른회사', db).map((c) => c.id)).toEqual([other]);
});

test('TC-CA-04 at most 3 aliases are added; old results without the field still parse', () => {
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const r = registerPosting({ url: 'https://example.com/ca4' }, db);
  saveAnalysis(r.postingId, resume.id, analysis('Theta', ['가가', '나나', '다다', '라라']), r.jobId!, db);
  expect(aliasKeys(db, getPosting(r.postingId, db)!.companyId!)).toHaveLength(3);
  expect(AnalysisResult.safeParse(analysis('Old')).success).toBe(true);
});

test('TC-CA-05 CLI output schema requires companyAliases (empty array allowed)', () => {
  const schema = analysisOutputSchema(false);
  expect(schema.safeParse(analysis('A')).success).toBe(false);
  expect(schema.safeParse(analysis('A', [])).success).toBe(true);
});

test('TC-CA-06 prompt has the alias rule', () => {
  const t = readFileSync(join(resolve(__dirname, '../prompts'), 'analyze-posting.md'), 'utf8');
  expect(t).toContain('companyAliases');
  expect(t).toMatch(/한글이 없으면/);
  expect(t).toMatch(/지어낸 이름은 넣지 않는다/);
});
