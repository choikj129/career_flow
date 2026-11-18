// 회사 연결 변경 창: 별칭 추가(검색에 반영), 다른 회사로 연결, 다른 회사와 합치기(D-04).
import { expect, test, type Page } from '@playwright/test';
import { setFake, toast } from './helpers';

test.beforeEach(() => setFake('seeded', {}));

async function openLink(page: Page, postingId: number) {
  await page.goto(`/postings/${postingId}`);
  await page.getByRole('button', { name: '회사 연결 변경' }).click();
  return page.getByRole('dialog', { name: '회사 연결 변경' });
}

test.describe.serial('회사 연결·별칭·합치기', () => {
  test('TC-DETAIL-20 별칭 추가 → 그 이름으로 대시보드 검색해도 나온다', async ({ page }) => {
    const dlg = await openLink(page, 1); // 모빌페이 서버 개발자(결제)
    await expect(dlg).toContainText('지금 연결: 모빌페이');
    await dlg.getByRole('button', { name: '별칭 추가', exact: true }).first().click();
    await expect(dlg.getByRole('button', { name: '별칭 추가' }).last()).toBeDisabled(); // 빈 별칭
    await dlg.getByLabel('별칭').fill('MobilPay');
    await dlg.getByRole('button', { name: '별칭 추가' }).last().click();
    await toast(page, '별칭을 추가했습니다');
    await page.goto('/?q=mobilpay');
    await expect(page.locator('tbody tr.row-link').filter({ hasText: '모빌페이' })).toHaveCount(1);
  });

  test('TC-DETAIL-21 다른 회사와 합치기: 확인 문구에 건수, 합친 뒤 지원 기록이 한 회사로 모인다', async ({ page }) => {
    // 모빌리티페이(공고 7)에 모빌페이(공고 여러 건 + 지원 1건)를 합친다. 이름이 비슷하지만 별개 회사로 들어간 경우
    const dlg = await openLink(page, 7);
    await expect(dlg).toContainText('지금 연결: 모빌리티페이');
    await dlg.getByLabel('회사 찾기').fill('모빌페이');
    const cand = dlg.locator('button.cand', { hasText: '모빌페이' });
    await expect(cand).toContainText(/공고 \d+건, 지원 기록 1건/);
    await cand.click();
    await expect(dlg).toContainText(/합칩니다\. 공고 \d+건, 지원 기록 1건/);
    await dlg.getByRole('button', { name: '합치기', exact: true }).click();
    await toast(page, '회사를 합쳤습니다');
    // 합친 뒤: 모빌페이 공고는 모빌리티페이 아래로, 중복 경고가 이어진다
    await page.goto('/postings/4');
    await expect(page.locator('.p-co')).toContainText('모빌리티페이');
    await expect(page.locator('.dup')).toContainText('이 회사에 지원한 기록이 1건 있습니다.');
    // 옛 이름은 별칭으로 남아 검색된다
    await page.goto(`/?q=${encodeURIComponent('모빌페이')}`);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(1);
    await expect(page.locator('tbody tr.row-link')).toContainText('모빌리티페이');
  });

  test('TC-DETAIL-22 자기 자신은 합치기 후보에 나오지 않는다', async ({ page }) => {
    const dlg = await openLink(page, 7);
    await dlg.getByLabel('회사 찾기').fill('모빌리티페이');
    await expect(dlg.getByText('찾은 회사가 없습니다.')).toBeVisible();
  });

  test('TC-DETAIL-23 다른 회사로 연결(이 공고만)', async ({ page }) => {
    const dlg = await openLink(page, 5); // 스텔라랩스 공고
    await dlg.getByRole('button', { name: '다른 회사로 연결' }).click();
    await dlg.getByLabel('회사 찾기').fill('루미에듀');
    await dlg.locator('button.cand', { hasText: '루미에듀' }).click();
    await expect(dlg).toContainText('이 공고를 루미에듀 회사에 연결합니다.');
    await dlg.getByRole('button', { name: '연결 바꾸기' }).click();
    await toast(page, '회사 연결을 바꿨습니다');
    await expect(page.locator('.p-co')).toContainText('루미에듀');
  });

  test('TC-DETAIL-24 후보가 선택되기 전에는 [합치기]가 비활성', async ({ page }) => {
    const dlg = await openLink(page, 6);
    await expect(dlg.getByRole('button', { name: '합치기', exact: true })).toBeDisabled();
  });
});
