"use client";

import { Fragment, useState } from "react";
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
 * 행을 누르면 그 자리에서 펼쳐 상태 변경 등을 한다. 공고가 있는 행은 패널의 [공고 보기 →]로 공고 상세에 간다.
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
  const [openId, setOpenId] = useState<number | null>(null);
  const colSpan = 5 + (showSite ? 1 : 0) + (showResume ? 1 : 0);

  const activate = (r: DashboardRow) => {
    setOpenId((cur) => (cur === r.applicationId ? null : r.applicationId));
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
                aria-expanded={Boolean(expanded)}
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
                <td className="nw">{r.appliedAt}</td>
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
