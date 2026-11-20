import { getKit, readKitDoc } from '@/lib/kit/repo';
import { kitPdfFileName, personNameFromMd } from '@/lib/pdf/names';
import { respondDocument } from '@/lib/pdf/respond';

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
  const id = /^\d+$/.test(kitId) ? Number(kitId) : NaN;
  const kit = Number.isSafeInteger(id) ? getKit(id) : null;
  const track = decode(rawTrack);
  if (!kit || !kit.files.some((f) => f.role === doc && f.track === track)) {
    return new Response('기본 서류를 찾을 수 없습니다', { status: 404 });
  }
  const md = readKitDoc(kit.id, track, doc);
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
