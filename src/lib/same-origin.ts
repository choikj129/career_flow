/** 출처(Origin) 헤더가 있으면 이 앱(Host)과 같아야 한다. 다른 사이트의 페이지가 로컬 앱 주소로 보내는 요청을 막는다 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}
