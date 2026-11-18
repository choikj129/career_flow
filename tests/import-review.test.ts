import { describe, expect, test } from 'vitest';
import { bulkCreateApplications } from '@/lib/applications/repo';
import { markExistingRows } from '@/lib/applications/import-review';
import { missingFields, rowsToRegister, type ReviewRow } from '@/lib/applications/import-rows';
import { makeTestDb } from './helpers/db';

const row = (o: Partial<ReviewRow> = {}): ReviewRow => ({
  companyName: '토스',
  positionTitle: 'Server',
  site: 'wanted',
  siteNote: '',
  appliedAt: '2026-10-03',
  status: 'applied',
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
