"use client";

import { useState } from "react";
import { checkLoginAction } from "@/app/_actions/settings";
import { formatDateTime } from "@/lib/domain/dates";

type Last = { at: string; loggedIn: boolean } | null;

/** 설치 상태와 [로그인 확인] 버튼. 버튼을 눌러야만 짧은 호출을 한다. */
export function ClaudeStatus({
  installed,
  version,
  message,
  last,
}: {
  installed: boolean;
  version?: string;
  message: string;
  last: Last;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ loggedIn: boolean | null; message: string; at: string } | null>(
    last ? { loggedIn: last.loggedIn, message: last.loggedIn ? "로그인되어 있습니다." : "로그인이 필요합니다. 터미널에서 `claude`를 실행해 로그인하세요.", at: last.at } : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setPending(true);
    setError(null);
    const r = await checkLoginAction();
    setPending(false);
    if (!r.ok) setError(r.error);
    else setResult({ loggedIn: r.loggedIn, message: r.message, at: r.checkedAt });
  }

  return (
    <>
      <div className="toolbar">
        <span className="status-line">
          {installed ? <span className="ok-dot" /> : <span className="ok-dot" style={{ background: "var(--mark)" }} />}
          {installed ? `설치됨${version ? `, 버전 ${version}` : ""}.` : message}
          {installed && result && (
            <span className={result.loggedIn === false ? "field-err" : undefined} style={{ margin: 0 }}>
              {" "}
              {result.message} ({formatDateTime(result.at)} 확인)
            </span>
          )}
        </span>
        <button type="button" className="btn sm" disabled={!installed || pending} onClick={check}>
          {pending ? "확인하는 중…" : "로그인 확인"}
        </button>
      </div>
      {error ? <p className="field-err">{error}</p> : null}
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        확인할 때 짧은 요청을 한 번 보내므로 사용량이 조금 듭니다. 로그인이 안 되어 있으면 터미널에서 <code>claude</code>를 실행해 로그인하세요.
      </p>
    </>
  );
}
