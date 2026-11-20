import type { DashboardView } from './dashboard-params';
import { groupDashboardRows, type DashboardRow } from './dashboard';

// 대시보드 지원 기록 목록의 페이지 나누기. 순수 계산이다.

/** 전체 보기의 한 페이지 건수 */
export const PAGE_SIZE = 50;
/** 묶음(사이트별·이력서별)·상태별 보드 열이 처음 보여 주는 건수 */
export const GROUP_PREVIEW = 20;

/** 주소의 page 값. 양의 정수가 아니면 1 */
export function parsePage(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  return s && Number.isInteger(n) && n >= 1 ? n : 1;
}

/** 주소의 more 값(쉼표로 구분한 묶음 키). 공백 제거, 중복 제거 */
export function parseMore(v: string | string[] | undefined): string[] {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return [];
  return [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 50);
}

export type PageSlice<T> = {
  items: T[];
  /** 범위를 벗어난 값은 가까운 쪽 끝으로 맞춘 현재 페이지 */
  page: number;
  pageCount: number;
  total: number;
  /** 이 페이지의 첫·마지막 번호(1부터). 비어 있으면 0 */
  from: number;
  to: number;
};

export function pageSlice<T>(items: T[], page: number, size: number = PAGE_SIZE): PageSlice<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, pageCount, total, from: total === 0 ? 0 : start + 1, to: start + slice.length };
}

/** 페이지 번호 줄: 처음과 끝, 현재 주변 5개, 사이는 "…" */
export function pageNumbers(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.min(Math.max(page - 2, 1), pageCount - 4);
  const end = start + 4;
  const out: (number | '…')[] = [];
  if (start > 1) out.push(1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pageCount - 1) out.push('…');
  if (end < pageCount) out.push(pageCount);
  return out;
}

/**
 * 지금 화면에 보이는 행. 전체 보기는 그 페이지, 묶음·보드는 묶음마다 처음 GROUP_PREVIEW건
 * (more에 `${view}:${묶음 키}`가 있으면 그 묶음은 전부). 기록 상세는 이 행들만 읽는다.
 */
export function selectVisibleRows(
  rows: DashboardRow[],
  view: DashboardView,
  page: number,
  more: string[],
  today: string,
): DashboardRow[] {
  if (view === 'all') return pageSlice(rows, page).items;
  return groupDashboardRows(rows, view, today).flatMap((g) =>
    more.includes(`${view}:${g.key}`) ? g.rows : g.rows.slice(0, GROUP_PREVIEW),
  );
}
