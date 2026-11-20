import { and, eq, gte, inArray, or } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, statusEvents } from '@/lib/db/schema';
import { monthsAgoLocal, syntheticKstIso, toKstIso, todayLocal } from '@/lib/domain/dates';
import type { ApplicationStatus, SiteId } from '@/lib/domain/types';
import { findOrCreateCompany } from '@/lib/companies/repo';
import { DOC_KINDS, DOC_NONE, canBeNone, isDocsForKind, type SubmittedDocs } from '@/lib/documents/files';
import { docFileExists } from '@/lib/documents/folder';
import { applicationOrder } from './sort';
import { REACHED_STAGES } from './stages';
import { getPosting } from '@/lib/postings/repo';
import { getLatestResume } from '@/lib/resume/repo';

export type Application = typeof applications.$inferSelect;
export type StatusEvent = typeof statusEvents.$inferSelect;

const now = () => new Date().toISOString();

export function markApplied(
  input: { postingId: number; appliedAt?: string; site?: SiteId; siteNote?: string; notes?: string },
  db: Db = getDb(),
): number {
  const posting = getPosting(input.postingId, db);
  if (!posting) throw new Error('공고를 찾을 수 없습니다');
  if (posting.companyId == null) throw new Error('분석이 끝난 뒤 지원 완료를 눌러주세요');
  const resume = getLatestResume(db);
  if (!resume) throw new Error('기본 이력서를 먼저 등록하세요.');

  const site = input.site ?? posting.site;
  const siteNote = site === 'other' ? (input.siteNote?.trim() || posting.siteNote || null) : null;
  const appliedAt = input.appliedAt ?? todayLocal();
  return db.transaction((tx) => {
    const id = tx
      .insert(applications)
      .values({
        postingId: posting.id,
        companyId: posting.companyId!,
        positionTitle: posting.positionTitle ?? '(포지션 미상)',
        site,
        siteNote,
        appliedAt,
        appliedDatetime: toKstIso(new Date()),
        submittedResume: { kind: 'base', versionId: resume.id },
        status: 'applied',
        notes: input.notes ?? null,
        createdAt: now(),
      })
      .returning({ id: applications.id })
      .get().id;
    tx.insert(statusEvents).values({ applicationId: id, status: 'applied', at: now() }).run();
    return id;
  });
}

export function changeStatus(
  applicationId: number,
  status: ApplicationStatus,
  opts: { interviewRound?: number; note?: string; at?: string } = {},
  db: Db = getDb(),
): void {
  if (status === 'interview' && !(Number.isInteger(opts.interviewRound) && opts.interviewRound! >= 1)) {
    throw new Error('면접은 차수(1 이상)를 함께 입력해야 합니다');
  }
  const round = status === 'interview' ? opts.interviewRound! : null;
  db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app) throw new Error('지원 기록을 찾을 수 없습니다');
    tx.update(applications).set({ status, interviewRound: round }).where(eq(applications.id, applicationId)).run();
    tx.insert(statusEvents)
      .values({ applicationId, status, interviewRound: round, at: opts.at ?? now(), note: opts.note ?? null })
      .run();
  });
}

export function getPriorApplications(
  companyId: number,
  opts: { excludePostingId?: number } = {},
  db: Db = getDb(),
): { id: number; positionTitle: string; site: SiteId; appliedAt: string; status: ApplicationStatus }[] {
  return db
    .select()
    .from(applications)
    .where(eq(applications.companyId, companyId))
    .orderBy(...applicationOrder)
    .all()
    .filter((a) => opts.excludePostingId == null || a.postingId !== opts.excludePostingId)
    .map((a) => ({
      id: a.id,
      positionTitle: a.positionTitle,
      site: a.site,
      appliedAt: a.appliedAt,
      status: a.status,
    }));
}

/** 종류와 이름 규칙이 맞고 폴더에 실제 있는 파일만 허용한다. 아니면 던진다(저장 전에 확인하므로 아무것도 저장되지 않는다). */
function assertDocsValid(docs: SubmittedDocs | undefined, docsDir?: string): void {
  if (!docs) return;
  for (const k of DOC_KINDS) {
    const name = docs[k];
    if (name == null) continue;
    if (name === DOC_NONE) {
      if (canBeNone(k)) continue;
      throw new Error(`서류 파일을 찾을 수 없습니다: ${name}`);
    }
    if (!isDocsForKind(k, name) || !docFileExists(name, docsDir)) {
      throw new Error(`서류 파일을 찾을 수 없습니다: ${name}`);
    }
  }
}

export function bulkCreateApplications(
  rows: {
    companyName: string;
    positionTitle: string;
    site: SiteId;
    siteNote?: string;
    appliedAt: string;
    status: ApplicationStatus;
    notes?: string;
    submittedDocs?: SubmittedDocs;
  }[],
  db: Db = getDb(),
  docsDir?: string,
): number {
  for (const r of rows) assertDocsValid(r.submittedDocs, docsDir);
  // 같은 지원일 행끼리 위에서부터 rank 0, 1, 2… (위 행이 더 최근)
  const rankByDay = new Map<string, number>();
  return db.transaction((tx) => {
    for (const r of rows) {
      const rank = rankByDay.get(r.appliedAt) ?? 0;
      rankByDay.set(r.appliedAt, rank + 1);
      const companyId = findOrCreateCompany({ displayName: r.companyName }, tx as unknown as Db);
      const site = r.site;
      const id = tx
        .insert(applications)
        .values({
          postingId: null,
          companyId,
          positionTitle: r.positionTitle,
          site,
          siteNote: site === 'other' ? (r.siteNote?.trim() || null) : null,
          appliedAt: r.appliedAt,
          appliedDatetime: syntheticKstIso(r.appliedAt, rank),
          submittedResume: { kind: 'imported' },
          submittedDocs: r.submittedDocs ?? null,
          status: r.status,
          notes: r.notes?.trim() || null,
          createdAt: now(),
        })
        .returning({ id: applications.id })
        .get().id;
      tx.insert(statusEvents).values({ applicationId: id, status: r.status, at: now() }).run();
    }
    return rows.length;
  });
}

/** 이 공고의 지원 기록 전부. 지원일이 늦은 순, 같으면 나중에 만든 것이 먼저. */
export function listApplicationsForPosting(postingId: number, db: Db = getDb()): Application[] {
  return db
    .select()
    .from(applications)
    .where(eq(applications.postingId, postingId))
    .orderBy(...applicationOrder)
    .all();
}

/** 이 공고의 최신 지원 기록(없으면 undefined). */
export function getApplicationForPosting(postingId: number, db: Db = getDb()): Application | undefined {
  return listApplicationsForPosting(postingId, db)[0];
}

export type RecentApplication = {
  id: number;
  postingId: number | null;
  positionTitle: string;
  site: SiteId;
  siteNote: string | null;
  appliedAt: string;
  status: ApplicationStatus;
  interviewRound: number | null;
  /** 지금 지원하려는 공고에 낸 기록이면 true */
  samePosting: boolean;
};

/**
 * 같은 공고 또는 같은 회사(companyId)에 최근 months개월(기본 6) 안에 지원한 기록. 최신순.
 * 경계는 로컬 날짜 기준이고, 정확히 months개월 전 날짜는 포함한다.
 */
export function getRecentApplications(
  postingId: number,
  opts: { now?: Date; months?: number } = {},
  db: Db = getDb(),
): RecentApplication[] {
  const posting = getPosting(postingId, db);
  if (!posting) return [];
  const since = monthsAgoLocal(opts.now ?? new Date(), opts.months ?? 6);
  const where =
    posting.companyId != null
      ? or(eq(applications.postingId, postingId), eq(applications.companyId, posting.companyId))
      : eq(applications.postingId, postingId);
  return db
    .select()
    .from(applications)
    .where(and(where, gte(applications.appliedAt, since)))
    .orderBy(...applicationOrder)
    .all()
    .map((a) => ({
      id: a.id,
      postingId: a.postingId,
      positionTitle: a.positionTitle,
      site: a.site,
      siteNote: a.siteNote,
      appliedAt: a.appliedAt,
      status: a.status,
      interviewRound: a.interviewRound,
      samePosting: a.postingId === postingId,
    }));
}

export function getApplication(id: number, db: Db = getDb()): Application | undefined {
  return db.select().from(applications).where(eq(applications.id, id)).get();
}

export function listStatusEvents(applicationId: number, db: Db = getDb()): StatusEvent[] {
  return db
    .select()
    .from(statusEvents)
    .where(eq(statusEvents.applicationId, applicationId))
    .orderBy(statusEvents.id)
    .all();
}

export function updateNotes(applicationId: number, notes: string, db: Db = getDb()): void {
  db.update(applications).set({ notes }).where(eq(applications.id, applicationId)).run();
}

/** 회사명·포지션·사이트·지원일 수정. 상태는 changeStatus로 바꾼다. */
export function updateApplication(
  id: number,
  patch: {
    companyName?: string;
    positionTitle?: string;
    site?: SiteId;
    siteNote?: string | null;
    appliedAt?: string;
  },
  db: Db = getDb(),
): void {
  db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, id)).get();
    if (!app) throw new Error('지원 기록을 찾을 수 없습니다');
    const set: Partial<typeof applications.$inferInsert> = {};
    if (patch.companyName !== undefined) {
      set.companyId = findOrCreateCompany({ displayName: patch.companyName }, tx as unknown as Db);
    }
    if (patch.positionTitle !== undefined) set.positionTitle = patch.positionTitle;
    if (patch.appliedAt !== undefined) set.appliedAt = patch.appliedAt;
    const site = patch.site ?? app.site;
    if (patch.site !== undefined) set.site = patch.site;
    if (patch.siteNote !== undefined || patch.site !== undefined) {
      const note = patch.siteNote !== undefined ? patch.siteNote : app.siteNote;
      set.siteNote = site === 'other' ? (note?.trim() || null) : null;
    }
    if (Object.keys(set).length > 0) tx.update(applications).set(set).where(eq(applications.id, id)).run();
  });
}

/** 상태 이력은 함께 지운다. 공고는 남는다. */
export function deleteApplication(id: number, db: Db = getDb()): void {
  db.transaction((tx) => {
    tx.delete(statusEvents).where(eq(statusEvents.applicationId, id)).run();
    tx.delete(applications).where(eq(applications.id, id)).run();
  });
}

/** 기록 여러 건의 메모·제출 서류·상태 이력을 한 번에 읽는다(IN 조회, 500건씩). */
export function listRecordExtras(
  ids: number[],
  db: Db = getDb(),
): Map<number, { notes: string | null; submittedDocs: SubmittedDocs | null; events: StatusEvent[] }> {
  const out = new Map<number, { notes: string | null; submittedDocs: SubmittedDocs | null; events: StatusEvent[] }>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const a of db
      .select({ id: applications.id, notes: applications.notes, submittedDocs: applications.submittedDocs })
      .from(applications)
      .where(inArray(applications.id, chunk))
      .all()) {
      out.set(a.id, { notes: a.notes, submittedDocs: a.submittedDocs, events: [] });
    }
    for (const e of db
      .select()
      .from(statusEvents)
      .where(inArray(statusEvents.applicationId, chunk))
      .orderBy(statusEvents.id)
      .all()) {
      out.get(e.applicationId)?.events.push(e);
    }
  }
  return out;
}

/** 상태 이력 중 서류합격·과제·코딩테스트·면접·최종합격 행을 지원 기록별로 모은다. */
export function listReachedHistory(db: Db = getDb()): Map<number, ApplicationStatus[]> {
  const map = new Map<number, ApplicationStatus[]>();
  for (const e of db
    .select({ applicationId: statusEvents.applicationId, status: statusEvents.status })
    .from(statusEvents)
    .where(inArray(statusEvents.status, REACHED_STAGES))
    .all()) {
    const list = map.get(e.applicationId);
    if (list) list.push(e.status);
    else map.set(e.applicationId, [e.status]);
  }
  return map;
}
