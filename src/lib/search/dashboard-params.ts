import { todayLocal, validDate } from '@/lib/domain/dates';
import {
  APPLICATION_STATUSES,
  SITE_IDS,
  type ApplicationStatus,
  type SiteId,
} from '@/lib/domain/types';
import type { SearchQuery } from './dashboard';

export const DASHBOARD_VIEWS = ['all', 'site', 'status', 'resume'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];
export const PERIODS = ['all', 'month', '3m', '1y', 'custom'] as const;
export type Period = (typeof PERIODS)[number];

export type DashboardParams = {
  q: string;
  view: DashboardView;
  status: ApplicationStatus | undefined;
  site: SiteId | undefined;
  period: Period;
  from: string | undefined;
  to: string | undefined;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const isDate = (v: string | undefined): v is string => !!v && validDate(v);

export function parseDashboardParams(sp: Raw): DashboardParams {
  const view = first(sp.view);
  const status = first(sp.status);
  const site = first(sp.site);
  const period = first(sp.period);
  const p: Period = (PERIODS as readonly string[]).includes(period ?? '') ? (period as Period) : 'all';
  const from = first(sp.from);
  const to = first(sp.to);
  return {
    q: first(sp.q) ?? '',
    view: (DASHBOARD_VIEWS as readonly string[]).includes(view ?? '') ? (view as DashboardView) : 'all',
    status: (APPLICATION_STATUSES as string[]).includes(status ?? '') ? (status as ApplicationStatus) : undefined,
    site: (SITE_IDS as string[]).includes(site ?? '') ? (site as SiteId) : undefined,
    period: p,
    from: p === 'custom' && isDate(from) ? from : undefined,
    to: p === 'custom' && isDate(to) ? to : undefined,
  };
}

function ymd(y: number, m0: number, d: number): string {
  return todayLocal(new Date(y, m0, d));
}

/** 기간 선택을 from/to(YYYY-MM-DD)로 바꾼다. */
export function periodRange(
  p: Pick<DashboardParams, 'period'> & { from?: string; to?: string },
  now: Date = new Date(),
): { from?: string; to?: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (p.period) {
    case 'month':
      return { from: ymd(y, m, 1) };
    case '3m':
    case '1y': {
      const months = p.period === '3m' ? 3 : 12;
      const target = new Date(y, m - months, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      return { from: ymd(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)) };
    }
    case 'custom':
      return { from: p.from, to: p.to };
    default:
      return {};
  }
}

/** 대시보드 주소. 기본값은 생략한다. */
export function dashboardHref(p: Partial<DashboardParams>): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set('q', p.q);
  if (p.view && p.view !== 'all') qs.set('view', p.view);
  if (p.status) qs.set('status', p.status);
  if (p.site) qs.set('site', p.site);
  if (p.period && p.period !== 'all') {
    qs.set('period', p.period);
    if (p.period === 'custom') {
      if (p.from) qs.set('from', p.from);
      if (p.to) qs.set('to', p.to);
    }
  }
  const s = qs.toString();
  return s ? `/?${s}` : '/';
}

export function toSearchQuery(p: DashboardParams, now: Date = new Date()): SearchQuery {
  const range = periodRange(p, now);
  return {
    text: p.q.trim() || undefined,
    status: p.status,
    site: p.site,
    from: range.from,
    to: range.to,
  };
}
