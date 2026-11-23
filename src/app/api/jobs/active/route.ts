import { connection } from "next/server";
import { listActiveJobs } from "@/lib/ai/queue";

export async function GET() {
  await connection();
  const jobs = listActiveJobs();
  const running = jobs.filter((j) => j.status === "running");
  const target = running[0] ?? jobs[0];
  const postingId = (target?.payload as { postingId?: number } | null)?.postingId;
  // 맞춤 이력서 작업(용어 맞추기·다듬기)은 그 공고의 맞춤 이력서 탭으로 연결한다
  const tailoring = target?.type === "tailor_resume" || target?.type === "revise_tailored";
  return Response.json({
    running: running.length,
    queued: jobs.length - running.length,
    href: postingId != null ? `/postings/${postingId}${tailoring ? "?tab=tailored" : ""}` : null,
  });
}
