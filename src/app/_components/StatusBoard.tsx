"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApplicationStatus } from "@/lib/domain/types";
import type { DashboardRow } from "@/lib/search/dashboard";
import { Modal } from "./Modal";
import { RecordPanel, type RecordDetail } from "./RecordPanel";
import { SiteBadge } from "./SiteBadge";
import { StatusForm } from "./StatusForm";

export type BoardColumn = { key: string; label: string; color: string; rows: DashboardRow[] };

const DROP_STATUS: Record<string, ApplicationStatus> = {
  applied: "applied",
  document_passed: "document_passed",
  assignment: "assignment",
  interview: "interview",
  final_passed: "final_passed",
  closed: "rejected",
};

/** 상태별 보드. 카드를 다른 열로 끌면 상태 변경 창이 열리고, 저장해야 바뀐다. */
export function StatusBoard({
  columns,
  details,
  siteNotes,
}: {
  columns: BoardColumn[];
  details: Record<number, RecordDetail>;
  siteNotes: string[];
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [move, setMove] = useState<{ row: DashboardRow; target: ApplicationStatus } | null>(null);
  const [recordId, setRecordId] = useState<number | null>(null);
  const all = columns.flatMap((c) => c.rows);
  const recordDetail = recordId != null ? details[recordId] : undefined;

  return (
    <>
      <div className="board">
        {columns.map((c) => (
          <section
            key={c.key}
            className={`col${overKey === c.key ? " drop-over" : ""}`}
            style={{ "--cc": c.color } as React.CSSProperties}
            onDragOver={(e) => {
              e.preventDefault();
              setOverKey(c.key);
            }}
            onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              setOverKey(null);
              const row = all.find((r) => r.applicationId === dragId);
              setDragId(null);
              if (!row || c.rows.some((r) => r.applicationId === row.applicationId)) return;
              setMove({ row, target: DROP_STATUS[c.key] });
            }}
          >
            <div className="col-head">
              <span className="label-chip">{c.label}</span>
              <span className="n">{c.rows.length}</span>
            </div>
            {c.rows.length === 0 && (
              <p className="faint small" style={{ padding: "6px 4px" }}>
                없음
              </p>
            )}
            {c.rows.map((r) => (
              <button
                key={r.applicationId}
                type="button"
                className="kcard"
                draggable
                onDragStart={() => setDragId(r.applicationId)}
                onDragEnd={() => setDragId(null)}
                onClick={() => {
                  if (r.postingId != null) router.push(`/postings/${r.postingId}`);
                  else setRecordId(r.applicationId);
                }}
              >
                <div className="t">
                  {r.companyName}
                  {r.postingId == null && <span className="tag-rec">기록만</span>}
                </div>
                <div className="p">{r.positionTitle}</div>
                <div className="m">
                  <SiteBadge site={r.site} note={r.siteNote} />
                  {r.status === "interview" && r.interviewRound ? (
                    <span className="round-tag">{r.interviewRound}차</span>
                  ) : null}
                  {r.status === "withdrawn" && <span>지원취소</span>}
                  {r.status === "rejected" && <span>불합격</span>}
                  <span>{r.appliedAt.slice(5).replace("-", "/")}</span>
                  <span className="fitn">{r.fitScore ?? ""}</span>
                </div>
              </button>
            ))}
          </section>
        ))}
      </div>
      <p className="pager-note">카드를 다른 열로 끌어 놓으면 상태 변경 창이 열립니다(날짜·면접 차수 확인 후 저장).</p>

      {move && (
        <Modal
          title="상태 변경"
          description={`${move.row.companyName} · ${move.row.positionTitle}`}
          onClose={() => setMove(null)}
          wide
        >
          <div style={{ marginTop: 14 }}>
            <StatusForm
              applicationId={move.row.applicationId}
              currentStatus={move.row.status}
              currentRound={move.row.interviewRound}
              initialStatus={move.target}
              onDone={() => setMove(null)}
              onCancel={() => setMove(null)}
            />
          </div>
        </Modal>
      )}
      {recordDetail && (
        <Modal
          title={`${recordDetail.companyName} · ${recordDetail.positionTitle}`}
          description="공고 없이 기록만 있는 지원입니다."
          onClose={() => setRecordId(null)}
          wide
        >
          <div style={{ marginTop: 14 }}>
            <RecordPanel record={recordDetail} siteNotes={siteNotes} onChanged={() => setRecordId(null)} />
          </div>
        </Modal>
      )}
    </>
  );
}
