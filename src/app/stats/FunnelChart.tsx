import type { FunnelStep } from "@/lib/stats/aggregate";
import { formatPercent } from "@/lib/stats/rates";
import { STAT_COLORS as C } from "./colors";

const LABELS: Record<FunnelStep["stage"], string> = {
  applied: "지원",
  document_passed: "서류 통과",
  assignment: "과제·코딩테스트",
  interview: "면접",
  final_passed: "최종합격",
};
const COLORS: Record<FunnelStep["stage"], string> = {
  applied: C.applied,
  document_passed: C.passed,
  assignment: C.assignment,
  interview: C.interview,
  final_passed: C.final,
};

/** 단계별 흐름(S5): 거친 수와 앞 단계 대비 %. 과제·코딩테스트는 들여 쓰고 보조 글자를 단다. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, steps[0]?.count ?? 1);
  return (
    <div>
      {steps.map((s) => (
        <div
          key={s.stage}
          data-testid={`funnel-${s.stage}`}
          style={{ display: "grid", gridTemplateColumns: "190px 1fr 130px", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 13, paddingLeft: s.optional ? 18 : 0 }}
        >
          <span>
            {LABELS[s.stage]}
            {s.optional && (
              <span className="muted small" style={{ display: "inline-block", whiteSpace: "nowrap", marginLeft: 4 }}>
                (거치지 않을 수 있음)
              </span>
            )}
          </span>
          <svg viewBox="0 0 100 14" preserveAspectRatio="none" width="100%" height="14" role="img" aria-label={`${LABELS[s.stage]} ${s.count}건`}>
            <title>{`${LABELS[s.stage]} · ${s.count}`}</title>
            <rect x={0} y={0} width={100} height={14} fill="#F1F3F6" />
            {s.count > 0 && <rect x={0} y={0} width={Math.max((s.count / max) * 100, 0.8)} height={14} fill={COLORS[s.stage]} />}
          </svg>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {s.count}
            {s.ofPrev != null && <span className="muted"> ({formatPercent(s.ofPrev)})</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
