import type { Tally } from "@/lib/stats/rates";
import { RateText } from "../_components/RateText";
import { STAT_COLORS as C } from "./colors";

export type HBarRow = {
  key: string;
  label: string;
  sub?: string;
  total: number;
  passed: number;
  /** 막대 색(없으면 하늘 + 연회색). 사이트별은 사이트 색 */
  color?: string;
  tally: Tally;
};

/** 가로 막대: 길이 = 지원 수(최대값 기준), 통과 부분은 진하게. 오른쪽에 비율 문구. */
export function HBarChart({ rows }: { rows: HBarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div>
      {rows.map((r) => {
        const len = (r.total / max) * 100;
        const pass = r.total > 0 ? (r.passed / r.total) * len : 0;
        const dark = r.color ?? C.passed;
        const light = r.color ? `color-mix(in srgb, ${r.color} 25%, white)` : C.noResponse;
        return (
          <div
            key={r.key}
            data-testid={`hbar-${r.key}`}
            style={{ display: "grid", gridTemplateColumns: "150px 1fr 190px", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 13 }}
          >
            <span>
              {r.label}
              {r.sub && <span className="muted small" style={{ display: "block" }}>{r.sub}</span>}
            </span>
            <svg viewBox="0 0 100 14" preserveAspectRatio="none" width="100%" height="14" role="img" aria-label={`${r.label} 지원 ${r.total}건, 통과 ${r.passed}건`}>
              <title>{`${r.label} · 지원 ${r.total} · 통과 ${r.passed}`}</title>
              <rect x={0} y={0} width={100} height={14} fill="#F1F3F6" />
              {len > 0 && <rect x={0} y={0} width={len} height={14} style={{ fill: light }} />}
              {pass > 0 && <rect x={0} y={0} width={Math.max(pass, 0.8)} height={14} style={{ fill: dark }} />}
            </svg>
            <span style={{ textAlign: "right" }}>
              <RateText passed={r.tally.passed} sample={r.tally.sample} rate={r.tally.passRate} level={r.tally.sampleLevel} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
