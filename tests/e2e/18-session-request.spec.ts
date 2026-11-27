// 이력서 세션 요청(2026-11-24): 맞춤 이력서 탭 지원 서류 카드의 [이력서 세션 요청 복사], 숨긴 맞춤본 화면, 이전 맞춤본, 지원 완료 기본값.
// 키트 올리기·공고 등록·분석은 화면 경로로 한다(가짜 claude, 가상 데이터). 맞춤본(리비전)은 화면에서 만들 수 없어 시드한다. 실제 claude 호출 0회.
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { dataDir } from './paths';
import { fakeCalls, kitFixtureFiles, registerByPaste, seedRevision, setFake, toast, uploadKit, waitAnalyzed } from './helpers';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => setFake('seeded', {}));

const posting = (name: string, extra: string[] = []) =>
  [`회사명: ${name}`, '포지션: 백엔드 서버 개발자', '적합도: 75', ...extra, '주요업무', '- 백엔드 API, 캐시, 성능, 트래픽 대응(가상 공고)'].join('\n');

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const tab = (id: number) => `/postings/${id}?tab=tailored`;

let main = 0; // 추천도 72, 맞춤본 없음
let old = 0; // 옛 분석(추천도 칸 없음)
let withRevs = 0; // 이전 맞춤본 2개
const NO_TEXT = 8; // 시드: 본문 추출 실패

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, locale: 'ko-KR' });
  setFake('seeded', {});
  const up = await uploadKit(page, kitFixtureFiles());
  expect(up.ok).toBe(true);
  main = await registerByPaste(page, posting('요청복사테스트', ['맞춤추천: 72', '맞춤이유: 장애 대응 사례를 주요 성과 앞으로']));
  await waitAnalyzed(page);
  old = await registerByPaste(page, posting('옛분석테스트', ['맞춤추천: 70']));
  await waitAnalyzed(page);
  withRevs = await registerByPaste(page, posting('이전맞춤본테스트', ['맞춤추천: 30']));
  await waitAnalyzed(page);
  await page.close();
  const db = new Database(join(dataDir('seeded'), 'career-flow.db'));
  try {
    db.prepare("update analyses set result = json_remove(result, '$.profileRecommendation.tailorRec') where posting_id = ?").run(old);
  } finally {
    db.close();
  }
  seedRevision('seeded', withRevs, 'B1');
  seedRevision('seeded', withRevs, 'B2');
});

test.describe('요청 칸', () => {
  test('TC-SR-12 [이력서 세션 요청 복사]: 복사됨, 클립보드 글, 프로필을 바꾸면 그 프로필로', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const callsBefore = fakeCalls('seeded').length;
    await page.goto(tab(main));
    const box = page.getByTestId('session-request');
    await expect(box).toBeVisible();
    await expect(box).toContainText('공고에 맞춘 이력서는 이력서 세션에서 만듭니다.');
    await expect(box).toContainText('위에서 고른 프로필과 공고 분석 내용이 들어갑니다. 연락처는 넣지 않습니다.');
    // 맞춤 이력서 줄에 고치기 링크가 없다
    await expect(page.getByTestId('tailor-rec-line')).toContainText('맞춤 이력서 72%');
    await expect(page.getByTestId('tailor-rec-open')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /공고에 맞춰 고치기/ })).toHaveCount(0);

    const copy = page.getByTestId('session-request-copy');
    await copy.click();
    await expect(page.getByTestId('session-request').getByRole('status')).toHaveText('복사됨');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.startsWith('# 공고 맞춤 이력서 요청')).toBe(true);
    expect(text).toContain('- 회사: 요청복사테스트');
    expect(text).toContain('B2 성능');
    expect(text).toContain('- 72% · 장애 대응 사례를 주요 성과 앞으로');
    expect(text).not.toContain('사용자가 고름');
    expect(text).not.toContain('홍길동');

    await page.getByTestId('apply-profile').selectOption('B1');
    await copy.click();
    await expect(page.getByTestId('session-request').getByRole('status')).toHaveText('복사됨');
    const text2 = await page.evaluate(() => navigator.clipboard.readText());
    expect(text2).toContain('- B1 범용 (백엔드)');
    expect(text2).toContain('사용자가 고름');
    // 저장하지 않고 claude를 부르지 않는다
    expect(fakeCalls('seeded').length).toBe(callsBefore);
    await page.reload();
    await expect(page.getByTestId('past-revisions')).toHaveCount(0);
  });

  test('TC-SR-13 숨긴 것: 고치기 상자·프로필 고르기·맞춤본 만들기·용어 맞추기·다듬기·작업 공간 요청이 없다', async ({ page }) => {
    await page.goto(tab(main));
    await expect(page.getByTestId('apply-docs')).toBeVisible();
    for (const id of ['fix-box', 'profile-picker', 'tailored-empty', 'handoff-recommend', 'downloads']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    for (const name of ['맞춤본 만들기', '공고 용어 맞추기 (AI)', '수정 요청', '요청문 복사', '결과 올리기', '프로필 바꾸기']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(page.getByText('공고에 맞춰 고치기')).toHaveCount(0);
    await expect(page.getByLabel('다듬기 요청')).toHaveCount(0);
    // 분석 탭의 "맞춤 이력서 탭으로 →" 링크는 그대로
    await page.goto(`/postings/${main}`);
    await expect(page.getByTestId('profile-rec-line').getByRole('link', { name: '→ 맞춤 이력서 탭' })).toHaveAttribute('href', tab(main));
  });

  test('TC-SR-14 이전 맞춤본: 접힌 목록, 최신순, PDF 링크. 맞춤본이 없으면 상자가 없다', async ({ page, request }) => {
    await page.goto(tab(withRevs));
    const box = page.getByTestId('past-revisions');
    await expect(box.locator('summary')).toHaveText('이전 맞춤본 (2)');
    expect(await box.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await box.locator('summary').click();
    const rows = box.getByTestId('past-revision');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('r2');
    await expect(rows.nth(0)).toContainText('B2');
    await expect(rows.nth(1)).toContainText('r1');
    await expect(rows.nth(1)).toContainText('B1');
    await expect(box).toContainText('앱에서 만든 맞춤본입니다. 새 맞춤본은 이력서 세션에서 만듭니다.');
    for (const name of ['이력서 PDF', '경력기술서 PDF']) {
      const href = await rows.nth(0).getByRole('link', { name }).getAttribute('href');
      expect(href).toMatch(/^\/api\/tailored\/\d+\/(resume|career)$/);
      const res = await request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toBe('application/pdf');
    }
    await expect(page.getByTestId('apply-docs')).toBeVisible();
    // 주소의 ?rev=는 무시한다
    await page.goto(`${tab(withRevs)}&rev=1`);
    await expect(page.getByTestId('past-revisions').locator('summary')).toHaveText('이전 맞춤본 (2)');
    await page.goto(tab(main));
    await expect(page.getByTestId('past-revisions')).toHaveCount(0);
  });

  test('TC-SR-15 상황별: 본문 없음 / 분석 중 / 옛 분석', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 본문이 없는 공고
    await page.goto(tab(NO_TEXT));
    await expect(page.getByTestId('session-request-copy')).toBeDisabled();
    await expect(page.getByTestId('session-request')).toContainText('공고 본문이 없어 요청문을 만들 수 없습니다. 공고 원문 탭에서 본문을 넣으세요.');
    await expect(page.getByTestId('session-request')).not.toContainText('위에서 고른 프로필과 공고 분석 내용이 들어갑니다');

    // 분석 중인 공고(가짜 claude가 천천히 답한다)
    setFake('seeded', { delayMs: 6000 });
    const busy = await registerByPaste(page, posting('분석중테스트'));
    await page.goto(tab(busy));
    await expect(page.getByTestId('session-request-analyzing')).toHaveText('분석 중입니다. 끝난 뒤 복사하면 추천·강점이 들어갑니다.');
    await expect(page.getByTestId('session-request-copy')).toBeEnabled();
    setFake('seeded', {});
    await expect(page.getByTestId('session-request-analyzing')).toHaveCount(0, { timeout: 30_000 });

    // 옛 분석
    await page.goto(tab(old));
    await expect(page.getByTestId('tailor-rec-missing')).toContainText('맞춤 이력서 추천도는 다시 분석하면 나옵니다');
    await page.getByTestId('session-request-copy').click();
    await expect(page.getByTestId('session-request').getByRole('status')).toHaveText('복사됨');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('(이 분석에는 없음)');
  });

  test('TC-SR-16 복사 실패: 안내 문구와 읽기 전용 칸(전문, 전부 선택)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    });
    await page.goto(tab(main));
    await page.getByTestId('session-request-copy').click();
    await expect(page.getByTestId('session-request-error')).toHaveText('복사하지 못했습니다. 아래 글을 직접 복사하세요.');
    await expect(page.getByTestId('session-request').getByRole('status')).toHaveCount(0);
    const area = page.getByTestId('session-request-text');
    await expect(area).toBeVisible();
    await expect(area).toHaveAttribute('readonly', '');
    await expect(area).toHaveAttribute('rows', '8');
    expect(await area.inputValue()).toMatch(/^# 공고 맞춤 이력서 요청/);
    expect(await area.evaluate((el: HTMLTextAreaElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length)).toBe(true);
  });

  test('TC-SR-17 폭 1024·1240·1440: 요청 칸이 넘치지 않고 버튼과 "복사됨"이 한 줄, 한글 keep-all', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(tab(main));
      const box = page.getByTestId('session-request');
      await expect(box).toBeVisible();
      const copy = page.getByTestId('session-request-copy');
      await copy.click();
      const ok = page.getByTestId('session-request-copied');
      await expect(ok).toBeVisible();
      const [b, o] = [(await copy.boundingBox())!, (await ok.boundingBox())!];
      expect(Math.abs(b.y + b.height / 2 - (o.y + o.height / 2)), `버튼과 복사됨 한 줄 ${width}`).toBeLessThan(8);
      expect(b.height, `버튼 한 줄 ${width}`).toBeLessThan(44);
      expect(await noOverflow(page), `가로 스크롤 ${width}`).toBe(true);
      const css = await box.evaluate((el) => ({ w: getComputedStyle(el).overflowWrap, b: getComputedStyle(el).wordBreak, fits: el.scrollWidth <= el.clientWidth + 1 }));
      expect(css).toEqual({ w: 'anywhere', b: 'keep-all', fits: true });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe('지원 완료 기본값', () => {
  test('TC-SR-19 맞춤본이 없으면 추천 1순위 프로필 기본 서류, 이전 맞춤본이 있으면 최신 맞춤 리비전(변경 전과 같음)', async ({ page }) => {
    const open = async (id: number) => {
      await page.goto(`/postings/${id}`);
      await page.getByRole('button', { name: '지원 완료', exact: true }).click();
      return page.getByRole('dialog', { name: '지원 완료로 기록' });
    };
    const none = await open(main);
    await expect(none.getByLabel('이력서', { exact: true })).toHaveValue(/^kitp:\d+:B2:백엔드$/);
    await none.getByRole('button', { name: '취소' }).click();
    const revs = await open(withRevs);
    const resume = revs.getByLabel('이력서', { exact: true });
    await expect(resume).toHaveValue(/^tailored:\d+$/);
    await expect(resume.locator('option:checked')).toHaveText(/^맞춤 이력서 r2 · B2$/);
    await revs.getByRole('button', { name: '취소' }).click();
  });
});

// D-33 a: 지원 완료·기록 수정의 "이력서 세션 맞춤본"과 바탕 이력서 날짜
test.describe('이력서 세션 맞춤본 기록 (D-33 a)', () => {
  const SESS = '이력서 세션 맞춤본';
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  test('TC-SR-29 지원 완료: 선택하면 바탕 이력서 날짜 줄이 생기고, 저장하면 기록 탭에 날짜와 함께 보인다', async ({ page }) => {
    await page.goto(`/postings/${main}`);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: '지원 완료로 기록' });
    const resume = dlg.getByLabel('이력서', { exact: true });
    await expect(dlg.getByTestId('resume-base-date')).toHaveCount(0);
    await resume.selectOption({ label: SESS });
    await expect(dlg.getByTestId('doc-full-resume')).toHaveText('B2 성능');
    const date = dlg.getByLabel('바탕 이력서');
    await expect(dlg.getByTestId('resume-base-date')).toBeVisible();
    await expect(date).toHaveValue(today()); // 처음 값: 지금 키트를 올린 날
    await resume.selectOption({ label: '기본 서류 백엔드 · B2' });
    await expect(dlg.getByTestId('resume-base-date')).toHaveCount(0);
    await resume.selectOption({ label: SESS });
    await date.fill('20261120');
    await expect(date).toHaveValue('2026-11-20');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 완료로 저장했습니다');

    await page.goto(`/postings/${main}?tab=record`);
    await expect(page.getByText('제출한 이력서').locator('..')).toContainText('이력서 세션 맞춤본 · B2 성능 (2026-11-20 이력서 기반)');
    const docs = page.getByTestId('submitted-docs');
    await expect(docs.getByTestId('resume-line')).toHaveText('이력서 세션 맞춤본 · B2 성능 (2026-11-20 이력서 기반)');
    await expect(docs.getByRole('link', { name: '보기' })).toHaveCount(0);
  });

  test('TC-SR-29 지원일보다 늦은 날짜는 오류 문구가 보이고 저장되지 않는다', async ({ page }) => {
    await page.goto(`/postings/${old}`);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: '지원 완료로 기록' });
    await dlg.getByLabel('이력서', { exact: true }).selectOption({ label: SESS });
    await dlg.getByLabel('바탕 이력서').fill('20991231');
    await dlg.getByRole('button', { name: '저장' }).click();
    await expect(dlg).toContainText('바탕 이력서 날짜는 지원일보다 늦을 수 없습니다');
    await dlg.getByRole('button', { name: '취소' }).click();
    await page.goto(`/postings/${old}?tab=record`);
    await expect(page.getByText('아직 지원하지 않은 공고입니다.')).toBeVisible();
  });

  test('TC-SR-30 수정 창·대시보드·통계가 그 값을 따른다', async ({ page }) => {
    await page.goto(`/postings/${main}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    await expect(dlg.getByLabel('이력서', { exact: true }).locator('option:checked')).toHaveText(SESS);
    await expect(dlg.getByLabel('바탕 이력서')).toHaveValue('2026-11-20');
    await dlg.getByRole('button', { name: '취소' }).click();

    await page.goto('/');
    await expect(page.getByText('세션 맞춤 · B2 · 2026-11-20').first()).toBeVisible();
    await page.goto('/?view=resume');
    await expect(page.locator('.group-head', { hasText: '맞춤 이력서' }).first()).toBeVisible();

    await page.goto('/stats');
    const table = page.getByTestId('stats-tailored-table');
    const row = table.locator('tbody tr', { hasText: '맞춤 이력서' }).first();
    await expect(row).toBeVisible();
    expect(Number(await row.locator('td').nth(1).innerText())).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('stats-profiles-table').getByRole('cell', { name: /^B2/ }).first()).toBeVisible();
  });

  test('TC-SR-31 폭 1024·1240·1440: 지원 완료 창·수정 창이 넘치지 않고 한글 keep-all', async ({ page }) => {
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['apply', 'edit'] as const) {
        if (mode === 'apply') {
          await page.goto(`/postings/${withRevs}`);
          await page.getByRole('button', { name: '지원 완료', exact: true }).click();
        } else {
          await page.goto(`/postings/${main}?tab=record`);
          await page.getByRole('button', { name: '기록 수정' }).click();
        }
        const dlg = page.getByRole('dialog');
        await dlg.getByLabel('이력서', { exact: true }).selectOption({ label: SESS });
        await expect(dlg.getByTestId('resume-base-date')).toBeVisible();
        expect(await noOverflow(page), `${mode} 가로 스크롤 ${width}`).toBe(true);
        const bad = await dlg.evaluate((root) => {
          const limit = root.getBoundingClientRect().right + 1;
          return [...root.querySelectorAll<HTMLElement>('*')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.right > limit && getComputedStyle(el).position !== 'fixed';
            })
            .map((el) => el.tagName + '.' + el.className)
            .slice(0, 5);
        });
        expect(bad, `${mode} 창 밖 요소 ${width}`).toEqual([]);
        const wb = await dlg.getByTestId('doc-full-resume').evaluate((el) => getComputedStyle(el).wordBreak);
        expect(wb).toBe('keep-all');
        await dlg.getByRole('button', { name: '취소' }).click();
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
