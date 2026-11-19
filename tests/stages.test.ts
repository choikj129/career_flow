import { describe, expect, test } from 'vitest';
import { APPLICATION_STATUSES, STATUS_LABELS } from '@/lib/domain/types';
import { isReachedStage, matchesStatusFilter, reachedStages } from '@/lib/applications/stages';

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

describe('assignment status (TC-PAST-60, 61)', () => {
  test('order and label', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'applied', 'document_passed', 'assignment', 'interview', 'final_passed', 'rejected', 'withdrawn',
    ]);
    expect(STATUS_LABELS.assignment).toBe('과제·코딩테스트');
  });
  test('assignment implies document_passed; interview does not imply assignment', () => {
    expect(reachedStages('assignment', [])).toEqual(set('document_passed', 'assignment'));
    expect(reachedStages('rejected', ['assignment'])).toEqual(set('document_passed', 'assignment'));
    expect(reachedStages('interview', [])).toEqual(set('document_passed', 'interview'));
    expect(reachedStages('final_passed', [])).toEqual(set('document_passed', 'interview', 'final_passed'));
    expect(reachedStages('applied', ['assignment'])).toEqual(set());
  });
  test('filter and isReachedStage', () => {
    expect(matchesStatusFilter('assignment', 'rejected', reachedStages('rejected', ['assignment']))).toBe(true);
    expect(matchesStatusFilter('assignment', 'interview', reachedStages('interview', []))).toBe(false);
    for (const s of ['applied', 'rejected', 'withdrawn'] as const) expect(isReachedStage(s)).toBe(false);
    for (const s of ['document_passed', 'assignment', 'interview', 'final_passed'] as const) expect(isReachedStage(s)).toBe(true);
  });
});
