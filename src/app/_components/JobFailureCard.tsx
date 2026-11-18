import Link from "next/link";
import { describeJobFailure } from "@/lib/ai/job-messages";
import type { JobType } from "@/lib/domain/types";

/** 실패한 AI 작업 안내. 문구는 describeJobFailure가 만들고, 아래 버튼은 화면마다 children으로 넣는다. */
export function JobFailureCard({
  title,
  job,
  type,
  children,
}: {
  title: string;
  job: { errorKind: Parameters<typeof describeJobFailure>[0]["errorKind"]; errorMessage: string | null };
  type: JobType;
  children?: React.ReactNode;
}) {
  const failure = describeJobFailure(job, type);
  return (
    <div className="fail-card" role="alert">
      <h3>{title}</h3>
      <p style={{ margin: 0 }}>{failure.message}</p>
      {failure.settingsLink && (
        <p className="small" style={{ margin: "8px 0 0" }}>
          <Link href="/settings">설정으로 이동</Link>
        </p>
      )}
      {failure.detail && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ margin: 0, fontWeight: 600 }}>원문 보기</summary>
          <pre>{failure.detail}</pre>
        </details>
      )}
      {children ? <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div> : null}
    </div>
  );
}
