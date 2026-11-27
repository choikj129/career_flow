"use client";

import Link from "next/link";
import { useState } from "react";
import { DateInput } from "./DateInput";
import {
  defaultSubmitted,
  docToSelect,
  encodeResumeChoice,
} from "@/lib/applications/submitted";
import type { ChoiceOption, SubmittedFormData } from "@/lib/applications/submitted-options";

type Field = "resume" | "career" | "portfolio" | "baseDate";
export type SubmittedValues = { resume: string; career: string; portfolio: string; baseDate: string };

/**
 * 제출 서류 선택 상태. 직접 고르지 않은 칸은 지원일에 맞춰 기본값을 다시 고른다(화면 문서 3.7).
 * 지원 완료 창(mode "apply")은 기본값에서 시작하고, 수정 창(mode "edit")은 지금 기록 값에서 시작해 직접 고르기 전에는 지원일이 바뀌어도 그대로 둔다.
 * 기본값은 렌더링 때 계산해(상태로 복사하지 않는다) 지원일이 바뀌면 바로 따라간다.
 */
export function useSubmittedValues(data: SubmittedFormData | null, appliedAt: string, mode: "apply" | "edit") {
  const [picked, setPicked] = useState<Partial<SubmittedValues>>({});

  let current: SubmittedValues | null = null;
  if (data) {
    if (mode === "edit" && data.current) {
      current = {
        resume: encodeResumeChoice(data.current.resume),
        career: docToSelect(data.current.career),
        portfolio: docToSelect(data.current.portfolio),
        baseDate: data.sessionBaseDate ?? "",
      };
    } else {
      const d = defaultSubmitted({ appliedAt, files: data.files, latestRevisionId: data.latestRevisionId, kit: data.kit });
      current = { resume: encodeResumeChoice(d.resume), career: docToSelect(d.career), portfolio: docToSelect(d.portfolio), baseDate: data.sessionBaseDate ?? "" };
    }
  }
  const value: SubmittedValues | null = current ? { ...current, ...picked } : null;
  // 선택지에 없는 값(예: 지원일이 바뀌어 없어진 파일, 새 기록에서 뺀 모름)은 모름으로 두고, 모름도 없으면 첫 선택지로 둔다
  const fix = (v: string, options: { value: string }[], fallback: string) =>
    options.some((o) => o.value === v) ? v : options.some((o) => o.value === fallback) ? fallback : (options[0]?.value ?? fallback);
  const safe =
    value && data
      ? {
          resume: fix(value.resume, data.resumeOptions, "unknown"),
          career: fix(value.career, data.careerOptions, ""),
          portfolio: fix(value.portfolio, data.portfolioOptions, ""),
          baseDate: value.baseDate,
        }
      : null;
  const set = (field: Field, v: string) => setPicked((p) => ({ ...p, [field]: v }));
  const reset = () => setPicked({});
  return { value: safe, set, reset, touched: Object.keys(picked).length > 0 };
}

/** 이력서·경력기술서·포트폴리오 select 세 줄. 창의 `.row`(왼쪽 라벨) 모양을 따른다 */
export function DocSelects({
  data,
  value,
  onChange,
  idPrefix,
}: {
  data: SubmittedFormData;
  value: SubmittedValues;
  onChange: (field: Field, v: string) => void;
  idPrefix: string;
}) {
  type SelectField = "resume" | "career" | "portfolio";
  const rows: { field: SelectField; label: string; options: ChoiceOption[] }[] = [
    { field: "resume", label: "이력서", options: data.resumeOptions },
    { field: "career", label: "경력기술서", options: data.careerOptions },
    { field: "portfolio", label: "포트폴리오", options: data.portfolioOptions },
  ];
  // 고른 선택지의 전체 이름(짧은 글과 다를 때만)을 select 아래에 줄바꿈해서 보인다
  const full = Object.fromEntries(rows.map((r) => [r.field, r.options.find((o) => o.value === value[r.field])?.full ?? ""])) as Record<SelectField, string>;
  return (
    <div data-testid="doc-selects">
      {rows.map((r) => (
        <div className="row" key={r.field}>
          <label htmlFor={`${idPrefix}-${r.field}`}>{r.label}</label>
          <select
            id={`${idPrefix}-${r.field}`}
            value={value[r.field]}
            onChange={(e) => onChange(r.field, e.target.value)}
            style={{ minWidth: 0, maxWidth: "100%" }}
            title={full[r.field] || undefined}
          >
            {r.options.map((o) => (
              <option key={o.value} value={o.value} title={o.full ?? o.label}>
                {o.label}
              </option>
            ))}
          </select>
          {full[r.field] ? (
            <span className="muted small" style={{ gridColumn: 2, overflowWrap: "anywhere" }} data-testid={`doc-full-${r.field}`}>
              {full[r.field]}
            </span>
          ) : null}
          {r.field === "resume" && value.resume.startsWith("sess:") ? (
            <>
              <label htmlFor={`${idPrefix}-baseDate`} style={{ marginTop: 4 }}>바탕 이력서</label>
              <span style={{ display: "flex", gap: "6px 10px", alignItems: "center", flexWrap: "wrap", minWidth: 0 }} data-testid="resume-base-date">
                <DateInput id={`${idPrefix}-baseDate`} required value={value.baseDate} onChange={(e) => onChange("baseDate", e.target.value)} style={{ width: 150 }} />
                <span className="muted small">이력서 세션이 바탕으로 쓴 이력서의 날짜</span>
              </span>
            </>
          ) : null}
        </div>
      ))}
      {data.noFiles ? (
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          서류 파일이 없어 이력서는 &lsquo;모름&rsquo;입니다 → <Link href="/resume?tab=docs">서류 파일</Link>
        </p>
      ) : null}
    </div>
  );
}
