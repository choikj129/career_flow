import { chromium } from 'playwright';
import { acquireBrowserLock } from '@/lib/extract/browser';

export const PDF_LOCK_TIMEOUT_MS = 30_000;

/** HTML → A4 PDF. 브라우저 잠금(다른 브라우저 작업과 하나만)을 쓰고, 키트 CSS의 @page 여백을 따른다. 외부 요청은 막는다. */
export async function renderPdf(html: string, opts: { lockTimeoutMs?: number } = {}): Promise<Buffer> {
  const release = await acquireBrowserLock(opts.lockTimeoutMs ?? PDF_LOCK_TIMEOUT_MS);
  try {
    const browser = await chromium.launch();
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
