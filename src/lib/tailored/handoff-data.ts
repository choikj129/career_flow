import { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { getCompany } from '@/lib/companies/repo';
import type { Db } from '@/lib/db/client';
import { getDb } from '@/lib/db/client';
import { todayLocal } from '@/lib/domain/dates';
import { SITE_LABELS } from '@/lib/domain/types';
import { recommend } from '@/lib/kit/recommend';
import { getKit } from '@/lib/kit/repo';
import { getLatestAnalysis, getPosting } from '@/lib/postings/repo';
import { buildHandoffRequest } from './handoff';
import { getRevision, rebuildStage1, revisionPostingId } from './repo';
import { kitDisplayName } from './view';

/** 폴더 이름에 못 쓰는 글자·공백을 뺀다 */
const folderPart = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '').replace(/^\.+|\.+$/g, '');

export const HANDOFF_NOTE_MAX = 2000;

/**
 * 이력서 작업 공간에 붙여 넣을 요청문(md). 리비전·공고·키트에서 읽어 만든다. 저장하지 않는다(D-30 a).
 * 없는 리비전이면 null. 메모는 2000자까지.
 */
export function buildHandoffMdForRevision(revisionId: number, note: string, db: Db = getDb()): string | null {
  const rev = getRevision(revisionId, db);
  const postingId = rev ? revisionPostingId(rev.id, db) : null;
  const posting = postingId != null ? getPosting(postingId, db) : undefined;
  if (!rev || !posting) return null;

  const kit = getKit(rev.kitId, db);
  const text = posting.rawText ?? '';
  const topWords = kit?.parsed ? recommend(kit.parsed, { title: posting.positionTitle, text }, { track: rev.track }).topWords : [];
  const rec = AnalysisResult.safeParse(getLatestAnalysis(posting.id, db)?.result).data?.profileRecommendation ?? null;
  const ranking =
    rec && rec.track === rev.track && rec.kitId === rev.kitId && kit?.parsed
      ? rec.profiles.map((p) => ({
          id: p.id,
          name: kit.parsed!.profiles.find((x) => x.track === rev.track && x.id === p.id)?.name ?? '',
          fitPercent: p.fitPercent,
        }))
      : null;
  let summary: string[] = [];
  try {
    summary = rebuildStage1(rev, db).applied;
  } catch {
    /* 키트 파일을 읽을 수 없으면 조립 요약 없이 만든다 */
  }
  const company = posting.companyId != null ? getCompany(posting.companyId, db) : undefined;
  const companyName = company?.displayName ?? '(회사 미상)';
  const position = posting.positionTitle ?? '(포지션 미상)';
  return buildHandoffRequest({
    company: companyName,
    position,
    site: posting.siteNote ? `${SITE_LABELS[posting.site]} (${posting.siteNote})` : SITE_LABELS[posting.site],
    url: posting.url,
    deadline: posting.deadline,
    postingText: text,
    topWords: topWords.map((w) => w.word),
    recipe: { track: rev.track, profileId: rev.profileId, profileName: rev.profileName, adjustments: rev.adjustments.map((a) => a.label) },
    profileRanking: ranking,
    recipeSummary: summary,
    pending: rev.pendingAdjustments,
    warnings: rev.warnings,
    userNote: note.slice(0, HANDOFF_NOTE_MAX),
    kitLabel: kit ? kitDisplayName(kit.id, kit.label) : `키트 ${rev.kitId}`,
    folderName: [todayLocal().replaceAll('-', ''), folderPart(companyName), folderPart(rev.track)].filter(Boolean).join('_'),
  });
}
