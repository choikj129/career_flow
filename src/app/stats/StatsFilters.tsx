"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SITE_IDS, SITE_LABELS } from "@/lib/domain/types";
import { statsHref, type StatsParams } from "@/lib/stats/params";
import { DateInput } from "@/app/_components/DateInput";

const PERIOD_LABELS: Record<StatsParams["period"], string> = {
  all: "기간: 전체",
  "3m": "최근 3개월",
  "1y": "최근 1년",
  custom: "직접 지정",
};

/** 기간·사이트 선택. 값은 바로 주소에 반영한다(서버 컴포넌트가 다시 조회). */
export function StatsFilters({ params }: { params: StatsParams }) {
  const router = useRouter();
  const [, start] = useTransition();
  const go = (patch: Partial<StatsParams>) => start(() => router.replace(statsHref({ ...params, ...patch })));
  return (
    <div className="search-row" style={{ marginTop: 0 }}>
      <select
        className="select"
        aria-label="기간"
        value={params.period}
        onChange={(e) => go({ period: e.target.value as StatsParams["period"], from: undefined, to: undefined })}
      >
        {(Object.keys(PERIOD_LABELS) as StatsParams["period"][]).map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
      </select>
      <select
        className="select"
        aria-label="사이트"
        value={params.site ?? ""}
        onChange={(e) => go({ site: (e.target.value || undefined) as StatsParams["site"] })}
      >
        <option value="">사이트: 전체</option>
        {SITE_IDS.map((s) => (
          <option key={s} value={s}>
            {SITE_LABELS[s]}
          </option>
        ))}
      </select>
      {params.period === "custom" && (
        <div className="period-custom">
          <DateInput  className="in-sm" aria-label="시작일" value={params.from ?? ""} onChange={(e) => {
              if (!e.target.value && !params.from) return; // 입력 도중의 빈 값은 주소를 바꾸지 않는다
              go({ from: e.target.value || undefined });
            }} />
          <span className="muted">~</span>
          <DateInput  className="in-sm" aria-label="종료일" value={params.to ?? ""} onChange={(e) => {
              if (!e.target.value && !params.to) return;
              go({ to: e.target.value || undefined });
            }} />
        </div>
      )}
    </div>
  );
}
