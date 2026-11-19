import type { StatsData } from "@/lib/stats/load";
import { formatPercent } from "@/lib/stats/rates";

const showable = (level: string) => level === "low" || level === "ok";

/** S1 요약 카드 6개. docs/spec/screens.md 10.3 */
export function SummaryCards({ s, firstMonth, lastMonth }: { s: StatsData["summary"]; firstMonth: string | null; lastMonth: string | null }) {
  const decided = s.passed + s.rejected;
  const cards: { key: string; title: string; big: string; sub: string }[] = [
    { key: "total", title: "지원", big: String(s.total), sub: firstMonth && lastMonth ? `${firstMonth} ~ ${lastMonth}` : "" },
    {
      key: "passed",
      title: "서류 통과",
      big: String(s.passed),
      sub: `과제·코딩테스트 ${s.assignment} · 면접 ${s.interview} · 최종합격 ${s.final}`,
    },
    {
      key: "rate",
      title: "서류 통과율",
      big: showable(s.sampleLevel) && s.passRate != null ? formatPercent(s.passRate) : "–",
      sub: `${s.passed} / ${s.sample} · ${
        s.decidedLevel === "low" || s.decidedLevel === "ok"
          ? `판정 기준 ${formatPercent(s.decidedRate!)} (${s.passed}/${decided})`
          : "판정 기준: 표본 부족"
      }`,
    },
    {
      key: "noresp",
      title: "무응답 비율",
      big: showable(s.sampleLevel) && s.noResponseRate != null ? formatPercent(s.noResponseRate) : "–",
      sub: "지원 후 30일 넘게 '지원' 상태",
    },
    { key: "pending", title: "대기", big: String(s.pending), sub: "지원 후 30일 안 됨" },
    { key: "withdrawn", title: "지원취소", big: String(s.withdrawn), sub: "통과율 계산에서 뺌" },
  ];
  return (
    <div className="stat-cards">
      {cards.map((c) => (
        <div key={c.key} className="card stat-card" data-testid={`card-${c.key}`}>
          <div className="muted small">{c.title}</div>
          <div className="stat-big">{c.big}</div>
          <div className="muted small">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
