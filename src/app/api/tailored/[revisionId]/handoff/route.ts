import { contentDisposition } from '@/lib/pdf/names';
import { parseRouteId } from '@/lib/route-id';
import { isSameOrigin } from '@/lib/same-origin';
import { buildHandoffMdForRevision, HANDOFF_NOTE_MAX } from '@/lib/tailored/handoff-data';

/**
 * 요청문 받기: 이력서 작업 공간에 붙여 넣을 요청문을 md로 내려받는다(D-30 a). 저장하지 않는다.
 * 메모는 주소가 아니라 폼 본문(note)으로 받는다.
 */
export async function POST(req: Request, { params }: RouteContext<'/api/tailored/[revisionId]/handoff'>) {
  if (!isSameOrigin(req)) return new Response('허용되지 않는 요청입니다', { status: 403 });
  const { revisionId } = await params;
  const id = parseRouteId(revisionId);
  let note = '';
  try {
    const form = await req.formData();
    const v = form.get('note');
    note = typeof v === 'string' ? v : '';
  } catch {
    note = '';
  }
  if (note.length > HANDOFF_NOTE_MAX) return new Response(`메모는 ${HANDOFF_NOTE_MAX}자까지 쓸 수 있습니다`, { status: 400 });
  const md = id != null ? buildHandoffMdForRevision(id, note) : null;
  if (md == null) return new Response('맞춤본을 찾을 수 없습니다', { status: 404 });
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': contentDisposition('공고특화이력서_요청.md'),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
