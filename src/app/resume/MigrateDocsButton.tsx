"use client";

import { migrateDocsFromNotesAction } from "@/app/_actions/documents";
import { useAction } from "@/app/_components/useAction";

export function MigrateDocsButton({ pendingCount }: { pendingCount: number }) {
  const { pending, error, run } = useAction();
  return (
    <div className="card" style={{ padding: "14px 18px", marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
      <span className="small">메모에 &quot;제출 서류&quot; 줄이 있는 기록이 {pendingCount}건 있습니다.</span>
      <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => migrateDocsFromNotesAction())}>
        메모의 제출 서류 옮기기
      </button>
      {error ? <span className="field-err" style={{ margin: 0 }}>{error}</span> : null}
    </div>
  );
}
