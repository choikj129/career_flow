import { expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { controlFile, logFile, type AppName } from './paths';

export type FakeControl = { mode?: 'ok' | 'auth' | 'limit' | 'garbage' | 'schema_bad'; delayMs?: number };

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
