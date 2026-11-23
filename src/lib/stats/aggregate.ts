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

/**
 * resume: 맞춤 이력서 → 기본 서류 {직무}(직무 글자 순) → 기본 v{n}(번호 ↓) → 파일(날짜 ↓) → 모름.
 * career·portfolio: 파일 → 없음 → 모름(맞춤·기본 서류 기록도 그 종류의 파일 값으로 센다). 0건 묶음은 없음
 */
export function byDocVersion(items: StatItem[], kind: DocKind): DocBucket[] {
  const out: DocBucket[] = [];
  const isResume = kind === 'resume';
  const isTailored = (i: StatItem) => isResume && i.tailored;
  const isKit = (i: StatItem) => isResume && i.kitTrack != null;
  const isBase = (i: StatItem) => isResume && i.baseVersionNo != null;
  if (isResume) {
    const tailored = items.filter(isTailored);
    if (tailored.length > 0) out.push(bucket('tailored', '맞춤 이력서', false, tailored));
    const tracks = [...new Set(items.filter(isKit).map((i) => i.kitTrack as string))].sort((a, b) => a.localeCompare(b, 'ko'));
    for (const t of tracks) out.push(bucket(`kit:${t}`, `기본 서류 ${t}`, false, items.filter((i) => isKit(i) && i.kitTrack === t)));
    const versions = [...new Set(items.filter(isBase).map((i) => i.baseVersionNo as number))].sort((a, b) => b - a);
    for (const v of versions) out.push(bucket(`v${v}`, `기본 v${v}`, false, items.filter((i) => i.baseVersionNo === v)));
  }
  const rest = items.filter((i) => !isTailored(i) && !isKit(i) && !isBase(i));
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

export type TailoredCompare = {
  /** 필터 안에서 맞춤본으로 낸 가장 이른 지원일 */
  since: string;
  /** 그날부터 맞춤본으로 낸 지원 */
  tailored: Tally;
  /** 그날부터 맞춤본이 아닌 지원(기본 서류·파일·예전 기본 버전·가져온 기록·모름 모두) */
  plain: Tally;
};

/** 맞춤본 기록이 없으면 null. 같은 날 기록은 들어간다 */
export function tailoredCompare(items: StatItem[]): TailoredCompare | null {
  const tailored = items.filter((i) => i.tailored);
  if (tailored.length === 0) return null;
  const since = tailored.map((i) => i.appliedAt).sort()[0];
  const from = items.filter((i) => i.appliedAt >= since);
  return { since, tailored: tallyOf(from.filter((i) => i.tailored)), plain: tallyOf(from.filter((i) => !i.tailored)) };
}

export type ProfileRow = { id: string; name: string; tailored: Tally; plain: Tally; all: Tally };

/**
 * 프로필이 기록된 지원(맞춤본의 프로필 + 기본 서류 그대로의 기본 프로필)을 프로필 id 글자 순으로 센다.
 * 프로필이 없는 기록(파일·모름·예전 기본 버전)은 빠진다. 이름은 그 프로필의 가장 최근 지원 기록 것.
 */
export function byProfile(items: StatItem[]): ProfileRow[] {
  const withProfile = items.filter((i): i is StatItem & { profile: { id: string; name: string } } => i.profile != null);
  const ids = [...new Set(withProfile.map((i) => i.profile.id))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ids.map((id) => {
    const mine = withProfile.filter((i) => i.profile.id === id);
    const latest = [...mine].sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : a.appliedAt > b.appliedAt ? -1 : 0))[0];
    return {
      id,
      name: latest.profile.name,
      tailored: tallyOf(mine.filter((i) => i.tailored)),
      plain: tallyOf(mine.filter((i) => !i.tailored)),
      all: tallyOf(mine),
    };
  });
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
