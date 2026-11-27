// 북마크 버튼 "Career Flow로 보내기". 실제 채용 사이트 대신 로컬 픽스처 페이지에서 코드를 실행한다. 가상 이름만 쓴다.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from './paths';
import { setFake, toast, waitAnalyzed } from './helpers';

test.beforeEach(() => setFake('seeded', {}));

const FIXTURE_URL = `${FIXTURE_ORIGIN}/bookmarklet-e2e.html`;

async function readCode(page: Page): Promise<string> {
  await page.goto('/settings');
  const href = await page.getByRole('link', { name: 'Career Flow로 보내기' }).getAttribute('href');
  expect(href).toMatch(/^javascript:/);
  return href!;
}

/** 픽스처 페이지에서 북마크 버튼 코드를 실행하고 새 탭을 돌려준다. */
async function send(context: BrowserContext, fixture: Page, code: string): Promise<Page> {
  const source = decodeURIComponent(code.slice('javascript:'.length));
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    fixture.evaluate((src) => {
      new Function(src)();
    }, source),
  ]);
  return popup;
}

async function openFixture(context: BrowserContext): Promise<Page> {
  const fixture = await context.newPage();
  await fixture.goto(FIXTURE_URL);
  return fixture;
}

function hashUrl(token: string, over: Record<string, unknown> = {}): string {
  const payload = {
    v: 1,
    k: token,
    u: `${FIXTURE_ORIGIN}/bookmarklet-wrong.html`,
    t: '가상 확인용 공고',
    x: '가상 공고 본문입니다. '.repeat(40),
    c: false,
    ...over,
  };
  return `/postings/receive#cf=${encodeURIComponent(JSON.stringify(payload))}`;
}

test.describe('북마크 버튼', () => {
  test('TC-BM-14·15 공고 페이지에서 보내면 바로 등록하고 분석한다, 주소에서 # 을 지운다', async ({ page, context }) => {
    const code = await readCode(page);
    const fixture = await openFixture(context);
    const popup = await send(context, fixture, code);

    await popup.waitForURL(/\/postings\/(receive|\d+)/);
    // TC-BM-15: 받는 탭의 주소에 # 이 남지 않는다
    await expect.poll(() => popup.evaluate(() => location.hash)).toBe('');
    await popup.waitForURL(/\/postings\/\d+/);
    await toast(popup, '북마크 버튼으로 가져온 본문으로 분석을 시작했습니다');
    await waitAnalyzed(popup);

    await popup.getByRole('tab', { name: '공고 원문' }).click();
    await expect(popup.getByText('숨은문단: 우대 사항')).toBeVisible();
    await expect(popup.getByText('북마크 버튼으로 가져옴')).toBeVisible();
    await expect(popup.getByText('페이지 제목: 가상 북마크 공고')).toBeVisible();

    // 원래 탭은 그대로, 폼 안 submit 버튼은 눌리지 않았다
    expect(fixture.url()).toBe(FIXTURE_URL);
    await expect(fixture.locator('#flag')).toHaveText('');
    await expect(fixture.locator('#more')).toBeVisible();
    await popup.close();
    await fixture.close();
  });

  test('TC-BM-18 같은 공고 페이지에서 다시 보내면 같은 공고를 알려 준다', async ({ page, context }) => {
    const code = await readCode(page);
    const fixture = await openFixture(context);
    const popup = await send(context, fixture, code);
    await popup.waitForURL(/\/postings\/\d+/);
    await toast(popup, '이미 등록된 공고입니다. 본문을 바꾸려면');
    await popup.close();
    await fixture.close();
  });

  test('TC-BM-16 확인 값이 틀리면 등록하지 않고 채운 폼을 보여 준다', async ({ page }) => {
    await page.goto(hashUrl('x'.repeat(32)));
    await expect(page.locator('.notice.warn')).toContainText('북마크 버튼 확인 값이 맞지 않아 자동으로 등록하지 않았습니다');
    await expect(page.locator('#url')).toHaveValue(`${FIXTURE_ORIGIN}/bookmarklet-wrong.html`);
    await expect(page.getByPlaceholder(/공고 페이지에서 본문을 복사해/)).toContainText('페이지 제목: 가상 확인용 공고');
    expect(await page.evaluate(() => location.hash)).toBe('');
    // 등록되지 않았다: 받는 화면에 그대로 있다
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe('/postings/receive');
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await page.waitForURL(/\/postings\/\d+/);
  });

  test('TC-BM-17 받은 값이 없으면 안내를 보인다', async ({ page }) => {
    await page.goto('/postings/receive');
    await expect(page.getByText('받은 공고가 없습니다. 공고 페이지에서 북마크바의 [Career Flow로 보내기]를 누르세요.')).toBeVisible();
    await expect(page.getByRole('link', { name: '공고 등록으로' })).toHaveAttribute('href', '/postings/new');
    await expect(page.getByRole('link', { name: '설정에서 북마크 버튼 받기' })).toHaveAttribute('href', '/settings#bookmarklet');
  });

  test('TC-BM-20 폭 1024·1240·1440에서 가로 넘침이 없다', async ({ page }) => {
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/settings', hashUrl('y'.repeat(32), { u: `${FIXTURE_ORIGIN}/bookmarklet-width.html` })]) {
        await page.goto('/');
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        if (path.startsWith('/settings')) await expect(page.locator('#bookmarklet')).toBeVisible();
        else await expect(page.locator('.notice.warn')).toBeVisible();
        const r = await page.evaluate(() => ({
          over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          wb: getComputedStyle(document.body).wordBreak,
        }));
        expect(r.over, `${path.slice(0, 20)} @${width}`).toBe(false);
        expect(r.wb).toBe('keep-all');
      }
    }
  });

  // 확인 값을 바꾸므로 다른 테스트가 끝난 뒤 마지막에 둔다.
  test('TC-BM-19 설정 카드: 끌어다 놓는 링크, 코드 복사, 새로 만들기', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const code = await readCode(page);
    const link = page.getByRole('link', { name: 'Career Flow로 보내기' });
    await link.click();
    expect(new URL(page.url()).pathname).toBe('/settings');
    await toast(page, '북마크바로 끌어다 놓으세요');

    await page.getByRole('button', { name: '코드 복사' }).click();
    await toast(page, '복사됨');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

    await page.getByRole('button', { name: '새로 만들기' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '새로 만들기' }).click();
    await toast(page, '북마크 버튼을 새로 만들었습니다');
    await expect.poll(() => link.getAttribute('href')).not.toBe(code);

    // 예전 코드로 보내면 확인 폼으로 떨어진다
    const fixture = await openFixture(context);
    const popup = await send(context, fixture, code);
    await expect(popup.locator('.notice.warn')).toContainText('확인 값이 맞지 않아');
    await expect(popup.locator('#url')).toHaveValue(FIXTURE_URL);
    await popup.close();
    await fixture.close();
  });
});
