import { makeTmpDir } from './helpers/tmp';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ kitDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return { ...mod, config: new Proxy(mod.config, { get: (t, k) => (k === 'kitDir' ? h.kitDir : t[k as string]) }) };
});

import { makeTestDb } from './helpers/db';
import { getKit, saveKit } from '@/lib/kit/repo';
import { registerPosting, saveAnalysis, setPostingText } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { buildSessionRequestMd } from '@/lib/tailored/session-request-data';
import { eventDate } from '@/lib/domain/dates';
import { aiJobs, analyses, tailoredRevisions } from '@/lib/db/schema';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');

function setup(opts: { withAnalysis?: boolean; text?: string | null; oldAnalysis?: boolean; siteNote?: string } = {}) {
  h.kitDir = makeTmpDir('cf-kit-');
  const db = makeTestDb();
  const { kitId } = saveKit(readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) })), db, h.kitDir);
  const resume = saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ url: 'https://example.com/session-request', siteNote: opts.siteNote }, db);
  const text = opts.text === undefined ? '백엔드 서버 공고. 캐시와 성능, 정산 경험.' : opts.text;
  if (text != null) setPostingText(reg.postingId, text, db);
  if (opts.withAnalysis !== false) {
    const result: AnalysisResult = {
      posting: {
        companyDisplayName: '가상 상사', companyLegalName: null, positionTitle: '서버 개발자', experienceRequirement: null, employmentType: null,
        location: null, deadline: '2026-12-31', salary: null, responsibilities: [], requirements: [], preferred: [], techStack: [],
      },
      fit: { score: 70, breakdown: [] },
      strengths: [],
      gaps: [
        { point: '캐시 장애 대응', kind: 'hidden', suggestion: '주요 성과 앞쪽으로' },
        { point: '정산 배치', kind: 'hidden', suggestion: '핵심 역량에 추가' },
        { point: '코틀린 실무', kind: 'missing', suggestion: '비밀제안문장' },
      ],
      preferenceMismatches: [],
      tailoringAdvice: '',
      profileRecommendation: {
        kitId,
        track: '백엔드',
        trackReason: '',
        profiles: [
          { id: 'B2', fitPercent: 55, keywords: ['캐시'], reason: '' },
          { id: 'B1', fitPercent: 30, keywords: [], reason: '' },
        ],
        adjustments: [{ id: '백엔드-1', recommended: true, keywords: ['캐시'] }],
        ...(opts.oldAnalysis ? {} : { tailorRec: { percent: 72, reason: '캐시 사례를 앞으로' } }),
      },
    };
    saveAnalysis(reg.postingId, resume.id, result, reg.jobId!, db);
  }
  return { db, postingId: reg.postingId, kitId };
}

describe('buildSessionRequestMd', () => {
  test('TC-SR-09 collects posting, ranking, adjustments, tailorRec and gaps', () => {
    const { db, postingId, kitId } = setup({ siteNote: '지인 추천' });
    const md = buildSessionRequestMd(postingId, 'B2', db)!;
    expect(md.startsWith('# 공고 맞춤 이력서 요청')).toBe(true);
    expect(md).toContain('- 회사: 가상 상사');
    expect(md).toContain('- 포지션: 서버 개발자');
    expect(md).toContain('- 사이트: 기타 (지인 추천)');
    expect(md).toContain('- 마감: 2026-12-31');
    expect(md).toContain('- B2 성능 (백엔드) 55%\n');
    expect(md).not.toContain('사용자가 고름');
    expect(md).toContain('- 다음 후보: B1 범용 30%');
    expect(md).toMatch(/- 추가 조정 추천: .*캐시/);
    const kit = getKit(kitId, db)!;
    expect(md).toContain(`(${eventDate(kit.createdAt)} 올림)`);
    expect(md).toContain('- 72% · 캐시 사례를 앞으로');
    expect(md).toContain('- 캐시 장애 대응 → 주요 성과 앞쪽으로');
    expect(md).toContain('- 정산 배치 → 핵심 역량에 추가');
    expect(md).toContain('## 부족한 것 (실제로 없음. 채우지 말 것)\n\n- 코틀린 실무\n');
    expect(md).not.toContain('비밀제안문장');
    expect(md).toContain('{이름}_이력서_가상상사.pdf');
    expect(md).toContain('백엔드 서버 공고. 캐시와 성능, 정산 경험.');
  });

  test('TC-SR-09 a profile that is not first, and one from another track', () => {
    const { db, postingId } = setup();
    const second = buildSessionRequestMd(postingId, 'B1', db)!;
    expect(second).toContain('- B1 범용 (백엔드) 30% (사용자가 고름. AI 1순위: B2 성능 55%)');
    const other = buildSessionRequestMd(postingId, 'D1', db)!;
    expect(other).toContain('- D1 범용 (데이터) (사용자가 고름. AI 1순위: B2 성능 55%)');
    expect(other).not.toMatch(/- D1 범용 \(데이터\) \d+%/);
    expect(other).toContain('- 다음 후보: D2 분석');
  });

  test('without an analysis the basis is words and the recommendation is empty', () => {
    const { db, postingId } = setup({ withAnalysis: false });
    const md = buildSessionRequestMd(postingId, 'B1', db)!;
    expect(md).toContain('단어 수 기준 추천 (AI 추천 아님)');
    expect(md).toContain('## 맞춤 이력서 추천도\n\n- (없음)');
    expect(md).toContain('## 숨은 강점 (서류에 덜 드러난 사실)\n\n- (없음)');
    expect(md).toContain('- 회사: (회사 미상)');
    expect(md).toContain('{이름}_이력서_백엔드.pdf');
  });

  test('an old analysis without the recommendation field says so', () => {
    const { db, postingId } = setup({ oldAnalysis: true });
    expect(buildSessionRequestMd(postingId, 'B2', db)!).toContain('## 맞춤 이력서 추천도\n\n- (이 분석에는 없음)');
  });

  test('TC-SR-08 no person name, contact, kit path or document body', () => {
    const { db, postingId } = setup();
    const md = buildSessionRequestMd(postingId, 'B2', db)!;
    for (const s of ['홍길동', 'gildong@example.com', '000-0000-0000', h.kitDir, '범용 백엔드 개발자로 안정적인', '## 자기소개', '마스터스토리.md']) {
      expect(md).not.toContain(s);
    }
  });

  test('TC-SR-10 null when it cannot be built', () => {
    const { db, postingId } = setup();
    expect(buildSessionRequestMd(9999, 'B2', db)).toBeNull();
    expect(buildSessionRequestMd(postingId, 'ZZ', db)).toBeNull();
    const noText = setup({ text: null });
    expect(buildSessionRequestMd(noText.postingId, 'B2', noText.db)).toBeNull();
    const noKit = makeTestDb();
    const reg = registerPosting({ url: 'https://example.com/no-kit' }, noKit);
    setPostingText(reg.postingId, '본문', noKit);
    expect(buildSessionRequestMd(reg.postingId, 'B1', noKit)).toBeNull();
  });

  test('TC-SR-11 writes nothing', () => {
    const { db, postingId } = setup();
    const count = () => ({
      rev: db.select().from(tailoredRevisions).all().length,
      jobs: db.select().from(aiJobs).all().length,
      analyses: db.select().from(analyses).all().length,
    });
    const before = count();
    buildSessionRequestMd(postingId, 'B2', db);
    expect(count()).toEqual(before);
  });
});

describe('sessionRequestTextAction (TC-SR-10)', () => {
  test('returns text, or a Korean error', async () => {
    process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-sr-action-');
    const { getDb, runMigrations } = await import('@/lib/db/client');
    const db = getDb();
    runMigrations(db);
    h.kitDir = join(process.env.CAREER_FLOW_DATA_DIR, 'kit');
    const { saveKit: save } = await import('@/lib/kit/repo');
    save(readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) })), db, h.kitDir);
    const { registerPosting: reg, setPostingText: setText } = await import('@/lib/postings/repo');
    const withText = reg({ url: 'https://example.com/sr-a' }, db).postingId;
    setText(withText, '백엔드 서버 공고 본문', db);
    const noText = reg({ url: 'https://example.com/sr-b' }, db).postingId;
    const { sessionRequestTextAction } = await import('@/app/_actions/tailored');
    const ok = await sessionRequestTextAction(withText, 'B1');
    expect(ok.ok && ok.text.startsWith('# 공고 맞춤 이력서 요청')).toBe(true);
    expect(await sessionRequestTextAction(noText, 'B1')).toEqual({ ok: false, error: '공고 본문이 없어 요청문을 만들 수 없습니다' });
    expect(await sessionRequestTextAction(withText, 'ZZ')).toEqual({ ok: false, error: '요청문을 만들 수 없습니다' });
    expect(await sessionRequestTextAction(9999, 'B1')).toEqual({ ok: false, error: '요청문을 만들 수 없습니다' });
    expect(await sessionRequestTextAction(withText, '')).toEqual({ ok: false, error: '요청문을 만들 수 없습니다' });
  });
});
