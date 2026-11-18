import { describe, expect, test } from 'vitest';
import { sameResume } from '@/lib/resume/compare';
import { emptyResume } from '@/lib/resume/schema';

describe('sameResume', () => {
  test('identical content is the same', () => {
    expect(sameResume(emptyResume(), emptyResume())).toBe(true);
  });
  test('ignores key order and undefined optional fields', () => {
    const a = emptyResume();
    a.basics = { name: '김', email: undefined, links: [] };
    const b = JSON.parse(JSON.stringify(emptyResume()));
    b.basics = { links: [], name: '김' };
    expect(sameResume(a, b)).toBe(true);
  });
  test('a changed line is different', () => {
    const a = emptyResume();
    const b = emptyResume();
    b.summary = '바뀜';
    expect(sameResume(a, b)).toBe(false);
  });
  test('order of list items matters', () => {
    const a = emptyResume();
    a.skills = [{ category: 'a', items: ['x'] }, { category: 'b', items: [] }];
    const b = emptyResume();
    b.skills = [{ category: 'b', items: [] }, { category: 'a', items: ['x'] }];
    expect(sameResume(a, b)).toBe(false);
  });
});
