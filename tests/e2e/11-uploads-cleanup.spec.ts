// D-09 설정의 올린 파일 정리.
import { expect, test } from '@playwright/test';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';
import { setFake, toast } from './helpers';

test.beforeEach(() => setFake('seeded', {}));
test.afterAll(() => setFake('seeded', {}));

function countUploads(): number {
  const walk = (dir: string): number => {
    let n = 0;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      n += statSync(p).isDirectory() ? walk(p) : 1;
    }
    return n;
  };
  const root = join(dataDir('seeded'), 'uploads');
  mkdirSync(root, { recursive: true });
  return walk(root);
}

test.describe.serial('D-09 올린 파일 정리', () => {
  test('TC-SETTINGS-14 가져오기 작업이 진행 중이면 [올린 파일 정리]가 막히고 이유가 보인다', async ({ page }) => {
    setFake('seeded', { delayMs: 6000 });
    await page.goto('/import');
    await page.locator('#images').setInputFiles({ name: 'busy.png', mimeType: 'image/png', buffer: Buffer.alloc(64, 1) });
    await page.getByRole('button', { name: '추출하기' }).click();
    await page.waitForURL(/\/import\?job=\d+/);
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: '올린 파일 정리' })).toBeDisabled();
    await expect(page.getByText('가져오기 작업이 진행 중이라 지금은 정리할 수 없습니다.')).toBeVisible();
    setFake('seeded', {});
    // 작업이 끝나면 다시 눌러진다
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByRole('button', { name: '올린 파일 정리' }).isEnabled();
      }, { timeout: 40_000 })
      .toBe(true);
  });

  test('TC-SETTINGS-15 파일 수·크기 표시 → 확인 창 → 지우면 0개, 이미 저장한 기록은 그대로', async ({ page }) => {
    const uploads = join(dataDir('seeded'), 'uploads', 'import');
    mkdirSync(uploads, { recursive: true });
    writeFileSync(join(uploads, '1-a.png'), Buffer.alloc(2048));
    writeFileSync(join(uploads, '2-b.png'), Buffer.alloc(1024));
    const n = countUploads();
    expect(n).toBeGreaterThanOrEqual(2);

    await page.goto('/settings');
    await expect(page.getByTestId('uploads-summary')).toContainText(`${n}개`);
    await page.getByRole('button', { name: '올린 파일 정리' }).click();
    const dlg = page.getByRole('dialog', { name: '올린 파일 정리' });
    await expect(dlg).toContainText(`올린 이력서·캡처 원본 ${n}개(`);
    await expect(dlg).toContainText('이미 저장한 이력서와 지원 기록은 그대로입니다.');
    await dlg.getByRole('button', { name: '취소' }).click();
    expect(countUploads()).toBe(n); // 취소하면 지우지 않는다

    await page.getByRole('button', { name: '올린 파일 정리' }).click();
    await page.getByRole('dialog', { name: '올린 파일 정리' }).getByRole('button', { name: '지우기' }).click();
    await toast(page, /올린 파일 \d+개\(.*\)를 지웠습니다/);
    await expect(page.getByTestId('uploads-summary')).toContainText('0개');
    await expect(page.getByRole('button', { name: '올린 파일 정리' })).toBeDisabled();
    expect(countUploads()).toBe(0);

    // 지원 기록은 그대로
    await page.goto('/');
    await expect(page.locator('tbody tr.row-link').first()).toBeVisible();
  });
});
