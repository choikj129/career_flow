// D-34: 이력서 세션 요청을 복사했지만 기본 서류 등으로 냈을 때 "지원 폴더 안 씀" 알림. 가짜 claude, 가상 데이터. 실제 claude 호출 0회.
import { expect, test, type Page } from '@playwright/test';
import { kitFixtureFiles, registerByPaste, setFake, toast, uploadKit, waitAnalyzed } from './helpers';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => setFake('seeded', {}));

const posting = (name: string) =>
  [`회사명: ${name}`, '포지션: 백엔드 서버 개발자', '적합도: 75', '주요업무', '- 백엔드 API, 캐시, 성능, 트래픽 대응(가상 공고)'].join('\n');

const tab = (id: number) => `/postings/${id}?tab=tailored`;
const NOTICE = '이 공고는 이력서 세션 맞춤본이 아닌 서류로 냈습니다';

let copied = 0; // 복사 후 기본 서류로 저장
let sess = 0; // 복사 후 세션 맞춤본으로 저장
let plain = 0; // 복사 안 함
let edited = 0; // 복사 후 기록 수정으로 기본 서류로 바꿈

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, locale: 'ko-KR' });
  setFake('seeded', {});
  expect((await uploadKit(page, kitFixtureFiles())).ok).toBe(true);
  copied = await registerByPaste(page, posting('폴더알림가상'));
  await waitAnalyzed(page);
  sess = await registerByPaste(page, posting('폴더세션가상'));
  await waitAnalyzed(page);
  plain = await registerByPaste(page, posting('폴더무복사가상'));
  await waitAnalyzed(page);
  edited = await registerByPaste(page, posting('폴더수정가상'));
  await waitAnalyzed(page);
  await page.close();
});

async function copyRequest(page: Page, id: number) {
  await page.goto(tab(id));
  await page.getByTestId('session-request-copy').click();
  await expect(page.getByTestId('session-request-copied')).toBeVisible();
}

async function applySave(page: Page, resume?: 'sess') {
  await page.getByRole('button', { name: '지원 완료', exact: true }).click();
  const dlg = page.getByRole('dialog');
  if (resume === 'sess') {
    const v = await dlg.locator('#ap-doc-resume option[value^="sess:"]').first().getAttribute('value');
    await dlg.locator('#ap-doc-resume').selectOption(v!);
    await dlg.locator('#ap-doc-baseDate').fill('2026-11-01');
  }
  await dlg.getByRole('button', { name: '저장' }).click();
  await toast(page, '지원 완료로 저장했습니다');
}

test.describe('지원 폴더 안 씀 알림', () => {
  test('TC-FN-01 복사 후 기본 서류로 저장: 알림이 보이고, 닫으면 다시 안 뜬다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await copyRequest(page, copied);
    await applySave(page);
    const box = page.getByTestId('folder-notice');
    await expect(box).toBeVisible();
    await expect(box).toContainText(NOTICE);
    await expect(box).toContainText(String.raw`지원\폴더알림가상`);
    await expect(box).toContainText('쓰지 않으니 지워 주세요.');
    await expect(box).not.toContainText('세션에 지워 달라고');
    await box.getByRole('button', { name: '닫기' }).click();
    await expect(box).toHaveCount(0);
    expect(await page.evaluate((id) => localStorage.getItem(`cf:session-request-copied:${id}`), copied)).toBeNull();
    await page.reload();
    await expect(page.getByTestId('folder-notice')).toHaveCount(0);
  });

  test('TC-FN-02 복사 후 이력서 세션 맞춤본으로 저장: 알림 없음', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await copyRequest(page, sess);
    await applySave(page, 'sess');
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expect(page.getByTestId('folder-notice')).toHaveCount(0);
  });

  test('TC-FN-03 복사하지 않은 공고: 알림 없음', async ({ page }) => {
    await page.goto(tab(plain));
    await applySave(page);
    await expect(page.getByTestId('folder-notice')).toHaveCount(0);
  });

  test('TC-FN-04 복사 후 맞춤본으로 저장했다가 기록 수정으로 기본 서류로 바꾸면 알림이 뜬다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await copyRequest(page, edited);
    await applySave(page, 'sess');
    await expect(page.getByTestId('folder-notice')).toHaveCount(0);
    await page.goto(`/postings/${edited}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.locator('#ed-doc-resume')).toBeVisible();
    const kit = await dlg.locator('#ed-doc-resume option[value^="kitp:"]').first().getAttribute('value');
    await dlg.locator('#ed-doc-resume').selectOption(kit!);
    await dlg.getByRole('button', { name: '저장' }).click();
    await expect(page.getByTestId('folder-notice')).toBeVisible();
  });

  for (const width of [1024, 1240, 1440]) {
    test(`TC-FN-05 폭 ${width}: 알림 글이 어절 단위로 줄바꿈하고 넘치지 않는다`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width, height: 900 });
      const id = await registerByPaste(page, posting(`폴더폭${width}가상`));
      await waitAnalyzed(page);
      await copyRequest(page, id);
      await applySave(page);
      const box = page.getByTestId('folder-notice');
      await expect(box).toBeVisible();
      expect(await box.evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const b = await box.boundingBox();
      expect(b!.x + b!.width).toBeLessThanOrEqual(width);
    });
  }
});

// apply-tidy(2026-11-27): 새 기록 창의 선택지 정리
test.describe('지원 완료 창 선택지 정리', () => {
  test('TC-AT-01 새 기록 창: 지난 이력서 파일·모름이 없고 세션 맞춤본은 한 줄, 프로필 줄이 보인다', async ({ page }) => {
    const id = await registerByPaste(page, posting('폴더선택지가상'));
    await waitAnalyzed(page);
    await page.goto(tab(id));
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const dlg = page.getByRole('dialog');
    const resume = dlg.locator('#ap-doc-resume');
    await expect(resume).toBeVisible();
    const labels = await resume.locator('option').allTextContents();
    expect(labels.filter((l) => l.startsWith('이력서 세션 맞춤본'))).toEqual(['이력서 세션 맞춤본']);
    expect(labels).not.toContain('모름');
    expect(labels.some((l) => /^이력서 20\d\d-/.test(l))).toBe(false);
    expect(labels.some((l) => l.startsWith('기본 서류'))).toBe(true);
    for (const f of ['career', 'portfolio']) {
      expect(await dlg.locator(`#ap-doc-${f} option`).allTextContents()).not.toContain('모름');
    }
    await resume.selectOption({ label: '이력서 세션 맞춤본' });
    await expect(dlg.getByTestId('doc-full-resume')).toHaveText(/^[A-Z]\d+ \S/);
  });

  test('TC-AT-02 복사 때 고른 프로필로 기록되고 지원 기록에 보인다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const id = await registerByPaste(page, posting('폴더프로필가상'));
    await waitAnalyzed(page);
    await page.goto(tab(id));
    await page.getByTestId('apply-profile').selectOption('B1');
    await page.getByTestId('session-request-copy').click();
    await expect(page.getByTestId('session-request-copied')).toBeVisible();
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#ap-doc-resume').selectOption({ label: '이력서 세션 맞춤본' });
    await expect(dlg.getByTestId('doc-full-resume')).toContainText('B1 ');
    await dlg.locator('#ap-doc-baseDate').fill('2026-11-01');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 완료로 저장했습니다');
    await page.goto(`/postings/${id}?tab=record`);
    await expect(page.getByTestId('resume-line')).toContainText('이력서 세션 맞춤본 · B1');
  });

  for (const width of [1024, 1240, 1440]) {
    test(`TC-AT-03 폭 ${width}: 새 기록 창이 넘치지 않고 keep-all`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const id = await registerByPaste(page, posting(`폴더폭선택${width}가상`));
      await waitAnalyzed(page);
      await page.goto(tab(id));
      await page.getByRole('button', { name: '지원 완료', exact: true }).click();
      const dlg = page.getByRole('dialog');
      await dlg.locator('#ap-doc-resume').selectOption({ label: '이력서 세션 맞춤본' });
      await expect(dlg.getByTestId('doc-full-resume')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(await dlg.getByTestId('doc-full-resume').evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');
    });
  }
});
