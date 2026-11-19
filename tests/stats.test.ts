import { describe, expect, test } from 'vitest';
import { daysBetween, weekdayMon0 } from '@/lib/domain/dates';
import { classifyOutcome, NO_RESPONSE_DAYS, type Outcome } from '@/lib/stats/outcome';
import { formatPercent, sampleLevel, tally } from '@/lib/stats/rates';

describe('classifyOutcome (TC-STATS-01)', () => {
  const today = '2026-11-30';
  const applied = (appliedAt: string) => ({ status: 'applied' as const, appliedAt, reached: [] as never[] });
  test('30-day boundary', () => {
    expect(NO_RESPONSE_DAYS).toBe(30);
    expect(classifyOutcome(applied('2026-11-01'), today)).toBe('pending'); // 29일 전
    expect(classifyOutcome(applied('2026-10-31'), today)).toBe('no_response'); // 30일 전
    expect(classifyOutcome(applied('2026-11-30'), today)).toBe('pending'); // 당일
  });
  test('custom noResponseDays', () => {
    expect(classifyOutcome(applied('2026-11-22'), today, 7)).toBe('no_response'); // 8일 전
  });
  test('passed beats rejected and withdrawn', () => {
    expect(classifyOutcome({ status: 'rejected', appliedAt: '2026-10-01', reached: ['document_passed'] }, today)).toBe('passed');
    expect(classifyOutcome({ status: 'withdrawn', appliedAt: '2026-10-01', reached: ['document_passed'] }, today)).toBe('passed');
  });
  test('withdrawn and rejected without reaching', () => {
    expect(classifyOutcome({ status: 'withdrawn', appliedAt: '2026-10-01', reached: [] }, today)).toBe('withdrawn');
    expect(classifyOutcome({ status: 'rejected', appliedAt: '2026-10-01', reached: [] }, today)).toBe('rejected');
  });
});

describe('tally / sampleLevel / formatPercent (TC-STATS-02)', () => {
  test('tally counts and rates', () => {
    const o: Outcome[] = [
      ...Array(2).fill('passed'),
      'rejected',
      ...Array(7).fill('no_response'),
      ...Array(3).fill('pending'),
      'withdrawn',
    ];
    const t = tally(o);
    expect(t).toMatchObject({ total: 14, passed: 2, rejected: 1, noResponse: 7, pending: 3, withdrawn: 1, sample: 10 });
    expect(t.passRate).toBeCloseTo(0.2);
    expect(t.decidedRate).toBeCloseTo(2 / 3);
    expect(t.noResponseRate).toBeCloseTo(0.7);
    expect(t.sampleLevel).toBe('low');
    expect(t.decidedLevel).toBe('few');
  });
  test('empty tally has null rates', () => {
    const t = tally([]);
    expect(t).toMatchObject({ total: 0, sample: 0, passRate: null, decidedRate: null, noResponseRate: null, sampleLevel: 'none' });
  });
  test('sampleLevel boundaries', () => {
    expect([0, 4, 5, 19, 20].map(sampleLevel)).toEqual(['none', 'few', 'low', 'low', 'ok']);
  });
  test('formatPercent', () => {
    expect(formatPercent(0.01918)).toBe('1.9%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('daysBetween / weekdayMon0 (TC-STATS-03)', () => {
  test('daysBetween', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
  });
  test('weekdayMon0', () => {
    expect(weekdayMon0('2026-11-16')).toBe(0);
    expect(weekdayMon0('2026-11-22')).toBe(6);
  });
});
