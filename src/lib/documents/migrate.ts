import { eq, isNotNull, isNull, and } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { config } from '@/lib/config';
import { applications } from '@/lib/db/schema';
import { DOC_KINDS, DOC_NONE, docFileName, docFileOf, parseDocsNote, pickDocFile, type DocKind, type SubmittedDocs } from './files';
import { docFileExists, listDocFiles } from './folder';

function targets(db: Db) {
  return db
    .select({ id: applications.id, notes: applications.notes, appliedAt: applications.appliedAt })
    .from(applications)
    .where(and(isNull(applications.submittedDocs), isNotNull(applications.notes)))
    .all()
    .flatMap((a) => {
      const parsed = a.notes ? parseDocsNote(a.notes) : null;
      return parsed ? [{ id: a.id, appliedAt: a.appliedAt, parsed }] : [];
    });
}

/** 메모의 "제출 서류" 줄을 submittedDocs로 옮긴다. 폴더에 없는 파일이 있으면 그 기록은 건드리지 않는다. 다시 실행해도 안전. */
export function migrateDocsFromNotes(
  dir: string = config.documentsDir,
  db: Db = getDb(),
): { migrated: number; skipped: { applicationId: number; missing: string[] }[] } {
  const skipped: { applicationId: number; missing: string[] }[] = [];
  let migrated = 0;
  const files = listDocFiles(dir).files;
  db.transaction((tx) => {
    for (const t of targets(tx as unknown as Db)) {
      const docs: SubmittedDocs = {};
      const missing: string[] = [];
      for (const k of DOC_KINDS) {
        const date = t.parsed.dates[k];
        if (!date) {
          // 메모의 "모름"은 예전 규칙으로 만든 값이라 같은 경계("없음")를 다시 적용한다.
          docs[k] = pickDocFile(k, t.appliedAt, files) === DOC_NONE ? DOC_NONE : null;
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
      const n = docFileOf(a.docs?.[k]);
      if (n) out.set(n, (out.get(n) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * 경력기술서·포트폴리오의 가장 이른 파일보다 앞선 지원에서 값이 비어 있는(모름) 종류를 "없음"으로 바꾼다(일회성).
 * 파일 이름이 이미 있는 값·없음은 건드리지 않는다. 메모 이관 전 기록(submitted_docs null + 메모에 "제출 서류:" 줄)은 건너뛴다.
 * 그 종류 파일이 폴더에 0개면 그 종류는 건너뛴다. 다시 실행해도 안전. dryRun이면 세기만 한다.
 */
export function markDocsNoneBeforeFirst(
  dir: string = config.documentsDir,
  db: Db = getDb(),
  opts: { dryRun?: boolean } = {},
): { updated: number; byKind: { career: number; portfolio: number }; pendingNotes: number } {
  const files = listDocFiles(dir).files;
  const first: Partial<Record<DocKind, string>> = {};
  for (const k of ['career', 'portfolio'] as const) {
    const dates = files.filter((f) => f.kind === k).map((f) => f.date).sort();
    if (dates.length > 0) first[k] = dates[0];
  }
  const byKind = { career: 0, portfolio: 0 };
  let updated = 0;
  let pendingNotes = 0;
  db.transaction((tx) => {
    for (const a of tx
      .select({ id: applications.id, appliedAt: applications.appliedAt, docs: applications.submittedDocs, notes: applications.notes })
      .from(applications)
      .all()) {
      const kinds = (['career', 'portfolio'] as const).filter((k) => first[k] != null && a.appliedAt < first[k]! && a.docs?.[k] == null);
      if (kinds.length === 0) continue;
      if (a.docs == null && a.notes && parseDocsNote(a.notes)) {
        pendingNotes += 1;
        continue;
      }
      const next: SubmittedDocs = a.docs ? { ...a.docs } : { resume: null, career: null, portfolio: null };
      for (const k of kinds) {
        next[k] = DOC_NONE;
        byKind[k] += 1;
      }
      updated += 1;
      if (!opts.dryRun) tx.update(applications).set({ submittedDocs: next }).where(eq(applications.id, a.id)).run();
    }
  });
  return { updated, byKind, pendingNotes };
}
