import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import {
  checkBookmarkletToken,
  getOrCreateBookmarkletToken,
  regenerateBookmarkletToken,
} from '@/lib/bookmarklet/token';
import { buildBookmarkletCode } from '@/lib/bookmarklet/code';
import { parseBookmarkletHash } from '@/lib/bookmarklet/payload';
import { normalizeReceivedText } from '@/lib/postings/receive';

test('TC-BM-01 token: create once, regenerate, check', async () => {
  const db = makeTestDb();
  expect(checkBookmarkletToken('anything', db)).toBe(false); // 저장 없음
  const a = getOrCreateBookmarkletToken(db);
  const b = getOrCreateBookmarkletToken(db);
  expect(b).toEqual(a);
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);

  expect(checkBookmarkletToken(a.token, db)).toBe(true);
  expect(checkBookmarkletToken('', db)).toBe(false);
  expect(checkBookmarkletToken(a.token + 'x', db)).toBe(false);
  expect(checkBookmarkletToken(a.token.slice(1), db)).toBe(false);
  expect(checkBookmarkletToken('x'.repeat(32), db)).toBe(false);
  expect(checkBookmarkletToken(12345, db)).toBe(false);
  expect(checkBookmarkletToken(null, db)).toBe(false);

  await new Promise((r) => setTimeout(r, 5));
  const c = regenerateBookmarkletToken(db);
  expect(c.token).not.toBe(a.token);
  expect(c.createdAt).not.toBe(a.createdAt);
  expect(checkBookmarkletToken(a.token, db)).toBe(false);
  expect(checkBookmarkletToken(c.token, db)).toBe(true);
  expect(getOrCreateBookmarkletToken(db)).toEqual(c);
});

test('TC-BM-02 buildBookmarkletCode makes a valid one-line javascript: url', () => {
  const token = 'tok_en-ABC123';
  const appOrigin = 'http://127.0.0.1:3939';
  const code = buildBookmarkletCode({ token, appOrigin });
  expect(code.startsWith('javascript:')).toBe(true);
  expect(code).not.toMatch(/[\r\n]/);
  expect(code.length).toBeLessThanOrEqual(6000);
  const source = decodeURIComponent(code.slice('javascript:'.length));
  expect(() => new Function(source)).not.toThrow();
  expect(source).toContain(JSON.stringify(token));
  expect(source).toContain(JSON.stringify(appOrigin));
  expect(source).not.toContain('__TOKEN__');
  expect(source).not.toContain('__APP__');
});

test('TC-BM-03 parseBookmarkletHash', () => {
  const p = { v: 1, k: 'tok', u: 'https://example.com/a', t: '제목', x: '본문\n둘째 줄 %20 #', c: false };
  const hash = '#cf=' + encodeURIComponent(JSON.stringify(p));
  expect(parseBookmarkletHash(hash)).toEqual(p);
  expect(parseBookmarkletHash('')).toBeNull();
  expect(parseBookmarkletHash('#x=' + encodeURIComponent(JSON.stringify(p)))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent('{broken'))).toBeNull();
  expect(parseBookmarkletHash('#cf=%E0%A4%A')).toBeNull(); // 잘못된 % 인코딩
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify({ ...p, v: 2 })))).toBeNull();
  const { x, ...noText } = p;
  void x;
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify(noText)))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify({ ...p, k: 1 })))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify({ ...p, c: 'no' })))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent('[1,2]'))).toBeNull();
});

test('TC-BM-04 normalizeReceivedText', () => {
  const messy = '앞줄   \r\n\r\n\r\n\r\n\r\n\r\n뒷줄\t \r\n  ';
  const n = normalizeReceivedText('  가상 공고 제목  ', messy, false);
  expect(n.text).toBe('페이지 제목: 가상 공고 제목\n\n앞줄\n\n\n뒷줄');
  expect(n.cut).toBe(false);
  expect(n.bodyLength).toBe('앞줄\n\n\n뒷줄'.length);

  const noTitle = normalizeReceivedText('', ' 본문만 ', false);
  expect(noTitle.text).toBe('본문만');

  const long = normalizeReceivedText('', 'a'.repeat(50_001), false);
  expect(long.text.length).toBe(50_000);
  expect(long.cut).toBe(true);
  expect(long.bodyLength).toBe(50_001);

  // 북마크 버튼이 이미 잘랐으면 cut 유지
  expect(normalizeReceivedText('', 'abc', true).cut).toBe(true);
  // 제목은 300자로 자른다
  expect(
    normalizeReceivedText('가'.repeat(400), 'abc', false).text.startsWith('페이지 제목: ' + '가'.repeat(300) + '\n\n'),
  ).toBe(true);
});
