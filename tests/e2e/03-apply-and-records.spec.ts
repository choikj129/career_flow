// 지원 완료 → 대시보드 반영, 상태 변경, 기록 수정·삭제, 공고 삭제, 기록만 행의 수정·삭제.
import { expect, test } from '@playwright/test';
import { registerByPaste, setFake, toast, waitAnalyzed } from './helpers';

const body = (lines: string[]) => lines.join('\n') + '\n주요업무\n- 결제 서버 개발';

test.afterAll(() => setFake('seeded', {}));

test.describe.serial('지원 완료부터 삭제까지(공고 하나의 일생)', () => {
  let id = 0;

  test('TC-DETAIL-01 분석이 끝나면 [지원 완료] 폼: 기본값과 저장', async ({ page }) => {
    setFake('seeded', {});
    id = await registerByPaste(page, body(['회사명: 지원테스트', '포지션: 지원 서버', '적합도: 70']));
    await waitAnalyzed(page);
    await expect(page.getByRole('button', { name: '공고 삭제' })).toBeVisible(); // 지원 전에는 삭제 가능
    await page.getByRole('button', { name: '지원 완료' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 완료로 기록' });
    await expect(dlg.getByLabel('지원일')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(dlg.getByLabel('지원 사이트')).toHaveValue('other');
    await expect(dlg.getByLabel('출처 이름')).toBeVisible();
    await dlg.getByLabel('지원 사이트').selectOption('wanted');
    await expect(dlg.getByLabel('출처 이름')).toHaveCount(0); // 기타일 때만
    await dlg.getByLabel('지원일').fill('2026-11-17');
    await dlg.getByLabel('메모').fill('첫 메모');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 완료로 저장했습니다');
    const state = page.locator('.p-state');
    await expect(state).toContainText('지원');
    await expect(state).toContainText('2026-11-17');
    await expect(state).toContainText('원티드');
    await expect(page.getByRole('button', { name: '지원 완료' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '공고 삭제' })).toHaveCount(0); // 지원 기록이 있으면 삭제 불가
  });

  test('TC-DASH-20 지원 완료한 공고가 대시보드에 반영된다', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('지원테스트')}`);
    const row = page.locator('tbody tr.row-link').filter({ hasText: '지원테스트' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('지원 서버');
    await expect(row).toContainText('2026-11-17');
    await expect(row).toContainText('기본 v2'); // 제출한 이력서(지원 시점의 기본 이력서)
    await expect(row).toContainText('70');
    await expect(row.locator('.tag-rec')).toHaveCount(0);
    // 분석한 공고에서는 빠진다
    await page.goto('/postings/analyzed');
    await expect(page.getByRole('row', { name: /지원테스트/ })).toHaveCount(0);
  });

  test('TC-DETAIL-02 상태 변경: 면접 차수 기본값 1, 타임라인에 한 줄 추가', async ({ page }) => {
    await page.goto(`/postings/${id}`);
    await page.getByRole('button', { name: '상태 변경' }).click();
    const dlg = page.getByRole('dialog', { name: '상태 변경' });
    await expect(dlg.getByLabel('면접 차수')).toHaveCount(0); // 면접일 때만
    await dlg.getByLabel('새 상태').selectOption('interview');
    await expect(dlg.getByLabel('면접 차수')).toHaveValue('1');
    await dlg.getByPlaceholder('선택').fill('1차 기술 면접');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '상태를 바꿨습니다');
    await expect(page.locator('.p-state')).toContainText('면접 1차');
    await page.getByRole('tab', { name: '지원 기록' }).click();
    const items = page.locator('ul.history li');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('1차 기술 면접'); // 최신이 위
    await expect(items.first()).toContainText('면접 1차');
    await expect(items.last()).toContainText('지원');
  });

  test('TC-DETAIL-03 같은 면접을 다시 고르면 다음 차수(2차)가 기본', async ({ page }) => {
    await page.goto(`/postings/${id}`);
    await page.getByRole('button', { name: '상태 변경' }).click();
    const dlg = page.getByRole('dialog', { name: '상태 변경' });
    await dlg.getByLabel('새 상태').selectOption('interview');
    await expect(dlg.getByLabel('면접 차수')).toHaveValue('2');
    await dlg.getByRole('button', { name: '취소' }).click();
    await expect(page.locator('.p-state')).toContainText('면접 1차'); // 저장하지 않으면 그대로
  });

  test('TC-DETAIL-04 지원 기록 탭: 요약, 메모 저장 유지', async ({ page }) => {
    await page.goto(`/postings/${id}?tab=record`);
    await expect(page.getByText('제출한 이력서').first()).toBeVisible();
    await expect(page.getByText('기본 이력서 v2')).toBeVisible();
    const memo = page.locator('textarea').last();
    await memo.fill('면접 후기 메모');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await toast(page, '메모를 저장했습니다');
    await page.reload();
    await expect(page.locator('textarea').last()).toHaveValue('면접 후기 메모');
  });

  test('TC-DETAIL-05 기록 수정: 회사·포지션·사이트·지원일', async ({ page }) => {
    await page.goto(`/postings/${id}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    await expect(dlg.getByLabel('포지션')).toHaveValue('지원 서버');
    await expect(dlg.getByLabel('회사')).toHaveValue('지원테스트');
    await dlg.getByLabel('회사').fill('지원테스트랩');
    await dlg.getByLabel('포지션').fill('지원 서버 2');
    await dlg.getByLabel('지원일').fill('2026-11-16');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 기록을 고쳤습니다');
    await expect(page.getByText('2026-11-16').first()).toBeVisible();
    await page.goto(`/?q=${encodeURIComponent('지원테스트랩')}`);
    const row = page.locator('tbody tr.row-link').filter({ hasText: '지원테스트랩' });
    await expect(row).toContainText('지원 서버 2');
    await expect(row).toContainText('면접 1차'); // 상태는 수정 창에서 바뀌지 않는다
  });

  test('TC-DETAIL-06 기록 수정: 비운 값은 저장되지 않는다', async ({ page }) => {
    await page.goto(`/postings/${id}?tab=record`);
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    await dlg.getByLabel('포지션').fill('');
    await dlg.getByRole('button', { name: '저장' }).click();
    await expect(dlg).toBeVisible(); // 브라우저 필수 검사에 막혀 창이 그대로
    await dlg.getByRole('button', { name: '취소' }).click();
  });

  test('TC-DETAIL-07 기록 삭제: 확인 창 문구, 삭제 후 공고는 분석한 공고로 돌아간다', async ({ page }) => {
    await page.goto(`/postings/${id}?tab=record`);
    await page.getByRole('button', { name: '기록 삭제' }).click();
    const dlg = page.getByRole('dialog', { name: '기록 삭제' });
    await expect(dlg).toContainText('지원 기록과 상태 이력을 삭제합니다. 공고는 분석한 공고로 돌아갑니다.');
    await dlg.getByRole('button', { name: '삭제' }).click();
    await toast(page, '지원 기록을 삭제했습니다');
    await expect(page.getByRole('heading', { name: '아직 지원하지 않은 공고입니다.' })).toBeVisible();
    await page.goto('/postings/analyzed');
    await expect(page.getByRole('row', { name: /지원 서버 2|지원 서버/ })).toBeVisible();
    await page.goto(`/?q=${encodeURIComponent('지원테스트')}`);
    await expect(page.getByRole('heading', { name: "'지원테스트'에 지원한 기록이 없습니다." })).toBeVisible();
  });

  test('TC-DETAIL-08 공고 삭제: 확인 후 대시보드로 이동, 다시 열면 없음', async ({ page }) => {
    await page.goto(`/postings/${id}`);
    await page.getByRole('button', { name: '공고 삭제' }).click();
    await expect(page.getByRole('dialog', { name: '공고 삭제' })).toContainText('이 공고와 분석 결과를 삭제합니다');
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
    await expect(page).toHaveURL(/\/$|\/\?/);
    await toast(page, '공고를 삭제했습니다');
    await page.goto(`/postings/${id}`);
    // 스트리밍 응답이라 상태 코드는 200이어도 화면은 "없음" 페이지다
    await expect(page.getByText('This page could not be found.')).toBeVisible();
    await expect(page.locator('.score')).toHaveCount(0);
  });
});

test.describe('공고 삭제 경계', () => {
  test('TC-DETAIL-09 분석(작업) 실행 중에는 공고를 삭제할 수 없다', async ({ page }) => {
    setFake('seeded', { delayMs: 6000 });
    const id = await registerByPaste(page, body(['회사명: 삭제거부회사']));
    await expect(page.getByRole('status').filter({ hasText: '분석 중' })).toBeVisible();
    // 작업이 실제로 running 이 될 때까지 잠깐 기다린다
    await expect(page.locator('.job-ind')).toContainText('작업 1개 진행 중');
    await page.getByRole('button', { name: '공고 삭제' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
    await expect(page.getByRole('dialog')).toContainText('작업이 끝난 뒤 삭제하세요');
    await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
    await waitAnalyzed(page);
    setFake('seeded', {});
    expect(id).toBeGreaterThan(0);
  });

  test('TC-DETAIL-10 지원 기록이 있는 공고에는 [공고 삭제]가 없다(시드 공고)', async ({ page }) => {
    await page.goto('/postings/2');
    await expect(page.getByRole('button', { name: '공고 삭제' })).toHaveCount(0);
    await expect(page.locator('.p-state')).toContainText('면접 2차');
  });
});

test.describe('기록만 행(가져온 기록)의 수정·삭제', () => {
  test('TC-DASH-21 기록 수정: 회사명 변경이 표에 반영된다', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('코드웨이브')}`);
    await page.locator('tbody tr.row-link').filter({ hasText: '코드웨이브' }).click();
    await page.getByRole('button', { name: '기록 수정' }).click();
    const dlg = page.getByRole('dialog', { name: '지원 기록 수정' });
    await expect(dlg.getByLabel('출처 이름')).toHaveValue('지인 추천');
    await dlg.getByLabel('회사').fill('코드웨이브랩');
    await dlg.getByRole('button', { name: '저장' }).click();
    await toast(page, '지원 기록을 고쳤습니다');
    await page.goto(`/?q=${encodeURIComponent('코드웨이브랩')}`);
    await expect(page.locator('tbody tr.row-link')).toHaveCount(1);
  });

  test('TC-DASH-22 기록 삭제: 확인 창을 거치고 삭제하면 목록에서 사라진다', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('그린로지스')}`);
    await page.locator('tbody tr.row-link').filter({ hasText: '그린로지스' }).click();
    await page.getByRole('button', { name: '기록 삭제' }).click();
    const dlg = page.getByRole('dialog', { name: '기록 삭제' });
    await expect(dlg).toContainText('지원 기록과 상태 이력을 삭제합니다');
    await dlg.getByRole('button', { name: '취소', exact: true }).click(); // 취소하면 남는다
    await expect(page.locator('tbody tr.row-link').filter({ hasText: '그린로지스' })).toHaveCount(1);
    await page.getByRole('button', { name: '기록 삭제' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
    await toast(page, '지원 기록을 삭제했습니다');
    await expect(page.getByRole('heading', { name: "'그린로지스'에 지원한 기록이 없습니다." })).toBeVisible();
  });
});
