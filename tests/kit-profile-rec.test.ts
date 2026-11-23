import { makeTmpDir } from './helpers/tmp';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { getLatestAnalysis, registerPosting } from '@/lib/postings/repo';
import { handlers } from '@/lib/ai/tasks';
import type { AiRunRequest, AiRunResult, AiRunner } from '@/lib/ai/runner';
import { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { normalizeProfileRec, profileTableMd } from '@/lib/kit/profile-table';
import { parseGuide } from '@/lib/kit/parse-guide';
import { saveKit } from '@/lib/kit/repo';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const kit = parseGuide(readFileSync(join(DIR, '서류_가이드.md'), 'utf8')).guide!;

describe('profileTableMd (TC-KIT-30)', () => {
  const md = profileTableMd(kit);
  test('has tracks, profiles, keywords and adjustment triggers', () => {
    expect(md).toContain('백엔드');
    expect(md).toContain('B2');
    expect(md).toContain('성능');
    expect(md).toContain('캐시');
    expect(md).toContain('백엔드-1');
    expect(md).toContain('(기본)');
  });
  test('has no intro text or document content', () => {
    expect(md).not.toContain('성능과 안정성에 집중하는');
    expect(md).not.toContain('범용 백엔드 개발자로');
    expect(md).not.toContain('주문 처리 개선');
  });
});

describe('normalizeProfileRec (TC-KIT-31)', () => {
  const postingText = '백엔드 개발자. 캐시와 성능을 다룬다.';
  const out = (over: object = {}) => ({
    track: '백엔드',
    trackReason: '포지션명',
    profiles: [
      { id: 'B1', fitPercent: 40, keywords: ['백엔드', '없는단어'], reason: '범용' },
      { id: 'B2', fitPercent: 85, keywords: ['캐시', '성능'], reason: '성능 공고' },
      { id: 'ZZ', fitPercent: 99, keywords: [], reason: '모르는 id' },
    ],
    adjustments: [
      { id: '백엔드-1', recommended: true, keywords: ['캐시'] },
      { id: '없는-9', recommended: true, keywords: [] },
    ],
    ...over,
  });
  test('unknown ids dropped, sorted by percent, keywords not in the posting removed', () => {
    const r = normalizeProfileRec(out(), kit, postingText, 7);
    expect(r.kitId).toBe(7);
    expect(r.profiles.map((p) => [p.id, p.fitPercent])).toEqual([['B2', 85], ['B1', 40]]);
    expect(r.profiles[1].keywords).toEqual(['백엔드']);
    expect(r.adjustments.map((a) => a.id)).toEqual(['백엔드-1', '백엔드-2', '백엔드-3']);
  });
  test('missing profiles become 0%, default profile first on ties', () => {
    const r = normalizeProfileRec(out({ profiles: [{ id: 'B2', fitPercent: 0, keywords: [], reason: '' }] }), kit, postingText, 1);
    expect(r.profiles.map((p) => [p.id, p.fitPercent])).toEqual([['B1', 0], ['B2', 0]]); // 기본 프로필 먼저
    expect(r.profiles[0].reason).toBe('');
  });
  test('unknown track falls back to the first track', () => {
    expect(normalizeProfileRec(out({ track: '없는직무' }), kit, postingText, 1).track).toBe('백엔드');
  });
  test('adjustments missing from the AI result are listed as not recommended', () => {
    const r = normalizeProfileRec(out(), kit, postingText, 1);
    expect(r.adjustments.find((a) => a.id === '백엔드-2')).toMatchObject({ recommended: false, keywords: [] });
    expect(r.adjustments.find((a) => a.id === '백엔드-1')).toMatchObject({ recommended: true });
    expect(r.adjustments.some((a) => a.id === '없는-9')).toBe(false);
  });
});

class FakeRunner implements AiRunner {
  reqs: AiRunRequest[] = [];
  constructor(private output: unknown) {}
  async run(req: AiRunRequest): Promise<AiRunResult> {
    this.reqs.push(req);
    return { output: this.output, sessionId: 'sess-1', usage: {}, durationMs: 1 };
  }
}

const ANALYSIS = {
  posting: {
    companyDisplayName: '가상상사', companyLegalName: null, positionTitle: '백엔드 개발자',
    experienceRequirement: null, employmentType: null, location: null, deadline: null, salary: null,
    responsibilities: [], requirements: [], preferred: [], techStack: [],
  },
  fit: { score: 70, breakdown: [] },
  strengths: [],
  gaps: [],
  preferenceMismatches: [],
  tailoringAdvice: '',
};
const REC = {
  track: '백엔드', trackReason: '포지션명에 백엔드',
  profiles: [{ id: 'B2', fitPercent: 82, keywords: ['캐시'], reason: '캐시 언급' }, { id: 'B1', fitPercent: 55, keywords: ['백엔드'], reason: '범용' }],
  adjustments: [{ id: '백엔드-1', recommended: true, keywords: ['캐시'] }],
};

function setup() {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const kitDir = makeTmpDir('cf-kit-');
  const files = readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) }));
  const { kitId } = saveKit(files, db, kitDir);
  const reg = registerPosting({ pastedText: '백엔드 개발자 공고. 캐시와 성능.' }, db);
  return { db, kitId, reg };
}

describe('analysis handler with profiles (TC-KIT-32)', () => {
  test('with a usable kit: table in prompt, field in schema, kitId in the saved result, one call', async () => {
    const { db, kitId, reg } = setup();
    const runner = new FakeRunner({ ...ANALYSIS, profileRecommendation: REC });
    await handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: tmpdir(), db });
    expect(runner.reqs).toHaveLength(1);
    expect(runner.reqs[0].prompt).toContain('프로필');
    expect(runner.reqs[0].prompt).toContain('B2');
    expect(JSON.stringify(runner.reqs[0].jsonSchema)).toContain('profileRecommendation');
    const saved = AnalysisResult.parse(getLatestAnalysis(reg.postingId, db)!.result);
    expect(saved.profileRecommendation).toMatchObject({ kitId, track: '백엔드' });
    expect(saved.profileRecommendation!.profiles[0]).toMatchObject({ id: 'B2', fitPercent: 82 });
  });
  test('without a kit: no field in the schema and no recommendation in the result', async () => {
    const db = makeTestDb();
    saveResumeVersion(emptyResume(), undefined, db);
    const reg = registerPosting({ pastedText: '공고' }, db);
    const runner = new FakeRunner(ANALYSIS);
    await handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: tmpdir(), db });
    expect(JSON.stringify(runner.reqs[0].jsonSchema)).not.toContain('profileRecommendation');
    expect(runner.reqs[0].prompt).toContain('키트 없음');
    expect(AnalysisResult.parse(getLatestAnalysis(reg.postingId, db)!.result).profileRecommendation ?? null).toBeNull();
  });
});

describe('old analysis results still parse (TC-KIT-33)', () => {
  test('result without the profileRecommendation field', () => {
    const r = AnalysisResult.safeParse(ANALYSIS);
    expect(r.success).toBe(true);
  });
});
