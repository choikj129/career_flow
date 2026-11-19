import { and, desc, eq, gte, like, lte } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { analyses, applications, companies, companyKeys, resumeVersions } from '@/lib/db/schema';
import { monthLocal } from '@/lib/domain/dates';
import { applicationOrder } from '@/lib/applications/sort';
import { docLabel } from '@/lib/documents/files';
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
  /** 낸 이력서 파일 이름(기록에 있으면). 기본 이력서 버전이 없을 때 라벨로 쓴다 */
  resumeDocFile: string | null;
};

export type SearchQuery = {
  text?: string;
  status?: ApplicationStatus;
  site?: SiteId;
  from?: string;
  to?: string;
};

export function searchApplications(q: SearchQuery, db: Db = getDb()): DashboardRow[] {
  const conds = [];
  if (q.status) conds.push(eq(applications.status, q.status));
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
      !text || matchedCompanyIds!.has(a.companyId) || a.positionTitle.toLowerCase().includes(lowered!),
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

  return filtered.map(({ a, companyName }) => {
    const sr = a.submittedResume;
    const versionNo = sr && sr.kind === 'base' ? (versionNoById.get(sr.versionId) ?? null) : null;
    const resumeDocFile = a.submittedDocs?.resume ?? null;
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
      resumeLabel: versionNo != null ? `기본 v${versionNo}` : resumeDocFile ? docLabel(resumeDocFile) : null,
      resumeBaseVersionNo: versionNo,
      resumeDocFile,
    };
  });
}

export type DashboardGroup = {
  key: string;
  label: string;
  rows: DashboardRow[];
  passed: number;
  decided: number;
};

const PASSED: ApplicationStatus[] = ['document_passed', 'interview', 'final_passed'];
const UNDECIDED: ApplicationStatus[] = ['applied', 'withdrawn'];

function makeGroup(key: string, label: string, rows: DashboardRow[]): DashboardGroup {
  return {
    key,
    label,
    rows,
    passed: rows.filter((r) => PASSED.includes(r.status)).length,
    decided: rows.filter((r) => !UNDECIDED.includes(r.status)).length,
  };
}

export function groupDashboardRows(rows: DashboardRow[], by: 'site' | 'status' | 'resume'): DashboardGroup[] {
  if (by === 'site') {
    return SITE_IDS.map((s) =>
      makeGroup(s, SITE_LABELS[s], rows.filter((r) => r.site === s)),
    ).filter((g) => g.rows.length > 0);
  }
  if (by === 'status') {
    const cols: { key: string; label: string; match: ApplicationStatus[] }[] = [
      { key: 'applied', label: STATUS_LABELS.applied, match: ['applied'] },
      { key: 'document_passed', label: STATUS_LABELS.document_passed, match: ['document_passed'] },
      { key: 'interview', label: STATUS_LABELS.interview, match: ['interview'] },
      { key: 'final_passed', label: STATUS_LABELS.final_passed, match: ['final_passed'] },
      { key: 'closed', label: '종료', match: ['rejected', 'withdrawn'] },
    ];
    return cols.map((c) => makeGroup(c.key, c.label, rows.filter((r) => c.match.includes(r.status))));
  }
  const versions = [
    ...new Set(rows.map((r) => r.resumeBaseVersionNo).filter((v): v is number => v != null)),
  ].sort((a, b) => b - a);
  const groups = versions.map((v) =>
    makeGroup(`v${v}`, `기본 v${v}`, rows.filter((r) => r.resumeBaseVersionNo === v)),
  );
  const files = [
    ...new Set(rows.filter((r) => r.resumeBaseVersionNo == null).map((r) => r.resumeDocFile).filter((f): f is string => f != null)),
  ].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // 파일 이름의 날짜(YYYYMMDD)가 늦은 순
  for (const f of files) {
    groups.push(makeGroup(`doc:${f}`, docLabel(f), rows.filter((r) => r.resumeBaseVersionNo == null && r.resumeDocFile === f)));
  }
  const unknown = rows.filter((r) => r.resumeBaseVersionNo == null && r.resumeDocFile == null);
  if (unknown.length > 0) groups.push(makeGroup('none', '모름', unknown));
  return groups;
}

export function getDashboardStats(
  now: Date = new Date(),
  db: Db = getDb(),
): {
  appliedThisMonth: number;
  byStatus: Record<ApplicationStatus, number>;
  bySite: Record<SiteId, number>;
  analyzedNotApplied: number;
} {
  const month = monthLocal(now);
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  const bySite = Object.fromEntries(SITE_IDS.map((s) => [s, 0])) as Record<SiteId, number>;
  let appliedThisMonth = 0;
  for (const a of db.select().from(applications).all()) {
    byStatus[a.status] += 1;
    bySite[a.site] += 1;
    if (a.appliedAt.startsWith(month)) appliedThisMonth += 1;
  }
  return { appliedThisMonth, byStatus, bySite, analyzedNotApplied: listAnalyzedNotApplied(db).length };
}
