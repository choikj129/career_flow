import { describe, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import { launchPdfBrowser } from '@/lib/pdf/render';

const fakeBrowser = {} as Browser;

describe('launchPdfBrowser (PDF용 브라우저 대체 실행)', () => {
  it('TC-PE-06 기본 Chromium이 되면 그것만 쓴다', async () => {
    const tried: Array<string | undefined> = [];
    const b = await launchPdfBrowser(async (o) => {
      tried.push(o.channel);
      return fakeBrowser;
    });
    expect(b).toBe(fakeBrowser);
    expect(tried).toEqual([undefined]);
  });

  it('TC-PE-07 첫 시도가 실패하면 chrome, 그다음 msedge 순서로 시도한다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tried: Array<string | undefined> = [];
    const b = await launchPdfBrowser(async (o) => {
      tried.push(o.channel);
      if (o.channel !== 'chrome') throw new Error(`no ${o.channel ?? 'default'}`);
      return fakeBrowser;
    });
    expect(b).toBe(fakeBrowser);
    expect(tried).toEqual([undefined, 'chrome']);
    const w = vi.mocked(console.warn);
    expect(w).toHaveBeenCalledTimes(1);
  });

  it('TC-PE-08 모두 실패하면 첫 오류를 던진다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tried: Array<string | undefined> = [];
    await expect(
      launchPdfBrowser(async (o) => {
        tried.push(o.channel);
        throw new Error(`fail ${o.channel ?? 'default'}`);
      }),
    ).rejects.toThrow('fail default');
    expect(tried).toEqual([undefined, 'chrome', 'msedge']);
  });
});
