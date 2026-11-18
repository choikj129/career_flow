/** 적합도 숫자 + 막대. 분석이 없으면 "–" */
export function Fit({ score }: { score: number | null }) {
  if (score == null) return <span className="faint">–</span>;
  return (
    <span className="fit">
      <i style={{ "--v": `${score}%` } as React.CSSProperties} />
      {score}
    </span>
  );
}
