import { expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { controlFile, dataDir, logFile, type AppName } from './paths';

export type FakeControl = { mode?: 'ok' | 'auth' | 'limit' | 'garbage' | 'schema_bad'; delayMs?: number; needsWorkspace?: boolean };

/** 가짜 claude의 동작을 바꾼다(호출마다 다시 읽는다). */
export function setFake(app: AppName, c: FakeControl = {}): void {
  writeFileSync(controlFile(app), JSON.stringify(c));
}

export type FakeCall = { kind: string; model: string; tools: string; args: string[]; mode: string };
export function fakeCalls(app: AppName): FakeCall[] {
  if (!existsSync(logFile(app))) return [];
  return readFileSync(logFile(app), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeCall);
}

/** 공고 본문을 붙여넣어 등록한다. 공고 상세로 이동한 뒤 공고 id를 돌려준다. */
export async function registerByPaste(page: Page, text: string, opts: { siteNote?: string } = {}): Promise<number> {
  await page.goto('/postings/new');
  await page.getByText('링크로 안 열리면 공고 본문 붙여넣기').click();
  await page.getByPlaceholder(/공고 페이지에서 본문을 복사해/).fill(text);
  if (opts.siteNote) await page.getByLabel(/출처 이름/).fill(opts.siteNote);
  await page.getByRole('button', { name: '등록하고 분석' }).click();
  await page.waitForURL(/\/postings\/\d+/);
  return Number(/\/postings\/(\d+)/.exec(page.url())![1]);
}

/** 분석 결과가 나올 때까지 기다린다. */
export async function waitAnalyzed(page: Page): Promise<void> {
  await expect(page.locator('.score')).toBeVisible();
}

export async function toast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
}

// ───────── 서류 키트 올리기(화면 경로) ─────────
export const KIT_DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
export const LONG_PROFILE = '성능과아주긴이름을가진프로필로트래픽처리정합성과대용량을함께강조하는긴설명';

export type KitFile = { name: string; mimeType: string; buffer: Buffer };

/** 예시 키트(지어낸 서류) 파일들. 옵션으로 마스터스토리에 줄을 더하고, B2 프로필 이름을 길게 바꾸고, 이력서 항목에 script 글자를 넣는다 */
export function kitFixtureFiles(opts: { masterExtra?: string; longName?: boolean; scriptInResume?: boolean } = {}): KitFile[] {
  return readdirSync(KIT_DIR).map((name) => {
    let data = readFileSync(join(KIT_DIR, name));
    if (name === '마스터스토리.md' && opts.masterExtra) data = Buffer.concat([data, Buffer.from(`\n${opts.masterExtra}\n`)]);
    if (name === '서류_가이드.md' && opts.longName) data = Buffer.from(data.toString('utf8').replace('| B2 성능 |', `| B2 ${LONG_PROFILE} |`));
    if (name === '이력서_백엔드_v1_20260101.md' && opts.scriptInResume) {
      data = Buffer.from(data.toString('utf8').replace('서버 개발 경험과 설계 원칙', '서버 개발 경험과 설계 원칙 <script>window.__pwned = 1</script>'));
    }
    return { name, mimeType: 'text/markdown', buffer: data };
  });
}

export type KitUploadResult = { ok: boolean; unchanged?: boolean; kitId?: number; errorCount?: number; error?: string };

/** 키트 탭에서 파일을 고른다. 화면이 아직 준비되기 전에 고른 파일은 앱이 놓칠 수 있어, [키트 파일 올리기]가 켜질 때까지 다시 고른다 */
export async function pickKitFiles(page: Page, files: KitFile[]): Promise<void> {
  const input = page.locator('input[type=file][aria-label="키트 파일"]');
  const button = page.getByRole('button', { name: '키트 파일 올리기' });
  await expect(async () => {
    await input.setInputFiles(files);
    await expect(button).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

/** 서류 키트 탭에서 파일을 골라 올리고 응답을 돌려준다 */
export async function uploadKit(page: Page, files: KitFile[]): Promise<KitUploadResult> {
  await page.goto('/resume?tab=kit');
  await pickKitFiles(page, files);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/kit') && r.request().method() === 'POST'),
    page.getByRole('button', { name: '키트 파일 올리기' }).click(),
  ]);
  return (await res.json()) as KitUploadResult;
}

/**
 * 앱의 맞춤본(리비전)을 시드한다. 2026-11-24부터 화면에서 만들 수 없어 앱 코드로 직접 만든다(tests/e2e/seed-revision.ts, 조립만, claude 호출 없음).
 * 키트가 먼저 올라가 있어야 한다. 새 리비전 id를 돌려준다.
 */
export function seedRevision(app: AppName, postingId: number, profileId: string, track = '백엔드'): { id: number; revNo: number } {
  const r = spawnSync(process.execPath, [join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'tests/e2e/seed-revision.ts', String(postingId), track, profileId], {
    cwd: process.cwd(),
    env: { ...process.env, CAREER_FLOW_DATA_DIR: dataDir(app) },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`리비전 시드 실패: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { id: number; revNo: number };
}

/** (숨긴 화면용) 맞춤 이력서 탭의 접이식 "공고에 맞춰 고치기" 상자를 연다. 2026-11-24부터 화면에 상자가 없어 숨긴 화면 테스트(skip)만 쓴다 */
export async function openFixBox(page: Page): Promise<void> {
  const box = page.getByTestId('fix-box');
  await expect(box).toBeVisible();
  if (!(await box.evaluate((el) => (el as HTMLDetailsElement).open))) await box.locator('summary').click();
  await expect(box.locator('.tl')).toBeVisible();
}
