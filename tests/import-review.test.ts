import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPLICATION_STATUSES, SITE_IDS, SITE_LABELS } from '@/lib/domain/types';
import { bulkCreateApplications } from '@/lib/applications/repo';
import { findExistingMatches, markExistingRows } from '@/lib/applications/import-review';
import { checkedRowsSchema, missingFields, rowsToRegister, type ReviewRow } from '@/lib/applications/import-rows';
import { makeTestDb } from './helpers/db';

const row = (o: Partial<ReviewRow> = {}): ReviewRow => ({
  companyName: '토스',
  positionTitle: 'Server',
  site: 'wanted',
  siteNote: '',
  appliedAt: '2026-10-03',
  status: 'applied',
  notes: '',
  docs: { resume: null, career: null, portfolio: null },
  ...o,
});

describe('markExistingRows', () => {
  test('flags same company (by normalized name) and same date', () => {
    const db = makeTestDb();
    bulkCreateApplications(
      [{ companyName: '(주)토스', positionTitle: 'X', site: 'wanted', appliedAt: '2026-10-03', status: 'applied' }],
      db,
    );
    const r = markExistingRows(
      [row(), row({ appliedAt: '2026-10-04' }), row({ companyName: '당근' }), row({ companyName: '토스 ' })],
      db,
    );
    expect(r).toEqual([true, false, false, true]);
  });
  test('empty company or date is never flagged', () => {
    const db = makeTestDb();
    expect(markExistingRows([row({ companyName: '' }), row({ appliedAt: '' })], db)).toEqual([false, false]);
  });
});

describe('missingFields', () => {
  test('lists blank required cells', () => {
    expect(missingFields(row())).toEqual([]);
    expect(missingFields(row({ companyName: ' ', positionTitle: '' }))).toEqual(['companyName', 'positionTitle']);
    expect(missingFields(row({ appliedAt: '2026-13-40' }))).toEqual(['appliedAt']);
  });
  test('site other needs no note (note is optional)', () => {
    expect(missingFields(row({ site: 'other', siteNote: '' }))).toEqual([]);
  });
});

describe('rowsToRegister', () => {
  test('keeps only checked rows and trims', () => {
    const out = rowsToRegister([
      { ...row({ companyName: ' 토스 ' }), checked: true },
      { ...row({ companyName: '당근' }), checked: false },
    ]);
    expect(out).toEqual([
      { companyName: '토스', positionTitle: 'Server', site: 'wanted', siteNote: undefined, appliedAt: '2026-10-03', status: 'applied' },
    ]);
  });
  test('passes notes and docs, omits empty ones', () => {
    const [a, b] = rowsToRegister([
      { ...row({ notes: ' 메모 ', docs: { resume: '이력서_20261102.pdf', career: null, portfolio: null } }), checked: true },
      { ...row(), checked: true },
    ]);
    expect(a.notes).toBe('메모');
    expect(a.submittedDocs).toEqual({ resume: '이력서_20261102.pdf', career: null, portfolio: null });
    expect('notes' in b).toBe(false);
    expect('submittedDocs' in b).toBe(false);
  });
  test('throws when a checked row is incomplete', () => {
    expect(() => rowsToRegister([{ ...row({ companyName: '' }), checked: true }])).toThrow();
  });
});

describe('입력 검증(서버 액션용 스키마)', () => {
  const ok = { ...row(), checked: true };
  test('TC-IMP-V1 존재하지 않는 날짜(2026-13-45, 2026-02-30)는 거부한다', async () => {
    const { checkedRowsSchema } = await import('@/lib/applications/import-rows');
    expect(checkedRowsSchema.safeParse([ok]).success).toBe(true);
    for (const d of ['2026-13-45', '2026-02-30', '2026/01/01', '']) {
      expect(checkedRowsSchema.safeParse([{ ...ok, appliedAt: d }]).success, d).toBe(false);
    }
    // 체크하지 않은 행은 빈 날짜여도 된다
    expect(checkedRowsSchema.safeParse([{ ...ok, appliedAt: '', checked: false }]).success).toBe(true);
  });

  test('TC-IMP-V2 site·status enum, 문자열 길이, 행 수를 검사한다', async () => {
    const { checkedRowsSchema, existingRowsSchema } = await import('@/lib/applications/import-rows');
    expect(checkedRowsSchema.safeParse([{ ...ok, site: 'nope' }]).success).toBe(false);
    expect(checkedRowsSchema.safeParse([{ ...ok, status: 'nope' }]).success).toBe(false);
    expect(checkedRowsSchema.safeParse([{ ...ok, companyName: 'a'.repeat(201) }]).success).toBe(false);
    expect(checkedRowsSchema.safeParse(Array.from({ length: 501 }, () => ok)).success).toBe(false);
    expect(existingRowsSchema.safeParse([{ companyName: 'a'.repeat(201), appliedAt: '2026-01-01' }]).success).toBe(false);
    expect(existingRowsSchema.safeParse([{ companyName: 'a', appliedAt: '2026-01-01' }]).success).toBe(true);
  });
});

test('TC-IMP-V3 validDate 공용 함수', async () => {
  const { validDate } = await import('@/lib/domain/dates');
  expect(validDate('2026-02-28')).toBe(true);
  expect(validDate('2028-02-29')).toBe(true);
  expect(validDate('2026-02-29')).toBe(false);
  expect(validDate('2026-13-45')).toBe(false);
});

describe('checkedRowsSchema docs (TC-PAST-11)', () => {
  const ok = { ...row(), checked: true };
  test('accepts matching kinds and nulls', () => {
    const r = checkedRowsSchema.safeParse([
      { ...ok, docs: { resume: '이력서_20261102.pdf', career: '경력기술서_20261102.pdf', portfolio: null } },
    ]);
    expect(r.success).toBe(true);
  });
  test('rejects wrong kind and non-rule names', () => {
    expect(checkedRowsSchema.safeParse([{ ...ok, docs: { resume: '경력기술서_20261102.pdf', career: null, portfolio: null } }]).success).toBe(false);
    expect(checkedRowsSchema.safeParse([{ ...ok, docs: { resume: '../x.pdf', career: null, portfolio: null } }]).success).toBe(false);
  });
  test('required fields rule unchanged', () => {
    expect(missingFields(row({ companyName: '' }))).toEqual(['companyName']);
  });
});

describe('findExistingMatches (TC-PAST-10)', () => {
  test('same / same_day / none', () => {
    const db = makeTestDb();
    bulkCreateApplications(
      [
        { companyName: '(주)토스', positionTitle: 'Server Dev', site: 'wanted', appliedAt: '2026-10-03', status: 'applied' },
        { companyName: '당근', positionTitle: '(포지션 미상)', site: 'wanted', appliedAt: '2026-10-03', status: 'applied' },
      ],
      db,
    );
    const r = findExistingMatches(
      [
        { companyName: '토스', positionTitle: 'server-dev', appliedAt: '2026-10-03' },
        { companyName: '토스', positionTitle: 'Frontend', appliedAt: '2026-10-03' },
        { companyName: '토스', positionTitle: 'Server Dev', appliedAt: '2026-10-04' },
        { companyName: '당근', positionTitle: 'Anything', appliedAt: '2026-10-03' },
        { companyName: '', positionTitle: 'x', appliedAt: '2026-10-03' },
        { companyName: '토스', positionTitle: 'x', appliedAt: '' },
      ],
      db,
    );
    expect(r).toEqual(['same', 'same_day', 'none', 'same', 'none', 'none']);
  });
});

describe('assignment status in import (TC-PAST-66)', () => {
  test('row schema accepts assignment', () => {
    expect(checkedRowsSchema.safeParse([{ ...row({ status: 'assignment' }), checked: true }]).success).toBe(true);
  });
  test('import prompt lists every status id', () => {
    const prompt = readFileSync(join(process.cwd(), 'prompts', 'import-applications.md'), 'utf8');
    for (const s of APPLICATION_STATUSES) expect(prompt, s).toContain(s);
  });
});

describe('none value in rows (TC-PAST-72)', () => {
  const ok = { ...row(), checked: true };
  test('schema accepts none for career and portfolio, rejects it for resume', () => {
    expect(checkedRowsSchema.safeParse([{ ...ok, docs: { resume: null, career: 'none', portfolio: 'none' } }]).success).toBe(true);
    expect(checkedRowsSchema.safeParse([{ ...ok, docs: { resume: 'none', career: null, portfolio: null } }]).success).toBe(false);
  });
  test('rowsToRegister passes none values through', () => {
    const [r] = rowsToRegister([{ ...row({ docs: { resume: null, career: 'none', portfolio: 'none' } }), checked: true }]);
    expect(r.submittedDocs).toEqual({ resume: null, career: 'none', portfolio: 'none' });
  });
});

describe('homepage site (D-23)', () => {
  test('homepage sits right above other, with a label', () => {
    expect(SITE_IDS.slice(-2)).toEqual(['homepage', 'other']);
    expect(SITE_LABELS.homepage).toBe('홈페이지 지원');
  });
  test('row schema accepts homepage and ignores the source note for it', () => {
    expect(checkedRowsSchema.safeParse([{ ...row({ site: 'homepage' }), checked: true }]).success).toBe(true);
    const [r] = rowsToRegister([{ ...row({ site: 'homepage', siteNote: '메모' }), checked: true }]);
    expect(r.siteNote).toBeUndefined();
  });
  test('import prompt lists every site id', () => {
    const prompt = readFileSync(join(process.cwd(), 'prompts', 'import-applications.md'), 'utf8');
    for (const s of SITE_IDS) expect(prompt, s).toContain(s);
  });
});
