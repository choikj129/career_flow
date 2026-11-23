import type { ProfileRow, TailoredCompare } from "@/lib/stats/aggregate";
import type { Tally } from "@/lib/stats/rates";
import { RateText } from "../_components/RateText";
import { HBarChart } from "./HBarChart";
import { StatsTable } from "./StatsTable";

const rate = (t: Tally) => <RateText passed={t.passed} sample={t.sample} rate={t.passRate} level={t.sampleLevel} />;
const counts = (t: Tally) => [t.total, t.passed, t.rejected, t.noResponse, t.pending];

/**
 * "맞춤 이력서 효과"(D-24)와 "프로필별"(D-29). 요약 카드 바로 아래 전체 폭 카드.
 * 맞춤 효과는 맞춤본을 처음 낸 날부터의 지원만 비교하고, 프로필별은 기간 제한 없이(필터만 적용) 센다.
 */
export function TailoredEffect({ compare, profiles }: { compare: TailoredCompare | null; profiles: ProfileRow[] }) {
  return (
    <section className="card stat-panel" data-testid="stats-tailored">
      <div className="stat-head">
        <h2>맞춤 이력서 효과</h2>
      </div>
      {compare ? (
        <>
          <HBarChart
            rows={[
              { key: "effect-tailored", label: "맞춤 이력서", total: compare.tailored.total, passed: compare.tailored.passed, tally: compare.tailored },
              { key: "effect-plain", label: "맞춤 안 함", total: compare.plain.total, passed: compare.plain.passed, tally: compare.plain },
            ]}
          />
          <StatsTable
            testId="stats-tailored-table"
            head={["구분", "지원", "통과", "불합격", "무응답", "대기", "서류 통과율"]}
            rows={[
              { key: "tailored", cells: ["맞춤 이력서", ...counts(compare.tailored), rate(compare.tailored)] },
              { key: "plain", cells: ["맞춤 안 함", ...counts(compare.plain), rate(compare.plain)] },
            ]}
          />
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            {compare.since}(맞춤본을 처음 낸 날)부터의 지원만 비교합니다. 지원 후 30일이 안 된 지원은 대기로 빠지므로, 처음 몇 주는 표본이 적습니다.
          </p>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }} data-testid="stats-tailored-empty">
          아직 맞춤 이력서로 낸 지원이 없습니다. 지원 완료 때 제출 서류의 이력서를 &apos;맞춤 이력서&apos;로 고르면 여기서 비교됩니다.
        </p>
      )}

      <h3 style={{ fontSize: 15, margin: "20px 0 0" }}>프로필별</h3>
      {profiles.length > 0 ? (
        <StatsTable
          testId="stats-profiles-table"
          head={["프로필", "지원", "통과", "불합격", "무응답", "대기", "서류 통과율", "그중 맞춤"]}
          rows={profiles.map((p) => ({
            key: p.id,
            cells: [`${p.id} ${p.name}`, ...counts(p.all), rate(p.all), p.tailored.total],
          }))}
        />
      ) : (
        <p className="muted small" style={{ margin: "6px 0 0" }} data-testid="stats-profiles-empty">
          프로필이 기록된 지원이 없습니다.
        </p>
      )}
    </section>
  );
}
