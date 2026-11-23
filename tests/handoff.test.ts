import { makeTmpDir } from './helpers/tmp';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ kitDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return { ...mod, config: new Proxy(mod.config, { get: (t, k) => (k === 'kitDir' ? h.kitDir : t[k as string]) }) };
});

import { makeTestDb } from './helpers/db';
import { registerPosting } from '@/lib/postings/repo';
import { saveKit } from '@/lib/kit/repo';
import { assemble } from '@/lib/kit/assemble';
import { parseGuide } from '@/lib/kit/parse-guide';
import { buildHandoffRequest, handoffReasons, LOW_FIT_PERCENT } from '@/lib/tailored/handoff';
import {
  addExternalRevision,
  createRecipeRevision,
  getLatestRevision,
  getRevision,
  listRevisionsForPosting,
  requestTailoredRevision,
} from '@/lib/tailored/repo';
import { eq } from 'drizzle-orm';
import { aiJobs } from '@/lib/db/schema';
import { getJob } from '@/lib/ai/queue';
import { handlers } from '@/lib/ai/tasks';
import type { AiRunRequest, AiRunResult, AiRunner } from '@/lib/ai/runner';
import type { KitWarning } from '@/lib/kit/types';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
// 체크아웃 줄바꿈(core.autocrlf)과 무관하게 LF로 읽는다. CRLF 입력은 kit-crlf 테스트가 따로 다룬다.
const read = (n: string) => readFileSync(join(DIR, n), 'utf8').replace(/\r\n/g, '\n');
const kitGuide = parseGuide(read('서류_가이드.md')).guide!;
const base = { resumeMd: read('이력서_백엔드_v1_20260101.md'), careerMd: read('경력기술서_백엔드.md') };
const RECIPE = { track: '백엔드', profileId: 'B2', adjustmentIds: [] as string[] };
const stage1 = assemble(kitGuide, base, RECIPE);
const B2_INTRO = '성능과 안정성에 집중하는 백엔드 개발자입니다.';

const warn = (kind: KitWarning['kind']): KitWarning => ({ kind, doc: 'resume', detail: '상세' });

describe('handoffReasons (TC-HANDOFF-01)', () => {
  const none = { topFitPercent: 80, warnings: [] as KitWarning[], pending: [] as string[], needsWorkspace: false };
  test('nothing to recommend by default', () => {
    expect(handoffReasons(none)).toEqual([]);
    expect(handoffReasons({ ...none, topFitPercent: null })).toEqual([]); // 추천도가 없으면 판단하지 않는다
  });
  test('the 60 percent boundary: below recommends, at 60 does not', () => {
    expect(LOW_FIT_PERCENT).toBe(60);
    expect(handoffReasons({ ...none, topFitPercent: 59 })).toEqual(['low_fit']);
    expect(handoffReasons({ ...none, topFitPercent: 60 })).toEqual([]);
  });
  test('notice kinds do not count as warnings, the others do', () => {
    expect(handoffReasons({ ...none, warnings: [warn('new_fact_from_master'), warn('intro_restored')] })).toEqual([]);
    for (const k of ['new_number', 'forbidden_term', 'intro_changed', 'structure_changed', 'stack_changed', 'other_company'] as const) {
      expect(handoffReasons({ ...none, warnings: [warn(k)] }), k).toEqual(['warnings']);
    }
  });
  test('pending adjustments and the AI suggestion, in a fixed order', () => {
    expect(handoffReasons({ ...none, pending: ['직접 할 일'] })).toEqual(['pending_adjustments']);
    expect(handoffReasons({ ...none, needsWorkspace: true })).toEqual(['ai_suggested']);
    expect(
      handoffReasons({ topFitPercent: 10, warnings: [warn('new_number')], pending: ['x'], needsWorkspace: true }),
    ).toEqual(['low_fit', 'warnings', 'pending_adjustments', 'ai_suggested']);
  });
});

describe('buildHandoffRequest (TC-HANDOFF-02)', () => {
  const input = {
    company: '가상상사', position: '백엔드 개발자', site: '원티드', url: 'https://example.com/jobs/1', deadline: '2026-12-31',
    postingText: '공고 본문 줄 하나\n## 공고 안의 제목처럼 보이는 줄\n```js\ncode\n```\n끝',
    topWords: ['캐시', '성능'],
    recipe: { track: '백엔드', profileId: 'B2', profileName: '성능', adjustments: ['스트리밍 → 주요 성과 1을 2번째로'] },
    profileRanking: [{ id: 'B2', name: '성능', fitPercent: 55 }, { id: 'B1', name: '범용', fitPercent: 40 }],
    recipeSummary: ['자기소개: B2 후보', '핵심 역량 순서: 2 1 3'],
    pending: ['남은 일 하나'],
    warnings: [{ kind: 'new_number' as const, doc: 'resume' as const, detail: '확인 필요: 9999%' }],
    userNote: '메모 내용',
    kitLabel: 'v1_20260101',
    folderName: '2026-12-01_가상상사_백엔드',
  };
  const md = buildHandoffRequest(input);

  test('sections come in the fixed order', () => {
    const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const idx = (s: string) => md.indexOf(`## ${s}`);
    expect(md.startsWith('# 공고 특화 이력서 요청')).toBe(true);
    const order = ['지원 폴더 이름', '공고 정보', '공고에서 많이 나온 단어', '앱이 고른', '앱 조립 요약', '앱 자동 검사', '메모', '공고 본문', '요청'];
    const positions = order.map((o) => md.search(new RegExp(`^## ${o}`, 'm')));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(heads.length).toBeGreaterThanOrEqual(order.length);
    expect(idx('공고 본문')).toBeLessThan(md.lastIndexOf('## 요청'));
  });
  test('carries posting facts, profile, ranking, summary, warnings, note, full posting text and the closing sentence', () => {
    for (const s of ['2026-12-01_가상상사_백엔드', '가상상사', '백엔드 개발자', '원티드', 'https://example.com/jobs/1', '2026-12-31', '캐시', 'B2 성능', '55%', 'B1 범용', '40%', '스트리밍', '자기소개: B2 후보', '남은 일 하나', '확인 필요: 9999%', '메모 내용', 'v1_20260101']) {
      expect(md, s).toContain(s);
    }
    expect(md).toContain(input.postingText);
    expect(md).toContain('이력서.md·경력기술서.md를 만들어 주세요');
    expect(md).toContain('마스터스토리 밖의 사실·숫자는 쓰지 않습니다');
  });
  test('posting text with fences cannot break out of its own block', () => {
    const body = md.slice(md.indexOf('## 공고 본문'), md.lastIndexOf('## 요청'));
    expect(body).toContain('````'); // 본문 안의 ``` 보다 긴 울타리
    expect(body).toContain('## 공고 안의 제목처럼 보이는 줄');
  });
  test('does not contain the assembled documents', () => {
    expect(md).not.toContain(stage1.resumeMd.split('\n').find((l) => l.includes('주문 처리 개선'))!);
    expect(md).not.toContain(B2_INTRO);
  });
  test('missing values read plainly and optional parts are skipped', () => {
    const lean = buildHandoffRequest({ ...input, url: null, deadline: null, profileRanking: null, pending: [], warnings: [], userNote: '', topWords: [] });
    expect(lean).toContain('링크: 없음');
    expect(lean).toContain('마감: 없음');
    expect(lean).not.toContain('추천도');
    expect(lean).toContain('(없음)');
    expect(lean).not.toContain('undefined');
    expect(lean).not.toContain('null');
  });
});

class FakeRunner implements AiRunner {
  reqs: AiRunRequest[] = [];
  constructor(private output: unknown) {}
  async run(req: AiRunRequest): Promise<AiRunResult> {
    this.reqs.push(req);
    return { output: this.output, sessionId: 's', usage: {}, durationMs: 1 };
  }
}

function setup() {
  h.kitDir = makeTmpDir('cf-kit-');
  const db = makeTestDb();
  const { kitId } = saveKit(readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) })), db, h.kitDir);
  const postingId = registerPosting({ pastedText: '백엔드 공고. 캐시와 성능.' }, db).postingId;
  return { db, kitId, postingId };
}

beforeEach(() => {
  h.kitDir = '';
});

describe('addExternalRevision (TC-HANDOFF-03)', () => {
  const WORKSPACE_INTRO = '작업 공간에서 새로 쓴 소개입니다.';
  const external = () => ({
    resumeMd: stage1.resumeMd.replace(B2_INTRO, WORKSPACE_INTRO).replace('40%', '9999%'),
    careerMd: stage1.careerMd,
    recipe: RECIPE,
    note: '작업 공간 메모',
  });

  test('stores source external, keeps the intro and warns, flags new numbers, becomes the latest', () => {
    const { db, kitId, postingId } = setup();
    createRecipeRevision(postingId, RECIPE, db);
    const { id, revNo } = addExternalRevision(postingId, external(), db);
    expect(revNo).toBe(2);
    const r = getRevision(id, db)!;
    expect(r).toMatchObject({ source: 'external', kitId, track: '백엔드', profileId: 'B2', jobId: null, notes: '작업 공간 메모', pendingAdjustments: [] });
    expect(r.resumeMd).toContain(WORKSPACE_INTRO); // 되돌리지 않음
    const kinds = r.warnings.map((w) => w.kind);
    expect(kinds).toContain('intro_changed');
    expect(kinds).not.toContain('intro_restored');
    expect(kinds).toContain('new_number');
    expect(getLatestRevision(postingId, db)!.id).toBe(id);
    expect(listRevisionsForPosting(postingId, db)[0]).toMatchObject({ source: 'external', revNo: 2 });
  });

  test('works as the first revision and with an adjusted recipe; structure changes are only warnings', () => {
    const { db, postingId } = setup();
    const { id } = addExternalRevision(
      postingId,
      { resumeMd: stage1.resumeMd.replace('## 주요 성과', '## 대표 성과'), careerMd: stage1.careerMd, recipe: { ...RECIPE, adjustmentIds: ['백엔드-1'] } },
      db,
    );
    const r = getRevision(id, db)!;
    expect(r.revNo).toBe(1);
    expect(r.adjustments.map((a) => a.id)).toEqual(['백엔드-1']);
    expect(r.warnings.map((w) => w.kind)).toContain('structure_changed');
  });

  test('rejects empty or huge files, an unknown profile and a missing kit', () => {
    const { db, postingId } = setup();
    expect(() => addExternalRevision(postingId, { ...external(), resumeMd: '  ' }, db)).toThrow('이력서.md');
    expect(() => addExternalRevision(postingId, { ...external(), careerMd: '' }, db)).toThrow('경력기술서.md');
    expect(() => addExternalRevision(postingId, { ...external(), resumeMd: 'a'.repeat(1024 * 1024 + 1) }, db)).toThrow('1MB');
    expect(() => addExternalRevision(postingId, { ...external(), recipe: { ...RECIPE, profileId: 'Z9' } }, db)).toThrow('그 직무·프로필이 키트에 없습니다');
    const empty = makeTestDb();
    const pid = registerPosting({ pastedText: '공고' }, empty).postingId;
    expect(() => addExternalRevision(pid, external(), empty)).toThrow('서류 키트를 먼저 올리세요');
  });

  test('a later revise starts from the workspace result and does not undo its intro', async () => {
    const { db, postingId } = setup();
    addExternalRevision(postingId, external(), db);
    const jobId = requestTailoredRevision(postingId, '표현만 조금 다듬어 줘', db);
    const runner = new FakeRunner({ resumeMd: external().resumeMd, careerMd: stage1.careerMd, changeReasons: [], notes: '', needsWorkspace: false });
    await handlers.revise_tailored({ jobId, payload: getJob(jobId, db)!.payload as Record<string, unknown>, runner, workDir: tmpdir(), db });
    expect(runner.reqs[0].prompt).toContain(WORKSPACE_INTRO);
    const latest = getRevision(listRevisionsForPosting(postingId, db)[0].id, db)!;
    expect(latest.source).toBe('revise');
    expect(latest.resumeMd).toContain(WORKSPACE_INTRO);
    expect(latest.warnings.map((w) => w.kind)).not.toContain('intro_restored');
    // 다듬은 결과를 또 다듬어도(작업 공간 결과가 뿌리) 자기소개를 되돌리지 않는다
    db.update(aiJobs).set({ status: 'succeeded' }).where(eq(aiJobs.id, jobId)).run();
    const j2 = requestTailoredRevision(postingId, '한 번 더', db);
    await handlers.revise_tailored({ jobId: j2, payload: getJob(j2, db)!.payload as Record<string, unknown>, runner, workDir: tmpdir(), db });
    const again = getRevision(listRevisionsForPosting(postingId, db)[0].id, db)!;
    expect(again.revNo).toBe(3);
    expect(again.resumeMd).toContain(WORKSPACE_INTRO);
    expect(again.warnings.map((w) => w.kind)).not.toContain('intro_restored');
  });
});
