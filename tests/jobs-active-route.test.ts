import { makeTmpDir } from './helpers/tmp';
import { describe, expect, test, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));

describe('GET /api/jobs/active (TC-TAILOR-ACTIVE)', () => {
  test('links tailoring jobs to the tailored tab and analysis jobs to the posting', async () => {
    process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-active-');
    const { getDb, runMigrations } = await import('@/lib/db/client');
    const db = getDb();
    runMigrations(db);
    const { enqueueJob } = await import('@/lib/ai/queue');
    const { aiJobs } = await import('@/lib/db/schema');
    const { GET } = await import('@/app/api/jobs/active/route');

    const none = await (await GET()).json();
    expect(none).toEqual({ running: 0, queued: 0, href: null });

    enqueueJob('analyze_posting', { postingId: 7 }, db);
    expect((await (await GET()).json()).href).toBe('/postings/7');

    db.delete(aiJobs).run();
    enqueueJob('tailor_resume', { postingId: 8, revisionId: 1 }, db);
    expect((await (await GET()).json()).href).toBe('/postings/8?tab=tailored');
    db.delete(aiJobs).run();
    enqueueJob('revise_tailored', { postingId: 9, request: '가상' }, db);
    expect((await (await GET()).json()).href).toBe('/postings/9?tab=tailored');
  });
});
