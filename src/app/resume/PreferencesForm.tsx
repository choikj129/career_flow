"use client";

import { useState } from "react";
import { savePreferencesAction } from "@/app/_actions/resume";
import { useAction } from "@/app/_components/useAction";
import type { Preferences } from "@/lib/resume/schema";

const WORK_STYLES: { id: Preferences["workStyle"]; label: string }[] = [
  { id: "any", label: "상관없음" },
  { id: "remote", label: "원격" },
  { id: "hybrid", label: "하이브리드" },
  { id: "office", label: "출근" },
];
const SIZES = ["스타트업", "중견", "대기업"];

function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setText("");
  };
  return (
    <div className="tagin">
      {values.map((v) => (
        <span className="chip" key={v}>
          {v}
          <button type="button" aria-label={`${v} 삭제`} onClick={() => onChange(values.filter((x) => x !== v))}>
            ✕
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        value={text}
        placeholder="입력 후 Enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // 한글 조합 중 Enter는 무시한다.
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

function num(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 희망 조건. 모두 선택 입력이고 이력서 버전과 따로 저장한다. docs/spec/screens.md 5.4 */
export function PreferencesForm({ initial }: { initial: Preferences }) {
  const [p, setP] = useState<Preferences>(initial);
  const [min, setMin] = useState(initial.salaryMinManwon?.toString() ?? "");
  const [max, setMax] = useState(initial.salaryMaxManwon?.toString() ?? "");
  const { pending, error, run } = useAction();
  const sizes = Array.from(new Set([...SIZES, ...p.companySizes]));

  return (
    <div className="card form-card prefs" style={{ maxWidth: 820 }}>
      <p className="muted small" style={{ margin: "0 0 6px" }}>
        모두 선택 입력입니다. 비워 두면 분석에서 &quot;희망 조건&quot; 항목이 빠집니다.
      </p>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>희망 연봉</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="in" style={{ width: 120 }} inputMode="numeric" aria-label="최소 연봉(만원)" value={min} onChange={(e) => setMin(e.target.value)} />
          ~
          <input className="in" style={{ width: 120 }} inputMode="numeric" aria-label="최대 연봉(만원)" value={max} onChange={(e) => setMax(e.target.value)} />
          만원
        </div>
      </div>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>근무 지역</span>
        <TagInput label="근무 지역" values={p.locations} onChange={(locations) => setP({ ...p, locations })} />
      </div>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>근무 방식</span>
        <div className="opts">
          {WORK_STYLES.map((w) => (
            <label key={w.id}>
              <input type="radio" name="workStyle" checked={p.workStyle === w.id} onChange={() => setP({ ...p, workStyle: w.id })} />
              {w.label}
            </label>
          ))}
        </div>
      </div>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>회사 규모</span>
        <div className="opts">
          {sizes.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={p.companySizes.includes(s)}
                onChange={(e) =>
                  setP({
                    ...p,
                    companySizes: e.target.checked ? [...p.companySizes, s] : p.companySizes.filter((x) => x !== s),
                  })
                }
              />
              {s}
            </label>
          ))}
        </div>
      </div>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>선호 산업</span>
        <TagInput label="선호 산업" values={p.preferredIndustries} onChange={(preferredIndustries) => setP({ ...p, preferredIndustries })} />
      </div>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>기피 산업</span>
        <TagInput label="기피 산업" values={p.avoidIndustries} onChange={(avoidIndustries) => setP({ ...p, avoidIndustries })} />
      </div>
      <div className="row2">
        <span className="fl" style={{ margin: 0 }}>기타 메모</span>
        <textarea
          className="in"
          aria-label="기타 메모"
          value={p.notes ?? ""}
          placeholder="예: 주 4일 근무면 연봉 조건 완화 가능"
          onChange={(e) => setP({ ...p, notes: e.target.value || undefined })}
        />
      </div>
      {error ? <p className="field-err">{error}</p> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={() => run(() => savePreferencesAction({ ...p, salaryMinManwon: num(min), salaryMaxManwon: num(max) }))}
        >
          희망 조건 저장
        </button>
      </div>
    </div>
  );
}
