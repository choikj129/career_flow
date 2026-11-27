// D-34: 이력서 세션 요청을 복사했지만 맞춤본이 아닌 서류로 냈을 때 "지원 폴더 안 씀" 알림.
// 순수 판단 + 브라우저 저장소(localStorage) 보조. DB·fs를 import하지 않는다(클라이언트 컴포넌트가 쓴다).

export const FOLDER_NOTICE_EVENT = 'cf:folder-notice';

export const sessionCopyKey = (postingId: number): string => `cf:session-request-copied:${postingId}`;

/** 복사 표시가 있고, 저장한 이력서가 이력서 세션 맞춤본(sess:)이 아니면 알린다. 이력서 값이 없으면 알리지 않는다 */
export function shouldShowFolderNotice(copiedAt: string | null | undefined, resume: string | null | undefined): boolean {
  if (!copiedAt || resume == null) return false;
  return !resume.startsWith('sess:');
}

/** 복사 표시 값 "시각|프로필 id". 옛 값(시각만)은 프로필이 없는 것으로 본다 */
export function parseSessionCopy(raw: string | null | undefined): { at: string; profileId: string | null } | null {
  if (!raw) return null;
  const i = raw.indexOf('|');
  if (i < 0) return { at: raw, profileId: null };
  return { at: raw.slice(0, i), profileId: raw.slice(i + 1) || null };
}

/** 복사 표시 저장(실패는 조용히 넘어간다) */
export function markSessionRequestCopied(postingId: number, profileId: string, now: Date = new Date()): void {
  try {
    window.localStorage.setItem(sessionCopyKey(postingId), `${now.toISOString()}|${profileId}`);
  } catch {
    /* 저장소를 못 쓰면 알림이 안 뜰 뿐 */
  }
}

export function readSessionRequestCopied(postingId: number): string | null {
  try {
    return window.localStorage.getItem(sessionCopyKey(postingId));
  } catch {
    return null;
  }
}

/** 복사할 때 고른 프로필 id. 표시가 없거나 옛 값이면 null */
export function readSessionRequestCopiedProfile(postingId: number): string | null {
  return parseSessionCopy(readSessionRequestCopied(postingId))?.profileId ?? null;
}

export function clearSessionRequestCopied(postingId: number): void {
  try {
    window.localStorage.removeItem(sessionCopyKey(postingId));
  } catch {
    /* 무시 */
  }
}

/** 저장 직후 부른다: 조건이 맞으면 공고 화면의 안내 상자에 알린다 */
export function notifyFolderNotice(postingId: number, resume: string | null | undefined): void {
  if (!shouldShowFolderNotice(readSessionRequestCopied(postingId), resume)) return;
  window.dispatchEvent(new CustomEvent(FOLDER_NOTICE_EVENT, { detail: { postingId } }));
}
