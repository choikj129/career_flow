// 분석한 공고 목록, 실패한 공고 상세, 다시 분석·이전 분석, 본문 다시 붙여넣기. 시드 공고 id: 4 모빌페이 플랫폼, 5 스텔라랩스, 6 루미에듀, 8 추출 실패, 9 로그인 실패.
import { expect, test } from '@playwright/test';
import { setFake, toast, waitAnalyzed } from './helpers';

test.beforeEach(() => setFake('seeded', {}));

test.describe('분석한 공고', () => {
  test('TC-ANALYZED-01 열과 행: 회사·포지션·사이트·적합도·마감일·분석일', async ({ page }) => {
    await page.goto('/postings/analyzed');
    await expect(page.getByRole('heading', { name: '분석한 공고' })).toBeVisible();
    for (const h of ['회사', '포지션', '사이트', '적합도', '마감일', '분석일']) {
      await expect(page.getByRole('columnheader', { name: h })).toBeVisible();
    }
    const stella = page.getByRole('row', { name: /스텔라랩스/ });
    await expect(stella).toContainText('Backend Engineer');
    await expect(stella).toContainText('71');
    await expect(stella).toContainText('상시');
    // 지원한 공고(모빌페이 서버 개발자)는 목록에 없다
    await expect(page.getByRole('row', { name: /서버 개발자 \(결제\)/ })).toHaveCount(0);
  });

  test('TC-ANALYZED-02 마감이 지난 공고는 흐리게 + "마감"', async ({ page }) => {
    await page.goto('/postings/analyzed');
    const row = page.locator('tr.row-link').filter({ hasText: '루미에듀' });
    await expect(row).toHaveClass(/dim/);
    await expect(row).toContainText('2026-11-10 마감');
    const future = page.locator('tr.row-link').filter({ hasText: '플랫폼 엔지니어' });
    await expect(future).not.toHaveClass(/dim/);
    await expect(future).toContainText('2026-12-10');
    await expect(future).not.toContainText('마감');
  });

  test('TC-ANALYZED-03 분석 실패 공고는 "분석 실패"/"실패"로 표시되고 행을 누르면 상세로', async ({ page }) => {
    await page.goto('/postings/analyzed');
    const failed = page.locator('tr.row-link').filter({ hasText: '분석 실패' });
    expect(await failed.count()).toBeGreaterThanOrEqual(2);
    await expect(failed.first()).toContainText('실패');
    await failed.first().click();
    await expect(page).toHaveURL(/\/postings\/\d+$/);
    await expect(page.locator('.fail-card')).toBeVisible();
  });

  test('TC-ANALYZED-04 행을 누르면 공고 상세로 이동', async ({ page }) => {
    await page.goto('/postings/analyzed');
    await page.locator('tr.row-link').filter({ hasText: '스텔라랩스' }).click();
    await expect(page).toHaveURL(/\/postings\/5$/);
  });
});

test.describe('공고 상세: 실패 표시', () => {
  test('TC-DETAIL-11 본문 추출 실패(원티드): 안내, 로그인 링크, 붙여넣기 입력창, 탭의 "!" 표시', async ({ page }) => {
    await page.goto('/postings/8');
    const card = page.locator('.fail-card');
    await expect(card).toContainText('공고 본문을 읽지 못했습니다. 공고 페이지 내용을 복사해 붙여넣어 주세요.');
    await expect(card.getByRole('link', { name: '설정 → 사이트 로그인' })).toHaveAttribute('href', '/settings');
    await expect(card.getByLabel('공고 본문')).toBeVisible();
    await expect(card.getByRole('button', { name: '이 내용으로 분석' })).toBeDisabled(); // 빈 입력
    await expect(page.getByRole('tab', { name: /분석/ }).locator('.dot-flag')).toHaveText('!');
  });

  test('TC-DETAIL-12 로그인 안 됨 실패 공고: 안내 문구와 [다시 시도]', async ({ page }) => {
    await page.goto('/postings/9');
    await expect(page.locator('.fail-card')).toContainText('Claude Code 로그인이 필요합니다');
    await expect(page.locator('.fail-card').getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  test('TC-DETAIL-13 존재하지 않는 공고 id는 없음 페이지', async ({ page }) => {
    await page.goto('/postings/99999');
    await expect(page.getByText('This page could not be found.')).toBeVisible();
    await page.goto('/postings/abc');
    await expect(page.getByText('This page could not be found.')).toBeVisible();
  });
});

test.describe('공고 상세: 분석 탭', () => {
  test('TC-ANALYZED-05 시드 분석 결과: 점수, 항목별, 잘 맞는 점, 부족한 점 두 묶음, 요약', async ({ page }) => {
    await page.goto('/postings/4');
    await expect(page.locator('.score')).toContainText('81');
    await expect(page.getByText('기본 이력서 v2 기준')).toBeVisible();
    for (const t of ['필수 요건', '우대 사항', '경력 연차', '기술 스택', '도메인', '희망 조건']) {
      await expect(page.locator('.breakdown').getByText(t, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: '잘 맞는 점' })).toBeVisible();
    await expect(page.getByText('이력서에서 보완 가능')).toBeVisible();
    await expect(page.getByText('실제로 부족')).toBeVisible();
    await expect(page.getByRole('heading', { name: '공고 요약' })).toBeVisible();
    await expect(page.getByText('3년 이상').first()).toBeVisible();
    await expect(page.getByText('마감 2026-12-10')).toBeVisible();
  });

  test('TC-ANALYZED-06 점수가 낮은 공고는 "희망 조건과 다른 점"이 보인다', async ({ page }) => {
    await page.goto('/postings/6'); // 점수 69 < 75
    await expect(page.getByRole('heading', { name: '희망 조건과 다른 점' })).toBeVisible();
    await page.goto('/postings/4'); // 점수 81
    await expect(page.getByRole('heading', { name: '희망 조건과 다른 점' })).toHaveCount(0);
  });

  test('TC-DETAIL-14 탭 이동은 주소 ?tab= 에 남는다', async ({ page }) => {
    await page.goto('/postings/4');
    await page.getByRole('tab', { name: '공고 원문' }).click();
    await expect(page).toHaveURL(/tab=raw/);
    await page.getByRole('tab', { name: '지원 기록' }).click();
    await expect(page).toHaveURL(/tab=record/);
    await page.goto('/postings/4?tab=raw');
    await expect(page.getByRole('tab', { name: '공고 원문' })).toHaveAttribute('aria-selected', 'true');
    await page.goto('/postings/4?tab=nonsense');
    await expect(page.getByRole('tab', { name: '분석' }).first()).toHaveAttribute('aria-selected', 'true');
  });

  test('TC-DETAIL-15 지원 전 공고: 지원 기록 탭 안내', async ({ page }) => {
    await page.goto('/postings/4?tab=record');
    await expect(page.getByRole('heading', { name: '아직 지원하지 않은 공고입니다.' })).toBeVisible();
    await expect(page.getByRole('button', { name: '지원 완료' })).toHaveCount(2); // 상단 + 탭 안
  });

  test('TC-DETAIL-16 다시 분석: 이전 결과가 기록에 남고 읽기 전용으로 볼 수 있다', async ({ page }) => {
    await page.goto('/postings/5');
    await expect(page.locator('ul.history li')).toHaveCount(1);
    await page.getByRole('button', { name: '다시 분석' }).click();
    await toast(page, '분석을 시작했습니다');
    await expect(page.locator('ul.history li')).toHaveCount(2);
    await expect(page.locator('.score')).toContainText('80'); // 가짜 claude 기본 점수
    // 오래된 분석(71점) 보기
    await page.locator('ul.history li a').click();
    await expect(page.getByText('이전 분석 결과입니다(읽기 전용).')).toBeVisible();
    await expect(page.locator('.score')).toContainText('71');
    await page.getByRole('link', { name: '최신 결과 보기' }).click();
    await expect(page.locator('.score')).toContainText('80');
  });

  test('TC-DETAIL-17 분석 중에는 [다시 분석]이 비활성', async ({ page }) => {
    setFake('seeded', { delayMs: 5000 });
    await page.goto('/postings/4');
    await page.getByRole('button', { name: '다시 분석' }).click();
    await expect(page.getByRole('button', { name: '다시 분석' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: '분석 중' })).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 분석' })).toBeEnabled({ timeout: 30_000 });
  });

  test('TC-DETAIL-18 [본문 다시 붙여넣기]: 본문이 바뀌고 다시 분석된다', async ({ page }) => {
    await page.goto('/postings/6?tab=raw');
    await page.getByText('본문 다시 붙여넣기').click();
    await page.getByLabel('공고 본문').fill('회사명: 루미에듀\n포지션: API 개발자\n마감: 2026-11-10\n새로 붙여넣은 본문입니다.');
    await page.getByRole('button', { name: '이 내용으로 다시 분석' }).click();
    await toast(page, '분석을 시작했습니다');
    await expect(page.locator('.rawtext')).toContainText('새로 붙여넣은 본문입니다.');
    await expect(page.getByText(/직접 붙여넣음/)).toBeVisible();
    await page.getByRole('tab', { name: '분석' }).first().click();
    await waitAnalyzed(page);
  });

  test('TC-DETAIL-19 공고 원문 탭: 링크 없는 공고는 "링크 없음", 원본 링크는 새 탭 속성', async ({ page }) => {
    await page.goto('/postings/3?tab=raw'); // 지인 추천(링크 없음)
    await expect(page.getByText(/링크 없음/)).toBeVisible();
    await expect(page.getByRole('link', { name: /원본 공고 열기/ })).toHaveCount(0);
    await page.goto('/postings/4?tab=raw');
    const link = page.getByRole('link', { name: /원본 공고 열기/ });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});
