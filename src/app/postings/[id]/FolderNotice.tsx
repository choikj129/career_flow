"use client";

import { useEffect, useState } from "react";
import { clearSessionRequestCopied, FOLDER_NOTICE_EVENT } from "@/lib/applications/folder-notice";

/**
 * D-34: 이력서 세션 요청을 복사했지만 맞춤본이 아닌 서류로 저장했을 때 한 번 뜨는 안내 상자.
 * 저장 쪽(지원 완료·기록 수정)이 조건을 보고 이벤트를 보낸다. 보이면 그 공고의 복사 표시를 지워 다시 뜨지 않게 한다.
 */
export function FolderNotice({ postingId, companyName }: { postingId: number; companyName: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ postingId: number }>).detail?.postingId !== postingId) return;
      clearSessionRequestCopied(postingId);
      setShown(true);
    };
    window.addEventListener(FOLDER_NOTICE_EVENT, on);
    return () => window.removeEventListener(FOLDER_NOTICE_EVENT, on);
  }, [postingId]);
  if (!shown) return null;
  return (
    <div className="notice warn" role="status" data-testid="folder-notice" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <span>
        이 공고는 이력서 세션 맞춤본이 아닌 서류로 냈습니다. 이력서 세션에서 만든 이 공고의 지원 폴더(지원\{companyName})는 쓰지 않으니, 이력서 세션에 지워 달라고 하세요.
      </span>
      <button type="button" className="btn sm" data-testid="folder-notice-close" onClick={() => setShown(false)}>
        닫기
      </button>
    </div>
  );
}
