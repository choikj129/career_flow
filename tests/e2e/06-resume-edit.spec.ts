// 기본 이력서(저장된 상태): 편집·저장·버전·희망 조건·이탈 확인. 시드는 v2까지 있다.
import { expect, test } from '@playwright/test';
import { setFake, toast } from './helpers';

test.beforeEach(() => setFake('seeded', {}));

const versionCount = async (page: import('@playwright/test').Page) => {
  await page.getByRole('tab', { name: '버전 기록' }).click();
  return page.locator('.vlist button').count();
};

test.describe.serial('기본 이력서 편집', () => {
  test('TC-RESUME-01 현재 버전 표시와 세 구역(이력서·버전 기록·희망 조건)', async ({ page }) => {
    await page.goto('/resume');
    await expect(page.getByRole('heading', { name: '기본 이력서' })).toBeVisible();
    await expect(page.locator('.ver')).toContainText('v2');
    for (const t of ['이력서', '버전 기록', '희망 조건']) {
      await expect(page.getByRole('tab', { name: t })).toBeVisible();
    }
    await expect(page.getByLabel('한 줄 소개')).toHaveValue(/Kafka 파이프라인/);
  });

  test('TC-RESUME-02 같은 내용으로 저장하면 버전이 늘지 않고 "바뀐 내용이 없습니다"', async ({ page }) => {
    await page.goto('/resume');
    expect(await versionCount(page)).toBe(2);
    await page.getByRole('tab', { name: '이력서' }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await toast(page, '바뀐 내용이 없습니다');
    await page.reload();
    expect(await versionCount(page)).toBe(2);
    await expect(page.locator('.ver')).toContainText('v2');
  });

  test('TC-RESUME-03 YYYY-MM이 아닌 기간은 저장 오류 문구, 버전은 그대로', async ({ page }) => {
    await page.goto('/resume');
    await page.getByLabel('시작 (YYYY-MM)').fill('2021/03');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '경력 1번째' })).toContainText('YYYY-MM 형식이어야 합니다');
    await page.getByLabel('시작 (YYYY-MM)').fill('2021-03'); // 되돌림
    await expect(page.locator('.ver')).toContainText('v2');
  });

  test('TC-RESUME-04 저장하지 않은 변경이 있으면 앱 안 링크로 떠날 때 확인 창', async ({ page }) => {
    await page.goto('/resume');
    await page.getByLabel('한 줄 소개').fill('바뀐 소개');
    await expect(page.getByText('저장하지 않은 변경이 있습니다')).toBeVisible();
    await page.getByRole('link', { name: '공고 등록' }).click();
    const dlg = page.getByRole('dialog', { name: '저장하지 않고 나갈까요?' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: '취소' }).click();
    await expect(page).toHaveURL(/\/resume/);
    await expect(page.getByLabel('한 줄 소개')).toHaveValue('바뀐 소개'); // 내용 유지
    await page.getByRole('link', { name: '공고 등록' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '나가기' }).click();
    await expect(page).toHaveURL(/\/postings\/new/);
    await page.goto('/resume');
    await expect(page.getByLabel('한 줄 소개')).toHaveValue(/Kafka 파이프라인/); // 저장 안 한 변경은 버려졌다
  });

  test('TC-RESUME-05 내용을 고치고 변경 메모와 함께 저장 → v3', async ({ page }) => {
    await page.goto('/resume');
    await page.getByLabel('한 줄 소개').fill('결제 도메인 백엔드 개발자, 정산 플랫폼 경험');
    await page.getByLabel('변경 메모').fill('소개 수정');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await toast(page, '이력서를 저장했습니다');
    await expect(page.locator('.ver')).toContainText('v3');
    await expect(page.locator('.ver')).toContainText('소개 수정');
    await page.getByRole('tab', { name: '버전 기록' }).click();
    await expect(page.locator('.vlist button').first()).toContainText('v3');
    await expect(page.locator('.vlist button').first()).toContainText('현재');
    await expect(page.locator('.vlist button').first()).toContainText('소개 수정');
  });

  test('TC-RESUME-06 성과 문장 추가·순서 이동·삭제', async ({ page }) => {
    await page.goto('/resume');
    const add = page.getByRole('button', { name: '+ 성과 추가' }).first();
    await add.click();
    await page.getByLabel('성과 2').fill('두 번째 성과');
    await page.getByLabel('성과 2').locator('xpath=following-sibling::span').getByLabel('위로').click();
    await expect(page.getByLabel('성과 1')).toHaveValue('두 번째 성과');
    await page.getByLabel('성과 1').locator('xpath=following-sibling::span').getByLabel('삭제').click();
    await expect(page.getByLabel('성과 1')).toHaveValue('정산 배치 처리 시간 단축');
    await expect(page.getByLabel('성과 2')).toHaveCount(0);
  });

  test('TC-RESUME-07 경력 추가·삭제, 재직 중 체크는 종료일 칸을 막는다', async ({ page }) => {
    await page.goto('/resume');
    await page.getByRole('button', { name: '+ 경력 추가' }).click();
    await expect(page.locator('.item')).toHaveCount(2);
    const added = page.locator('.item').last();
    await added.getByLabel('재직 중').uncheck();
    await expect(added.getByLabel('종료')).toBeEnabled();
    await added.getByLabel('재직 중').check();
    await expect(added.getByLabel('종료')).toBeDisabled();
    await added.getByLabel('삭제').first().click();
    await expect(page.locator('.item')).toHaveCount(1);
  });

  test('TC-RESUME-08 버전 기록: 이전 버전을 읽기 전용으로 본다', async ({ page }) => {
    await page.goto('/resume');
    await page.getByRole('tab', { name: '버전 기록' }).click();
    await page.locator('.vlist button', { hasText: 'v1' }).click();
    await expect(page.getByRole('heading', { name: /v1.*읽기 전용/ })).toBeVisible();
    await expect(page.locator('.subpanel.on').getByText('결제 도메인 백엔드 개발자', { exact: true })).toBeVisible();
  });

  test('TC-RESUME-09 기본 이력서가 새 버전이면 이전 분석 화면에 안내', async ({ page }) => {
    await page.goto('/postings/4');
    await expect(page.getByText('기본 이력서가 v3로 바뀌었습니다. 다시 분석하면 반영됩니다')).toBeVisible();
    await expect(page.getByText('기본 이력서 v2 기준')).toBeVisible();
  });

  test('TC-RESUME-10 새 분석은 최신 버전(v3)을 기준으로 한다', async ({ page }) => {
    await page.goto('/postings/4');
    await page.getByRole('button', { name: '다시 분석' }).first().click();
    await expect(page.getByText('기본 이력서 v3 기준')).toBeVisible();
    await expect(page.getByText('기본 이력서가 v3로 바뀌었습니다')).toHaveCount(0);
  });
});

test.describe.serial('희망 조건', () => {
  test('TC-RESUME-11 희망 조건 저장은 이력서 버전과 따로, 새로고침 후에도 유지', async ({ page }) => {
    await page.goto('/resume');
    await page.getByRole('tab', { name: '희망 조건' }).click();
    await page.getByLabel('최소 연봉(만원)').fill('6000');
    await page.getByLabel('최대 연봉(만원)').fill('8000');
    await page.getByLabel('근무 지역').fill('판교');
    await page.getByLabel('근무 지역').press('Enter');
    await page.getByLabel('원격').check();
    await page.getByLabel('스타트업').check();
    await page.getByLabel('기타 메모').fill('주 4일 가능하면 완화');
    await page.getByRole('button', { name: '희망 조건 저장' }).click();
    await toast(page, '희망 조건을 저장했습니다');
    await page.reload();
    await page.getByRole('tab', { name: '희망 조건' }).click();
    await expect(page.getByLabel('최소 연봉(만원)')).toHaveValue('6000');
    await expect(page.getByLabel('최대 연봉(만원)')).toHaveValue('8000');
    await expect(page.locator('.tagin .chip', { hasText: '판교' })).toBeVisible();
    await expect(page.getByLabel('원격')).toBeChecked();
    await expect(page.getByLabel('스타트업')).toBeChecked();
    await expect(page.getByLabel('기타 메모')).toHaveValue('주 4일 가능하면 완화');
    await expect(page.locator('.ver')).toContainText('v3'); // 이력서 버전은 그대로
  });

  test('TC-RESUME-12 지역 태그 삭제', async ({ page }) => {
    await page.goto('/resume');
    await page.getByRole('tab', { name: '희망 조건' }).click();
    await page.getByLabel('판교 삭제').click();
    await expect(page.locator('.tagin .chip', { hasText: '판교' })).toHaveCount(0);
  });
});
