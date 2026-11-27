import { chromium, type Browser, type BrowserContext } from 'playwright';

// 브라우저 잠금: 프로세스 전체에서 하나. (pdf/render.ts도 같은 잠금을 쓴다.)
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
  opts: { headless?: boolean; lockTimeoutMs?: number } = {},
): Promise<T> {
  const release = await acquireBrowserLock(opts.lockTimeoutMs);
  let browser: Browser | undefined;
  try {
    // 로그인 정보를 남기지 않는 일반(비지속) 브라우저. 열 때마다 새로 시작한다.
    browser = await chromium.launch({ headless: opts.headless ?? true });
    const ctx = await browser.newContext();
    return await fn(ctx);
  } finally {
    try {
      await browser?.close();
    } finally {
      release();
    }
  }
}
