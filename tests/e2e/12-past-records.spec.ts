// 지난 지원 기록 직접 입력, 제출 서류 파일 선택·보기, 서류 파일 탭, 메모 이관. TC-PAST-E2E-01~06
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';
import { toast } from './helpers';

const docsDir = join(dataDir('seeded'), 'documents');
const put = (kind: string, name: string) => {
  mkdirSync(join(docsDir, kind), { recursive: true });
  writeFileSync(join(docsDir, kind, name), '%PDF-1.4 fake');
};

test.beforeAll(() => {
  put('resume', '이력서_20260905.pdf');
  put('resume', '이력서_20261017.pdf');
  put('career', '경력기술서_20261017.pdf');
  put('portfolio', '포트폴리오_20260722.pdf');
  put('resume', '메모.txt'); // 규칙 밖 파일
});

const rows = (page: Page) => page.locator('table.review tbody tr');

async function openManual(page: Page, site = '그룹바이') {
  await page.goto('/import');
  await page.getByLabel(site, { exact: true }).check();
  await page.getByRole('button', { name: '표에 직접 입력' }).click();
  await page.waitForURL(/manual=1/);
}

test.describe.serial('지난 기록 직접 입력', () => {
  test('TC-PAST-E2E-01 사이트 미선택이면 비활성, 그룹바이 → 빈 행 1개', async ({ page }) => {
    await page.goto('/import');
    await expect(page.getByRole('button', { name: '표에 직접 입력' })).toBeDisabled();
    await expect(page.getByText('직접 입력하려면 사이트를 고르세요')).toBeVisible();
    await openManual(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first().getByLabel('사이트')).toHaveValue('groupby');
    await expect(rows(page).first().getByLabel('회사')).toHaveValue('');
  });

  test('TC-PAST-E2E-02 필수 4칸을 채워야 등록, 등록 후 대시보드에 나온다', async ({ page }) => {
    await openManual(page);
    const r = rows(page).first();
    await expect(page.getByRole('button', { name: /건 등록/ })).toBeDisabled();
    await expect(r.getByText('회사명 필요')).toBeVisible();
    await r.getByLabel('회사').fill('지난기록회사');
    await expect(r.getByText('포지션 필요')).toBeVisible();
    await r.getByLabel('포지션').fill('지난 서버');
    await expect(r.getByText(/지원일.*필요/)).toBeVisible();
    await r.getByLabel('지원일').fill('2026-10-17');
    await r.getByLabel('메모').fill('수기 메모');
    await expect(page.getByRole('button', { name: '1건 등록' })).toBeEnabled();
    await page.getByRole('button', { name: '1건 등록' }).click();
    await page.waitForURL(/notice=/);
    await page.goto(`/?q=${encodeURIComponent('지난기록회사')}`);
    await expect(page.locator('tbody tr.row-link').filter({ hasText: '지난기록회사' })).toHaveCount(1);
  });

  test('TC-PAST-E2E-03 지원일로 서류가 자동 선택되고, 직접 고른 칸은 유지된다', async ({ page }) => {
    await openManual(page);
    const r = rows(page).first();
    await r.getByLabel('지원일').fill('2026-10-17');
    await expect(r.getByLabel('이력서')).toHaveValue('이력서_20261017.pdf'); // 같은 날 포함
    await expect(r.getByLabel('경력기술서')).toHaveValue('경력기술서_20261017.pdf');
    await r.getByLabel('지원일').fill('2026-10-01');
    await expect(r.getByLabel('이력서')).toHaveValue('이력서_20260905.pdf');
    await expect(r.getByLabel('경력기술서')).toHaveValue(''); // 가장 이른 파일보다 앞섬 → 모름
    await r.getByLabel('이력서').selectOption('');
    await r.getByLabel('지원일').fill('2026-10-20');
    await expect(r.getByLabel('이력서')).toHaveValue(''); // 직접 고른 것은 유지
    await expect(r.getByLabel('포트폴리오')).toHaveValue('포트폴리오_20260722.pdf');
  });

  test('TC-PAST-E2E-04 제출 서류 [보기]와 파일 없음', async ({ page, request }) => {
    await openManual(page);
    const r = rows(page).first();
    await r.getByLabel('회사').fill('서류보기회사');
    await r.getByLabel('포지션').fill('서류 포지션');
    await r.getByLabel('지원일').fill('2026-10-17');
    await page.getByRole('button', { name: '1건 등록' }).click();
    await page.waitForURL(/notice=/);
    await page.goto(`/?q=${encodeURIComponent('서류보기회사')}`);
    await page.locator('tbody tr.row-link').filter({ hasText: '서류보기회사' }).click();
    const docs = page.getByTestId('submitted-docs');
    await expect(docs).toContainText('이력서');
    await expect(docs).toContainText('경력기술서');
    await expect(docs).toContainText('포트폴리오');
    const href = await docs.getByRole('link', { name: '보기' }).first().getAttribute('href');
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    rmSync(join(docsDir, 'resume', '이력서_20261017.pdf'));
    await page.reload();
    await page.locator('tbody tr.row-link').filter({ hasText: '서류보기회사' }).click();
    await expect(page.getByTestId('submitted-docs')).toContainText('파일 없음');
    put('resume', '이력서_20261017.pdf'); // 되돌려 둔다
    expect(existsSync(join(docsDir, 'resume', '이력서_20261017.pdf'))).toBe(true);
  });

  test('TC-PAST-E2E-05 서류 파일 탭: 종류별 목록, 규칙 밖 파일 안내, [보기]', async ({ page }) => {
    await page.goto('/resume?tab=docs');
    const tab = page.getByTestId('doc-files');
    await expect(tab).toContainText('이력서');
    await expect(tab).toContainText('2026-10-17');
    await expect(tab).toContainText('2026-09-05');
    await expect(tab).toContainText('이름 규칙에 맞지 않아 쓰지 않는 파일: 메모.txt');
    await expect(tab.getByRole('link', { name: '보기' }).first()).toHaveAttribute('href', /\/api\/documents\//);
  });

  test('TC-PAST-E2E-06 메모의 제출 서류 줄 이관', async ({ page }) => {
    await openManual(page);
    const r = rows(page).first();
    await r.getByLabel('회사').fill('이관회사');
    await r.getByLabel('포지션').fill('이관 포지션');
    await r.getByLabel('지원일').fill('2026-10-17');
    await r.getByLabel('이력서').selectOption('');
    await r.getByLabel('경력기술서').selectOption('');
    await r.getByLabel('포트폴리오').selectOption('');
    await r.getByLabel('메모').fill('메일 가져오기(원티드)\n제출 서류: 이력서 2026-10-17 / 경력기술서 모름 / 포트폴리오 모름');
    await page.getByRole('button', { name: '1건 등록' }).click();
    await page.waitForURL(/notice=/);
    await page.goto('/resume?tab=docs');
    await page.getByRole('button', { name: '메모의 제출 서류 옮기기' }).click();
    await toast(page, /건의 제출 서류를 옮겼습니다/);
    await page.goto(`/?view=resume&q=${encodeURIComponent('이관회사')}`);
    await expect(page.getByText('이력서 2026-10-17').first()).toBeVisible();
  });
});
