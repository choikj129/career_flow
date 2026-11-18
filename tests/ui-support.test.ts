import { describe, expect, test } from 'vitest';
import { eventDate, formatDateTime, formatElapsed, isPastDeadline } from '@/lib/domain/dates';

describe('formatDateTime', () => {
  test('formats local time as M월 D일 HH:mm', () => {
    expect(formatDateTime(new Date(2026, 10, 6, 9, 5).toISOString())).toBe('11월 6일 09:05');
  });
  test('returns empty string for missing or invalid', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('nope')).toBe('');
  });
});

describe('formatElapsed', () => {
  test('m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(47_000)).toBe('0:47');
    expect(formatElapsed(125_000)).toBe('2:05');
  });
  test('negative clamps to zero', () => {
    expect(formatElapsed(-5000)).toBe('0:00');
  });
});

describe('isPastDeadline', () => {
  test('deadline before today is past; today and later are not; null is never past', () => {
    expect(isPastDeadline('2026-11-17', '2026-11-18')).toBe(true);
    expect(isPastDeadline('2026-11-18', '2026-11-18')).toBe(false);
    expect(isPastDeadline('2026-12-01', '2026-11-18')).toBe(false);
    expect(isPastDeadline(null, '2026-11-18')).toBe(false);
  });
});

describe('eventDate', () => {
  test('keeps plain dates and converts ISO timestamps to the local date', () => {
    expect(eventDate('2026-11-05')).toBe('2026-11-05');
    expect(eventDate(new Date(2026, 10, 5, 0, 30).toISOString())).toBe('2026-11-05');
  });
});
