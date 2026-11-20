// 통계 화면 /stats: 카드·그래프·전환·필터·빈 상태·표본 표시·대시보드 연결. TC-STATS-E2E-01~07
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';

const docsDir = join(dataDir('seeded'), 'documents');

/** 카드 안의 표가 카드 안쪽 폭 안에 들어가고(오른쪽 끝) 가로 스크롤도 없는지 */
const tableFitsCard = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((card) => {
    const table = card.querySelector('table')!;
    const c = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const inner = c.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return { right: table.getBoundingClientRect().right, inner, scroll: card.scrollWidth - card.clientWidth, width: c.width };
  });

/** 표가 카드 안쪽 폭 안에 들어가고 가로 스크롤이 없을 때까지(크기 변경 직후 배치가 끝나길) 기다려 확인한다 */
async function expectTableInCard(page: Page, testId: string) {
  await expect
    .poll(async () => {
      const m = await tableFitsCard(page, testId);
      return m.width > 100 && m.right <= m.inner + 1 && m.scroll <= 1;
    }, { message: `${testId} 표가 카드 안에 들어가야 합니다` })
    .toBe(true);
}
const put = (kind: string, name: string) => {
  mkdirSync(join(docsDir, kind), { recursive: true });
  writeFileSync(join(docsDir, kind, name), '%PDF-1.4 fake');
};

/** 가져오기 직접 입력 표로 지난 기록(지원 상태, 아주 오래전 지원일 → 무응답)을 n건 만든다. */
async function addPastRows(page: Page, company: string, n: number, appliedAt: string) {
  await page.goto('/import');
  await page.getByLabel('기타', { exact: true }).check();
  await page.getByRole('button', { name: '표에 직접 입력' }).click();
  await page.waitForURL(/manual=1/);
  const rows = page.locator('table.review tbody tr');
  for (let i = 0; i < n; i++) {
    if (i > 0) await page.getByRole('button', { name: '+ 행 추가' }).click();
    const r = rows.nth(i);
    await r.getByLabel('회사').fill(`${company}${i}`);
    await r.getByLabel('포지션').fill(`통계 포지션 ${i}`);
    await r.getByLabel('지원일').fill(appliedAt);
  }
  await page.getByRole('button', { name: `${n}건 등록` }).click();
  await page.waitForURL(/notice=/);
}

test.describe.serial('통계 화면', () => {
  test('TC-STATS-E2E-01 내비 "통계" → /stats, 카드 6개와 그래프, 표로 보기', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '통계', exact: true }).click();
    await page.waitForURL(/\/stats$/);
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: '기간별 지원과 결과' })).toBeVisible();
    await page.getByText('표로 보기').click();
    await expect(page.getByTestId('stats-periods-table').locator('tbody tr').first()).toBeVisible();
  });

  test('TC-STATS-E2E-02 [연별]·[비율] 전환은 주소에 남는다', async ({ page }) => {
    await page.goto('/stats');
    await page.getByRole('link', { name: '연별' }).click();
    await expect(page).toHaveURL(/unit=year/);
    await page.getByText('표로 보기').click();
    await expect(page.getByTestId('stats-periods-table').locator('thead th').first()).toHaveText('연');
    await page.getByRole('link', { name: '비율' }).click();
    await expect(page).toHaveURL(/mode=ratio/);
  });

  test('TC-STATS-E2E-03 사이트 필터: 카드 지원 수가 대시보드와 같고 사이트별은 한 줄', async ({ page }) => {
    await page.goto('/?site=wanted');
    const foot = await page.locator('.table-foot').innerText();
    const n = /전체 (\d+)건/.exec(foot)![1];
    await page.goto('/stats?site=wanted');
    await expect(page.getByTestId('card-total').locator('.stat-big')).toHaveText(n);
    await expect(page.getByTestId('stats-sites').locator('[data-testid^="hbar-"]')).toHaveCount(1);
    await expect(page.getByText('사이트 필터 적용 중')).toBeVisible();
  });

  test('TC-STATS-E2E-04 필터 결과 0건이면 안내와 [필터 지우기]', async ({ page }) => {
    await page.goto('/stats?period=custom&from=1999-01-01&to=1999-01-31');
    await expect(page.getByText('이 기간·사이트에 지원 기록이 없습니다.')).toBeVisible();
    await page.getByRole('link', { name: '필터 지우기' }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(6);
  });

  test('TC-STATS-E2E-05 [경력기술서]를 누르면 doc=career, 묶음 라벨이 경력기술서', async ({ page }) => {
    put('career', '경력기술서_20240101.pdf');
    await addPastRows(page, '경력통계', 1, '2024-02-01');
    await page.goto('/stats');
    await page.getByRole('link', { name: '경력기술서' }).click();
    await expect(page).toHaveURL(/doc=career/);
    await expect(page.getByTestId('stats-docs')).toContainText('경력기술서 2024-01-01');
  });

  test('TC-STATS-E2E-06 표본: 분모 3은 "표본 부족 (n=3)", 분모 8은 "표본 적음"', async ({ page }) => {
    put('portfolio', '포트폴리오_20250101.pdf');
    put('portfolio', '포트폴리오_20250201.pdf');
    await addPastRows(page, '표본셋', 3, '2025-01-15'); // 포트폴리오_20250101 선택
    await addPastRows(page, '표본여덟', 8, '2025-02-15'); // 포트폴리오_20250201 선택
    await page.goto('/stats?doc=portfolio');
    const docs = page.getByTestId('stats-docs');
    await expect(docs.getByTestId('hbar-doc:포트폴리오_20250101.pdf')).toContainText('표본 부족 (n=3)');
    await expect(docs.getByTestId('hbar-doc:포트폴리오_20250201.pdf')).toContainText('표본 적음');
  });

  test('TC-STATS-E2E-07 대시보드 "통계 보기 →"와 묶음 머리 통과율', async ({ page }) => {
    await page.goto('/?view=site&site=wanted&period=1y');
    await page.getByRole('link', { name: '통계 보기 →' }).click();
    await expect(page).toHaveURL(/\/stats\?period=1y&site=wanted$/);
    await page.goto('/?view=site');
    await expect(page.getByText('서류 통과').first()).toBeVisible();
  });

  test('TC-STATS-E2E-08 폭 1024: 서류 버전별·사이트별 표가 카드 안에 다 들어간다(기록 없는 시드)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/stats');
    for (const id of ['stats-docs', 'stats-sites']) {
      await expectTableInCard(page, id);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('TC-TAILOR-E2E-11 맞춤 이력서 효과·프로필별 표·서류 버전별 묶음, 기록이 없으면 안내', async ({ page }) => {
    const tailoredCard = page.getByTestId('stats-tailored');
    // 1) 맞춤·기본 서류 기록이 없을 때
    await page.goto('/stats');
    await expect(tailoredCard.getByRole('heading', { name: '맞춤 이력서 효과' })).toBeVisible();
    await expect(page.getByTestId('stats-tailored-empty')).toContainText('아직 맞춤 이력서로 낸 지원이 없습니다');
    await expect(page.getByTestId('stats-tailored-empty')).toContainText("제출 서류의 이력서를 '맞춤 이력서'로 고르면");
    await expect(page.getByTestId('stats-profiles-empty')).toHaveText('프로필이 기록된 지원이 없습니다.');
    await expect(page.getByTestId('stats-docs')).not.toContainText('맞춤 이력서');

    // 2) 화면 기능이 생기기 전(Task 7)이라 지원 기록의 제출 서류를 DB에 직접 넣어 확인한다(끝나면 되돌린다)
    const db = new Database(join(dataDir('seeded'), 'career-flow.db'));
    const apps = db
      .prepare("select a.id, a.submitted_resume as sr, p.id as posting_id from applications a join postings p on p.id = a.posting_id order by a.applied_at limit 3")
      .all() as { id: number; sr: string; posting_id: number }[];
    expect(apps).toHaveLength(3);
    const longName = '아주 긴 프로필 이름으로 정합성과 안정성을 함께 강조하는 가상 직무 이력서';
    const insertedKit = db.prepare("insert into kits (label, files, parsed, errors, created_at) values ('e2e', '[]', null, '[]', ?)").run(new Date().toISOString()).lastInsertRowid;
    const insertedResumes: number[] = [];
    const insertedRevisions: number[] = [];
    const rev = (postingId: number, profileId: string, profileName: string) => {
      const t = db.prepare('insert into tailored_resumes (posting_id, created_at) values (?, ?)').run(postingId, new Date().toISOString()).lastInsertRowid;
      insertedResumes.push(Number(t));
      const r = db
        .prepare(
          "insert into tailored_revisions (tailored_resume_id, rev_no, kit_id, track, profile_id, profile_name, adjustments, source, resume_md, career_md, pending_adjustments, change_reasons, warnings, notes, created_at) values (?, 1, ?, '백엔드', ?, ?, '[]', 'recipe', '# 가상', '# 가상', '[]', '[]', '[]', '', ?)",
        )
        .run(t, insertedKit, profileId, profileName, new Date().toISOString()).lastInsertRowid;
      insertedRevisions.push(Number(r));
      return Number(r);
    };
    try {
      const set = db.prepare('update applications set submitted_resume = ? where id = ?');
      set.run(JSON.stringify({ kind: 'kit', kitId: Number(insertedKit), track: '백엔드', profileId: 'B1', profileName: '범용' }), apps[0].id);
      set.run(JSON.stringify({ kind: 'tailored', tailoredRevisionId: rev(apps[1].posting_id, 'B3', longName) }), apps[1].id);
      set.run(JSON.stringify({ kind: 'tailored', tailoredRevisionId: rev(apps[2].posting_id, 'B3', longName) }), apps[2].id);

      for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/stats');
        await expect(page.getByTestId('stats-tailored-empty')).toHaveCount(0);
        const table = page.getByTestId('stats-tailored-table');
        await expect(table.locator('tbody tr')).toHaveCount(2);
        await expect(table.locator('tbody tr').first()).toContainText('맞춤 이력서');
        await expect(table.locator('tbody tr').first().locator('td').nth(1)).toHaveText('2');
        await expect(tailoredCard).toContainText('(맞춤본을 처음 낸 날)부터의 지원만 비교합니다');
        const profiles = page.getByTestId('stats-profiles-table');
        await expect(profiles.locator('tbody tr')).toHaveCount(2);
        await expect(profiles.locator('tbody tr').nth(0)).toContainText('B1 범용');
        await expect(profiles.locator('tbody tr').nth(1)).toContainText('B3 ' + longName);
        await expect(profiles.locator('tbody tr').nth(1).locator('td').nth(1)).toHaveText('2');
        await expect(profiles.locator('tbody tr').nth(1).locator('td').nth(7)).toHaveText('2'); // 그중 맞춤
        await expect(profiles.locator('tbody tr').nth(0).locator('td').nth(7)).toHaveText('0');
        for (const id of ['stats-docs', 'stats-sites']) {
          await expectTableInCard(page, id);
        }
        // 잘리지 않고 한글이 낱말 중간에서 끊기지 않는다(긴 이름은 카드 안에서 줄바꿈)
        const fits = await tailoredCard.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
        expect(fits).toBe(true);
        const keepAll = await profiles.locator('tbody tr').nth(1).locator('td').first().evaluate((el) => getComputedStyle(el).wordBreak);
        expect(keepAll).toBe('keep-all');
      }
      // 서류 버전별(이력서): 맞춤 이력서 → 기본 서류 백엔드 순
      const docs = page.getByTestId('stats-docs');
      await expect(docs.locator('[data-testid^="hbar-"]').nth(0)).toContainText('맞춤 이력서');
      await expect(docs.locator('[data-testid^="hbar-"]').nth(0)).toContainText('공고마다 맞춘 이력서');
      await expect(docs.locator('[data-testid^="hbar-"]').nth(1)).toContainText('기본 서류 백엔드');
      await page.screenshot({ path: 'test-results/stats-tailored-1024.png', fullPage: true });
    } finally {
      for (const a of apps) db.prepare('update applications set submitted_resume = ? where id = ?').run(a.sr, a.id);
      for (const id of insertedRevisions) db.prepare('delete from tailored_revisions where id = ?').run(id);
      for (const id of insertedResumes) db.prepare('delete from tailored_resumes where id = ?').run(id);
      db.prepare('delete from kits where id = ?').run(insertedKit);
      db.close();
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });
});
