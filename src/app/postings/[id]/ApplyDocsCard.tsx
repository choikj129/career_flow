"use client";

import { useEffect, useRef, useState } from "react";
import { sessionRequestTextAction } from "@/app/_actions/tailored";
import { RetryButton } from "./RetryButton";
import { markSessionRequestCopied } from "@/lib/applications/folder-notice";
import { applyDocUrl } from "@/lib/tailored/apply-docs-url";
import type { ApplyDocs } from "@/lib/tailored/view";

/**
 * 맞춤 이력서 탭 맨 위 "지원 서류" 카드(화면 문서 3.4): 키트의 프로필 PDF를 그대로 받는다.
 * 프로필을 고르면 받을 파일이 바뀐다. 파일은 저장하지 않고 받을 때마다 만든다.
 */
export function ApplyDocsCard({ postingId, docs, hasText, analyzing }: { postingId: number; docs: ApplyDocs; hasText: boolean; analyzing: boolean }) {
  const canReanalyze = hasText && !analyzing;
  const [profileId, setProfileId] = useState(docs.initialProfileId);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (fallbackText != null) area.current?.select();
  }, [fallbackText]);

  /** [이력서 세션 요청 복사]: 서버가 만든 요청문을 클립보드에 넣는다. 못 넣으면 읽기 전용 칸으로 대신한다 */
  async function copyRequest() {
    setCopying(true);
    setCopied(false);
    setReqError(null);
    setFallbackText(null);
    try {
      const r = await sessionRequestTextAction(postingId, profileId);
      if (!r.ok) {
        setReqError(r.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(r.text);
        setCopied(true);
        markSessionRequestCopied(postingId);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        setReqError("복사하지 못했습니다. 아래 글을 직접 복사하세요.");
        setFallbackText(r.text);
      }
    } catch {
      setReqError("요청문을 만들 수 없습니다");
    } finally {
      setCopying(false);
    }
  }
  const all = docs.groups.flatMap((g) => g.profiles.map((p) => ({ ...p, track: g.track })));
  const cur = all.find((p) => p.id === profileId);
  const url = (doc: "resume" | "career", opts?: { format?: "html"; inline?: boolean }) =>
    applyDocUrl({ kitId: docs.kitId, profileId, doc, postingId }, opts);

  return (
    <div className="card tl-box" data-testid="apply-docs">
      <h3>지원 서류</h3>
      <div className="tl-head">
        <select
          aria-label="프로필"
          data-testid="apply-profile"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        >
          {docs.groups.map((g) => (
            <optgroup key={g.track} label={g.track}>
              {g.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.id} ${p.name}${p.percent != null ? ` ${p.percent}%` : ""}${p.recommended ? " (추천)" : ""}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {cur && (
          <span className="tl-text" data-testid="apply-line">
            <b>{cur.id} {cur.name}</b>
            {cur.percent != null && <> <span className="nw">{cur.percent}%</span></>}
            {cur.recommended && <span className="tag-rec">추천</span>}
            {" · "}{cur.track} · 키트 {docs.kitId}
          </span>
        )}
      </div>
      {docs.tailorRec && (
        <p
          className={`tl-tailor${docs.tailorRec.high ? " high" : ""}`}
          data-testid="tailor-rec-line"
          title={docs.tailorRec.reason}
        >
          <span className="tl-tailor-head">
            맞춤 이력서 {docs.tailorRec.percent}%
            {docs.tailorRec.high && <span className="tag-rec" data-testid="tailor-rec-tag">권함</span>}
            {" · "}
          </span>
          {docs.tailorRec.high ? (
            <>
              <span className="tl-tailor-reason" data-testid="tailor-rec-reason">{docs.tailorRec.reason}</span>
            </>
          ) : (
            <span className="tl-tailor-reason">1순위 프로필 서류 그대로 충분</span>
          )}
        </p>
      )}
      {docs.tailorRecMissing && (
        <p className="tl-tailor tl-tailor-old" data-testid="tailor-rec-missing">
          <span className="tl-tailor-head">맞춤 이력서 추천도는 다시 분석하면 나옵니다</span>
          <RetryButton postingId={postingId} label="다시 분석" small disabled={!canReanalyze} />
        </p>
      )}
      <div className="tl-actions" style={{ marginTop: 12 }}>
        <a className="btn primary" data-testid="apply-resume" href={url("resume")}>이력서 PDF</a>
        <a className="btn primary" data-testid="apply-career" href={url("career")}>경력기술서 PDF</a>
        <details className="menu-pop">
          <summary>미리보기 ▾</summary>
          <div>
            <a href={url("resume", { format: "html", inline: true })} target="_blank" rel="noopener">이력서 미리보기</a>
            <a href={url("career", { format: "html", inline: true })} target="_blank" rel="noopener">경력기술서 미리보기</a>
          </div>
        </details>
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        키트의 기본 서류를 이 프로필 순서로 조립한 것입니다. 받을 때마다 만들며 저장하지 않습니다.
      </p>
      <div className="session-request" data-testid="session-request">
        <p style={{ margin: 0 }}>공고에 맞춘 이력서는 이력서 세션에서 만듭니다.</p>
        <div className="tl-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn sm" data-testid="session-request-copy" disabled={!hasText || copying} onClick={copyRequest}>
            이력서 세션 요청 복사
          </button>
          {copied && <span role="status" className="muted small" data-testid="session-request-copied">복사됨</span>}
        </div>
        {!hasText ? (
          <p className="muted small" style={{ margin: "6px 0 0" }} data-testid="session-request-notext">
            공고 본문이 없어 요청문을 만들 수 없습니다. 공고 원문 탭에서 본문을 넣으세요.
          </p>
        ) : (
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {analyzing && <><span data-testid="session-request-analyzing">분석 중입니다. 끝난 뒤 복사하면 추천·강점이 들어갑니다.</span>{" "}</>}
            위에서 고른 프로필과 공고 분석 내용이 들어갑니다. 연락처는 넣지 않습니다.
          </p>
        )}
        {reqError && <p className="field-err" role="alert" data-testid="session-request-error">{reqError}</p>}
        {fallbackText != null && (
          <textarea ref={area} readOnly rows={8} className="session-request-text" aria-label="이력서 세션 요청문" data-testid="session-request-text" value={fallbackText} />
        )}
      </div>
    </div>
  );
}
