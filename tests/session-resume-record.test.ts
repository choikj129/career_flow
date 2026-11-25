import { makeTmpDir } from './helpers/tmp';
// D-33 a: 이력서 세션 맞춤본(제출 서류 kind 'session'). TC-SR-21~24, 26, 27
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
import { applications } from '@/lib/db/schema';
import { getApplication, markApplied, updateApplication } from '@/lib/applications/repo';
import {
  currentSubmitted,
  decodeResumeChoice,
  defaultSubmitted,
  encodeResumeChoice,
  resumeDisplay,
  resumeLabel,
  toColumns,
  type ResumeChoice,
} from '@/lib/applications/submitted';
import { registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { saveKit } from '@/lib/kit/repo';
import { createRecipeRevision } from '@/lib/tailored/repo';
import { groupDashboardRows, searchApplications } from '@/lib/search/dashboard';
import { byDocVersion, byProfile, tailoredCompare } from '@/lib/stats/aggregate';
import { loadStatItems } from '@/lib/stats/load';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import type { Db } from '@/lib/db/client';

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

let seq = 0;
function analyzed(db: Db) {
  seq += 1;
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ pastedText: `가상 공고 세션 ${seq}` }, db);
  saveAnalysis(reg.postingId, resume.id, ANALYSIS, reg.jobId!, db);
  return reg.postingId;
}
const withKit = (db: Db) => {
  h.kitDir = makeTmpDir('cf-kit-');
  return saveKit(kitFiles(), db, h.kitDir).kitId;
};
function emptyDocs(): string {
  const dir = makeTmpDir('cf-docs-');
  mkdirSync(join(dir, 'resume'), { recursive: true });
  writeFileSync(join(dir, 'resume', '.keep'), '');
  return dir;
}

const S = { kind: 'session', kitId: 14, track: '백엔드', profileId: 'B4' } as const;
const SESSION_ROW = { kind: 'session', kitId: 14, track: '백엔드', profileId: 'B4', profileName: '오너십', baseDate: '2026-11-23' } as const;

describe('pure helpers', () => {
  test('TC-SR-21 encode/decode round trip, bad values are null, the date is not in the value', () => {
    expect(encodeResumeChoice(S)).toBe('sess:14:B4:백엔드');
    expect(decodeResumeChoice('sess:14:B4:백엔드')).toEqual(S);
    const colon: ResumeChoice = { ...S, track: '데이터:분석' };
    expect(decodeResumeChoice(encodeResumeChoice(colon))).toEqual(colon);
    for (const bad of ['sess:', 'sess:x:B4:백엔드', 'sess:14::백엔드', 'sess:14:B4:', 'sess:14:B4', 'sess:0:B4:백엔드']) {
      expect(decodeResumeChoice(bad), bad).toBeNull();
    }
    expect(encodeResumeChoice(S)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('TC-SR-22 toColumns stores profile and base date, clears the resume file, currentSubmitted reads it back', () => {
    const input = { resume: S as ResumeChoice, career: null, portfolio: null, sessionBaseDate: '2026-11-23' };
    const cols = toColumns(input, { kitProfile: { profileId: 'B4', profileName: '오너십' } });
    expect(cols.submittedResume).toEqual(SESSION_ROW);
    expect(cols.submittedDocs.resume).toBeNull();
    expect(currentSubmitted(cols.submittedResume, cols.submittedDocs)).toEqual({ resume: S, career: null, portfolio: null, sessionBaseDate: '2026-11-23' });
    expect(() => toColumns(input)).toThrow();
    expect(() => toColumns({ ...input, sessionBaseDate: null }, { kitProfile: { profileId: 'B4', profileName: '오너십' } })).toThrow();
  });

  test('TC-SR-23 labels and display', () => {
    expect(resumeLabel(SESSION_ROW, null, {}, 'short')).toBe('세션 맞춤 · B4 · 2026-11-23');
    expect(resumeLabel(SESSION_ROW, null, {}, 'long')).toBe('이력서 세션 맞춤본 · B4 오너십 (2026-11-23 이력서 기반)');
    expect(resumeDisplay(SESSION_ROW, {})).toEqual({ label: '이력서 세션 맞춤본 · B4 오너십 (2026-11-23 이력서 기반)', href: null });
  });

  test('TC-SR-26 defaultSubmitted is unchanged (never a session record)', () => {
    const base = { appliedAt: '2026-11-02', files: [], latestRevisionId: null, kit: { id: 1, track: 'A', profileId: 'A2' } };
    expect(defaultSubmitted(base).resume).toEqual({ kind: 'kit', kitId: 1, track: 'A', profileId: 'A2' });
    expect(defaultSubmitted({ ...base, latestRevisionId: 7 }).resume).toEqual({ kind: 'tailored', tailoredRevisionId: 7 });
  });
});

describe('save and edit', () => {
  test('TC-SR-24 save checks and edit keeps the recorded profile name', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const dir = emptyDocs();
    const sess = (profileId: string, date: string | null) => ({
      resume: { kind: 'session', kitId, track: '백엔드', profileId } as ResumeChoice,
      career: null,
      portfolio: null,
      sessionBaseDate: date,
    });
    const postingId = analyzed(db);
    const apply = (submitted: ReturnType<typeof sess>) => markApplied({ postingId, appliedAt: '2026-11-20', submitted }, db, dir);
    expect(() => apply(sess('ZZ', '2026-11-19'))).toThrow('서류 키트에 없는 프로필입니다');
    expect(() => apply(sess('B2', '2026-13-01'))).toThrow('바탕 이력서 날짜를 확인하세요');
    expect(() => apply(sess('B2', null))).toThrow('바탕 이력서 날짜를 확인하세요');
    expect(() => apply(sess('B2', '2026-11-21'))).toThrow('바탕 이력서 날짜는 지원일보다 늦을 수 없습니다');
    expect(db.select().from(applications).all()).toHaveLength(0);

    expect(() => apply(sess('B2', '2026-11-1 9'))).toThrow('바탕 이력서 날짜를 확인하세요');
    const id = apply(sess('B2', ' 2026-11-20 ')); // 지원일과 같은 날은 저장, 앞뒤 공백은 지우고 저장
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'session', kitId, track: '백엔드', profileId: 'B2', profileName: '성능', baseDate: '2026-11-20' });
    expect(getApplication(id, db)!.submittedDocs?.resume).toBeNull();

    db.update(applications)
      .set({ submittedResume: { kind: 'session', kitId, track: '백엔드', profileId: 'B2', profileName: '예전이름', baseDate: '2026-11-20' } })
      .where(eq(applications.id, id))
      .run();
    expect(() => updateApplication(id, { appliedAt: '2026-11-05' }, db)).toThrow('바탕 이력서 날짜는 지원일보다 늦을 수 없습니다'); // 지원일만 고쳐도 막는다
    updateApplication(id, { appliedAt: '2026-11-20' }, db);
    updateApplication(id, { submitted: sess('B2', '2026-11-10') }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toMatchObject({ profileName: '예전이름', baseDate: '2026-11-10' });
    expect(() => updateApplication(id, { submitted: sess('B2', '2026-11-25') }, db, dir)).toThrow('바탕 이력서 날짜는 지원일보다 늦을 수 없습니다');
    updateApplication(id, { appliedAt: '2026-11-26', submitted: sess('B2', '2026-11-25') }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toMatchObject({ baseDate: '2026-11-25' });
    updateApplication(id, { submitted: { resume: { kind: 'unknown' }, career: null, portfolio: null } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toEqual({ kind: 'file' });
  });

  test('a record without a posting can still be edited to a session record', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const dir = emptyDocs();
    const postingId = analyzed(db);
    const id = markApplied({ postingId, appliedAt: '2026-11-20' }, db, dir);
    db.update(applications).set({ postingId: null }).where(eq(applications.id, id)).run();
    updateApplication(id, { submitted: { resume: { kind: 'session', kitId, track: '데이터', profileId: 'D2' }, career: null, portfolio: null, sessionBaseDate: '2026-11-01' } }, db, dir);
    expect(getApplication(id, db)!.submittedResume).toMatchObject({ kind: 'session', profileId: 'D2', profileName: '분석' });
  });
});

describe('stats and dashboard', () => {
  test('TC-SR-27 a session record counts as tailored under its profile and joins the tailored group', () => {
    const db = makeTestDb();
    const kitId = withKit(db);
    const dir = emptyDocs();
    const sessionApply = (postingId: number, profileId: string) =>
      markApplied({ postingId, appliedAt: '2026-11-10', submitted: { resume: { kind: 'session', kitId, track: '백엔드', profileId }, career: null, portfolio: null, sessionBaseDate: '2026-11-01' } }, db, dir);
    const [p1, p2, p3, p4] = [analyzed(db), analyzed(db), analyzed(db), analyzed(db)];
    sessionApply(p1, 'B2');
    sessionApply(p2, 'B2');
    markApplied({ postingId: p3, appliedAt: '2026-11-12', submitted: { resume: { kind: 'kit', kitId, track: '백엔드', profileId: 'B2' }, career: null, portfolio: null } }, db, dir);
    const rev = createRecipeRevision(p4, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    markApplied({ postingId: p4, appliedAt: '2026-11-08', submitted: { resume: { kind: 'tailored', tailoredRevisionId: rev.id }, career: null, portfolio: null } }, db, dir);

    const items = loadStatItems({}, new Date(2026, 10, 30), db);
    expect(items).toHaveLength(4);
    const sess = items.filter((i) => i.tailored && i.profile?.id === 'B2');
    expect(sess).toHaveLength(2);
    for (const i of sess) expect(i).toMatchObject({ tailored: true, profile: { id: 'B2', name: '성능' }, kitTrack: null });
    expect(tailoredCompare(items)?.since).toBe('2026-11-08');
    const b2 = byProfile(items).find((r) => r.id === 'B2')!;
    expect(b2.all.total).toBe(3);
    expect(b2.tailored.total).toBe(2);
    expect(byDocVersion(items, 'resume').find((b) => b.key === 'tailored')?.tally.total).toBe(3);

    const rows = searchApplications({}, db);
    expect(rows.filter((r) => r.tailored)).toHaveLength(3);
    expect(rows.find((r) => r.resumeLabel?.startsWith('세션 맞춤'))?.resumeLabel).toBe('세션 맞춤 · B2 · 2026-11-01');
    const groups = groupDashboardRows(rows, 'resume', '2026-11-30');
    expect(groups[0]).toMatchObject({ key: 'tailored', label: '맞춤 이력서' });
    expect(groups[0].rows).toHaveLength(3);
  });
});
