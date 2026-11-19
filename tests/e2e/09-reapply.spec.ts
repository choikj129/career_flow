// D-10 같은 공고 다시 지원: 최근 6개월 확인 창, [다시 지원 완료], 지원 기록 여러 개.
import { expect, test, type Page } from '@playwright/test';
import { registerByPaste, setFake, toast, waitAnalyzed } from './helpers';

const body = (lines: string[]) => lines.join('\n') + '\n주요업무\n- 결제 서버 개발';

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n, 1);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function applyOn(page: Page, date: string) {
  const dlg = page.getByRole('dialog', { name: '지원 완료로 기록' });
  await dlg.getByLabel('지원일').fill(date);
  await dlg.getByRole('button', { name: '저장' }).click();
  await toast(page, '지원 완료로 저장했습니다');
}

test.beforeEach(() => setFake('seeded', {}));

test.describe.serial('다시 지원', () => {
  let idA = 0;

  test('TC-REAPPLY-E01 첫 지원은 확인 창 없이 폼, 이어서 [다시 지원 완료] → 확인 창 → [그래도 지원 완료] → 기록 2개', async ({ page }) => {
    idA = await registerByPaste(page, body(['회사명: 재지원회사', '포지션: 재지원 서버', '적합도: 70']));
    await waitAnalyzed(page);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '최근 6개월 안에 지원한 기록이 있습니다' })).toHaveCount(0);
    await applyOn(page, monthsAgo(0));

    await expect(page.getByRole('button', { name: '다시 지원 완료' })).toBeVisible();
    await page.getByRole('button', { name: '다시 지원 완료' }).click();
    const confirm = page.getByRole('dialog', { name: '최근 6개월 안에 지원한 기록이 있습니다' });
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('li')).toHaveCount(1);
    await expect(confirm.locator('li').first()).toContainText('재지원 서버');
    await expect(confirm.locator('li').first()).toContainText('이 공고');
    await expect(confirm.locator('li').first()).toContainText('지원'); // 상태
    await confirm.getByRole('button', { name: '그래도 지원 완료' }).click();
    await expect(page.getByRole('dialog', { name: '지원 완료로 기록' })).toBeVisible();
    await applyOn(page, monthsAgo(0));

    await page.getByRole('tab', { name: '지원 기록' }).click();
    await expect(page.locator('[data-testid^="record-"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '기록 수정' })).toHaveCount(2);
    await expect(page.getByRole('button', { name: '기록 삭제' })).toHaveCount(2);
    await expect(page.getByRole('button', { name: '공고 삭제' })).toHaveCount(0);
  });

  test('TC-REAPPLY-E02 확인 창에서 [취소]하면 저장하지 않는다', async ({ page }) => {
    await page.goto(`/postings/${idA}`);
    await page.getByRole('button', { name: '다시 지원 완료' }).click();
    const confirm = page.getByRole('dialog', { name: '최근 6개월 안에 지원한 기록이 있습니다' });
    await expect(confirm.locator('li')).toHaveCount(2);
    await confirm.getByRole('button', { name: '취소' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '지원 완료로 기록' })).toHaveCount(0);
    await page.getByRole('tab', { name: '지원 기록' }).click();
    await expect(page.locator('[data-testid^="record-"]')).toHaveCount(2);
  });

  test('TC-REAPPLY-E03 같은 회사의 다른 공고: 확인 창에 기록이 보이고 "이 공고"는 붙지 않는다', async ({ page }) => {
    await registerByPaste(page, body(['회사명: 재지원회사', '포지션: 재지원 프론트', '적합도: 60']));
    await waitAnalyzed(page);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '최근 6개월 안에 지원한 기록이 있습니다' });
    await expect(confirm.locator('li')).toHaveCount(2);
    await expect(confirm).toContainText('재지원 서버');
    await expect(confirm).not.toContainText('이 공고');
    await confirm.getByRole('button', { name: '그래도 지원 완료' }).click();
    await applyOn(page, monthsAgo(0));
  });

  test('TC-REAPPLY-E04 6개월이 지난 기록만 있으면 확인 창 없이 폼', async ({ page }) => {
    await registerByPaste(page, body(['회사명: 오래전회사', '포지션: 오래전 서버', '적합도: 70']));
    await waitAnalyzed(page);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    await applyOn(page, monthsAgo(8));
    await registerByPaste(page, body(['회사명: 오래전회사', '포지션: 오래전 프론트', '적합도: 70']));
    await waitAnalyzed(page);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '지원 완료로 기록' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '최근 6개월 안에 지원한 기록이 있습니다' })).toHaveCount(0);
  });

  test('TC-REAPPLY-E05 대시보드는 기록마다 한 줄', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('재지원회사')}`);
    await expect(page.locator('tbody tr.row-link').filter({ hasText: '재지원 서버' })).toHaveCount(2);
  });
});
