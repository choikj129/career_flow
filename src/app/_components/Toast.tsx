"use client";

import { useSearchParams } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

/** 화면 위쪽에 잠깐 뜨는 한 줄 알림 */
export function useToast() {
  return useContext(ToastContext);
}

/** 주소의 `?notice=` 값을 알림으로 보여 주고 주소에서 지운다(리다이렉트 뒤 알림용). */
function NoticeFromUrl({ show }: { show: (m: string) => void }) {
  const params = useSearchParams();
  const notice = params.get("notice");
  useEffect(() => {
    if (!notice) return;
    show(notice);
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [notice, show]);
  return null;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((m: string) => {
    setMessage(m);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast${on ? " on" : ""}`} role="status" aria-live="polite">
        {message}
      </div>
      <Suspense fallback={null}>
        <NoticeFromUrl show={show} />
      </Suspense>
    </ToastContext.Provider>
  );
}
