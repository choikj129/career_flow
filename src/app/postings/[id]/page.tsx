import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { describeJobFailure } from "@/lib/ai/job-messages";
import { latestJobFor, listActiveJobs } from "@/lib/ai/queue";
import { AnalysisResult } from "@/lib/ai/tasks/schemas";
import {
  getApplication,
  getApplicationForPosting,
  getPriorApplications,
  listStatusEvents,
} from "@/lib/applications/repo";
import { getCompany, getCompanyUsage } from "@/lib/companies/repo";
import { eventDate, formatDateTime } from "@/lib/domain/dates";
import { getLatestAnalysis, getPosting, listAnalyses, listSiteNotes } from "@/lib/postings/repo";
import { getLatestResume, getResumeVersion } from "@/lib/resume/repo";
import { AnalysisView } from "../../_components/AnalysisView";
import { DuplicateBanner, type PriorApplication } from "../../_components/DuplicateBanner";
import { JobStatus } from "../../_components/JobStatus";
import { SiteBadge } from "../../_components/SiteBadge";
import { StatusBadge } from "../../_components/StatusBadge";
import { ApplyForm } from "./ApplyForm";
import { CompanyLink } from "./CompanyLink";
import { DeletePostingButton } from "./DeletePostingButton";
import { NotesForm } from "./NotesForm";
import { PasteForm } from "./PasteForm";
import { RecordActions } from "./RecordActions";
import { RetryButton } from "./RetryButton";
import { StatusChange } from "./StatusChange";

type Tab = "analysis" | "raw" | "record";
const TAB_LABELS: Record<Tab, string> = { analysis: "분석", raw: "공고 원문", record: "지원 기록" };
const TABS = Object.keys(TAB_LABELS) as Tab[];

export default function PostingPage(props: PageProps<"/postings/[id]">) {
  return (
    <Suspense fallback={<main className="page muted">불러오는 중…</main>}>
      <PostingDetail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PostingDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/postings/[id]">["params"];
  searchParams: PageProps<"/postings/[id]">["searchParams"];
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const postingId = Number(id);
  const posting = Number.isInteger(postingId) ? getPosting(postingId) : undefined;
  if (!posting) notFound();

  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "analysis";
  const rawA = Array.isArray(sp.a) ? sp.a[0] : sp.a;

  const company = posting.companyId != null ? getCompany(posting.companyId) : undefined;
  const application = getApplicationForPosting(postingId);
  const job = latestJobFor("analyze_posting", (p) => p?.postingId === postingId);
  const jobActive = job != null && (job.status === "queued" || job.status === "running");
  const jobFailed = job?.status === "failed";
  const siteNotes = listSiteNotes();

  const prior: PriorApplication[] = company
    ? getPriorApplications(company.id, { excludePostingId: postingId }).flatMap((p) => {
        const full = getApplication(p.id);
        return full
          ? [
              {
                id: full.id,
                postingId: full.postingId,
                positionTitle: full.positionTitle,
                site: full.site,
                siteNote: full.siteNote,
                appliedAt: full.appliedAt,
                status: full.status,
                interviewRound: full.interviewRound,
              },
            ]
          : [];
      })
    : [];

  const analyzed = getLatestAnalysis(postingId) != null;
  const tabHref = (t: Tab) => `/postings/${postingId}${t === "analysis" ? "" : `?tab=${t}`}`;
  const title =
    posting.positionTitle ?? (analyzed ? "(포지션 미상)" : jobActive ? "분석 중인 공고" : "아직 분석되지 않은 공고");

  return (
    <main className="page">
      <div className="crumb">
        <Link href="/">지원 기록</Link> / {company?.displayName ?? "분석 후 표시"}
      </div>
      <div className="p-head">
        <div>
          <div className="p-co">
            {company?.displayName ?? "분석 후 표시"}
            {company && (
              <CompanyLink postingId={postingId} company={{ ...company, ...getCompanyUsage(company.id) }} />
            )}
          </div>
          <h1>{title}</h1>
          <div className="p-meta">
            <SiteBadge site={posting.site} note={posting.siteNote} large />
            {analyzed && <span>{posting.deadline ? `마감 ${posting.deadline}` : "상시 채용"}</span>}
            <span>{formatDateTime(posting.createdAt).split(" ").slice(0, 2).join(" ")} 등록</span>
            {posting.url && (
              <a href={posting.url} target="_blank" rel="noopener noreferrer">
                원본 공고 열기 ↗
              </a>
            )}
          </div>
        </div>
        <div className="p-actions">
          {application ? (
            <div className="p-state">
              <StatusBadge status={application.status} round={application.interviewRound} />
              <span className="muted small">{application.appliedAt}</span>
              <SiteBadge site={application.site} note={application.siteNote} />
              <StatusChange
                applicationId={application.id}
                status={application.status}
                round={application.interviewRound}
              />
            </div>
          ) : (
            <>
              <DeletePostingButton postingId={postingId} />
              <ApplyForm
                postingId={postingId}
                defaultSite={posting.site}
                defaultSiteNote={posting.siteNote}
                siteNotes={siteNotes}
                disabledHint={posting.companyId == null ? "분석이 끝난 뒤 누를 수 있습니다" : undefined}
              />
            </>
          )}
        </div>
      </div>

      <DuplicateBanner prior={prior} />

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <Link key={t} role="tab" aria-selected={tab === t} href={tabHref(t)} scroll={false} replace>
            {TAB_LABELS[t]}
            {t === "analysis" && jobActive && <span className="dot-flag" title="분석 중">…</span>}
            {t === "analysis" && !jobActive && jobFailed && <span className="dot-flag" title="분석 실패">!</span>}
          </Link>
        ))}
      </div>

      <section style={{ paddingTop: 24 }} role="tabpanel">
        {tab === "analysis" && (
          <AnalysisTab
            postingId={postingId}
            site={posting.site}
            selectedId={rawA ? Number(rawA) : undefined}
            job={job}
            jobActive={jobActive}
            jobFailed={jobFailed}
          />
        )}
        {tab === "raw" && <RawTab posting={posting} />}
        {tab === "record" && (
          <RecordTab
            postingId={postingId}
            applicationId={application?.id}
            siteNotes={siteNotes}
            defaultSite={posting.site}
            defaultSiteNote={posting.siteNote}
            companyReady={posting.companyId != null}
            companyName={company?.displayName ?? ""}
            positionTitle={posting.positionTitle ?? ""}
          />
        )}
      </section>
    </main>
  );
}

async function AnalysisTab({
  postingId,
  site,
  selectedId,
  job,
  jobActive,
  jobFailed,
}: {
  postingId: number;
  site: string;
  selectedId: number | undefined;
  job: ReturnType<typeof latestJobFor>;
  jobActive: boolean;
  jobFailed: boolean;
}) {
  const all = listAnalyses(postingId);
  const latest = all[0];
  const shown = (selectedId != null ? all.find((a) => a.id === selectedId) : undefined) ?? latest;
  const failure = jobFailed && job ? describeJobFailure(job, job.type) : null;

  let body: React.ReactNode = null;
  if (shown) {
    const parsed = AnalysisResult.safeParse(shown.result);
    const version = getResumeVersion(shown.resumeVersionId);
    const currentResume = getLatestResume();
    const isLatest = shown.id === latest.id;
    const stale =
      isLatest && version && currentResume && currentResume.versionNo > version.versionNo
        ? `기본 이력서가 v${currentResume.versionNo}로 바뀌었습니다. 다시 분석하면 반영됩니다`
        : undefined;
    const history = (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>분석 기록</h3>
          <RetryButton postingId={postingId} label="다시 분석" small disabled={jobActive} />
        </div>
        <ul className="history">
          {all.map((a) => {
            const v = getResumeVersion(a.resumeVersionId);
            const label = `${formatDateTime(a.createdAt)}${v ? `, v${v.versionNo}` : ""}`;
            return (
              <li key={a.id}>
                {a.id === shown.id ? (
                  <b>{label}</b>
                ) : (
                  <Link href={`/postings/${postingId}?a=${a.id}`} replace scroll={false}>
                    {label}
                  </Link>
                )}
                <span className={a.id === shown.id ? "" : "muted"}>
                  {a.id === shown.id ? <b>{a.fitScore}점</b> : `${a.fitScore}점`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
    body = parsed.success ? (
      <>
        {!isLatest && (
          <div className="notice info" style={{ marginBottom: 16 }}>
            <span>이전 분석 결과입니다(읽기 전용).</span>
            <Link href={`/postings/${postingId}`} replace scroll={false}>
              최신 결과 보기
            </Link>
          </div>
        )}
        <AnalysisView
          result={parsed.data}
          basis={`${version ? `기본 이력서 v${version.versionNo} 기준 · ` : ""}${formatDateTime(shown.createdAt)} 분석`}
          staleNote={stale}
          aside={history}
        />
      </>
    ) : (
      <div className="fail-card">
        <h3>저장된 분석 결과를 읽을 수 없습니다.</h3>
        <RetryButton postingId={postingId} label="다시 분석" />
      </div>
    );
  } else if (!jobActive && !failure) {
    body = (
      <div className="card empty-hint">
        <h3>분석 결과가 없습니다.</h3>
        <div style={{ marginTop: 12 }}>
          <RetryButton postingId={postingId} label="분석하기" />
        </div>
      </div>
    );
  }

  return (
    <>
      {jobActive && job && (
        <div style={{ marginBottom: shown ? 20 : 0 }}>
          <JobStatus
            jobId={job.id}
            type={job.type}
            initial={{
              status: job.status,
              startedAt: job.startedAt,
              createdAt: job.createdAt,
              queuePosition:
                job.status === "queued" ? listActiveJobs().filter((j) => j.id < job.id).length + 1 : null,
            }}
          />
        </div>
      )}
      {failure && (
        <div className="fail-card" style={{ marginBottom: shown ? 20 : 0 }} role="alert">
          <h3>분석에 실패했습니다</h3>
          <p style={{ margin: 0 }}>{failure.message}</p>
          {failure.kind === "extract_failed" && site !== "other" && (
            <p className="small" style={{ margin: "8px 0 0" }}>
              로그인이 필요한 사이트라면 <Link href="/settings">설정 → 사이트 로그인</Link>에서 한 번 로그인하면 다음부터 자동으로 읽습니다.
            </p>
          )}
          {failure.settingsLink && (
            <p className="small" style={{ margin: "8px 0 0" }}>
              <Link href="/settings">설정으로 이동</Link>
            </p>
          )}
          {failure.detail && failure.kind !== "extract_failed" && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ margin: 0, fontWeight: 600 }}>원문 보기</summary>
              <pre>{failure.detail}</pre>
            </details>
          )}
          {failure.canPaste ? (
            <PasteForm postingId={postingId} />
          ) : (
            <div style={{ marginTop: 14 }}>
              <RetryButton postingId={postingId} />
            </div>
          )}
        </div>
      )}
      {body}
    </>
  );
}

function RawTab({ posting }: { posting: NonNullable<ReturnType<typeof getPosting>> }) {
  const how =
    posting.rawTextSource === "extracted"
      ? "자동으로 읽음"
      : posting.rawTextSource === "pasted"
        ? "직접 붙여넣음"
        : "아직 읽지 않음";
  const read = posting.fetchedAt ? `${formatDateTime(posting.fetchedAt)} ${how}` : how;
  return (
    <>
      <div className="toolbar">
        <span className="muted small">
          {posting.url ? `${posting.url} · ` : "링크 없음 · "}
          {read}
        </span>
      </div>
      <div className="card rawtext" style={{ marginTop: 14 }}>
        {posting.rawText?.trim() ? posting.rawText : "아직 읽은 본문이 없습니다."}
      </div>
      <details style={{ marginTop: 14 }}>
        <summary style={{ margin: 0 }}>본문 다시 붙여넣기</summary>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          자동으로 읽은 내용이 엉망일 때 본문을 바꾸고 다시 분석합니다.
        </p>
        <PasteForm postingId={posting.id} buttonLabel="이 내용으로 다시 분석" />
      </details>
    </>
  );
}

async function RecordTab({
  postingId,
  applicationId,
  siteNotes,
  defaultSite,
  defaultSiteNote,
  companyReady,
  companyName,
  positionTitle,
}: {
  postingId: number;
  applicationId: number | undefined;
  siteNotes: string[];
  defaultSite: Parameters<typeof ApplyForm>[0]["defaultSite"];
  defaultSiteNote: string | null;
  companyReady: boolean;
  companyName: string;
  positionTitle: string;
}) {
  const app = applicationId != null ? getApplication(applicationId) : undefined;
  if (!app) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <h3 style={{ fontSize: 18 }}>아직 지원하지 않은 공고입니다.</h3>
        <p className="muted">실제 사이트에서 지원한 뒤 기록하세요.</p>
        <ApplyForm
          postingId={postingId}
          defaultSite={defaultSite}
          defaultSiteNote={defaultSiteNote}
          siteNotes={siteNotes}
          disabledHint={companyReady ? undefined : "분석이 끝난 뒤 누를 수 있습니다"}
        />
      </div>
    );
  }
  const events = listStatusEvents(app.id).reverse();
  const resumeNo =
    app.submittedResume.kind === "base" ? (getResumeVersion(app.submittedResume.versionId)?.versionNo ?? null) : null;
  return (
    <>
      <div className="card" style={{ padding: "18px 22px", display: "flex", gap: 32, flexWrap: "wrap" }}>
        <span>
          <span className="muted small">지원일</span>
          <br />
          <b>{app.appliedAt}</b>
        </span>
        <span>
          <span className="muted small">사이트</span>
          <br />
          <SiteBadge site={app.site} note={app.siteNote} large />
        </span>
        <span>
          <span className="muted small">제출한 이력서</span>
          <br />
          <b>{resumeNo != null ? `기본 이력서 v${resumeNo}` : "모름"}</b>
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <RecordActions
            record={{
              applicationId: app.id,
              companyName,
              positionTitle: app.positionTitle || positionTitle,
              site: app.site,
              siteNote: app.siteNote,
              appliedAt: app.appliedAt,
            }}
            siteNotes={siteNotes}
          />
        </span>
      </div>
      <h2 style={{ fontSize: 18, margin: "24px 0 10px" }}>진행 기록</h2>
      <div className="card" style={{ padding: "4px 18px" }}>
        <ul className="history">
          {events.map((e) => (
            <li key={e.id}>
              <span>
                {eventDate(e.at)}
                {e.note ? <span className="tl-note">{e.note}</span> : null}
              </span>
              <StatusBadge status={e.status} round={e.interviewRound} />
            </li>
          ))}
        </ul>
      </div>
      <div className="card" style={{ padding: "16px 20px", marginTop: 16 }}>
        <NotesForm applicationId={app.id} initial={app.notes ?? ""} />
      </div>
    </>
  );
}
