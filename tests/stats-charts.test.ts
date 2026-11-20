import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { StackedBarChart } from '@/app/stats/StackedBarChart';
import { HBarChart } from '@/app/stats/HBarChart';
import { ColumnChart } from '@/app/stats/ColumnChart';
import { FunnelChart } from '@/app/stats/FunnelChart';
import { RateText } from '@/app/_components/RateText';
import { funnel, byPeriod } from '@/lib/stats/aggregate';
import { tally } from '@/lib/stats/rates';
import type { StatItem } from '@/lib/stats/load';

const item = (appliedAt: string, outcome: StatItem['outcome'] = 'rejected'): StatItem => ({
  applicationId: 1,
  companyId: 1,
  site: 'wanted',
  appliedAt,
  status: 'rejected',
  reached: outcome === 'passed' ? ['document_passed'] : [],
  outcome,
  baseVersionNo: null,
  tailored: false,
  profile: null,
  kitTrack: null,
  docs: { resume: null, career: null, portfolio: null },
});

const bad = (html: string) => /NaN|Infinity|undefined/.test(html);

describe('stats charts render without NaN (Review Focus 4, 5)', () => {
  test('zero buckets and zero max', () => {
    expect(bad(renderToStaticMarkup(createElement(StackedBarChart, { buckets: [], mode: 'count', unit: 'month' })))).toBe(false);
    const zero = byPeriod([item('2026-03-05')], 'month', { from: '2026-01-01' }, '2026-03-20').map((b) => ({
      ...b,
      tally: tally([]),
    }));
    for (const mode of ['count', 'ratio'] as const) {
      expect(bad(renderToStaticMarkup(createElement(StackedBarChart, { buckets: zero, mode, unit: 'month' })))).toBe(false);
    }
  });
  test('36+ months and ratio mode', () => {
    const items = [item('2023-01-05'), item('2026-03-05', 'passed')];
    const buckets = byPeriod(items, 'month', {}, '2026-03-20');
    expect(buckets.length).toBeGreaterThan(36);
    const html = renderToStaticMarkup(createElement(StackedBarChart, { buckets, mode: 'ratio', unit: 'month' }));
    expect(bad(html)).toBe(false);
    expect(html).toContain('(진행 중)');
  });
  test('bars, columns, funnel, rate text with empty data', () => {
    const t = tally([]);
    expect(bad(renderToStaticMarkup(createElement(HBarChart, { rows: [{ key: 'a', label: 'a', total: 0, passed: 0, tally: t }] })))).toBe(false);
    expect(bad(renderToStaticMarkup(createElement(ColumnChart, { cols: [{ label: '월', total: 0, passed: 0, tally: t }] })))).toBe(false);
    expect(bad(renderToStaticMarkup(createElement(FunnelChart, { steps: funnel([]) })))).toBe(false);
  });
  test('RateText shows the sample rules', () => {
    const r = (outcomes: StatItem['outcome'][]) => {
      const t = tally(outcomes);
      return renderToStaticMarkup(createElement(RateText, { passed: t.passed, sample: t.sample, rate: t.passRate, level: t.sampleLevel }));
    };
    expect(r([])).toContain('결과 없음');
    expect(r(['passed', 'rejected', 'rejected'])).toContain('표본 부족 (n=3)');
    expect(r(Array(1).fill('passed').concat(Array(7).fill('rejected')))).toContain('표본 적음');
    expect(r(Array(9).fill('passed').concat(Array(460).fill('rejected')))).toContain('1.9% (9/469)');
  });
});
