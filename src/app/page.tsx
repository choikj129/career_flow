import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getApplication, listStatusEvents } from "@/lib/applications/repo";
import { SITE_IDS, STATUS_LABELS } from "@/lib/domain/types";
import { getCompany } from "@/lib/companies/repo";
import { listSiteNotes } from "@/lib/postings/repo";
import { getLatestResume } from "@/lib/resume/repo";
import { getDashboardStats, searchApplications } from "@/lib/search/dashboard";
import {
  dashboardHref,
  parseDashboardParams,
  toSearchQuery,
  type DashboardParams,
  type DashboardView,
} from "@/lib/search/dashboard-params";
import { DashboardFilters } from "./_components/DashboardFilters";
import { DashboardViews } from "./_components/DashboardViews";
import type { RecordDetail } from "./_components/RecordPanel";
import { SiteBadge } from "./_components/SiteBadge";

const VIEW_TABS: { view: DashboardView; label: string; icon: React.ReactNode }[] = [
  {
    view: "all",
    label: "전체",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <path d="M1.5 6.5h13M6 6.5v7" />
      </svg>
    ),
  },
  {
    view: "site",
    label: "사이트별",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4h10M3 8h10M3 12h10" />
        <circle cx="1.5" cy="4" r=".5" />
      </svg>
    ),
  },
  {
    view: "status",
    label: "상태별",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.5" y="2.5" width="3.5" height="11" rx="1" />
        <rect x="6.25" y="2.5" width="3.5" height="8" rx="1" />
        <rect x="11" y="2.5" width="3.5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    view: "resume",
    label: "이력서별",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 1.5h5.5L12.5 4.5v10h-8.5z" />
        <path d="M6 8h4.5M6 10.5h4.5" />
      </svg>
    ),
  },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<main className="page muted">불러오는 중…</main>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection();
  const params = parseDashboardParams(await searchParams);
  const rows = searchApplications(toSearchQuery(params));
  const stats = getDashboardStats();
  const hasResume = getLatestResume() != null;
  const siteNotes = listSiteNotes();

  // 공고 없이 기록만 있는 행은 그 자리에서 펼쳐 쓰므로 상세를 미리 읽어 둔다.
  const details: Record<number, RecordDetail> = {};
  for (const r of rows) {
    if (r.postingId != null) continue;
    const app = getApplication(r.applicationId);
    if (!app) continue;
    details[r.applicationId] = {
      applicationId: app.id,
      companyName: getCompany(app.companyId)?.displayName ?? r.companyName,
      positionTitle: app.positionTitle,
      site: app.site,
      siteNote: app.siteNote,
      appliedAt: app.appliedAt,
      status: app.status,
      interviewRound: app.interviewRound,
      notes: app.notes,
      events: listStatusEvents(app.id).map((e) => ({
        id: e.id,
        status: e.status,
        interviewRound: e.interviewRound,
        at: e.at,
        note: e.note,
      })),
    };
  }

  const searching = params.q.trim() !== "";
  const filtered = searching || params.status || params.site || params.period !== "all";
  const totalRecords = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);

  return (
    <main className="page">
      {!hasResume && (
        <div className="notice warn" style={{ marginTop: 0, marginBottom: 16 }}>
          기본 이력서를 먼저 등록해야 공고를 분석할 수 있습니다 → <Link href="/resume">기본 이력서</Link>
        </div>
      )}
      <div className="title-row">
        <h1>지원 기록</h1>
        <Link className="btn primary" href="/postings/new">
          + 공고 등록
        </Link>
      </div>

      <div className="views" role="tablist" aria-label="보기">
        {VIEW_TABS.map((t) => (
          <Link
            key={t.view}
            role="tab"
            aria-selected={params.view === t.view}
            href={dashboardHref({ ...params, view: t.view })}
            replace
          >
            {t.icon}
            {t.label}
          </Link>
        ))}
      </div>

      <DashboardFilters params={params} />

      {!searching && totalRecords > 0 && (
        <div className="summary">
          <span>
            이번 달 지원<b>{stats.appliedThisMonth}</b>
          </span>
          {stats.byStatus.document_passed > 0 && (
            <span>
              {STATUS_LABELS.document_passed}
              <b>{stats.byStatus.document_passed}</b>
            </span>
          )}
          {stats.byStatus.interview > 0 && (
            <span>
              {STATUS_LABELS.interview}
              <b>{stats.byStatus.interview}</b>
            </span>
          )}
          {stats.byStatus.final_passed > 0 && (
            <span>
              {STATUS_LABELS.final_passed}
              <b>{stats.byStatus.final_passed}</b>
            </span>
          )}
          <span className="sites">
            {SITE_IDS.filter((s) => stats.bySite[s] > 0).map((s) => (
              <span key={s} style={{ marginRight: 14 }}>
                <SiteBadge site={s} />
                <span className="muted small"> {stats.bySite[s]}</span>
              </span>
            ))}
          </span>
          <Link href="/postings/analyzed">분석한 공고 {stats.analyzedNotApplied}건 보기</Link>
        </div>
      )}
      {searching && <div style={{ height: 14 }} />}

      {rows.length > 0 ? (
        <DashboardViews view={params.view} rows={rows} details={details} siteNotes={siteNotes} />
      ) : (
        <EmptyState params={params} filtered={Boolean(filtered)} totalRecords={totalRecords} />
      )}
    </main>
  );
}

function EmptyState({
  params,
  filtered,
  totalRecords,
}: {
  params: DashboardParams;
  filtered: boolean;
  totalRecords: number;
}) {
  if (totalRecords === 0) {
    return (
      <div className="card empty-hint">
        <h3>아직 지원 기록이 없습니다.</h3>
        <p className="muted">공고를 등록해 분석하거나, 이미 지원한 내역을 가져오세요.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12, alignItems: "center" }}>
          <Link className="btn primary" href="/postings/new">
            공고 등록
          </Link>
          <Link href="/import">이미 지원한 내역이 있다면 → 가져오기</Link>
        </div>
      </div>
    );
  }
  const q = params.q.trim();
  return (
    <div className="card empty-hint">
      <h3>{q ? `'${q}'에 지원한 기록이 없습니다.` : filtered ? "조건에 맞는 지원 기록이 없습니다." : "지원 기록이 없습니다."}</h3>
      {q && <p className="muted">회사명, 법인명, 별칭에서 모두 찾았습니다.</p>}
    </div>
  );
}
