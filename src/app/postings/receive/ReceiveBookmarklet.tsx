"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { receiveBookmarkletAction } from "@/app/_actions/bookmarklet";
import { parseBookmarkletHash, type ReceiveResult } from "@/lib/bookmarklet/payload";
import { NewPostingForm } from "../new/NewPostingForm";

type View =
  | { kind: "start" }
  | { kind: "empty" }
  | { kind: "loading" }
  | Extract<ReceiveResult, { kind: "confirm" | "error" }>;

/**
 * 북마크 버튼이 `#cf=…`로 보낸 값을 읽어 등록하고 분석을 시작한다.
 * 주소의 `#`은 읽은 즉시, 서버 액션을 부르기 전에 지운다(확인 값·본문이 주소창·뒤로 가기에 남지 않게).
 */
export function ReceiveBookmarklet({ hasResume, siteNotes }: { hasResume: boolean; siteNotes: string[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "start" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // 개발 모드에서 효과가 두 번 실행돼도 한 번만
    started.current = true;
    const raw = window.location.hash;
    window.history.replaceState(window.history.state, "", "/postings/receive");
    const payload = parseBookmarkletHash(raw);
    if (!payload) {
      // 북마크 버튼이 보낸 모양인데 읽지 못한 경우와, 아무것도 받지 않은 경우를 나눈다.
      queueMicrotask(() =>
        setView(raw.startsWith("#cf=") ? { kind: "error", message: "받은 값의 형식이 맞지 않습니다." } : { kind: "empty" }),
      );
      return;
    }
    queueMicrotask(() => setView({ kind: "loading" }));
    receiveBookmarkletAction({ token: payload.k, url: payload.u, title: payload.t, text: payload.x, cut: payload.c })
      .then((r) => {
        if (r.kind === "registered" || r.kind === "existing") {
          router.replace(`/postings/${r.postingId}?notice=${encodeURIComponent(r.notice)}`);
        } else {
          setView(r);
        }
      })
      .catch(() => setView({ kind: "error", message: "서버에 연결하지 못했습니다." }));
  }, [router]);

  if (view.kind === "start") return null;
  if (view.kind === "loading") {
    return (
      <p className="desc" role="status" style={{ marginTop: 20 }}>
        공고를 등록하는 중…
      </p>
    );
  }
  if (view.kind === "empty") {
    return (
      <div className="card" style={{ marginTop: 20, padding: 32 }}>
        <p style={{ margin: 0 }}>받은 공고가 없습니다. 공고 페이지에서 북마크바의 [Career Flow로 보내기]를 누르세요.</p>
        <p style={{ margin: "18px 0 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary" href="/postings/new">
            공고 등록으로
          </Link>
          <Link className="btn" href="/settings#bookmarklet">
            설정에서 북마크 버튼 받기
          </Link>
        </p>
      </div>
    );
  }
  if (view.kind === "error") {
    return (
      <div className="card" style={{ marginTop: 20, padding: 32 }}>
        <p className="field-err" style={{ margin: 0 }}>
          받은 내용을 읽지 못했습니다: {view.message}
        </p>
        <p style={{ margin: "18px 0 0" }}>
          <Link className="btn primary" href="/postings/new">
            공고 등록으로
          </Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="notice warn">
        {view.notice}
      </div>
      <NewPostingForm hasResume={hasResume} siteNotes={siteNotes} initial={view.prefill} />
    </>
  );
}
