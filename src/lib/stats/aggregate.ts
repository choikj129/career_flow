import { weekdayMon0 } from '@/lib/domain/dates';
import { SITE_IDS, type SiteId } from '@/lib/domain/types';
import { DOC_NONE, canBeNone, docFileOf, docLabel, type DocKind } from '@/lib/documents/files';
import type { StatItem } from './load';
import { tally, type Tally } from './rates';

// 순수 집계 함수. 같은 StatItem[]에서 영역마다 다시 센다.

const tallyOf = (items: readonly StatItem[]): Tally => tally(items.map((i) => i.outcome));
const minMax = (items: readonly StatItem[]): { first: string | null; last: string | null } => {
  if (items.length === 0) return { first: null, last: null };
  const days = items.map((i) => i.appliedAt).sort();
  return { first: days[0], last: days[days.length - 1] };
};

export type PeriodBucket = { key: string; label: string; partial: boolean; tally: Tally };

/** 지원일의 단위 키: month → YYYY-MM, year → YYYY */
const unitKey = (day: string, unit: 'month' | 'year'): string => (unit === 'month' ? day.slice(0, 7) : day.slice(0, 4));

function nextKey(key: string, unit: 'month' | 'year'): string {
  if (unit === 'year') return String(Number(key) + 1);
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * range.from 없으면 가장 이른 지원일의 단위부터, range.to 없으면 today의 단위까지. 빈 단위도 0건으로 넣는다.
 * items가 비면 []. 오늘이 속한 단위만 partial.
 */
export function byPeriod(
  items: StatItem[],
  unit: 'month' | 'year',
  range: { from?: string; to?: string },
  today: string,
): PeriodBucket[] {
  if (items.length === 0) return [];
  const days = items.map((i) => i.appliedAt).sort();
  let start = unitKey(range.from ?? days[0], unit);
  if (start > unitKey(days[0], unit)) start = unitKey(days[0], unit);
  let end = unitKey(range.to ?? today, unit);
  const lastItem = unitKey(days[days.length - 1], unit);
  if (end < lastItem) end = lastItem;
  const nowKey = unitKey(today, unit);
  const out: PeriodBucket[] = [];
  for (let k = start; k <= end; k = nextKey(k, unit)) {
    out.push({ key: k, label: k, partial: k === nowKey, tally: tallyOf(items.filter((i) => unitKey(i.appliedAt, unit) === k)) });
  }
  return out;
}

export type DocBucket = {
  key: string;
  label: string;
  unknown: boolean;
  /** 내지 않은 지원(경력기술서·포트폴리오의 "없음") */
  absent: boolean;
  firstApplied: string | null;
  lastApplied: string | null;
  tally: Tally;
};

const bucket = (key: string, label: string, unknown: boolean, items: StatItem[], absent = false): DocBucket => {
  const { first, last } = minMax(items);
  return { key, label, unknown, absent, firstApplied: first, lastApplied: last, tally: tallyOf(items) };
};

/** resume: 기본 v{n}(번호 ↓) → 파일(날짜 ↓) → 모름. career·portfolio: 파일 → 모름. 0건 묶음은 없음 */
export function byDocVersion(items: StatItem[], kind: DocKind): DocBucket[] {
  const out: DocBucket[] = [];
  const useBase = kind === 'resume';
  const isBase = (i: StatItem) => useBase && i.baseVersionNo != null;
  if (useBase) {
    const versions = [...new Set(items.filter(isBase).map((i) => i.baseVersionNo as number))].sort((a, b) => b - a);
    for (const v of versions) out.push(bucket(`v${v}`, `기본 v${v}`, false, items.filter((i) => i.baseVersionNo === v)));
  }
  const rest = items.filter((i) => !isBase(i));
  const files = [...new Set(rest.map((i) => docFileOf(i.docs[kind])).filter((f): f is string => f != null))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
  for (const f of files) out.push(bucket(`doc:${f}`, docLabel(f), false, rest.filter((i) => docFileOf(i.docs[kind]) === f)));
  const isAbsent = (i: StatItem) => canBeNone(kind) && i.docs[kind] === DOC_NONE;
  const absent = rest.filter(isAbsent);
  if (absent.length > 0) out.push(bucket('absent', '없음', false, absent, true));
  const unknown = rest.filter((i) => docFileOf(i.docs[kind]) == null && !isAbsent(i));
  if (unknown.length > 0) out.push(bucket('none', '모름', true, unknown));
  return out;
}

export type SiteBucket = { site: SiteId; tally: Tally };
export function bySite(items: StatItem[]): SiteBucket[] {
  return SITE_IDS.map((site) => ({ site, tally: tallyOf(items.filter((i) => i.site === site)) })).filter((b) => b.tally.total > 0);
}

export type FunnelStep = {
  stage: 'applied' | 'document_passed' | 'assignment' | 'interview' | 'final_passed';
  count: number;
  ofPrev: number | null;
  /** assignment만 true(거치지 않을 수 있는 곁가지) */
  optional: boolean;
};

/**
 * applied = 전체 − 통과 못 한 지원취소. 나머지는 그 단계를 거친 수.
 * ofPrev의 앞 단계는 optional이 아닌 바로 앞 단계다(과제·면접 모두 서류 통과 대비).
 */
export function funnel(items: StatItem[]): FunnelStep[] {
  const reachedN = (s: 'document_passed' | 'assignment' | 'interview' | 'final_passed') =>
    items.filter((i) => i.reached.includes(s)).length;
  const applied = items.filter((i) => i.outcome !== 'withdrawn').length;
  const doc = reachedN('document_passed');
  const asg = reachedN('assignment');
  const itv = reachedN('interview');
  const fin = reachedN('final_passed');
  const r = (n: number, prev: number): number | null => (prev > 0 ? n / prev : null);
  return [
    { stage: 'applied', count: applied, ofPrev: null, optional: false },
    { stage: 'document_passed', count: doc, ofPrev: r(doc, applied), optional: false },
    { stage: 'assignment', count: asg, ofPrev: r(asg, doc), optional: true },
    { stage: 'interview', count: itv, ofPrev: r(itv, doc), optional: false },
    { stage: 'final_passed', count: fin, ofPrev: r(fin, itv), optional: false },
  ];
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
export type WeekdayBucket = { weekday: number; label: string; tally: Tally };
export function byWeekday(items: StatItem[]): WeekdayBucket[] {
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    tally: tallyOf(items.filter((i) => weekdayMon0(i.appliedAt) === weekday)),
  }));
}
