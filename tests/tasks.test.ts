import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ uploadsDir: '' }));
vi.mock('@/lib/config', async (orig) => {
  const mod = (await orig()) as { config: Record<string, unknown> };
  return {
    ...mod,
    config: new Proxy(mod.config, {
      get: (t, k) => (k === 'uploadsDir' ? h.uploadsDir : t[k as string]),
    }),
  };
});
vi.mock('@/lib/extract/extract-posting', () => ({
  extractPostingText: vi.fn(async () => ({ text: '공고 본문...', title: 't' })),
}));

import { makeTestDb } from './helpers/db';
import { emptyResume } from '@/lib/resume/schema';
import { saveResumeVersion } from '@/lib/resume/repo';
import { registerPosting, getPosting, getLatestAnalysis } from '@/lib/postings/repo';
import { setModelFor } from '@/lib/settings';
import { AiError, type AiRunRequest, type AiRunResult, type AiRunner } from '@/lib/ai/runner';
import { JOB_TIMEOUT_MS } from '@/lib/ai/queue';
import { renderPrompt } from '@/lib/ai/prompt';
import { handlers } from '@/lib/ai/tasks';
import { extractPostingText } from '@/lib/extract/extract-posting';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';

const VALID_ANALYSIS: AnalysisResult = {
  posting: {
    companyDisplayName: '카카오',
    companyLegalName: '(주)카카오',
    positionTitle: '백엔드 개발자',
    experienceRequirement: '3년 이상',
    employmentType: '정규직',
    location: '판교',
    deadline: null,
    salary: null,
    responsibilities: ['서버 개발'],
    requirements: ['Java'],
    preferred: [],
    techStack: ['Java', 'Spring'],
  },
  fit: { score: 72, breakdown: [{ category: 'requirements', score: 80, reason: '근거' }] },
  strengths: [{ point: 'Java 경험', evidence: '이력서 경력 1' }],
  gaps: [{ point: 'Kafka', kind: 'missing', suggestion: '학습' }],
  preferenceMismatches: [],
  tailoringAdvice: '조언',
};

class FakeRunner implements AiRunner {
  reqs: AiRunRequest[] = [];
  constructor(private output: unknown) {}
  get lastReq() {
    return this.reqs[this.reqs.length - 1];
  }
  async run(req: AiRunRequest): Promise<AiRunResult> {
    this.reqs.push(req);
    return { output: this.output, sessionId: 'sess-1', usage: { in: 1 }, durationMs: 5 };
  }
}

function workDir() {
  return mkdtempSync(join(tmpdir(), 'cf-work-'));
}

beforeEach(() => {
  h.uploadsDir = mkdtempSync(join(tmpdir(), 'cf-uploads-'));
  vi.mocked(extractPostingText).mockClear();
});

test('analyze_posting extracts text when missing, then saves analysis linked to latest resume', async () => {
  const db = makeTestDb();
  const resume = saveResumeVersion({ ...emptyResume(), summary: '이력서 요약 XYZ' }, undefined, db);
  const reg = registerPosting({ url: 'https://www.wanted.co.kr/wd/1' }, db);
  const runner = new FakeRunner(VALID_ANALYSIS);
  const out = await handlers.analyze_posting({
    jobId: reg.jobId!,
    payload: { postingId: reg.postingId },
    runner,
    workDir: workDir(),
    db,
  });
  expect(runner.lastReq.tools).toEqual([]);
  expect(runner.lastReq.prompt).toContain('공고 본문');
  expect(runner.lastReq.prompt).toContain('이력서 요약 XYZ');
  expect(runner.lastReq.model).toBe('opus');
  expect(runner.lastReq.timeoutMs).toBe(JOB_TIMEOUT_MS.analyze_posting);
  expect(runner.lastReq.jsonSchema).toHaveProperty('properties');
  expect(getPosting(reg.postingId, db)!.rawText).toBe('공고 본문...');
  const a = getLatestAnalysis(reg.postingId, db)!;
  expect(a.fitScore).toBe(72);
  expect(a.resumeVersionId).toBe(resume.id);
  expect(out.sessionId).toBe('sess-1');
  expect(out.model).toBe('opus');
});

test('analyze_posting skips extraction when text exists and uses model setting', async () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  setModelFor('analyze_posting', 'sonnet', db);
  const reg = registerPosting({ pastedText: '붙여넣은 공고' }, db);
  const runner = new FakeRunner(VALID_ANALYSIS);
  await handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: workDir(), db });
  expect(extractPostingText).not.toHaveBeenCalled();
  expect(runner.lastReq.model).toBe('sonnet');
  expect(runner.lastReq.prompt).toContain('붙여넣은 공고');
});

test('analyze_posting fails without base resume', async () => {
  const db = makeTestDb();
  const reg = registerPosting({ pastedText: '본문' }, db);
  const runner = new FakeRunner(VALID_ANALYSIS);
  await expect(
    handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: workDir(), db }),
  ).rejects.toMatchObject({ kind: 'cli', message: expect.stringContaining('기본 이력서') });
  expect(runner.reqs).toHaveLength(0);
});

test('analyze_posting rejects schema-invalid output after one resume retry', async () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ pastedText: '본문' }, db);
  const runner = new FakeRunner({ ...VALID_ANALYSIS, fit: { score: 150, breakdown: [] } });
  const p = handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: workDir(), db });
  await expect(p).rejects.toBeInstanceOf(AiError);
  await expect(p).rejects.toMatchObject({ kind: 'schema' });
  expect(runner.reqs).toHaveLength(2);
  expect(runner.reqs[1].resumeSessionId).toBe('sess-1');
  expect(getLatestAnalysis(reg.postingId, db)).toBeUndefined();
});

test('analyze_posting retry can succeed', async () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const reg = registerPosting({ pastedText: '본문' }, db);
  const outputs: unknown[] = [{ bad: true }, VALID_ANALYSIS];
  const runner: FakeRunner = new FakeRunner(null);
  runner.run = async (req) => {
    runner.reqs.push(req);
    return { output: outputs.shift(), sessionId: 'sess-1', usage: {}, durationMs: 1 };
  };
  await handlers.analyze_posting({ jobId: reg.jobId!, payload: { postingId: reg.postingId }, runner, workDir: workDir(), db });
  expect(runner.reqs).toHaveLength(2);
  expect(getLatestAnalysis(reg.postingId, db)!.fitScore).toBe(72);
});

test('analyze_posting fails on missing posting', async () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  const runner = new FakeRunner(VALID_ANALYSIS);
  await expect(
    handlers.analyze_posting({ jobId: 1, payload: { postingId: 999 }, runner, workDir: workDir(), db }),
  ).rejects.toMatchObject({ kind: 'cli' });
});

test('import_resume copies files into work dir and allows only Read', async () => {
  const db = makeTestDb();
  const file = join(h.uploadsDir, 'resume.pdf');
  writeFileSync(file, 'PDFDATA');
  const wd = workDir();
  const runner = new FakeRunner({ ...emptyResume(), summary: '가져옴' });
  const out = await handlers.import_resume({
    jobId: 1,
    payload: { filePaths: [file], pastedText: '붙여넣은 이력서' },
    runner,
    workDir: wd,
    db,
  });
  expect(runner.lastReq.tools).toEqual(['Read']);
  expect(runner.lastReq.cwd).toBe(wd);
  expect(runner.lastReq.model).toBe('sonnet');
  expect(runner.lastReq.timeoutMs).toBe(JOB_TIMEOUT_MS.import_resume);
  expect(runner.lastReq.prompt).toContain('붙여넣은 이력서');
  expect(runner.lastReq.prompt).toContain('resume.pdf');
  expect(runner.lastReq.prompt).not.toContain(h.uploadsDir);
  expect(existsSync(join(wd, 'resume.pdf'))).toBe(true);
  expect(readFileSync(join(wd, 'resume.pdf'), 'utf8')).toBe('PDFDATA');
  expect((out.result as { summary: string }).summary).toBe('가져옴');
});

test('import_resume rejects paths outside uploads dir', async () => {
  const db = makeTestDb();
  const outside = join(mkdtempSync(join(tmpdir(), 'cf-out-')), 'secret.txt');
  writeFileSync(outside, 'secret');
  mkdirSync(join(h.uploadsDir, 'sub'));
  const runner = new FakeRunner(emptyResume());
  for (const bad of [outside, join(h.uploadsDir, '..', 'x.txt'), join(h.uploadsDir, 'sub', '..', '..', 'y.txt')]) {
    await expect(
      handlers.import_resume({ jobId: 1, payload: { filePaths: [bad] }, runner, workDir: workDir(), db }),
    ).rejects.toMatchObject({ kind: 'cli' });
  }
  expect(runner.reqs).toHaveLength(0);
});

test('import_resume rejects empty input and schema-invalid output', async () => {
  const db = makeTestDb();
  await expect(
    handlers.import_resume({ jobId: 1, payload: { filePaths: [] }, runner: new FakeRunner({}), workDir: workDir(), db }),
  ).rejects.toMatchObject({ kind: 'cli' });
  await expect(
    handlers.import_resume({ jobId: 1, payload: { pastedText: '내용' }, runner: new FakeRunner({ nope: 1 }), workDir: workDir(), db }),
  ).rejects.toMatchObject({ kind: 'schema' });
});

test('import_applications uses Read only with images and validates rows', async () => {
  const db = makeTestDb();
  const img = join(h.uploadsDir, 'shot.png');
  writeFileSync(img, 'PNG');
  const rows = {
    rows: [{ companyName: '카카오', positionTitle: '서버', site: 'wanted', appliedAt: '2026-10-01', status: 'applied' }],
  };
  const withImg = new FakeRunner(rows);
  const wd = workDir();
  const out = await handlers.import_applications({
    jobId: 2,
    payload: { site: 'wanted', imagePaths: [img], pastedText: '텍스트' },
    runner: withImg,
    workDir: wd,
    db,
  });
  expect(withImg.lastReq.tools).toEqual(['Read']);
  expect(withImg.lastReq.prompt).toContain('shot.png');
  expect(withImg.lastReq.prompt).toContain('원티드');
  expect(existsSync(join(wd, 'shot.png'))).toBe(true);
  expect(out.result).toEqual(rows);

  const textOnly = new FakeRunner(rows);
  await handlers.import_applications({ jobId: 3, payload: { site: null, pastedText: '텍스트' }, runner: textOnly, workDir: workDir(), db });
  expect(textOnly.lastReq.tools).toEqual([]);
  expect(textOnly.lastReq.timeoutMs).toBe(JOB_TIMEOUT_MS.import_applications);

  await expect(
    handlers.import_applications({
      jobId: 4,
      payload: { site: null, pastedText: 'x' },
      runner: new FakeRunner({ rows: [{ companyName: 'a' }] }),
      workDir: workDir(),
      db,
    }),
  ).rejects.toMatchObject({ kind: 'schema' });
});

test('prompts forbid fabrication and import_applications gets today date', async () => {
  const db = makeTestDb();
  const r = new FakeRunner({ rows: [] });
  await handlers.import_applications({ jobId: 5, payload: { site: null, pastedText: 'x' }, runner: r, workDir: workDir(), db });
  expect(r.lastReq.prompt).toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(renderPrompt('import-resume', { files: 'a', pasted_text: 'b' })).toContain('만들어');
});

test('renderPrompt throws on missing variable and substitutes in a single pass', () => {
  expect(() => renderPrompt('analyze-posting', {})).toThrow();
  const out = renderPrompt('analyze-posting', {
    posting_text: '{{resume_json}}',
    resume_json: 'R',
    preferences_json: 'P',
    today: 'T',
    profile_table: 'X',
  });
  expect(out).toContain('{{resume_json}}');
});
