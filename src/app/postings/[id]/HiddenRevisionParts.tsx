import type { RevisionView } from "@/lib/tailored/view";
import { RevisionDiff } from "./TailoredControls";

// 앱의 맞춤본 결과 화면 조각(경고·바뀐 곳·자동 검사). 2026-11-24부터 맞춤 이력서 탭에서 쓰지 않는다(화면에서만 숨김, 작업 기록 session-request).
// 코드는 지우지 않고 남겨 둔다.

const DOC_LABEL = { resume: "이력서", career: "경력기술서" } as const;

export function Warnings({ r }: { r: RevisionView }) {
  if (r.confirm.length === 0 && r.notices.length === 0 && !r.notes) return null;
  const facts = r.notices.filter((n) => n.kind === "new_fact_from_master").length;
  const restored = r.notices.some((n) => n.kind === "intro_restored");
  return (
    <>
      {r.confirm.length > 0 && (
        <div className="notice warn" style={{ marginTop: 0 }} data-testid="confirm-warnings" role="alert">
          <b>⚠ 확인 필요 {r.confirm.length}건</b>
          <ul>
            {r.confirm.map((w, i) => (
              <li key={i}>
                {DOC_LABEL[w.doc]}: {w.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.notices.length > 0 && (
        <details className="card tl-box" data-testid="notices" style={{ padding: "10px 16px" }}>
          <summary>
            ⓘ {[facts > 0 ? `새로 넣은 사실 ${facts}건(마스터스토리에 있음)` : null, restored ? "자기소개를 조립본 값으로 되돌림" : null].filter(Boolean).join(" · ")} [자세히 ▾]
          </summary>
          <ul className="plain">
            {r.notices.map((w, i) => (
              <li key={i}>
                {DOC_LABEL[w.doc]}: {w.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.notes && (
        <p className="muted small" style={{ margin: 0 }} data-testid="ai-notes">
          AI 메모: {r.notes}
        </p>
      )}
    </>
  );
}

export function ChangesBody({ r }: { r: RevisionView }) {
  return (
    <>
      <div className="muted small">레시피 (r1 조립)</div>
      {r.applied.length > 0 ? (
        <ul className="plain">
          {r.applied.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          {r.source === "external" ? "작업 공간에서 만든 결과입니다. 앱이 적용한 레시피는 없습니다." : "적용 내역을 읽을 수 없습니다."}
        </p>
      )}
      {r.source !== "recipe" && r.source !== "external" && (
        <div style={{ marginTop: 14 }}>
          <div className="muted small">{r.source === "terms" ? "공고 용어 (조립본 대비)" : "다듬기 (조립본 대비)"}</div>
          <RevisionDiff
            docs={[
              { doc: "resume", label: "이력서", before: r.stage1ResumeMd, after: r.resumeMd },
              { doc: "career", label: "경력기술서", before: r.stage1CareerMd, after: r.careerMd },
            ]}
          />
          {r.changeReasons.length > 0 && (
            <ul className="plain" data-testid="change-reasons">
              {r.changeReasons.map((c, i) => (
                <li key={i}>
                  <span className="muted small">{DOC_LABEL[c.doc]}</span> {c.after}
                  <div className="muted small">이유: {c.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

export function AutoChecks({ r }: { r: RevisionView }) {
  if (!r.checks) {
    return <p className="muted small" style={{ margin: 0 }}>자동 검사는 용어 맞추기·다듬기·작업 공간 결과에 적용됩니다. 조립본은 기본 서류의 부품을 옮긴 것입니다.</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="auto-checks">
      {r.checks.map((c) => (
        <li key={c.label}>
          {c.count === 0 ? <span style={{ color: "var(--good)" }}>✔</span> : <span style={{ color: "var(--mark)" }}>⚠</span>} {c.label}
          {c.count > 0 ? ` ${c.count}건` : ""}
        </li>
      ))}
    </ul>
  );
}

