"use client";

import { useState } from "react";
import { deleteApplicationAction } from "@/app/_actions/applications";
import { ApplicationEditModal, type EditableRecord } from "@/app/_components/ApplicationEditModal";
import { ConfirmModal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";

/** 지원 기록 탭의 [기록 수정]·[기록 삭제] */
export function RecordActions({ record, siteNotes }: { record: EditableRecord; siteNotes: string[] }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { pending, error, setError, run } = useAction();
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setEditing(true)}>
        기록 수정
      </button>
      <button
        type="button"
        className="btn sm danger"
        onClick={() => {
          setError(null);
          setDeleting(true);
        }}
      >
        기록 삭제
      </button>
      {editing && <ApplicationEditModal record={record} siteNotes={siteNotes} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmModal
          title="기록 삭제"
          message="지원 기록과 상태 이력을 삭제합니다. 공고는 분석한 공고로 돌아갑니다."
          confirmLabel="삭제"
          danger
          pending={pending}
          error={error}
          onClose={() => setDeleting(false)}
          onConfirm={() => run(() => deleteApplicationAction(record.applicationId), () => setDeleting(false))}
        />
      )}
    </>
  );
}
