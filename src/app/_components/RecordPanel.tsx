"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteApplicationAction, updateNotesAction } from "@/app/_actions/applications";
import type { DocKind, SubmittedDocs as Docs } from "@/lib/documents/files";
import type { ApplicationStatus, SiteId } from "@/lib/domain/types";
import { ApplicationEditModal } from "./ApplicationEditModal";
import { ConfirmModal } from "./Modal";
import { sortEventsAscending } from "@/lib/applications/event-order";
import { StatusHistory } from "./StatusHistory";
import { StatusForm } from "./StatusForm";
import { SubmittedDocs } from "./SubmittedDocs";
import { useAction } from "./useAction";

export type RecordDetail = {
  applicationId: number;
  postingId: number | null;
  companyName: string;
  positionTitle: string;
  site: SiteId;
  siteNote: string | null;
  appliedAt: string;
  status: ApplicationStatus;
  interviewRound: number | null;
  notes: string | null;
  submittedDocs: Docs | null;
  docExists: Record<DocKind, boolean>;
  events: { id: number; status: ApplicationStatus; interviewRound: number | null; at: string; note: string | null }[];
};

/** 지원 기록 패널(공고 있는 행·기록만 있는 행 공통): 상태 변경, 이력, 메모, 수정·삭제. docs/spec/screens.md 1장 */
export function RecordPanel({
  record,
  siteNotes,
  onChanged,
}: {
  record: RecordDetail;
  siteNotes: string[];
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState(record.notes ?? "");
  const notesAction = useAction();
  const delAction = useAction();

  return (
    <div className="rec-panel" onClick={(e) => e.stopPropagation()}>
      {record.postingId != null && (
        <div style={{ textAlign: "right" }}>
          <Link href={`/postings/${record.postingId}`}>공고 보기 →</Link>
        </div>
      )}
      <div>
        <b style={{ fontSize: 13.5 }}>상태 변경</b>
        <div style={{ marginTop: 8 }}>
          <StatusForm
            applicationId={record.applicationId}
            currentStatus={record.status}
            currentRound={record.interviewRound}
            onDone={onChanged}
          />
        </div>
      </div>

      <div>
        <b style={{ fontSize: 13.5 }}>상태 이력</b>
        <StatusHistory events={sortEventsAscending(record.events, record.appliedAt).reverse()} />
      </div>

      <SubmittedDocs docs={record.submittedDocs} exists={record.docExists} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          notesAction.run(() => updateNotesAction(record.applicationId, notes));
        }}
      >
        <label className="f">
          메모
          <textarea className="in-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="btn sm" disabled={notesAction.pending}>
            메모 저장
          </button>
          {notesAction.error ? <span className="field-err" style={{ margin: 0 }}>{notesAction.error}</span> : null}
        </div>
      </form>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn sm" onClick={() => setEditing(true)}>
          기록 수정
        </button>
        {record.postingId == null && (
          <button type="button" className="btn sm danger" onClick={() => setDeleting(true)}>
            기록 삭제
          </button>
        )}
      </div>

      {editing && (
        <ApplicationEditModal
          record={{ ...record, postingId: record.postingId ?? undefined }}
          siteNotes={siteNotes}
          onClose={() => setEditing(false)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="기록 삭제"
          message="지원 기록과 상태 이력을 삭제합니다. 공고는 분석한 공고로 돌아갑니다."
          confirmLabel="삭제"
          danger
          pending={delAction.pending}
          error={delAction.error}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            delAction.run(
              () => deleteApplicationAction(record.applicationId),
              () => {
                setDeleting(false);
                onChanged?.();
              },
            )
          }
        />
      )}
    </div>
  );
}
