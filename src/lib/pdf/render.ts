import { chromium, type Browser } from 'playwright';
import { acquireBrowserLock } from '@/lib/extract/browser';

export const PDF_LOCK_TIMEOUT_MS = 30_000;

type PdfLauncher = (opts: { channel?: string }) => Promise<Browser>;

// 기본 Chromium을 못 찾을 때(로그인 직후 시작 등) PC에 설치된 Chrome → Edge로 한 번씩 더 시도한다.
const PDF_CHANNELS: Array<string | undefined> = [undefined, 'chrome', 'msedge'];

export async function launchPdfBrowser(
  launch: PdfLauncher = (o) => chromium.launch(o.channel ? { channel: o.channel } : {}),
): Promise<Browser> {
  let firstError: unknown;
  for (const channel of PDF_CHANNELS) {
    try {
      return await launch({ channel });
    } catch (e) {
      if (firstError === undefined) firstError = e;
      const reason = (e instanceof Error ? e.message : String(e)).trim().slice(0, 200).split('\n')[0];
      console.warn(`PDF 브라우저 실행 실패(${channel ?? '기본 Chromium'}): ${reason}`);
    }
  }
  throw firstError;
}

/** HTML → A4 PDF. 브라우저 잠금(다른 브라우저 작업과 하나만)을 쓰고, 키트 CSS의 @page 여백을 따른다. 외부 요청은 막는다. */
export async function renderPdf(html: string, opts: { lockTimeoutMs?: number } = {}): Promise<Buffer> {
  const release = await acquireBrowserLock(opts.lockTimeoutMs ?? PDF_LOCK_TIMEOUT_MS);
  try {
    const browser = await launchPdfBrowser();
    try {
      const page = await browser.newPage();
      await page.route('**/*', (route) => {
        const u = route.request().url();
        return u.startsWith('data:') || u.startsWith('about:') ? route.continue() : route.abort();
      });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally {
      await browser.close();
    }
  } finally {
    release();
  }
}
