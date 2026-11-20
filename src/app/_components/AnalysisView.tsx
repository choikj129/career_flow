import type { AnalysisResult } from "@/lib/ai/tasks/schemas";

const CATEGORY_LABELS: Record<AnalysisResult["fit"]["breakdown"][number]["category"], string> = {
  requirements: "필수 요건",
  preferred: "우대 사항",
  experience_years: "경력 연차",
  tech_stack: "기술 스택",
  domain: "도메인",
  preferences: "희망 조건",
};

function MiniList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="mini-h">{title}</div>
      <ul className="mini-list">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * 분석 결과 본문(점수·항목별·잘 맞는 점·부족한 점·희망 조건·조언)과 오른쪽 공고 요약.
 * 하단 분석 기록·[다시 분석]은 호출하는 쪽이 `aside`로 넘긴다.
 */
export function AnalysisView({
  result,
  basis,
  staleNote,
  aside,
  tailoredHref,
}: {
  result: AnalysisResult;
  /** 예: "기본 이력서 v3 기준 · 11월 16일 14:02 분석" */
  basis: string;
  /** 기본 이력서가 더 새 버전일 때의 안내 */
  staleNote?: string;
  aside?: React.ReactNode;
  /** 맞춤 이력서 탭 주소. 있으면 프로필 추천 줄에서 링크한다 */
  tailoredHref?: string;
}) {
  const p = result.posting;
  const hidden = result.gaps.filter((g) => g.kind === "hidden");
  const missing = result.gaps.filter((g) => g.kind === "missing");
  return (
    <div className="two">
      <div>
        <div className="card score-card">
          <div className="score-top">
            <div className="score">
              {result.fit.score}
              <small> / 100</small>
            </div>
            <div className="score-basis">{basis}</div>
          </div>
          {result.profileRecommendation && result.profileRecommendation.profiles.length > 0 && (
            <p className="analysis-note" style={{ fontSize: 13.5, margin: "8px 0 0" }} data-testid="profile-rec-line">
              추천 프로필 <b>{result.profileRecommendation.profiles[0].id}</b> 정합성 {result.profileRecommendation.profiles[0].fitPercent}%
              {result.profileRecommendation.profiles[1] ? ` · 다음 ${result.profileRecommendation.profiles[1].id} ${result.profileRecommendation.profiles[1].fitPercent}%` : ""}
              {tailoredHref ? (
                <>
                  {" "}
                  <a href={tailoredHref}>→ 맞춤 이력서 탭</a>
                </>
              ) : null}
            </p>
          )}
          {staleNote ? <p className="analysis-note" style={{ color: "var(--mark)", fontSize: 13.5 }}>{staleNote}</p> : null}
          <div className="breakdown">
            {result.fit.breakdown.map((b) => (
              <div className="bd" key={b.category}>
                <span>{CATEGORY_LABELS[b.category]}</span>
                <span className="bar">
                  <i style={{ "--v": `${b.score}%` } as React.CSSProperties} />
                </span>
                <b>{b.score}</b>
                <span>{b.reason}</span>
              </div>
            ))}
          </div>
        </div>

        {result.strengths.length > 0 && (
          <div className="sec">
            <h2>잘 맞는 점</h2>
            <ul className="points">
              {result.strengths.map((s, i) => (
                <li className="good" key={i}>
                  {s.point}
                  <span className="ev">{s.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(hidden.length > 0 || missing.length > 0) && (
          <div className="sec gap-cols">
            <div>
              <h3>
                이력서에서 보완 가능 <span className="pill h">맞춤 이력서로</span>
              </h3>
              {hidden.length === 0 ? (
                <p className="muted small">없음</p>
              ) : (
                <ul className="points">
                  {hidden.map((g, i) => (
                    <li className="hidden" key={i}>
                      {g.point}
                      <span className="ev">{g.suggestion}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>
                실제로 부족 <span className="pill x">면접 대비</span>
              </h3>
              {missing.length === 0 ? (
                <p className="muted small">없음</p>
              ) : (
                <ul className="points">
                  {missing.map((g, i) => (
                    <li className="missing" key={i}>
                      {g.point}
                      <span className="ev">{g.suggestion}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {result.preferenceMismatches.length > 0 && (
          <div className="sec">
            <h2>희망 조건과 다른 점</h2>
            {result.preferenceMismatches.map((m, i) => (
              <p key={i} style={{ margin: "0 0 4px" }}>
                {m}
              </p>
            ))}
          </div>
        )}

        {result.tailoringAdvice && (
          <div className="advice">
            <span>
              <b>맞춤 이력서 조언.</b> {result.tailoringAdvice}
            </span>
          </div>
        )}
      </div>

      <aside className="side">
        <div className="card">
          <h3>공고 요약</h3>
          <dl className="kv">
            <dt>경력</dt>
            <dd>{p.experienceRequirement ?? <span className="muted">정보 없음</span>}</dd>
            <dt>고용</dt>
            <dd>{p.employmentType ?? <span className="muted">정보 없음</span>}</dd>
            <dt>근무지</dt>
            <dd>{p.location ?? <span className="muted">정보 없음</span>}</dd>
            <dt>연봉</dt>
            <dd>{p.salary ?? <span className="muted">정보 없음</span>}</dd>
            <dt>마감</dt>
            <dd>{p.deadline ?? "상시"}</dd>
          </dl>
          <MiniList title="주요 업무" items={p.responsibilities} />
          <MiniList title="필수 요건" items={p.requirements} />
          <MiniList title="우대 사항" items={p.preferred} />
          {p.techStack.length > 0 && (
            <>
              <div className="mini-h">기술 스택</div>
              <div className="chips">
                {p.techStack.map((t, i) => (
                  <span className="chip" key={i}>
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        {aside}
      </aside>
    </div>
  );
}
