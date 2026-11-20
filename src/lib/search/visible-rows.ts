import type { DashboardView } from './dashboard-params';
import { groupDashboardRows, type DashboardRow } from './dashboard';
import { GROUP_PREVIEW, pageSlice } from './paging';

// 서버 전용: dashboard.ts가 DB를 끌어오므로 클라이언트 컴포넌트에서 import하지 않는다.

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
