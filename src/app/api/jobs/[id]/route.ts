import { getJob } from '@/lib/ai/queue';

export async function GET(_req: Request, { params }: RouteContext<'/api/jobs/[id]'>) {
  const { id } = await params;
  const jobId = Number(id);
  const job = Number.isInteger(jobId) ? getJob(jobId) : undefined;
  if (!job) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({
    id: job.id,
    type: job.type,
    status: job.status,
    errorKind: job.errorKind,
    errorMessage: job.errorMessage,
    finishedAt: job.finishedAt,
  });
}
