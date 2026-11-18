import { and, desc, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, statusEvents } from '@/lib/db/schema';
import { todayLocal } from '@/lib/domain/dates';
import type { ApplicationStatus, SiteId } from '@/lib/domain/types';
import { findOrCreateCompany } from '@/lib/companies/repo';
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
  if (getApplicationForPosting(input.postingId, db)) throw new Error('이미 지원 기록이 있는 공고입니다');
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
    .orderBy(desc(applications.appliedAt), desc(applications.id))
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

export function bulkCreateApplications(
  rows: {
    companyName: string;
    positionTitle: string;
    site: SiteId;
    siteNote?: string;
    appliedAt: string;
    status: ApplicationStatus;
  }[],
  db: Db = getDb(),
): number {
  return db.transaction((tx) => {
    for (const r of rows) {
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
          submittedResume: { kind: 'imported' },
          status: r.status,
          createdAt: now(),
        })
        .returning({ id: applications.id })
        .get().id;
      tx.insert(statusEvents).values({ applicationId: id, status: r.status, at: now() }).run();
    }
    return rows.length;
  });
}

export function getApplicationForPosting(postingId: number, db: Db = getDb()): Application | undefined {
  return db.select().from(applications).where(eq(applications.postingId, postingId)).get();
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
