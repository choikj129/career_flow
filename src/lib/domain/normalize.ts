import type { SiteId } from './types';

// 긴 패턴을 먼저 적용한다(corporation 이 corp 보다 먼저). 영문 접미사는 단어 경계를 요구한다.
const CORP_PATTERNS: RegExp[] = [
  /\(주\)/g,
  /\(유\)/g,
  /주식회사/g,
  /유한회사/g,
  /\bco\s*\.?\s*,?\s*ltd\b\.?/g,
  /\bcorporation\b/g,
  /\bcompany\b/g,
  /\bltd\b\.?/g,
  /\binc\b\.?/g,
  /\bcorp\b\.?/g,
];

export function normalizeCompanyName(name: string): string {
  let s = name.normalize('NFKC').toLowerCase();
  for (const re of CORP_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/[^\p{L}\p{N}]/gu, '');
}

export const INVALID_POSTING_URL_MESSAGE = '올바른 공고 주소가 아닙니다. https://로 시작하는 전체 주소를 넣어 주세요.';

/** 공고 주소는 http:, https: 만 허용한다. 아니면 한국어 오류를 던진다. 검사 함수는 이것 하나만 쓴다. */
export function assertHttpUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new Error(INVALID_POSTING_URL_MESSAGE);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(INVALID_POSTING_URL_MESSAGE);
  return u;
}

export function isHttpUrl(url: string): boolean {
  try {
    assertHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}

const TRACKING_KEYS = new Set(['oem_code', 'rpagecode', 'logpath', 'sc', 'ref', 'referer', 'source',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid']);

export function canonicalizeUrl(url: string): string {
  const u = new URL(url.trim());
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const kept = [...u.searchParams.entries()].filter(([k]) => {
    const key = k.toLowerCase();
    return !key.startsWith('utm_') && !TRACKING_KEYS.has(key);
  });
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let path = u.pathname;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  u.pathname = path;
  let out = u.toString();
  if (out.endsWith('/') && u.pathname === '/' && !u.search) out = out.slice(0, -1);
  return out;
}

const SITE_HOSTS: [string, SiteId][] = [
  ['rememberapp.co.kr', 'remember'],
  ['wanted.co.kr', 'wanted'],
  ['groupby.kr', 'groupby'],
  ['jobkorea.co.kr', 'jobkorea'],
];

export function detectSite(url: string): SiteId {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  for (const [suffix, id] of SITE_HOSTS) {
    if (host === suffix || host.endsWith('.' + suffix)) return id;
  }
  return 'other';
}
