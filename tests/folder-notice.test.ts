import { describe, expect, it } from 'vitest';
import { shouldShowFolderNotice, sessionCopyKey, parseSessionCopy } from '@/lib/applications/folder-notice';

describe('shouldShowFolderNotice (D-34)', () => {
  const copied = '2026-11-27T01:00:00.000Z';
  it('복사했고 기본 서류로 저장하면 알린다', () => {
    expect(shouldShowFolderNotice(copied, 'kitp:1:B1:백엔드')).toBe(true);
    expect(shouldShowFolderNotice(copied, 'kit:1:백엔드')).toBe(true);
  });
  it('이력서 파일·모름·맞춤 리비전도 알린다', () => {
    expect(shouldShowFolderNotice(copied, 'file:a.pdf')).toBe(true);
    expect(shouldShowFolderNotice(copied, 'unknown')).toBe(true);
    expect(shouldShowFolderNotice(copied, 'tailored:3')).toBe(true);
  });
  it('이력서 세션 맞춤본이면 알리지 않는다', () => {
    expect(shouldShowFolderNotice(copied, 'sess:1:B1:백엔드')).toBe(false);
  });
  it('복사 표시가 없으면 알리지 않는다', () => {
    expect(shouldShowFolderNotice(null, 'kitp:1:B1:백엔드')).toBe(false);
    expect(shouldShowFolderNotice('', 'kitp:1:B1:백엔드')).toBe(false);
  });
  it('저장한 이력서 값을 모르면 알리지 않는다', () => {
    expect(shouldShowFolderNotice(copied, null)).toBe(false);
    expect(shouldShowFolderNotice(copied, undefined)).toBe(false);
  });
  it('키 이름', () => {
    expect(sessionCopyKey(12)).toBe('cf:session-request-copied:12');
  });
});

describe('parseSessionCopy (apply-tidy)', () => {
  it('new value carries the profile, an old time-only value has none, empty is nothing', () => {
    expect(parseSessionCopy('2026-11-27T01:00:00.000Z|B4')).toEqual({ at: '2026-11-27T01:00:00.000Z', profileId: 'B4' });
    expect(parseSessionCopy('2026-11-27T01:00:00.000Z')).toEqual({ at: '2026-11-27T01:00:00.000Z', profileId: null });
    expect(parseSessionCopy('2026-11-27T01:00:00.000Z|')).toEqual({ at: '2026-11-27T01:00:00.000Z', profileId: null });
    expect(parseSessionCopy(null)).toBeNull();
  });
  it('the notice still shows for an old value', () => {
    expect(shouldShowFolderNotice('2026-11-27T01:00:00.000Z', 'kitp:1:B1:백엔드')).toBe(true);
  });
});
