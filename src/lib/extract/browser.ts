import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { config } from '@/lib/config';
import type { SiteId } from '@/lib/domain/types';

// 브라우저 잠금: 프로필 경로와 무관하게 프로세스 전체에서 하나. (pdf/render.ts도 같은 잠금을 쓴다.)
let locked = false;
const waiters: Array<() => void> = [];

export const BROWSER_LOCK_TIMEOUT_MS = 60_000;

export class BrowserLockTimeoutError extends Error {
  constructor() {
    super('브라우저를 사용 중이어서 잠금을 얻지 못했습니다');
    this.name = 'BrowserLockTimeoutError';
  }
}

/** timeoutMs 안에 잠금을 얻지 못하면 BrowserLockTimeoutError 로 거부한다(생략하면 무한 대기). */
export function acquireBrowserLock(timeoutMs?: number): Promise<() => void> {
  const release = () => {
    const next = waiters.shift();
    if (next) next(); // 잠금을 다음 대기자에게 넘긴다(locked 유지)
    else locked = false;
  };
  if (!locked) {
    locked = true;
    return Promise.resolve(release);
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grant = () => {
      if (timer) clearTimeout(timer);
      resolve(release);
    };
    waiters.push(grant);
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        const i = waiters.indexOf(grant);
        if (i >= 0) waiters.splice(i, 1);
        reject(new BrowserLockTimeoutError());
      }, timeoutMs);
    }
  });
}

export function isBrowserBusy(): boolean {
  return locked;
}

export async function withBrowser<T>(
  fn: (ctx: BrowserContext) => Promise<T>,
  opts: { headless?: boolean; profileDir?: string; lockTimeoutMs?: number } = {},
): Promise<T> {
  const release = await acquireBrowserLock(opts.lockTimeoutMs);
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

type HeadedLauncher = (
  dir: string,
  opts: { headless: boolean; channel?: string },
) => Promise<BrowserContext>;

// 화면 있는 Chromium(Playwright 내려받기본)은 일부 Windows 빌드에서 실행되지 않는다
// (side-by-side 설정 오류). 그래서 PC에 설치된 Chrome → Edge → 내려받은 Chromium 순서로 연다.
// 같은 프로필 폴더를 쓰며, 저장된 로그인은 화면 없는 브라우저(공고 읽기)에서 그대로 읽힌다.
const HEADED_CHANNELS: Array<string | undefined> = ['chrome', 'msedge', undefined];

export async function launchHeaded(
  dir: string,
  launch: HeadedLauncher = (d, o) => chromium.launchPersistentContext(d, o),
): Promise<BrowserContext> {
  let lastError: unknown;
  for (const channel of HEADED_CHANNELS) {
    try {
      return await launch(dir, channel ? { headless: false, channel } : { headless: false });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// 자동화로 띄운 창은 Google 로그인이 막는다("브라우저 또는 앱이 안전하지 않을 수 있습니다").
// 그래서 로그인 창은 PC에 설치된 Chrome/Edge를 자동화 없이 그대로 띄운다.
// 앱 프로필 폴더(--user-data-dir)에 저장된 로그인은 화면 없는 브라우저에서 그대로 읽힌다.
export function findInstalledBrowser(
  exists: (p: string) => boolean = fs.existsSync,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((r): r is string => !!r);
  const candidates = [
    ...roots.map((r) => path.win32.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...roots.map((r) => path.win32.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
  ];
  return candidates.find((p) => exists(p)) ?? null;
}

export function plainBrowserArgs(profileDir: string, url: string): string[] {
  return [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', url];
}

/** 설치된 브라우저를 셸 없이 띄우고, 그 프로세스가 끝나면(창을 닫으면) onExit를 부른다. */
function spawnPlainBrowser(exe: string, args: string[], onExit: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => resolve());
    child.once('exit', onExit);
  });
}

/**
 * 화면 있는 브라우저로 사이트를 연다. 창이 열리면 바로 반환하고,
 * 사용자가 창을 닫을 때 브라우저 잠금을 푼다. 비밀번호는 앱이 다루지 않는다(사용자가 직접 입력).
 */
export async function openSiteLogin(site: SiteId, opts: { profileDir?: string } = {}): Promise<void> {
  const url = LOGIN_URLS[site];
  if (!url) throw new Error(`로그인 페이지가 없는 사이트입니다: ${site}`);
  const profileDir = opts.profileDir ?? config.browserProfileDir;
  const release = await acquireBrowserLock();
  const exe = findInstalledBrowser();
  if (exe) {
    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      release();
    };
    try {
      await spawnPlainBrowser(exe, plainBrowserArgs(profileDir, url), releaseOnce);
      return;
    } catch {
      // 띄우지 못하면 아래 자동화 방식으로 넘어간다(잠금은 그대로 쥔 채).
      released = true; // 실패한 프로세스의 exit가 잠금을 풀지 않게 한다
    }
  }
  let ctx: BrowserContext;
  try {
    ctx = await launchHeaded(profileDir);
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
