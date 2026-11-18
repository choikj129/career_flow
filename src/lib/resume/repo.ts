import { desc, eq, max } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { preferences, resumeVersions } from '@/lib/db/schema';
import { Preferences, ResumeContent, defaultPreferences } from './schema';

export type ResumeVersion = {
  id: number;
  versionNo: number;
  content: ResumeContent;
  createdAt: string;
};

export function saveResumeVersion(
  content: ResumeContent,
  sourceNote?: string,
  db: Db = getDb(),
): { id: number; versionNo: number } {
  const parsed = ResumeContent.parse(content);
  return db.transaction((tx) => {
    const cur = tx.select({ m: max(resumeVersions.versionNo) }).from(resumeVersions).get();
    const versionNo = (cur?.m ?? 0) + 1;
    const row = tx
      .insert(resumeVersions)
      .values({ versionNo, content: parsed, sourceNote: sourceNote ?? null, createdAt: new Date().toISOString() })
      .returning({ id: resumeVersions.id })
      .get();
    return { id: row.id, versionNo };
  });
}

function toVersion(r: typeof resumeVersions.$inferSelect): ResumeVersion {
  return {
    id: r.id,
    versionNo: r.versionNo,
    content: ResumeContent.parse(r.content),
    createdAt: r.createdAt,
  };
}

export function getLatestResume(db: Db = getDb()): ResumeVersion | null {
  const r = db.select().from(resumeVersions).orderBy(desc(resumeVersions.versionNo)).limit(1).get();
  return r ? toVersion(r) : null;
}

export function listResumeVersions(
  db: Db = getDb(),
): { id: number; versionNo: number; createdAt: string; sourceNote: string | null }[] {
  return db
    .select({
      id: resumeVersions.id,
      versionNo: resumeVersions.versionNo,
      createdAt: resumeVersions.createdAt,
      sourceNote: resumeVersions.sourceNote,
    })
    .from(resumeVersions)
    .orderBy(desc(resumeVersions.versionNo))
    .all();
}

export function getResumeVersion(id: number, db: Db = getDb()): ResumeVersion | null {
  const r = db.select().from(resumeVersions).where(eq(resumeVersions.id, id)).get();
  return r ? toVersion(r) : null;
}

export function getPreferences(db: Db = getDb()): Preferences {
  const r = db.select().from(preferences).where(eq(preferences.id, 1)).get();
  return r ? Preferences.parse(r.content) : defaultPreferences();
}

export function savePreferences(p: Preferences, db: Db = getDb()): void {
  const content = Preferences.parse(p);
  const updatedAt = new Date().toISOString();
  db.insert(preferences)
    .values({ id: 1, content, updatedAt })
    .onConflictDoUpdate({ target: preferences.id, set: { content, updatedAt } })
    .run();
}
