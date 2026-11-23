import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, resumeVersions } from '@/lib/db/schema';
import { todayLocal } from '@/lib/domain/dates';
import type { ApplicationStatus, SiteId } from '@/lib/domain/types';
import { listReachedHistory } from '@/lib/applications/repo';
import { reachedStages, type ReachedStage } from '@/lib/applications/stages';
import type { DocKind } from '@/lib/documents/files';
import { listRevisionLabels } from '@/lib/tailored/repo';
import {
  byDocVersion,
  byPeriod,
  byProfile,
  bySite,
  byWeekday,
  funnel,
  tailoredCompare,
  type DocBucket,
  type FunnelStep,
  type PeriodBucket,
  type ProfileRow,
  type SiteBucket,
  type TailoredCompare,
  type WeekdayBucket,
} from './aggregate';
import { classifyOutcome, type Outcome } from './outcome';
import { tally, type Tally } from './rates';

export type { DocKind };

export type StatItem = {
  applicationId: number;
  companyId: number;
  site: SiteId;
  appliedAt: string;
  status: ApplicationStatus;
  reached: ReachedStage[];
  outcome: Outcome;
  /** submitted_resume.kind === 'base'일 때 기본 이력서 버전 번호 */
  baseVersionNo: number | null;
  /** submitted_resume.kind === 'tailored'(작업 공간 결과 리비전 포함) */
  tailored: boolean;
  /** 프로필: 맞춤본이면 그 리비전의, 기본 서류 그대로면 기록의. 파일·모름·예전 기록은 null */
  profile: { id: string; name: string } | null;
  /** 기본 서류 그대로(kit) 냈으면 그 직무 */
  kitTrack: string | null;
  docs: Record<DocKind, string | null>;
};

/** 지원일 기준, 양끝 포함 */
export type StatsQuery = { site?: SiteId; from?: string; to?: string };

/** 지원 기록(사이트·기간 조건) + 상태 이력 + 기본 이력서 버전 + 맞춤본 프로필. 쿼리 4회. */
export function loadStatItems(q: StatsQuery, now: Date = new Date(), db: Db = getDb()): StatItem[] {
  const today = todayLocal(now);
  const conds = [];
  if (q.site) conds.push(eq(applications.site, q.site));
  if (q.from) conds.push(gte(applications.appliedAt, q.from));
  if (q.to) conds.push(lte(applications.appliedAt, q.to));
  const apps = db.select().from(applications).where(conds.length ? and(...conds) : undefined).all();
  const history = listReachedHistory(db);
  const versionNoById = new Map(
    db.select({ id: resumeVersions.id, no: resumeVersions.versionNo }).from(resumeVersions).all().map((r) => [r.id, r.no]),
  );
  const revisions = listRevisionLabels(db);
  return apps.map((a) => {
    const reached = [...reachedStages(a.status, history.get(a.id) ?? [])];
    const sr = a.submittedResume;
    const rev = sr.kind === 'tailored' ? revisions.get(sr.tailoredRevisionId) : undefined;
    return {
      applicationId: a.id,
      companyId: a.companyId,
      site: a.site,
      appliedAt: a.appliedAt,
      status: a.status,
      reached,
      outcome: classifyOutcome({ status: a.status, appliedAt: a.appliedAt, reached }, today),
      baseVersionNo: sr && sr.kind === 'base' ? (versionNoById.get(sr.versionId) ?? null) : null,
      tailored: sr.kind === 'tailored',
      profile: rev ? { id: rev.profileId, name: rev.profileName } : sr.kind === 'kit' ? { id: sr.profileId, name: sr.profileName } : null,
      kitTrack: sr.kind === 'kit' ? sr.track : null,
      docs: {
        resume: a.submittedDocs?.resume ?? null,
        career: a.submittedDocs?.career ?? null,
        portfolio: a.submittedDocs?.portfolio ?? null,
      },
    };
  });
}

export type StatsData = {
  /** 필터와 관계없이 지원 기록 0건 */
  isEmptyAll: boolean;
  firstMonth: string | null;
  lastMonth: string | null;
  /** assignment·interview·final: 그 단계를 거친 수 */
  summary: Tally & { assignment: number; interview: number; final: number };
  periods: PeriodBucket[];
  docs: DocBucket[];
  sites: SiteBucket[];
  funnel: FunnelStep[];
  weekdays: WeekdayBucket[];
  /** 맞춤본 기록이 없으면 null */
  tailoredCompare: TailoredCompare | null;
  byProfile: ProfileRow[];
};

export function getStats(
  p: { query: StatsQuery; unit: 'month' | 'year'; doc: DocKind },
  now: Date = new Date(),
  db: Db = getDb(),
): StatsData {
  const items = loadStatItems(p.query, now, db);
  const today = todayLocal(now);
  const isEmptyAll = db.select({ id: applications.id }).from(applications).limit(1).get() == null;
  const months = items.map((i) => i.appliedAt.slice(0, 7)).sort();
  const reachedN = (s: ReachedStage) => items.filter((i) => i.reached.includes(s)).length;
  return {
    isEmptyAll,
    firstMonth: months[0] ?? null,
    lastMonth: months[months.length - 1] ?? null,
    summary: {
      ...tally(items.map((i) => i.outcome)),
      assignment: reachedN('assignment'),
      interview: reachedN('interview'),
      final: reachedN('final_passed'),
    },
    periods: byPeriod(items, p.unit, { from: p.query.from, to: p.query.to }, today),
    docs: byDocVersion(items, p.doc),
    sites: bySite(items),
    funnel: funnel(items),
    weekdays: byWeekday(items),
    tailoredCompare: tailoredCompare(items),
    byProfile: byProfile(items),
  };
}
