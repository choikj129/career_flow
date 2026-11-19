import { groupDashboardRows, type DashboardGroup, type DashboardRow } from "@/lib/search/dashboard";
import type { DashboardView } from "@/lib/search/dashboard-params";
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
  closed: "#98A0AE",
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
  view,
  rows,
  details,
  siteNotes,
  today,
}: {
  view: DashboardView;
  rows: DashboardRow[];
  details: Record<number, RecordDetail>;
  siteNotes: string[];
  today: string;
}) {
  if (view === "all") {
    return (
      <div className="card table-card">
        <ApplicationTable rows={rows} details={details} siteNotes={siteNotes} />
        <div className="table-foot">총 {rows.length}건</div>
      </div>
    );
  }

  if (view === "status") {
    const columns: BoardColumn[] = groupDashboardRows(rows, "status", today).map((g) => ({
      key: g.key,
      label: g.key === "closed" ? "불합격·지원취소" : g.label,
      color: STATUS_COLUMN_COLORS[g.key],
      rows: g.rows,
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
            <ApplicationTable rows={g.rows} details={details} siteNotes={siteNotes} showSite={false} />
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
            <ApplicationTable rows={g.rows} details={details} siteNotes={siteNotes} />
          </Group>
        );
      })}
    </>
  );
}
