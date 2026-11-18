"use client";

import { useState } from "react";
import { deletePostingAction } from "@/app/_actions/postings";
import { ConfirmModal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";

/** [공고 삭제]. 지원 기록이 없는 공고에만 보인다. 삭제하면 대시보드로 간다. */
export function DeletePostingButton({ postingId }: { postingId: number }) {
  const [open, setOpen] = useState(false);
  const { pending, error, setError, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="btn quiet"
        style={{ color: "var(--sub)" }}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        공고 삭제
      </button>
      {open && (
        <ConfirmModal
          title="공고 삭제"
          message="이 공고와 분석 결과를 삭제합니다. 되돌릴 수 없습니다."
          confirmLabel="삭제"
          danger
          pending={pending}
          error={error}
          onClose={() => setOpen(false)}
          onConfirm={() => run(() => deletePostingAction(postingId))}
        />
      )}
    </>
  );
}
