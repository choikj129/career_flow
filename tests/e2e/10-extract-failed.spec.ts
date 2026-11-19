// D-08 링크로 읽기 실패 시 붙여넣기 안내. 실제 채용 사이트에는 접속하지 않는다.
import { expect, test } from '@playwright/test';
import { setFake } from './helpers';

test.beforeEach(() => setFake('seeded', {}));
test.afterAll(() => setFake('seeded', {}));

test.describe('D-08 링크로 읽기 실패', () => {
  test('TC-DETAIL-38 큰 안내, [공고 페이지 열기 ↗](새 탭·http), 3단계 안내, 펼쳐진 붙여넣기 칸', async ({ page }) => {
    await page.goto('/postings/8'); // 시드: 원티드 공고, 본문 추출 실패
    const guide = page.getByTestId('paste-guide');
    await expect(guide).toContainText('이 사이트는 자동으로 읽을 수 없습니다. 공고 페이지에서 본문을 복사해 붙여넣어 주세요.');
    const open = guide.getByRole('link', { name: '공고 페이지 열기 ↗' });
    await expect(open).toHaveAttribute('href', 'https://www.wanted.co.kr/wd/900006');
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    const steps = guide.locator('ol li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(1)).toContainText('Ctrl+A, Ctrl+C');
    await expect(page.locator('.fail-card').getByLabel('공고 본문')).toBeVisible(); // 클릭 없이 처음부터 보인다
  });

  test('TC-DETAIL-39 읽기 실패가 아닌 실패(로그인 안 됨)에는 붙여넣기 안내를 띄우지 않는다', async ({ page }) => {
    await page.goto('/postings/9');
    await expect(page.getByTestId('paste-guide')).toHaveCount(0);
  });

  test('TC-NEW-22 공고 등록 화면에 "일부 사이트는 자동으로 읽지 못한다" 안내', async ({ page }) => {
    await page.goto('/postings/new');
    await expect(page.getByText('일부 사이트는 자동으로 읽지 못해 본문 붙여넣기가 필요할 수 있습니다.')).toBeVisible();
  });
});
