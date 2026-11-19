import { describe, expect, test } from 'vitest';
import { matchesStatusFilter, reachedStages } from '@/lib/applications/stages';

const set = (...s: string[]) => new Set(s);

describe('reachedStages (TC-PAST-50)', () => {
  test('applied with no history -> empty', () => {
    expect(reachedStages('applied', [])).toEqual(set());
  });
  test('rejected after document_passed', () => {
    expect(reachedStages('rejected', ['document_passed'])).toEqual(set('document_passed'));
  });
  test('withdrawn after document_passed and interview', () => {
    expect(reachedStages('withdrawn', ['document_passed', 'interview'])).toEqual(set('document_passed', 'interview'));
  });
  test('interview without history still includes document_passed', () => {
    expect(reachedStages('interview', [])).toEqual(set('document_passed', 'interview'));
  });
  test('current applied is never reached, even with history (reverted by mistake)', () => {
    expect(reachedStages('applied', ['document_passed'])).toEqual(set());
  });
  test('withdrawn after final_passed reaches all three', () => {
    expect(reachedStages('withdrawn', ['final_passed'])).toEqual(set('document_passed', 'interview', 'final_passed'));
  });
  test('rejected with no history reaches nothing', () => {
    expect(reachedStages('rejected', [])).toEqual(set());
  });
});

describe('matchesStatusFilter', () => {
  test('stage filters use reached, others use current', () => {
    expect(matchesStatusFilter('document_passed', 'rejected', reachedStages('rejected', ['document_passed']))).toBe(true);
    expect(matchesStatusFilter('interview', 'rejected', reachedStages('rejected', ['document_passed']))).toBe(false);
    expect(matchesStatusFilter('rejected', 'rejected', set() as never)).toBe(true);
    expect(matchesStatusFilter('applied', 'document_passed', reachedStages('document_passed', []))).toBe(false);
    expect(matchesStatusFilter('withdrawn', 'withdrawn', set() as never)).toBe(true);
  });
});
