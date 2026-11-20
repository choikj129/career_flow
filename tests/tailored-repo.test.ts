import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { aiJobs, kits, tailoredResumes, tailoredRevisions } from '@/lib/db/schema';
import { registerPosting, deletePosting } from '@/lib/postings/repo';
import { enqueueJob, getJob } from '@/lib/ai/queue';
import { addRevision, getRevision, getTailoredForPosting, listRevisionsForPosting, revisionPostingId } from '@/lib/tailored/repo';
import type { Db } from '@/lib/db/client';

function makeKit(db: Db): number {
  return db
    .insert(kits)
    .values({ label: '키트 1', files: [], parsed: null, errors: [], createdAt: new Date().toISOString() })
    .returning({ id: kits.id })
    .get().id;
}

const rev = (kitId: number, over: Partial<Parameters<typeof addRevision>[0]> = {}) => ({
  postingId: 0,
  kitId,
  track: '백엔드',
  profileId: 'B1',
  profileName: '범용',
  adjustments: [],
  source: 'recipe' as const,
  resumeMd: '# 가상 이력서',
  careerMd: '# 가상 경력기술서',
  pendingAdjustments: [],
  changeReasons: [],
  warnings: [],
  notes: '',
  ...over,
});

describe('tailored revisions (TC-TAILOR-01)', () => {
  test('revision numbers count up per posting, newest first, and map back to the posting', () => {
    const db = makeTestDb();
    const kitId = makeKit(db);
    const a = registerPosting({ url: 'https://example.com/a' }, db).postingId;
    const b = registerPosting({ url: 'https://example.com/b' }, db).postingId;
    const r1 = addRevision(rev(kitId, { postingId: a }), db);
    const r2 = addRevision(rev(kitId, { postingId: a, source: 'terms', profileId: 'B2', profileName: '특화' }), db);
    const other = addRevision(rev(kitId, { postingId: b }), db);
    expect([r1.revNo, r2.revNo, other.revNo]).toEqual([1, 2, 1]);
    expect(listRevisionsForPosting(a, db).map((r) => [r.revNo, r.source, r.profileId])).toEqual([
      [2, 'terms', 'B2'],
      [1, 'recipe', 'B1'],
    ]);
    expect(getTailoredForPosting(a, db)).toMatchObject({ postingId: a });
    expect(getTailoredForPosting(999, db)).toBeNull();
    expect(revisionPostingId(r2.id, db)).toBe(a);
    expect(revisionPostingId(12345, db)).toBeNull();
    expect(getRevision(r1.id, db)).toMatchObject({ resumeMd: '# 가상 이력서', careerMd: '# 가상 경력기술서', jobId: null });
  });
});

describe('deleting a posting (TC-TAILOR-02)', () => {
  test('cascades to tailored data and cancels queued tailor jobs', () => {
    const db = makeTestDb();
    const kitId = makeKit(db);
    const id = registerPosting({ url: 'https://example.com/c' }, db).postingId;
    addRevision(rev(kitId, { postingId: id }), db);
    const jobId = enqueueJob('tailor_resume', { postingId: id }, db);
    deletePosting(id, db);
    expect(db.select().from(tailoredResumes).all()).toHaveLength(0);
    expect(db.select().from(tailoredRevisions).all()).toHaveLength(0);
    expect(getJob(jobId, db)!.status).toBe('canceled');
  });

  test('refuses while a tailor job is running', () => {
    const db = makeTestDb();
    const id = registerPosting({ url: 'https://example.com/d' }, db).postingId;
    const jobId = enqueueJob('revise_tailored', { postingId: id, request: 'x' }, db);
    db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, jobId)).run();
    expect(() => deletePosting(id, db)).toThrow('작업이 끝난 뒤 삭제하세요');
  });
});
