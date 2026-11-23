import { getKit, readKitDoc } from '@/lib/kit/repo';
import { kitPdfFileName, personNameFromMd } from '@/lib/pdf/names';
import { respondDocument } from '@/lib/pdf/respond';
import { parseRouteId } from '@/lib/route-id';

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 기본 서류 그대로의 PDF(지원 기록 [보기]). 형식은 PDF만. */
export async function GET(req: Request, { params }: RouteContext<'/api/kit/[kitId]/[track]/[doc]'>) {
  const { kitId, track: rawTrack, doc } = await params;
  if (doc !== 'resume' && doc !== 'career') return new Response('잘못된 서류 종류입니다', { status: 400 });
  const id = parseRouteId(kitId);
  const kit = id != null ? getKit(id) : null;
  const track = decode(rawTrack);
  if (!kit || !kit.files.some((f) => f.role === doc && f.track === track)) {
    return new Response('기본 서류를 찾을 수 없습니다', { status: 404 });
  }
  let md: string;
  try {
    md = readKitDoc(kit.id, track, doc);
  } catch {
    return new Response('기본 서류 파일을 읽을 수 없습니다. 키트를 다시 올려 보세요', { status: 404 });
  }
  let resumeMd = md;
  if (doc === 'career') {
    try {
      resumeMd = readKitDoc(kit.id, track, 'resume');
    } catch {
      resumeMd = '';
    }
  }
  return respondDocument({
    md,
    css: kit.parsed?.styleCss ?? null,
    pdfName: kitPdfFileName({ name: personNameFromMd(resumeMd), doc, track }),
    format: 'pdf',
    inline: new URL(req.url).searchParams.get('inline') === '1',
  });
}
