/** 라우트 주소의 id(`/api/…/12`)를 읽는다. 양의 정수 글자만 받고, 아니면 null */
export function parseRouteId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}
