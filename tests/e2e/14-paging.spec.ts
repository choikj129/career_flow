// 대시보드 페이지 나누기: 전체 보기 50건씩, 묶음 보기는 접힘 + 20건 + 더 보기. TC-PAGE-E2E-01~04
import { expect, test, type Page } from '@playwright/test';
import { setFake } from './helpers';

test.beforeEach(() => setFake('seeded', {}));
test.afterAll(() => setFake('seeded', {}));

const COUNT = 55;
const Q = encodeURIComponent('페이징');

/** 가져오기(가짜 claude)로 55건을 한 번에 만든다. 시드가 적어서 테스트 안에서 만든다. */
async function seedMany(page: Page) {
  const text = Array.from({ length: COUNT }, (_, i) => `페이징${String(i).padStart(2, '0')},Backend,wanted,2025-05-${String((i % 28) + 1).padStart(2, '0')},applied`).join('\n');
  await page.goto('/import');
  await page.getByLabel('원티드', { exact: true }).check();
  await page.getByLabel('텍스트', { exact: true }).fill(text);
  await page.getByRole('button', { name: '추출하기' }).click();
  await page.waitForURL(/\/import\?job=\d+/);
  await page.getByRole('button', { name: `${COUNT}건 등록` }).click();
  await page.waitForURL(/notice=/);
}

test.describe.serial('지원 기록 페이지 나누기', () => {
  test('TC-PAGE-E2E-01 전체 보기: 50건씩, 다음 페이지로 이동', async ({ page }) => {
    await seedMany(page);
    await page.goto(`/?q=${Q}`);
    await expect(page.getByTestId('pager')).toContainText(`전체 ${COUNT}건 중 1–50`);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(50);
    await page.getByRole('link', { name: '다음' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('pager')).toContainText(`전체 ${COUNT}건 중 51–${COUNT}`);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(COUNT - 50);
  });

  test('TC-PAGE-E2E-02 범위를 벗어난 page는 마지막 페이지로', async ({ page }) => {
    await page.goto(`/?q=${Q}&page=99`);
    await expect(page.getByTestId('pager')).toContainText(`51–${COUNT}`);
  });

  test('TC-PAGE-E2E-03 필터를 바꾸면 1페이지로', async ({ page }) => {
    await page.goto(`/?q=${Q}&page=2`);
    await page.getByLabel('사이트', { exact: true }).selectOption('wanted');
    await expect(page).toHaveURL(/site=wanted/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByTestId('pager')).toContainText('1–50');
  });

  test('TC-PAGE-E2E-04 사이트별 보기: 기본 접힘, 펼치면 20건과 더 보기', async ({ page }) => {
    await page.goto(`/?view=site&q=${Q}`);
    const group = page.locator('.group').first();
    await expect(group).toHaveAttribute('data-open', 'false');
    await expect(group.locator('.group-head')).toContainText(String(COUNT));
    await group.locator('.group-head').click();
    await expect(group.locator('tbody tr.row-link')).toHaveCount(20);
    await group.getByRole('link', { name: `${COUNT - 20}건 더 보기` }).click();
    await expect(page).toHaveURL(/more=site/);
    await expect(page.locator('.group').first().locator('tbody tr.row-link')).toHaveCount(COUNT);
  });

  test('TC-PAGE-E2E-05 날짜 칸은 YYYY-MM-DD 텍스트 + 달력 버튼, "()"가 보이지 않는다', async ({ page }) => {
    await page.goto('/import');
    await page.getByLabel('원티드', { exact: true }).check();
    await page.getByRole('button', { name: '표에 직접 입력' }).click();
    await page.waitForURL(/manual=1/);
    const date = page.locator('table.review tbody tr').first().getByLabel('지원일');
    await date.fill('20261120'); // 숫자만 쳐도 하이픈이 들어간다
    await expect(date).toHaveValue('2026-11-20');
    const shown = await date.inputValue();
    expect(shown).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(shown).not.toContain('(');
    await expect(date).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: '달력 열기' }).first()).toBeVisible();
    // 숨긴 달력 입력은 탭 순서에 없다
    await expect(page.locator('input.date-input-picker').first()).toHaveAttribute('tabindex', '-1');
    // 잘못된 날짜는 표시되고 등록을 막는다
    await date.fill('20261345');
    await expect(date).toHaveValue('2026-13-45');
    await expect(page.getByText(/지원일.*필요/)).toBeVisible();
  });
});
