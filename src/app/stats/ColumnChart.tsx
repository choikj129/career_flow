import { niceMax } from "@/lib/stats/chart-scale";
import type { Tally } from "@/lib/stats/rates";
import { STAT_COLORS as C } from "./colors";

/** 세로 막대(지원 수, 통과 부분 진하게). 요일별에 쓴다. */
export function ColumnChart({ cols }: { cols: { label: string; total: number; passed: number; tally: Tally }[] }) {
  const W = 420;
  const H = 170;
  const padB = 24;
  const padT = 18;
  const max = niceMax(Math.max(0, ...cols.map((c) => c.total)));
  const slot = W / Math.max(cols.length, 1);
  const bw = Math.min(34, slot * 0.6);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="요일별 지원" style={{ display: "block" }}>
      {cols.map((c, i) => {
        const x = slot * i + (slot - bw) / 2;
        return (
          <g key={c.label}>
            <title>{`${c.label} · 지원 ${c.total} · 통과 ${c.passed}`}</title>
            <rect x={x} y={y(c.total)} width={bw} height={Math.max(y(0) - y(c.total), c.total > 0 ? 0.5 : 0)} fill={C.noResponse} />
            {c.passed > 0 && <rect x={x} y={y(c.passed)} width={bw} height={Math.max(y(0) - y(c.passed), 0.5)} fill={C.passed} />}
            <text x={x + bw / 2} y={y(c.total) - 4} textAnchor="middle" fontSize={10} fill="#5B6475">
              {c.total}
            </text>
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#5B6475">
              {c.label}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#98A0AE" strokeWidth={1} />
    </svg>
  );
}
