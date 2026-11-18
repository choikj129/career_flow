import type { SiteId } from './types';

const CORP_PATTERNS: RegExp[] = [
  /\(주\)/g,
  /\(유\)/g,
  /주식회사/g,
  /유한회사/g,
  /\bco\s*\.?\s*,?\s*ltd\.?/g,
  /\bltd\.?/g,
  /\binc\.?/g,
  /\bcorp\.?/g,
  /\bcorporation\b/g,
  /\bcompany\b/g,
];

export function normalizeCompanyName(name: string): string {
  let s = name.normalize('NFKC').toLowerCase();
  for (const re of CORP_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/[^\p{L}\p{N}]/gu, '');
}

const TRACKING_KEYS = new Set(['oem_code', 'rpagecode', 'logpath', 'sc', 'ref', 'referer', 'source']);

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
