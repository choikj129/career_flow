"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { APPLICATION_STATUSES, SITE_IDS, SITE_LABELS, STATUS_LABELS } from "@/lib/domain/types";
import { dashboardHref, PERIODS, type DashboardParams, type Period } from "@/lib/search/dashboard-params";

const PERIOD_LABELS: Record<Period, string> = {
  all: "기간: 전체",
  month: "이번 달",
  "3m": "최근 3개월",
  "1y": "최근 1년",
  custom: "직접 지정",
};

/** 검색창과 상태·사이트·기간 필터. 값은 바로 주소에 반영한다(서버 컴포넌트가 다시 조회). */
export function DashboardFilters({ params }: { params: DashboardParams }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(params.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // 뒤로 가기 등으로 주소의 검색어가 바뀌면 입력칸도 맞춘다(입력 중에는 건드리지 않는다).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setQ(params.q);
  }, [params.q]);

  const go = (patch: Partial<DashboardParams>) => {
    startTransition(() => router.replace(dashboardHref({ ...params, ...patch })));
  };

  return (
    <>
      <div className="search-row">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            placeholder="회사나 포지션으로 찾기"
            aria-label="회사·포지션 검색"
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => go({ q: v }), 200);
            }}
          />
        </label>
        <select
          className="select"
          aria-label="상태"
          value={params.status ?? ""}
          onChange={(e) => go({ status: (e.target.value || undefined) as DashboardParams["status"] })}
        >
          <option value="">상태: 전체</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="사이트"
          value={params.site ?? ""}
          onChange={(e) => go({ site: (e.target.value || undefined) as DashboardParams["site"] })}
        >
          <option value="">사이트: 전체</option>
          {SITE_IDS.map((s) => (
            <option key={s} value={s}>
              {SITE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="기간"
          value={params.period}
          onChange={(e) => go({ period: e.target.value as Period, from: undefined, to: undefined })}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
        {params.period === "custom" && (
          <div className="period-custom">
            <input
              type="date"
              className="in-sm"
              aria-label="시작일"
              value={params.from ?? ""}
              onChange={(e) => go({ from: e.target.value || undefined })}
            />
            <span className="muted">~</span>
            <input
              type="date"
              className="in-sm"
              aria-label="종료일"
              value={params.to ?? ""}
              onChange={(e) => go({ to: e.target.value || undefined })}
            />
          </div>
        )}
      </div>
      {(params.status === "document_passed" || params.status === "interview" || params.status === "final_passed") && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          이 단계를 거친 기록을 모두 보여 줍니다(지금 상태와 관계없이)
        </p>
      )}
    </>
  );
}
