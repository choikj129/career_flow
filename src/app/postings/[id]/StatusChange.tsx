"use client";

import { useState } from "react";
import { Modal } from "@/app/_components/Modal";
import { StatusForm } from "@/app/_components/StatusForm";
import type { ApplicationStatus } from "@/lib/domain/types";

/** [상태 변경] 버튼과 작은 창(상태·차수·날짜·메모). docs/spec/screens.md 3.8 */
export function StatusChange({
  applicationId,
  status,
  round,
}: {
  applicationId: number;
  status: ApplicationStatus;
  round: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        상태 변경
      </button>
      {open && (
        <Modal title="상태 변경" onClose={() => setOpen(false)} wide>
          <div style={{ marginTop: 14 }}>
            <StatusForm
              applicationId={applicationId}
              currentStatus={status}
              currentRound={round}
              onDone={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
