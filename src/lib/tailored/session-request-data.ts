import { AnalysisResult } from '@/lib/ai/tasks/schemas';
import { getCompany } from '@/lib/companies/repo';
import type { Db } from '@/lib/db/client';
import { getDb } from '@/lib/db/client';
import { eventDate } from '@/lib/domain/dates';
import { SITE_LABELS } from '@/lib/domain/types';
import { getUsableKit } from '@/lib/kit/repo';
import { getLatestAnalysis, getPosting } from '@/lib/postings/repo';
import { postingCompanyName } from './repo';
import { buildSessionRequest } from './session-request';
import { loadTailorView } from './view';

/**
 * 공고·최신 분석·지금 키트에서 이력서 세션 요청문(md)을 만든다. 저장하지 않고 claude를 부르지 않는다.
 * 공고·키트·프로필이 없거나 공고 본문이 비면 null.
 */
export function buildSessionRequestMd(postingId: number, profileId: string, db: Db = getDb()): string | null {
  const posting = getPosting(postingId, db);
  const text = posting?.rawText ?? '';
  if (!posting || !text.trim()) return null;
  const kit = getUsableKit(db);
  if (!kit) return null;
  const view = loadTailorView(postingId, null, db);
  if (view.state !== 'ready') return null;
  const { picker, applyDocs } = view;

  const track = picker.tracks.find((t) => picker.byTrack[t]?.profiles.some((p) => p.id === profileId));
  if (!track) return null;
  // 카드 표시와 같은 규칙: 퍼센트는 AI 기준이고 AI 추천 직무일 때만
  const showPercent = picker.basis === 'ai' && track === picker.track;
  const pct = (p: { percent: number | null }) => (showPercent ? p.percent : null);
  const profiles = picker.byTrack[track].profiles;
  const mine = profiles.find((p) => p.id === profileId)!;

  const initial = applyDocs.groups.flatMap((g) => g.profiles).find((p) => p.id === applyDocs.initialProfileId);
  const initialTrack = applyDocs.groups.find((g) => g.profiles.some((p) => p.id === applyDocs.initialProfileId))?.track;
  const initialShown = initial && initialTrack != null ? { id: initial.id, name: initial.name, percent: initial.percent } : null;

  const analysis = AnalysisResult.safeParse(getLatestAnalysis(postingId, db)?.result).data;
  const gaps = analysis?.gaps ?? [];
  const company = posting.companyId != null ? getCompany(posting.companyId, db) : undefined;
  const rec = applyDocs.tailorRec;

  return buildSessionRequest({
    company: company?.displayName ?? '(회사 미상)',
    position: posting.positionTitle ?? '(포지션 미상)',
    site: posting.siteNote ? `${SITE_LABELS[posting.site]} (${posting.siteNote})` : SITE_LABELS[posting.site],
    url: posting.url,
    deadline: posting.deadline,
    postingText: text,
    basisLabel: picker.basisLabel,
    chosen: { id: mine.id, name: mine.name, track, percent: pct(mine) },
    topIfDifferent: initialShown && initialShown.id !== mine.id ? initialShown : null,
    nextCandidates: profiles
      .filter((p) => p.id !== mine.id)
      .slice(0, 3)
      .map((p) => ({ id: p.id, name: p.name, percent: pct(p) })),
    adjustments: picker.byTrack[track].adjustments.filter((a) => a.suggested).map((a) => a.label),
    tailorRec: rec ? { percent: rec.percent, reason: rec.reason } : null,
    tailorRecEmpty: applyDocs.tailorRecMissing ? '(이 분석에는 없음)' : '(없음)',
    hidden: gaps.filter((g) => g.kind === 'hidden').map((g) => ({ point: g.point, suggestion: g.suggestion })),
    missing: gaps.filter((g) => g.kind === 'missing').map((g) => g.point),
    fileCompany: postingCompanyName(postingId, db) ?? track,
    kit: { label: view.kit.name, uploadedOn: eventDate(kit.createdAt) },
  });
}
