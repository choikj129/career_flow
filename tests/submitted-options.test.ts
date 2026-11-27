import { makeTmpDir } from './helpers/tmp';
// [지원 완료]·[기록 수정] 창의 제출 서류 선택지. TC-SUBMIT-08
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ kitDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return { ...mod, config: new Proxy(mod.config, { get: (t, k) => (k === 'kitDir' ? h.kitDir : t[k as string]) }) };
});

import { makeTestDb } from './helpers/db';
import { markApplied } from '@/lib/applications/repo';
import { loadSubmittedFormData } from '@/lib/applications/submitted-options';
import { docToSelect, selectToDoc } from '@/lib/applications/submitted';
import { saveKit } from '@/lib/kit/repo';
import { registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { createRecipeRevision } from '@/lib/tailored/repo';
import { applications, kits } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';

const KIT_DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const kitFiles = () => readdirSync(KIT_DIR).map((name) => ({ name, data: readFileSync(join(KIT_DIR, name)) }));

const ANALYSIS: AnalysisResult = {
  posting: {
    companyDisplayName: '가상상사', companyLegalName: null, positionTitle: '백엔드 개발자', experienceRequirement: null, employmentType: null,
    location: null, deadline: null, salary: null, responsibilities: [], requirements: [], preferred: [], techStack: [],
  },
  fit: { score: 70, breakdown: [] },
  strengths: [],
  gaps: [],
  preferenceMismatches: [],
  tailoringAdvice: '',
};

function docsDir(files: Record<string, string[]>): string {
  const dir = makeTmpDir('cf-docs-');
  for (const [kind, names] of Object.entries(files)) {
    mkdirSync(join(dir, kind), { recursive: true });
    for (const n of names) writeFileSync(join(dir, kind, n), '%PDF-1.4 fake');
  }
  return dir;
}

function setup(withKit: boolean) {
  const db = makeTestDb();
  if (withKit) {
    h.kitDir = makeTmpDir('cf-kit-');
    saveKit(kitFiles(), db, h.kitDir);
  }
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ pastedText: '가상 공고 백엔드 캐시' }, db);
  saveAnalysis(reg.postingId, resume.id, ANALYSIS, reg.jobId!, db);
  return { db, postingId: reg.postingId };
}

const DIR = () =>
  docsDir({
    resume: ['이력서_20260901.pdf', '이력서_20261102.pdf'],
    career: ['경력기술서_20261020.pdf'],
    portfolio: [],
  });

describe('loadSubmittedFormData (TC-SUBMIT-08)', () => {
  test('apply form: revisions newest first, kit tracks, resume files newest first, unknown last', () => {
    const { db, postingId } = setup(true);
    const r1 = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const r2 = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B2', adjustmentIds: [] }, db);
    const d = loadSubmittedFormData({ postingId }, db, DIR());
    expect(d.resumeOptions.map((o) => o.value)).toEqual([
      `tailored:${r2.id}`,
      `tailored:${r1.id}`,
      expect.stringMatching(/^sess:\d+:B1:백엔드$/), // D-33 a: 이력서 세션 맞춤본(한 줄)이 맞춤 리비전 다음, 기본 서류 앞에 온다
      expect.stringMatching(/^kitp:\d+:B1:백엔드$/),
      expect.stringMatching(/^kitp:\d+:B2:백엔드$/),
      expect.stringMatching(/^kitp:\d+:D1:데이터$/),
      expect.stringMatching(/^kitp:\d+:D2:데이터$/),
    ]); // 새 기록에는 지난 이력서 파일·모름이 없다
    expect(d.resumeOptions[0].label).toBe('맞춤 이력서 r2 · B2');
    expect(d.resumeOptions[0].full).toBe('맞춤 이력서 r2 · B2 성능');
    expect(d.resumeOptions[3].label).toBe('기본 서류 백엔드 · B1');
    expect(d.resumeOptions[3].full).toBe('기본 서류 백엔드 · B1 범용');
    expect(d.resumeOptions[4].label).toBe('기본 서류 백엔드 · B2');
    expect(d.resumeOptions[4].full).toBe('기본 서류 백엔드 · B2 성능');
    expect(d.resumeOptions[6].label).toBe('기본 서류 데이터 · D2');
    expect(d.latestRevisionId).toBe(r2.id);
    expect(d.kit).toBeNull(); // 공고 분석에 추천이 없고 직무가 둘이라 고르지 않는다
    expect(d.current).toBeNull();
    expect(d.careerOptions).toEqual([
      { value: 'none', label: '없음' },
      { value: '경력기술서_20261020.pdf', label: '2026-10-20' },
    ]); // 새 기록: 경력기술서·포트폴리오에도 모름이 없다
    expect(d.portfolioOptions.map((o) => o.value)).toEqual(['none']);
    expect(d.noFiles).toBe(false);
  });

  test('SA-05 the default profile follows the analysis top recommendation, then the track default', () => {
    const { db, postingId } = setup(true);
    const kitId = (db.select().from(kits).get() as { id: number }).id;
    saveAnalysis(
      postingId,
      saveResumeVersion(emptyResume(), undefined, db).id,
      {
        ...ANALYSIS,
        profileRecommendation: {
          track: '데이터',
          trackReason: '',
          profiles: [
            { id: 'D2', fitPercent: 80, keywords: [], reason: '' },
            { id: 'D1', fitPercent: 40, keywords: [], reason: '' },
          ],
          adjustments: [],
          kitId,
        },
      },
      registerPosting({ pastedText: '재분석' }, db).jobId!,
      db,
    );
    expect(loadSubmittedFormData({ postingId }, db, docsDir({})).kit).toEqual({ id: kitId, track: '데이터', profileId: 'D2' });
  });

  test('SA-05 editing a record whose profile is not the track default selects that profile option', () => {
    const { db, postingId } = setup(true);
    const dir = docsDir({});
    const kitId = (db.select().from(kits).get() as { id: number }).id;
    const appId = markApplied({ postingId, appliedAt: '2026-11-03', submitted: { resume: { kind: 'kit', kitId, track: '백엔드', profileId: 'B2' }, career: null, portfolio: null } }, db, dir);
    const d = loadSubmittedFormData({ applicationId: appId }, db, dir);
    expect(d.current?.resume).toEqual({ kind: 'kit', kitId, track: '백엔드', profileId: 'B2' });
    expect(d.resumeOptions.map((o) => o.value)).toContain(`kitp:${kitId}:B2:백엔드`);
    expect(d.resumeOptions.filter((o) => o.label === '기본 서류 백엔드 · B2')).toHaveLength(1);
  });

  test('no kit, no revision, no files: only unknown, and the empty-folder hint is on', () => {
    const { db, postingId } = setup(false);
    const d = loadSubmittedFormData({ postingId }, db, docsDir({}));
    expect(d.resumeOptions).toEqual([{ value: 'unknown', label: '모름' }]);
    expect(d.kit).toBeNull();
    expect(d.latestRevisionId).toBeNull();
    expect(d.noFiles).toBe(true);
  });

  test('edit form: current value, other posting revisions are not offered, a missing file is still shown', () => {
    const { db, postingId } = setup(true);
    const other = registerPosting({ pastedText: '다른 공고 백엔드' }, db).postingId;
    createRecipeRevision(other, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const rev = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const dir = DIR();
    const appId = markApplied({ postingId, appliedAt: '2026-11-03' }, db, dir);
    let d = loadSubmittedFormData({ applicationId: appId }, db, dir);
    expect(d.current?.resume).toEqual({ kind: 'tailored', tailoredRevisionId: rev.id });
    expect(d.resumeOptions.filter((o) => o.value.startsWith('tailored:'))).toHaveLength(1);

    // 기록의 파일이 폴더에서 없어졌다
    db.update(applications)
      .set({ submittedResume: { kind: 'file' }, submittedDocs: { resume: '이력서_20250101.pdf', career: '경력기술서_20250101.pdf', portfolio: null } })
      .where(eq(applications.id, appId))
      .run();
    d = loadSubmittedFormData({ applicationId: appId }, db, dir);
    expect(d.resumeOptions[0]).toEqual({ value: 'file:이력서_20250101.pdf', label: '이력서 2025-01-01 (파일 없음)' });
    expect(d.resumeOptions.some((o) => o.value === 'unknown')).toBe(true); // 수정 창은 모름 유지
    expect(d.careerOptions[0]).toEqual({ value: '', label: '모름' });
    expect(d.careerOptions.at(-1)).toEqual({ value: '경력기술서_20250101.pdf', label: '2025-01-01 (파일 없음)' });
    expect(d.current?.career).toBe('경력기술서_20250101.pdf');

    expect(() => loadSubmittedFormData({ applicationId: 9999 }, db, dir)).toThrow('찾을 수 없습니다');
  });

  test('a record from before the kit era offers its old base resume as one extra option', () => {
    const { db, postingId } = setup(false);
    const dir = DIR();
    const appId = markApplied({ postingId, appliedAt: '2026-11-03' }, db, dir);
    const version = saveResumeVersion(emptyResume(), undefined, db);
    db.update(applications).set({ submittedResume: { kind: 'base', versionId: version.id } }).where(eq(applications.id, appId)).run();
    const d = loadSubmittedFormData({ applicationId: appId }, db, dir);
    expect(d.resumeOptions[0]).toEqual({ value: `base:${version.id}`, label: `기본 이력서 v${version.versionNo} (예전 기록)` });
    expect(d.resumeOptions.filter((o) => o.value.startsWith('base:'))).toHaveLength(1);
  });

  test('select value conversion: unknown is the empty string', () => {
    expect(docToSelect(null)).toBe('');
    expect(docToSelect('none')).toBe('none');
    expect(selectToDoc('')).toBeNull();
    expect(selectToDoc('경력기술서_20261020.pdf')).toBe('경력기술서_20261020.pdf');
  });
});
