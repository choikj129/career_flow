// 기본 이력서 첫 등록: 파일·텍스트 가져오기 → 저장 전 검토 → 저장(v1) → 같은 내용 저장 시 버전 안 늘어남.
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';
import { fakeCalls, registerByPaste, setFake, toast, waitAnalyzed } from './helpers';

test.beforeEach(() => setFake('empty', {}));
test.afterAll(() => setFake('empty', {}));

const TEXT = '이름: 김테스트\n요약: 결제 백엔드 개발자\n회사: 테스트랩\n직무: 서버 개발자';

test.describe.serial('기본 이력서 첫 등록', () => {
  test('TC-RESUME-13 처음 화면: 안내와 [가져오기] 비활성', async ({ page }) => {
    await page.goto('/resume');
    await expect(page.getByText('기존 이력서를 올려 시작하세요.')).toBeVisible();
    await expect(page.getByText('PDF·DOCX·TXT·MD, 파일당 20MB까지')).toBeVisible();
    await expect(page.getByRole('button', { name: '가져오기' })).toBeDisabled();
    await page.getByLabel('또는 텍스트 붙여넣기').fill('내용');
    await expect(page.getByRole('button', { name: '가져오기' })).toBeEnabled();
  });

  test('TC-RESUME-14 지원하지 않는 파일·20MB 초과 파일은 사유와 함께 제외', async ({ page }) => {
    await page.goto('/resume');
    await page.locator('#files').setInputFiles([
      { name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
      { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
      { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    ]);
    await expect(page.getByText(/virus\.exe — 지원하지 않는 형식입니다.*이 파일은 제외됩니다/)).toBeVisible();
    await expect(page.getByText(/huge\.pdf — 20MB를 넘습니다/)).toBeVisible();
    await expect(page.getByText(/empty\.txt — 빈 파일입니다/)).toBeVisible();
    await expect(page.getByRole('button', { name: '가져오기' })).toBeDisabled();
  });

  test('TC-RESUME-15 가져오기 실패: 실패 문구, [직접 입력으로 시작], 저장 전 이탈 확인', async ({ page }) => {
    setFake('empty', { mode: 'auth' });
    await page.goto('/resume');
    await page.getByLabel('또는 텍스트 붙여넣기').fill(TEXT);
    await page.getByRole('button', { name: '가져오기' }).click();
    await page.waitForURL(/\/resume\?job=\d+/);
    const card = page.locator('.fail-card');
    await expect(card).toContainText('가져오기에 실패했습니다');
    await expect(card).toContainText('Claude Code 로그인이 필요합니다');
    await card.getByRole('link', { name: '직접 입력으로 시작' }).click();
    await expect(page.getByText('직접 입력하는 중입니다')).toBeVisible();
    await expect(page.getByText('아직 저장되지 않았습니다. 내용을 입력하고 저장하세요.')).toBeVisible();
    // 저장하지 않고 앱 안 링크로 떠나면 확인 창
    await page.getByRole('link', { name: '대시보드' }).click();
    await expect(page.getByRole('dialog', { name: '저장하지 않고 나갈까요?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '나가기' }).click();
    await expect(page).toHaveURL(/:3941\/$/);
  });

  test('TC-RESUME-16 파일+텍스트 가져오기 → 저장 전 검토 → 저장(v1), 업로드는 경로 조작이 막힌다', async ({ page }) => {
    await page.goto('/resume');
    await page.locator('#files').setInputFiles({ name: '../../evil.txt', mimeType: 'text/plain', buffer: Buffer.from('경력기술서 본문') });
    await page.getByLabel('또는 텍스트 붙여넣기').fill(TEXT);
    await page.getByRole('button', { name: '가져오기' }).click();
    await page.waitForURL(/\/resume\?job=\d+/);
    await expect(page.getByText('가져온 내용을 검토하는 중입니다')).toBeVisible();
    await expect(page.getByText('아직 저장되지 않았습니다. 내용을 확인하고 저장하세요.')).toBeVisible();
    await expect(page.getByLabel('한 줄 소개')).toHaveValue('결제 백엔드 개발자');
    await expect(page.getByRole('textbox', { name: '이름' }).first()).toHaveValue('김테스트');

    // 업로드 파일은 uploads/resume 안에만 저장된다
    const up = join(dataDir('empty'), 'uploads', 'resume');
    expect(readdirSync(up).some((f) => f.endsWith('evil.txt'))).toBe(true);
    expect(existsSync(join(dataDir('empty'), 'evil.txt'))).toBe(false);
    expect(existsSync(join(dataDir('empty'), '..', 'evil.txt'))).toBe(false);
    // 파일은 Read 도구만 허용하는 sonnet 작업으로 전달됐다
    const call = fakeCalls('empty').filter((c) => c.kind === 'import_resume').at(-1)!;
    expect(call.tools).toBe('Read');
    expect(call.model).toBe('sonnet');

    await page.getByLabel('변경 메모').fill('');
    await page.getByRole('button', { name: '기본 이력서로 저장' }).click();
    await toast(page, '이력서를 저장했습니다');
    await expect(page.locator('.ver')).toContainText('v1');
    await expect(page.locator('.ver')).toContainText('처음 등록');
  });

  test('TC-RESUME-17 저장 직후 같은 내용으로 다시 저장해도 버전이 늘지 않는다', async ({ page }) => {
    await page.goto('/resume');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await toast(page, '바뀐 내용이 없습니다');
    await page.getByRole('tab', { name: '버전 기록' }).click();
    await expect(page.locator('.vlist button')).toHaveCount(1);
    await expect(page.locator('.vlist button').first()).toContainText('처음 등록');
  });

  test('TC-RESUME-18 이력서가 생기면 안내 줄·경고가 사라지고 분석이 v1 기준으로 된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.notice.warn')).toHaveCount(0);
    await page.goto('/postings/new');
    await expect(page.locator('.notice.warn')).toHaveCount(0);
    await registerByPaste(page, '회사명: 첫회사\n적합도: 90\n주요업무\n- 개발');
    await waitAnalyzed(page);
    await expect(page.getByText('기본 이력서 v1 기준')).toBeVisible();
    await expect(page.locator('.score')).toContainText('90');
  });

  test('TC-RESUME-19 이력서가 있으면 /resume?manual=1 이나 ?job= 로 첫 등록 화면이 다시 열리지 않는다', async ({ page }) => {
    await page.goto('/resume?manual=1');
    await expect(page.getByText('직접 입력하는 중입니다')).toHaveCount(0);
    await expect(page.locator('.ver')).toContainText('v1');
  });
});
