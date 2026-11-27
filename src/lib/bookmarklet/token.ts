import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getDb, type Db } from '@/lib/db/client';
import { getSetting, setSetting } from '@/lib/settings';

// 북마크 버튼이 앱에 공고를 바로 등록해도 되는지 가려내는 확인 값. 설정 표(키-값)에 둔다.
// 토큰은 로그·결과·화면 글자에 남기지 않는다. 북마크 버튼 코드 안에만 들어간다.
const TOKEN_KEY = 'bookmarklet.token';
const CREATED_KEY = 'bookmarklet.createdAt';

export type BookmarkletToken = { token: string; createdAt: string };

function create(db: Db): BookmarkletToken {
  const token = randomBytes(24).toString('base64url'); // 32자
  const createdAt = new Date().toISOString();
  setSetting(TOKEN_KEY, token, db);
  setSetting(CREATED_KEY, createdAt, db);
  return { token, createdAt };
}

export function getOrCreateBookmarkletToken(db: Db = getDb()): BookmarkletToken {
  const token = getSetting(TOKEN_KEY, db);
  const createdAt = getSetting(CREATED_KEY, db);
  if (token && createdAt) return { token, createdAt };
  return create(db);
}

export function regenerateBookmarkletToken(db: Db = getDb()): BookmarkletToken {
  return create(db);
}

/** 저장된 확인 값과 같을 때만 true. 저장된 값이 없으면 언제나 false. */
export function checkBookmarkletToken(given: unknown, db: Db = getDb()): boolean {
  if (typeof given !== 'string' || given === '') return false;
  const stored = getSetting(TOKEN_KEY, db);
  if (!stored) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
