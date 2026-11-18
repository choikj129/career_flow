"use client";

import { useState } from "react";
import { updateNotesAction } from "@/app/_actions/applications";
import { useAction } from "@/app/_components/useAction";

/** 지원 전체에 대한 메모 */
export function NotesForm({ applicationId, initial }: { applicationId: number; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const { pending, error, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateNotesAction(applicationId, notes));
      }}
    >
      <label className="f">
        메모
        <textarea className="in-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" className="btn sm" disabled={pending}>
          저장
        </button>
        {error ? <span className="field-err" style={{ margin: 0 }}>{error}</span> : null}
      </div>
    </form>
  );
}
