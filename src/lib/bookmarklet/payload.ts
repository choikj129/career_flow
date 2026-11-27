// 클라이언트 컴포넌트에서도 쓴다. DB·fs 같은 서버 전용 모듈을 import하지 않는다.

/** 북마크 버튼이 주소 `#cf=` 뒤에 실어 보내는 값 */
export type BookmarkletPayload = { v: 1; k: string; u: string; t: string; x: string; c: boolean };

/** 받는 쪽 결과. 어떤 결과에도 확인 값(토큰)을 넣지 않는다. */
export type ReceiveResult =
  | { kind: 'registered'; postingId: number; notice: string }
  | { kind: 'existing'; postingId: number; notice: string }
  | {
      kind: 'confirm';
      reason: 'token' | 'url' | 'short';
      notice: string;
      prefill: { url: string; text: string; siteNote: string };
    }
  | { kind: 'error'; message: string };

/** `location.hash` 값을 읽는다. 모양이 맞지 않으면 null. */
export function parseBookmarkletHash(hash: string): BookmarkletPayload | null {
  if (!hash.startsWith('#cf=')) return null;
  let o: unknown;
  try {
    o = JSON.parse(decodeURIComponent(hash.slice('#cf='.length)));
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (typeof r.k !== 'string' || typeof r.u !== 'string' || typeof r.t !== 'string' || typeof r.x !== 'string') return null;
  if (typeof r.c !== 'boolean') return null;
  return { v: 1, k: r.k, u: r.u, t: r.t, x: r.x, c: r.c };
}
