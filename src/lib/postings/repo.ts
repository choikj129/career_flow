import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { aiJobs, analyses, applications, companies, postings } from '@/lib/db/schema';
import { MAX_POSTING_TEXT_LENGTH, POSTING_TEXT_TOO_LONG_MESSAGE } from '@/lib/domain/limits';
import { assertHttpUrl, canonicalizeUrl, detectSite } from '@/lib/domain/normalize';
import type { SiteId } from '@/lib/domain/types';
import { enqueueJob } from '@/lib/ai/queue';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { addCompanyAlias, findOrCreateCompany } from '@/lib/companies/repo';

export type Posting = typeof postings.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;

const now = () => new Date().toISOString();

export const MAX_COMPANY_NAME_LENGTH = 100;
export const MAX_POSITION_LENGTH = 200;

function checkLengths(company: string | null, position: string | null): void {
  if (company && company.length > MAX_COMPANY_NAME_LENGTH) throw new Error(`회사명은 ${MAX_COMPANY_NAME_LENGTH}자 이하로 입력하세요`);
  if (position && position.length > MAX_POSITION_LENGTH) throw new Error(`포지션은 ${MAX_POSITION_LENGTH}자 이하로 입력하세요`);
}

export function registerPosting(
  input: {
    url?: string;
    pastedText?: string;
    siteNote?: string;
    companyName?: string;
    positionTitle?: string;
    textSource?: 'pasted' | 'bookmarklet';
  },
  db: Db = getDb(),
): { postingId: number; existing: boolean; jobId?: number } {
  const url = input.url?.trim() || undefined;
  const pastedText = input.pastedText?.trim() || undefined;
  if (!url && !pastedText) throw new Error('공고 링크나 본문 중 하나는 필요합니다');
  if (url) assertHttpUrl(url);
  if (pastedText && pastedText.length > MAX_POSTING_TEXT_LENGTH) throw new Error(POSTING_TEXT_TOO_LONG_MESSAGE);

  let canonicalUrl: string | null = null;
  if (url) {
    canonicalUrl = canonicalizeUrl(url);
    const existing = db.select().from(postings).where(eq(postings.canonicalUrl, canonicalUrl)).get();
    if (existing) return { postingId: existing.id, existing: true };
  }
  const siteNote = input.siteNote?.trim() || null;
  const companyName = input.companyName?.trim() || null;
  const positionTitle = input.positionTitle?.trim() || null;
  checkLengths(companyName, positionTitle);
  const companyId = companyName ? findOrCreateCompany({ displayName: companyName }, db) : null;
  const row = db
    .insert(postings)
    .values({
      url: url ?? null,
      canonicalUrl,
      site: url ? detectSite(url) : 'other',
      siteNote,
      companyId,
      positionTitle,
      rawText: pastedText ?? null,
      rawTextSource: pastedText ? (input.textSource ?? 'pasted') : null,
      fetchedAt: pastedText ? now() : null,
      createdAt: now(),
    })
    .returning({ id: postings.id })
    .get();
  const jobId = enqueueJob('analyze_posting', { postingId: row.id }, db);
  return { postingId: row.id, existing: false, jobId };
}

export function setPostingText(
  postingId: number,
  text: string,
  db: Db = getDb(),
  source: 'extracted' | 'pasted' | 'bookmarklet' = 'pasted',
): void {
  db.update(postings)
    .set({ rawText: text, rawTextSource: source, fetchedAt: now() })
    .where(eq(postings.id, postingId))
    .run();
}

export function providePostingText(postingId: number, text: string, db: Db = getDb()): number {
  if (text.length > MAX_POSTING_TEXT_LENGTH) throw new Error(POSTING_TEXT_TOO_LONG_MESSAGE);
  setPostingText(postingId, text, db);
  return enqueueJob('analyze_posting', { postingId }, db);
}

export function reanalyzePosting(postingId: number, db: Db = getDb()): number {
  return enqueueJob('analyze_posting', { postingId }, db);
}

export function saveAnalysis(
  postingId: number,
  resumeVersionId: number,
  result: AnalysisResult,
  jobId: number,
  db: Db = getDb(),
): void {
  const posting = getPosting(postingId, db);
  if (!posting) throw new Error('공고를 찾을 수 없습니다');
  const companyId =
    posting.companyId ??
    findOrCreateCompany(
      { displayName: result.posting.companyDisplayName, legalName: result.posting.companyLegalName },
      db,
    );
  db.transaction((tx) => {
    tx.insert(analyses)
      .values({ postingId, resumeVersionId, result, fitScore: result.fit.score, jobId, createdAt: now() })
      .run();
    tx.update(postings)
      .set({
        // 사용자가 넣은(또는 먼저 채워진) 포지션은 다시 분석해도 바꾸지 않는다.
        positionTitle: posting.positionTitle ?? result.posting.positionTitle,
        deadline: result.posting.deadline,
        extracted: result.posting,
        companyId,
      })
      .where(eq(postings.id, postingId))
      .run();
  });
  addAnalysisAliases(companyId, result.posting.companyAliases, db);
}

const MAX_ALIASES = 3;
const MAX_ALIAS_LENGTH = 50;

/** 분석이 낸 회사 별칭을 회사에 붙인다. 실패해도 분석 저장은 성공으로 둔다. 다른 회사의 키와 같으면 addCompanyAlias가 건너뛴다. */
function addAnalysisAliases(companyId: number, aliases: string[] | undefined, db: Db): void {
  const list = (aliases ?? []).map((a) => a.trim()).filter((a) => a && a.length <= MAX_ALIAS_LENGTH);
  for (const alias of list.slice(0, MAX_ALIASES)) {
    try {
      addCompanyAlias(companyId, alias, db);
    } catch {
      // 별칭은 보조 정보다
    }
  }
}

export function getPosting(id: number, db: Db = getDb()): Posting | undefined {
  return db.select().from(postings).where(eq(postings.id, id)).get();
}

export function getLatestAnalysis(postingId: number, db: Db = getDb()): Analysis | undefined {
  return db
    .select()
    .from(analyses)
    .where(eq(analyses.postingId, postingId))
    .orderBy(desc(analyses.id))
    .limit(1)
    .get();
}

export function listAnalyses(postingId: number, db: Db = getDb()): Analysis[] {
  return db.select().from(analyses).where(eq(analyses.postingId, postingId)).orderBy(desc(analyses.id)).all();
}

export type AnalyzedPostingRow = {
  postingId: number;
  companyId: number | null;
  companyName: string | null;
  positionTitle: string | null;
  site: SiteId;
  siteNote: string | null;
  url: string | null;
  deadline: string | null;
  fitScore: number;
  analyzedAt: string;
};

/** 분석은 끝났고 지원 기록은 없는 공고. 최신 분석순. */
export function listAnalyzedNotApplied(db: Db = getDb()): AnalyzedPostingRow[] {
  const appliedIds = new Set(
    db
      .select({ id: applications.postingId })
      .from(applications)
      .where(isNotNull(applications.postingId))
      .all()
      .map((r) => r.id),
  );
  const latest = new Map<number, { id: number; fitScore: number; createdAt: string }>();
  for (const a of db
    .select({ id: analyses.id, postingId: analyses.postingId, fitScore: analyses.fitScore, createdAt: analyses.createdAt })
    .from(analyses)
    .orderBy(desc(analyses.id))
    .all()) {
    if (!latest.has(a.postingId)) latest.set(a.postingId, a);
  }
  const ids = [...latest.keys()].filter((id) => !appliedIds.has(id));
  if (ids.length === 0) return [];
  const ps = db
    .select({
      p: {
        id: postings.id,
        companyId: postings.companyId,
        positionTitle: postings.positionTitle,
        site: postings.site,
        siteNote: postings.siteNote,
        url: postings.url,
        deadline: postings.deadline,
      },
      companyName: companies.displayName,
    })
    .from(postings)
    .leftJoin(companies, eq(postings.companyId, companies.id))
    .where(inArray(postings.id, ids))
    .all();
  return ps
    .map(({ p, companyName }) => {
      const a = latest.get(p.id)!;
      return {
        postingId: p.id,
        companyId: p.companyId,
        companyName,
        positionTitle: p.positionTitle,
        site: p.site,
        siteNote: p.siteNote,
        url: p.url,
        deadline: p.deadline,
        fitScore: a.fitScore,
        analyzedAt: a.createdAt,
        _aid: a.id,
      };
    })
    .sort((x, y) => y._aid - x._aid)
    .map((row) => {
      const { _aid, ...rest } = row;
      void _aid; // 정렬에만 쓰고 결과에서는 뺀다
      return rest;
    });
}

export type PendingPostingRow = {
  postingId: number;
  site: SiteId;
  siteNote: string | null;
  url: string | null;
  createdAt: string;
  jobStatus: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | null;
};

/** 아직 분석 결과가 없고 지원 기록도 없는 공고(분석 중·실패 포함). 최신 등록순. */
export function listUnanalyzedPostings(db: Db = getDb()): PendingPostingRow[] {
  const analyzed = new Set(db.select({ id: analyses.postingId }).from(analyses).all().map((r) => r.id));
  const applied = new Set(
    db.select({ id: applications.postingId }).from(applications).where(isNotNull(applications.postingId)).all().map((r) => r.id),
  );
  const jobs = db
    .select({ payload: aiJobs.payload, status: aiJobs.status })
    .from(aiJobs)
    .where(eq(aiJobs.type, 'analyze_posting'))
    .orderBy(desc(aiJobs.id))
    .all();
  const latestJob = new Map<number, (typeof jobs)[number]>();
  for (const j of jobs) {
    const pid = (j.payload as { postingId?: number } | null)?.postingId;
    if (pid != null && !latestJob.has(pid)) latestJob.set(pid, j);
  }
  return db
    .select({
      id: postings.id,
      site: postings.site,
      siteNote: postings.siteNote,
      url: postings.url,
      createdAt: postings.createdAt,
    })
    .from(postings)
    .orderBy(desc(postings.id))
    .all()
    .filter((p) => !analyzed.has(p.id) && !applied.has(p.id))
    .map((p) => ({
      postingId: p.id,
      site: p.site,
      siteNote: p.siteNote,
      url: p.url,
      createdAt: p.createdAt,
      jobStatus: latestJob.get(p.id)?.status ?? null,
    }));
}

export function setPostingCompany(postingId: number, companyId: number, db: Db = getDb()): void {
  db.transaction((tx) => {
    if (!tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get()) {
      throw new Error('존재하지 않는 회사입니다');
    }
    if (!tx.select({ id: postings.id }).from(postings).where(eq(postings.id, postingId)).get()) {
      throw new Error('공고를 찾을 수 없습니다');
    }
    tx.update(postings).set({ companyId }).where(eq(postings.id, postingId)).run();
    // 이 공고로 지원한 기록이 있으면 회사도 함께 바꾼다(중복 지원 검사가 어긋나지 않도록).
    tx.update(applications).set({ companyId }).where(eq(applications.postingId, postingId)).run();
  });
}

/** 상세 화면 [수정]: 회사 이름(없으면 만든다)과 포지션을 고친다. 이 공고로 지원한 기록의 회사도 함께 바뀐다. */
export function updatePostingInfo(
  postingId: number,
  input: { companyName: string; positionTitle: string },
  db: Db = getDb(),
): void {
  const companyName = input.companyName.trim();
  const positionTitle = input.positionTitle.trim();
  if (!companyName) throw new Error('회사명을 입력하세요');
  if (!positionTitle) throw new Error('포지션을 입력하세요');
  checkLengths(companyName, positionTitle);
  if (!getPosting(postingId, db)) throw new Error('공고를 찾을 수 없습니다');
  const companyId = findOrCreateCompany({ displayName: companyName }, db);
  setPostingCompany(postingId, companyId, db);
  db.update(postings).set({ positionTitle }).where(eq(postings.id, postingId)).run();
}

/** 지원 기록이 있거나 작업이 실행 중이면 거부. 대기 중 작업은 취소하고 분석은 함께 지운다. */
export function deletePosting(postingId: number, db: Db = getDb()): void {
  db.transaction((tx) => {
    const applied = tx.select({ id: applications.id }).from(applications).where(eq(applications.postingId, postingId)).get();
    if (applied) throw new Error('지원 기록이 있는 공고는 삭제할 수 없습니다');
    const jobs = tx
      .select()
      .from(aiJobs)
      .where(and(inArray(aiJobs.type, ['analyze_posting', 'tailor_resume', 'revise_tailored']), inArray(aiJobs.status, ['queued', 'running'])))
      .all()
      .filter((j) => (j.payload as { postingId?: number } | null)?.postingId === postingId);
    if (jobs.some((j) => j.status === 'running')) throw new Error('작업이 끝난 뒤 삭제하세요');
    for (const j of jobs) {
      tx.update(aiJobs).set({ status: 'canceled', finishedAt: now() }).where(eq(aiJobs.id, j.id)).run();
    }
    tx.delete(analyses).where(eq(analyses.postingId, postingId)).run();
    tx.delete(postings).where(eq(postings.id, postingId)).run();
  });
}

/** 지금까지 쓴 기타 출처 이름. 공고·지원 기록 합쳐 중복 제거, 최근 사용순. */
export function listSiteNotes(db: Db = getDb()): string[] {
  const fromPostings = db
    .select({ note: postings.siteNote, at: postings.createdAt, id: postings.id })
    .from(postings)
    .where(isNotNull(postings.siteNote))
    .all();
  const fromApps = db
    .select({ note: applications.siteNote, at: applications.createdAt, id: applications.id })
    .from(applications)
    .where(isNotNull(applications.siteNote))
    .all();
  const all = [...fromPostings, ...fromApps]
    .filter((r) => r.note && r.note.trim())
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
  return [...new Set(all.map((r) => r.note!.trim()))];
}
