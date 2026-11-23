// 맞춤 이력서(3단계, 프로필 방식) 화면: 서류 키트 탭, 맞춤 이력서 탭, 용어 맞추기·다듬기, 작업 공간 요청, 제출 서류 선택, 배치.
// 가짜 claude(tests/fixtures/fake-claude-e2e.mjs)만 쓴다. 키트·맞춤본·지원 기록은 모두 화면 경로로 만든다. 가상 데이터만 쓴다.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_DIR, LONG_PROFILE, fakeCalls, kitFixtureFiles, pickKitFiles, registerByPaste, setFake, toast, uploadKit, waitAnalyzed } from './helpers';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => setFake('seeded', {}));

const md = (name: string, data: Buffer | string) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(data) });

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const tab = (id: number, rev?: number) => `/postings/${id}?tab=tailored${rev ? `&rev=${rev}` : ''}`;
const POSTING_A = ['회사명: 맞춤테스트A', '포지션: 백엔드 서버 개발자', '적합도: 80', '주요업무', '- 백엔드 API 설계, 캐시 설계로 성능과 트래픽 대응', '- 정산 시스템 개발'].join('\n');
const POSTING_B = ['회사명: 맞춤테스트B', '포지션: 서버 개발자', '적합도: 60', '주요업무', '- API 개발'].join('\n');

let a = 0; // 공고 A (추천이 높고 남은 추가 조정이 있다)
let b = 0; // 공고 B (추천도 60% 미만)
let kitVersions = 0;

test.describe('서류 키트 탭', () => {
  test('TC-TAILOR-E2E-07 키트가 없으면 맞춤 이력서 탭과 키트 탭이 안내한다', async ({ page }) => {
    await page.goto('/postings/1?tab=tailored');
    const empty = page.getByTestId('tailored-no-kit');
    await expect(empty).toContainText('맞춤 이력서는 서류 키트(가이드·기본 서류·마스터스토리)로 만듭니다');
    await empty.getByRole('link', { name: '서류 키트로 →' }).click();
    await expect(page).toHaveURL(/\/resume\?tab=kit/);
    await expect(page.getByTestId('kit-empty')).toContainText('아직 서류 키트가 없습니다');
  });

  test('TC-TAILOR-E2E-01 오류 키트: 오류 목록이 보이고 맞춤 이력서 탭은 만들 수 없다고 안내한다', async ({ page }) => {
    await uploadKit(page, [md('서류_가이드.md', readFileSync(join(KIT_DIR, '서류_가이드.md')))]);
    await toast(page, /키트를 올렸습니다/);
    const errors = page.getByTestId('kit-errors');
    await expect(errors).toContainText('읽기 오류');
    await expect(errors).toContainText('이력서_백엔드_v1_20260101.md');
    await expect(errors).toContainText('작성 규칙');
    await page.goto('/postings/1?tab=tailored');
    await expect(page.getByTestId('tailored-kit-errors')).toContainText('만들 수 없습니다(오류');
  });

  test('TC-TAILOR-E2E-01 예시 키트: 직무·프로필 표·부품 짝, 같은 내용은 새 버전을 만들지 않는다', async ({ page }) => {
    await uploadKit(page, kitFixtureFiles());
    await toast(page, '키트를 올렸습니다');
    await expect(page.getByTestId('kit-errors')).toHaveCount(0);
    await expect(page.getByTestId('kit-tracks')).toContainText('백엔드(기본 B1)');
    await expect(page.getByTestId('kit-tracks')).toContainText('데이터(기본 D1)');
    const profiles = page.getByTestId('kit-profiles');
    await expect(profiles.locator('tbody tr')).toHaveCount(4);
    await expect(profiles).toContainText('B2');
    await expect(page.getByTestId('kit-files')).toContainText('PDF 스타일');
    const pairs = page.getByTestId('kit-pairs-백엔드');
    await expect(pairs).toContainText('API 설계');
    await expect(pairs).not.toContainText('찾지 못함');
    // 키트 파일 안의 문장·수치는 화면에 펼치지 않는다
    await expect(page.getByTestId('kit-tab')).not.toContainText('120ms');
    kitVersions = (await page.getByTestId('kit-history').locator('span').count()) || 0;

    await pickKitFiles(page, kitFixtureFiles());
    await page.getByRole('button', { name: '키트 파일 올리기' }).click();
    await toast(page, '바뀐 파일이 없습니다');
    await expect(page.getByTestId('kit-history').locator('span')).toHaveCount(kitVersions);
  });

  test('올리기 한도 오류는 화면에 한국어로 보인다', async ({ page }) => {
    await page.goto('/resume?tab=kit');
    const many = Array.from({ length: 11 }, (_, i) => md(`많은파일${i}.md`, 'x'));
    await pickKitFiles(page, many);
    await page.getByRole('button', { name: '키트 파일 올리기' }).click();
    await expect(page.getByTestId('kit-upload').getByRole('alert')).toContainText('10개');
  });
});

test.describe('맞춤 이력서 탭: 프로필 고르기와 조립', () => {
  test('TC-TAILOR-E2E-13 분석 탭 추천 줄과 링크가 맞춤 이력서 탭으로 간다', async ({ page }) => {
    setFake('seeded', {});
    a = await registerByPaste(page, POSTING_A);
    await waitAnalyzed(page);
    const line = page.getByTestId('profile-rec-line');
    await expect(line).toContainText('추천 프로필 B2');
    await expect(line).toContainText('95%');
    await expect(line).toContainText('다음 B1 80%');
    await line.getByRole('link', { name: '→ 맞춤 이력서 탭' }).click();
    await expect(page).toHaveURL(new RegExp(`/postings/${a}\\?tab=tailored`));
    await expect(page.getByTestId('profile-picker')).toBeVisible();
    await page.goto(`/postings/${a}`);
    await expect(page.getByTestId('advice-tailored-link')).toHaveAttribute('href', `/postings/${a}?tab=tailored`);
  });

  test('TC-TAILOR-E2E-02 AI 추천 순서·추천 표시·추가 조정 미리 체크 → [맞춤본 만들기] → 바로 r1', async ({ page }) => {
    await page.goto(tab(a));
    await expect(page.getByTestId('picker-basis')).toContainText('AI 추천 (공고 분석');
    const picks = page.locator('[data-testid^="pick-"]');
    await expect(picks).toHaveCount(2);
    await expect(picks.nth(0)).toContainText('B2');
    await expect(picks.nth(0)).toContainText('95%');
    await expect(picks.nth(0)).toContainText('추천');
    await expect(picks.nth(0)).toContainText('성능 · 트래픽 · 캐시');
    await expect(picks.nth(1)).toContainText('80%');
    await expect(picks.nth(0).getByRole('radio')).toBeChecked();
    const adj = page.getByTestId('profile-picker').getByRole('checkbox');
    await expect(adj).toHaveCount(3);
    await expect(adj.nth(0)).toBeChecked(); // 추천된 추가 조정은 미리 체크
    await expect(adj.nth(1)).toBeChecked();
    await expect(adj.nth(2)).not.toBeChecked();
    await page.getByRole('button', { name: '맞춤본 만들기' }).click();
    await toast(page, '맞춤본을 만들었습니다');
    await expect(page.getByTestId('profile-line')).toContainText('B2 성능');
    await expect(page.getByTestId('profile-line')).toContainText('추가 조정 2');
    await expect(page.getByLabel('리비전 선택')).toContainText('r1');
    await expect(page.getByLabel('리비전 선택')).toContainText('조립');
    await expect(page.getByRole('status').filter({ hasText: '맞춤 작업' })).toHaveCount(0); // 작업 큐·진행 표시 없음
    await expect(page.getByTestId('pending-adjustments')).toContainText('직접 추가한다');
    await expect(page.getByTestId('changes')).toContainText('자기소개: B2 후보');
    await expect(page.getByTestId('auto-checks')).toHaveCount(0);
    await expect(page.getByTestId('checklist')).toContainText('자동 검사는 용어 맞추기');
    expect(fakeCalls('seeded').filter((c) => c.kind === 'tailor_resume')).toHaveLength(0);
  });

  test('분석 전 추천이 없는 공고는 단어 수 기준 추천과 [AI 추천 받기]를 보인다', async ({ page }) => {
    await page.goto('/postings/5?tab=tailored'); // 시드 공고: 키트 없이 분석됨
    await expect(page.getByTestId('picker-basis')).toContainText('단어 수 기준 추천 (AI 추천 아님)');
    await expect(page.getByRole('button', { name: 'AI 추천 받기 (다시 분석)' })).toBeEnabled();
  });

  test('TC-TAILOR-E2E-07 본문을 읽지 못한 공고는 만들기가 비활성이고 안내가 보인다', async ({ page }) => {
    await page.goto('/postings/8?tab=tailored'); // 시드: 본문 추출 실패
    await expect(page.getByRole('button', { name: '맞춤본 만들기' })).toBeDisabled();
    await expect(page.getByTestId('tailored-empty')).toContainText('공고 본문을 읽은 뒤 만들 수 있습니다');
  });
});

test.describe('용어 맞추기·다듬기·리비전', () => {
  test('TC-TAILOR-E2E-03 [공고 용어 맞추기] → 진행 → r2, 자동 검사 경고, 바뀐 곳에 이유', async ({ page }) => {
    setFake('seeded', { delayMs: 4000 });
    await page.goto(tab(a));
    await page.getByRole('button', { name: '공고 용어 맞추기 (AI)' }).click();
    await expect(page.getByRole('status').filter({ hasText: '공고 용어 맞추는 중' })).toBeVisible();
    await expect(page.getByRole('button', { name: '공고 용어 맞추기 (AI)' })).toBeDisabled();
    await expect(page.getByLabel('리비전 선택')).toContainText('r2', { timeout: 30_000 });
    await expect(page.getByLabel('리비전 선택')).toContainText('공고 용어 맞춤');
    const warn = page.getByTestId('confirm-warnings');
    await expect(warn).toContainText('확인 필요');
    await expect(warn).toContainText('99%');
    await expect(page.getByTestId('notices')).toContainText('자기소개를 조립본 값으로 되돌림');
    await expect(page.getByTestId('revision-diff')).toContainText('백엔드 개발');
    await expect(page.getByTestId('change-reasons')).toContainText('공고 단어 "백엔드"에 맞춤');
    await expect(page.getByTestId('pending-adjustments')).toContainText('AI가 반영했는지 확인하세요');
    await expect(page.getByTestId('auto-checks').locator('li').first()).toContainText('새 수치');
    const calls = fakeCalls('seeded').filter((c) => c.kind === 'tailor_resume');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'opus', tools: '' });
    setFake('seeded', {});
  });

  test('TC-TAILOR-E2E-04 다듬기: 빈 입력은 비활성, 요청하면 r3, 이전 리비전은 ?rev=로 본다', async ({ page }) => {
    await page.goto(tab(a));
    const send = page.getByRole('button', { name: '수정 요청' });
    await expect(send).toBeDisabled();
    await page.getByLabel('다듬기 요청').fill('주요 성과 1의 병목 설명을 더 구체적으로');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByLabel('리비전 선택')).toContainText('r3', { timeout: 30_000 });
    await expect(page.getByTestId('request-line')).toContainText('요청: 주요 성과 1의 병목 설명을 더 구체적으로');
    await expect(page.getByTestId('revision-diff')).toContainText('요청 반영');
    expect(fakeCalls('seeded').filter((c) => c.kind === 'revise_tailored')).toHaveLength(1);

    await page.getByLabel('리비전 선택').selectOption({ index: 2 }); // 가장 오래된 r1
    await expect(page).toHaveURL(/rev=\d+/);
    await expect(page.getByText('이전 리비전을 보고 있습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '수정 요청' })).toHaveCount(0);
    await expect(page.getByTestId('profile-line')).toContainText('B2');
    await page.getByRole('link', { name: '최신 리비전 보기' }).click();
    await expect(page.getByLabel('리비전 선택')).toHaveValue(/\d+/);
    await expect(page.getByRole('button', { name: '수정 요청' })).toBeVisible();
  });

  test('실패한 맞춤 작업은 [다시 시도]로 같은 내용을 다시 요청한다', async ({ page }) => {
    setFake('seeded', { mode: 'limit' });
    await page.goto(tab(a));
    await page.getByLabel('다듬기 요청').fill('실패 확인용 요청');
    await page.getByRole('button', { name: '수정 요청' }).click();
    const fail = page.getByRole('alert').filter({ hasText: '다듬기에 실패했습니다' });
    await expect(fail).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('리비전 선택')).toContainText('r3'); // 이전 리비전은 그대로
    setFake('seeded', {});
    await fail.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.getByLabel('리비전 선택')).toContainText('r4', { timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: '다듬기에 실패했습니다' })).toHaveCount(0);
    await expect(page.getByTestId('request-line')).toContainText('실패 확인용 요청');
  });

  test('TC-TAILOR-E2E-12 제출 전 체크리스트는 새로고침 뒤에도 이 브라우저에 남는다', async ({ page }) => {
    await page.goto(tab(a));
    const box = page.getByTestId('manual-checklist').getByLabel('회사 이름이 맞는지 확인');
    await expect(box).not.toBeChecked();
    await box.check();
    await page.reload();
    await expect(page.getByTestId('manual-checklist').getByLabel('회사 이름이 맞는지 확인')).toBeChecked();
    await expect(page.getByTestId('manual-checklist').getByLabel('날짜와 숫자를 확인')).not.toBeChecked();
  });

  test('TC-TAILOR-E2E-05 내려받기: PDF·md 링크와 파일 이름, 미리보기 전환', async ({ page, request }) => {
    await page.goto(tab(a));
    const dl = page.getByTestId('downloads');
    const href = await dl.getByRole('link', { name: '이력서 PDF' }).getAttribute('href');
    const res = await request.get(href!);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(decodeURIComponent(res.headers()['content-disposition'])).toContain('홍길동_이력서_백엔드.pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const career = await request.get((await dl.getByRole('link', { name: '경력기술서 PDF' }).getAttribute('href'))!);
    expect(decodeURIComponent(career.headers()['content-disposition'])).toContain('홍길동_경력기술서_백엔드.pdf');
    await dl.getByText('md 받기').click();
    const mdRes = await request.get((await dl.getByRole('link', { name: '이력서.md' }).getAttribute('href'))!);
    expect(mdRes.headers()['content-type']).toBe('text/markdown; charset=utf-8');
    expect(await mdRes.text()).toContain('# 홍길동 · 백엔드 개발자');
    const posting = await request.get((await dl.getByRole('link', { name: '공고.md' }).getAttribute('href'))!);
    expect(decodeURIComponent(posting.headers()['content-disposition'])).toContain('공고.md');
    expect(await posting.text()).toContain('맞춤테스트A');

    const frame = page.frameLocator('iframe[title="미리보기"]');
    await expect(frame.locator('section.sec').first()).toBeVisible();
    await page.getByTestId('tailored-preview').getByRole('tab', { name: '경력기술서' }).click();
    await expect(frame.locator('body')).toContainText('가상커머스');
    await expect(page.getByRole('link', { name: '새 탭에서 크게 보기 ↗' })).toHaveAttribute('href', /format=html&inline=1/);
  });
});

test.describe('작업 공간 요청 (D-30 a)', () => {
  test('TC-TAILOR-E2E-14 권유 줄(남은 추가 조정), 요청문 복사·받기, 결과 올리기 → 작업 공간 리비전', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(tab(a));
    const rec = page.getByTestId('handoff-recommend');
    await expect(rec).toContainText('이력서 작업 공간에 요청해 볼 만합니다');
    await expect(rec).toContainText('남은 추가 조정이 있음');
    await rec.getByRole('textbox').fill('결제 경험을 앞에 두고 싶습니다');
    await rec.getByRole('button', { name: '요청문 복사' }).click();
    await expect(rec.getByText('복사됨')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('# 공고 특화 이력서 요청');
    expect(copied).toContain('결제 경험을 앞에 두고 싶습니다');
    expect(copied).toContain('맞춤테스트A');
    expect(copied).toContain('B2 성능 95%');
    expect(copied).not.toContain('## 핵심 역량'); // 조립 결과 전문은 넣지 않는다

    const [download] = await Promise.all([page.waitForEvent('download'), rec.getByRole('button', { name: '요청문 받기 (.md)' }).click()]);
    expect(download.suggestedFilename()).toContain('.md');
    const path = await download.path();
    expect(readFileSync(path, 'utf8')).toContain('결제 경험을 앞에 두고 싶습니다');

    // 결과 올리기: 자기소개를 바꾼 이력서.md
    const resume = readFileSync(join(KIT_DIR, '이력서_백엔드_v1_20260101.md'), 'utf8').replace('범용 백엔드 개발자로 안정적인 서비스를 만듭니다.', '작업 공간에서 새로 쓴 자기소개입니다.');
    await rec.getByRole('button', { name: '결과 올리기' }).click();
    const dlg = page.getByRole('dialog', { name: '작업 공간 결과 올리기' });
    await dlg.getByLabel('이력서.md').setInputFiles(md('이력서.md', resume));
    await dlg.getByLabel('경력기술서.md').setInputFiles(md('경력기술서.md', readFileSync(join(KIT_DIR, '경력기술서_백엔드.md'))));
    await expect(dlg.getByLabel('프로필')).toHaveValue('B2'); // 지금 값이 기본
    await expect(dlg.getByTestId('ext-profile-full')).toContainText('성능');
    // 추가 조정 체크박스는 작게, 왼쪽 정렬로 문구 앞에 붙는다
    const chk = dlg.locator('label.chk').first();
    const boxes = await chk.evaluate((l) => {
      const i = l.querySelector('input')!.getBoundingClientRect();
      const lb = l.getBoundingClientRect();
      return { w: i.width, left: i.left - lb.left };
    });
    expect(boxes.w).toBeLessThanOrEqual(20);
    expect(boxes.left).toBeLessThanOrEqual(4);
    await dlg.getByRole('button', { name: '올리기' }).click();
    await toast(page, '작업 공간 결과를 올렸습니다');
    await expect(page.getByLabel('리비전 선택')).toContainText('작업 공간');
    await expect(page.getByTestId('confirm-warnings')).toContainText('자기소개가 조립본과 다릅니다');
    await expect(page.getByTestId('pending-adjustments')).toHaveCount(0); // 작업 공간 결과 뒤 남은 조정 권유는 사라진다
    await expect(page.getByTestId('handoff-recommend')).toContainText('확인 필요 경고가 남음');
    await expect(page.getByTestId('handoff-recommend')).not.toContainText('남은 추가 조정이 있음');
  });

  test('TC-TAILOR-E2E-14 추천도 60% 미만 권유와 AI가 요청을 권한 경우', async ({ page }) => {
    setFake('seeded', {});
    b = await registerByPaste(page, POSTING_B);
    await waitAnalyzed(page);
    await page.goto(tab(b));
    await expect(page.locator('[data-testid^="pick-"]').first()).toContainText('55%');
    await page.getByRole('button', { name: '맞춤본 만들기' }).click();
    await toast(page, '맞춤본을 만들었습니다');
    const rec = page.getByTestId('handoff-recommend');
    await expect(rec).toContainText('추천도가 60% 미만');
    await expect(rec).not.toContainText('AI가 허용 범위');
    setFake('seeded', { needsWorkspace: true });
    await page.getByRole('button', { name: '공고 용어 맞추기 (AI)' }).click();
    await expect(page.getByLabel('리비전 선택')).toContainText('r2', { timeout: 30_000 });
    await expect(page.getByTestId('handoff-recommend')).toContainText('AI가 허용 범위 안에서는 맞추기 어렵다고 표시');
    setFake('seeded', {});
  });
});

test.describe('제출 서류 선택', () => {
  test('TC-TAILOR-E2E-08 지원 완료 기본값은 최신 맞춤 리비전, 저장만 눌러도 기록되고 [보기]가 PDF를 연다', async ({ page, request }) => {
    await page.goto(`/postings/${a}`);
    await page.getByRole('button', { name: '지원 완료', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: '지원 완료로 기록' });
    const resume = dlg.getByLabel('이력서', { exact: true });
    await expect(resume).toHaveValue(/^tailored:\d+$/);
    await expect(resume.locator('option:checked')).toContainText('맞춤 이력서 r5 · B2');
    await expect(dlg.getByLabel('경력기술서')).toBeVisible();
    await expect(dlg.getByLabel('포트폴리오')).toBeVisible();
    // select 안은 프로필 id까지, 전체 이름은 아래에 줄바꿈되어 다 보인다
    await expect(resume.locator('option:checked')).toHaveText(/^맞춤 이력서 r5 · B2$/);
    await expect(dlg.getByTestId('doc-full-resume')).toHaveText('맞춤 이력서 r5 · B2 성능');
    // 기본 서류 선택지도 있다
    await expect(resume.locator('option', { hasText: '기본 서류 백엔드 · B1' })).toHaveCount(1);
    await expect(resume.locator('option', { hasText: '기본 서류 데이터 · D1' })).toHaveCount(1);
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 완료로 저장했습니다');

    await page.goto(`/postings/${a}?tab=record`);
    await expect(page.getByText('제출한 이력서').locator('..')).toContainText('맞춤 이력서 r5 (B2');
    const docs = page.getByTestId('submitted-docs');
    await expect(docs.getByTestId('resume-line')).toHaveText('맞춤 이력서 r5');
    const href = await docs.getByRole('link', { name: '보기' }).first().getAttribute('href');
    expect(href).toMatch(/^\/api\/tailored\/\d+\/resume\?inline=1$/);
    const res = await request.get(href!);
    expect(res.headers()['content-type']).toBe('application/pdf');
    await page.goto('/?view=resume');
    await expect(page.locator('.group-head', { hasText: '맞춤 이력서' }).first()).toBeVisible();
  });

  test('TC-TAILOR-E2E-10 기록 수정 창에서 이력서를 기본 서류로 바꾸면 라벨이 바뀐다', async ({ page }) => {
    await page.goto(`/postings/${a}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    const resume = dlg.getByLabel('이력서', { exact: true });
    await expect(resume).toHaveValue(/^tailored:\d+$/); // 지금 값이 처음 선택값
    await resume.selectOption({ label: '기본 서류 백엔드 · B1' });
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 기록을 고쳤습니다');
    await expect(page.getByText('제출한 이력서').locator('..')).toContainText('기본 서류 백엔드 (B1 범용)');
    await expect(page.getByTestId('resume-line')).toHaveText('기본 서류 백엔드');
    const href = await page.getByTestId('submitted-docs').getByRole('link', { name: '보기' }).first().getAttribute('href');
    expect(href).toContain('/api/kit/');
  });

  test('수정 창을 열고 다른 칸만 고쳐도 제출 서류는 바뀌지 않는다', async ({ page }) => {
    await page.goto(`/postings/${a}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    await dlg.getByLabel('포지션').fill('백엔드 서버 개발자 (수정)');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 기록을 고쳤습니다');
    await expect(page.getByTestId('resume-line')).toHaveText('기본 서류 백엔드');
  });
});

test.describe('키트 바뀜과 배치', () => {
  test('TC-TAILOR-E2E-06 새 키트를 올리면 안내가 뜨고 [새 키트로 다시 조립]이 같은 레시피로 새 리비전을 만든다', async ({ page }) => {
    await uploadKit(page, kitFixtureFiles({ masterExtra: '- 가상의 추가 사실 한 줄', longName: true }));
    await toast(page, '키트를 올렸습니다');
    await page.goto(tab(b));
    const changed = page.getByTestId('kit-changed');
    await expect(changed).toContainText('이 맞춤본은');
    await expect(changed).toContainText('기준입니다. 지금 키트는');
    await changed.getByRole('button', { name: '새 키트로 다시 조립' }).click();
    await toast(page, '새 키트로 다시 조립했습니다');
    await expect(page.getByLabel('리비전 선택')).toContainText('r3');
    await expect(page.getByTestId('kit-changed')).toHaveCount(0);
    await expect(page.getByTestId('profile-line')).toContainText('B1');
  });

  test('TC-TAILOR-E2E-09 폭 1024·1240·1440에서 긴 프로필 이름·긴 요청이 잘리거나 넘치지 않는다', async ({ page }) => {
    // 긴 이름의 프로필로 새 맞춤본을 만들고, 줄바꿈 없는 긴 요청과 긴 한글 요청을 남긴다
    setFake('seeded', {});
    await page.goto(tab(a));
    await page.getByRole('button', { name: '프로필 바꾸기' }).click();
    const picker = page.locator('[data-testid="profile-picker"]');
    await picker.locator('label.pick', { hasText: LONG_PROFILE }).getByRole('radio').check();
    await picker.getByRole('button', { name: '맞춤본 만들기' }).click();
    await toast(page, '맞춤본을 만들었습니다');
    const longRequest = `${'가'.repeat(5)} ${'Abcdefghij'.repeat(30)} 긴한글요청을공백없이이어서쓰면어떻게보이는지확인하는문장입니다`;
    await page.getByLabel('다듬기 요청').fill(longRequest);
    await page.getByRole('button', { name: '수정 요청' }).click();
    await expect(page.getByTestId('request-line')).toContainText('Abcdefghij', { timeout: 30_000 });
    for (const width of [1024, 1240, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(tab(a));
      await expect(page.getByTestId('profile-line')).toContainText(LONG_PROFILE);
      expect(await noOverflow(page), `폭 ${width}: 가로 스크롤`).toBe(true);
      const fits = await page.getByTestId('tailored-tab').evaluate((root) => {
        const bad: string[] = [];
        const limit = root.getBoundingClientRect().right + 1;
        for (const el of root.querySelectorAll<HTMLElement>('*')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > limit && getComputedStyle(el).position !== 'fixed') bad.push(el.tagName + '.' + el.className);
        }
        return bad.slice(0, 5);
      });
      expect(fits, `폭 ${width}: 칸 밖으로 나간 요소`).toEqual([]);
      const wb = await page.getByTestId('request-line').evaluate((el) => ({ b: getComputedStyle(el).wordBreak, w: getComputedStyle(el).overflowWrap }));
      expect(wb).toEqual({ b: 'keep-all', w: 'anywhere' });
      await expect(page.getByTestId('tailored-preview')).toBeVisible();
      const preview = await page.getByTestId('tailored-preview').boundingBox();
      if (width >= 1100) expect(preview!.width).toBeLessThanOrEqual(361);
      await page.screenshot({ path: `test-results/tailored-${width}.png`, fullPage: true });

      await page.goto('/resume?tab=kit');
      await expect(page.getByTestId('kit-parsed')).toBeVisible();
      expect(await noOverflow(page), `폭 ${width}: 키트 탭 가로 스크롤`).toBe(true);
      // 직무 칸의 한글 낱말이 줄 중간에서 끊기지 않는다(한 줄)
      const lines = await page
        .getByTestId('kit-profiles')
        .locator('tbody tr td:first-child')
        .evaluateAll((tds) =>
          tds.map((td) => {
            const r = document.createRange();
            r.selectNodeContents(td);
            return { lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size, over: td.scrollWidth > td.clientWidth + 1 };
          }),
        );
      for (const l of lines) expect(l, `폭 ${width}: 직무 칸`).toEqual({ lines: 1, over: false });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('설정의 작업별 모델에 맞춤 이력서 작업 2종이 있고 바꾸면 다음 호출에 적용된다', async ({ page }) => {
    await page.goto('/settings');
    const sel = page.getByLabel('맞춤 이력서 공고 용어 맞추기 모델');
    await expect(sel).toHaveValue('opus');
    await expect(page.getByLabel('맞춤 이력서 다듬기 모델')).toHaveValue('opus');
    await sel.selectOption('sonnet');
    await toast(page, '모델을 저장했습니다');
    await page.goto(tab(b));
    await page.getByRole('button', { name: '공고 용어 맞추기 (AI)' }).click();
    await expect.poll(() => fakeCalls('seeded').filter((c) => c.kind === 'tailor_resume').at(-1)?.model, { timeout: 30_000 }).toBe('sonnet');
    await page.goto('/settings');
    await page.getByLabel('맞춤 이력서 공고 용어 맞추기 모델').selectOption('opus');
    await toast(page, '모델을 저장했습니다');
  });
});

test.describe('기본 이력서 버전 비교', () => {
  test('TC-RESUME-DIFF-E2E 버전 기록에서 직전 버전과 비교한다', async ({ page }) => {
    await page.goto('/resume?tab=ver');
    const versions = page.locator('.vlist button');
    const n = await versions.count();
    if (n < 2) {
      await versions.first().click();
      await page.getByRole('tab', { name: '직전 버전과 비교' }).click();
      await expect(page.getByTestId('version-diff')).toContainText('첫 버전입니다');
      return;
    }
    await versions.nth(0).click();
    await page.getByRole('tab', { name: '직전 버전과 비교' }).click();
    await expect(page.getByTestId('version-diff')).toBeVisible();
    await versions.nth(n - 1).click();
    await expect(page.getByTestId('version-diff')).toContainText('첫 버전입니다');
    await page.getByRole('tab', { name: '내용' }).click();
    await expect(page.getByTestId('version-diff')).toHaveCount(0);
  });
});
