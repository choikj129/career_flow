import type { Outcome } from './outcome';

export const MIN_SAMPLE = 5;
export const ENOUGH_SAMPLE = 20;
export type SampleLevel = 'none' | 'few' | 'low' | 'ok';

export type Tally = {
  total: number;
  passed: number;
  rejected: number;
  noResponse: number;
  pending: number;
  withdrawn: number;
  /** passed + rejected + noResponse (서류 통과율의 분모) */
  sample: number;
  passRate: number | null;
  /** passed / (passed + rejected) */
  decidedRate: number | null;
  noResponseRate: number | null;
  sampleLevel: SampleLevel;
  decidedLevel: SampleLevel;
};

/** 0 → none, 1~4 → few, 5~19 → low, 20+ → ok */
export function sampleLevel(n: number): SampleLevel {
  if (n <= 0) return 'none';
  if (n < MIN_SAMPLE) return 'few';
  if (n < ENOUGH_SAMPLE) return 'low';
  return 'ok';
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function tally(outcomes: readonly Outcome[]): Tally {
  const c = { passed: 0, rejected: 0, no_response: 0, pending: 0, withdrawn: 0 };
  for (const o of outcomes) c[o] += 1;
  const sample = c.passed + c.rejected + c.no_response;
  const decided = c.passed + c.rejected;
  return {
    total: outcomes.length,
    passed: c.passed,
    rejected: c.rejected,
    noResponse: c.no_response,
    pending: c.pending,
    withdrawn: c.withdrawn,
    sample,
    passRate: ratio(c.passed, sample),
    decidedRate: ratio(c.passed, decided),
    noResponseRate: ratio(c.no_response, sample),
    sampleLevel: sampleLevel(sample),
    decidedLevel: sampleLevel(decided),
  };
}

/** 0.01918 → "1.9%", 1 → "100%", 0 → "0.0%" */
export function formatPercent(rate: number): string {
  const pct = rate * 100;
  return pct >= 100 ? '100%' : `${pct.toFixed(1)}%`;
}
