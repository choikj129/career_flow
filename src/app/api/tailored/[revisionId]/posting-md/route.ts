import { getCompany } from '@/lib/companies/repo';
import { SITE_LABELS } from '@/lib/domain/types';
import { getKit } from '@/lib/kit/repo';
import { recommend } from '@/lib/kit/recommend';
import { contentDisposition } from '@/lib/pdf/names';
import { getPosting } from '@/lib/postings/repo';
import { buildPostingMd } from '@/lib/tailored/posting-md';
import { getRevision, revisionPostingId } from '@/lib/tailored/repo';

/** 공고 요약 md 받기(사용자 지원 폴더의 공고.md와 같은 이름). 저장하지 않는다. */
export async function GET(_req: Request, { params }: RouteContext<'/api/tailored/[revisionId]/posting-md'>) {
  const { revisionId } = await params;
  const id = /^\d+$/.test(revisionId) ? Number(revisionId) : NaN;
  const rev = Number.isSafeInteger(id) ? getRevision(id) : null;
  const postingId = rev ? revisionPostingId(rev.id) : null;
  const posting = postingId != null ? getPosting(postingId) : undefined;
  if (!rev || !posting) return new Response('맞춤본을 찾을 수 없습니다', { status: 404 });

  const text = posting.rawText ?? '';
  const kit = getKit(rev.kitId);
  const topWords = kit?.parsed ? recommend(kit.parsed, { title: posting.positionTitle, text }).topWords : [];
  const company = posting.companyId != null ? getCompany(posting.companyId) : undefined;
  const site = posting.siteNote ? `${SITE_LABELS[posting.site]} (${posting.siteNote})` : SITE_LABELS[posting.site];
  const md = buildPostingMd({
    company: company?.displayName ?? '(회사 미상)',
    position: posting.positionTitle ?? '(포지션 미상)',
    site,
    url: posting.url,
    deadline: posting.deadline,
    topWords,
    track: rev.track,
    profileId: rev.profileId,
    profileName: rev.profileName,
    adjustments: rev.adjustments.map((a) => a.label),
    postingText: text,
  });
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': contentDisposition('공고.md'),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
