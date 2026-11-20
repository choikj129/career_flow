// 기존 지원 내역 가져오기: 입력 → 추출(가짜 claude) → 검토 표 → 등록 → "이미 있음".
import { expect, test, type Page } from '@playwright/test';
import { fakeCalls, setFake, toast } from './helpers';

test.beforeEach(() => setFake('seeded', {}));
test.afterAll(() => setFake('seeded', {}));

const TEXT = [
  '신규회사,Backend,wanted,2026-01-05,applied',
  '토스,Server Developer,wanted,2025-10-03,document_passed',
  '빈칸회사,PM,wanted,2026-02-02,applied',
].join('\n');

async function extract(page: Page, text: string, site?: string) {
  await page.goto('/import');
  if (site) await page.getByLabel(site, { exact: true }).check();
  await page.getByLabel('텍스트', { exact: true }).fill(text);
  await page.getByRole('button', { name: '추출하기' }).click();
  await page.waitForURL(/\/import\?job=\d+/);
}

const review = (page: Page) => page.locator('table.review');
const rows = (page: Page) => review(page).locator('tbody tr');

test.describe.serial('가져오기 흐름', () => {
  test('TC-IMPORT-01 텍스트·이미지가 없으면 [추출하기]가 비활성', async ({ page }) => {
    await page.goto('/import');
    await expect(page.getByRole('button', { name: '추출하기' })).toBeDisabled();
    await page.getByLabel('텍스트', { exact: true }).fill('내용');
    await expect(page.getByRole('button', { name: '추출하기' })).toBeEnabled();
    await expect(page.getByText('1. 입력')).toBeVisible();
  });

  test('TC-IMPORT-02 추출 → 검토 표: 이미 있는 행은 표시되고 체크 해제', async ({ page }) => {
    await extract(page, TEXT, '원티드');
    await expect(page.getByText('3건을 찾았습니다.')).toBeVisible();
    await expect(page.getByText('2. 검토')).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
    const dup = rows(page).nth(1); // 토스(회사·포지션은 textarea라 값 속성으로 찾을 수 없다)
    await expect(dup.getByLabel('회사')).toHaveValue('토스');
    await expect(dup.getByText('이미 있음')).toBeVisible();
    await expect(dup.getByLabel('등록할 행')).not.toBeChecked();
    await expect(rows(page).first().getByLabel('등록할 행')).toBeChecked();
    await expect(page.getByRole('button', { name: '2건 등록' })).toBeEnabled();
  });

  test('TC-IMPORT-03 빈 칸이 있는 체크된 행이 있으면 등록할 수 없다', async ({ page }) => {
    await extract(page, TEXT);
    const third = rows(page).nth(2);
    await third.getByLabel('회사').fill('');
    await expect(third.getByText('회사명 필요')).toBeVisible();
    await expect(page.getByText('빈 칸을 채워야 등록할 수 있습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: /건 등록/ })).toBeDisabled();
    await third.getByLabel('등록할 행').uncheck(); // 체크를 풀면 막히지 않는다
    await expect(page.getByRole('button', { name: '1건 등록' })).toBeEnabled();
  });

  test('TC-IMPORT-04 행 삭제·행 추가, 추가한 빈 행은 채우기 전까지 등록 불가', async ({ page }) => {
    await extract(page, TEXT);
    await rows(page).nth(2).getByLabel('행 삭제').click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('button', { name: '+ 행 추가' }).click();
    await expect(rows(page)).toHaveCount(3);
    const added = rows(page).last();
    await expect(added.getByLabel('등록할 행')).toBeChecked();
    await expect(page.getByRole('button', { name: /건 등록/ })).toBeDisabled();
    await added.getByLabel('회사').fill('직접추가회사');
    await added.getByLabel('포지션').fill('QA');
    await added.getByLabel('지원일').fill('2026-03-03');
    await expect(page.getByRole('button', { name: '2건 등록' })).toBeEnabled();
  });

  test('TC-IMPORT-05 회사·지원일을 기존 기록과 같게 고치면 "이미 있음"으로 바뀐다', async ({ page }) => {
    await extract(page, '신규회사,Backend,wanted,2026-01-05,applied');
    const row = rows(page).first();
    await row.getByLabel('회사').fill('(주)토스');
    await row.getByLabel('지원일').fill('2025-10-03');
    await row.getByLabel('지원일').blur();
    await expect(row.getByText('이미 있음')).toBeVisible();
    await expect(row.getByLabel('등록할 행')).not.toBeChecked();
    await expect(page.getByRole('button', { name: '0건 등록' })).toBeDisabled();
  });

  test('TC-IMPORT-06 [처음부터]는 입력 단계로 돌아간다', async ({ page }) => {
    await extract(page, TEXT);
    await page.getByRole('button', { name: '처음부터' }).click();
    await expect(page).toHaveURL(/\/import$/);
    await expect(page.getByRole('button', { name: '추출하기' })).toBeDisabled();
  });

  test('TC-IMPORT-07 체크된 행만 등록 → 대시보드에 "기록만"으로 나타난다', async ({ page }) => {
    await extract(page, TEXT);
    await page.getByRole('button', { name: '2건 등록' }).click();
    await toast(page, '2건을 등록했습니다');
    await expect(page).toHaveURL(/:3940\/(\?.*)?$/); // 대시보드로 이동
    await page.goto(`/?q=${encodeURIComponent('신규회사')}`);
    const row = page.locator('tbody tr.row-link').filter({ hasText: '신규회사' });
    await expect(row.locator('.tag-rec')).toHaveText('기록만');
    await expect(row).toContainText('2026-01-05');
    await expect(row).toContainText('모름'); // 제출한 이력서를 모르는 기록
    await page.goto(`/?q=${encodeURIComponent('토스')}`);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(2); // 토스(이미 있음)는 다시 등록되지 않았다
  });

  test('TC-IMPORT-08 같은 내역을 다시 가져오면 모두 "이미 있음"이라 등록할 것이 없다', async ({ page }) => {
    await extract(page, TEXT);
    await expect(rows(page).locator('.flag', { hasText: '이미 있음' })).toHaveCount(3); // 신규회사, 토스, 빈칸회사
    await expect(rows(page).getByLabel('등록할 행').first()).not.toBeChecked();
    await expect(page.getByRole('button', { name: '0건 등록' })).toBeDisabled();
  });

  test('TC-IMPORT-09 추출 실패 문구와 [처음부터]', async ({ page }) => {
    setFake('seeded', { mode: 'auth' });
    await extract(page, TEXT);
    const card = page.locator('.fail-card');
    await expect(card).toContainText('추출에 실패했습니다');
    await expect(card).toContainText('Claude Code 로그인이 필요합니다');
    await card.getByRole('link', { name: '처음부터' }).click();
    await expect(page).toHaveURL(/\/import$/);
  });

  test('TC-IMPORT-10 지원하지 않는 형식·20MB 초과 파일은 사유와 함께 제외', async ({ page }) => {
    await page.goto('/import');
    await page.locator('#images').setInputFiles([
      { name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
      { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
    ]);
    await expect(page.getByText(/run\.exe — 지원하지 않는 형식입니다/)).toBeVisible();
    await expect(page.getByText(/big\.png — 20MB를 넘습니다/)).toBeVisible();
    await expect(page.getByRole('button', { name: '추출하기' })).toBeDisabled(); // 쓸 수 있는 입력이 없다
  });

  test('TC-IMPORT-11 정확히 20MB인 이미지는 허용되고 Read 도구만 쓰는 작업으로 간다', async ({ page }) => {
    await page.goto('/import');
    await page.locator('#images').setInputFiles({ name: 'cap.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024) });
    await page.getByLabel('텍스트', { exact: true }).fill('이미지회사,QA,wanted,2026-04-04,applied');
    await expect(page.getByRole('button', { name: '추출하기' })).toBeEnabled();
    await page.getByRole('button', { name: '추출하기' }).click();
    await page.waitForURL(/\/import\?job=\d+/);
    await expect(page.getByText('1건을 찾았습니다.')).toBeVisible();
    const last = fakeCalls('seeded').filter((c) => c.kind === 'import_applications').at(-1);
    expect(last?.tools).toBe('Read');
    expect(last?.model).toBe('sonnet'); // D-05 기본 모델
  });
});
