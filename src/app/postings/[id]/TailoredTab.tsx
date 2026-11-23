import Link from "next/link";
import { JobFailureCard } from "@/app/_components/JobFailureCard";
import { JobStatus } from "@/app/_components/JobStatus";
import { REVISION_REQUEST_MAX } from "@/lib/tailored/limits";
import type { RevisionSummary } from "@/lib/tailored/repo";
import { loadTailorView, type RevisionView } from "@/lib/tailored/view";
import { ProfilePicker } from "./ProfilePicker";
import {
  Checklist,
  ChangeProfile,
  HandoffPanel,
  PreviewPane,
  RebuildButton,
  RefineForm,
  RetryTailorButton,
  RevisionDiff,
  RevisionSelect,
  TermsButton,
} from "./TailoredControls";

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SOURCE_LABEL = { recipe: "조립", terms: "공고 용어 맞춤", external: "작업 공간" } as const;

function revisionLabel(r: Pick<RevisionSummary, "revNo" | "source" | "createdAt" | "userRequest">): string {
  const what =
    r.source === "revise"
      ? `"${(r.userRequest ?? "").length > 30 ? `${(r.userRequest ?? "").slice(0, 30)}…` : (r.userRequest ?? "")}"`
      : SOURCE_LABEL[r.source];
  return `r${r.revNo} · ${stamp(r.createdAt)} · ${what}`;
}

const DOC_LABEL = { resume: "이력서", career: "경력기술서" } as const;

/** 맞춤 이력서 탭(화면 문서 3.4). 서버에서 읽고, 버튼·입력은 클라이언트 조각이 맡는다 */
export function TailoredTab({ postingId, rev }: { postingId: number; rev: number | null }) {
  const v = loadTailorView(postingId, rev);

  if (v.state === "no_kit") {
    return (
      <div className="card tl-box" data-testid="tailored-no-kit">
        <h3>서류 키트가 없습니다</h3>
        <p style={{ margin: "0 0 12px" }}>맞춤 이력서는 서류 키트(가이드·기본 서류·마스터스토리)로 만듭니다. 먼저 키트를 올리세요.</p>
        <Link className="btn primary" href="/resume?tab=kit">
          서류 키트로 →
        </Link>
      </div>
    );
  }
  if (v.state === "kit_errors") {
    return (
      <div className="card tl-box" data-testid="tailored-kit-errors">
        <h3>서류 키트에 오류가 있습니다</h3>
        <p style={{ margin: "0 0 12px" }}>서류 키트에 오류가 있어 만들 수 없습니다(오류 {v.errorCount}건).</p>
        <Link className="btn primary" href="/resume?tab=kit">
          서류 키트로 →
        </Link>
      </div>
    );
  }

  const { selected } = v;
  const busy = v.tailorJob != null;
  const analyzing = v.analysisJob != null;
  const recipe = selected ? { track: selected.track, profileId: selected.profileId, adjustmentIds: selected.adjustments.map((a) => a.id) } : null;

  return (
    <div className="tl" data-testid="tailored-tab">
      {v.staleKitNote && <div className="notice info" style={{ marginTop: 0 }}><span>{v.staleKitNote}</span></div>}

      {v.tailorJob && <JobStatus jobId={v.tailorJob.id} type={v.tailorJob.type} initial={v.tailorJob} />}
      {v.failed && (
        <JobFailureCard title={v.failed.type === "tailor_resume" ? "공고 용어 맞추기에 실패했습니다" : "다듬기에 실패했습니다"} job={v.failed} type={v.failed.type}>
          <RetryTailorButton postingId={postingId} />
        </JobFailureCard>
      )}

      {!selected || !recipe ? (
        <div className="card tl-box" data-testid="tailored-empty">
          {analyzing && v.analysisJob && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ margin: "0 0 8px" }}>분석이 끝나면 AI 추천이 보입니다.</p>
              <JobStatus jobId={v.analysisJob.id} type="analyze_posting" initial={v.analysisJob} />
            </div>
          )}
          <ProfilePicker postingId={postingId} picker={v.picker} hasText={v.hasText} analyzing={analyzing} />
        </div>
      ) : (
        <>
          <div className="tl-head">
            <RevisionSelect
              postingId={postingId}
              selectedId={selected.id}
              options={v.revisions.map((r) => ({ id: r.id, label: revisionLabel(r) }))}
            />
            <span data-testid="profile-line" className="tl-text">
              <b>{selected.profileId} {selected.profileName}</b> ·{" "}
              <span title={selected.adjustments.map((a) => a.label).join(", ")}>추가 조정 {selected.adjustments.length}</span> · {selected.track} · {selected.kitName}
            </span>
            {v.isLatest && (
              <ChangeProfile postingId={postingId} picker={v.picker} initial={recipe} hasText={v.hasText} analyzing={analyzing} />
            )}
          </div>
          {selected.userRequest && (
            <p className="muted small" style={{ margin: 0 }} data-testid="request-line">
              요청: {selected.userRequest.length > REVISION_REQUEST_MAX ? selected.userRequest.slice(0, REVISION_REQUEST_MAX) : selected.userRequest}
            </p>
          )}
          {!v.isLatest && (
            <div className="notice info" style={{ marginTop: 0 }}>
              <span>이전 리비전을 보고 있습니다. 용어 맞추기·다듬기는 가장 최근 리비전에서만 할 수 있습니다.</span>
              <Link href={`/postings/${postingId}?tab=tailored`} replace scroll={false}>
                최신 리비전 보기
              </Link>
            </div>
          )}
          {selected.kitChanged && (
            <div className="notice info" style={{ marginTop: 0 }} data-testid="kit-changed">
              <span>
                이 맞춤본은 {selected.kitChanged.was} 기준입니다. 지금 키트는 {selected.kitChanged.now}입니다.
              </span>
              <RebuildButton postingId={postingId} revisionId={selected.id} />
            </div>
          )}

          <Warnings r={selected} />

          {v.isLatest && v.handoff.reasons.length > 0 && (
            <HandoffPanel postingId={postingId} revisionId={selected.id} reasons={v.handoff.reasons} picker={v.picker} recipe={recipe} />
          )}

          {selected.pending.length > 0 && (
            <div className="card tl-box" data-testid="pending-adjustments">
              <h3>남은 추가 조정 (AI나 직접 할 일)</h3>
              <ul className="plain">
                {selected.pending.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              {selected.source !== "recipe" && <p className="muted small" style={{ margin: "6px 0 0" }}>AI가 반영했는지 확인하세요.</p>}
            </div>
          )}

          <div className="tl-cols">
            <div style={{ display: "grid", gap: 16 }}>
              <div className="card tl-box" data-testid="changes">
                <h3>바뀐 곳</h3>
                <ChangesBody r={selected} />
              </div>
              <div className="card tl-box" data-testid="checklist">
                <h3>제출 전 체크리스트</h3>
                <AutoChecks r={selected} />
                {selected.checklist.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted small">직접 확인 (체크는 이 브라우저에만 기억합니다)</div>
                    <Checklist storageKey={`cf-checklist:${selected.id}`} items={selected.checklist} />
                  </div>
                )}
              </div>
            </div>
            <PreviewPane revisionId={selected.id} />
          </div>

          <div className="tl-actions" data-testid="downloads">
            <b>내려받기</b>
            <a className="btn sm" href={`/api/tailored/${selected.id}/resume`}>이력서 PDF</a>
            <a className="btn sm" href={`/api/tailored/${selected.id}/career`}>경력기술서 PDF</a>
            <details className="menu-pop">
              <summary>md 받기 ▾</summary>
              <div>
                <a href={`/api/tailored/${selected.id}/resume?format=md`}>이력서.md</a>
                <a href={`/api/tailored/${selected.id}/career?format=md`}>경력기술서.md</a>
                <a href={`/api/tailored/${selected.id}/posting-md`}>공고.md</a>
              </div>
            </details>
          </div>

          {v.isLatest && (
            <>
              <div className="tl-actions">
                <TermsButton postingId={postingId} big={selected.source === "recipe"} busy={busy} />
              </div>
              <RefineForm postingId={postingId} busy={busy} />
              {v.handoff.reasons.length === 0 && (
                <HandoffPanel postingId={postingId} revisionId={selected.id} reasons={[]} picker={v.picker} recipe={recipe} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Warnings({ r }: { r: RevisionView }) {
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

function ChangesBody({ r }: { r: RevisionView }) {
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

function AutoChecks({ r }: { r: RevisionView }) {
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

