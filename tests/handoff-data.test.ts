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
import { saveKit } from '@/lib/kit/repo';
import { registerPosting, saveAnalysis, setPostingText } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { createRecipeRevision } from '@/lib/tailored/repo';
import { buildHandoffMdForRevision, HANDOFF_NOTE_MAX } from '@/lib/tailored/handoff-data';
import { todayLocal } from '@/lib/domain/dates';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');

describe('buildHandoffMdForRevision (TC-HANDOFF-04)', () => {
  function setup() {
    h.kitDir = makeTmpDir('cf-kit-');
    const db = makeTestDb();
    const { kitId } = saveKit(readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) })), db, h.kitDir);
    const resume = saveResumeVersion(emptyResume(), undefined, db);
    const reg = registerPosting({ url: 'https://example.com/handoff' }, db);
    setPostingText(reg.postingId, '백엔드 서버 공고. 캐시와 성능, 정산 경험.', db);
    const result: AnalysisResult = {
      posting: {
        companyDisplayName: '가상 상사/팀', companyLegalName: null, positionTitle: '서버 개발자', experienceRequirement: null, employmentType: null,
        location: null, deadline: '2026-12-31', salary: null, responsibilities: [], requirements: [], preferred: [], techStack: [],
      },
      fit: { score: 70, breakdown: [] },
      strengths: [],
      gaps: [],
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
        adjustments: [],
      },
    };
    saveAnalysis(reg.postingId, resume.id, result, reg.jobId!, db);
    const rev = createRecipeRevision(reg.postingId, { track: '백엔드', profileId: 'B2', adjustmentIds: ['백엔드-2'] }, db);
    return { db, rev, postingId: reg.postingId };
  }

  test('request md has the posting, recipe, ranking, summary, pending, note and a clean folder name', () => {
    const { db, rev } = setup();
    const md = buildHandoffMdForRevision(rev.id, '메모: 결제 경험을 앞에', db)!;
    expect(md.startsWith('# 공고 특화 이력서 요청')).toBe(true);
    expect(md).toContain(`\`${todayLocal().replaceAll('-', '')}_가상상사팀_백엔드\``);
    expect(md).toContain('회사: 가상 상사/팀');
    expect(md).toContain('마감: 2026-12-31');
    expect(md).toContain('B2 성능 55%');
    expect(md).toContain('B1 범용 30%');
    expect(md).toContain('자기소개: B2 후보');
    expect(md).toContain('메모: 결제 경험을 앞에');
    expect(md).toContain('정산 경험');
    expect(md).toContain('주요 성과 2를 보강하는 문장을 직접 추가한다'); // 남은 추가 조정
    // 조립 결과 md 전문은 넣지 않는다
    expect(md).not.toContain('## 핵심 역량');
  });

  test('the note is cut at the limit and a missing revision gives null', () => {
    const { db, rev } = setup();
    const md = buildHandoffMdForRevision(rev.id, 'ㄱ'.repeat(HANDOFF_NOTE_MAX + 500), db)!;
    expect(md).toContain('ㄱ'.repeat(HANDOFF_NOTE_MAX));
    expect(md).not.toContain('ㄱ'.repeat(HANDOFF_NOTE_MAX + 1));
    expect(buildHandoffMdForRevision(9999, '', db)).toBeNull();
  });
});

describe('POST /api/tailored/[revisionId]/handoff (TC-HANDOFF-05)', () => {
  test('returns the request md as a download, memo from the body, 404/403/400 otherwise', async () => {
    process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-handoff-route-');
    const { getDb, runMigrations } = await import('@/lib/db/client');
    const db = getDb();
    runMigrations(db);
    h.kitDir = join(process.env.CAREER_FLOW_DATA_DIR, 'kit');
    const { saveKit: save } = await import('@/lib/kit/repo');
    save(readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) })), db, h.kitDir);
    const { registerPosting: reg, setPostingText: setText } = await import('@/lib/postings/repo');
    const { createRecipeRevision: create } = await import('@/lib/tailored/repo');
    const postingId = reg({ url: 'https://example.com/handoff-route' }, db).postingId;
    setText(postingId, '백엔드 서버 공고 본문', db);
    const rev = create(postingId, { track: '백엔드', profileId: 'B1', adjustmentIds: [] }, db);
    const { POST } = await import('@/app/api/tailored/[revisionId]/handoff/route');

    const call = (id: string, note: string, headers: Record<string, string> = {}) => {
      const form = new FormData();
      form.set('note', note);
      return POST(new Request('http://127.0.0.1:3939/x', { method: 'POST', body: form, headers: { host: '127.0.0.1:3939', ...headers } }), { params: Promise.resolve({ revisionId: id }) } as never);
    };
    const ok = await call(String(rev.id), '메모 한 줄');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(ok.headers.get('content-disposition')).toMatch(/^attachment;/);
    const body = await ok.text();
    expect(body).toContain('# 공고 특화 이력서 요청');
    expect(body).toContain('메모 한 줄');
    expect((await call('99999', '')).status).toBe(404);
    expect((await call('abc', '')).status).toBe(404);
    expect((await call(String(rev.id), '', { origin: 'http://evil.example' })).status).toBe(403);
    expect((await call(String(rev.id), 'ㄱ'.repeat(HANDOFF_NOTE_MAX + 1))).status).toBe(400);
  });
});
