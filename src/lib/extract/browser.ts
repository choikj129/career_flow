import { chromium, type BrowserContext } from 'playwright';
import { config } from '@/lib/config';
import type { SiteId } from '@/lib/domain/types';

// 브라우저 잠금: 프로필 경로와 무관하게 프로세스 전체에서 하나. (pdf/render.ts도 같은 잠금을 쓴다.)
let locked = false;
const waiters: Array<() => void> = [];

export function acquireBrowserLock(): Promise<() => void> {
  const release = () => {
    const next = waiters.shift();
    if (next) next(); // 잠금을 다음 대기자에게 넘긴다(locked 유지)
    else locked = false;
  };
  if (!locked) {
    locked = true;
    return Promise.resolve(release);
  }
  return new Promise((resolve) => waiters.push(() => resolve(release)));
}

export function isBrowserBusy(): boolean {
  return locked;
}

export async function withBrowser<T>(
  fn: (ctx: BrowserContext) => Promise<T>,
  opts: { headless?: boolean; profileDir?: string } = {},
): Promise<T> {
  const release = await acquireBrowserLock();
  let ctx: BrowserContext | undefined;
  try {
    ctx = await chromium.launchPersistentContext(opts.profileDir ?? config.browserProfileDir, {
      headless: opts.headless ?? true,
    });
    return await fn(ctx);
  } finally {
    try {
      await ctx?.close();
    } finally {
      release();
    }
  }
}

const LOGIN_URLS: Partial<Record<SiteId, string>> = {
  remember: 'https://career.rememberapp.co.kr/',
  wanted: 'https://www.wanted.co.kr/',
  groupby: 'https://groupby.kr/',
  jobkorea: 'https://www.jobkorea.co.kr/Login/Login_Tot.asp',
};

/**
 * 화면 있는 브라우저로 사이트를 연다. 창이 열리면 바로 반환하고,
 * 사용자가 창을 닫을 때 브라우저 잠금을 푼다. 비밀번호는 앱이 다루지 않는다(사용자가 직접 입력).
 */
export async function openSiteLogin(site: SiteId, opts: { profileDir?: string } = {}): Promise<void> {
  const url = LOGIN_URLS[site];
  if (!url) throw new Error(`로그인 페이지가 없는 사이트입니다: ${site}`);
  const release = await acquireBrowserLock();
  let ctx: BrowserContext;
  try {
    ctx = await chromium.launchPersistentContext(opts.profileDir ?? config.browserProfileDir, {
      headless: false,
    });
  } catch (e) {
    release();
    throw e;
  }
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };
  ctx.on('close', releaseOnce);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  } catch (e) {
    await ctx.close().catch(() => {});
    releaseOnce();
    throw e;
  }
}
