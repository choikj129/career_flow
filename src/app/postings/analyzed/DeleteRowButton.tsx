"use client";

import { useState } from "react";
import { deletePostingFromListAction } from "@/app/_actions/postings";
import { ConfirmModal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";

/** 분석한 공고 목록 줄 끝의 [삭제]. 줄 이동(ClickableRow)이 일어나지 않게 클릭·키 입력을 여기서 멈춘다. */
export function DeleteRowButton({ postingId, label }: { postingId: number; label: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, setError, run } = useAction();
  return (
    <td className="row-del" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn quiet"
        aria-label={`${label} 삭제`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        삭제
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
          onConfirm={() => run(() => deletePostingFromListAction(postingId), () => setOpen(false))}
        />
      )}
    </td>
  );
}
