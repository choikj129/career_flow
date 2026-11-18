import { connection } from "next/server";
import { listActiveJobs } from "@/lib/ai/queue";

export async function GET() {
  await connection();
  const jobs = listActiveJobs();
  const running = jobs.filter((j) => j.status === "running");
  const target = running[0] ?? jobs[0];
  const postingId = (target?.payload as { postingId?: number } | null)?.postingId;
  return Response.json({
    running: running.length,
    queued: jobs.length - running.length,
    href: postingId != null ? `/postings/${postingId}` : null,
  });
}
