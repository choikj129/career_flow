import { describe, expect, test } from 'vitest';
import { dashboardHref, parseDashboardParams, periodRange, toSearchQuery } from '@/lib/search/dashboard-params';

describe('parseDashboardParams', () => {
  test('uses defaults when nothing is given', () => {
    expect(parseDashboardParams({})).toEqual({
      q: '', view: 'all', status: undefined, site: undefined, period: 'all', from: undefined, to: undefined, page: 1, more: [],
    });
  });

  test('accepts valid values and takes the first of repeated params', () => {
    const p = parseDashboardParams({
      q: ['토스', 'x'], view: 'status', status: 'interview', site: 'wanted', period: '3m',
    });
    expect(p).toMatchObject({ q: '토스', view: 'status', status: 'interview', site: 'wanted', period: '3m' });
  });

  test('ignores unknown view, status, site, period', () => {
    const p = parseDashboardParams({ view: 'zzz', status: 'nope', site: 'x', period: '9y' });
    expect(p).toMatchObject({ view: 'all', status: undefined, site: undefined, period: 'all' });
  });

  test('custom period keeps only well-formed dates', () => {
    expect(parseDashboardParams({ period: 'custom', from: '2026-01-05', to: '2026-02-30x' })).toMatchObject({
      period: 'custom', from: '2026-01-05', to: undefined,
    });
  });

  test('from/to are dropped unless period is custom', () => {
    expect(parseDashboardParams({ period: 'month', from: '2026-01-05' }).from).toBeUndefined();
  });
});

describe('periodRange', () => {
  const now = new Date(2026, 10, 18, 12, 0, 0); // 2026-11-18 local
  test('all has no bounds', () => {
    expect(periodRange({ period: 'all' }, now)).toEqual({});
  });
  test('month starts on the first of this month', () => {
    expect(periodRange({ period: 'month' }, now)).toEqual({ from: '2026-11-01' });
  });
  test('3m and 1y go back by calendar months/years', () => {
    expect(periodRange({ period: '3m' }, now)).toEqual({ from: '2026-08-18' });
    expect(periodRange({ period: '1y' }, now)).toEqual({ from: '2025-11-18' });
  });
  test('3m clamps the day when the target month is shorter', () => {
    expect(periodRange({ period: '3m' }, new Date(2026, 4, 31))).toEqual({ from: '2026-02-28' });
  });
  test('custom passes through', () => {
    expect(periodRange({ period: 'custom', from: '2026-01-01', to: '2026-02-01' }, now)).toEqual({
      from: '2026-01-01', to: '2026-02-01',
    });
  });
});

describe('toSearchQuery', () => {
  test('maps params to a repo query', () => {
    const now = new Date(2026, 10, 18);
    expect(toSearchQuery(parseDashboardParams({ q: ' 토스 ', status: 'rejected', period: 'month' }), now)).toEqual({
      text: '토스', status: 'rejected', site: undefined, from: '2026-11-01', to: undefined,
    });
  });
  test('empty q becomes undefined', () => {
    expect(toSearchQuery(parseDashboardParams({}), new Date()).text).toBeUndefined();
  });
});

describe('dashboardHref', () => {
  test('omits defaults', () => {
    expect(dashboardHref({})).toBe('/');
    expect(dashboardHref({ view: 'all', period: 'all', q: '' })).toBe('/');
  });
  test('keeps non-default values in a stable order', () => {
    expect(dashboardHref({ q: '토스 뱅크', view: 'site', status: 'interview', site: 'wanted', period: '3m' })).toBe(
      '/?q=%ED%86%A0%EC%8A%A4+%EB%B1%85%ED%81%AC&view=site&status=interview&site=wanted&period=3m',
    );
  });
  test('custom period carries from/to', () => {
    expect(dashboardHref({ period: 'custom', from: '2026-01-01', to: '2026-02-01' })).toBe(
      '/?period=custom&from=2026-01-01&to=2026-02-01',
    );
  });
});
