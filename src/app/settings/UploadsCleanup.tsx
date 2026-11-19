"use client";

import { useState } from "react";
import { clearUploadsAction } from "@/app/_actions/settings";
import { ConfirmModal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";
import { formatBytes } from "@/lib/uploads/check";

/** 설정 > 데이터의 "올린 파일" 줄. 올린 이력서·캡처 원본을 지운다(D-09). */
export function UploadsCleanup({ count, bytes, busy }: { count: number; bytes: number; busy: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, setError, run } = useAction();
  return (
    <>
      <div className="toolbar" style={{ marginTop: 10 }} data-testid="uploads-row">
        <span>
          올린 파일{" "}
          <b data-testid="uploads-summary">
            {count}개 · {formatBytes(bytes)}
          </b>
        </span>
        <button
          type="button"
          className="btn sm"
          disabled={busy || count === 0}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          올린 파일 정리
        </button>
      </div>
      {busy ? (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          가져오기 작업이 진행 중이라 지금은 정리할 수 없습니다. 작업이 끝난 뒤 시도하세요.
        </p>
      ) : (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          가져오기에 쓴 이력서·캡처 원본입니다. 지워도 이미 저장한 이력서와 지원 기록은 그대로입니다.
        </p>
      )}
      {confirming && (
        <ConfirmModal
          title="올린 파일 정리"
          message={`올린 이력서·캡처 원본 ${count}개(${formatBytes(bytes)})를 지웁니다. 이미 저장한 이력서와 지원 기록은 그대로입니다.`}
          confirmLabel="지우기"
          danger
          pending={pending}
          error={error}
          onClose={() => setConfirming(false)}
          onConfirm={() => run(() => clearUploadsAction(), () => setConfirming(false))}
        />
      )}
    </>
  );
}
