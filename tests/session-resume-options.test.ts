import { makeTmpDir } from './helpers/tmp';
// D-33 a: 제출 서류 선택지의 이력서 세션 맞춤본과 바탕 이력서 날짜 처음 값. TC-SR-25
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ kitDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return { ...mod, config: new Proxy(mod.config, { get: (t, k) => (k === 'kitDir' ? h.kitDir : t[k as string]) }) };
});

import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { applications, kits } from '@/lib/db/schema';
import { markApplied } from '@/lib/applications/repo';
import { loadSubmittedFormData } from '@/lib/applications/submitted-options';
import { eventDate } from '@/lib/domain/dates';
import { saveKit } from '@/lib/kit/repo';
import { registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { createRecipeRevision } from '@/lib/tailored/repo';
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

function setup() {
  const db = makeTestDb();
  h.kitDir = makeTmpDir('cf-kit-');
  const { kitId } = saveKit(kitFiles(), db, h.kitDir);
  db.update(kits).set({ createdAt: new Date(2026, 10, 20, 15, 30).toISOString() }).where(eq(kits.id, kitId)).run();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ pastedText: '가상 공고 백엔드 캐시' }, db);
  saveAnalysis(reg.postingId, resume.id, ANALYSIS, reg.jobId!, db);
  const dir = makeTmpDir('cf-docs-');
  mkdirSync(join(dir, 'resume'), { recursive: true });
  writeFileSync(join(dir, 'resume', '이력서_20261102.pdf'), '%PDF-1.4 fake');
  return { db, postingId: reg.postingId, kitId, dir };
}

describe('session options (TC-SR-25)', () => {
  test('order: revisions, session profiles, base documents, files, unknown; base date starts at the kit upload day', () => {
    const { db, postingId, kitId, dir } = setup();
    const rev = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const d = loadSubmittedFormData({ postingId }, db, dir);
    expect(d.resumeOptions.map((o) => o.value)).toEqual([
      `tailored:${rev.id}`,
      `sess:${kitId}:B1:백엔드`,
      `sess:${kitId}:B2:백엔드`,
      `sess:${kitId}:D1:데이터`,
      `sess:${kitId}:D2:데이터`,
      `kitp:${kitId}:B1:백엔드`,
      `kitp:${kitId}:B2:백엔드`,
      `kitp:${kitId}:D1:데이터`,
      `kitp:${kitId}:D2:데이터`,
      'file:이력서_20261102.pdf',
      'unknown',
    ]);
    const s = d.resumeOptions[2];
    expect(s.label).toBe('이력서 세션 맞춤본 · B2');
    expect(s.full).toBe('이력서 세션 맞춤본 · B2 성능');
    expect(d.sessionBaseDate).toBe('2026-11-20');
    expect(d.sessionBaseDate).toBe(eventDate(new Date(2026, 10, 20, 15, 30).toISOString()));
  });

  test('editing a session record starts at the recorded value and date', () => {
    const { db, postingId, kitId, dir } = setup();
    const id = markApplied(
      { postingId, appliedAt: '2026-11-25', submitted: { resume: { kind: 'session', kitId, track: '백엔드', profileId: 'B2' }, career: null, portfolio: null, sessionBaseDate: '2026-11-18' } },
      db,
      dir,
    );
    const d = loadSubmittedFormData({ applicationId: id }, db, dir);
    expect(d.current?.resume).toEqual({ kind: 'session', kitId, track: '백엔드', profileId: 'B2' });
    expect(d.sessionBaseDate).toBe('2026-11-18');
    expect(d.resumeOptions.filter((o) => o.value === `sess:${kitId}:B2:백엔드`)).toHaveLength(1);
  });

  test('a session record whose profile is not in the current kit is offered as a previous-kit option, first', () => {
    const { db, postingId, kitId, dir } = setup();
    const id = markApplied(
      { postingId, appliedAt: '2026-11-25', submitted: { resume: { kind: 'session', kitId, track: '백엔드', profileId: 'B2' }, career: null, portfolio: null, sessionBaseDate: '2026-11-18' } },
      db,
      dir,
    );
    db.update(applications)
      .set({ submittedResume: { kind: 'session', kitId: 999, track: '옛직무', profileId: 'X9', profileName: '옛이름', baseDate: '2026-10-01' } })
      .where(eq(applications.id, id))
      .run();
    const d = loadSubmittedFormData({ applicationId: id }, db, dir);
    expect(d.resumeOptions[0]).toEqual({ value: 'sess:999:X9:옛직무', label: '이력서 세션 맞춤본 · X9 (이전 키트)', full: '이력서 세션 맞춤본 · X9 옛이름 (이전 키트)' });
    expect(d.sessionBaseDate).toBe('2026-10-01');
  });

  test('no kit: no session options and no date', () => {
    const db = makeTestDb();
    const resume = saveResumeVersion(emptyResume(), undefined, db);
    const reg = registerPosting({ pastedText: '가상 공고' }, db);
    saveAnalysis(reg.postingId, resume.id, ANALYSIS, reg.jobId!, db);
    const d = loadSubmittedFormData({ postingId: reg.postingId }, db, makeTmpDir('cf-docs-'));
    expect(d.resumeOptions.some((o) => o.value.startsWith('sess:'))).toBe(false);
    expect(d.sessionBaseDate).toBeNull();
  });
});
