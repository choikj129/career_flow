import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { isPastDeadline, todayLocal } from "@/lib/domain/dates";
import { listAnalyzedNotApplied, listUnanalyzedPostings } from "@/lib/postings/repo";
import { DeleteRowButton } from "./DeleteRowButton";
import { ClickableRow } from "../../_components/ClickableRow";
import { Fit } from "../../_components/Fit";
import { SiteBadge } from "../../_components/SiteBadge";

export default function AnalyzedPage() {
  return (
    <main className="page">
      <div className="title-row">
        <div>
          <h1>분석한 공고</h1>
          <p className="desc">분석만 하고 아직 지원하지 않은 공고입니다. 지원하면 지원 기록으로 옮겨집니다.</p>
        </div>
        <Link className="btn primary" href="/postings/new">
          + 공고 등록
        </Link>
      </div>
      <Suspense fallback={<p className="muted" style={{ marginTop: 22 }}>불러오는 중…</p>}>
        <AnalyzedTable />
      </Suspense>
    </main>
  );
}

async function AnalyzedTable() {
  await connection();
  const today = todayLocal();
  const analyzed = listAnalyzedNotApplied();
  const pending = listUnanalyzedPostings();

  if (analyzed.length === 0 && pending.length === 0) {
    return (
      <div className="card empty-hint" style={{ marginTop: 22 }}>
        <h3>분석만 하고 지원하지 않은 공고가 없습니다.</h3>
      </div>
    );
  }

  // 등록일은 공고 등록 시각. 분석 결과가 있는 공고는 분석 시각 순, 분석 중·실패는 맨 위에 둔다.
  return (
    <div className="card table-card" style={{ marginTop: 22 }}>
      <table>
        <thead>
          <tr>
            <th>회사</th>
            <th>포지션</th>
            <th className="col-site">사이트</th>
            <th className="num">적합도</th>
            <th>마감일</th>
            <th>분석일</th>
            <th aria-label="삭제"></th>
          </tr>
        </thead>
        <tbody>
          {pending.map((p) => (
            <ClickableRow key={`p${p.postingId}`} href={`/postings/${p.postingId}`}>
              <td className="co faint">{p.jobStatus === "failed" ? "분석 실패" : "분석 중"}</td>
              <td className="faint">{p.url ? p.url.replace(/^https?:\/\//, "").slice(0, 40) : "(본문만 등록)"}</td>
              <td className="col-site">
                <SiteBadge site={p.site} note={p.siteNote} />
              </td>
              <td className="num">
                {p.jobStatus === "failed" ? (
                  <span className="st warn">실패</span>
                ) : p.jobStatus === "canceled" || p.jobStatus == null ? (
                  <span className="faint">–</span>
                ) : (
                  <span className="muted small">
                    <span className="spinner" />
                    분석 중
                  </span>
                )}
              </td>
              <td className="faint">—</td>
              <td className="nw">{p.createdAt.slice(0, 10)}</td>
              <DeleteRowButton postingId={p.postingId} label={p.url ? p.url.replace(/^https?:\/\//, "").slice(0, 40) : "본문만 등록한 공고"} />
            </ClickableRow>
          ))}
          {analyzed.map((r) => {
            const past = isPastDeadline(r.deadline, today);
            return (
              <ClickableRow key={r.postingId} href={`/postings/${r.postingId}`} dim={past}>
                <td className="co">{r.companyName ?? "–"}</td>
                <td>{r.positionTitle ?? "–"}</td>
                <td className="col-site">
                  <SiteBadge site={r.site} note={r.siteNote} />
                </td>
                <td className="num">
                  <Fit score={r.fitScore} />
                </td>
                <td>
                  {r.deadline ? (
                    <>
                      <span className="nw">{r.deadline}</span>
                      {past ? " 마감" : ""}
                    </>
                  ) : (
                    "상시"
                  )}
                </td>
                <td className="nw">{r.analyzedAt.slice(0, 10)}</td>
                <DeleteRowButton postingId={r.postingId} label={`${r.companyName ?? "회사 미상"} ${r.positionTitle ?? ""}`.trim()} />
              </ClickableRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
