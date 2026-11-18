// 설정: Claude Code 상태, 로그인 확인(짧은 호출 1회), 작업별 모델, 데이터 경로.
import { expect, test } from '@playwright/test';
import { dataDir } from './paths';
import { fakeCalls, setFake, toast, waitAnalyzed } from './helpers';

test.beforeEach(() => setFake('seeded', {}));
test.afterAll(() => setFake('seeded', {}));

test.describe.serial('설정 화면', () => {
  test('TC-SETTINGS-01 설치 상태·버전·데이터 폴더·최근 백업이 보인다', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
    await expect(page.getByText('설치됨, 버전 2.1.999.')).toBeVisible();
    await expect(page.locator('.mono-path')).toHaveText(dataDir('seeded'));
    await expect(page.getByText(/최근 자동 백업:/)).toBeVisible();
    await expect(page.getByText('사용량이 조금 듭니다')).toBeVisible(); // 로그인 확인 비용 안내
    await expect(page.getByText('앱은 비밀번호를 저장하지 않습니다.')).toBeVisible();
    for (const s of ['리멤버', '원티드', '그룹바이', '잡코리아']) {
      await expect(page.locator('.login-site').filter({ hasText: s }).getByRole('button', { name: '로그인 창 열기' })).toBeEnabled();
    }
  });

  test('TC-SETTINGS-02 페이지를 열 때는 모델을 부르지 않고, [로그인 확인]을 눌러야 haiku로 1회 호출', async ({ page }) => {
    const before = fakeCalls('seeded').length;
    await page.goto('/settings');
    await expect(page.getByText('설치됨')).toBeVisible();
    expect(fakeCalls('seeded').length).toBe(before); // --version 만 실행(기록 대상 아님)
    await page.getByRole('button', { name: '로그인 확인' }).click();
    await expect(page.getByText(/로그인되어 있습니다\./)).toBeVisible();
    const calls = fakeCalls('seeded').slice(before);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'health', model: 'haiku', tools: '' });
    await page.reload();
    await expect(page.getByText(/로그인되어 있습니다\..*확인\)/)).toBeVisible(); // 마지막 확인 결과가 남는다
  });

  test('TC-SETTINGS-03 로그인 안 됨이면 터미널 로그인 안내', async ({ page }) => {
    setFake('seeded', { mode: 'auth' });
    await page.goto('/settings');
    await page.getByRole('button', { name: '로그인 확인' }).click();
    await expect(page.getByText(/로그인이 필요합니다\. 터미널에서 `claude`를 실행해 로그인하세요\./)).toBeVisible();
  });

  test('TC-SETTINGS-04 기본 모델: 분석 opus, 가져오기 2종 sonnet(D-05)', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByLabel('공고 분석 모델')).toHaveValue('opus');
    await expect(page.getByLabel('이력서 가져오기 모델')).toHaveValue('sonnet');
    await expect(page.getByLabel('지원 내역 가져오기 모델')).toHaveValue('sonnet');
  });

  test('TC-SETTINGS-05 모델을 바꾸면 바로 저장되고 새로고침 후에도 유지, 다음 분석에 실제로 쓰인다', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('공고 분석 모델').selectOption('haiku');
    await toast(page, '모델을 저장했습니다');
    await page.reload();
    await expect(page.getByLabel('공고 분석 모델')).toHaveValue('haiku');
    await page.goto('/postings/5');
    await page.getByRole('button', { name: '다시 분석' }).click();
    await waitAnalyzed(page);
    await expect.poll(() => fakeCalls('seeded').filter((c) => c.kind === 'analyze_posting').at(-1)?.model).toBe('haiku');
    // 되돌림
    await page.goto('/settings');
    await page.getByLabel('공고 분석 모델').selectOption('opus');
    await toast(page, '모델을 저장했습니다');
  });

  test('TC-SETTINGS-06 분석 호출 옵션: 도구 없음, 안전 옵션, 프롬프트는 인자가 아니라 표준입력', async ({ page }) => {
    await page.goto('/postings/5');
    await page.getByRole('button', { name: '다시 분석' }).click();
    await waitAnalyzed(page);
    const call = fakeCalls('seeded').filter((c) => c.kind === 'analyze_posting').at(-1)!;
    expect(call.tools).toBe('');
    for (const flag of ['-p', '--safe-mode', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--output-format', 'json']) {
      expect(call.args).toContain(flag);
    }
    expect(call.args).not.toContain('--bare');
    expect(call.args.every((a) => a.length < 20_000)).toBe(true); // 큰 본문은 인자로 가지 않는다
    expect(call.args.some((a) => a.includes('Kafka') || a.includes('결제 서버'))).toBe(false); // 이력서·공고 내용이 인자에 없다
  });
});
