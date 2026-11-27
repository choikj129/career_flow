"use client";

import { useEffect, useRef, useState } from "react";
import { regenerateBookmarkletTokenAction } from "@/app/_actions/bookmarklet";
import { ConfirmModal } from "@/app/_components/Modal";
import { useToast } from "@/app/_components/Toast";
import { useAction } from "@/app/_components/useAction";

/** 설정 > 북마크 버튼. 공고 페이지에서 누르면 화면 글자·주소를 이 앱으로 보내 바로 등록하고 분석한다. */
export function BookmarkletCard({ code, createdAt }: { code: string; createdAt: string }) {
  const link = useRef<HTMLAnchorElement>(null);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const { pending, error, setError, run } = useAction();

  // React 19는 href의 javascript: 주소를 막으므로 직접 넣는다.
  useEffect(() => {
    link.current?.setAttribute("href", code);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyFailed(false);
      toast("복사됨");
    } catch {
      setCopyFailed(true);
      toast("복사하지 못했습니다. 아래 글을 직접 복사하세요.");
    }
  }

  return (
    <div className="card form-card" id="bookmarklet">
      <h2>북마크 버튼</h2>
      <p className="muted small" style={{ margin: "0 0 4px" }}>
        공고 페이지에서 누르면 그 화면의 글자와 주소를 이 앱으로 보내 바로 등록하고 분석합니다. 채용 사이트에 따로 접속하지 않습니다.
      </p>
      <p style={{ margin: "14px 0 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a
          ref={link}
          className="btn primary"
          draggable
          onClick={(e) => {
            e.preventDefault();
            toast("북마크바로 끌어다 놓으세요");
          }}
        >
          Career Flow로 보내기
        </a>
        <span className="muted small">북마크바로 끌어다 놓으세요</span>
      </p>
      <ol className="small" style={{ margin: "12px 0 0", paddingLeft: 20 }}>
        <li>Chrome에서 Ctrl+Shift+B로 북마크바를 켭니다.</li>
        <li>위 버튼을 북마크바로 끌어다 놓습니다.</li>
        <li>공고 페이지에서 북마크바의 [Career Flow로 보내기]를 누릅니다.</li>
      </ol>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        끌어다 놓기가 안 되면 [코드 복사] 뒤 북마크바에서 오른쪽 클릭 → 페이지 추가 → URL 칸에 붙여넣으세요.
      </p>
      <div className="toolbar" style={{ marginTop: 14 }}>
        <span style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn sm" onClick={copy}>
            코드 복사
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            새로 만들기
          </button>
        </span>
        <span className="muted small">만든 날 {createdAt}</span>
      </div>
      {copyFailed && <textarea className="field-area" readOnly value={code} aria-label="북마크 버튼 코드" style={{ marginTop: 10 }} />}
      <p className="muted small" style={{ margin: "10px 0 0" }}>
        버튼 안에 이 앱만 아는 확인 값이 들어 있습니다. 다른 사람에게 보내지 마세요.
      </p>
      {confirming && (
        <ConfirmModal
          title="북마크 버튼 새로 만들기"
          message="북마크 버튼을 새로 만듭니다. 북마크바의 예전 버튼은 바로 분석하지 않고 확인을 받게 됩니다. 북마크바의 버튼을 지우고 새 버튼을 끌어다 놓으세요."
          confirmLabel="새로 만들기"
          pending={pending}
          error={error}
          onClose={() => setConfirming(false)}
          onConfirm={() => run(() => regenerateBookmarkletTokenAction(), () => setConfirming(false))}
        />
      )}
    </div>
  );
}
