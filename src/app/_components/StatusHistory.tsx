"use client";

import { useState } from "react";
import { deleteStatusEventAction, updateStatusEventAction } from "@/app/_actions/applications";
import { eventDate } from "@/lib/domain/dates";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/domain/types";
import { DateInput } from "./DateInput";
import { ConfirmModal } from "./Modal";
import { StatusBadge } from "./StatusBadge";
import { useAction } from "./useAction";

export type HistoryEvent = {
  id: number;
  status: ApplicationStatus;
  interviewRound: number | null;
  at: string;
  note: string | null;
};

/** 상태 이력 목록(최신이 위). 항목마다 [수정]·[삭제]. 하나만 남으면 삭제할 수 없다. docs/spec/screens.md */
export function StatusHistory({ events, onChanged }: { events: HistoryEvent[]; onChanged?: () => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const delAction = useAction();
  const only = events.length <= 1;

  return (
    <>
      <ul className="history" style={{ marginTop: 4 }}>
        {events.map((ev) =>
          editingId === ev.id ? (
            <li key={ev.id} style={{ display: "block" }}>
              <HistoryEditForm
                ev={ev}
                onCancel={() => setEditingId(null)}
                onDone={() => {
                  setEditingId(null);
                  onChanged?.();
                }}
              />
            </li>
          ) : (
            <li key={ev.id} className="hist-row">
              <span>
                <span className="nw">{eventDate(ev.at)}</span>
                {ev.note ? <span className="tl-note">{ev.note}</span> : null}
              </span>
              <span className="hist-actions">
                <StatusBadge status={ev.status} round={ev.interviewRound} />
                <button type="button" className="btn sm" onClick={() => setEditingId(ev.id)}>
                  수정
                </button>
                <button
                  type="button"
                  className="btn sm danger"
                  disabled={only}
                  title={only ? "이력이 하나만 남으면 삭제할 수 없습니다" : undefined}
                  onClick={() => {
                    delAction.setError(null);
                    setDeletingId(ev.id);
                  }}
                >
                  삭제
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      {deletingId != null && (
        <ConfirmModal
          title="상태 이력 삭제"
          message="이 상태 이력을 삭제합니다. 지원 기록의 현재 상태는 남은 이력 중 가장 늦은 항목으로 바뀝니다."
          confirmLabel="삭제"
          danger
          pending={delAction.pending}
          error={delAction.error}
          onClose={() => setDeletingId(null)}
          onConfirm={() =>
            delAction.run(
              () => deleteStatusEventAction(deletingId),
              () => {
                setDeletingId(null);
                onChanged?.();
              },
            )
          }
        />
      )}
    </>
  );
}

function HistoryEditForm({ ev, onCancel, onDone }: { ev: HistoryEvent; onCancel: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<ApplicationStatus>(ev.status);
  const [round, setRound] = useState(String(ev.interviewRound ?? 1));
  const [at, setAt] = useState(eventDate(ev.at));
  const [note, setNote] = useState(ev.note ?? "");
  const { pending, error, run } = useAction();

  return (
    <form
      className="hist-edit"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            updateStatusEventAction({
              eventId: ev.id,
              status,
              interviewRound: status === "interview" ? Number(round) : null,
              at,
              note,
            }),
          onDone,
        );
      }}
    >
      <div className="inline-form">
        <label className="f">
          상태
          <select className="in-sm" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {status === "interview" && (
          <label className="f">
            면접 차수
            <input
              className="in-sm"
              type="number"
              min={1}
              required
              value={round}
              onChange={(e) => setRound(e.target.value)}
              style={{ width: 80 }}
            />
          </label>
        )}
        <label className="f">
          날짜
          <DateInput className="in-sm" required value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="f" style={{ flex: "1 1 160px" }}>
          메모
          <input className="in-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택" />
        </label>
        <button type="submit" className="btn primary sm" disabled={pending}>
          저장
        </button>
        <button type="button" className="btn sm" onClick={onCancel}>
          취소
        </button>
      </div>
      {error ? <p className="field-err">{error}</p> : null}
    </form>
  );
}
