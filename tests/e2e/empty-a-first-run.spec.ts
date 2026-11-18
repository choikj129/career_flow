// 처음 실행(빈 DB, 기본 이력서 없음): 빈 상태 문구와 경고, 내비게이션, 작업 API.
import { expect, test } from '@playwright/test';
import { registerByPaste, setFake } from './helpers';

test.beforeEach(() => setFake('empty', {}));

test.describe.serial('처음 실행', () => {
  test('TC-COMMON-01 상단 내비게이션: 6개 링크, 현재 화면 강조, 로고는 대시보드로', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    for (const [name, href] of [
      ['대시보드', '/'],
      ['공고 등록', '/postings/new'],
      ['분석한 공고', '/postings/analyzed'],
      ['기본 이력서', '/resume'],
      ['가져오기', '/import'],
      ['설정', '/settings'],
    ] as const) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }
    await expect(nav.getByRole('link', { name: '대시보드' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/settings');
    await expect(nav.getByRole('link', { name: '설정' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: '대시보드' })).not.toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Career Flow' }).click();
    await expect(page).toHaveURL(/:3941\/$/);
    // 3~5단계 화면은 아직 없다
    await expect(nav.getByRole('link', { name: '사이트 반영' })).toHaveCount(0);
  });

  test('TC-DASH-23 지원 기록이 하나도 없을 때: 안내, [공고 등록], 가져오기 링크, 이력서 안내 줄', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '아직 지원 기록이 없습니다.' })).toBeVisible();
    await expect(page.locator('.empty-hint').getByRole('link', { name: '공고 등록' })).toHaveAttribute('href', '/postings/new');
    await expect(page.getByRole('link', { name: '이미 지원한 내역이 있다면 → 가져오기' })).toHaveAttribute('href', '/import');
    await expect(page.locator('.notice.warn')).toContainText('기본 이력서를 먼저 등록해야 공고를 분석할 수 있습니다');
    await expect(page.locator('.summary')).toHaveCount(0); // 기록이 없으면 요약 줄도 없다
  });

  test('TC-ANALYZED-07 분석한 공고가 없을 때 안내 문구', async ({ page }) => {
    await page.goto('/postings/analyzed');
    await expect(page.getByRole('heading', { name: '분석만 하고 지원하지 않은 공고가 없습니다.' })).toBeVisible();
  });

  test('TC-NEW-10 기본 이력서가 없으면 등록 화면에 경고(입력은 가능)', async ({ page }) => {
    await page.goto('/postings/new');
    await expect(page.locator('.notice.warn')).toContainText('기본 이력서가 없어 분석이 실패합니다. 먼저 등록하세요');
    await expect(page.getByRole('link', { name: '기본 이력서 등록' })).toHaveAttribute('href', '/resume');
    await page.locator('#url').fill('https://www.wanted.co.kr/wd/1');
    await expect(page.getByRole('button', { name: '등록하고 분석' })).toBeEnabled();
  });

  test('TC-NEW-11 기본 이력서 없이 등록하면 분석이 실패하고 이유를 보여 준다', async ({ page }) => {
    await registerByPaste(page, '회사명: 이력서없는회사\n주요업무\n- 개발');
    await expect(page.locator('.fail-card')).toContainText('기본 이력서를 먼저 등록하세요.');
    await expect(page.locator('.fail-card').getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  test('TC-COMMON-02 작업 API: 진행 중 작업 없음, 없는 작업은 404', async ({ page }) => {
    const active = await page.request.get('/api/jobs/active');
    expect(await active.json()).toMatchObject({ running: 0, queued: 0, href: null });
    expect((await page.request.get('/api/jobs/999999')).status()).toBe(404);
    expect((await page.request.get('/api/jobs/abc')).status()).toBe(404);
    await page.goto('/');
    await expect(page.locator('.job-ind')).toHaveCount(0);
  });

  test('TC-COMMON-03 지원 완료 단계: 분석 실패 공고는 [지원 완료]가 비활성(회사 미정)', async ({ page }) => {
    await page.goto('/postings/1');
    await expect(page.getByRole('button', { name: '지원 완료' })).toBeDisabled();
    await expect(page.getByText('분석이 끝난 뒤 누를 수 있습니다')).toBeVisible();
  });
});
