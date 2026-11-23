import { getJob, latestJobFor, listActiveJobs, type JobSummary } from '@/lib/ai/queue';
import { AnalysisResult } from '@/lib/ai/tasks/schemas';
import type { Db } from '@/lib/db/client';
import { getDb } from '@/lib/db/client';
import { formatDateTime } from '@/lib/domain/dates';
import type { JobType } from '@/lib/domain/types';
import { recommend, type WordCount } from '@/lib/kit/recommend';
import { getKit, getLatestKit, getUsableKit } from '@/lib/kit/repo';
import type { KitWarning } from '@/lib/kit/types';
import { getLatestAnalysis, getPosting } from '@/lib/postings/repo';
import { handoffReasons, NOTICE_KINDS, type HandoffReason } from './handoff';
import {
  activeTailorJob,
  getRevision,
  latestTailorJob,
  listRevisionsForPosting,
  rebuildStage1,
  revisionPostingId,
  type RevisionSummary,
  type TailoredRevision,
} from './repo';

// 맞춤 이력서 탭이 읽는 값을 한곳에서 모은다(화면 문서 3.4). 서버 전용이다.

/** "키트 v5"처럼 보일 이름. 라벨이 이미 "키트"로 시작하면 그대로 */
export function kitDisplayName(id: number, label: string): string {
  return label.startsWith('키트') ? label : `키트 ${id} (${label})`;
}

export type PickerProfile = {
  id: string;
  name: string;
  isDefault: boolean;
  /** AI 추천도(0~100). 단어 수 기준이면 null */
  percent: number | null;
  /** AI가 든 근거 단어(공고에 있는 것만) 또는 단어 수 기준일 때 일치한 공고 단어 */
  keywords: string[];
  reason: string;
  words: WordCount[];
  recommended: boolean;
};
export type PickerAdjustment = { id: string; label: string; suggested: boolean; keywords: string[] };
export type PickerTrack = { profiles: PickerProfile[]; adjustments: PickerAdjustment[] };
export type Picker = {
  basis: 'ai' | 'ai_old_kit' | 'words';
  basisLabel: string;
  tracks: string[];
  track: string;
  trackReason: string;
  byTrack: Record<string, PickerTrack>;
  topWords: WordCount[];
};

/** 맨 위 "지원 서류" 카드(프로필 PDF 그대로 받기)가 쓰는 값 */
export type ApplyDocs = {
  kitId: number;
  /** AI 추천을 쓰는지(추천 1순위를 처음 값으로 고르고 "추천" 표시) */
  aiBased: boolean;
  initialProfileId: string;
  groups: { track: string; profiles: { id: string; name: string; percent: number | null; recommended: boolean }[] }[];
};

/** 처음 값: AI 추천이 있으면 그 1순위 프로필, 없으면 직무 기본 프로필 */
export function buildApplyDocs(kitId: number, picker: Picker): ApplyDocs {
  const aiBased = picker.basis === 'ai';
  const groups = picker.tracks.map((track) => ({
    track,
    profiles: (picker.byTrack[track]?.profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      percent: aiBased && picker.byTrack[track] && track === picker.track ? p.percent : null,
      recommended: aiBased && track === picker.track && p.recommended,
    })),
  }));
  const mine = picker.byTrack[picker.track]?.profiles ?? [];
  const initial = (aiBased ? mine.find((p) => p.recommended) : undefined) ?? mine.find((p) => p.isDefault) ?? mine[0];
  return { kitId, aiBased, initialProfileId: initial?.id ?? groups.flatMap((g) => g.profiles)[0]?.id ?? '', groups };
}

const CHECK_LABELS: { label: string; kinds: KitWarning['kind'][] }[] = [
  { label: '새 수치', kinds: ['new_number', 'new_fact_from_master'] },
  { label: '쓰면 안 되는 표현', kinds: ['forbidden_term'] },
  { label: '자기소개', kinds: ['intro_restored', 'intro_changed'] },
  { label: '기술 스택', kinds: ['stack_changed'] },
  { label: '구조(제목·성과 수·장 순서)', kinds: ['structure_changed'] },
  { label: '다른 회사 이름', kinds: ['other_company'] },
];

export type RevisionView = {
  id: number;
  revNo: number;
  source: TailoredRevision['source'];
  createdAt: string;
  track: string;
  profileId: string;
  profileName: string;
  adjustments: { id: string; label: string }[];
  userRequest: string | null;
  notes: string;
  kitId: number;
  kitName: string;
  resumeMd: string;
  careerMd: string;
  stage1ResumeMd: string;
  stage1CareerMd: string;
  applied: string[];
  pending: string[];
  changeReasons: TailoredRevision['changeReasons'];
  /** 확인이 필요한 경고 */
  confirm: KitWarning[];
  /** 알림(새로 넣은 사실, 자기소개 되돌림) */
  notices: KitWarning[];
  /** 자동 검사 줄. 조립본(source 'recipe')은 검사를 하지 않아 null */
  checks: { label: string; count: number }[] | null;
  checklist: string[];
  /** 이 리비전을 만든 키트가 지금 쓰는 키트와 다르면 */
  kitChanged: { was: string; now: string } | null;
};

export type JobInfo = { id: number; type: JobType; status: 'queued' | 'running'; startedAt: string | null; createdAt: string; queuePosition: number | null };
export type FailedJob = { id: number; type: JobType; errorKind: JobSummary['errorKind']; errorMessage: string | null; request: string | null };

export type TailorView =
  | { state: 'no_kit' }
  | { state: 'kit_errors'; errorCount: number }
  | {
      state: 'ready';
      kit: { id: number; name: string };
      applyDocs: ApplyDocs;
      /** 가장 최근 키트에 오류가 있어 이전 키트를 쓸 때의 안내 */
      staleKitNote: string | null;
      hasText: boolean;
      picker: Picker;
      revisions: RevisionSummary[];
      selected: RevisionView | null;
      isLatest: boolean;
      analysisJob: JobInfo | null;
      tailorJob: JobInfo | null;
      failed: FailedJob | null;
      handoff: { reasons: HandoffReason[]; topFitPercent: number | null };
    };

function jobInfo(job: { id: number; type: JobType; status: string; startedAt: string | null; createdAt: string } | undefined, db: Db): JobInfo | null {
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    startedAt: job.startedAt,
    createdAt: job.createdAt,
    queuePosition: job.status === 'queued' ? listActiveJobs(db).filter((j) => j.id < job.id).length + 1 : null,
  };
}

function buildPicker(
  kit: NonNullable<ReturnType<typeof getUsableKit>>,
  posting: { positionTitle: string | null; rawText: string | null },
  analysis: ReturnType<typeof getLatestAnalysis>,
  db: Db,
): { picker: Picker; aiTop: number | null; aiKitSame: boolean } {
  const guide = kit.parsed;
  const text = posting.rawText ?? '';
  const rec = analysis ? AnalysisResult.safeParse(analysis.result).data?.profileRecommendation ?? null : null;
  const aiTrack = rec && guide.tracks.some((t) => t.name === rec.track) ? rec : null;
  const aiKitSame = aiTrack != null && aiTrack.kitId === kit.id;

  const base = recommend(guide, { title: posting.positionTitle, text });
  const track = aiTrack ? aiTrack.track : base.track;
  const trackReason = aiTrack ? aiTrack.trackReason : base.trackReason;

  const byTrack: Record<string, PickerTrack> = {};
  for (const t of guide.tracks) {
    const r = recommend(guide, { title: posting.positionTitle, text }, { track: t.name });
    const useAi = aiTrack != null && aiTrack.track === t.name;
    const mine = guide.profiles.filter((p) => p.track === t.name);
    let profiles: PickerProfile[];
    if (useAi) {
      const ranked = aiTrack.profiles.filter((p) => mine.some((m) => m.id === p.id));
      const rest = mine.filter((m) => !ranked.some((p) => p.id === m.id));
      profiles = [
        ...ranked.map((p, i) => {
          const m = mine.find((x) => x.id === p.id)!;
          return {
            id: p.id,
            name: m.name,
            isDefault: m.isDefault || m.id === t.defaultProfileId,
            percent: p.fitPercent,
            keywords: p.keywords,
            reason: p.reason,
            words: [],
            recommended: i === 0,
          };
        }),
        ...rest.map((m) => ({ id: m.id, name: m.name, isDefault: m.isDefault, percent: 0, keywords: [], reason: '', words: [], recommended: false })),
      ];
    } else {
      profiles = r.profiles.map((p) => {
        const m = mine.find((x) => x.id === p.id)!;
        return {
          id: p.id,
          name: p.name,
          isDefault: m.isDefault || m.id === t.defaultProfileId,
          percent: null,
          keywords: p.matched.map((w) => w.word),
          reason: '',
          words: p.matched,
          recommended: p.recommended,
        };
      });
    }
    const adjustments: PickerAdjustment[] = r.adjustments.map((a) => {
      const ai = useAi ? aiTrack.adjustments.find((x) => x.id === a.id) : undefined;
      return useAi
        ? { id: a.id, label: a.label, suggested: ai?.recommended ?? false, keywords: ai?.keywords ?? [] }
        : { id: a.id, label: a.label, suggested: a.suggested, keywords: a.matched.map((w) => w.word) };
    });
    byTrack[t.name] = { profiles, adjustments };
  }

  const when = analysis ? formatDateTime(analysis.createdAt) : '';
  const basis: Picker['basis'] = aiTrack ? (aiKitSame ? 'ai' : 'ai_old_kit') : 'words';
  const basisLabel =
    basis === 'ai'
      ? `AI 추천 (공고 분석 ${when} · ${kitDisplayName(kit.id, kit.label)})`
      : basis === 'ai_old_kit'
        ? `이전 키트(${getKit(aiTrack!.kitId, db)?.label ?? aiTrack!.kitId}) 기준 AI 추천 (공고 분석 ${when})`
        : '단어 수 기준 추천 (AI 추천 아님)';
  return {
    picker: { basis, basisLabel, tracks: guide.tracks.map((t) => t.name), track, trackReason, byTrack, topWords: base.topWords },
    aiTop: aiKitSame ? (aiTrack!.profiles[0]?.fitPercent ?? null) : null,
    aiKitSame,
  };
}

function revisionView(rev: TailoredRevision, usableKit: { id: number; label: string }, db: Db): RevisionView {
  let stage = { stage1ResumeMd: rev.resumeMd, stage1CareerMd: rev.careerMd, applied: [] as string[], checklist: [] as string[], kitName: kitDisplayName(rev.kitId, getKit(rev.kitId, db)?.label ?? String(rev.kitId)) };
  try {
    const b = rebuildStage1(rev, db);
    stage = {
      stage1ResumeMd: b.stage1.resumeMd,
      stage1CareerMd: b.stage1.careerMd,
      applied: b.applied,
      checklist: b.kit.parsed.checklist,
      kitName: kitDisplayName(b.kit.id, b.kit.label),
    };
  } catch {
    /* 키트 파일을 읽을 수 없으면 비교·적용 내역 없이 본문만 보인다 */
  }
  const confirm = rev.warnings.filter((w) => !NOTICE_KINDS.has(w.kind));
  const notices = rev.warnings.filter((w) => NOTICE_KINDS.has(w.kind));
  return {
    id: rev.id,
    revNo: rev.revNo,
    source: rev.source,
    createdAt: rev.createdAt,
    track: rev.track,
    profileId: rev.profileId,
    profileName: rev.profileName,
    adjustments: rev.adjustments,
    userRequest: rev.userRequest,
    notes: rev.notes,
    kitId: rev.kitId,
    kitName: stage.kitName,
    resumeMd: rev.resumeMd,
    careerMd: rev.careerMd,
    stage1ResumeMd: stage.stage1ResumeMd,
    stage1CareerMd: stage.stage1CareerMd,
    applied: stage.applied,
    pending: rev.pendingAdjustments,
    changeReasons: rev.changeReasons,
    confirm,
    notices,
    checks:
      rev.source === 'recipe'
        ? null
        : CHECK_LABELS.map((c) => ({ label: c.label, count: rev.warnings.filter((w) => c.kinds.includes(w.kind)).length })),
    checklist: stage.checklist,
    kitChanged: rev.kitId !== usableKit.id ? { was: stage.kitName, now: kitDisplayName(usableKit.id, usableKit.label) } : null,
  };
}

/** 맞춤 이력서 탭이 그릴 값. revParam은 `?rev=`로 고른 리비전 id */
export function loadTailorView(postingId: number, revParam: number | null = null, db: Db = getDb()): TailorView {
  const posting = getPosting(postingId, db);
  if (!posting) throw new Error('공고를 찾을 수 없습니다');
  const kit = getUsableKit(db);
  const latestKit = getLatestKit(db);
  if (!kit) {
    return latestKit && latestKit.errors.length > 0 ? { state: 'kit_errors', errorCount: latestKit.errors.length } : { state: 'no_kit' };
  }

  const revisions = listRevisionsForPosting(postingId, db);
  const picked = revParam != null && revisions.some((r) => r.id === revParam) && revisionPostingId(revParam, db) === postingId ? getRevision(revParam, db) : null;
  const selectedRow = picked ?? (revisions[0] ? getRevision(revisions[0].id, db) : null);
  const selected = selectedRow ? revisionView(selectedRow, kit, db) : null;
  const isLatest = selectedRow != null && selectedRow.id === revisions[0]?.id;

  const analysis = getLatestAnalysis(postingId, db);
  const { picker, aiTop } = buildPicker(kit, posting, analysis, db);

  const analysisJob = jobInfo(latestJobFor('analyze_posting', () => true, db, { postingId, statuses: ['queued', 'running'] }), db);
  const tailorJob = jobInfo(activeTailorJob(postingId, db), db);

  // 실패: 가장 최근 맞춤 작업이 실패했고 그 뒤에 새 리비전이 없을 때만 보인다
  let failed: FailedJob | null = null;
  let needsWorkspace = false;
  const last = latestTailorJob(postingId, db);
  if (last && revisions[0]) {
    if (last.status === 'failed' && last.createdAt > revisions[0].createdAt) {
      const req = (last.payload as { request?: unknown } | null)?.request;
      failed = { id: last.id, type: last.type, errorKind: last.errorKind, errorMessage: last.errorMessage, request: typeof req === 'string' ? req : null };
    } else if (last.status === 'succeeded' && isLatest) {
      const result = getJob(last.id, db)?.result as { revisionId?: number; needsWorkspace?: boolean } | null;
      needsWorkspace = result?.revisionId === revisions[0].id && result.needsWorkspace === true;
    }
  } else if (last && last.status === 'failed') {
    failed = { id: last.id, type: last.type, errorKind: last.errorKind, errorMessage: last.errorMessage, request: null };
  }

  const reasons = selected && isLatest ? handoffReasons({ topFitPercent: aiTop, warnings: selected.confirm, pending: selected.pending, needsWorkspace }) : [];

  return {
    state: 'ready',
    kit: { id: kit.id, name: kitDisplayName(kit.id, kit.label) },
    applyDocs: buildApplyDocs(kit.id, picker),
    staleKitNote:
      latestKit && latestKit.id !== kit.id && latestKit.errors.length > 0
        ? `가장 최근 키트에 오류가 있어 이전 ${kitDisplayName(kit.id, kit.label)}를 씁니다`
        : null,
    hasText: !!posting.rawText?.trim(),
    picker,
    revisions,
    selected,
    isLatest,
    analysisJob,
    tailorJob,
    failed,
    handoff: { reasons, topFitPercent: aiTop },
  };
}
