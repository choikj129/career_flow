import { assemble } from '@/lib/kit/assemble';
import { getKit, readKitDoc } from '@/lib/kit/repo';
import { kitPdfFileName, personNameFromMd } from '@/lib/pdf/names';
import { parseFormat, respondDocument } from '@/lib/pdf/respond';
import { parseRouteId } from '@/lib/route-id';
import { postingCompanyName } from '@/lib/tailored/repo';

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * 프로필 기본 서류: 키트의 기본 서류를 그 프로필 레시피로 조립한 것(추가 조정 없음, AI 없음).
 * 저장하지 않고 요청마다 만든다(D-25). `?postingId=`가 있으면 파일 이름에 그 공고의 회사를 쓴다.
 */
export async function GET(req: Request, { params }: RouteContext<'/api/kit/[kitId]/profile/[profileId]/[doc]'>) {
  const { kitId, profileId: rawProfile, doc } = await params;
  if (doc !== 'resume' && doc !== 'career') return new Response('잘못된 서류 종류입니다', { status: 400 });
  const url = new URL(req.url);
  const format = parseFormat(url.searchParams.get('format'));
  if (!format) return new Response('잘못된 형식입니다', { status: 400 });

  const id = parseRouteId(kitId);
  const kit = id != null ? getKit(id) : null;
  const profile = kit?.parsed?.profiles.find((p) => p.id === decode(rawProfile));
  if (!kit?.parsed || kit.errors.length > 0 || !profile) return new Response('기본 서류를 찾을 수 없습니다', { status: 404 });

  let base: { resumeMd: string; careerMd: string };
  try {
    base = { resumeMd: readKitDoc(kit.id, profile.track, 'resume'), careerMd: readKitDoc(kit.id, profile.track, 'career') };
  } catch {
    return new Response('기본 서류 파일을 읽을 수 없습니다. 키트를 다시 올려 보세요', { status: 404 });
  }
  let out;
  try {
    out = assemble(kit.parsed, base, { track: profile.track, profileId: profile.id, adjustmentIds: [] });
  } catch {
    return new Response('프로필을 조립할 수 없습니다. 서류 키트를 확인하세요', { status: 404 });
  }

  const postingId = parseRouteId(url.searchParams.get('postingId') ?? '');
  return respondDocument({
    md: doc === 'resume' ? out.resumeMd : out.careerMd,
    css: kit.parsed.styleCss ?? null,
    pdfName: kitPdfFileName({ name: personNameFromMd(base.resumeMd), doc, track: postingCompanyName(postingId) ?? profile.track }),
    format,
    inline: url.searchParams.get('inline') === '1',
  });
}
