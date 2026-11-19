import type { PeriodBucket } from "@/lib/stats/aggregate";
import { niceMax, ticks } from "@/lib/stats/chart-scale";
import { formatPercent } from "@/lib/stats/rates";
import { STAT_COLORS as C } from "./colors";

const W = 900;
const H = 240;
const PAD = { l: 40, r: 8, t: 22, b: 44 };

function xLabel(b: PeriodBucket, i: number, unit: "month" | "year"): string {
  if (unit === "year") return b.key;
  return i === 0 || b.key.endsWith("-01") ? `${b.key.slice(2, 4)}-${b.key.slice(5)}` : b.key.slice(5);
}

/** 세로 누적 막대(아래부터 서류 통과·불합격·무응답·대기). 막대 위에 서류 통과율. 클라이언트 JS 없음(D-20). */
export function StackedBarChart({
  buckets,
  mode,
  unit,
}: {
  buckets: PeriodBucket[];
  mode: "count" | "ratio";
  unit: "month" | "year";
}) {
  const n = buckets.length;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const max = mode === "ratio" ? 1 : niceMax(Math.max(0, ...buckets.map((b) => b.tally.total)));
  const slot = n > 0 ? plotW / n : plotW;
  const bw = Math.max(4, Math.min(32, slot * 0.7));
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const labelEvery = n > 36 ? 3 : n > 18 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="기간별 지원과 결과" style={{ display: "block" }}>
      {(mode === "ratio" ? [0, 0.25, 0.5, 0.75, 1] : ticks(max)).map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#E4E7EC" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#5B6475">
            {mode === "ratio" ? `${Math.round(t * 100)}%` : Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const t = b.tally;
        const x = PAD.l + slot * i + (slot - bw) / 2;
        const denom = mode === "ratio" ? Math.max(t.total, 1) : 1;
        const segs = [
          { v: t.passed, fill: C.passed, dashed: false },
          { v: t.rejected, fill: C.rejected, dashed: false },
          { v: t.noResponse, fill: C.noResponse, dashed: false },
          { v: t.pending, fill: "#FFFFFF", dashed: true },
        ];
        let acc = 0;
        const rects = segs.map((s, k) => {
          const v = s.v / denom;
          const top = y(acc + v);
          const h = y(acc) - top;
          acc += v;
          if (s.v === 0) return null;
          return (
            <rect
              key={k}
              x={x}
              y={top}
              width={bw}
              height={Math.max(h, 0.5)}
              fill={s.fill}
              stroke={s.dashed ? C.pendingStroke : "none"}
              strokeDasharray={s.dashed ? "3 2" : undefined}
              strokeWidth={s.dashed ? 1 : 0}
            />
          );
        });
        const showRate = t.passRate != null && (t.sampleLevel === "low" || t.sampleLevel === "ok");
        const label = xLabel(b, i, unit);
        return (
          <g key={b.key} data-testid={`bar-${b.key}`}>
            <title>
              {`${b.key} · 통과 ${t.passed} · 불합격 ${t.rejected} · 무응답 ${t.noResponse} · 대기 ${t.pending}${t.withdrawn ? ` · 지원취소 ${t.withdrawn}` : ""}`}
            </title>
            <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={plotH} fill="transparent" />
            {rects}
            {t.total > 0 && (
              <text
                x={x + bw / 2}
                y={y(mode === "ratio" ? 1 : t.total) - 4}
                textAnchor="middle"
                fontSize={10}
                fill={showRate && t.sampleLevel === "ok" ? C.rate : C.rateLow}
              >
                {showRate ? formatPercent(t.passRate!) : "–"}
              </text>
            )}
            {(i % labelEvery === 0 || i === n - 1) && (
              <text x={x + bw / 2} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="#5B6475">
                {label}
              </text>
            )}
            {b.partial && (
              <text x={x + bw / 2} y={H - PAD.b + 26} textAnchor="middle" fontSize={9} fill="#5B6475">
                (진행 중)
              </text>
            )}
          </g>
        );
      })}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="#98A0AE" strokeWidth={1} />
    </svg>
  );
}
