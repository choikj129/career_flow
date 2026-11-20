import { groupDashboardRows, type DashboardGroup, type DashboardRow } from "@/lib/search/dashboard";
import Link from "next/link";
import { dashboardHref, type DashboardParams } from "@/lib/search/dashboard-params";
import { GROUP_PREVIEW, pageSlice } from "@/lib/search/paging";
import { Pagination } from "./Pagination";
import type { SiteId } from "@/lib/domain/types";
import { RateText } from "./RateText";
import { ApplicationTable } from "./ApplicationTable";
import { Group } from "./Group";
import type { RecordDetail } from "./RecordPanel";
import { StatusBoard, type BoardColumn } from "./StatusBoard";

const STATUS_COLUMN_COLORS: Record<string, string> = {
  applied: "#5B6475",
  document_passed: "#0369A1",
  assignment: "#1F5FAD",
  interview: "#2342C8",
  final_passed: "#15803D",
  closed: "#B91C1C",
};

/** 서류 통과율. 결과가 나온 지원이 없으면 "결과 대기". */
function Rate({ g }: { g: DashboardGroup }) {
  const t = g.tally;
  if (t.sample === 0) return <>결과 대기</>;
  return (
    <>
      서류 통과 <b>{t.passed}</b> / {t.sample} · <RateText passed={t.passed} sample={t.sample} rate={t.passRate} level={t.sampleLevel} compact />
    </>
  );
}

/** 대시보드 보기 4종(전체 / 사이트별 / 상태별 보드 / 이력서별). 검색·필터는 rows에 이미 적용되어 있다. */
export function DashboardViews({
  params,
  rows,
  details,
  siteNotes,
  today,
}: {
  params: DashboardParams;
  rows: DashboardRow[];
  details: Record<number, RecordDetail>;
  siteNotes: string[];
  today: string;
}) {
  const { view } = params;
  /** 묶음·열에서 처음 GROUP_PREVIEW건만 보이고, 더 보기를 누르면(주소의 more) 그 묶음은 전부 */
  const shown = <T,>(key: string, list: T[]) => (params.more.includes(`${view}:${key}`) ? list : list.slice(0, GROUP_PREVIEW));
  const moreHref = (key: string) => dashboardHref({ ...params, more: [...params.more, `${view}:${key}`] });
  const MoreLink = ({ k, hidden, unit }: { k: string; hidden: number; unit: string }) =>
    hidden > 0 ? (
      <div className="table-foot">
        <Link className="more-link" href={moreHref(k)} replace scroll={false}>
          {hidden}{unit} 더 보기
        </Link>
      </div>
    ) : null;
  if (view === "all") {
    const pg = pageSlice(rows, params.page);
    return (
      <div className="card table-card">
        <ApplicationTable rows={pg.items} details={details} siteNotes={siteNotes} />
        <Pagination pg={pg} params={params} />
      </div>
    );
  }

  if (view === "status") {
    const columns: BoardColumn[] = groupDashboardRows(rows, "status", today).map((g) => ({
      key: g.key,
      label: g.key === "closed" ? "불합격·지원취소" : g.label,
      color: STATUS_COLUMN_COLORS[g.key],
      rows: shown(g.key, g.rows),
      total: g.rows.length,
      moreHref: g.rows.length > GROUP_PREVIEW && !params.more.includes(`status:${g.key}`) ? moreHref(g.key) : undefined,
    }));
    return <StatusBoard columns={columns} details={details} siteNotes={siteNotes} />;
  }

  if (view === "site") {
    return (
      <>
        {groupDashboardRows(rows, "site", today).map((g) => (
          <Group
            key={g.key}
            storageKey={`site:${g.key}`}
            chip={<span className={`label-chip ${g.key as SiteId}`}>{g.label}</span>}
            count={g.rows.length}
            rate={<Rate g={g} />}
          >
            <ApplicationTable rows={shown(g.key, g.rows)} details={details} siteNotes={siteNotes} showSite={false} />
            <MoreLink k={g.key} hidden={g.rows.length - shown(g.key, g.rows).length} unit="건" />
          </Group>
        ))}
      </>
    );
  }

  // 이력서별
  return (
    <>
      {groupDashboardRows(rows, "resume", today).map((g) => {
        const base = g.rows.filter((r) => r.resumeLabel?.startsWith("기본")).length;
        const tailored = g.rows.filter((r) => r.resumeLabel?.startsWith("맞춤")).length;
        const chip =
          g.key === "none" ? (
            <>
              <span className="label-chip">제출 이력서 모름</span>
              <span className="muted small">가져온 기록</span>
            </>
          ) : (
            <>
              <span className="label-chip" style={{ "--c": "var(--accent)" } as React.CSSProperties}>
                {g.label} 기준
              </span>
              <span className="muted small">
                기본 {base}, 맞춤 {tailored}
              </span>
            </>
          );
        return (
          <Group key={g.key} storageKey={`resume:${g.key}`} chip={chip} count={g.rows.length} rate={<Rate g={g} />}>
            <ApplicationTable rows={shown(g.key, g.rows)} details={details} siteNotes={siteNotes} />
            <MoreLink k={g.key} hidden={g.rows.length - shown(g.key, g.rows).length} unit="건" />
          </Group>
        );
      })}
    </>
  );
}
