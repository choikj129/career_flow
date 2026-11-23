"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  handoffTextAction,
  rebuildWithNewKitAction,
  requestReviseAction,
  requestTermsMatchAction,
  retryTailorJobAction,
  uploadExternalAction,
} from "@/app/_actions/tailored";
import { Modal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";
import { lineDiff } from "@/lib/kit/line-diff";
import { REVISION_REQUEST_MAX } from "@/lib/tailored/limits";
import type { HandoffReason } from "@/lib/tailored/handoff";
import type { Picker } from "@/lib/tailored/view";
import { ProfilePicker, type RecipeChoice } from "./ProfilePicker";

/** 리비전 고르기. 고르면 주소 `?tab=tailored&rev=<id>`가 바뀐다 */
export function RevisionSelect({ postingId, selectedId, options }: { postingId: number; selectedId: number; options: { id: number; label: string }[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="리비전 선택"
      value={selectedId}
      onChange={(e) => router.replace(`/postings/${postingId}?tab=tailored&rev=${e.target.value}`, { scroll: false })}
      style={{ maxWidth: "100%" }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** [프로필 바꾸기]: 프로필 고르기 상자를 연다(지금 값이 선택된 채) */
export function ChangeProfile({ postingId, picker, initial, hasText, analyzing }: { postingId: number; picker: Picker; initial: RecipeChoice; hasText: boolean; analyzing: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        프로필 바꾸기
      </button>
      {open && (
        <div className="card tl-box" style={{ flexBasis: "100%" }}>
          <ProfilePicker postingId={postingId} picker={picker} initial={initial} hasText={hasText} analyzing={analyzing} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** [공고 용어 맞추기 (AI)]. 조립본이면 크게, 아니면 작게 */
export function TermsButton({ postingId, big, busy }: { postingId: number; big: boolean; busy: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <span>
      <button type="button" className={`btn ${big ? "primary" : "sm"}`} disabled={pending || busy} onClick={() => run(() => requestTermsMatchAction(postingId))}>
        공고 용어 맞추기 (AI)
      </button>
      {!big && <span className="muted small"> 조립본에서 다시 시작합니다(다듬기 결과는 이어지지 않습니다)</span>}
      {error ? <span className="field-err"> {error}</span> : null}
    </span>
  );
}

/** 다듬기 요청. 요청할 때마다 새 리비전이 생긴다 */
export function RefineForm({ postingId, busy }: { postingId: number; busy: boolean }) {
  const [text, setText] = useState("");
  const { pending, error, run } = useAction();
  const empty = text.trim() === "";
  return (
    <div className="card refine" style={{ marginTop: 0 }}>
      <b>다듬기</b>
      <span className="muted small"> 요청할 때마다 새 리비전이 생깁니다. 사실·숫자는 마스터스토리 안에서만 바뀝니다.</span>
      <form
        className="refine-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (empty || busy) return;
          run(() => requestReviseAction(postingId, text), () => setText(""));
        }}
      >
        <textarea
          aria-label="다듬기 요청"
          value={text}
          maxLength={REVISION_REQUEST_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={`예: "경력기술서 2장 첫 문단을 공고의 '정산' 용어로"`}
          disabled={busy}
        />
        <button type="submit" className="btn primary" disabled={empty || busy || pending}>
          수정 요청
        </button>
      </form>
      {error ? <p className="field-err">{error}</p> : null}
    </div>
  );
}

/** 새 키트로 같은 레시피를 다시 조립 */
export function RebuildButton({ postingId, revisionId }: { postingId: number; revisionId: number }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <span>
      <button
        type="button"
        className="btn sm"
        disabled={pending}
        onClick={() => run(() => rebuildWithNewKitAction({ postingId, revisionId }), () => router.replace(`/postings/${postingId}?tab=tailored`))}
      >
        새 키트로 다시 조립
      </button>
      {error ? <span className="field-err"> {error}</span> : null}
    </span>
  );
}

/** 실패한 용어 맞추기·다듬기를 같은 내용으로 다시 */
export function RetryTailorButton({ postingId }: { postingId: number }) {
  const { pending, error, run } = useAction();
  return (
    <span>
      <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => retryTailorJobAction(postingId))}>
        다시 시도
      </button>
      {error ? <span className="field-err"> {error}</span> : null}
    </span>
  );
}

/** 이력서·경력기술서 미리보기. PDF와 같은 HTML(키트 스타일)을 A4 비율 안에 보인다. 스크립트·외부 요청이 막힌 틀 안에서만 연다 */
export function PreviewPane({ revisionId }: { revisionId: number }) {
  const [doc, setDoc] = useState<"resume" | "career">("resume");
  const src = `/api/tailored/${revisionId}/${doc}?format=html&inline=1`;
  return (
    <div className="tl-side" data-testid="tailored-preview">
      <div className="tl-row" role="tablist" style={{ marginBottom: 8 }}>
        {(["resume", "career"] as const).map((d) => (
          <button key={d} type="button" role="tab" className="btn sm" aria-selected={doc === d} onClick={() => setDoc(d)} style={doc === d ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
            {d === "resume" ? "이력서" : "경력기술서"}
          </button>
        ))}
      </div>
      <div className="tl-preview">
        <iframe key={src} title="미리보기" src={src} sandbox="" />
      </div>
      <p style={{ margin: "8px 0 0" }}>
        <a href={src} target="_blank" rel="noopener">
          새 탭에서 크게 보기 ↗
        </a>
      </p>
    </div>
  );
}

const subscribeChecklist = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("cf-checklist", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("cf-checklist", cb);
  };
};
const readChecklist = (key: string) => () => {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

/** 가이드 체크리스트. 체크는 이 브라우저에만 남는다(저장소를 못 쓰면 이번 화면에서만) */
export function Checklist({ storageKey, items }: { storageKey: string; items: string[] }) {
  const stored = useSyncExternalStore(subscribeChecklist, readChecklist(storageKey), () => "");
  const checked = new Set(stored ? stored.split(",") : []);
  const toggle = (i: number) => {
    const next = new Set(checked);
    if (next.has(String(i))) next.delete(String(i));
    else next.add(String(i));
    try {
      window.localStorage.setItem(storageKey, [...next].join(","));
      window.dispatchEvent(new Event("cf-checklist"));
    } catch {
      /* 저장소를 쓸 수 없으면 기억하지 못한다 */
    }
  };
  return (
    <div className="checklist" data-testid="manual-checklist">
      {items.map((t, i) => (
        <label key={i}>
          <input type="checkbox" checked={checked.has(String(i))} onChange={() => toggle(i)} /> <span>{t}</span>
        </label>
      ))}
    </div>
  );
}

const MAX_DIFF_SHOWN = 400;

/** 조립본과 줄 단위 비교(문서별). 바뀐 줄만 보인다: 빠진 줄은 취소선, 새 줄은 강조 */
export function RevisionDiff({ docs }: { docs: { doc: "resume" | "career"; label: string; before: string; after: string }[] }) {
  const parts = docs.map((d) => ({ ...d, lines: lineDiff(d.before, d.after).filter((l) => l.op !== "same" && l.text.trim() !== "") }));
  if (parts.every((p) => p.lines.length === 0)) return <p className="muted small" style={{ margin: "4px 0 0" }}>조립본과 같습니다.</p>;
  return (
    <div data-testid="revision-diff">
      {parts
        .filter((p) => p.lines.length > 0)
        .map((p) => (
          <div key={p.doc} style={{ marginTop: 8 }}>
            <div className="muted small">{p.label}</div>
            {p.lines.slice(0, MAX_DIFF_SHOWN).map((l, i) => (
              <span key={i} className={`diff-line ${l.op}`}>
                {l.text}
              </span>
            ))}
            {p.lines.length > MAX_DIFF_SHOWN && <p className="muted small">바뀐 줄이 많아 앞의 {MAX_DIFF_SHOWN}줄만 보입니다. 전체는 미리보기나 md로 확인하세요.</p>}
          </div>
        ))}
    </div>
  );
}

const REASON_TEXT: Record<HandoffReason, string> = {
  low_fit: "추천도가 60% 미만",
  warnings: "확인 필요 경고가 남음",
  pending_adjustments: "남은 추가 조정이 있음",
  ai_suggested: "AI가 허용 범위 안에서는 맞추기 어렵다고 표시",
};

/** 이력서 작업 공간에 요청(D-30 a): 요청문 복사·받기, 결과 올리기. 앱은 작업 공간을 실행하지 않는다 */
export function HandoffPanel({
  postingId,
  revisionId,
  reasons,
  picker,
  recipe,
}: {
  postingId: number;
  revisionId: number;
  reasons: HandoffReason[];
  picker: Picker;
  recipe: RecipeChoice;
}) {
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { pending, error, setError } = useAction();
  const recommended = reasons.length > 0;

  const copy = async () => {
    setError(null);
    const r = await handoffTextAction(revisionId, note);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(r.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("복사하지 못했습니다. [요청문 받기]로 파일을 받아 쓰세요");
    }
  };

  const body = (
    <>
      <div className="tl-actions">
        <button type="button" className="btn sm" onClick={copy} disabled={pending}>
          요청문 복사
        </button>
        {copied ? <span role="status" className="small" style={{ color: "var(--good)" }}>복사됨</span> : null}
        <form method="post" action={`/api/tailored/${revisionId}/handoff`} style={{ display: "inline" }}>
          <input type="hidden" name="note" value={note} />
          <button type="submit" className="btn sm">
            요청문 받기 (.md)
          </button>
        </form>
        <span className="muted small">작업 공간(Claude Code)에 붙여 넣으세요.</span>
      </div>
      <label className="muted small" style={{ display: "block", marginTop: 8 }}>
        메모 (요청문에 들어갑니다, 선택)
        <textarea className="in-sm" style={{ width: "100%", marginTop: 4 }} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="tl-actions" style={{ marginTop: 8 }}>
        <span className="muted small">만든 뒤 →</span>
        <button type="button" className="btn sm" onClick={() => setUploading(true)}>
          결과 올리기
        </button>
        <span className="muted small">이력서.md · 경력기술서.md</span>
      </div>
      {error ? <p className="field-err">{error}</p> : null}
      {uploading && <UploadExternalModal postingId={postingId} picker={picker} recipe={recipe} onClose={() => setUploading(false)} />}
    </>
  );

  if (recommended) {
    return (
      <div className="notice info" data-testid="handoff-recommend" style={{ display: "block" }}>
        <div>ⓘ 이력서 작업 공간에 요청해 볼 만합니다: {reasons.map((r) => REASON_TEXT[r]).join(" · ")}</div>
        <div style={{ marginTop: 8 }}>{body}</div>
      </div>
    );
  }
  return (
    <details className="card menu-box" data-testid="handoff-menu">
      <summary>작업 공간에 요청 ▾</summary>
      <div style={{ marginTop: 10 }}>{body}</div>
    </details>
  );
}

function UploadExternalModal({ postingId, picker, recipe, onClose }: { postingId: number; picker: Picker; recipe: RecipeChoice; onClose: () => void }) {
  const [track, setTrack] = useState(recipe.track);
  const [profileByTrack, setProfileByTrack] = useState<Record<string, string>>({ [recipe.track]: recipe.profileId });
  const [adjByTrack, setAdjByTrack] = useState<Record<string, string[]>>({ [recipe.track]: recipe.adjustmentIds });
  const { pending, error, run } = useAction();
  const t = picker.byTrack[track];
  const profileId = profileByTrack[track] ?? t.profiles.find((p) => p.recommended)?.id ?? t.profiles[0]?.id ?? "";
  const adjustmentIds = adjByTrack[track] ?? [];
  return (
    <Modal title="작업 공간 결과 올리기" description="작업 공간에서 만든 이력서.md와 경력기술서.md를 올립니다(각 1MB까지). 자기소개는 되돌리지 않고 달라졌으면 경고만 합니다." onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("postingId", String(postingId));
          fd.set("track", track);
          fd.set("profileId", profileId);
          fd.delete("adjustmentIds");
          for (const a of adjustmentIds) fd.append("adjustmentIds", a);
          run(() => uploadExternalAction(fd), onClose);
        }}
      >
        <div className="row">
          <label htmlFor="ext-resume">이력서.md</label>
          <input id="ext-resume" name="resumeFile" type="file" accept=".md,text/markdown,text/plain" required />
        </div>
        <div className="row">
          <label htmlFor="ext-career">경력기술서.md</label>
          <input id="ext-career" name="careerFile" type="file" accept=".md,text/markdown,text/plain" required />
        </div>
        {picker.tracks.length > 1 && (
          <div className="row">
            <label htmlFor="ext-track">직무</label>
            <select id="ext-track" value={track} onChange={(e) => setTrack(e.target.value)}>
              {picker.tracks.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="row">
          <label htmlFor="ext-profile">프로필</label>
          <select id="ext-profile" value={profileId} onChange={(e) => setProfileByTrack((m) => ({ ...m, [track]: e.target.value }))}>
            {t.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} {p.name}
              </option>
            ))}
          </select>
        </div>
        {t.adjustments.length > 0 && (
          <div className="row stack">
            <span className="muted small">추가 조정</span>
            {t.adjustments.map((a) => (
              <label key={a.id} style={{ display: "flex", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={adjustmentIds.includes(a.id)}
                  onChange={() => setAdjByTrack((m) => ({ ...m, [track]: adjustmentIds.includes(a.id) ? adjustmentIds.filter((x) => x !== a.id) : [...adjustmentIds, a.id] }))}
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
        )}
        <div className="row stack">
          <label htmlFor="ext-note">메모 (선택)</label>
          <textarea id="ext-note" name="note" className="in-sm" maxLength={2000} />
        </div>
        {error ? <p className="err">{error}</p> : null}
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={pending}>
            올리기
          </button>
        </footer>
      </form>
    </Modal>
  );
}
