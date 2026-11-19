"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registerPostingAction, type RegisterState } from "@/app/_actions/postings";
import { detectSite } from "@/lib/domain/normalize";

/** 공고 등록 폼. 링크 또는 본문 중 하나는 필요하다. docs/spec/screens.md 2장 */
export function NewPostingForm({ hasResume, siteNotes }: { hasResume: boolean; siteNotes: string[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerPostingAction, null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");

  const trimmedUrl = url.trim();
  // 4개 사이트가 아닌 주소이거나, 링크 없이 본문만 넣으면 출처 이름 칸을 보인다.
  const showNote = trimmedUrl ? detectSite(trimmedUrl) === "other" : text.trim() !== "";
  const empty = !trimmedUrl && !text.trim();

  return (
    <form action={action} className="card" style={{ marginTop: 20, padding: 32 }}>
      <label className="label" htmlFor="url">
        공고 링크
      </label>
      <input
        className="field-input"
        id="url"
        name="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.wanted.co.kr/wd/12345"
        autoComplete="off"
      />
      <p className="hint">
        리멤버, 원티드, 그룹바이, 잡코리아는 주소로 사이트를 알아봅니다. 그 밖의 주소는 &quot;기타&quot;로 등록합니다.
      </p>
      <p className="hint">일부 사이트는 자동으로 읽지 못해 본문 붙여넣기가 필요할 수 있습니다.</p>
      <p className="hint">일부 사이트는 자동으로 읽지 못해 본문 붙여넣기가 필요할 수 있습니다.</p>

      {showNote && (
        <div style={{ marginTop: 18 }}>
          <label className="label" htmlFor="siteNote">
            출처 이름 <span className="muted" style={{ fontWeight: 400 }}>(선택)</span>
          </label>
          <input
            className="field-input"
            id="siteNote"
            name="siteNote"
            list="site-notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 회사 채용 페이지, 지인 추천"
          />
          <datalist id="site-notes">
            {siteNotes.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )}

      <details>
        <summary>링크로 안 열리면 공고 본문 붙여넣기</summary>
        <textarea
          className="field-area"
          name="pastedText"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="공고 페이지에서 본문을 복사해 붙여넣으세요. 링크 없이 본문만 넣어도 됩니다(최대 5만 자)."
        />
      </details>

      {!hasResume && (
        <div className="notice warn">
          기본 이력서가 없어 분석이 실패합니다. 먼저 등록하세요 → <Link href="/resume">기본 이력서 등록</Link>
        </div>
      )}
      {state?.error ? <p className="field-err">{state.error}</p> : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
        <button type="submit" className="btn primary" disabled={empty || pending}>
          {pending ? "등록하는 중…" : "등록하고 분석"}
        </button>
      </div>
    </form>
  );
}
