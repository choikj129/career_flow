import { validDate } from '@/lib/domain/dates';
import { SITE_IDS, type SiteId } from '@/lib/domain/types';
import { DOC_KINDS, type DocKind } from '@/lib/documents/files';
import { periodRange } from '@/lib/search/dashboard-params';
import type { StatsQuery } from './load';

export const STATS_PERIODS = ['all', '3m', '1y', 'custom'] as const;
export type StatsParams = {
  period: (typeof STATS_PERIODS)[number];
  from?: string;
  to?: string;
  site?: SiteId;
  unit: 'month' | 'year';
  mode: 'count' | 'ratio';
  doc: DocKind;
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseStatsParams(sp: Raw): StatsParams {
  const period = first(sp.period);
  const p = (STATS_PERIODS as readonly string[]).includes(period ?? '') ? (period as StatsParams['period']) : 'all';
  const from = first(sp.from);
  const to = first(sp.to);
  const site = first(sp.site);
  const doc = first(sp.doc);
  return {
    period: p,
    from: p === 'custom' && from && validDate(from) ? from : undefined,
    to: p === 'custom' && to && validDate(to) ? to : undefined,
    site: (SITE_IDS as string[]).includes(site ?? '') ? (site as SiteId) : undefined,
    unit: first(sp.unit) === 'year' ? 'year' : 'month',
    mode: first(sp.mode) === 'ratio' ? 'ratio' : 'count',
    doc: (DOC_KINDS as readonly string[]).includes(doc ?? '') ? (doc as DocKind) : 'resume',
  };
}

/** /stats?… 기본값(all, month, count, resume)은 생략 */
export function statsHref(p: Partial<StatsParams>): string {
  const qs = new URLSearchParams();
  if (p.period && p.period !== 'all') {
    qs.set('period', p.period);
    if (p.period === 'custom') {
      if (p.from) qs.set('from', p.from);
      if (p.to) qs.set('to', p.to);
    }
  }
  if (p.site) qs.set('site', p.site);
  if (p.unit && p.unit !== 'month') qs.set('unit', p.unit);
  if (p.mode && p.mode !== 'count') qs.set('mode', p.mode);
  if (p.doc && p.doc !== 'resume') qs.set('doc', p.doc);
  const s = qs.toString();
  return s ? `/stats?${s}` : '/stats';
}

export function toStatsQuery(p: StatsParams, now: Date = new Date()): StatsQuery {
  const r = periodRange(p, now);
  const q: StatsQuery = {};
  if (p.site) q.site = p.site;
  if (r.from) q.from = r.from;
  if (r.to) q.to = r.to;
  return q;
}
