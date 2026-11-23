// "지원 서류" 카드의 내려받기·미리보기 주소. 순수 함수라 클라이언트 컴포넌트에서도 쓴다.

export type ApplyDocFormat = 'pdf' | 'md' | 'html';

/** 프로필 기본 서류 라우트 주소. postingId는 파일 이름에 회사를 쓰려고 넘긴다 */
export function applyDocUrl(
  i: { kitId: number; profileId: string; doc: 'resume' | 'career'; postingId: number },
  opts: { format?: ApplyDocFormat; inline?: boolean } = {},
): string {
  const q = new URLSearchParams({ postingId: String(i.postingId) });
  if (opts.format && opts.format !== 'pdf') q.set('format', opts.format);
  if (opts.inline) q.set('inline', '1');
  return `/api/kit/${i.kitId}/profile/${encodeURIComponent(i.profileId)}/${i.doc}?${q.toString()}`;
}
