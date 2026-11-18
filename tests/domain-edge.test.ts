// 경계값·변형 입력: 회사명 변형, URL 추적 꼬리, 사이트 판별, 빈 입력, 마이그레이션 반복.
import { describe, expect, test } from 'vitest';
import { canonicalizeUrl, detectSite, normalizeCompanyName } from '@/lib/domain/normalize';
import { findOrCreateCompany } from '@/lib/companies/repo';
import { registerPosting } from '@/lib/postings/repo';
import { runMigrations } from '@/lib/db/client';
import { makeTestDb } from './helpers/db';

describe('회사명 변형', () => {
  test('TC-DATA-01 (주)·주식회사·법인명 접미사·공백·대소문자는 같은 키가 된다', () => {
    const keys = ['(주)토스', '주식회사 토스', '토스(주)', '토스 ', '㈜토스', '토  스'].map(normalizeCompanyName);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('토스');
    expect(normalizeCompanyName('NAVER')).toBe(normalizeCompanyName('naver'));
  });

  test('TC-DATA-02 이름이 없거나 접미사뿐이면 빈 키', () => {
    for (const n of ['', '   ', '(주)', '주식회사', 'Inc.']) expect(normalizeCompanyName(n)).toBe('');
  });

  test('TC-DATA-03 빈 회사명으로는 회사를 만들 수 없다', () => {
    const db = makeTestDb();
    expect(() => findOrCreateCompany({ displayName: '  ' }, db)).toThrow('회사 이름이 비어 있습니다');
    expect(() => findOrCreateCompany({ displayName: '(주)' }, db)).toThrow();
  });

  test('TC-DATA-04 (주)토스와 토스는 같은 회사, 다른 이름은 새 회사', () => {
    const db = makeTestDb();
    const a = findOrCreateCompany({ displayName: '(주)토스' }, db);
    const b = findOrCreateCompany({ displayName: '토스' }, db);
    const c = findOrCreateCompany({ displayName: '토스뱅크' }, db);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  test('TC-DATA-05 [BUG] 영문 접미사 Corporation 은 통째로 지워져 Corp 와 같은 키가 된다', () => {
    expect(normalizeCompanyName('Acme Corporation')).toBe('acme');
    expect(normalizeCompanyName('Acme Corporation')).toBe(normalizeCompanyName('Acme Corp'));
  });

  test('TC-DATA-06 [BUG] Inc/Corp/Ltd 로 시작하는 단어(Incredible, Corpay)는 잘리지 않는다', () => {
    expect(normalizeCompanyName('Incredible Inc')).toBe('incredible');
    expect(normalizeCompanyName('Corpay')).toBe('corpay');
    expect(normalizeCompanyName('Ltdomain')).toBe('ltdomain');
  });
});

describe('URL', () => {
  test('TC-NEW-13 추적 파라미터(utm_*)와 #조각, 끝 슬래시, 호스트 대소문자는 무시, 일반 쿼리는 유지', () => {
    const base = 'https://www.wanted.co.kr/wd/12345';
    for (const u of [
      `${base}?utm_source=kakao`,
      `${base}/?utm_medium=a&utm_campaign=b#apply`,
      `${base}#section`,
      `${base}/?`,
      'https://WWW.WANTED.CO.KR/wd/12345',
    ]) {
      expect(canonicalizeUrl(u), u).toBe(base);
    }
    expect(canonicalizeUrl('https://example.com/job?id=7&utm_campaign=a')).toBe('https://example.com/job?id=7');
    expect(canonicalizeUrl('https://example.com/job?id=7')).not.toBe(canonicalizeUrl('https://example.com/job?id=8'));
  });

  test('TC-NEW-14 경로의 대소문자는 구분하고 기본 포트는 지운다', () => {
    expect(canonicalizeUrl('https://example.com/Job/ABC')).not.toBe(canonicalizeUrl('https://example.com/job/abc'));
    expect(canonicalizeUrl('https://example.com:443/a')).toBe('https://example.com/a');
  });

  test('TC-NEW-15 주소가 아니면 던진다', () => {
    expect(() => canonicalizeUrl('not a url')).toThrow();
  });

  test('TC-NEW-16 사이트 판별: 하위 도메인은 같은 사이트, 비슷한 도메인은 기타', () => {
    expect(detectSite('https://m.wanted.co.kr/wd/1')).toBe('wanted');
    expect(detectSite('https://WWW.GROUPBY.KR/p/1')).toBe('groupby');
    expect(detectSite('https://wanted.co.kr.evil.com/x')).toBe('other');
    expect(detectSite('https://notwanted.co.kr/a')).toBe('other');
  });

  test('TC-NEW-17 같은 공고를 꼬리만 달리해 두 번 등록하면 하나만 생기고 두 번째는 existing', () => {
    const db = makeTestDb();
    const a = registerPosting({ url: 'https://www.wanted.co.kr/wd/1?utm_source=a' }, db);
    const b = registerPosting({ url: 'https://www.wanted.co.kr/wd/1/#top' }, db);
    expect(a.existing).toBe(false);
    expect(b).toMatchObject({ existing: true, postingId: a.postingId });
  });

  test('TC-NEW-18 링크와 본문이 모두 비면 등록할 수 없다(공백만 있어도)', () => {
    const db = makeTestDb();
    expect(() => registerPosting({ url: '  ', pastedText: '\n ' }, db)).toThrow('공고 링크나 본문 중 하나는 필요합니다');
  });
});

describe('DB', () => {
  test('TC-DATA-07 마이그레이션을 두 번 실행해도 안전하다(앱 재시작)', () => {
    const db = makeTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    expect(() => runMigrations(db)).not.toThrow();
  });
});
