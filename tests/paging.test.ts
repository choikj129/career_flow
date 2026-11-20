import { describe, expect, test } from 'vitest';
import { GROUP_PREVIEW, PAGE_SIZE, pageNumbers, pageSlice, parseMore, parsePage } from '@/lib/search/paging';
import { selectVisibleRows } from '@/lib/search/visible-rows';
import { dashboardHref, parseDashboardParams } from '@/lib/search/dashboard-params';
import type { DashboardRow } from '@/lib/search/dashboard';

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('pageSlice (TC-PAGE-01)', () => {
  test('50 per page, 51 items -> 2 pages', () => {
    expect(PAGE_SIZE).toBe(50);
    const p1 = pageSlice(nums(51), 1);
    expect(p1).toMatchObject({ page: 1, pageCount: 2, total: 51, from: 1, to: 50 });
    expect(p1.items).toHaveLength(50);
    const p2 = pageSlice(nums(51), 2);
    expect(p2).toMatchObject({ page: 2, from: 51, to: 51 });
    expect(p2.items).toEqual([51]);
  });
  test('out of range pages clamp to the last page', () => {
    expect(pageSlice(nums(51), 99).page).toBe(2);
    expect(pageSlice(nums(51), 0).page).toBe(1);
    expect(pageSlice(nums(51), -3).page).toBe(1);
  });
  test('empty list', () => {
    expect(pageSlice([], 1)).toMatchObject({ page: 1, pageCount: 1, total: 0, from: 0, to: 0, items: [] });
  });
  test('exactly 50 items is one page', () => {
    expect(pageSlice(nums(50), 1)).toMatchObject({ pageCount: 1, from: 1, to: 50 });
  });
});

describe('parsePage / parseMore (TC-PAGE-02)', () => {
  test('parsePage', () => {
    expect([undefined, '', 'x', '0', '-2', '1.5', '3'].map((v) => parsePage(v))).toEqual([1, 1, 1, 1, 1, 1, 3]);
  });
  test('parseMore splits, trims and de-duplicates', () => {
    expect(parseMore('site:wanted, site:wanted ,status:applied,')).toEqual(['site:wanted', 'status:applied']);
    expect(parseMore(undefined)).toEqual([]);
  });
});

describe('pageNumbers (TC-PAGE-03)', () => {
  test('few pages show all', () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
  });
  test('many pages show a window with ellipses', () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
    expect(pageNumbers(10, 20)).toEqual([1, '…', 8, 9, 10, 11, 12, '…', 20]);
    expect(pageNumbers(20, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
  });
});

describe('dashboard params with page and more (TC-PAGE-04)', () => {
  test('defaults', () => {
    expect(parseDashboardParams({})).toMatchObject({ page: 1, more: [] });
  });
  test('parse and href round trip; defaults are omitted', () => {
    const p = parseDashboardParams({ page: '3', more: 'site:wanted', view: 'site' });
    expect(p).toMatchObject({ page: 3, more: ['site:wanted'], view: 'site' });
    expect(dashboardHref({ page: 1 })).toBe('/');
    expect(dashboardHref({ page: 3 })).toBe('/?page=3');
    expect(dashboardHref({ view: 'site', more: ['site:wanted', 'site:remember'] })).toBe('/?view=site&more=site%3Awanted%2Csite%3Aremember');
  });
});

let n = 0;
const row = (over: Partial<DashboardRow>): DashboardRow => {
  n += 1;
  return {
    applicationId: n,
    postingId: null,
    companyId: n,
    companyName: `c${n}`,
    positionTitle: 'p',
    site: 'wanted',
    appliedAt: '2026-11-01',
    status: 'applied',
    interviewRound: null,
    fitScore: null,
    resumeLabel: null,
    resumeBaseVersionNo: null,
    resumeDocFile: null,
    reached: [],
    ...over,
  };
};

describe('selectVisibleRows (TC-PAGE-05)', () => {
  const rows = [...Array.from({ length: 45 }, () => row({ site: 'wanted' })), ...Array.from({ length: 5 }, () => row({ site: 'remember' }))];
  test('all view: one page', () => {
    expect(selectVisibleRows(rows, 'all', 1, [], '2026-11-05')).toHaveLength(50);
    expect(selectVisibleRows([...rows, row({})], 'all', 2, [], '2026-11-05')).toHaveLength(1);
  });
  test('site view: first 20 per group, more expands that group only', () => {
    expect(GROUP_PREVIEW).toBe(20);
    expect(selectVisibleRows(rows, 'site', 1, [], '2026-11-05')).toHaveLength(20 + 5);
    expect(selectVisibleRows(rows, 'site', 1, ['site:wanted'], '2026-11-05')).toHaveLength(45 + 5);
  });
  test('status view: first 20 per column', () => {
    expect(selectVisibleRows(rows, 'status', 1, [], '2026-11-05')).toHaveLength(20);
    expect(selectVisibleRows(rows, 'status', 1, ['status:applied'], '2026-11-05')).toHaveLength(50);
  });
});
