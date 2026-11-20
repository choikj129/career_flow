"use client";

import { useState } from "react";
import { changeStatusAction } from "@/app/_actions/applications";
import { todayLocal } from "@/lib/domain/dates";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/domain/types";
import { useAction } from "./useAction";
import { DateInput } from "./DateInput";

/** 상태 변경 폼(상태 / 면접 차수 / 날짜 / 메모). docs/spec/screens.md 3.8 */
export function StatusForm({
  applicationId,
  currentStatus,
  currentRound,
  initialStatus,
  onDone,
  onCancel,
}: {
  applicationId: number;
  currentStatus: ApplicationStatus;
  currentRound: number | null;
  initialStatus?: ApplicationStatus;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(initialStatus ?? currentStatus);
  const [round, setRound] = useState(String(currentStatus === "interview" ? (currentRound ?? 0) + 1 : 1));
  const [at, setAt] = useState(todayLocal());
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();

  return (
    <form
      className="rec-panel"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            changeStatusAction({
              applicationId,
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
          새 상태
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
        <label className="f" style={{ flex: "1 1 180px" }}>
          메모
          <input className="in-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === "assignment" ? "선택 (예: 코딩테스트, 과제 제출)" : "선택"} />
        </label>
        <button type="submit" className="btn primary sm" disabled={pending}>
          저장
        </button>
        {onCancel && (
          <button type="button" className="btn sm" onClick={onCancel}>
            취소
          </button>
        )}
      </div>
      {error ? <p className="field-err">{error}</p> : null}
    </form>
  );
}
