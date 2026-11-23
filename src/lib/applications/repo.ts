import { and, eq, gte, inArray, or } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, statusEvents } from '@/lib/db/schema';
import { monthsAgoLocal, syntheticKstIso, toKstIso, todayLocal } from '@/lib/domain/dates';
import type { ApplicationStatus, SiteId, SubmittedResume } from '@/lib/domain/types';
import { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { findOrCreateCompany } from '@/lib/companies/repo';
import { DOC_KINDS, DOC_NONE, canBeNone, isDocsForKind, type SubmittedDocs } from '@/lib/documents/files';
import { docFileExists, listDocFiles } from '@/lib/documents/folder';
import { getKit, getUsableKit } from '@/lib/kit/repo';
import { getLatestAnalysis, getPosting } from '@/lib/postings/repo';
import { getResumeVersion } from '@/lib/resume/repo';
import type { ResumeContent } from '@/lib/resume/schema';
import { listRevisionsForPosting, revisionPostingId } from '@/lib/tailored/repo';
import { applicationOrder } from './sort';
import { REACHED_STAGES } from './stages';
import { defaultSubmitted, toColumns, type SubmittedInput } from './submitted';

export type Application = typeof applications.$inferSelect;
export type StatusEvent = typeof statusEvents.$inferSelect;

const now = () => new Date().toISOString();

/** [지원 완료] 기본 선택: 키트가 있으면 추천 직무(분석의 프로필 추천, 직무가 하나뿐이면 그 직무)의 기본 서류. 고를 수 없으면 null */
export function defaultKitChoice(postingId: number, db: Db): { id: number; track: string } | null {
  const kit = getUsableKit(db);
  if (!kit) return null;
  const tracks = kit.parsed.tracks.map((t) => t.name);
  const analysis = getLatestAnalysis(postingId, db);
  const rec = analysis ? AnalysisResult.safeParse(analysis.result).data?.profileRecommendation : null;
  if (rec && tracks.includes(rec.track)) return { id: kit.id, track: rec.track };
  return tracks.length === 1 ? { id: kit.id, track: tracks[0] } : null;
}

/** 저장 전 검증과 칸 변환. 실패하면 예외(아무것도 저장되지 않는다). prev는 수정할 때의 지금 기록 */
function resolveSubmittedColumns(
  input: SubmittedInput,
  ctx: { postingId: number | null; prev?: Application; docsDir?: string },
  db: Db,
): ReturnType<typeof toColumns> {
  const r = input.resume;
  let kitProfile: { profileId: string; profileName: string } | undefined;
  switch (r.kind) {
    case 'tailored':
      if (ctx.postingId == null || revisionPostingId(r.tailoredRevisionId, db) !== ctx.postingId) {
        throw new Error('이 공고의 맞춤 이력서가 아닙니다');
      }
      break;
    case 'kit': {
      const prev = ctx.prev?.submittedResume;
      if (prev?.kind === 'kit' && prev.kitId === r.kitId && prev.track === r.track) {
        kitProfile = { profileId: prev.profileId, profileName: prev.profileName }; // 바꾸지 않았으면 기록된 프로필 그대로
        break;
      }
      const parsed = getKit(r.kitId, db)?.parsed;
      const track = parsed?.tracks.find((t) => t.name === r.track);
      if (!parsed || !track) throw new Error('서류 키트에 없는 직무입니다');
      const profile =
        parsed.profiles.find((p) => p.track === track.name && p.id === track.defaultProfileId) ??
        parsed.profiles.find((p) => p.track === track.name && p.isDefault);
      if (!profile) throw new Error('서류 키트에 없는 직무입니다');
      kitProfile = { profileId: profile.id, profileName: profile.name };
      break;
    }
    case 'file':
      if (!isDocsForKind('resume', r.fileName) || !docFileExists(r.fileName, ctx.docsDir)) {
        throw new Error(`서류 파일을 찾을 수 없습니다: ${r.fileName}`);
      }
      break;
    case 'base': {
      const prev = ctx.prev?.submittedResume;
      if (!(prev?.kind === 'base' && prev.versionId === r.versionId)) throw new Error('기본 이력서 버전은 새로 고를 수 없습니다');
      break;
    }
    case 'unknown':
      break;
  }
  assertDocsValid({ career: input.career, portfolio: input.portfolio }, ctx.docsDir);
  return toColumns(input, { prevKind: ctx.prev?.submittedResume.kind, kitProfile });
}

/**
 * 지원 완료로 저장한다. submitted가 없으면 기본값(최신 맞춤 리비전 → 추천 직무의 기본 서류 → 지원일 기준 이력서 파일 → 모름).
 * 기본 이력서(앱 JSON)는 필요 없다. 잘못된 선택은 저장 전에 예외로 막는다.
 */
export function markApplied(
  input: {
    postingId: number;
    appliedAt?: string;
    site?: SiteId;
    siteNote?: string;
    notes?: string;
    submitted?: SubmittedInput;
  },
  db: Db = getDb(),
  docsDir?: string,
): number {
  const posting = getPosting(input.postingId, db);
  if (!posting) throw new Error('공고를 찾을 수 없습니다');
  if (posting.companyId == null) throw new Error('분석이 끝난 뒤 지원 완료를 눌러주세요');

  const site = input.site ?? posting.site;
  const siteNote = site === 'other' ? (input.siteNote?.trim() || posting.siteNote || null) : null;
  const appliedAt = input.appliedAt ?? todayLocal();
  const submitted =
    input.submitted ??
    defaultSubmitted({
      appliedAt,
      files: listDocFiles(docsDir).files,
      latestRevisionId: listRevisionsForPosting(posting.id, db)[0]?.id ?? null,
      kit: defaultKitChoice(posting.id, db),
    });
  const cols = resolveSubmittedColumns(submitted, { postingId: posting.id, docsDir }, db);
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
        submittedResume: cols.submittedResume,
        submittedDocs: cols.submittedDocs,
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

/** 회사명·포지션·사이트·지원일·제출 서류 수정. 상태는 changeStatus로 바꾼다. */
export function updateApplication(
  id: number,
  patch: {
    companyName?: string;
    positionTitle?: string;
    site?: SiteId;
    siteNote?: string | null;
    appliedAt?: string;
    submitted?: SubmittedInput;
  },
  db: Db = getDb(),
  docsDir?: string,
): void {
  db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, id)).get();
    if (!app) throw new Error('지원 기록을 찾을 수 없습니다');
    const set: Partial<typeof applications.$inferInsert> = {};
    if (patch.submitted) {
      const cols = resolveSubmittedColumns(patch.submitted, { postingId: app.postingId, prev: app, docsDir }, tx as unknown as Db);
      set.submittedResume = cols.submittedResume;
      set.submittedDocs = cols.submittedDocs;
    }
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

/**
 * 4단계 면접 준비가 쓰는 "제출한 이력서"의 앱 JSON 내용. 예전 [지원 완료] 기록(base)만 있다.
 * 맞춤본·기본 서류(키트 md)와 이력서 파일(PDF)은 앱 JSON이 아니므로 null이다.
 */
export function resolveSubmittedResume(
  sr: SubmittedResume,
  db: Db = getDb(),
): { label: string; content: ResumeContent } | null {
  if (sr.kind !== 'base') return null;
  const v = getResumeVersion(sr.versionId, db);
  return v ? { label: `기본 이력서 v${v.versionNo}`, content: v.content } : null;
}
