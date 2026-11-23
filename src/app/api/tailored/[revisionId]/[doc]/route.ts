import { getKit } from '@/lib/kit/repo';
import { kitPdfFileName, personNameFromMd } from '@/lib/pdf/names';
import { parseFormat, respondDocument } from '@/lib/pdf/respond';
import { parseRouteId } from '@/lib/route-id';
import { getRevision } from '@/lib/tailored/repo';

/** 맞춤본 내려받기·미리보기. 파일은 저장하지 않고 리비전의 md로 그때그때 만든다(D-25 a). */
export async function GET(req: Request, { params }: RouteContext<'/api/tailored/[revisionId]/[doc]'>) {
  const { revisionId, doc } = await params;
  if (doc !== 'resume' && doc !== 'career') return new Response('잘못된 서류 종류입니다', { status: 400 });
  const url = new URL(req.url);
  const format = parseFormat(url.searchParams.get('format'));
  if (!format) return new Response('잘못된 형식입니다', { status: 400 });
  const id = parseRouteId(revisionId);
  const rev = id != null ? getRevision(id) : null;
  if (!rev) return new Response('맞춤본을 찾을 수 없습니다', { status: 404 });

  const md = doc === 'resume' ? rev.resumeMd : rev.careerMd;
  const name = personNameFromMd(rev.resumeMd);
  return respondDocument({
    md,
    css: getKit(rev.kitId)?.parsed?.styleCss ?? null,
    pdfName: kitPdfFileName({ name, doc, track: rev.track }),
    format,
    inline: url.searchParams.get('inline') === '1',
  });
}
