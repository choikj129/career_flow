// 맞춤본 내려받기(PDF·md·미리보기·공고 요약·기본 서류)와 분석 탭 프로필 추천 줄.
// 키트 올리기, 공고 등록·분석, 맞춤본 만들기는 모두 화면 경로로 한다(가짜 claude, 가상 데이터).
import { expect, test, type Page } from '@playwright/test';
import { LONG_PROFILE, kitFixtureFiles, openFixBox, registerByPaste, setFake, toast, uploadKit, waitAnalyzed } from './helpers';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => setFake('seeded', {}));

const REC_POSTING_NO_REC = 5; // 시드 공고: 키트 없이 분석됨 → 추천 줄이 없다
const POSTING = ['회사명: 내려받기테스트', '포지션: 서버 개발자', '적합도: 75', '주요업무', '- Kafka Java 서버 공고 본문(가상). 백엔드 API, 캐시, 성능, 트래픽'].join('\n');

let kitId = 0;
let postingId = 0;
let revisionId = 0;

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, locale: 'ko-KR' });
  setFake('seeded', {});
  // 이력서 항목에 script 글자가 들어 있고 B2 프로필 이름이 긴 키트: 미리보기가 서류 안의 글자를 실행하지 않는지, 긴 이름이 잘리지 않는지 본다
  const up = await uploadKit(page, kitFixtureFiles({ scriptInResume: true, longName: true }));
  expect(up.ok).toBe(true);
  kitId = up.unchanged ? 0 : (up.kitId ?? 0);
  expect(kitId).toBeGreaterThan(0);
  postingId = await registerByPaste(page, POSTING);
  await waitAnalyzed(page);
  await page.goto(`/postings/${postingId}?tab=tailored`);
  await openFixBox(page);
  await page.getByRole('button', { name: '맞춤본 만들기' }).click();
  await toast(page, '맞춤본을 만들었습니다');
  const href = await page.getByTestId('downloads').getByRole('link', { name: '이력서 PDF' }).getAttribute('href');
  revisionId = Number(/\/api\/tailored\/(\d+)\//.exec(href!)![1]);
  await page.close();
});

test.describe('분석 탭 프로필 추천 줄', () => {
  test('TC-TAILOR-E2E-REC-01 추천이 있으면 줄이 보이고 맞춤 이력서 탭 링크가 있다', async ({ page }) => {
    await page.goto(`/postings/${postingId}`);
    const line = page.getByTestId('profile-rec-line');
    await expect(line).toBeVisible();
    await expect(line).toContainText('추천 프로필 B2');
    await expect(line).toContainText('다음 B1');
    await expect(line.getByRole('link', { name: '→ 맞춤 이력서 탭' })).toHaveAttribute('href', `/postings/${postingId}?tab=tailored`);
  });

  test('TC-TAILOR-E2E-REC-02 추천이 없는 분석에는 줄이 없다', async ({ page }) => {
    await page.goto(`/postings/${REC_POSTING_NO_REC}`);
    await expect(page.locator('.score')).toBeVisible();
    await expect(page.getByTestId('profile-rec-line')).toHaveCount(0);
  });

  test('TC-TAILOR-E2E-REC-03 폭 1024·1240·1440에서 가로로 넘치지 않고 줄바꿈 규칙이 적용된다', async ({ page }) => {
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/postings/${postingId}`);
      const line = page.getByTestId('profile-rec-line');
      await expect(line).toBeVisible();
      expect(await noOverflow(page), `폭 ${width}`).toBe(true);
      const css = await line.evaluate((el) => ({ w: getComputedStyle(el).overflowWrap, b: getComputedStyle(el).wordBreak, fits: el.scrollWidth <= el.clientWidth + 1 }));
      expect(css).toEqual({ w: 'anywhere', b: 'keep-all', fits: true });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe('맞춤본 내려받기', () => {
  test('TC-TAILOR-E2E-DL-01 md·PDF 내려받기: 파일 이름·형식', async ({ request }) => {
    const md = await request.get(`/api/tailored/${revisionId}/resume?format=md`);
    expect(md.status()).toBe(200);
    expect(md.headers()['content-type']).toBe('text/markdown; charset=utf-8');
    expect(decodeURIComponent(md.headers()['content-disposition'])).toContain('홍길동_이력서_내려받기테스트.md');
    expect(await md.text()).toContain('# 홍길동 · 백엔드 개발자');

    const pdf = await request.get(`/api/tailored/${revisionId}/career`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(decodeURIComponent(pdf.headers()['content-disposition'])).toContain('홍길동_경력기술서_내려받기테스트.pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const base = await request.get(`/api/kit/${kitId}/${encodeURIComponent('백엔드')}/resume?inline=1`);
    expect(base.status()).toBe(200);
    expect(base.headers()['content-disposition']).toMatch(/^inline;/);
    expect((await base.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('TC-TAILOR-E2E-DL-02 공고 요약 md와 없는 맞춤본·잘못된 요청', async ({ request }) => {
    const pm = await request.get(`/api/tailored/${revisionId}/posting-md`);
    expect(pm.status()).toBe(200);
    expect(decodeURIComponent(pm.headers()['content-disposition'])).toContain('공고.md');
    const body = await pm.text();
    expect(body).toContain('서버 개발자');
    expect(body).toContain('B2');
    expect(body).toContain('Kafka Java 서버 공고 본문(가상)');
    expect((await request.get('/api/tailored/999999/resume')).status()).toBe(404);
    expect((await request.get(`/api/tailored/${revisionId}/etc`)).status()).toBe(400);
    expect((await request.get(`/api/tailored/${revisionId}/resume?format=zip`)).status()).toBe(400);
  });

  test('TC-TAILOR-E2E-DL-03 미리보기: 서류 안의 script는 실행되지 않고 폭 1024·1240·1440에서 넘치지 않는다', async ({ page }) => {
    const csp: string[] = [];
    page.on('response', (r) => {
      const h = r.headers()['content-security-policy'];
      if (h && r.url().includes('/api/tailored/')) csp.push(h);
    });
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/api/tailored/${revisionId}/resume?format=html&inline=1`);
      await expect(page.locator('section.sec').first()).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
      await expect(page.locator('body')).toContainText('<script>window.__pwned = 1</script>');
      expect(await noOverflow(page), `폭 ${width}`).toBe(true);
      expect(await page.locator('body').evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');
      // 화면 미리보기에는 좌우 여백이 있다(글자가 창 가장자리에 붙지 않는다)
      expect(await page.locator('body').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(16);
    }
    expect(csp.length).toBeGreaterThan(0);
    expect(csp[0]).toContain("default-src 'none'");
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('긴 프로필 이름이 맞춤 이력서 탭에서 잘리거나 넘치지 않는다', async ({ page }) => {
    await page.goto(`/postings/${postingId}?tab=tailored`);
    await openFixBox(page);
    await expect(page.getByTestId('profile-line')).toContainText(LONG_PROFILE.slice(0, 6));
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `폭 ${width}`).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
