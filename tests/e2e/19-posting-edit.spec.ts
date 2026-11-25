// 공고 등록 때 회사·포지션 직접 입력, 상세 [수정], 분석한 공고 목록 [삭제]. 가상 이름만 쓴다.
import { expect, test, type Page } from '@playwright/test';
import { setFake, toast, waitAnalyzed } from './helpers';

test.beforeEach(() => setFake('seeded', {}));

const BODY = (tag: string) =>
  `회사명: AI가만든회사${tag}\n포지션: AI가만든포지션${tag}\n주요업무\n- 결제 서버 개발\n자격요건\n- Java 3년 이상`;

async function registerWith(page: Page, tag: string, company: string, position: string): Promise<number> {
  await page.goto('/postings/new');
  await page.getByLabel(/회사명/).fill(company);
  await page.getByLabel(/^포지션/).fill(position);
  await page.getByText('링크로 안 열리면 공고 본문 붙여넣기').click();
  await page.getByPlaceholder(/공고 페이지에서 본문을 복사해/).fill(BODY(tag));
  await page.getByRole('button', { name: '등록하고 분석' }).click();
  await page.waitForURL(/\/postings\/\d+/);
  return Number(/\/postings\/(\d+)/.exec(page.url())![1]);
}

test.describe('공고 회사·포지션 직접 입력', () => {
  test('TC-PE-09 등록 폼에 선택 입력 두 칸이 있다', async ({ page }) => {
    await page.goto('/postings/new');
    await expect(page.locator('#companyName')).toBeVisible();
    await expect(page.locator('#positionTitle')).toBeVisible();
    await expect(page.getByRole('button', { name: '등록하고 분석' })).toBeDisabled();
  });

  test('TC-PE-10 직접 넣은 회사·포지션은 분석이 끝나도 바뀌지 않는다', async ({ page }) => {
    await registerWith(page, 'A', '내가쓴가상회사', '내가쓴 가상 포지션');
    await waitAnalyzed(page);
    await expect(page.locator('.p-co')).toContainText('내가쓴가상회사');
    await expect(page.getByRole('heading', { name: '내가쓴 가상 포지션' })).toBeVisible();
  });

  test('TC-PE-11 상세 [수정]으로 회사명·포지션을 고친다', async ({ page }) => {
    await registerWith(page, 'B', '고치기전회사', '고치기전 포지션');
    await waitAnalyzed(page);
    await page.locator('.p-co').getByRole('button', { name: '수정', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('회사명').fill('고친뒤가상회사');
    await dialog.getByLabel('포지션').fill('고친뒤 포지션');
    await dialog.getByRole('button', { name: '저장' }).click();
    await toast(page, '공고 정보를 고쳤습니다');
    await expect(page.locator('.p-co')).toContainText('고친뒤가상회사');
    await expect(page.getByRole('heading', { name: '고친뒤 포지션' })).toBeVisible();
  });

  test('TC-PE-12 [수정] 창은 빈 칸이면 저장할 수 없다', async ({ page }) => {
    await page.goto('/postings/5');
    await page.locator('.p-co').getByRole('button', { name: '수정', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('회사명').fill('  ');
    await expect(dialog.getByRole('button', { name: '저장' })).toBeDisabled();
    await dialog.getByLabel('회사명').fill('스텔라랩스');
    await dialog.getByLabel('포지션').fill('');
    await expect(dialog.getByRole('button', { name: '저장' })).toBeDisabled();
  });
});

test.describe('분석한 공고 목록 삭제', () => {
  test('TC-PE-13 [삭제]는 확인 후 목록에 머물고, 줄 이동은 일어나지 않는다', async ({ page }) => {
    await registerWith(page, 'C', '지울가상회사', '지울 포지션');
    await waitAnalyzed(page);
    await page.goto('/postings/analyzed');
    const row = page.locator('tr.row-link').filter({ hasText: '지울가상회사' });
    await row.getByRole('button', { name: /삭제/ }).click();
    await expect(page).toHaveURL(/\/postings\/analyzed$/);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('이 공고와 분석 결과를 삭제합니다. 되돌릴 수 없습니다.');
    // 창 바깥(overlay)을 눌러 닫아도 줄 이동이 없다
    await page.mouse.click(5, 5);
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/postings\/analyzed$/);
    await row.getByRole('button', { name: /삭제/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await toast(page, '공고를 삭제했습니다');
    await expect(page).toHaveURL(/\/postings\/analyzed$/);
    await expect(page.locator('tr.row-link').filter({ hasText: '지울가상회사' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '분석한 공고' })).toBeVisible();
  });

  for (const width of [1024, 1240, 1440]) {
    test(`TC-PE-14 폭 ${width}: 등록 폼·목록·수정 창이 넘치지 않고 한글이 keep-all이다`, async ({ page }) => {
      const id = await registerWith(page, `W${width}`, `폭확인회사${width}`, '폭 확인 포지션');
      await waitAnalyzed(page);
      await page.setViewportSize({ width, height: 900 });
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      await page.goto('/postings/new');
      expect(await noOverflow()).toBe(true);
      expect(await page.locator('#companyName').evaluate((el) => getComputedStyle(el.closest('label') ?? document.body).wordBreak)).toBe('keep-all');
      await page.goto('/postings/analyzed');
      expect(await noOverflow()).toBe(true);
      const cell = page.locator('tr.row-link').filter({ hasText: `폭확인회사${width}` }).locator('td').first();
      expect(await cell.evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');
      await page.goto(`/postings/${id}`);
      await page.locator('.p-co').getByRole('button', { name: '수정', exact: true }).click();
      expect(await noOverflow()).toBe(true);
      const box = await page.getByRole('dialog').locator('.modal').boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await expect(page.getByRole('dialog').getByLabel('회사명')).toHaveValue(`폭확인회사${width}`);
    });
  }
});
