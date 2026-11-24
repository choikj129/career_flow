// 간단한 지원 흐름: 맞춤 이력서 탭 맨 위 "지원 서류" 카드(프로필 PDF), 접이식 "공고에 맞춰 고치기", 프로필이 기록되는 [지원 완료].
// 키트 올리기·공고 등록·분석은 화면 경로로 한다(가짜 claude, 가상 데이터).
import { expect, test, type Page } from '@playwright/test';
import { kitFixtureFiles, openFixBox, registerByPaste, setFake, toast, uploadKit, waitAnalyzed } from './helpers';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => setFake('seeded', {}));

const POSTING_X = ['회사명: 지원서류테스트', '포지션: 백엔드 서버 개발자', '적합도: 75', '주요업무', '- 백엔드 API, 캐시, 성능, 트래픽 대응(가상 공고)'].join('\n');
const POSTING_Y = ['회사명: 지원서류테스트Y', '포지션: 백엔드 서버 개발자', '적합도: 70', '주요업무', '- 백엔드 API, 캐시, 성능, 트래픽 대응(가상 공고 둘째)'].join('\n');

let x = 0;
let y = 0;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, locale: 'ko-KR' });
  setFake('seeded', {});
  const up = await uploadKit(page, kitFixtureFiles());
  expect(up.ok).toBe(true);
  x = await registerByPaste(page, POSTING_X);
  await waitAnalyzed(page);
  y = await registerByPaste(page, POSTING_Y);
  await waitAnalyzed(page);
  await page.close();
});

test.describe('지원 서류 카드', () => {
  test('TC-SA-E2E-01 맞춤본이 없어도 맨 위에 보이고, 처음 값은 AI 추천 1순위이며, 고치기 상자는 접혀 있다', async ({ page }) => {
    await page.goto(`/postings/${x}?tab=tailored`);
    const card = page.getByTestId('apply-docs');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('apply-profile')).toHaveValue('B2');
    await expect(page.getByTestId('apply-line')).toContainText('B2 성능');
    await expect(page.getByTestId('apply-line')).toContainText('95%');
    await expect(page.getByTestId('apply-line')).toContainText('추천');
    await expect(page.getByTestId('apply-line')).toContainText('백엔드');
    // 이 키트의 모든 프로필이 직무별로 묶여 있다
    await expect(page.getByTestId('apply-profile').locator('optgroup')).toHaveCount(2);
    await expect(page.getByTestId('apply-profile').locator('option')).toHaveCount(4);
    // 선택지에도 추천도가 보인다(AI가 매긴 직무의 프로필만)
    await expect(page.getByTestId('apply-profile').locator('option[value="B2"]')).toHaveText('B2 성능 95% (추천)');
    await expect(page.getByTestId('apply-profile').locator('option[value="B1"]')).toHaveText(/^B1 \S+ \d+%$/);
    await expect(page.getByTestId('apply-profile').locator('option[value="D1"]')).not.toHaveText(/%/);
    const box = page.getByTestId('fix-box');
    await expect(box).toBeVisible();
    expect(await box.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await expect(box.locator('summary')).toContainText('공고에 맞춰 고치기');
    await expect(box.locator('summary')).toContainText('공고 용어를 바꾸거나 성과 순서를 조정할 때만 씁니다');
    await expect(page.getByTestId('profile-picker')).toBeHidden();
    // 카드가 상자보다 위에 있다
    const cardY = (await card.boundingBox())!.y;
    const boxY = (await box.boundingBox())!.y;
    expect(cardY).toBeLessThan(boxY);
  });

  test('TC-SA-E2E-02 프로필을 바꾸면 받을 파일이 바뀌고, 받을 때마다 만들며 맞춤본(리비전)이 생기지 않는다', async ({ page, request }) => {
    await page.goto(`/postings/${x}?tab=tailored`);
    const resumeLink = page.getByTestId('apply-resume');
    const careerLink = page.getByTestId('apply-career');
    await expect(resumeLink).toHaveAttribute('href', new RegExp(`^/api/kit/\\d+/profile/B2/resume\\?postingId=${x}$`));
    const res = await request.get((await resumeLink.getAttribute('href'))!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(decodeURIComponent(res.headers()['content-disposition'])).toContain('홍길동_이력서_지원서류테스트.pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const career = await request.get((await careerLink.getAttribute('href'))!);
    expect(decodeURIComponent(career.headers()['content-disposition'])).toContain('홍길동_경력기술서_지원서류테스트.pdf');

    await page.getByTestId('apply-profile').selectOption('B1');
    await expect(page.getByTestId('apply-line')).toContainText('B1 범용');
    await expect(page.getByTestId('apply-line')).not.toContainText('95%');
    await expect(resumeLink).toHaveAttribute('href', new RegExp(`/profile/B1/resume\\?postingId=${x}$`));
    const b1 = (await resumeLink.getAttribute('href'))!;
    const md = await request.get(`${b1}&format=md`);
    expect(await md.text()).toContain('범용 백엔드 개발자'); // B1 자기소개 후보
    const md2 = await request.get(`${b1.replace('/B1/', '/B2/')}&format=md`);
    expect(await md2.text()).toContain('성능과 안정성에 집중하는 백엔드 개발자'); // B2 자기소개 후보

    const previewBtn = page.getByTestId('apply-docs').locator('summary', { hasText: '미리보기' });
    await previewBtn.click();
    await expect(page.getByRole('link', { name: '이력서 미리보기' })).toHaveAttribute('href', /profile\/B1\/resume\?postingId=\d+&format=html&inline=1/);
    // 펼친 메뉴가 [미리보기] 버튼을 가리지 않고 그 아래에 뜬다
    const btnBox = (await previewBtn.boundingBox())!;
    const menuBox = (await page.getByTestId('apply-docs').locator('details.menu-pop > div').boundingBox())!;
    expect(menuBox.y).toBeGreaterThanOrEqual(btnBox.y + btnBox.height);

    // 몇 번 받아도 맞춤본이 생기지 않는다
    await page.reload();
    await expect(page.getByLabel('리비전 선택')).toHaveCount(0);
    await expect(page.getByTestId('fix-box')).not.toHaveAttribute('open', '');
  });

  test('TC-SA-E2E-03 폭 1024·1440에서 카드가 넘치지 않고 한글 낱말이 끊기지 않는다', async ({ page }) => {
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/postings/${x}?tab=tailored`);
      const line = page.getByTestId('apply-line');
      await expect(line).toBeVisible();
      expect(await noOverflow(page), `폭 ${width}`).toBe(true);
      const css = await line.evaluate((el) => ({ w: getComputedStyle(el).overflowWrap, b: getComputedStyle(el).wordBreak, fits: el.scrollWidth <= el.clientWidth + 1 }));
      expect(css).toEqual({ w: 'anywhere', b: 'keep-all', fits: true });
      // 버튼 글자는 한 줄이다
      for (const id of ['apply-resume', 'apply-career']) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.height, `${id} 폭 ${width}`).toBeLessThan(44);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe('공고에 맞춰 고치기', () => {
  test('TC-SA-E2E-04 열어서 맞춤본을 만들면 상자가 펼쳐진 채 남고, 내려받기가 상자 맨 위에 있다', async ({ page }) => {
    await page.goto(`/postings/${x}?tab=tailored`);
    await openFixBox(page);
    await expect(page.getByTestId('profile-picker')).toBeVisible();
    await page.getByRole('button', { name: '맞춤본 만들기' }).click();
    await toast(page, '맞춤본을 만들었습니다');
    await page.reload();
    const box = page.getByTestId('fix-box');
    expect(await box.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    const dl = box.getByTestId('downloads');
    await expect(dl).toBeVisible();
    const top = (await dl.boundingBox())!.y;
    expect((await page.getByTestId('profile-line').boundingBox())!.y).toBeGreaterThan(top);
    expect((await page.getByTestId('changes').boundingBox())!.y).toBeGreaterThan(top);
    // 지원 서류 카드는 그대로 위에 있다
    await expect(page.getByTestId('apply-docs')).toBeVisible();
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `폭 ${width}`).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe('지원 완료의 제출 서류', () => {
  test('TC-SA-E2E-05 맞춤본이 없으면 추천 1순위 프로필이 기본값이고, 저장하면 그 프로필이 기록된다', async ({ page }) => {
    await page.goto(`/postings/${y}`);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: '지원 완료로 기록' });
    const resume = dlg.getByLabel('이력서', { exact: true });
    await expect(resume).toHaveValue(/^kitp:\d+:B2:백엔드$/);
    await expect(resume.locator('option:checked')).toHaveText('기본 서류 백엔드 · B2');
    await expect(dlg.getByTestId('doc-full-resume')).toHaveText('기본 서류 백엔드 · B2 성능');
    // 모든 프로필이 선택지에 있다
    for (const label of ['기본 서류 백엔드 · B1', '기본 서류 백엔드 · B2', '기본 서류 데이터 · D1', '기본 서류 데이터 · D2']) {
      await expect(resume.locator('option', { hasText: label })).toHaveCount(1);
    }
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 완료로 저장했습니다');
    await page.goto(`/postings/${y}?tab=record`);
    await expect(page.getByText('제출한 이력서').locator('..')).toContainText('기본 서류 백엔드 (B2 성능)');
    const href = await page.getByTestId('submitted-docs').getByRole('link', { name: '보기' }).first().getAttribute('href');
    expect(href).toMatch(/^\/api\/kit\/\d+\/profile\/B2\/resume\?inline=1$/);
  });

  test('TC-SA-E2E-06 기록 수정에서 다른 프로필로 바꾸면 기록과 통계 프로필별이 따라간다', async ({ page }) => {
    await page.goto(`/postings/${y}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    const resume = dlg.getByLabel('이력서', { exact: true });
    await expect(resume.locator('option:checked')).toHaveText('기본 서류 백엔드 · B2');
    await resume.selectOption({ label: '기본 서류 데이터 · D2' });
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 기록을 고쳤습니다');
    await expect(page.getByText('제출한 이력서').locator('..')).toContainText('기본 서류 데이터 (D2');
    await page.goto('/stats');
    await expect(page.getByRole('cell', { name: /^D2/ }).first()).toBeVisible();
  });
});
