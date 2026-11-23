import { describe, expect, it } from 'vitest';
import type { BrowserContext } from 'playwright';
import { launchHeaded } from '@/lib/extract/browser';

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
