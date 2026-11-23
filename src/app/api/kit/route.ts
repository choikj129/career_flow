import { isSameAsLatestKit, KIT_MAX_TOTAL_BYTES, saveKit } from '@/lib/kit/repo';
import { isSameOrigin } from '@/lib/same-origin';

export type KitUploadResponse =
  | { ok: true; unchanged: boolean; kitId: number; errorCount: number }
  | { ok: false; error: string };

const json = (body: KitUploadResponse, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** 서류 키트 올리기(multipart, 필드 `files` 여러 개). 같은 내용이면 새 버전을 만들지 않는다(화면 문서 5.6, D-27 a) */
export async function POST(req: Request) {
  // 다른 사이트의 페이지가 이 주소로 파일을 보내지 못하게 한다
  if (!isSameOrigin(req)) return json({ ok: false, error: '허용되지 않는 요청입니다' }, 403);
  // 너무 큰 본문은 읽기 전에 거절한다(합계 한도 + 여유)
  if (Number(req.headers.get('content-length') ?? 0) > KIT_MAX_TOTAL_BYTES + 512 * 1024) {
    return json({ ok: false, error: '합계 5MB까지 올릴 수 있습니다' }, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: '파일을 읽을 수 없습니다' }, 400);
  }
  const picked = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (picked.length === 0) return json({ ok: false, error: '올릴 파일을 고르세요' }, 400);

  try {
    const files = await Promise.all(picked.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })));
    if (isSameAsLatestKit(files)) {
      return json({ ok: true, unchanged: true, kitId: 0, errorCount: 0 });
    }
    const { kitId, errors } = saveKit(files);
    return json({ ok: true, unchanged: false, kitId, errorCount: errors.length });
  } catch (e) {
    // saveKit의 한국어 오류(파일 수·크기·이름)를 그대로 보인다
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
}
