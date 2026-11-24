// 다시 분석 버튼: 분석 탭 점수 머리, 맞춤 이력서 탭 지원 서류 카드(옛 분석). 가짜 claude, 가상 데이터.
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { dataDir } from './paths';
import { fakeCalls, kitFixtureFiles, registerByPaste, setFake, uploadKit, waitAnalyzed } from './helpers';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => setFake('seeded', {}));

const POSTING = (name: string, extra: string[] = []) =>
  [`회사명: ${name}`, '포지션: 백엔드 서버 개발자', '적합도: 75', ...extra, '주요업무', '- 백엔드 API, 캐시, 성능, 트래픽 대응(가상 공고)'].join('\n');

let withRec = 0;
let oldRec = 0;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, locale: 'ko-KR' });
  setFake('seeded', {});
  expect((await uploadKit(page, kitFixtureFiles())).ok).toBe(true);
  withRec = await registerByPaste(page, POSTING('다시분석있음', ['맞춤추천: 50']));
  await waitAnalyzed(page);
  oldRec = await registerByPaste(page, POSTING('다시분석옛분석', ['맞춤추천: 50']));
  await waitAnalyzed(page);
  const db = new Database(join(dataDir('seeded'), 'career-flow.db'));
  try {
    db.prepare("update analyses set result = json_remove(result, '$.profileRecommendation.tailorRec') where posting_id = ?").run(oldRec);
  } finally {
    db.close();
  }
  await page.close();
});

test.describe('다시 분석 버튼 (TC-RA)', () => {
  test('TC-RA-01 분석 탭 점수 머리에 [다시 분석]이 있고 누르면 분석 작업이 큐에 들어간다', async ({ page }) => {
    await page.goto(`/postings/${withRec}`);
    const btn = page.getByTestId('score-action').getByRole('button', { name: '다시 분석' });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    const before = fakeCalls('seeded').filter((c) => c.kind === 'analyze_posting').length;
    await btn.click();
    await expect.poll(() => fakeCalls('seeded').filter((c) => c.kind === 'analyze_posting').length, { timeout: 30_000 }).toBe(before + 1);
    await waitAnalyzed(page);
    await expect(page.getByTestId('score-action').getByRole('button', { name: '다시 분석' })).toBeEnabled();
  });

  test('TC-RA-02 이전 분석을 볼 때는 점수 머리 버튼이 없다', async ({ page }) => {
    await page.goto(`/postings/${withRec}`);
    const old = page.locator('ul.history li a').first();
    await old.click();
    await expect(page.getByText('이전 분석 결과입니다')).toBeVisible();
    await expect(page.getByTestId('score-action')).toHaveCount(0);
  });

  test('TC-RA-03 옛 분석: 지원 서류 카드에 안내 줄과 [다시 분석]이 있다', async ({ page }) => {
    await page.goto(`/postings/${oldRec}?tab=tailored`);
    const line = page.getByTestId('tailor-rec-missing');
    await expect(line).toContainText('맞춤 이력서 추천도는 다시 분석하면 나옵니다');
    await expect(line.getByRole('button', { name: '다시 분석' })).toBeEnabled();
    await expect(page.getByTestId('tailor-rec-line')).toHaveCount(0);
  });

  test('TC-RA-04 추천도가 있으면 안내 줄이 없다', async ({ page }) => {
    await page.goto(`/postings/${withRec}?tab=tailored`);
    await expect(page.getByTestId('tailor-rec-line')).toBeVisible();
    await expect(page.getByTestId('tailor-rec-missing')).toHaveCount(0);
  });

  test('TC-RA-05 폭 1024·1240·1440에서 버튼과 안내가 한 줄, 가로 스크롤 없음, 한글 keep-all', async ({ page }) => {
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/postings/${oldRec}`);
      const top = page.getByTestId('score-action');
      await expect(top).toBeVisible();
      expect((await top.getByRole('button').boundingBox())!.height, `분석 탭 버튼 ${width}`).toBeLessThan(40);
      expect(await noOverflow(page), `분석 탭 가로 스크롤 ${width}`).toBe(true);

      await page.goto(`/postings/${oldRec}?tab=tailored`);
      const line = page.getByTestId('tailor-rec-missing');
      await expect(line).toBeVisible();
      expect((await line.boundingBox())!.height, `안내 줄 ${width}`).toBeLessThan(44);
      expect(await line.evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');
      expect(await noOverflow(page), `맞춤 탭 가로 스크롤 ${width}`).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
