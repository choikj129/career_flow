import { makeTmpDir } from './helpers/tmp';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ kitDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return { ...mod, config: new Proxy(mod.config, { get: (t, k) => (k === 'kitDir' ? h.kitDir : t[k as string]) }) };
});

import { makeTestDb } from './helpers/db';
import { aiJobs, kits } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/ai/queue';
import { saveKit } from '@/lib/kit/repo';
import { registerPosting, saveAnalysis, setPostingText } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { addRevision, createRecipeRevision, requestTermsMatch } from '@/lib/tailored/repo';
import { loadTailorView, kitDisplayName } from '@/lib/tailored/view';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import type { Db } from '@/lib/db/client';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const files = () => readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) }));

function setup(text = '백엔드 서버 공고. 캐시와 성능 개선, 프로젝트 경험.') {
  h.kitDir = makeTmpDir('cf-kit-');
  const db = makeTestDb();
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const resumeVersionId = typeof resume === 'number' ? resume : (resume as { id: number }).id;
  const { kitId } = saveKit(files(), db, h.kitDir);
  const reg = registerPosting({ url: 'https://example.com/tv' }, db);
  setPostingText(reg.postingId, text, db);
  return { db, kitId, postingId: reg.postingId, jobId: reg.jobId!, resumeVersionId };
}

const ANALYSIS = (rec: AnalysisResult['profileRecommendation']): AnalysisResult => ({
  posting: {
    companyDisplayName: '가상컴퍼니', companyLegalName: null, positionTitle: '서버 개발자', experienceRequirement: '', employmentType: '', location: '',
    deadline: null, salary: null, responsibilities: [], requirements: [], preferred: [], techStack: [],
  },
  fit: { score: 70, breakdown: [] },
  strengths: [],
  gaps: [],
  preferenceMismatches: [],
  tailoringAdvice: '',
  profileRecommendation: rec,
});

const REC = (kitId: number) => ({
  kitId,
  track: '백엔드',
  trackReason: '서버 중심',
  profiles: [
    { id: 'B2', fitPercent: 40, keywords: ['캐시'], reason: '캐시 언급' },
    { id: 'B1', fitPercent: 30, keywords: [], reason: '범용' },
  ],
  adjustments: [{ id: '백엔드-1', recommended: true, keywords: ['캐시'] }],
});

describe('loadTailorView (TC-TAILOR-VIEW)', () => {
  test('no kit, then a kit with errors only', () => {
    const { db, postingId } = setup();
    db.delete(kits).run();
    expect(loadTailorView(postingId, null, db)).toEqual({ state: 'no_kit' });
    db.insert(kits).values({ label: '나쁜 키트', files: [], parsed: null, errors: [{ file: 'a', where: 'b', message: 'c' }], createdAt: new Date().toISOString() }).run();
    expect(loadTailorView(postingId, null, db)).toEqual({ state: 'kit_errors', errorCount: 1 });
  });

  test('without an AI recommendation the picker ranks by word count and says so', () => {
    const { db, postingId } = setup();
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.picker.basis).toBe('words');
    expect(v.picker.basisLabel).toContain('AI 추천 아님');
    expect(v.picker.track).toBe('백엔드');
    const mine = v.picker.byTrack['백엔드'];
    expect(mine.profiles[0]).toMatchObject({ id: 'B2', percent: null, recommended: true });
    expect(mine.profiles[0].words.length).toBeGreaterThan(0);
    expect(mine.adjustments.find((a) => a.id === '백엔드-1')).toMatchObject({ suggested: true });
    expect(Object.keys(v.picker.byTrack)).toEqual(['백엔드', '데이터']);
    expect(v.selected).toBeNull();
    expect(v.handoff.reasons).toEqual([]);
  });

  test('with an AI recommendation for the same kit: percent order, recommended first, other tracks by words', () => {
    const { db, postingId, kitId, resumeVersionId, jobId } = setup();
    saveAnalysis(postingId, resumeVersionId, ANALYSIS(REC(kitId)), jobId, db);
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.picker.basis).toBe('ai');
    expect(v.picker.basisLabel).toContain('AI 추천');
    expect(v.picker.byTrack['백엔드'].profiles.map((p) => [p.id, p.percent, p.recommended])).toEqual([
      ['B2', 40, true],
      ['B1', 30, false],
    ]);
    expect(v.picker.byTrack['백엔드'].adjustments[0]).toMatchObject({ id: '백엔드-1', suggested: true, keywords: ['캐시'] });
    expect(v.picker.byTrack['데이터'].profiles.every((p) => p.percent === null)).toBe(true);
    expect(v.handoff.topFitPercent).toBe(40);
  });

  test('SA-02 applyDocs: initial profile is the AI top, else the track default; all profiles are grouped by track', () => {
    const { db, postingId, kitId, resumeVersionId, jobId } = setup();
    let v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.applyDocs.kitId).toBe(kitId);
    expect(v.applyDocs.aiBased).toBe(false);
    expect(v.applyDocs.initialProfileId).toBe('B1'); // 단어 수 1위는 B2지만 AI 추천이 없으면 직무 기본 프로필
    expect(v.applyDocs.groups.map((g) => [g.track, g.profiles.map((p) => p.id).sort()])).toEqual([
      ['백엔드', ['B1', 'B2']],
      ['데이터', ['D1', 'D2']],
    ]);
    expect(v.applyDocs.groups.flatMap((g) => g.profiles).every((p) => !p.recommended && p.percent === null)).toBe(true);

    saveAnalysis(postingId, resumeVersionId, ANALYSIS(REC(kitId)), jobId, db);
    v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.applyDocs.aiBased).toBe(true);
    expect(v.applyDocs.initialProfileId).toBe('B2');
    const b2 = v.applyDocs.groups[0].profiles.find((p) => p.id === 'B2');
    expect(b2).toMatchObject({ percent: 40, recommended: true });
  });

  test('a recommendation from an older kit is labeled as such and profiles missing from the kit are dropped', () => {
    const { db, postingId, kitId, resumeVersionId, jobId } = setup();
    const rec = REC(kitId);
    rec.profiles.push({ id: 'ZZ', fitPercent: 90, keywords: [], reason: '없는 프로필' });
    saveAnalysis(postingId, resumeVersionId, ANALYSIS(rec), jobId, db);
    saveKit([...files(), { name: '메모.md', data: Buffer.from('x') }], db, h.kitDir); // 새 키트(오류 있음 → 이전 키트를 계속 씀)
    const mid = loadTailorView(postingId, null, db);
    if (mid.state !== 'ready') throw new Error('ready expected');
    expect(mid.kit.id).toBe(kitId);
    expect(mid.staleKitNote).toContain('오류');

    const newKit = saveKit(files().map((f) => (f.name === '마스터스토리.md' ? { ...f, data: Buffer.concat([f.data, Buffer.from('\n한 줄')]) } : f)), db, h.kitDir).kitId;
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.kit.id).toBe(newKit);
    expect(v.picker.basis).toBe('ai_old_kit');
    expect(v.picker.byTrack['백엔드'].profiles.map((p) => p.id)).toEqual(['B2', 'B1']);
    expect(v.handoff.topFitPercent).toBeNull();
  });

  test('a recipe revision: applied list, pending, no automatic check yet, checklist from the kit', () => {
    const { db, postingId } = setup();
    const { id } = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B2', adjustmentIds: ['백엔드-2'] }, db);
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.selected).toMatchObject({ id, revNo: 1, source: 'recipe', profileId: 'B2', checks: null, kitChanged: null });
    expect(v.selected!.applied.join('\n')).toContain('자기소개: B2');
    expect(v.selected!.pending.length).toBe(1); // 직접 할 일("문장을 직접 추가한다")
    expect(v.selected!.checklist).toEqual(['회사 이름이 맞는지 확인', '날짜와 숫자를 확인']);
    expect(v.handoff.reasons).toEqual(['pending_adjustments']);
    expect(v.isLatest).toBe(true);
  });

  test('a revision with warnings: confirm vs notices, checks per kind, rev param picks an older one', () => {
    const { db, postingId, kitId } = setup();
    const r1 = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const r2 = addRevision(
      {
        postingId, kitId, track: '백엔드', profileId: 'B1', profileName: '범용', adjustments: [], source: 'terms',
        resumeMd: '# 가상', careerMd: '# 가상', pendingAdjustments: [], changeReasons: [{ doc: 'resume', after: '문장', reason: '용어' }],
        warnings: [
          { kind: 'new_number', doc: 'resume', detail: '확인 필요: 99%' },
          { kind: 'new_fact_from_master', doc: 'career', detail: '새로 넣은 사실: 3건' },
          { kind: 'intro_restored', doc: 'resume', detail: '되돌림' },
        ],
        notes: '',
      },
      db,
    );
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.selected!.id).toBe(r2.id);
    expect(v.selected!.confirm.map((w) => w.kind)).toEqual(['new_number']);
    expect(v.selected!.notices.map((w) => w.kind)).toEqual(['new_fact_from_master', 'intro_restored']);
    expect(v.selected!.checks!.find((c) => c.label === '새 수치')!.count).toBe(2);
    expect(v.selected!.checks!.find((c) => c.label === '기술 스택')!.count).toBe(0);
    expect(v.handoff.reasons).toContain('warnings');

    const older = loadTailorView(postingId, r1.id, db);
    if (older.state !== 'ready') throw new Error('ready expected');
    expect(older.selected!.id).toBe(r1.id);
    expect(older.isLatest).toBe(false);
    expect(older.handoff.reasons).toEqual([]);
    // 다른 공고의 리비전 번호는 무시하고 최신을 보인다
    const other = registerPosting({ url: 'https://example.com/other' }, db).postingId;
    setPostingText(other, '본문', db);
    const foreign = createRecipeRevision(other, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const ignored = loadTailorView(postingId, foreign.id, db);
    if (ignored.state !== 'ready') throw new Error('ready expected');
    expect(ignored.selected!.id).toBe(r2.id);
  });

  test('kit changed: revision from an older kit shows both names', () => {
    const { db, postingId, kitId } = setup();
    createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const newKit = saveKit(files().map((f) => (f.name === '마스터스토리.md' ? { ...f, data: Buffer.concat([f.data, Buffer.from('\n한 줄')]) } : f)), db, h.kitDir).kitId;
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(newKit).toBeGreaterThan(kitId);
    expect(v.selected!.kitChanged).toEqual({ was: kitDisplayName(kitId, 'v1_20260101'), now: kitDisplayName(newKit, 'v1_20260101') });
  });

  test('needsWorkspace comes from the latest succeeded job result for the latest revision only', () => {
    const { db, postingId, kitId } = setup();
    createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const job = requestTermsMatch(postingId, db);
    const terms = addRevision(
      { postingId, kitId, track: '백엔드', profileId: 'B1', profileName: '범용', adjustments: [], source: 'terms', resumeMd: '# 가', careerMd: '# 가', pendingAdjustments: [], changeReasons: [], warnings: [], notes: '', jobId: job },
      db,
    );
    db.update(aiJobs).set({ status: 'succeeded', result: { postingId, revisionId: terms.id, revNo: terms.revNo, needsWorkspace: true } }).where(eq(aiJobs.id, job)).run();
    const v = loadTailorView(postingId, null, db);
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.handoff.reasons).toEqual(['ai_suggested']);
    expect(v.tailorJob).toBeNull();

    // 작업 공간 결과(새 리비전)가 생기면 권유는 사라진다
    addRevision(
      { postingId, kitId, track: '백엔드', profileId: 'B1', profileName: '범용', adjustments: [], source: 'external', resumeMd: '# 가', careerMd: '# 가', pendingAdjustments: [], changeReasons: [], warnings: [], notes: '' },
      db,
    );
    const after = loadTailorView(postingId, null, db);
    if (after.state !== 'ready') throw new Error('ready expected');
    expect(after.handoff.reasons).toEqual([]);
  });

  test('active and failed tailor jobs', () => {
    const { db, postingId } = setup();
    createRecipeRevision(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const failedId = enqueueJob('revise_tailored', { postingId, request: '경력기술서 2장을 줄여 주세요' }, db);
    db.update(aiJobs).set({ status: 'failed', errorKind: 'timeout', errorMessage: '시간 초과', createdAt: new Date(Date.now() + 5000).toISOString() }).where(eq(aiJobs.id, failedId)).run();
    const f = loadTailorView(postingId, null, db);
    if (f.state !== 'ready') throw new Error('ready expected');
    expect(f.failed).toMatchObject({ id: failedId, type: 'revise_tailored', errorKind: 'timeout', request: '경력기술서 2장을 줄여 주세요' });
    expect(f.tailorJob).toBeNull();

    const running = requestTermsMatch(postingId, db);
    const r = loadTailorView(postingId, null, db);
    if (r.state !== 'ready') throw new Error('ready expected');
    expect(r.tailorJob).toMatchObject({ id: running, type: 'tailor_resume', status: 'queued' });
    // 새 리비전이 생기면 지난 실패는 보이지 않는다
    db.update(aiJobs).set({ status: 'succeeded' }).where(eq(aiJobs.id, running)).run();
    createRecipeRevision(postingId, { track: '백엔드', profileId: 'B2', adjustmentIds: [] }, db);
    db.update(aiJobs).set({ createdAt: new Date(Date.now() - 60_000).toISOString() }).where(eq(aiJobs.id, failedId)).run();
    const g = loadTailorView(postingId, null, db);
    if (g.state !== 'ready') throw new Error('ready expected');
    expect(g.failed).toBeNull();
  });

  test('an analysis in progress is reported so the picker can say so', () => {
    const { db, postingId } = setup();
    const v = loadTailorView(postingId, null, db); // registerPosting가 분석 작업을 큐에 넣었다
    if (v.state !== 'ready') throw new Error('ready expected');
    expect(v.analysisJob).toMatchObject({ type: 'analyze_posting', status: 'queued' });
  });
});

void ({} as Db);
