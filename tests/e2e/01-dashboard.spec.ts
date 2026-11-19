// 대시보드: 검색, 필터, 보기 4종, 기록만 행 펼침·상태 변경. 시드 데이터 기준(scripts/seed-dev.ts).
import { expect, test, type Page } from '@playwright/test';
import { toast } from './helpers';

const rowOf = (page: Page, name: string | RegExp) => page.locator('tbody tr.row-link').filter({ hasText: name });

test.describe('대시보드', () => {
  test('TC-DASH-01 전체 보기: 요약 줄과 표 열, 총 건수', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '지원 기록' })).toBeVisible();
    await expect(page.getByText('이번 달 지원')).toBeVisible();
    await expect(page.getByText(/분석한 공고 \d+건 보기/)).toBeVisible();
    for (const h of ['회사', '포지션', '사이트', '지원일', '상태', '제출한 이력서', '적합도']) {
      await expect(page.getByRole('columnheader', { name: h })).toBeVisible();
    }
    await expect(page.getByText('총 11건')).toBeVisible();
    await expect(page.locator('tbody tr.row-link').first()).toContainText('코어뱅크'); // 지원일 최신순
  });

  test('TC-DASH-02 가져온 기록은 "기록만" 표시, 공고 있는 행은 없음', async ({ page }) => {
    await page.goto('/');
    await expect(rowOf(page, '토스').first().locator('.tag-rec')).toHaveText('기록만');
    await expect(rowOf(page, '한빛커머스').locator('.tag-rec')).toHaveCount(0);
  });

  test('TC-DASH-03 검색: 입력 즉시 필터링되고 주소 ?q= 에 남는다', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('회사·포지션 검색').fill('토스');
    await expect(page).toHaveURL(/q=/);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(2);
    await page.reload();
    await expect(page.getByLabel('회사·포지션 검색')).toHaveValue('토스');
    await expect(page.locator('tbody tr.row-link')).toHaveCount(2);
  });

  test('TC-DASH-04 검색: (주)·주식회사·띄어쓰기 차이를 무시', async ({ page }) => {
    for (const q of ['주식회사 토스뱅크', '토스 뱅크', '(주)토스뱅크']) {
      await page.goto(`/?q=${encodeURIComponent(q)}`);
      await expect(page.locator('tbody tr.row-link')).toHaveCount(1);
      await expect(rowOf(page, '토스뱅크')).toHaveCount(1);
    }
  });

  test('TC-DASH-05 검색: 법인명으로 찾는다', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('모빌리티페이먼츠')}`);
    await expect(rowOf(page, '모빌페이')).toHaveCount(1);
  });

  test('TC-DASH-06 검색: 포지션명으로 찾는다(대소문자 무시)', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('PLATFORM')}`);
    await expect(rowOf(page, '비바리퍼블리카')).toHaveCount(1);
  });

  test('TC-DASH-07 검색 결과 없음 문구', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('없는회사')}`);
    await expect(page.getByRole('heading', { name: "'없는회사'에 지원한 기록이 없습니다." })).toBeVisible();
  });

  test('TC-DASH-08 상태·사이트 필터와 조합', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('상태').selectOption('rejected');
    await expect(page).toHaveURL(/status=rejected/);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(2);
    await page.getByLabel('사이트').selectOption('remember');
    await expect(page.locator('tbody tr.row-link')).toHaveCount(1);
    await expect(rowOf(page, '토스뱅크')).toHaveCount(1);
  });

  test('TC-DASH-09 기간 필터: 이번 달, 직접 지정', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('기간').selectOption('month');
    await expect(page).toHaveURL(/period=month/);
    await page.goto('/?period=custom&from=2025-09-01&to=2025-10-31');
    await expect(page.getByLabel('시작일')).toHaveValue('2025-09-01');
    await expect(page.locator('tbody tr.row-link')).toHaveCount(2);
  });

  test('TC-DASH-10 보기 전환: 사이트별 묶음과 서류 통과율, 주소 ?view=', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: '사이트별' }).click();
    await expect(page).toHaveURL(/view=site/);
    const heads = page.locator('.group-head');
    await expect(heads.first()).toContainText('리멤버');
    await expect(heads.first()).toContainText('서류 통과');
    await expect(page.locator('.group').filter({ hasText: '기타' }).first().locator('.group-head')).toContainText('서류 통과 0 / '); // 통과 없음, 30일 넘은 '지원'은 무응답으로 분모에 든다(D-18)
    await page.reload();
    await expect(page.getByRole('tab', { name: '사이트별' })).toHaveAttribute('aria-selected', 'true');
  });

  test('TC-DASH-11 묶음 접기는 이 브라우저에 기억', async ({ page }) => {
    await page.goto('/?view=site');
    const first = page.locator('.group').first();
    await expect(first).toHaveAttribute('data-open', 'true');
    await first.locator('.group-head').click();
    await expect(first).toHaveAttribute('data-open', 'false');
    await page.reload();
    await expect(page.locator('.group').first()).toHaveAttribute('data-open', 'false');
  });

  test('TC-DASH-12 보기 전환: 상태별 보드 6열', async ({ page }) => {
    await page.goto('/?view=status');
    await expect(page.locator('.board .col')).toHaveCount(6);
    await expect(page.locator('.col-head').nth(2)).toContainText('과제·코딩테스트');
    await expect(page.locator('.col-head').nth(5)).toContainText('불합격·지원취소');
    await expect(page.locator('.col').nth(3).locator('.kcard')).toHaveCount(2); // 면접: 한빛커머스, 하이퍼셀
  });

  test('TC-DASH-13 상태별 보드: 카드를 끌면 상태 변경 창이 열리고 저장해야 바뀐다', async ({ page }) => {
    await page.goto('/?view=status');
    const card = page.locator('.kcard', { hasText: '코드웨이브' });
    await card.dragTo(page.locator('.col').nth(1));
    await expect(page.getByRole('dialog', { name: '상태 변경' })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('새 상태')).toHaveValue('document_passed');
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.locator('.col').nth(0).locator('.kcard', { hasText: '코드웨이브' })).toHaveCount(1);
  });

  test('TC-DASH-14 보기 전환: 이력서별 묶음, 제출 이력서 모름은 마지막', async ({ page }) => {
    await page.goto('/?view=resume');
    const heads = page.locator('.group-head');
    await expect(heads.first()).toContainText('기본 v1 기준');
    await expect(heads.first()).toContainText('기본 3, 맞춤 0');
    await expect(heads.last()).toContainText('제출 이력서 모름');
    await expect(heads.last()).toContainText('가져온 기록');
  });

  test('TC-DASH-15 검색은 모든 보기에 같이 적용', async ({ page }) => {
    await page.goto(`/?view=site&q=${encodeURIComponent('토스')}`);
    await expect(page.locator('.group tbody tr.row-link')).toHaveCount(2);
    await page.goto(`/?view=status&q=${encodeURIComponent('토스')}`);
    await expect(page.locator('.kcard')).toHaveCount(2);
  });

  test('TC-DASH-16 공고 있는 행을 누르면 공고 상세로 이동', async ({ page }) => {
    await page.goto('/');
    await rowOf(page, '한빛커머스').click();
    await expect(page).toHaveURL(/\/postings\/2$/);
  });

  test('TC-DASH-17 기록만 행: 펼침, 상태 변경 저장, 표에 반영', async ({ page }) => {
    await page.goto('/');
    await rowOf(page, '코어뱅크').click();
    const panel = page.locator('.rec-panel').first();
    await expect(panel.getByText('상태 이력')).toBeVisible();
    await panel.getByLabel('새 상태').selectOption('interview');
    await expect(panel.getByLabel('면접 차수')).toHaveValue('1');
    await panel.getByLabel('메모').first().fill('1차 화상 면접');
    await panel.getByRole('button', { name: '저장', exact: true }).click();
    await toast(page, '상태를 바꿨습니다');
    await expect(rowOf(page, '코어뱅크')).toContainText('면접 1차');
  });

  test('TC-DASH-18 기록만 행: 면접 차수 기본값은 기존 차수 + 1', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('하이퍼셀')}`);
    await rowOf(page, '하이퍼셀').click();
    const panel = page.locator('.rec-panel').first();
    await panel.getByLabel('새 상태').selectOption('interview');
    await expect(panel.getByLabel('면접 차수')).toHaveValue('2');
  });

  test('TC-DASH-19 요약 줄의 "분석한 공고 N건 보기" 링크', async ({ page }) => {
    await page.goto('/');
    await page.getByText(/분석한 공고 \d+건 보기/).click();
    await expect(page).toHaveURL(/\/postings\/analyzed/);
  });
});
