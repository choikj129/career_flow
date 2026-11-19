import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getJob, listActiveJobs } from "@/lib/ai/queue";
import { ImportedApplications } from "@/lib/ai/tasks/schemas";
import { markExistingRows } from "@/lib/applications/import-review";
import type { CheckedRow } from "@/lib/applications/import-rows";
import { SITE_IDS, type SiteId } from "@/lib/domain/types";
import { JobFailureCard } from "../_components/JobFailureCard";
import { JobStatus } from "../_components/JobStatus";
import { ImportForm } from "./ImportForm";
import { ImportReviewTable } from "./ImportReviewTable";

export default function ImportPage(props: PageProps<"/import">) {
  return (
    <main className="page">
      <Suspense fallback={<div className="muted">불러오는 중…</div>}>
        <ImportLoader searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Header({ step }: { step: 1 | 2 }) {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>이미 지원한 내역 가져오기</h1>
          <p className="desc">
            각 사이트의 &quot;지원 현황&quot; 화면을 복사하거나 캡처해서 넣으면 표로 정리합니다. 등록하기 전에 확인하고 고칠 수 있습니다.
          </p>
        </div>
      </div>
      <div className="steps">
        <span className={step === 1 ? "on" : ""}>1. 입력</span>
        <i />
        <span className={step === 2 ? "on" : ""}>2. 검토</span>
      </div>
    </>
  );
}

async function ImportLoader({ searchParams }: { searchParams: PageProps<"/import">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const raw = Array.isArray(sp.job) ? sp.job[0] : sp.job;
  const jobId = Number(raw);
  const job = Number.isInteger(jobId) && jobId > 0 ? getJob(jobId) : undefined;

  if (!job || job.type !== "import_applications") {
    return (
      <>
        <Header step={1} />
        <ImportForm />
      </>
    );
  }

  if (job.status === "queued" || job.status === "running") {
    return (
      <>
        <Header step={1} />
        <div style={{ marginTop: 16 }}>
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
      </>
    );
  }

  const failedCard = (
    <JobFailureCard
      title="추출에 실패했습니다"
      job={job.status === "succeeded" ? { errorKind: "schema", errorMessage: "저장된 결과를 읽을 수 없습니다." } : job}
      type="import_applications"
    >
      <Link className="btn primary" href="/import">
        처음부터
      </Link>
    </JobFailureCard>
  );

  if (job.status !== "succeeded") {
    return (
      <>
        <Header step={1} />
        <div style={{ marginTop: 16 }}>{failedCard}</div>
      </>
    );
  }
  const parsed = ImportedApplications.safeParse(job.result);
  if (!parsed.success) {
    return (
      <>
        <Header step={1} />
        <div style={{ marginTop: 16 }}>{failedCard}</div>
      </>
    );
  }

  const paySite = (job.payload as { site?: string } | null)?.site ?? "";
  const selected: SiteId = (SITE_IDS as string[]).includes(paySite) ? (paySite as SiteId) : "other";
  const existing = markExistingRows(
    parsed.data.rows.map((r) => ({ companyName: r.companyName, appliedAt: r.appliedAt ?? "" })),
  );
  const rows: CheckedRow[] = parsed.data.rows.map((r, i) => ({
    companyName: r.companyName,
    positionTitle: r.positionTitle,
    site: r.site ?? selected,
    siteNote: "",
    appliedAt: r.appliedAt ?? "",
    status: r.status ?? "applied",
    notes: "",
    docs: { resume: null, career: null, portfolio: null },
    checked: !existing[i],
  }));

  return (
    <>
      <Header step={2} />
      <ImportReviewTable key={job.id} initialRows={rows} initialExisting={existing} />
    </>
  );
}
