import { describe, expect, it } from 'vitest';
import type { BrowserContext } from 'playwright';
import { findInstalledBrowser, launchHeaded, plainBrowserArgs } from '@/lib/extract/browser';

const fakeCtx = {} as BrowserContext;

describe('launchHeaded (로그인 창 브라우저 선택)', () => {
  it('PC의 Chrome을 먼저 쓴다', async () => {
    const tried: Array<string | undefined> = [];
    const ctx = await launchHeaded('dir', async (_dir, o) => {
      tried.push(o.channel);
      return fakeCtx;
    });
    expect(ctx).toBe(fakeCtx);
    expect(tried).toEqual(['chrome']);
  });

  it('Chrome이 실패하면 Edge, 그다음 기본 Chromium 순서로 시도한다', async () => {
    const tried: Array<string | undefined> = [];
    const ctx = await launchHeaded('dir', async (_dir, o) => {
      tried.push(o.channel);
      if (o.channel) throw new Error(`no ${o.channel}`);
      return fakeCtx;
    });
    expect(ctx).toBe(fakeCtx);
    expect(tried).toEqual(['chrome', 'msedge', undefined]);
  });

  it('화면 있는 창으로 같은 프로필 폴더를 연다', async () => {
    const calls: Array<[string, { headless: boolean }]> = [];
    await launchHeaded('C:/profile', async (dir, o) => {
      calls.push([dir, { headless: o.headless }]);
      return fakeCtx;
    });
    expect(calls).toEqual([['C:/profile', { headless: false }]]);
  });

  it('모두 실패하면 마지막 오류를 던진다', async () => {
    await expect(
      launchHeaded('dir', async (_dir, o) => {
        throw new Error(`fail ${o.channel ?? 'bundled'}`);
      }),
    ).rejects.toThrow('fail bundled');
  });
});

// 테스트 안의 Windows 경로는 / 로 쓰고 \ 로 바꾼다.
const w = (s: string) => s.replace(/\//g, String.fromCharCode(92));

describe('findInstalledBrowser (자동화 없이 띄울 브라우저)', () => {
  const env = {
    PROGRAMFILES: w('C:/PF'),
    'PROGRAMFILES(X86)': w('C:/PF86'),
    LOCALAPPDATA: w('C:/Users/me/AppData/Local'),
  };
  const chromePf = w('C:/PF/Google/Chrome/Application/chrome.exe');
  const edge86 = w('C:/PF86/Microsoft/Edge/Application/msedge.exe');

  it('Chrome이 있으면 Chrome을 고른다', () => {
    const have = new Set([chromePf, edge86]);
    expect(findInstalledBrowser((p) => have.has(p), env)).toBe(chromePf);
  });

  it('사용자 폴더에 설치된 Chrome도 찾는다', () => {
    const p = w('C:/Users/me/AppData/Local/Google/Chrome/Application/chrome.exe');
    expect(findInstalledBrowser((x) => x === p, env)).toBe(p);
  });

  it('Chrome이 없으면 Edge를 고른다', () => {
    expect(findInstalledBrowser((x) => x === edge86, env)).toBe(edge86);
  });

  it('둘 다 없으면 null', () => {
    expect(findInstalledBrowser(() => false, env)).toBeNull();
  });
});

describe('plainBrowserArgs', () => {
  it('앱 프로필 폴더로 사이트 주소를 연다(자동화 옵션 없음)', () => {
    const dir = w('C:/app/data/browser-profile');
    const args = plainBrowserArgs(dir, 'https://www.wanted.co.kr/');
    expect(args).toEqual([`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'https://www.wanted.co.kr/']);
    expect(args.join(' ')).not.toMatch(/remote-debugging|enable-automation/);
  });
});
