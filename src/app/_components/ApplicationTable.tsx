"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardRow } from "@/lib/search/dashboard";
import { Fit } from "./Fit";
import { RecordPanel, type RecordDetail } from "./RecordPanel";
import { SiteBadge } from "./SiteBadge";
import { StatusBadge } from "./StatusBadge";

export function ResumeTag({ label }: { label: string | null }) {
  if (!label) return <span className="faint">모름</span>;
  return <span className={`res-tag${label.startsWith("맞춤") ? " tailored" : ""}`}>{label}</span>;
}

/**
 * 지원 목록 표.
 * 공고가 있는 행을 누르면 공고 상세로, 기록만 있는 행은 그 자리에서 펼쳐 상태 변경 등을 한다.
 */
export function ApplicationTable({
  rows,
  details,
  siteNotes,
  showSite = true,
  showResume = true,
}: {
  rows: DashboardRow[];
  details: Record<number, RecordDetail>;
  siteNotes: string[];
  showSite?: boolean;
  showResume?: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const colSpan = 5 + (showSite ? 1 : 0) + (showResume ? 1 : 0);

  const activate = (r: DashboardRow) => {
    if (r.postingId != null) router.push(`/postings/${r.postingId}`);
    else setOpenId((cur) => (cur === r.applicationId ? null : r.applicationId));
  };

  return (
    <table>
      <thead>
        <tr>
          <th>회사</th>
          <th>포지션</th>
          {showSite && <th className="col-site">사이트</th>}
          <th>지원일</th>
          <th>상태</th>
          {showResume && <th>제출한 이력서</th>}
          <th className="num col-fit">적합도</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const detail = details[r.applicationId];
          const expanded = openId === r.applicationId && detail;
          return (
            <Fragment key={r.applicationId}>
              <tr
                className="row-link"
                tabIndex={0}
                aria-expanded={r.postingId == null ? Boolean(expanded) : undefined}
                onClick={() => activate(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") activate(r);
                }}
              >
                <td className="co">
                  {r.companyName}
                  {r.postingId == null && <span className="tag-rec">기록만</span>}
                </td>
                <td>{r.positionTitle}</td>
                {showSite && (
                  <td className="col-site">
                    <SiteBadge site={r.site} note={r.siteNote} />
                  </td>
                )}
                <td>{r.appliedAt}</td>
                <td>
                  <StatusBadge status={r.status} round={r.interviewRound} />
                </td>
                {showResume && (
                  <td>
                    <ResumeTag label={r.resumeLabel} />
                  </td>
                )}
                <td className="num col-fit">
                  <Fit score={r.fitScore} />
                </td>
              </tr>
              {expanded && (
                <tr className="expand-row">
                  <td colSpan={colSpan}>
                    <RecordPanel record={detail} siteNotes={siteNotes} onChanged={() => setOpenId(null)} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
