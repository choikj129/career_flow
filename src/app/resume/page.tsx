import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listActiveJobs, getJob } from "@/lib/ai/queue";
import { formatDateTime } from "@/lib/domain/dates";
import {
  getLatestResume,
  getPreferences,
  getResumeVersion,
  listResumeVersions,
} from "@/lib/resume/repo";
import { ResumeContent, emptyResume } from "@/lib/resume/schema";
import { JobFailureCard } from "../_components/JobFailureCard";
import { JobStatus } from "../_components/JobStatus";
import { DocFiles } from "./DocFiles";
import { KitTab } from "./KitTab";
import { PreferencesForm } from "./PreferencesForm";
import { ResumeEditor } from "./ResumeEditor";
import { ResumeTabs } from "./ResumeTabs";
import { UploadForm } from "./UploadForm";
import { VersionHistory } from "./VersionHistory";

export default function ResumePage(props: PageProps<"/resume">) {
  return (
    <main className="page">
      <Suspense fallback={<div className="muted">불러오는 중…</div>}>
        <ResumeLoader searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

async function ResumeLoader({ searchParams }: { searchParams: PageProps<"/resume">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const jobId = Number(first(sp.job));
  const manual = first(sp.manual) === "1";
  const latest = getLatestResume();

  // 저장 전 상태: 가져오기 결과 검토 또는 직접 입력으로 시작
  if (!latest) {
    if (manual) return <Draft content={emptyResume()} source="manual" />;
    const job = Number.isInteger(jobId) && jobId > 0 ? getJob(jobId) : undefined;
    if (job && job.type === "import_resume") {
      if (job.status === "queued" || job.status === "running") {
        return (
          <Shell title="기본 이력서">
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
          </Shell>
        );
      }
      if (job.status === "succeeded") {
        const parsed = ResumeContent.safeParse(job.result);
        if (parsed.success) return <Draft content={parsed.data} source="import" jobId={job.id} />;
        return (
          <Shell title="기본 이력서">
            <JobFailureCard title="가져오기에 실패했습니다" job={{ errorKind: "schema", errorMessage: "저장된 결과를 읽을 수 없습니다." }} type="import_resume">
              <FailActions />
            </JobFailureCard>
          </Shell>
        );
      }
      return (
        <Shell title="기본 이력서">
          <JobFailureCard title="가져오기에 실패했습니다" job={job} type="import_resume">
            <FailActions />
          </JobFailureCard>
        </Shell>
      );
    }
    return (
      <Shell title="기본 이력서">
        <UploadForm />
      </Shell>
    );
  }

  const versions = listResumeVersions().map((v) => ({
    id: v.id,
    versionNo: v.versionNo,
    createdAt: v.createdAt,
    note: v.sourceNote,
    content: getResumeVersion(v.id)!.content,
  }));
  const savedLabel = `v${latest.versionNo} · ${formatDateTime(latest.createdAt)} 저장`;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>기본 이력서</h1>
          <p className="ver" style={{ margin: "4px 0 0" }}>
            <b>v{latest.versionNo}</b>　{formatDateTime(latest.createdAt)} 저장
            {versions[0]?.note ? `, "${versions[0].note}"` : ""}
          </p>
        </div>
      </div>
      <ResumeTabs
        edit={<ResumeEditor key={latest.id} initial={latest.content} savedLabel={savedLabel} />}
        versions={<VersionHistory versions={versions} />}
        prefs={<PreferencesForm initial={getPreferences()} />}
        docs={<DocFiles />}
        kit={<KitTab />}
        initialTab={first(sp.tab)}
      />
    </>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="narrow" style={{ maxWidth: 820, margin: "24px auto 0" }}>
      <h1 style={{ fontSize: 26 }}>{title}</h1>
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

function FailActions() {
  return (
    <>
      <Link className="btn primary" href="/resume">
        다시 시도
      </Link>
      <Link className="btn" href="/resume?manual=1">
        직접 입력으로 시작
      </Link>
    </>
  );
}

function Draft({ content, source, jobId }: { content: ResumeContent; source: "import" | "manual"; jobId?: number }) {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>기본 이력서</h1>
          <p className="ver" style={{ margin: "4px 0 0" }}>
            {source === "import" ? "가져온 내용을 검토하는 중입니다" : "직접 입력하는 중입니다"}
          </p>
        </div>
        <Link className="btn quiet" href="/resume">
          처음부터
        </Link>
      </div>
      <div className="notice warn" style={{ marginTop: 16 }}>
        <span>
          {source === "import"
            ? "아직 저장되지 않았습니다. 내용을 확인하고 저장하세요."
            : "아직 저장되지 않았습니다. 내용을 입력하고 저장하세요."}
        </span>
      </div>
      <div style={{ marginTop: 20 }}>
        <ResumeEditor key={`draft-${jobId ?? "manual"}`} initial={content} draft />
      </div>
    </>
  );
}
