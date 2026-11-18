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
