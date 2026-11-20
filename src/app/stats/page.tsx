import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SITE_LABELS } from "@/lib/domain/types";
import { DOC_KINDS, DOC_KIND_LABELS } from "@/lib/documents/files";
import { getStats } from "@/lib/stats/load";
import { parseStatsParams, statsHref, toStatsQuery, type StatsParams } from "@/lib/stats/params";
import { formatPercent } from "@/lib/stats/rates";
import { RateText } from "../_components/RateText";
import { FunnelChart } from "./FunnelChart";
import { ColumnChart } from "./ColumnChart";
import { HBarChart } from "./HBarChart";
import { StackedBarChart } from "./StackedBarChart";
import { StatsFilters } from "./StatsFilters";
import { StatsTable } from "./StatsTable";
import { SummaryCards } from "./SummaryCards";
import { TailoredEffect } from "./TailoredEffect";

export default function StatsPage(props: PageProps<"/stats">) {
  return (
    <main className="page">
      <Suspense fallback={<div className="muted">불러오는 중…</div>}>
        <StatsLoader searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Seg({ items }: { items: { label: string; href: string; on: boolean }[] }) {
  return (
    <span className="seg" role="group">
      {items.map((i) => (
        <Link key={i.label} href={i.href} replace scroll={false} aria-current={i.on ? "true" : undefined} className={i.on ? "on" : undefined}>
          {i.label}
        </Link>
      ))}
    </span>
  );
}

const rate = (t: { passed: number; sample: number; passRate: number | null; sampleLevel: "none" | "few" | "low" | "ok" }) => (
  <RateText passed={t.passed} sample={t.sample} rate={t.passRate} level={t.sampleLevel} />
);

async function StatsLoader({ searchParams }: { searchParams: PageProps<"/stats">["searchParams"] }) {
  await connection();
  const params = parseStatsParams(await searchParams);
  const now = new Date();
  const data = getStats({ query: toStatsQuery(params, now), unit: params.unit, doc: params.doc }, now);

  if (data.isEmptyAll) {
    return (
      <>
        <div className="title-row">
          <h1>통계</h1>
        </div>
        <div className="card empty-hint" style={{ marginTop: 20, padding: 40, textAlign: "center" }}>
          <h3>아직 지원 기록이 없습니다.</h3>
          <p className="muted">지원 기록이 쌓이면 여기에 통계가 보입니다.</p>
          <Link className="btn primary" href="/postings/new">
            공고 등록
          </Link>
          <p className="small" style={{ marginTop: 12 }}>
            이미 지원한 내역이 있다면 → <Link href="/import">가져오기</Link>
          </p>
        </div>
      </>
    );
  }

  const href = (patch: Partial<StatsParams>) => statsHref({ ...params, ...patch });
  const s = data.summary;
  const siteFiltered = params.site != null;

  return (
    <>
      <div className="title-row">
        <h1>통계</h1>
        <StatsFilters params={params} />
      </div>
      <p className="muted small" style={{ margin: "6px 0 12px" }}>
        지원 후 30일이 지나도 &apos;지원&apos; 상태인 기록은 <b>무응답</b>으로 셉니다. 기간은 지원일 기준입니다.
      </p>

      {s.total === 0 ? (
        <div className="card empty-hint" style={{ padding: 40, textAlign: "center" }}>
          <h3>이 기간·사이트에 지원 기록이 없습니다.</h3>
          <Link className="btn" href="/stats">
            필터 지우기
          </Link>
        </div>
      ) : (
        <>
          <SummaryCards s={s} firstMonth={data.firstMonth} lastMonth={data.lastMonth} />
          {s.passed === 0 && (
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              서류합격·면접 연락을 받았다면 대시보드에서 상태를 바꿔 주세요. 통계가 정확해집니다.
            </p>
          )}

          <TailoredEffect compare={data.tailoredCompare} profiles={data.byProfile} />

          <section className="card stat-panel" data-testid="stats-periods">
            <div className="stat-head">
              <h2>기간별 지원과 결과</h2>
              <span className="stat-toggles">
                <Seg
                  items={[
                    { label: "월별", href: href({ unit: "month" }), on: params.unit === "month" },
                    { label: "연별", href: href({ unit: "year" }), on: params.unit === "year" },
                  ]}
                />
                <Seg
                  items={[
                    { label: "개수", href: href({ mode: "count" }), on: params.mode === "count" },
                    { label: "비율", href: href({ mode: "ratio" }), on: params.mode === "ratio" },
                  ]}
                />
              </span>
            </div>
            <StackedBarChart buckets={data.periods} mode={params.mode} unit={params.unit} />
            <div className="stat-legend">
              <span><i className="sw" style={{ background: "#0369A1" }} />서류 통과</span>
              <span><i className="sw" style={{ background: "#F4A9A8" }} />불합격</span>
              <span><i className="sw" style={{ background: "#D5D9E1" }} />무응답</span>
              <span><i className="sw" style={{ background: "#fff", border: "1px dashed #5B6475" }} />대기</span>
              <span>막대 위 숫자 = 서류 통과율 (분모 5 미만이면 –)</span>
            </div>
            <details>
              <summary>표로 보기</summary>
              <StatsTable
                testId="stats-periods-table"
                head={[params.unit === "month" ? "월" : "연", "지원", "통과", "불합격", "무응답", "대기", "취소", "서류 통과율", "판정 기준"]}
                rows={data.periods.map((b) => ({
                  key: b.key,
                  cells: [
                    b.partial ? `${b.label} (진행 중)` : b.label,
                    b.tally.total,
                    b.tally.passed,
                    b.tally.rejected,
                    b.tally.noResponse,
                    b.tally.pending,
                    b.tally.withdrawn,
                    rate(b.tally),
                    <RateText key="d" passed={b.tally.passed} sample={b.tally.passed + b.tally.rejected} rate={b.tally.decidedRate} level={b.tally.decidedLevel} />,
                  ],
                }))}
              />
            </details>
          </section>

          <section className="card stat-panel" data-testid="stats-docs">
            <div className="stat-head">
              <h2>서류 버전별</h2>
              <Seg
                items={DOC_KINDS.map((k) => ({ label: DOC_KIND_LABELS[k], href: href({ doc: k }), on: params.doc === k }))}
              />
            </div>
            {data.docs.length === 1 && data.docs[0].unknown && params.doc !== "resume" && (
              <p className="muted small" style={{ margin: "0 0 6px" }}>이 종류의 제출 서류 기록이 없습니다</p>
            )}
            <HBarChart
              rows={data.docs.map((d) => ({
                key: d.key,
                label: d.label,
                sub: d.key === "tailored"
                  ? "공고마다 맞춘 이력서"
                  : d.absent
                  ? "내지 않은 지원"
                  : d.unknown
                    ? params.doc === "resume"
                      ? "버전 파일보다 앞선 지원"
                      : "제출 서류 기록 없음"
                    : undefined,
                total: d.tally.total,
                passed: d.tally.passed,
                tally: d.tally,
              }))}
            />
            <StatsTable
              head={["버전", "지원", "통과", "불합격", "무응답", "대기", "쓴 기간", "서류 통과율"]}
              rows={data.docs.map((d) => ({
                key: d.key,
                cells: [
                  d.label,
                  d.tally.total,
                  d.tally.passed,
                  d.tally.rejected,
                  d.tally.noResponse,
                  d.tally.pending,
                  d.firstApplied ? `${d.firstApplied.slice(5)} ~ ${d.lastApplied?.slice(5)}` : "–",
                  rate(d.tally),
                ],
              }))}
            />
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              버전마다 쓴 기간과 사이트가 다릅니다. 기간·사이트 필터로 조건을 맞춰 비교하세요.
            </p>
          </section>

          <section className="card stat-panel" data-testid="stats-sites">
            <div className="stat-head">
              <h2>사이트별</h2>
              {siteFiltered && <span className="st-badge">사이트 필터 적용 중</span>}
            </div>
            <HBarChart
              rows={data.sites.map((x) => ({
                key: x.site,
                label: SITE_LABELS[x.site],
                total: x.tally.total,
                passed: x.tally.passed,
                color: `var(--site-${x.site})`,
                tally: x.tally,
              }))}
            />
            <StatsTable
              head={["사이트", "지원", "통과", "불합격", "무응답", "대기", "서류 통과율", "무응답 비율"]}
              rows={data.sites.map((x) => ({
                key: x.site,
                cells: [
                  SITE_LABELS[x.site],
                  x.tally.total,
                  x.tally.passed,
                  x.tally.rejected,
                  x.tally.noResponse,
                  x.tally.pending,
                  rate(x.tally),
                  x.tally.noResponseRate != null && x.tally.sampleLevel !== "few" ? formatPercent(x.tally.noResponseRate) : "–",
                ],
              }))}
            />
          </section>

          <div className="stat-grid2">
            <section className="card stat-panel" data-testid="stats-funnel">
              <div className="stat-head">
                <h2>단계별 흐름</h2>
              </div>
              <FunnelChart steps={data.funnel} />
              <p className="muted small" style={{ margin: "8px 0 0" }}>
                과제·코딩테스트와 면접의 %는 둘 다 서류 통과 대비입니다. 과제 없이 면접으로 가는 기록이 있어 면접 수가 과제 수보다 클 수 있습니다.
              </p>
            </section>

            <section className="card stat-panel" data-testid="stats-weekdays">
              <div className="stat-head">
                <h2>요일별</h2>
              </div>
              <ColumnChart cols={data.weekdays.map((w) => ({ label: w.label, total: w.tally.total, passed: w.tally.passed, tally: w.tally }))} />
              <StatsTable
                head={["요일", "지원", "통과", "서류 통과율"]}
                rows={data.weekdays.map((w) => ({ key: String(w.weekday), cells: [w.label, w.tally.total, w.tally.passed, rate(w.tally)] }))}
              />
            </section>
          </div>

          <details className="stat-terms">
            <summary>용어 설명</summary>
            <ul>
              <li><b>서류 통과</b>: 서류합격을 거친 기록(지금 상태 또는 이력에 서류합격·과제·코딩테스트·면접·최종합격). 지금 상태가 지원이면 통과가 아닙니다.</li>
              <li><b>불합격</b>: 지금 상태가 불합격. <b>지원취소</b>: 지금 상태가 지원취소(서류 통과 뒤 취소는 통과로 셉니다).</li>
              <li><b>대기</b>: 지원 상태이고 지원 후 30일 안 됨. <b>무응답</b>: 지원 상태이고 지원 후 30일 이상.</li>
              <li><b>서류 통과율</b> = 통과 ÷ (통과 + 불합격 + 무응답). <b>판정 기준 통과율</b> = 통과 ÷ (통과 + 불합격). <b>무응답 비율</b> = 무응답 ÷ (통과 + 불합격 + 무응답).</li>
              <li><b>표본 표시</b>: 분모 0 “–”, 1~4 “표본 부족”, 5~19 “표본 적음”, 20 이상 비율 그대로.</li>
            </ul>
          </details>
        </>
      )}
    </>
  );
}
