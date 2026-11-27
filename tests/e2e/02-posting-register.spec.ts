// 공고 등록 → 분석(가짜 claude) → 결과 표시, 중복 경고, URL 추적 꼬리, 차단 페이지, 실패 문구, 진행·대기 표시.
import { expect, test } from '@playwright/test';
import { FIXTURE_ORIGIN } from './paths';
import { registerByPaste, setFake, toast, waitAnalyzed } from './helpers';

const body = (lines: string[]) => lines.join('\n') + '\n주요업무\n- 결제 서버 개발\n자격요건\n- Java 3년 이상';

test.beforeEach(() => setFake('seeded', {}));
test.afterAll(() => setFake('seeded', {}));

test.describe('공고 등록 화면', () => {
  test('TC-NEW-01 링크·본문이 모두 비면 [등록하고 분석]이 비활성', async ({ page }) => {
    await page.goto('/postings/new');
    await expect(page.getByRole('button', { name: '등록하고 분석' })).toBeDisabled();
    await page.locator('#url').fill('https://www.wanted.co.kr/wd/1');
    await expect(page.getByRole('button', { name: '등록하고 분석' })).toBeEnabled();
    await page.locator('#url').fill('');
    await expect(page.getByRole('button', { name: '등록하고 분석' })).toBeDisabled();
  });

  test('TC-NEW-02 출처 이름 칸은 기타 주소·본문만 넣을 때만 보인다', async ({ page }) => {
    await page.goto('/postings/new');
    await expect(page.locator('#siteNote')).toHaveCount(0);
    await page.locator('#url').fill('https://www.wanted.co.kr/wd/1');
    await expect(page.locator('#siteNote')).toHaveCount(0);
    await page.locator('#url').fill('https://careers.example.com/job/1');
    await expect(page.locator('#siteNote')).toBeVisible();
    await page.locator('#url').fill('');
    await page.getByText('링크로 안 열리면 공고 본문 붙여넣기').click();
    await page.getByPlaceholder(/공고 페이지에서 본문을 복사해/).fill('본문만');
    await expect(page.locator('#siteNote')).toBeVisible();
  });

  test('TC-NEW-03 올바르지 않은 주소는 오류 문구', async ({ page }) => {
    await page.goto('/postings/new');
    await page.locator('#url').fill('이건 주소가 아님');
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await expect(page.getByText('올바른 공고 주소가 아닙니다')).toBeVisible();
    await expect(page).toHaveURL(/\/postings\/new/);
  });

  test('TC-NEW-12 http(s)가 아닌 주소(file:, javascript:)는 등록 단계에서 거부해야 한다', async ({ page }) => {
    await page.goto('/postings/new');
    await page.locator('#url').fill('file:///C:/Windows/win.ini');
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await expect(page.getByText('올바른 공고 주소가 아닙니다')).toBeVisible();
    await expect(page).toHaveURL(/\/postings\/new/);
  });

  test('TC-NEW-19 출처 이름 자동완성: 전에 쓴 이름이 목록에 있다', async ({ page }) => {
    await page.goto('/postings/new');
    await page.locator('#url').fill('https://careers.example.com/job/1');
    const options = page.locator('#site-notes option');
    await expect(options.first()).toBeAttached();
    const values = await options.evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    expect(values).toEqual(expect.arrayContaining(['지인 추천', '회사 채용 페이지']));
  });

  test('TC-NEW-04 본문 붙여넣기 → 분석 완료 → 결과 표시', async ({ page }) => {
    const id = await registerByPaste(
      page,
      body(['회사명: 테스트컴퍼니', '포지션: 테스트 서버 개발자', '적합도: 88', '마감: 2026-12-31']),
      { siteNote: '지인 추천' },
    );
    await waitAnalyzed(page);
    await expect(page.locator('.score')).toContainText('88');
    await expect(page.locator('.p-co')).toContainText('테스트컴퍼니');
    await expect(page.getByRole('heading', { name: '테스트 서버 개발자' })).toBeVisible();
    await expect(page.getByText('기본 이력서 v2 기준')).toBeVisible();
    await expect(page.getByText('마감 2026-12-31')).toBeVisible();
    await expect(page.getByRole('heading', { name: '잘 맞는 점' })).toBeVisible();
    await expect(page.getByText('이력서에서 보완 가능')).toBeVisible();
    await expect(page.getByText('맞춤 이력서 조언.')).toBeVisible();
    await expect(page.getByText('지인 추천').first()).toBeVisible();
    // 공고 원문 탭: 저장된 본문과 읽은 방법
    await page.getByRole('tab', { name: '공고 원문' }).click();
    await expect(page).toHaveURL(new RegExp(`/postings/${id}\\?tab=raw`));
    await expect(page.getByText('회사명: 테스트컴퍼니')).toBeVisible();
    await expect(page.getByText(/직접 붙여넣음/)).toBeVisible();
    // 지원 기록 탭: 지원 전
    await page.getByRole('tab', { name: '지원 기록' }).click();
    await expect(page.getByRole('heading', { name: '아직 지원하지 않은 공고입니다.' })).toBeVisible();
  });

  test('TC-NEW-05 중복 지원 경고: 같은 회사의 다른 표기((주), 법인명)도 잡는다', async ({ page }) => {
    await registerByPaste(page, body(['회사명: (주)모빌페이', '포지션: 데이터 엔지니어']));
    await waitAnalyzed(page);
    const banner = page.locator('.dup');
    await expect(banner).toContainText('이 회사에 지원한 기록이 1건 있습니다.');
    await expect(banner).toContainText('서버 개발자 (결제)');
    await expect(banner).toContainText('서류합격');
    await expect(banner.getByRole('link')).toHaveAttribute('href', '/postings/1'); // 줄을 누르면 그 공고로
    // 법인명으로 들어와도 같은 회사
    await registerByPaste(page, body(['회사명: 모빌페이 테크', '법인명: 모빌리티페이먼츠', '포지션: SRE']));
    await waitAnalyzed(page);
    await expect(page.locator('.dup')).toContainText('이 회사에 지원한 기록이 1건 있습니다.');
  });

  test('TC-NEW-06 지원 기록이 없는 회사는 경고가 없다', async ({ page }) => {
    await registerByPaste(page, body(['회사명: 처음보는회사']));
    await waitAnalyzed(page);
    await expect(page.locator('.dup')).toHaveCount(0);
  });

  test('TC-NEW-07 링크 등록: 로컬 픽스처 페이지에서 본문을 읽고, 추적 꼬리가 달라도 같은 공고', async ({ page }) => {
    const url = `${FIXTURE_ORIGIN}/posting-e2e.html`;
    await page.goto('/postings/new');
    await page.locator('#url').fill(url);
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await page.waitForURL(/\/postings\/\d+/);
    const id = /\/postings\/(\d+)/.exec(page.url())![1];
    await waitAnalyzed(page);
    await expect(page.locator('.p-co')).toContainText('링크컴퍼니');
    await expect(page.locator('.score')).toContainText('77');
    await expect(page.getByRole('link', { name: /원본 공고 열기/ })).toHaveAttribute('href', url);
    await page.getByRole('tab', { name: '공고 원문' }).click();
    await expect(page.getByText(/자동으로 읽음/)).toBeVisible();
    await expect(page.locator('.rawtext')).toContainText('링크컴퍼니 서버 개발자 채용');

    await page.goto('/postings/new');
    await page.locator('#url').fill(`${url}?utm_source=kakao&utm_medium=x#apply`);
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await expect(page).toHaveURL(new RegExp(`/postings/${id}`));
    await toast(page, '이미 등록된 공고입니다');
  });

  test('TC-NEW-08 차단 페이지는 추출 실패로 보고 붙여넣기로 이어진다', async ({ page }) => {
    await page.goto('/postings/new');
    await page.locator('#url').fill(`${FIXTURE_ORIGIN}/posting-blocked.html`);
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await page.waitForURL(/\/postings\/\d+/);
    const alert = page.locator('.fail-card');
    await expect(alert).toContainText('분석에 실패했습니다');
    await expect(alert).toContainText('공고 본문을 읽지 못했습니다. 공고 페이지 내용을 복사해 붙여넣어 주세요.');
    await alert.getByLabel('공고 본문').fill(body(['회사명: 붙여넣은회사', '적합도: 66']));
    await alert.getByRole('button', { name: '이 내용으로 분석' }).click();
    await waitAnalyzed(page);
    await expect(page.locator('.score')).toContainText('66');
    await expect(page.locator('.p-co')).toContainText('붙여넣은회사');
  });

  test('TC-NEW-09 너무 짧은 페이지(본문 없음)도 추출 실패', async ({ page }) => {
    await page.goto('/postings/new');
    await page.locator('#url').fill(`${FIXTURE_ORIGIN}/posting-empty.html`);
    await page.getByRole('button', { name: '등록하고 분석' }).click();
    await page.waitForURL(/\/postings\/\d+/);
    await expect(page.locator('.fail-card')).toContainText('공고 본문을 읽지 못했습니다');
  });
});

test.describe('분석 실패 종류별 문구', () => {
  test('TC-COMMON-10 로그인 안 됨: 안내 문구와 다시 시도', async ({ page }) => {
    setFake('seeded', { mode: 'auth' });
    await registerByPaste(page, body(['회사명: 실패회사A']));
    const alert = page.locator('.fail-card');
    await expect(alert).toContainText('Claude Code 로그인이 필요합니다. 터미널에서 `claude`를 실행해 로그인한 뒤 다시 시도하세요.');
    // 로그인 후 다시 시도하면 성공
    setFake('seeded', {});
    await alert.getByRole('button', { name: '다시 시도' }).click();
    await waitAnalyzed(page);
    await expect(page.locator('.fail-card')).toHaveCount(0);
  });

  test('TC-COMMON-11 사용 한도 도달: Claude Code 메시지 원문 그대로', async ({ page }) => {
    setFake('seeded', { mode: 'limit' });
    await registerByPaste(page, body(['회사명: 실패회사B']));
    await expect(page.locator('.fail-card')).toContainText('Claude usage limit reached. Your limit will reset at 5pm');
    await expect(page.locator('.fail-card').getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  test('TC-COMMON-12 결과 형식 오류: "결과를 읽지 못했습니다." + 원문 보기 펼침', async ({ page }) => {
    setFake('seeded', { mode: 'schema_bad' });
    await registerByPaste(page, body(['회사명: 실패회사C']));
    const alert = page.locator('.fail-card');
    await expect(alert).toContainText('결과를 읽지 못했습니다.');
    await alert.getByText('원문 보기').click();
    await expect(alert.locator('pre')).toBeVisible();
  });

  test('TC-COMMON-13 JSON이 아닌 출력: 그 밖의 오류로 메시지 표시', async ({ page }) => {
    setFake('seeded', { mode: 'garbage' });
    await registerByPaste(page, body(['회사명: 실패회사D']));
    await expect(page.locator('.fail-card')).toContainText('not json');
  });

  test('TC-COMMON-14 실패한 공고는 분석한 공고 목록에 "분석 실패"로 보인다', async ({ page }) => {
    setFake('seeded', { mode: 'limit' });
    await registerByPaste(page, body(['회사명: 실패회사E']));
    await expect(page.locator('.fail-card')).toBeVisible();
    await page.goto('/postings/analyzed');
    await expect(page.getByRole('row', { name: /분석 실패/ }).first()).toBeVisible();
  });
});

test.describe('진행 중 표시와 한 번에 하나씩 실행', () => {
  test('TC-AI-10 분석 중: 진행 문구·경과 시간·내비게이션 표시, [지원 완료] 비활성', async ({ page }) => {
    setFake('seeded', { delayMs: 5000 });
    await registerByPaste(page, body(['회사명: 느린회사']));
    await expect(page.getByRole('status').filter({ hasText: '분석 중… (보통 1~3분)' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /\d+:\d\d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '지원 완료' })).toBeDisabled();
    await expect(page.getByText('분석이 끝난 뒤 누를 수 있습니다')).toBeVisible();
    await expect(page.getByRole('heading', { name: '분석 중인 공고' })).toBeVisible();
    await expect(page.locator('.job-ind')).toContainText('작업 1개 진행 중');
    await expect(page.locator('.job-ind')).toHaveAttribute('href', /\/postings\/\d+/);
    await waitAnalyzed(page); // 끝나면 자동으로 결과가 뜬다
    await expect(page.getByRole('button', { name: '지원 완료' })).toBeEnabled();
  });

  test('TC-AI-11 두 번째 작업은 앞 작업이 끝나면 시작("대기 N번째")', async ({ page }) => {
    setFake('seeded', { delayMs: 6000 });
    await registerByPaste(page, body(['회사명: 순서회사A']));
    await registerByPaste(page, body(['회사명: 순서회사B']));
    await expect(page.getByRole('status').filter({ hasText: /앞의 작업이 끝나면 시작합니다 \(대기 \d번째\)/ })).toBeVisible();
    await expect(page.locator('.job-ind')).toContainText('대기');
    await waitAnalyzed(page); // 둘 다 순서대로 끝난다
    await expect(page.locator('.p-co')).toContainText('순서회사B');
  });
});
