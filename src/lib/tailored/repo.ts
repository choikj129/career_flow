import { and, desc, eq, inArray, lte, ne } from 'drizzle-orm';
import { enqueueJob, latestJobFor, type JobSummary } from '@/lib/ai/queue';
import { getCompany } from '@/lib/companies/repo';
import { getDb, type Db } from '@/lib/db/client';
import { companies, tailoredResumes, tailoredRevisions } from '@/lib/db/schema';
import { assemble, type Recipe } from '@/lib/kit/assemble';
import { checkTailored } from '@/lib/kit/checks';
import { getKit, getLatestKit, getUsableKit, readKitDoc, readKitText, type KitRow } from '@/lib/kit/repo';
import type { KitParsed, KitWarning } from '@/lib/kit/types';
import { getPosting } from '@/lib/postings/repo';
import { REVISION_REQUEST_MAX } from './limits';

export type TailoredRevision = typeof tailoredRevisions.$inferSelect;
export type RevisionSummary = Pick<
  TailoredRevision,
  'id' | 'revNo' | 'source' | 'profileId' | 'profileName' | 'userRequest' | 'kitId' | 'createdAt'
>;

const now = () => new Date().toISOString();

export function getTailoredForPosting(postingId: number, db: Db = getDb()): { id: number; postingId: number; createdAt: string } | null {
  return db.select().from(tailoredResumes).where(eq(tailoredResumes.postingId, postingId)).get() ?? null;
}

export function getRevision(id: number, db: Db = getDb()): TailoredRevision | null {
  return db.select().from(tailoredRevisions).where(eq(tailoredRevisions.id, id)).get() ?? null;
}

/** 이 공고의 리비전, 최신순 */
export function listRevisionsForPosting(postingId: number, db: Db = getDb()): RevisionSummary[] {
  const t = getTailoredForPosting(postingId, db);
  if (!t) return [];
  return db
    .select({
      id: tailoredRevisions.id,
      revNo: tailoredRevisions.revNo,
      source: tailoredRevisions.source,
      profileId: tailoredRevisions.profileId,
      profileName: tailoredRevisions.profileName,
      userRequest: tailoredRevisions.userRequest,
      kitId: tailoredRevisions.kitId,
      createdAt: tailoredRevisions.createdAt,
    })
    .from(tailoredRevisions)
    .where(eq(tailoredRevisions.tailoredResumeId, t.id))
    .orderBy(desc(tailoredRevisions.revNo))
    .all();
}

/** 리비전이 속한 공고의 회사 표시 이름(내려받기 파일 이름용). 회사가 없으면 null */
export function revisionCompanyName(revisionId: number, db: Db = getDb()): string | null {
  const postingId = revisionPostingId(revisionId, db);
  const companyId = postingId != null ? getPosting(postingId, db)?.companyId : null;
  return companyId != null ? (getCompany(companyId, db)?.displayName ?? null) : null;
}

/** 리비전이 속한 공고 id. 없으면 null */
export function revisionPostingId(revisionId: number, db: Db = getDb()): number | null {
  const row = db
    .select({ postingId: tailoredResumes.postingId })
    .from(tailoredRevisions)
    .innerJoin(tailoredResumes, eq(tailoredRevisions.tailoredResumeId, tailoredResumes.id))
    .where(eq(tailoredRevisions.id, revisionId))
    .get();
  return row?.postingId ?? null;
}

export type NewRevision = {
  postingId: number;
  kitId: number;
  track: string;
  profileId: string;
  profileName: string;
  adjustments: { id: string; label: string }[];
  source: 'recipe' | 'terms' | 'revise' | 'external';
  resumeMd: string;
  careerMd: string;
  pendingAdjustments: string[];
  changeReasons: { doc: 'resume' | 'career'; after: string; reason: string }[];
  warnings: KitWarning[];
  notes: string;
  userRequest?: string | null;
  jobId?: number | null;
};

/** 리비전을 더한다. 공고의 맞춤 묶음이 없으면 만들고, 번호는 1부터 센다. */
export function addRevision(input: NewRevision, db: Db = getDb()): { id: number; revNo: number } {
  return db.transaction((tx) => {
    let t = tx.select().from(tailoredResumes).where(eq(tailoredResumes.postingId, input.postingId)).get();
    if (!t) {
      t = tx
        .insert(tailoredResumes)
        .values({ postingId: input.postingId, createdAt: now() })
        .returning()
        .get();
    }
    const last = tx
      .select({ revNo: tailoredRevisions.revNo })
      .from(tailoredRevisions)
      .where(eq(tailoredRevisions.tailoredResumeId, t.id))
      .orderBy(desc(tailoredRevisions.revNo))
      .limit(1)
      .get();
    const revNo = (last?.revNo ?? 0) + 1;
    const { postingId: _postingId, userRequest, jobId, ...rest } = input;
    void _postingId;
    const row = tx
      .insert(tailoredRevisions)
      .values({ ...rest, tailoredResumeId: t.id, revNo, userRequest: userRequest ?? null, jobId: jobId ?? null, createdAt: now() })
      .returning({ id: tailoredRevisions.id })
      .get();
    return { id: row.id, revNo };
  });
}


export { REVISION_REQUEST_MAX };

/** 이 공고의 가장 최근 리비전(전체 행) */
export function getLatestRevision(postingId: number, db: Db = getDb()): TailoredRevision | null {
  const top = listRevisionsForPosting(postingId, db)[0];
  return top ? getRevision(top.id, db) : null;
}

/** 오류 없는 키트와 레시피를 확인하고 기본 서류를 읽는다. 문제가 있으면 사용자용 메시지로 예외 */
function resolveRecipe(recipe: Recipe, db: Db) {
  const kit = getUsableKit(db);
  if (!kit) {
    throw new Error(
      getLatestKit(db)
        ? '서류 키트에 오류가 있습니다. 기본 이력서 > 서류 키트에서 오류를 고쳐 다시 올리세요'
        : '서류 키트를 먼저 올리세요 → 기본 이력서 > 서류 키트',
    );
  }
  const { tracks, profiles, adjustments } = kit.parsed;
  const track = tracks.find((t) => t.name === recipe.track);
  const profile = profiles.find((p) => p.track === recipe.track && p.id === recipe.profileId);
  if (!track || !profile) throw new Error('그 직무·프로필이 키트에 없습니다');
  const picked = recipe.adjustmentIds.map((id) => {
    const a = adjustments.find((x) => x.id === id && (x.track === '' || x.track === track.name));
    if (!a) throw new Error('그 추가 조정이 키트에 없습니다');
    return { id: a.id, label: a.label };
  });
  const base = {
    resumeMd: readKitDoc(kit.id, track.name, 'resume', db),
    careerMd: readKitDoc(kit.id, track.name, 'career', db),
  };
  return { kit, track, profile, picked, base };
}

/** 1단계 조립. 작업 큐 없이 바로 저장한다(호출 0). 키트가 없거나 오류면 예외 */
export function createRecipeRevision(postingId: number, recipe: Recipe, db: Db = getDb()): { id: number; revNo: number } {
  if (!getPosting(postingId, db)) throw new Error('공고를 찾을 수 없습니다');
  const { kit, track, profile, picked, base } = resolveRecipe(recipe, db);
  const out = assemble(kit.parsed, base, recipe);
  return addRevision(
    {
      postingId,
      kitId: kit.id,
      track: track.name,
      profileId: profile.id,
      profileName: profile.name,
      adjustments: picked,
      source: 'recipe',
      resumeMd: out.resumeMd,
      careerMd: out.careerMd,
      pendingAdjustments: out.pending,
      changeReasons: [],
      warnings: [],
      notes: '',
    },
    db,
  );
}

/** 이 공고 회사 말고 DB에 있는 다른 회사 이름들(자동 검사의 "다른 회사 이름" 찾기용) */
export function otherCompanyNames(postingId: number, db: Db = getDb()): string[] {
  const companyId = getPosting(postingId, db)?.companyId;
  return db
    .select({ displayName: companies.displayName, legalName: companies.legalName })
    .from(companies)
    .where(companyId == null ? undefined : ne(companies.id, companyId))
    .all()
    .flatMap((c) => [c.displayName, c.legalName])
    .filter((n): n is string => !!n);
}

export const EXTERNAL_MD_MAX_BYTES = 1024 * 1024;

/**
 * 이력서 작업 공간에서 만든 결과 md를 올려 새 리비전(source 'external')으로 남긴다(Task 9, D-30 a).
 * 자동 검사는 하되 자기소개를 되돌리지 않고(intro_changed 경고만) 구조 변경도 경고로만 둔다. 남은 추가 조정은 없다(작업 공간이 맡았다).
 */
export function addExternalRevision(
  postingId: number,
  input: { resumeMd: string; careerMd: string; recipe: Recipe; note?: string },
  db: Db = getDb(),
): { id: number; revNo: number } {
  for (const [name, md] of [['이력서.md', input.resumeMd], ['경력기술서.md', input.careerMd]] as const) {
    if (!md.trim()) throw new Error(`${name}가 비어 있습니다`);
    if (Buffer.byteLength(md, 'utf8') > EXTERNAL_MD_MAX_BYTES) throw new Error(`${name}는 1MB까지 올릴 수 있습니다`);
  }
  if (!getPosting(postingId, db)) throw new Error('공고를 찾을 수 없습니다');
  const { kit, track, profile, picked, base } = resolveRecipe(input.recipe, db);
  const stage1 = assemble(kit.parsed, base, input.recipe);
  const checked = checkTailored({
    kit: kit.parsed,
    stage1,
    final: { resumeMd: input.resumeMd, careerMd: input.careerMd },
    base,
    masterMd: readKitText(kit.id, 'master', db),
    otherCompanyNames: otherCompanyNames(postingId, db),
    restoreIntro: false,
  });
  return addRevision(
    {
      postingId,
      kitId: kit.id,
      track: track.name,
      profileId: profile.id,
      profileName: profile.name,
      adjustments: picked,
      source: 'external',
      resumeMd: checked.final.resumeMd,
      careerMd: checked.final.careerMd,
      pendingAdjustments: [],
      changeReasons: [],
      warnings: checked.warnings,
      notes: input.note?.trim() ?? '',
    },
    db,
  );
}

const TAILOR_JOBS = ['tailor_resume', 'revise_tailored'] as const;
const newest = (jobs: (JobSummary | undefined)[]) =>
  jobs.filter((j): j is JobSummary => j != null).sort((a, b) => b.id - a.id)[0];

/** 대기·실행 중인 맞춤 작업(용어 맞추기·다듬기). 상태 필터로 SQL에서 찾는다 */
export function activeTailorJob(postingId: number, db: Db = getDb()): JobSummary | undefined {
  return newest(TAILOR_JOBS.map((t) => latestJobFor(t, () => true, db, { postingId, statuses: ['queued', 'running'] })));
}

/** 가장 최근 맞춤 작업(상태 무관) */
export function latestTailorJob(postingId: number, db: Db = getDb()): JobSummary | undefined {
  return newest(TAILOR_JOBS.map((t) => latestJobFor(t, () => true, db, { postingId })));
}

const NO_TAILORED = '먼저 맞춤본을 조립하세요';

/** 2단계. 최신 리비전의 레시피로 tailor_resume 작업을 만든다. 진행 중이면 그 jobId */
export function requestTermsMatch(postingId: number, db: Db = getDb()): number {
  const latest = listRevisionsForPosting(postingId, db)[0];
  if (!latest) throw new Error(NO_TAILORED);
  const active = activeTailorJob(postingId, db);
  if (active) return active.id;
  return enqueueJob('tailor_resume', { postingId, revisionId: latest.id }, db);
}

/** 다듬기(D-11 새 실행). 최신 리비전과 요청으로 revise_tailored 작업을 만든다 */
export function requestTailoredRevision(postingId: number, request: string, db: Db = getDb()): number {
  const text = request.trim();
  if (!text) throw new Error('다듬을 내용을 입력하세요');
  if (text.length > REVISION_REQUEST_MAX) throw new Error(`요청은 ${REVISION_REQUEST_MAX}자까지 쓸 수 있습니다`);
  if (!listRevisionsForPosting(postingId, db)[0]) throw new Error(NO_TAILORED);
  if (activeTailorJob(postingId, db)) throw new Error('진행 중인 맞춤 작업이 끝난 뒤에 요청하세요');
  return enqueueJob('revise_tailored', { postingId, request: text }, db);
}

export type RevisionBase = {
  kit: KitRow & { parsed: KitParsed };
  /** 키트의 기본 서류 */
  base: { resumeMd: string; careerMd: string };
  /** 비교 기준: 그 리비전의 레시피로 다시 만든 1단계 결과(작업 공간 결과는 그 리비전 자체) */
  stage1: { resumeMd: string; careerMd: string };
  pending: string[];
  /** 조립본에 적용한 내용(화면 "바뀐 곳"). 작업 공간 결과가 뿌리면 비어 있다 */
  applied: string[];
};

/**
 * 리비전을 만든 키트(그 뒤에 키트가 바뀌었어도 그 키트)와 레시피로 1단계를 다시 만든다. 결정적이다.
 * 뿌리(그 리비전 이전의 가장 가까운 조립본·작업 공간 결과)가 작업 공간 결과이면 그 문서가 기준이다.
 * 작업 공간이 쓴 자기소개를 용어 맞추기·다듬기가 조립본 값으로 되돌리지 않게 하려는 것이다.
 */
export function rebuildStage1(rev: TailoredRevision, db: Db = getDb()): RevisionBase {
  const kit = getKit(rev.kitId, db);
  if (!kit?.parsed) throw new Error('이 맞춤본을 만든 서류 키트를 읽을 수 없습니다');
  const parsed = kit.parsed;
  const base = {
    resumeMd: readKitDoc(kit.id, rev.track, 'resume', db),
    careerMd: readKitDoc(kit.id, rev.track, 'career', db),
  };
  const origin = db
    .select()
    .from(tailoredRevisions)
    .where(
      and(
        eq(tailoredRevisions.tailoredResumeId, rev.tailoredResumeId),
        lte(tailoredRevisions.revNo, rev.revNo),
        inArray(tailoredRevisions.source, ['recipe', 'external']),
      ),
    )
    .orderBy(desc(tailoredRevisions.revNo))
    .limit(1)
    .get();
  if (origin?.source === 'external') {
    return { kit: { ...kit, parsed }, base, stage1: { resumeMd: origin.resumeMd, careerMd: origin.careerMd }, pending: origin.pendingAdjustments, applied: [] };
  }
  const out = assemble(parsed, base, { track: rev.track, profileId: rev.profileId, adjustmentIds: rev.adjustments.map((a) => a.id) });
  return { kit: { ...kit, parsed }, base, stage1: { resumeMd: out.resumeMd, careerMd: out.careerMd }, pending: out.pending, applied: out.applied };
}

/** 모든 리비전의 번호·프로필(본문은 읽지 않는다). 지원 기록의 라벨·통계가 한 번 읽어 쓴다 */
export function listRevisionLabels(db: Db = getDb()): Map<number, { revNo: number; profileId: string; profileName: string }> {
  return new Map(
    db
      .select({
        id: tailoredRevisions.id,
        revNo: tailoredRevisions.revNo,
        profileId: tailoredRevisions.profileId,
        profileName: tailoredRevisions.profileName,
      })
      .from(tailoredRevisions)
      .all()
      .map((r) => [r.id, { revNo: r.revNo, profileId: r.profileId, profileName: r.profileName }]),
  );
}
