"use client";

import { useState } from "react";
import { updatePostingInfoAction } from "@/app/_actions/postings";
import { Modal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";

/** 공고 머리의 [수정]: 회사명·포지션 직접 고치기. 회사는 이름으로 찾거나 새로 만들어 이 공고를 연결한다. */
export function EditPostingInfo({
  postingId,
  companyName,
  positionTitle,
  hasApplication,
}: {
  postingId: number;
  companyName: string;
  positionTitle: string;
  hasApplication: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn quiet edit-info" onClick={() => setOpen(true)}>
        수정
      </button>
      {open && (
        <EditModal
          postingId={postingId}
          companyName={companyName}
          positionTitle={positionTitle}
          hasApplication={hasApplication}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EditModal({
  postingId,
  companyName,
  positionTitle,
  hasApplication,
  onClose,
}: {
  postingId: number;
  companyName: string;
  positionTitle: string;
  hasApplication: boolean;
  onClose: () => void;
}) {
  const [company, setCompany] = useState(companyName);
  const [position, setPosition] = useState(positionTitle);
  const { pending, error, run } = useAction();
  const canSubmit = company.trim() !== "" && position.trim() !== "";

  return (
    <Modal title="공고 정보 수정" description="회사 이름을 바꾸면 그 이름의 회사를 찾거나 새로 만들어 이 공고를 연결합니다." onClose={onClose}>
      <label className="label" htmlFor="edit-company" style={{ marginTop: 16 }}>
        회사명
      </label>
      <input
        id="edit-company"
        className="in"
        value={company}
        maxLength={100}
        onChange={(e) => setCompany(e.target.value)}
        autoComplete="off"
      />
      <label className="label" htmlFor="edit-position" style={{ marginTop: 14 }}>
        포지션
      </label>
      <input
        id="edit-position"
        className="in"
        value={position}
        maxLength={200}
        onChange={(e) => setPosition(e.target.value)}
        autoComplete="off"
      />
      <p className="muted small" style={{ margin: "10px 0 0" }}>
        {hasApplication
          ? "이 공고로 지원한 기록의 회사도 함께 바뀝니다(기록의 포지션 이름은 그대로)."
          : "다른 공고와 지원 기록은 바뀌지 않습니다."}
      </p>
      {error ? <p className="err">{error}</p> : null}
      <footer>
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!canSubmit || pending}
          onClick={() => run(() => updatePostingInfoAction(postingId, company, position), onClose)}
        >
          저장
        </button>
      </footer>
    </Modal>
  );
}
