import { describe, expect, test } from 'vitest';
import { josa } from '@/lib/domain/korean';

describe('josa', () => {
  test('와/과 follows the final consonant', () => {
    expect(josa('토스', '와')).toBe('토스와');
    expect(josa('모빌페이', '와')).toBe('모빌페이와');
    expect(josa('오렌지핀', '와')).toBe('오렌지핀과');
  });
  test('을/를', () => {
    expect(josa('모빌리티페이', '를')).toBe('모빌리티페이를');
    expect(josa('스텔라랩스', '를')).toBe('스텔라랩스를');
    expect(josa('한빛', '를')).toBe('한빛을');
  });
  test('은/는 and 이/가', () => {
    expect(josa('한빛', '은')).toBe('한빛은');
    expect(josa('토스', '은')).toBe('토스는');
    expect(josa('토스', '이')).toBe('토스가');
  });
  test('으로/로 treats ㄹ as no final consonant', () => {
    expect(josa('서울', '로')).toBe('서울로');
    expect(josa('모빌페이', '로')).toBe('모빌페이로');
    expect(josa('한빛', '로')).toBe('한빛으로');
  });
  test('non-hangul endings: latin and digits fall back to the vowel form', () => {
    expect(josa('Toss', '와')).toBe('Toss와');
    expect(josa('A', '를')).toBe('A를');
  });
});
