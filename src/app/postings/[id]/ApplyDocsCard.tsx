"use client";

import { useState } from "react";
import { RetryButton } from "./RetryButton";
import { applyDocUrl } from "@/lib/tailored/apply-docs-url";
import type { ApplyDocs } from "@/lib/tailored/view";

/**
 * 맞춤 이력서 탭 맨 위 "지원 서류" 카드(화면 문서 3.4): 키트의 프로필 PDF를 그대로 받는다.
 * 프로필을 고르면 받을 파일이 바뀐다. 파일은 저장하지 않고 받을 때마다 만든다.
 */
/** 사용자가 눌렀을 때만 "공고에 맞춰 고치기" 상자를 펼치고 그 자리로 간다 */
function openFixBox() {
  const box = document.querySelector<HTMLDetailsElement>('[data-testid="fix-box"]');
  if (!box) return;
  box.open = true;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ApplyDocsCard({ postingId, docs, canReanalyze }: { postingId: number; docs: ApplyDocs; canReanalyze: boolean }) {
  const [profileId, setProfileId] = useState(docs.initialProfileId);
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
              <button type="button" className="tl-tailor-link" data-testid="tailor-rec-open" onClick={openFixBox}>
                공고에 맞춰 고치기 ↓
              </button>
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
    </div>
  );
}
