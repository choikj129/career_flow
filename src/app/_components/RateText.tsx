import { formatPercent, type SampleLevel } from "@/lib/stats/rates";

/**
 * 비율 문구 + 표본 표시(대시보드·통계 공용). docs/spec/screens.md 10.1
 * 분모 0 → "–"(결과 없음), 1~4 → "표본 부족 (n=3)", 5~19 → "12.5% (1/8)" + 표본 적음, 20 이상 → "1.9% (9/469)"
 */
export function RateText({
  passed,
  sample,
  rate,
  level,
  compact,
}: {
  passed: number;
  sample: number;
  rate: number | null;
  level: SampleLevel;
  compact?: boolean;
}) {
  if (level === "none" || rate == null) {
    return (
      <span>
        –<span className="muted small"> {compact ? "결과 대기" : "결과 없음"}</span>
      </span>
    );
  }
  if (level === "few") return <span className="muted">표본 부족 (n={sample})</span>;
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatPercent(rate)} ({passed}/{sample})
      {level === "low" && <span className="st-badge">표본 적음</span>}
    </span>
  );
}
