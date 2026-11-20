// 통계 화면 /stats: 카드·그래프·전환·필터·빈 상태·표본 표시·대시보드 연결. TC-STATS-E2E-01~07
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';

const docsDir = join(dataDir('seeded'), 'documents');
const put = (kind: string, name: string) => {
  mkdirSync(join(docsDir, kind), { recursive: true });
  writeFileSync(join(docsDir, kind, name), '%PDF-1.4 fake');
};

/** 가져오기 직접 입력 표로 지난 기록(지원 상태, 아주 오래전 지원일 → 무응답)을 n건 만든다. */
async function addPastRows(page: Page, company: string, n: number, appliedAt: string) {
  await page.goto('/import');
  await page.getByLabel('기타', { exact: true }).check();
  await page.getByRole('button', { name: '표에 직접 입력' }).click();
  await page.waitForURL(/manual=1/);
  const rows = page.locator('table.review tbody tr');
  for (let i = 0; i < n; i++) {
    if (i > 0) await page.getByRole('button', { name: '+ 행 추가' }).click();
    const r = rows.nth(i);
    await r.getByLabel('회사').fill(`${company}${i}`);
    await r.getByLabel('포지션').fill(`통계 포지션 ${i}`);
    await r.getByLabel('지원일').fill(appliedAt);
  }
  await page.getByRole('button', { name: `${n}건 등록` }).click();
  await page.waitForURL(/notice=/);
}

test.describe.serial('통계 화면', () => {
  test('TC-STATS-E2E-01 내비 "통계" → /stats, 카드 6개와 그래프, 표로 보기', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '통계', exact: true }).click();
    await page.waitForURL(/\/stats$/);
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: '기간별 지원과 결과' })).toBeVisible();
    await page.getByText('표로 보기').click();
    await expect(page.getByTestId('stats-periods-table').locator('tbody tr').first()).toBeVisible();
  });

  test('TC-STATS-E2E-02 [연별]·[비율] 전환은 주소에 남는다', async ({ page }) => {
    await page.goto('/stats');
    await page.getByRole('link', { name: '연별' }).click();
    await expect(page).toHaveURL(/unit=year/);
    await page.getByText('표로 보기').click();
    await expect(page.getByTestId('stats-periods-table').locator('thead th').first()).toHaveText('연');
    await page.getByRole('link', { name: '비율' }).click();
    await expect(page).toHaveURL(/mode=ratio/);
  });

  test('TC-STATS-E2E-03 사이트 필터: 카드 지원 수가 대시보드와 같고 사이트별은 한 줄', async ({ page }) => {
    await page.goto('/?site=wanted');
    const foot = await page.locator('.table-foot').innerText();
    const n = /전체 (\d+)건/.exec(foot)![1];
    await page.goto('/stats?site=wanted');
    await expect(page.getByTestId('card-total').locator('.stat-big')).toHaveText(n);
    await expect(page.getByTestId('stats-sites').locator('[data-testid^="hbar-"]')).toHaveCount(1);
    await expect(page.getByText('사이트 필터 적용 중')).toBeVisible();
  });

  test('TC-STATS-E2E-04 필터 결과 0건이면 안내와 [필터 지우기]', async ({ page }) => {
    await page.goto('/stats?period=custom&from=1999-01-01&to=1999-01-31');
    await expect(page.getByText('이 기간·사이트에 지원 기록이 없습니다.')).toBeVisible();
    await page.getByRole('link', { name: '필터 지우기' }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(6);
  });

  test('TC-STATS-E2E-05 [경력기술서]를 누르면 doc=career, 묶음 라벨이 경력기술서', async ({ page }) => {
    put('career', '경력기술서_20240101.pdf');
    await addPastRows(page, '경력통계', 1, '2024-02-01');
    await page.goto('/stats');
    await page.getByRole('link', { name: '경력기술서' }).click();
    await expect(page).toHaveURL(/doc=career/);
    await expect(page.getByTestId('stats-docs')).toContainText('경력기술서 2024-01-01');
  });

  test('TC-STATS-E2E-06 표본: 분모 3은 "표본 부족 (n=3)", 분모 8은 "표본 적음"', async ({ page }) => {
    put('portfolio', '포트폴리오_20250101.pdf');
    put('portfolio', '포트폴리오_20250201.pdf');
    await addPastRows(page, '표본셋', 3, '2025-01-15'); // 포트폴리오_20250101 선택
    await addPastRows(page, '표본여덟', 8, '2025-02-15'); // 포트폴리오_20250201 선택
    await page.goto('/stats?doc=portfolio');
    const docs = page.getByTestId('stats-docs');
    await expect(docs.getByTestId('hbar-doc:포트폴리오_20250101.pdf')).toContainText('표본 부족 (n=3)');
    await expect(docs.getByTestId('hbar-doc:포트폴리오_20250201.pdf')).toContainText('표본 적음');
  });

  test('TC-STATS-E2E-07 대시보드 "통계 보기 →"와 묶음 머리 통과율', async ({ page }) => {
    await page.goto('/?view=site&site=wanted&period=1y');
    await page.getByRole('link', { name: '통계 보기 →' }).click();
    await expect(page).toHaveURL(/\/stats\?period=1y&site=wanted$/);
    await page.goto('/?view=site');
    await expect(page.getByText('서류 통과').first()).toBeVisible();
  });
});
