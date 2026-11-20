import { describe, expect, test } from 'vitest';
import { formatDateText } from '@/app/_components/DateInput';

describe('formatDateText (TC-DATE-01)', () => {
  test('inserts hyphens while typing digits', () => {
    expect(['2', '2026', '20261', '202611', '2026112', '20261120'].map(formatDateText)).toEqual([
      '2', '2026', '2026-1', '2026-11', '2026-11-2', '2026-11-20',
    ]);
  });
  test('keeps an already formatted date and drops other characters', () => {
    expect(formatDateText('2026-11-20')).toBe('2026-11-20');
    expect(formatDateText('2026.11.20.')).toBe('2026-11-20');
    expect(formatDateText('abc')).toBe('');
    expect(formatDateText('202611201234')).toBe('2026-11-20');
    expect(formatDateText('')).toBe('');
  });
});
