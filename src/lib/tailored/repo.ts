import { desc, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { tailoredResumes, tailoredRevisions } from '@/lib/db/schema';
import type { KitWarning } from '@/lib/kit/types';

export type TailoredRevision = typeof tailoredRevisions.$inferSelect;
export type RevisionSummary = Pick<
  TailoredRevision,
  'id' | 'revNo' | 'source' | 'profileId' | 'profileName' | 'userRequest' | 'kitId' | 'createdAt'
>;

const now = () => new Date().toISOString();

export function getTailoredForPosting(postingId: number, db: Db = getDb()): { id: number; postingId: number; createdAt: string } | null {
  return db.select().from(tailoredResumes).where(eq(tailoredResumes.postingId, postingId)).get() ?? null;
}

export function getRevision(id: number, db: Db = getDb()): TailoredRevision | null {
  return db.select().from(tailoredRevisions).where(eq(tailoredRevisions.id, id)).get() ?? null;
}

/** 이 공고의 리비전, 최신순 */
export function listRevisionsForPosting(postingId: number, db: Db = getDb()): RevisionSummary[] {
  const t = getTailoredForPosting(postingId, db);
  if (!t) return [];
  return db
    .select({
      id: tailoredRevisions.id,
      revNo: tailoredRevisions.revNo,
      source: tailoredRevisions.source,
      profileId: tailoredRevisions.profileId,
      profileName: tailoredRevisions.profileName,
      userRequest: tailoredRevisions.userRequest,
      kitId: tailoredRevisions.kitId,
      createdAt: tailoredRevisions.createdAt,
    })
    .from(tailoredRevisions)
    .where(eq(tailoredRevisions.tailoredResumeId, t.id))
    .orderBy(desc(tailoredRevisions.revNo))
    .all();
}

/** 리비전이 속한 공고 id. 없으면 null */
export function revisionPostingId(revisionId: number, db: Db = getDb()): number | null {
  const row = db
    .select({ postingId: tailoredResumes.postingId })
    .from(tailoredRevisions)
    .innerJoin(tailoredResumes, eq(tailoredRevisions.tailoredResumeId, tailoredResumes.id))
    .where(eq(tailoredRevisions.id, revisionId))
    .get();
  return row?.postingId ?? null;
}

export type NewRevision = {
  postingId: number;
  kitId: number;
  track: string;
  profileId: string;
  profileName: string;
  adjustments: { id: string; label: string }[];
  source: 'recipe' | 'terms' | 'revise' | 'external';
  resumeMd: string;
  careerMd: string;
  pendingAdjustments: string[];
  changeReasons: { doc: 'resume' | 'career'; after: string; reason: string }[];
  warnings: KitWarning[];
  notes: string;
  userRequest?: string | null;
  jobId?: number | null;
};

/** 리비전을 더한다. 공고의 맞춤 묶음이 없으면 만들고, 번호는 1부터 센다. */
export function addRevision(input: NewRevision, db: Db = getDb()): { id: number; revNo: number } {
  return db.transaction((tx) => {
    let t = tx.select().from(tailoredResumes).where(eq(tailoredResumes.postingId, input.postingId)).get();
    if (!t) {
      t = tx
        .insert(tailoredResumes)
        .values({ postingId: input.postingId, createdAt: now() })
        .returning()
        .get();
    }
    const last = tx
      .select({ revNo: tailoredRevisions.revNo })
      .from(tailoredRevisions)
      .where(eq(tailoredRevisions.tailoredResumeId, t.id))
      .orderBy(desc(tailoredRevisions.revNo))
      .limit(1)
      .get();
    const revNo = (last?.revNo ?? 0) + 1;
    const { postingId: _postingId, userRequest, jobId, ...rest } = input;
    void _postingId;
    const row = tx
      .insert(tailoredRevisions)
      .values({ ...rest, tailoredResumeId: t.id, revNo, userRequest: userRequest ?? null, jobId: jobId ?? null, createdAt: now() })
      .returning({ id: tailoredRevisions.id })
      .get();
    return { id: row.id, revNo };
  });
}

