"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { estimateText } from "@/lib/ai/job-text";
import { formatElapsed } from "@/lib/domain/dates";
import type { JobStatus as Status, JobType } from "@/lib/domain/types";

type Snapshot = {
  status: Status;
  startedAt: string | null;
  createdAt: string;
  queuePosition: number | null;
};

/**
 * AI 작업 진행 표시. 2초마다 /api/jobs/[id]를 조회하고,
 * 작업이 끝나면(성공·실패·취소) 화면을 새로 읽는다.
 * 실패 문구는 서버가 그리므로 여기서는 진행 중일 때만 보여 준다.
 */
export function JobStatus({
  jobId,
  type,
  initial,
}: {
  jobId: number;
  type: JobType;
  initial: Snapshot;
}) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const j = (await res.json()) as Snapshot;
        setSnap(j);
        if (j.status !== "queued" && j.status !== "running") {
          stopped = true;
          router.refresh();
        }
      } catch {
        /* 다음 주기에 다시 한다 */
      }
    };
    const timer = setInterval(poll, 2000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [jobId, router]);

  if (snap.status === "queued") {
    return (
      <div className="card run-card" role="status">
        <span className="spinner" />
        <span>앞의 작업이 끝나면 시작합니다 (대기 {snap.queuePosition ?? 1}번째)</span>
      </div>
    );
  }
  const since = snap.startedAt ?? snap.createdAt;
  return (
    <div className="card run-card" role="status">
      <span className="spinner" />
      <span>
        {estimateText(type)} <span className="muted">· {formatElapsed(now - new Date(since).getTime())}</span>
      </span>
    </div>
  );
}
