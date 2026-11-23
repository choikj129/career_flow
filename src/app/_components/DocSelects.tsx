"use client";

import Link from "next/link";
import { useState } from "react";
import {
  defaultSubmitted,
  docToSelect,
  encodeResumeChoice,
} from "@/lib/applications/submitted";
import type { SubmittedFormData } from "@/lib/applications/submitted-options";

type Field = "resume" | "career" | "portfolio";
export type SubmittedValues = { resume: string; career: string; portfolio: string };

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
      };
    } else {
      const d = defaultSubmitted({ appliedAt, files: data.files, latestRevisionId: data.latestRevisionId, kit: data.kit });
      current = { resume: encodeResumeChoice(d.resume), career: docToSelect(d.career), portfolio: docToSelect(d.portfolio) };
    }
  }
  const value: SubmittedValues | null = current ? { ...current, ...picked } : null;
  // 선택지에 없는 값(예: 지원일이 바뀌어 없어진 파일)은 모름으로 둔다
  const fix = (v: string, options: { value: string }[], fallback: string) => (options.some((o) => o.value === v) ? v : fallback);
  const safe =
    value && data
      ? {
          resume: fix(value.resume, data.resumeOptions, "unknown"),
          career: fix(value.career, data.careerOptions, ""),
          portfolio: fix(value.portfolio, data.portfolioOptions, ""),
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
  const rows: { field: Field; label: string; options: { value: string; label: string }[] }[] = [
    { field: "resume", label: "이력서", options: data.resumeOptions },
    { field: "career", label: "경력기술서", options: data.careerOptions },
    { field: "portfolio", label: "포트폴리오", options: data.portfolioOptions },
  ];
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
          >
            {r.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
