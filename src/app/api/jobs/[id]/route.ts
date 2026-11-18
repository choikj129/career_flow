import { getJob, listActiveJobs } from '@/lib/ai/queue';

export async function GET(_req: Request, { params }: RouteContext<'/api/jobs/[id]'>) {
  const { id } = await params;
  const jobId = Number(id);
  const job = Number.isInteger(jobId) ? getJob(jobId) : undefined;
  if (!job) return Response.json({ error: 'not_found' }, { status: 404 });
  // 대기 중이면 앞에 있는 작업 수 + 1이 "대기 N번째"
  const queuePosition =
    job.status === 'queued' ? listActiveJobs().filter((j) => j.id < job.id).length + 1 : null;
  return Response.json({
    id: job.id,
    type: job.type,
    status: job.status,
    errorKind: job.errorKind,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    queuePosition,
  });
}
