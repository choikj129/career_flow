import { makeTmpDir } from './helpers/tmp';
// 제출 서류 기록(D-23 a): 선택 값 변환, 기본값, 저장·검증, 라벨, 대시보드 묶음. TC-SUBMIT-01~07
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ kitDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return { ...mod, config: new Proxy(mod.config, { get: (t, k) => (k === 'kitDir' ? h.kitDir : t[k as string]) }) };
});

import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { applications } from '@/lib/db/schema';
import { markApplied, updateApplication, getApplication, getApplicationForPosting, resolveSubmittedResume } from '@/lib/applications/repo';

import {
  currentSubmitted,
  decodeResumeChoice,
  defaultSubmitted,
  encodeResumeChoice,
  resumeDisplay,
  resumeLabel,
  toColumns,
} from '@/lib/applications/submitted';
import { registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { saveKit } from '@/lib/kit/repo';
import { addExternalRevision, createRecipeRevision } from '@/lib/tailored/repo';
import { groupDashboardRows, searchApplications } from '@/lib/search/dashboard';
import { byDocVersion, byProfile, tailoredCompare } from '@/lib/stats/aggregate';
import { loadStatItems } from '@/lib/stats/load';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import type { Db } from '@/lib/db/client';
import type { DocFile } from '@/lib/documents/files';
import type { ResumeChoice } from '@/lib/applications/submitted';

const KIT_DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const kitFiles = () => readdirSync(KIT_DIR).map((name) => ({ name, data: readFileSync(join(KIT_DIR, name)) }));
const RECIPE = { track: '백엔드', profileId: 'B2', adjustmentIds: [] as string[] };

function analysis(rec?: { track: string; kitId: number }): AnalysisResult {
  return {
    posting: {
      companyDisplayName: '가상상사',
      companyLegalName: null,
      positionTitle: '백엔드 개발자',
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
    fit: { score: 70, breakdown: [] },
    strengths: [],
    gaps: [],
    preferenceMismatches: [],
    tailoringAdvice: '',
    ...(rec
      ? { profileRecommendation: { track: rec.track, trackReason: '', profiles: [], adjustments: [], kitId: rec.kitId } }
      : {}),
  };
}

let seq = 0;
/** 분석이 끝난 공고(회사 있음) */
function analyzed(db: Db, rec?: { track: string; kitId: number }) {
  seq += 1;
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ pastedText: `가상 공고 ${seq}` }, db);
  saveAnalysis(reg.postingId, resume.id, analysis(rec), reg.jobId!, db);
  return { postingId: reg.postingId, resumeId: resume.id };
}

function docsDirWith(files: Record<string, string[]>): string {
  const dir = makeTmpDir('cf-docs-');
  for (const [kind, names] of Object.entries(files)) {
    mkdirSync(join(dir, kind), { recursive: true });
    for (const n of names) writeFileSync(join(dir, kind, n), '%PDF-1.4 fake');
  }
  return dir;
}

const withKit = (db: Db) => {
  h.kitDir = makeTmpDir('cf-kit-');
  return saveKit(kitFiles(), db, h.kitDir).kitId;
};

beforeEach(() => {
  h.kitDir = '';
});

describe('pure helpers', () => {
  test('TC-SUBMIT-07 encode/decode round trip and bad strings', () => {
    const cs = [
      { kind: 'tailored', tailoredRevisionId: 12 },
      { kind: 'kit', kitId: 3, track: '백엔드' },
      { kind: 'kit', kitId: 3, track: '데이터:분석' },
      { kind: 'file', fileName: '이력서_20261102.pdf' },
      { kind: 'unknown' },
      { kind: 'base', versionId: 3 },
    ] as const;
    for (const c of cs) expect(decodeResumeChoice(encodeResumeChoice(c))).toEqual(c);
    expect(encodeResumeChoice({ kind: 'kit', kitId: 3, track: '백엔드' })).toBe('kit:3:백엔드');
    for (const bad of ['', 'tailored', 'tailored:0', 'tailored:x', 'kit:3', 'kit:x:백엔드', 'kit:3:', 'file:', 'base:-1', 'zzz:1']) {
      expect(decodeResumeChoice(bad), bad).toBeNull();
    }
  });

  test('defaultSubmitted order: tailored -> kit -> file -> unknown', () => {
    const files: DocFile[] = [
      { kind: 'resume', date: '2026-09-01', fileName: '이력서_20260901.pdf' },
      { kind: 'career', date: '2026-10-20', fileName: '경력기술서_20261020.pdf' },
    ];
    const base = { appliedAt: '2026-11-02', files, latestRevisionId: null, kit: null };
    expect(defaultSubmitted({ ...base, latestRevisionId: 7, kit: { id: 1, track: 'A' } })).toEqual({
      resume: { kind: 'tailored', tailoredRevisionId: 7 },
      career: '경력기술서_20261020.pdf',
      portfolio: null,
    });
    expect(defaultSubmitted({ ...base, kit: { id: 1, track: 'A' } }).resume).toEqual({ kind: 'kit', kitId: 1, track: 'A' });
    expect(defaultSubmitted(base).resume).toEqual({ kind: 'file', fileName: '이력서_20260901.pdf' });
    expect(defaultSubmitted({ ...base, files: [] }).resume).toEqual({ kind: 'unknown' });
  });

  test('toColumns: tailored/kit/base clear the resume file, imported stays imported, kit needs a profile', () => {
    const input = { career: '경력기술서_20261020.pdf', portfolio: null };
    expect(toColumns({ ...input, resume: { kind: 'tailored', tailoredRevisionId: 5 } })).toEqual({
      submittedResume: { kind: 'tailored', tailoredRevisionId: 5 },
      submittedDocs: { resume: null, career: '경력기술서_20261020.pdf', portfolio: null },
    });
    expect(() => toColumns({ ...input, resume: { kind: 'kit', kitId: 1, track: 'A' } })).toThrow();
    expect(
      toColumns({ ...input, resume: { kind: 'kit', kitId: 1, track: 'A' } }, { kitProfile: { profileId: 'A1', profileName: '범용' } }).submittedResume,
    ).toEqual({ kind: 'kit', kitId: 1, track: 'A', profileId: 'A1', profileName: '범용' });
    const file = toColumns({ ...input, resume: { kind: 'file', fileName: '이력서_20261102.pdf' } }, { prevKind: 'imported' });
    expect(file.submittedResume).toEqual({ kind: 'imported' });
    expect(file.submittedDocs.resume).toBe('이력서_20261102.pdf');
    expect(toColumns({ ...input, resume: { kind: 'unknown' } }, { prevKind: 'base' }).submittedResume).toEqual({ kind: 'file' });
    expect(toColumns({ ...input, resume: { kind: 'base', versionId: 3 } }).submittedResume).toEqual({ kind: 'base', versionId: 3 });
  });

  test('currentSubmitted reads the record back into a choice', () => {
    const docs = { resume: '이력서_20261102.pdf', career: 'none', portfolio: null };
    expect(currentSubmitted({ kind: 'file' }, docs)).toEqual({ resume: { kind: 'file', fileName: '이력서_20261102.pdf' }, career: 'none', portfolio: null });
    expect(currentSubmitted({ kind: 'imported' }, null).resume).toEqual({ kind: 'unknown' });
    expect(currentSubmitted({ kind: 'tailored', tailoredRevisionId: 4 }, null).resume).toEqual({ kind: 'tailored', tailoredRevisionId: 4 });
    expect(currentSubmitted({ kind: 'kit', kitId: 2, track: 'A', profileId: 'A1', profileName: 'x' }, null).resume).toEqual({ kind: 'kit', kitId: 2, track: 'A' });
    expect(currentSubmitted({ kind: 'base', versionId: 3 }, null).resume).toEqual({ kind: 'base', versionId: 3 });
  });

  test('TC-SUBMIT-04 resumeLabel short and long', () => {
    const t = { kind: 'tailored', tailoredRevisionId: 9 } as const;
    expect(resumeLabel(t, null, { revNo: 2, profile: 'B3', profileName: '정합성' }, 'short')).toBe('맞춤 r2 · B3');
    expect(resumeLabel(t, null, { revNo: 2, profile: 'B3', profileName: '정합성' }, 'long')).toBe('맞춤 이력서 r2 (B3 정합성)');
    expect(resumeLabel(t, null, { revNo: 2 }, 'short')).toBe('맞춤 r2');
    expect(resumeLabel(t, null, {}, 'long')).toBe('맞춤 이력서');
    const k = { kind: 'kit', kitId: 1, track: '백엔드', profileId: 'B1', profileName: '범용' } as const;
    expect(resumeLabel(k, null, {}, 'short')).toBe('기본 서류 백엔드 · B1');
    expect(resumeLabel(k, null, {}, 'long')).toBe('기본 서류 백엔드 (B1 범용)');
    expect(resumeLabel({ kind: 'base', versionId: 1 }, null, { versionNo: 3 }, 'short')).toBe('기본 v3');
    expect(resumeLabel({ kind: 'base', versionId: 1 }, null, { versionNo: 3 }, 'long')).toBe('기본 이력서 v3');
    expect(resumeLabel({ kind: 'file' }, { resume: '이력서_20261102.pdf' }, {}, 'short')).toBe('이력서 2026-11-02');
    expect(resumeLabel({ kind: 'imported' }, { resume: '이력서_20261102.pdf' }, {}, 'long')).toBe('이력서 2026-11-02');
    expect(resumeLabel({ kind: 'file' }, { resume: null }, {}, 'short')).toBeNull();
    expect(resumeLabel({ kind: 'imported' }, null, {}, 'short')).toBeNull();
  });
});

describe('markApplied defaults (TC-SUBMIT-01)', () => {
  test('no files, kit or revisions: file kind with the resume unknown (no base resume needed)', () => {
    const db = makeTestDb();
    const { postingId } = analyzed(db);
    const dir = docsDirWith({});
    markApplied({ postingId, appliedAt: '2026-11-02' }, db, dir);
    const a = getApplicationForPosting(postingId, db)!;
    expect(a.submittedResume).toEqual({ kind: 'file' });
    expect(a.submittedDocs).toEqual({ resume: null, career: null, portfolio: null });
  });

  test('saves even without any base resume version', () => {
    const db = makeTestDb();
    const { postingId, resumeId } = analyzed(db);
    // 기본 이력서 버전이 있어도 새 기록은 base로 만들지 않는다
    markApplied({ postingId, appliedAt: '2026-11-02' }, db, docsDirWith({}));
    expect(getApplicationForPosting(postingId, db)!.submittedResume).not.toEqual({ kind: 'base', versionId: resumeId });
  });

  test('picks resume, career and portfolio files by applied date', () => {
    const db = makeTestDb();
    const { postingId } = analyzed(db);
    const dir = docsDirWith({
      resume: ['이력서_20260901.pdf', '이력서_20261101.pdf'],
      career: ['경력기술서_20261101.pdf'],
      portfolio: ['포트폴리오_20261201.pdf'],
    });
    markApplied({ postingId, appliedAt: '2026-10-15' }, db, dir);
    const a = getApplicationForPosting(postingId, db)!;
    expect(a.submittedResume).toEqual({ kind: 'file' });
    expect(a.submittedDocs).toEqual({ resume: '이력서_20260901.pdf', career: 'none', portfolio: 'none' });
  });

  test('a usable kit with a recommended track: base documents with the default profile', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const { postingId } = analyzed(db, { track: '데이터', kitId });
    markApplied({ postingId, appliedAt: '2026-11-02' }, db, docsDirWith({ resume: ['이력서_20260901.pdf'] }));
    const a = getApplicationForPosting(postingId, db)!;
    expect(a.submittedResume).toEqual({ kind: 'kit', kitId, track: '데이터', profileId: 'D1', profileName: '범용' });
    expect(a.submittedDocs?.resume).toBeNull();
  });

  test('a kit with two tracks and no recommendation does not guess a track', () => {
    const db = makeTestDb();
    withKit(db);
    const { postingId } = analyzed(db);
    markApplied({ postingId, appliedAt: '2026-11-02' }, db, docsDirWith({ resume: ['이력서_20260901.pdf'] }));
    const a = getApplicationForPosting(postingId, db)!;
    expect(a.submittedResume).toEqual({ kind: 'file' });
    expect(a.submittedDocs?.resume).toBe('이력서_20260901.pdf');
  });

  test('the latest revision wins over the kit; a workspace (external) revision counts too', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const { postingId } = analyzed(db, { track: '백엔드', kitId });
    const r1 = createRecipeRevision(postingId, RECIPE, db);
    markApplied({ postingId, appliedAt: '2026-11-02' }, db, docsDirWith({}));
    expect(getApplicationForPosting(postingId, db)!.submittedResume).toEqual({ kind: 'tailored', tailoredRevisionId: r1.id });

    const md = readFileSync(join(KIT_DIR, '이력서_백엔드_v1_20260101.md'), 'utf8');
    const career = readFileSync(join(KIT_DIR, '경력기술서_백엔드.md'), 'utf8');
    const ext = addExternalRevision(postingId, { resumeMd: md, careerMd: career, recipe: RECIPE }, db);
    expect(ext.revNo).toBe(2);
    const id2 = markApplied({ postingId, appliedAt: '2026-11-03' }, db, docsDirWith({}));
    expect(getApplication(id2, db)!.submittedResume).toEqual({ kind: 'tailored', tailoredRevisionId: ext.id });
  });
});

describe('markApplied with explicit values (TC-SUBMIT-02)', () => {
  test('stores an explicit file/career/portfolio choice', () => {
    const db = makeTestDb();
    const { postingId } = analyzed(db);
    const dir = docsDirWith({ resume: ['이력서_20260901.pdf'], career: ['경력기술서_20260901.pdf'] });
    markApplied(
      { postingId, appliedAt: '2026-11-02', submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: 'none', portfolio: null } },
      db,
      dir,
    );
    const a = getApplicationForPosting(postingId, db)!;
    expect(a.submittedResume).toEqual({ kind: 'file' });
    expect(a.submittedDocs).toEqual({ resume: '이력서_20260901.pdf', career: 'none', portfolio: null });
  });

  test('rejects another posting revision, missing file, resume none, base and unknown kit track; saves nothing', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const mine = analyzed(db, { track: '백엔드', kitId });
    const other = analyzed(db, { track: '백엔드', kitId });
    const foreign = createRecipeRevision(other.postingId, RECIPE, db);
    const dir = docsDirWith({ resume: ['이력서_20260901.pdf'] });
    const apply = (resume: ResumeChoice) =>
      markApplied({ postingId: mine.postingId, appliedAt: '2026-11-02', submitted: { resume, career: null, portfolio: null } }, db, dir);
    expect(() => apply({ kind: 'tailored', tailoredRevisionId: foreign.id })).toThrow('이 공고의 맞춤 이력서가 아닙니다');
    expect(() => apply({ kind: 'tailored', tailoredRevisionId: 9999 })).toThrow('이 공고의 맞춤 이력서가 아닙니다');
    expect(() => apply({ kind: 'file', fileName: '이력서_20250101.pdf' })).toThrow('서류 파일을 찾을 수 없습니다');
    expect(() => apply({ kind: 'file', fileName: 'none' })).toThrow('서류 파일을 찾을 수 없습니다');
    expect(() => apply({ kind: 'base', versionId: 1 })).toThrow('기본 이력서 버전은 새로 고를 수 없습니다');
    expect(() => apply({ kind: 'kit', kitId, track: '없는직무' })).toThrow('서류 키트에 없는 직무입니다');
    expect(() => apply({ kind: 'kit', kitId: 999, track: '백엔드' })).toThrow('서류 키트에 없는 직무입니다');
    expect(() =>
      markApplied({ postingId: mine.postingId, submitted: { resume: { kind: 'unknown' }, career: '경력기술서_20250101.pdf', portfolio: null } }, db, dir),
    ).toThrow('서류 파일을 찾을 수 없습니다');
    expect(getApplicationForPosting(mine.postingId, db)).toBeUndefined();
  });

  test('accepts the base documents of a kit track and a revision of this posting', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const { postingId } = analyzed(db);
    const rev = createRecipeRevision(postingId, RECIPE, db);
    const dir = docsDirWith({});
    const a = markApplied({ postingId, appliedAt: '2026-11-02', submitted: { resume: { kind: 'kit', kitId, track: '백엔드' }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(a, db)!.submittedResume).toEqual({ kind: 'kit', kitId, track: '백엔드', profileId: 'B1', profileName: '범용' });
    const b = markApplied({ postingId, appliedAt: '2026-11-03', submitted: { resume: { kind: 'tailored', tailoredRevisionId: rev.id }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(b, db)!.submittedResume).toEqual({ kind: 'tailored', tailoredRevisionId: rev.id });
  });
});

describe('updateApplication submitted (TC-SUBMIT-03)', () => {
  test('file -> tailored -> kit -> file', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const { postingId } = analyzed(db);
    const rev = createRecipeRevision(postingId, RECIPE, db);
    const dir = docsDirWith({ resume: ['이력서_20260901.pdf'] });
    const id = markApplied(
      { postingId, appliedAt: '2026-11-02', submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: null, portfolio: null } },
      db,
      dir,
    );
    updateApplication(id, { submitted: { resume: { kind: 'tailored', tailoredRevisionId: rev.id }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'tailored', tailoredRevisionId: rev.id });
    expect(getApplication(id, db)!.submittedDocs?.resume).toBeNull();
    updateApplication(id, { submitted: { resume: { kind: 'kit', kitId, track: '데이터' }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toMatchObject({ kind: 'kit', track: '데이터', profileId: 'D1' });
    updateApplication(id, { submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'file' });
    expect(getApplication(id, db)!.submittedDocs?.resume).toBe('이력서_20260901.pdf');
  });

  test('imported records keep the imported kind; base records stay unless unchanged; other base is rejected', () => {
    const db = makeTestDb();
    const dir = docsDirWith({ resume: ['이력서_20260901.pdf'] });
    const { postingId } = analyzed(db);
    const id = markApplied({ postingId, appliedAt: '2026-11-02' }, db, dir);
    db.update(applications).set({ submittedResume: { kind: 'imported' } }).where(eq(applications.id, id)).run();
    updateApplication(id, { submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'imported' });

    db.update(applications).set({ submittedResume: { kind: 'base', versionId: 3 } }).where(eq(applications.id, id)).run();
    updateApplication(id, { submitted: { resume: { kind: 'base', versionId: 3 }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'base', versionId: 3 });
    expect(() =>
      updateApplication(id, { submitted: { resume: { kind: 'base', versionId: 4 }, career: null, portfolio: null } }, db, dir),
    ).toThrow('기본 이력서 버전은 새로 고를 수 없습니다');
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'base', versionId: 3 });
  });

  test('keeping the same kit choice keeps the recorded profile even if the kit default changed', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const { postingId } = analyzed(db);
    const dir = docsDirWith({});
    const id = markApplied({ postingId, appliedAt: '2026-11-02', submitted: { resume: { kind: 'kit', kitId, track: '백엔드' }, career: null, portfolio: null } }, db, dir);
    db.update(applications)
      .set({ submittedResume: { kind: 'kit', kitId, track: '백엔드', profileId: 'B2', profileName: '성능' } })
      .where(eq(applications.id, id))
      .run();
    updateApplication(id, { submitted: { resume: { kind: 'kit', kitId, track: '백엔드' }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toMatchObject({ profileId: 'B2', profileName: '성능' });
  });

  test('a revision of another posting and a record without a posting are rejected', () => {
    const db = makeTestDb();
    withKit(db);
    const a = analyzed(db);
    const b = analyzed(db);
    const rev = createRecipeRevision(b.postingId, RECIPE, db);
    const dir = docsDirWith({});
    const id = markApplied({ postingId: a.postingId, appliedAt: '2026-11-02' }, db, dir);
    expect(() =>
      updateApplication(id, { submitted: { resume: { kind: 'tailored', tailoredRevisionId: rev.id }, career: null, portfolio: null } }, db, dir),
    ).toThrow('이 공고의 맞춤 이력서가 아닙니다');
    db.update(applications).set({ postingId: null }).where(eq(applications.id, id)).run();
    expect(() =>
      updateApplication(id, { submitted: { resume: { kind: 'tailored', tailoredRevisionId: rev.id }, career: null, portfolio: null } }, db, dir),
    ).toThrow('이 공고의 맞춤 이력서가 아닙니다');
  });
});

describe('dashboard rows and groups (TC-SUBMIT-04·05)', () => {
  test('searchApplications labels: tailored, kit, file, unknown, base', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const dir = docsDirWith({ resume: ['이력서_20261102.pdf'] });
    const t = analyzed(db);
    const rev = createRecipeRevision(t.postingId, RECIPE, db);
    markApplied({ postingId: t.postingId, appliedAt: '2026-11-05' }, db, dir);
    const k = analyzed(db, { track: '데이터', kitId });
    markApplied({ postingId: k.postingId, appliedAt: '2026-11-04' }, db, dir);
    const f = analyzed(db);
    markApplied({ postingId: f.postingId, appliedAt: '2026-11-03' }, db, dir);
    const u = analyzed(db);
    markApplied({ postingId: u.postingId, appliedAt: '2026-10-01' }, db, dir);
    const bposting = analyzed(db);
    const bid = markApplied({ postingId: bposting.postingId, appliedAt: '2026-09-01' }, db, dir);
    db.update(applications).set({ submittedResume: { kind: 'base', versionId: t.resumeId } }).where(eq(applications.id, bid)).run();

    const rows = searchApplications({}, db);
    const by = (p: number) => rows.find((r) => r.postingId === p)!;
    expect(by(t.postingId)).toMatchObject({ resumeLabel: '맞춤 r1 · B2', tailored: true, resumeKitTrack: null });
    expect(by(k.postingId)).toMatchObject({ resumeLabel: '기본 서류 데이터 · D1', tailored: false, resumeKitTrack: '데이터' });
    expect(by(f.postingId)).toMatchObject({ resumeLabel: '이력서 2026-11-02', resumeDocFile: '이력서_20261102.pdf', tailored: false });
    expect(by(u.postingId)).toMatchObject({ resumeLabel: null, tailored: false });
    expect(by(bposting.postingId)).toMatchObject({ resumeLabel: '기본 v1', resumeBaseVersionNo: 1 });
    void rev;
  });

  test('a base record whose version row is gone falls back to the file label, or unknown', () => {
    const db = makeTestDb();
    const dir = docsDirWith({});
    const a = analyzed(db);
    const b = analyzed(db);
    const ia = markApplied({ postingId: a.postingId, appliedAt: '2026-11-05' }, db, dir);
    const ib = markApplied({ postingId: b.postingId, appliedAt: '2026-11-04' }, db, dir);
    db.update(applications).set({ submittedResume: { kind: 'base', versionId: 999 }, submittedDocs: { resume: '이력서_20261102.pdf', career: null, portfolio: null } }).where(eq(applications.id, ia)).run();
    db.update(applications).set({ submittedResume: { kind: 'base', versionId: 998 } }).where(eq(applications.id, ib)).run();
    const rows = searchApplications({}, db);
    expect(rows.find((r) => r.applicationId === ia)).toMatchObject({ resumeLabel: '이력서 2026-11-02', resumeBaseVersionNo: null });
    expect(rows.find((r) => r.applicationId === ib)!.resumeLabel).toBeNull();
  });

  test('groupDashboardRows by resume: tailored -> kit tracks -> base -> files -> unknown', () => {
    const mk = (over: Partial<ReturnType<typeof searchApplications>[number]>) => ({
      applicationId: 0,
      postingId: null,
      companyId: 1,
      companyName: 'c',
      positionTitle: 'p',
      site: 'wanted' as const,
      appliedAt: '2026-11-01',
      status: 'applied' as const,
      interviewRound: null,
      fitScore: null,
      resumeLabel: null,
      resumeBaseVersionNo: null,
      resumeDocFile: null,
      tailored: false,
      resumeKitTrack: null,
      reached: [],
      ...over,
    });
    const rows = [
      mk({}),
      mk({ resumeLabel: '이력서 2026-11-02', resumeDocFile: '이력서_20261102.pdf' }),
      mk({ resumeLabel: '기본 v1', resumeBaseVersionNo: 1 }),
      mk({ resumeLabel: '기본 서류 데이터 · D1', resumeKitTrack: '데이터' }),
      mk({ resumeLabel: '맞춤 r1 · B2', tailored: true }),
      mk({ resumeLabel: '기본 서류 백엔드 · B1', resumeKitTrack: '백엔드' }),
      mk({ resumeLabel: '맞춤 r2 · B3', tailored: true, status: 'document_passed', reached: ['document_passed'] }),
      mk({ resumeLabel: '기본 서류 백엔드 · B1', resumeKitTrack: '백엔드' }),
    ];
    const g = groupDashboardRows(rows, 'resume', '2026-11-05');
    expect(g.map((x) => x.key)).toEqual(['tailored', 'kit:데이터', 'kit:백엔드', 'v1', 'doc:이력서_20261102.pdf', 'none']);
    expect(g.map((x) => x.label)).toEqual(['맞춤 이력서', '기본 서류 데이터', '기본 서류 백엔드', '기본 v1', '이력서 2026-11-02', '모름']);
    expect(g[0].rows).toHaveLength(2);
    expect(g[0].tally).toMatchObject({ total: 2, passed: 1, sample: 1 });
    expect(g[2].rows).toHaveLength(2);
    expect(g[5].rows).toHaveLength(1);
  });
});

describe('resolveSubmittedResume (TC-SUBMIT-06)', () => {
  test('base gives label and content; tailored, kit, file and imported are null', () => {
    const db = makeTestDb();
    const v = saveResumeVersion({ ...emptyResume(), summary: '요약 가상' }, undefined, db);
    expect(resolveSubmittedResume({ kind: 'base', versionId: v.id }, db)).toMatchObject({ label: '기본 이력서 v1', content: { summary: '요약 가상' } });
    expect(resolveSubmittedResume({ kind: 'base', versionId: 999 }, db)).toBeNull();
    for (const sr of [
      { kind: 'tailored', tailoredRevisionId: 1 },
      { kind: 'kit', kitId: 1, track: 'A', profileId: 'A1', profileName: 'x' },
      { kind: 'file' },
      { kind: 'imported' },
    ] as const) {
      expect(resolveSubmittedResume(sr, db)).toBeNull();
    }
  });
});

describe('workspace (external) revisions in stats (item: external counts as tailored)', () => {
  test('an application defaulted to an external revision is tailored with its profile in stats', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const { postingId } = analyzed(db, { track: '백엔드', kitId });
    const md = readFileSync(join(KIT_DIR, '이력서_백엔드_v1_20260101.md'), 'utf8');
    const career = readFileSync(join(KIT_DIR, '경력기술서_백엔드.md'), 'utf8');
    const ext = addExternalRevision(postingId, { resumeMd: md, careerMd: career, recipe: RECIPE }, db);
    markApplied({ postingId, appliedAt: '2026-11-02' }, db, docsDirWith({}));
    const [item] = loadStatItems({}, new Date(2026, 10, 30), db);
    expect(getApplicationForPosting(postingId, db)!.submittedResume).toEqual({ kind: 'tailored', tailoredRevisionId: ext.id });
    expect(item).toMatchObject({ tailored: true, profile: { id: 'B2', name: '성능' }, kitTrack: null });
    expect(byDocVersion([item], 'resume').map((b) => b.key)).toEqual(['tailored']);
    expect(tailoredCompare([item])?.since).toBe('2026-11-02');
    expect(byProfile([item])).toHaveLength(1);
    const rows = searchApplications({}, db);
    expect(rows[0]).toMatchObject({ tailored: true, resumeLabel: '맞춤 r1 · B2' });
  });
});

describe('resumeDisplay (TC-SUBMIT-09)', () => {
  test('tailored and kit rows link to the on-demand PDF routes, base has no link, file and unknown are not overridden', () => {
    expect(resumeDisplay({ kind: 'tailored', tailoredRevisionId: 12 }, { revNo: 2 })).toEqual({ label: '맞춤 이력서 r2', href: '/api/tailored/12/resume?inline=1' });
    expect(resumeDisplay({ kind: 'tailored', tailoredRevisionId: 12 }, {})).toEqual({ label: '맞춤 이력서', href: '/api/tailored/12/resume?inline=1' });
    expect(resumeDisplay({ kind: 'kit', kitId: 3, track: '백엔드/데이터', profileId: 'B1', profileName: '범용' }, {})).toEqual({
      label: '기본 서류 백엔드/데이터',
      href: `/api/kit/3/${encodeURIComponent('백엔드/데이터')}/resume?inline=1`,
    });
    expect(resumeDisplay({ kind: 'base', versionId: 3 }, { versionNo: 3 })).toEqual({ label: '기본 이력서 v3 (예전 기록)', href: null });
    expect(resumeDisplay({ kind: 'file' }, {})).toBeNull();
    expect(resumeDisplay({ kind: 'imported' }, {})).toBeNull();
  });
});

describe('updateApplication with a vanished recorded file (TC-SUBMIT-10)', () => {
  test('changing another field is not blocked, but picking a new missing file still is', () => {
    const db = makeTestDb();
    const { postingId } = analyzed(db);
    const dir = docsDirWith({ resume: ['이력서_20260901.pdf'], career: ['경력기술서_20260901.pdf'] });
    const id = markApplied(
      { postingId, appliedAt: '2026-11-02', submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: '경력기술서_20260901.pdf', portfolio: null } },
      db,
      dir,
    );
    const empty = docsDirWith({}); // 기록된 파일이 폴더에서 없어졌다
    updateApplication(id, { submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: '경력기술서_20260901.pdf', portfolio: 'none' } }, db, empty);
    expect(getApplication(id, db)!.submittedDocs).toEqual({ resume: '이력서_20260901.pdf', career: '경력기술서_20260901.pdf', portfolio: 'none' });
    expect(() =>
      updateApplication(id, { submitted: { resume: { kind: 'file', fileName: '이력서_20260901.pdf' }, career: '경력기술서_20260902.pdf', portfolio: 'none' } }, db, empty),
    ).toThrow('서류 파일을 찾을 수 없습니다');
  });
});
