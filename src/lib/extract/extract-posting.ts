import { AiError } from '@/lib/ai/runner';
import { withBrowser } from './browser';

export const MIN_POSTING_TEXT_LENGTH = 300;
export const MAX_POSTING_TEXT_LENGTH = 50_000;

const FAIL_MESSAGE =
  '공고 본문을 읽지 못했습니다(로그인이 필요하거나 페이지 구조가 다를 수 있음). 공고 내용을 붙여넣어 주세요.';

// 사이트별 선택자는 실제 페이지로 확인한 뒤에만 추가한다(확인되지 않은 선택자는 넣지 않는다).
const SELECTORS = ['main', 'article', 'body'];

function clean(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPostingText(
  url: string,
  opts: { profileDir?: string; timeoutMs?: number } = {},
): Promise<{ text: string; title: string }> {
  try {
    return await withBrowser(
      async (ctx) => {
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: opts.timeoutMs ?? 30_000 });
        const title = (await page.title()).trim();
        let best = '';
        for (const sel of SELECTORS) {
          const el = await page.$(sel);
          if (!el) continue;
          const text = clean(await el.innerText());
          if (text.length > best.length) best = text;
          if (text.length >= MIN_POSTING_TEXT_LENGTH) {
            best = text;
            break;
          }
        }
        if (best.length < MIN_POSTING_TEXT_LENGTH) throw new AiError('extract_failed', FAIL_MESSAGE);
        return { text: best.slice(0, MAX_POSTING_TEXT_LENGTH), title };
      },
      { profileDir: opts.profileDir },
    );
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError('extract_failed', FAIL_MESSAGE);
  }
}
