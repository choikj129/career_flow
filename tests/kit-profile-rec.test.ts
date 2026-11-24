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
import { emphasisLine, normalizeProfileRec, orderedTitles, profileSkeletonMd, profileTableMd } from '@/lib/kit/profile-table';
import { toCliJsonSchema } from '@/lib/ai/tasks/json-schema';
import { analysisOutputSchema } from '@/lib/ai/tasks/schemas';
import type { Profile } from '@/lib/kit/types';
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
    tailorRec: { percent: 50, reason: '이유' },
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
  tailorRec: { percent: 72, reason: 'Kafka 운영 사례를 주요 성과 앞으로' },
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

describe('tailorRec (TC-AM-09, 11~14)', () => {
  const schemaOf = (withProfiles: boolean) => JSON.parse(JSON.stringify(toCliJsonSchema(analysisOutputSchema(withProfiles))));
  test('TC-AM-11 CLI schema requires tailorRec with percent 0..100 integer and reason', () => {
    const rec = schemaOf(true).properties.profileRecommendation;
    expect(rec.required).toContain('tailorRec');
    const t = rec.properties.tailorRec;
    expect([...t.required].sort()).toEqual(['percent', 'reason']);
    expect(t.properties.percent).toMatchObject({ type: 'integer', minimum: 0, maximum: 100 });
    expect(analysisOutputSchema(true).safeParse({ ...ANALYSIS, profileRecommendation: { ...REC, tailorRec: undefined } }).success).toBe(false);
    expect(analysisOutputSchema(true).safeParse({ ...ANALYSIS, profileRecommendation: REC }).success).toBe(true);
  });
  test('TC-AM-09 without a kit the schema has no profileRecommendation; with a kit only tailorRec is new', () => {
    expect(schemaOf(false).properties.profileRecommendation).toBeUndefined();
    const keys = Object.keys(schemaOf(true).properties.profileRecommendation.properties).sort();
    expect(keys).toEqual(['adjustments', 'profiles', 'tailorRec', 'track', 'trackReason']);
  });
  test('TC-AM-12 normalize rounds, clamps, trims and cuts the reason at 120 chars', () => {
    const base = { track: '백엔드', trackReason: '', profiles: [], adjustments: [] };
    const n = (tailorRec: { percent: number; reason: string }) => normalizeProfileRec({ ...base, tailorRec }, kit, '', 1).tailorRec;
    expect(n({ percent: 72.6, reason: '  앞뒤 공백  ' })).toEqual({ percent: 73, reason: '앞뒤 공백' });
    expect(n({ percent: -5, reason: 'x' })!.percent).toBe(0);
    expect(n({ percent: 130, reason: 'x' })!.percent).toBe(100);
    expect(n({ percent: 10, reason: ' ' + 'ㄱ'.repeat(200) + ' ' })!.reason).toHaveLength(120);
  });
  test('TC-AM-12b no tailorRec in, none out', () => {
    const base = { track: '백엔드', trackReason: '', profiles: [], adjustments: [] };
    expect('tailorRec' in normalizeProfileRec(base as never, kit, '', 1)).toBe(false);
  });
  test('TC-AM-13 saved under analyses.result.profileRecommendation.tailorRec', async () => {
    const { db, reg } = setup();
    const runner = new FakeRunner({ ...ANALYSIS, profileRecommendation: REC });
    await handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: tmpdir(), db });
    const saved = getLatestAnalysis(reg.postingId, db)!.result as { profileRecommendation: { tailorRec: unknown } };
    expect(saved.profileRecommendation.tailorRec).toEqual({ percent: 72, reason: 'Kafka 운영 사례를 주요 성과 앞으로' });
  });
  test('TC-AM-14 an old result without tailorRec still parses', () => {
    const old = JSON.parse(JSON.stringify({ ...REC, tailorRec: undefined }));
    const r = AnalysisResult.safeParse({ ...ANALYSIS, profileRecommendation: { ...old, kitId: 1 } });
    expect(r.success).toBe(true);
    const n = AnalysisResult.safeParse({ ...ANALYSIS, profileRecommendation: { ...REC, kitId: 1 } });
    expect(n.success && n.data.profileRecommendation?.tailorRec?.percent).toBe(72);
  });
});

describe('profile skeleton (TC-AM-21~24)', () => {
  const prof = (id: string) => kit.profiles.find((p) => p.id === id)!;
  const track = kit.tracks.find((t) => t.name === '백엔드')!;

  test('TC-AM-21 orderedTitles picks by index and skips out of range', () => {
    expect(orderedTitles(['a', 'b', 'c'], [2, 0, 1])).toEqual(['c', 'a', 'b']);
    expect(orderedTitles(['a', 'b', 'c'], [0, 5, -1, 2, 1.5])).toEqual(['a', 'c']);
  });

  test('TC-AM-22 emphasisLine', () => {
    const intros = kit.intros;
    expect(emphasisLine(prof('B1'), prof('B1'), track, intros)).toBe('(기본 프로필)');
    expect(emphasisLine(prof('B2'), undefined, track, intros)).toBe('(기본 프로필)');
    expect(emphasisLine(prof('B2'), prof('B1'), track, intros)).toBe(
      '역량 맨 앞: 데이터베이스 (기본: API 설계); 성과 맨 앞: 캐시 도입 (기본: 주문 처리 개선); 장 맨 앞: 예시소프트 (기본: 가상커머스)',
    );
    const b1 = prof('B1');
    expect(emphasisLine({ ...b1, id: 'B9', isDefault: false, introId: 'B2' } as Profile, b1, track, intros)).toBe('순서는 기본과 같음, 자기소개만 다름');
    expect(emphasisLine({ ...b1, id: 'B9', isDefault: false } as Profile, b1, track, intros)).toBe('기본과 같음');
    expect(emphasisLine({ ...b1, id: 'B9', isDefault: false, achievementOrder: [0, 2, 1] } as Profile, b1, track, intros)).toBe('순서 일부 다름(맨 앞은 기본과 같음)');
  });

  test('TC-AM-23 profileSkeletonMd', () => {
    const md = profileSkeletonMd(kit);
    expect(md).toBe(profileSkeletonMd(kit));
    expect(md).toContain('### 직무: 백엔드');
    expect(md).toContain('개인 프로젝트(이 직무 공통): 가계부 앱, 독서 기록 서비스');
    expect(md).toContain('#### B1 범용 (기본)');
    expect(md).toContain('#### B2 성능');
    expect(md).toContain('- 자기소개: 범용 백엔드 개발자로 안정적인 서비스를 만듭니다.');
    expect(md).toContain('- 핵심 역량: 1) API 설계 2) 데이터베이스 3) 클라우드 운영');
    expect(md).toContain('- 핵심 역량: 1) 데이터베이스 2) API 설계 3) 클라우드 운영');
    expect(md).toContain('- 주요 성과: 1) 캐시 도입 2) 주문 처리 개선 3) 배치 안정화');
    expect(md).toContain('- 경력 장: 1) 예시소프트 2) 가상커머스 3) 샘플랩');
    expect(md).toContain('- 기본 대비: (기본 프로필)');
    expect(md).toContain('- 기본 대비: 역량 맨 앞: 데이터베이스 (기본: API 설계)');
    expect(md.indexOf('### 직무: 백엔드')).toBeLessThan(md.indexOf('### 직무: 데이터'));
    expect(profileSkeletonMd({ ...kit, intros: {} })).toContain('- 자기소개: (자기소개 없음)');
  });

  test('TC-AM-24 a project line only for a profile whose projects differ from the default', () => {
    const md = profileSkeletonMd(kit);
    const sec = (id: string) => md.slice(md.indexOf(`#### ${id} `)).split('\n#### ')[0].split('\n### ')[0];
    expect(sec('B2')).toContain('- 개인 프로젝트: 날씨 알림 봇');
    expect(sec('B1')).not.toContain('- 개인 프로젝트:');
    expect(sec('D2')).toContain('- 개인 프로젝트: 뉴스 요약기, 공공데이터 대시보드');
    expect(sec('D1')).not.toContain('- 개인 프로젝트:');
  });
});
