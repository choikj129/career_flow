import { eq, isNotNull, isNull, and } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { config } from '@/lib/config';
import { applications } from '@/lib/db/schema';
import { DOC_KINDS, docFileName, parseDocsNote, type SubmittedDocs } from './files';
import { docFileExists } from './folder';

function targets(db: Db) {
  return db
    .select({ id: applications.id, notes: applications.notes })
    .from(applications)
    .where(and(isNull(applications.submittedDocs), isNotNull(applications.notes)))
    .all()
    .flatMap((a) => {
      const parsed = a.notes ? parseDocsNote(a.notes) : null;
      return parsed ? [{ id: a.id, parsed }] : [];
    });
}

/** 메모의 "제출 서류" 줄을 submittedDocs로 옮긴다. 폴더에 없는 파일이 있으면 그 기록은 건드리지 않는다. 다시 실행해도 안전. */
export function migrateDocsFromNotes(
  dir: string = config.documentsDir,
  db: Db = getDb(),
): { migrated: number; skipped: { applicationId: number; missing: string[] }[] } {
  const skipped: { applicationId: number; missing: string[] }[] = [];
  let migrated = 0;
  db.transaction((tx) => {
    for (const t of targets(tx as unknown as Db)) {
      const docs: SubmittedDocs = {};
      const missing: string[] = [];
      for (const k of DOC_KINDS) {
        const date = t.parsed.dates[k];
        if (!date) {
          docs[k] = null;
          continue;
        }
        const name = docFileName(k, date);
        if (docFileExists(name, dir)) docs[k] = name;
        else missing.push(name);
      }
      if (missing.length) {
        skipped.push({ applicationId: t.id, missing });
        continue;
      }
      tx.update(applications)
        .set({ submittedDocs: docs, notes: t.parsed.rest || null })
        .where(eq(applications.id, t.id))
        .run();
      migrated += 1;
    }
  });
  return { migrated, skipped };
}

export function countDocsNotesPending(db: Db = getDb()): number {
  return targets(db).length;
}

/** 파일 이름별로 그 파일을 낸 지원 기록 수. */
export function countDocUsage(db: Db = getDb()): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of db.select({ docs: applications.submittedDocs }).from(applications).where(isNotNull(applications.submittedDocs)).all()) {
    for (const k of DOC_KINDS) {
      const n = a.docs?.[k];
      if (n) out.set(n, (out.get(n) ?? 0) + 1);
    }
  }
  return out;
}
