"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

/** 작은 창. 바깥을 누르거나 Esc로 닫는다. 표 안에서도 쓸 수 있게 body에 그린다. */
export function Modal({
  title,
  description,
  onClose,
  wide,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="overlay on"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        {description ? (
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 확인 창. 삭제처럼 되돌릴 수 없는 동작 앞에 쓴다. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ margin: "14px 0 0" }}>{message}</p>
      {error ? <p className="err">{error}</p> : null}
      <footer>
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className={`btn ${danger ? "danger" : "primary"}`} disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}
