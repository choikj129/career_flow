import { expect, test } from 'vitest';
import { normalizeCompanyName, normalizePosition, canonicalizeUrl, detectSite } from '@/lib/domain/normalize';

test.each([
  ['주식회사 비바리퍼블리카', '비바리퍼블리카'],
  ['(주)카카오', '카카오'],
  ['㈜카카오', '카카오'],
  ['카카오 (주)', '카카오'],
  ['Kakao Corp.', 'kakao'],
  ['LINE Plus Co., Ltd.', 'lineplus'],
  ['토스 뱅크', '토스뱅크'],
  ['（주）우아한형제들', '우아한형제들'],
  ['유한회사 테스트', '테스트'],
])('normalizeCompanyName(%s) = %s', (input, expected) => {
  expect(normalizeCompanyName(input)).toBe(expected);
});

test('canonicalizeUrl strips tracking params, fragment, trailing slash; lowercases host', () => {
  expect(canonicalizeUrl('https://WWW.Wanted.co.kr/wd/12345/?utm_source=kakao&utm_medium=x#apply')).toBe(
    'https://www.wanted.co.kr/wd/12345',
  );
  expect(
    canonicalizeUrl('https://www.jobkorea.co.kr/Recruit/GI_Read/46000000?Oem_Code=C1&rPageCode=SL'),
  ).toBe('https://www.jobkorea.co.kr/Recruit/GI_Read/46000000');
  expect(canonicalizeUrl('https://example.com/job?id=7&utm_campaign=a')).toBe('https://example.com/job?id=7');
});

test('canonicalizeUrl sorts remaining query keys', () => {
  expect(canonicalizeUrl('https://example.com/j?b=2&a=1')).toBe('https://example.com/j?a=1&b=2');
});

test.each([
  ['https://career.rememberapp.co.kr/job/posting/123', 'remember'],
  ['https://www.wanted.co.kr/wd/1', 'wanted'],
  ['https://groupby.kr/positions/9', 'groupby'],
  ['https://www.jobkorea.co.kr/Recruit/GI_Read/1', 'jobkorea'],
  ['https://careers.toss.im/job/1', 'other'],
])('detectSite(%s) = %s', (url, site) => expect(detectSite(url)).toBe(site));

test.each([
  ['Server Dev', 'serverdev'],
  ['server-dev', 'serverdev'],
  ['백엔드 개발자 (경력)', '백엔드개발자경력'],
  ['ＦＲＯＮＴ', 'front'],
])('normalizePosition(%s) = %s', (a, b) => expect(normalizePosition(a)).toBe(b));
