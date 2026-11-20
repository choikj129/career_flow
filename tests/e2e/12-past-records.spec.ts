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
    await expect(r.getByLabel('경력기술서')).toHaveValue('none'); // 가장 이른 파일보다 앞섬 → 없음(Task 8)
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

  test('TC-PAST-E2E-07 과제·코딩테스트 상태: 차수 없이 저장, 보드 칸, 필터 안내', async ({ page }) => {
    await openManual(page);
    const r = rows(page).first();
    await r.getByLabel('회사').fill('과제상태회사');
    await r.getByLabel('포지션').fill('과제 포지션');
    await r.getByLabel('지원일').fill('2026-10-17');
    await page.getByRole('button', { name: '1건 등록' }).click();
    await page.waitForURL(/notice=/);

    // 기록만 행에서 상태 변경
    await page.goto(`/?q=${encodeURIComponent('과제상태회사')}`);
    await page.locator('tbody tr.row-link').filter({ hasText: '과제상태회사' }).click();
    const panel = page.locator('.rec-panel');
    await panel.getByLabel('새 상태').selectOption('assignment');
    await expect(panel.getByLabel('면접 차수')).toHaveCount(0);
    await expect(panel.getByPlaceholder('선택 (예: 코딩테스트, 과제 제출)')).toBeVisible();
    await panel.getByPlaceholder('선택 (예: 코딩테스트, 과제 제출)').fill('코딩테스트');
    await panel.getByRole('button', { name: '저장', exact: true }).click();
    await toast(page, '상태를 바꿨습니다');
    await expect(page.locator('tbody tr.row-link').filter({ hasText: '과제상태회사' })).toContainText('과제·코딩테스트');

    // 상태별 보드: 과제·코딩테스트 칸
    await page.goto(`/?view=status&q=${encodeURIComponent('과제상태회사')}`);
    await expect(page.locator('.col-head').nth(2)).toContainText('과제·코딩테스트');
    await expect(page.locator('.col').nth(2).locator('.kcard', { hasText: '과제상태회사' })).toHaveCount(1);

    // 상태 필터: 과제·코딩테스트 + 안내 문구
    await page.goto('/?status=assignment');
    await expect(page.getByText('이 단계를 거친 기록을 모두 보여 줍니다(지금 상태와 관계없이)')).toBeVisible();
    await expect(page.locator('tbody tr.row-link').filter({ hasText: '과제상태회사' })).toHaveCount(1);
  });

  test('TC-PAST-E2E-08 가장 이른 파일보다 앞선 지원: 경력기술서 없음, 이력서는 없음 선택지 없음', async ({ page }) => {
    await openManual(page);
    const r = rows(page).first();
    await r.getByLabel('회사').fill('없음확인회사');
    await r.getByLabel('포지션').fill('없음 포지션');
    await r.getByLabel('지원일').fill('2026-08-01');
    await expect(r.getByLabel('경력기술서')).toHaveValue('none');
    await expect(r.getByLabel('포트폴리오')).toHaveValue('포트폴리오_20260722.pdf');
    await expect(r.getByLabel('이력서').locator('option', { hasText: '없음' })).toHaveCount(0);
    await page.getByRole('button', { name: '1건 등록' }).click();
    await page.waitForURL(/notice=/);

    await page.goto(`/?q=${encodeURIComponent('없음확인회사')}`);
    await page.locator('tbody tr.row-link').filter({ hasText: '없음확인회사' }).click();
    const docs = page.getByTestId('submitted-docs');
    await expect(page.getByTestId('doc-none-career')).toHaveText('없음');
    await expect(docs).toContainText('이력서');
    await expect(docs.locator('li').filter({ hasText: '이력서' })).toContainText('모름');
    await expect(docs.locator('li').filter({ hasText: '경력기술서' }).getByRole('link', { name: '보기' })).toHaveCount(0);

    await page.goto('/stats?doc=career');
    const stats = page.getByTestId('stats-docs');
    await expect(stats.getByTestId('hbar-absent')).toContainText('없음');
    await expect(stats.getByText('내지 않은 지원')).toBeVisible();
  });

  test('TC-PAST-E2E-09 폭 1024에서도 직접 입력 표의 선택·입력 칸 글자가 잘리지 않는다', async ({ page }) => {
    put('portfolio', '포트폴리오_20261017.pdf');
    put('career', '경력기술서_20261102.pdf');
    await page.setViewportSize({ width: 1024, height: 800 });
    await openManual(page, '원티드');
    const r = rows(page).first();
    await r.getByLabel('지원일').fill('2026-11-20');
    await r.getByLabel('상태').selectOption('assignment'); // 가장 긴 상태 이름
    // 가장 긴 문구: 서류 select는 선택된 옵션 글자, 사이트·상태 select는 모든 옵션 글자
    const clipped = await page.evaluate(() => {
      const ctxFor = (el: Element) => {
        const cs = getComputedStyle(el);
        const c = document.createElement('canvas').getContext('2d')!;
        c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return { c, cs };
      };
      const bad: string[] = [];
      const check = (el: HTMLElement, text: string, extra: number, name: string) => {
        const { c, cs } = ctxFor(el);
        const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - extra;
        if (c.measureText(text).width > inner + 0.5) bad.push(`${name}: "${text}" ${Math.round(c.measureText(text).width)} > ${Math.round(inner)}`);
      };
      const row = document.querySelector('table.review tbody tr')!;
      for (const sel of Array.from(row.querySelectorAll('select')) as HTMLSelectElement[]) {
        const label = sel.getAttribute('aria-label') ?? '';
        const texts = ['사이트', '상태'].includes(label) ? Array.from(sel.options).map((o) => o.text) : [sel.selectedOptions[0].text];
        for (const t of texts) check(sel, t, 20, label);
        if (['이력서', '경력기술서', '포트폴리오'].includes(label)) {
          for (const o of Array.from(sel.options)) check(sel, o.text, 20, label);
        }
      }
      const date = row.querySelector('input[aria-label="지원일"]') as HTMLInputElement;
      check(date, '2026-10-20', 0, '지원일');
      const wrapScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      if (wrapScroll) bad.push('페이지가 가로로 스크롤됨');
      return bad;
    });
    expect(clipped).toEqual([]);
  });
});
