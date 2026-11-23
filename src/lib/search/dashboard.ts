import { and, desc, eq, gte, like, lte } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { analyses, applications, companies, companyKeys, resumeVersions } from '@/lib/db/schema';
import { monthLocal } from '@/lib/domain/dates';
import { listReachedHistory, listRecordExtras } from '@/lib/applications/repo';
import { applicationOrder } from '@/lib/applications/sort';
import { matchesStatusFilter, reachedStages, type ReachedStage } from '@/lib/applications/stages';
import { classifyOutcome } from '@/lib/stats/outcome';
import { tally, type Tally } from '@/lib/stats/rates';
import { docFileOf, docLabel } from '@/lib/documents/files';
import { resumeLabel } from '@/lib/applications/submitted';
import { listRevisionLabels } from '@/lib/tailored/repo';
import { normalizeCompanyName } from '@/lib/domain/normalize';
import {
  APPLICATION_STATUSES,
  SITE_IDS,
  SITE_LABELS,
  STATUS_LABELS,
  type ApplicationStatus,
  type SiteId,
} from '@/lib/domain/types';
import { listAnalyzedNotApplied } from '@/lib/postings/repo';

export type DashboardRow = {
  applicationId: number;
  postingId: number | null;
  companyId: number;
  companyName: string;
  positionTitle: string;
  site: SiteId;
  /** 사이트가 기타일 때의 출처 이름 */
  siteNote?: string | null;
  appliedAt: string;
  status: ApplicationStatus;
  interviewRound: number | null;
  fitScore: number | null;
  resumeLabel: string | null;
  resumeBaseVersionNo: number | null;
  /** 맞춤본으로 냈으면 true(작업 공간 결과 포함) */
  tailored: boolean;
  /** 기본 서류 그대로 냈으면 그 직무 이름 */
  resumeKitTrack: string | null;
  /** 낸 이력서 파일 이름(기록에 있으면). 기본 이력서 버전이 없을 때 라벨로 쓴다 */
  resumeDocFile: string | null;
  /** 거친 단계(상태 이력 기준). 지금 상태가 지원이면 비어 있다 */
  reached: ReachedStage[];
};

export type SearchQuery = {
  text?: string;
  status?: ApplicationStatus;
  site?: SiteId;
  from?: string;
  to?: string;
};

export function searchApplications(
  q: SearchQuery,
  db: Db = getDb(),
  reachedById: Map<number, ApplicationStatus[]> = listReachedHistory(db),
): DashboardRow[] {
  const conds = [];
  if (q.site) conds.push(eq(applications.site, q.site));
  if (q.from) conds.push(gte(applications.appliedAt, q.from));
  if (q.to) conds.push(lte(applications.appliedAt, q.to));

  const base = db
    .select({ a: applications, companyName: companies.displayName })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applicationOrder)
    .all();

  const reachedOf = (a: { id: number; status: ApplicationStatus }) => reachedStages(a.status, reachedById.get(a.id) ?? []);

  const text = q.text?.trim();
  let matchedCompanyIds: Set<number> | null = null;
  if (text) {
    const key = normalizeCompanyName(text);
    matchedCompanyIds = new Set(
      key
        ? db
            .select({ id: companyKeys.companyId })
            .from(companyKeys)
            .where(like(companyKeys.key, `%${key}%`))
            .all()
            .map((r) => r.id)
        : [],
    );
  }
  const lowered = text?.toLowerCase();
  const filtered = base.filter(
    ({ a }) =>
      (!q.status || matchesStatusFilter(q.status, a.status, reachedOf(a))) &&
      (!text || matchedCompanyIds!.has(a.companyId) || a.positionTitle.toLowerCase().includes(lowered!)),
  );

  const fitByPosting = new Map<number, number>();
  for (const r of db
    .select({ postingId: analyses.postingId, fitScore: analyses.fitScore })
    .from(analyses)
    .orderBy(desc(analyses.id))
    .all()) {
    if (!fitByPosting.has(r.postingId)) fitByPosting.set(r.postingId, r.fitScore);
  }
  const versionNoById = new Map(
    db.select({ id: resumeVersions.id, no: resumeVersions.versionNo }).from(resumeVersions).all().map((r) => [r.id, r.no]),
  );
  const revisions = listRevisionLabels(db);

  return filtered.map(({ a, companyName }) => {
    const sr = a.submittedResume;
    const versionNo = sr && sr.kind === 'base' ? (versionNoById.get(sr.versionId) ?? null) : null;
    const resumeDocFile = docFileOf(a.submittedDocs?.resume);
    const rev = sr.kind === 'tailored' ? revisions.get(sr.tailoredRevisionId) : undefined;
    return {
      applicationId: a.id,
      postingId: a.postingId,
      companyId: a.companyId,
      companyName,
      positionTitle: a.positionTitle,
      site: a.site,
      siteNote: a.siteNote,
      appliedAt: a.appliedAt,
      status: a.status,
      interviewRound: a.interviewRound,
      fitScore: a.postingId != null ? (fitByPosting.get(a.postingId) ?? null) : null,
      // 예전 기록(base)인데 버전 행이 없으면 파일 라벨(없으면 모름)로
      resumeLabel:
        sr.kind === 'base' && versionNo == null
          ? resumeDocFile
            ? docLabel(resumeDocFile)
            : null
          : resumeLabel(sr, a.submittedDocs, { revNo: rev?.revNo, profile: rev?.profileId, profileName: rev?.profileName, versionNo }, 'short'),
      resumeBaseVersionNo: versionNo,
      tailored: sr.kind === 'tailored',
      resumeKitTrack: sr.kind === 'kit' ? sr.track : null,
      resumeDocFile,
      reached: [...reachedOf(a)],
    };
  });
}

export type DashboardGroup = {
  key: string;
  label: string;
  rows: DashboardRow[];
  /** 통계 화면과 같은 결과 분류·비율(D-18) */
  tally: Tally;
};

function makeGroup(key: string, label: string, rows: DashboardRow[], today: string): DashboardGroup {
  return {
    key,
    label,
    rows,
    tally: tally(rows.map((r) => classifyOutcome({ status: r.status, appliedAt: r.appliedAt, reached: r.reached }, today))),
  };
}

export function groupDashboardRows(
  rows: DashboardRow[],
  by: 'site' | 'status' | 'resume',
  today: string,
): DashboardGroup[] {
  if (by === 'site') {
    return SITE_IDS.map((s) =>
      makeGroup(s, SITE_LABELS[s], rows.filter((r) => r.site === s), today),
    ).filter((g) => g.rows.length > 0);
  }
  if (by === 'status') {
    const cols: { key: string; label: string; match: ApplicationStatus[] }[] = [
      { key: 'applied', label: STATUS_LABELS.applied, match: ['applied'] },
      { key: 'document_passed', label: STATUS_LABELS.document_passed, match: ['document_passed'] },
      { key: 'assignment', label: STATUS_LABELS.assignment, match: ['assignment'] },
      { key: 'interview', label: STATUS_LABELS.interview, match: ['interview'] },
      { key: 'final_passed', label: STATUS_LABELS.final_passed, match: ['final_passed'] },
      { key: 'closed', label: '종료', match: ['rejected', 'withdrawn'] },
    ];
    return cols.map((c) => makeGroup(c.key, c.label, rows.filter((r) => c.match.includes(r.status)), today));
  }
  // 이력서별: 맞춤 이력서 → 기본 서류 {직무} → 기본 v{n}(번호 큰 순) → 이력서 파일(날짜 늦은 순) → 모름
  const groups: DashboardGroup[] = [];
  const tailored = rows.filter((r) => r.tailored);
  if (tailored.length > 0) groups.push(makeGroup('tailored', '맞춤 이력서', tailored, today));
  const tracks = [...new Set(rows.map((r) => r.resumeKitTrack).filter((t): t is string => t != null))].sort((x, y) => x.localeCompare(y, 'ko'));
  for (const t of tracks) groups.push(makeGroup(`kit:${t}`, `기본 서류 ${t}`, rows.filter((r) => r.resumeKitTrack === t), today));
  const rest = rows.filter((r) => !r.tailored && r.resumeKitTrack == null);
  const versions = [...new Set(rest.map((r) => r.resumeBaseVersionNo).filter((v): v is number => v != null))].sort((x, y) => y - x);
  for (const v of versions) groups.push(makeGroup(`v${v}`, `기본 v${v}`, rest.filter((r) => r.resumeBaseVersionNo === v), today));
  const files = [
    ...new Set(rest.filter((r) => r.resumeBaseVersionNo == null).map((r) => r.resumeDocFile).filter((f): f is string => f != null)),
  ].sort((x, y) => (x < y ? 1 : x > y ? -1 : 0)); // 파일 이름의 날짜(YYYYMMDD)가 늦은 순
  for (const f of files) {
    groups.push(makeGroup(`doc:${f}`, docLabel(f), rest.filter((r) => r.resumeBaseVersionNo == null && r.resumeDocFile === f), today));
  }
  const unknown = rest.filter((r) => r.resumeBaseVersionNo == null && r.resumeDocFile == null);
  if (unknown.length > 0) groups.push(makeGroup('none', '모름', unknown, today));
  return groups;
}

export function getDashboardStats(
  now: Date = new Date(),
  db: Db = getDb(),
  reachedById: Map<number, ApplicationStatus[]> = listReachedHistory(db),
): {
  appliedThisMonth: number;
  byStatus: Record<ApplicationStatus, number>;
  bySite: Record<SiteId, number>;
  analyzedNotApplied: number;
  /** 거친 단계별 기록 수(서류합격·면접·최종합격 필터 결과 수와 같다). byStatus는 지금 상태 기준 */
  reachedCounts: Record<ReachedStage, number>;
} {
  const month = monthLocal(now);
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  const bySite = Object.fromEntries(SITE_IDS.map((s) => [s, 0])) as Record<SiteId, number>;
  const reachedCounts: Record<ReachedStage, number> = { document_passed: 0, assignment: 0, interview: 0, final_passed: 0 };
  let appliedThisMonth = 0;
  for (const a of db.select().from(applications).all()) {
    byStatus[a.status] += 1;
    for (const r of reachedStages(a.status, reachedById.get(a.id) ?? [])) reachedCounts[r] += 1;
    bySite[a.site] += 1;
    if (a.appliedAt.startsWith(month)) appliedThisMonth += 1;
  }
  return { appliedThisMonth, byStatus, bySite, analyzedNotApplied: listAnalyzedNotApplied(db).length, reachedCounts };
}

export type RecordExtra = ReturnType<typeof listRecordExtras> extends Map<number, infer V> ? V : never;

/**
 * 대시보드 한 번 열기: 목록, 요약 통계, 공고 없는 기록의 메모·제출 서류·상태 이력.
 * 조회 횟수는 기록 수와 관계없이 일정하다(상태 이력 조회를 목록과 통계가 함께 쓴다).
 */
export function loadDashboard(
  q: SearchQuery,
  now: Date = new Date(),
  db: Db = getDb(),
  /** 상세(메모·서류·이력)를 읽을 행. 기본은 모든 행. 페이지 나누기를 쓰면 보이는 행만 넘긴다 */
  pick?: (rows: DashboardRow[]) => DashboardRow[],
): { rows: DashboardRow[]; stats: ReturnType<typeof getDashboardStats>; extras: Map<number, RecordExtra> } {
  const reachedById = listReachedHistory(db);
  const rows = searchApplications(q, db, reachedById);
  const stats = getDashboardStats(now, db, reachedById);
  const extras = listRecordExtras((pick ? pick(rows) : rows).filter((r) => r.postingId == null).map((r) => r.applicationId), db);
  return { rows, stats, extras };
}
