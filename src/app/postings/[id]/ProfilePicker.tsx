"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRecipeAction } from "@/app/_actions/tailored";
import { useAction } from "@/app/_components/useAction";
import type { Picker } from "@/lib/tailored/view";
import { RetryButton } from "./RetryButton";

export type RecipeChoice = { track: string; profileId: string; adjustmentIds: string[] };

/**
 * 프로필 고르기(화면 문서 3.4): 직무, 프로필(추천도 순), 추가 조정. [맞춤본 만들기]는 AI 없이 바로 조립한다.
 * initial이 있으면(프로필 바꾸기) 그 값이 선택된 채로 열린다.
 */
export function ProfilePicker({
  postingId,
  picker,
  initial,
  hasText,
  analyzing,
  onDone,
}: {
  postingId: number;
  picker: Picker;
  initial?: RecipeChoice;
  hasText: boolean;
  analyzing: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const [track, setTrack] = useState(initial?.track ?? picker.track);
  // 직접 고른 값만 담는다. 고르지 않은 직무는 추천값(추천 프로필, 추천 추가 조정)을 쓴다
  const [profileByTrack, setProfileByTrack] = useState<Record<string, string>>(initial ? { [initial.track]: initial.profileId } : {});
  const [adjByTrack, setAdjByTrack] = useState<Record<string, string[]>>(initial ? { [initial.track]: initial.adjustmentIds } : {});

  const t = picker.byTrack[track] ?? picker.byTrack[picker.tracks[0]];
  const profileId = profileByTrack[track] ?? t.profiles.find((p) => p.recommended)?.id ?? t.profiles[0]?.id ?? "";
  const adjustmentIds = adjByTrack[track] ?? t.adjustments.filter((a) => a.suggested).map((a) => a.id);
  const toggleAdj = (id: string) =>
    setAdjByTrack((m) => ({ ...m, [track]: adjustmentIds.includes(id) ? adjustmentIds.filter((x) => x !== id) : [...adjustmentIds, id] }));

  return (
    <div data-testid="profile-picker">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <b data-testid="picker-basis">{picker.basisLabel}</b>
        {picker.basis === "words" && (
          <RetryButton postingId={postingId} label="AI 추천 받기 (다시 분석)" small disabled={analyzing || !hasText} />
        )}
      </div>
      {analyzing && <p className="muted small" style={{ margin: "6px 0 0" }}>분석이 끝나면 AI 추천이 보입니다. 그동안 단어 수 기준으로 골라 만들 수 있습니다.</p>}

      {picker.tracks.length > 1 && (
        <div className="tl-row" style={{ marginTop: 12 }} role="radiogroup" aria-label="직무">
          <span className="muted small">직무</span>
          <div className="opts">
            {picker.tracks.map((name) => (
              <label key={name}>
                <input type="radio" name="tl-track" checked={track === name} onChange={() => setTrack(name)} /> {name}
              </label>
            ))}
          </div>
          {track === picker.track && picker.trackReason ? <span className="muted small">{picker.trackReason}</span> : null}
        </div>
      )}

      <div style={{ marginTop: 10 }} role="radiogroup" aria-label="프로필">
        <div className="muted small">프로필 ({picker.basis === "words" ? "일치 단어 순" : "추천도 순"})</div>
        {t.profiles.map((p) => (
          <label key={p.id} className="pick" data-testid={`pick-${p.id}`}>
            <input type="radio" name="tl-profile" checked={profileId === p.id} onChange={() => setProfileByTrack((m) => ({ ...m, [track]: p.id }))} />
            <span>
              <b>{p.id}</b> {p.name}
              {p.recommended ? <span className="tag-rec">추천</span> : null}
            </span>
            <span className="pct">
              {p.percent != null ? (
                <>
                  <b className="nw">{p.percent}%</b>
                  <span className="pct-bar"><i style={{ "--v": `${p.percent}%` } as React.CSSProperties} /></span>
                </>
              ) : (
                <span className="muted small">일치 단어 {p.words.reduce((n, w) => n + w.count, 0)}개</span>
              )}
            </span>
            {(p.keywords.length > 0 || p.reason) && (
              <span className="why">
                {p.keywords.length > 0 ? p.keywords.join(" · ") : "–"}
                {p.reason ? ` — ${p.reason}` : ""}
              </span>
            )}
          </label>
        ))}
      </div>

      {t.adjustments.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted small">추가 조정</div>
          {t.adjustments.map((a) => (
            <label key={a.id} style={{ display: "flex", gap: 8, padding: "4px 0", alignItems: "flex-start" }}>
              <input type="checkbox" checked={adjustmentIds.includes(a.id)} onChange={() => toggleAdj(a.id)} />
              <span>
                {a.label}
                {a.suggested ? <span className="tag-rec">추천{a.keywords.length > 0 ? ` · ${a.keywords.join(", ")}` : ""}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}

      {error ? <p className="field-err">{error}</p> : null}
      <div className="tl-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn primary"
          disabled={pending || !hasText || !profileId}
          onClick={() =>
            run(
              () => createRecipeAction({ postingId, track, profileId, adjustmentIds }),
              () => {
                router.replace(`/postings/${postingId}?tab=tailored`);
                onDone?.();
              },
            )
          }
        >
          맞춤본 만들기
        </button>
        <span className="muted small">{hasText ? "보통 1초. AI를 쓰지 않습니다." : "공고 본문을 읽은 뒤 만들 수 있습니다"}</span>
      </div>
    </div>
  );
}
