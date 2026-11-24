import Link from "next/link";
import { JobStatus } from "@/app/_components/JobStatus";
import type { RevisionSummary } from "@/lib/tailored/repo";
import { loadTailorView } from "@/lib/tailored/view";
import { ApplyDocsCard } from "./ApplyDocsCard";

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

/**
 * 맞춤 이력서 탭(화면 문서 3.4). 2026-11-24부터 앱의 맞춤본 만들기는 화면에서 숨기고(코드는 그대로),
 * 지원 서류 카드(+ 이력서 세션 요청)와 이전 맞춤본 목록만 보인다. 주소의 `?rev=`는 무시한다.
 */
export function TailoredTab({ postingId }: { postingId: number }) {
  const v = loadTailorView(postingId, null);

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

  const analyzing = v.analysisJob != null;

  return (
    <div className="tl" data-testid="tailored-tab">
      {v.staleKitNote && <div className="notice info" style={{ marginTop: 0 }}><span>{v.staleKitNote}</span></div>}
      {v.tailorJob && <JobStatus jobId={v.tailorJob.id} type={v.tailorJob.type} initial={v.tailorJob} />}

      <ApplyDocsCard postingId={postingId} docs={v.applyDocs} hasText={v.hasText} analyzing={analyzing} />

      {v.revisions.length > 0 && (
        <details className="card tl-box" data-testid="past-revisions">
          <summary>이전 맞춤본 ({v.revisions.length})</summary>
          <ul className="plain past-revs">
            {v.revisions.map((r) => (
              <li key={r.id} className="past-rev-row" data-testid="past-revision">
                <span className="tl-text">
                  {revisionLabel(r)} · <b>{r.profileId} {r.profileName}</b>
                </span>
                <span className="tl-actions">
                  <a className="btn sm" href={`/api/tailored/${r.id}/resume`}>이력서 PDF</a>
                  <a className="btn sm" href={`/api/tailored/${r.id}/career`}>경력기술서 PDF</a>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ margin: "8px 0 0" }}>앱에서 만든 맞춤본입니다. 새 맞춤본은 이력서 세션에서 만듭니다.</p>
        </details>
      )}
    </div>
  );
}
