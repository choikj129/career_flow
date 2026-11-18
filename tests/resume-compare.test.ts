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

import { isResumeDirty } from '@/lib/resume/compare';

describe('isResumeDirty (TC-RESUME-DIRTY)', () => {
  const base = JSON.stringify({ summary: 'a' });
  test('처음 내용과 같으면 false, 달라지면 true, 되돌리면 다시 false', () => {
    expect(isResumeDirty({ done: false, current: { summary: 'a' }, baselineJson: base })).toBe(false);
    expect(isResumeDirty({ done: false, current: { summary: 'b' }, baselineJson: base })).toBe(true);
    expect(isResumeDirty({ done: false, current: { summary: 'a' }, baselineJson: base })).toBe(false);
  });
  test('저장을 마치면(done) 달라도 false, 초안(draft)은 그대로여도 true', () => {
    expect(isResumeDirty({ done: true, current: { summary: 'b' }, baselineJson: base })).toBe(false);
    expect(isResumeDirty({ done: false, draft: true, current: { summary: 'a' }, baselineJson: base })).toBe(true);
    expect(isResumeDirty({ done: true, draft: true, current: { summary: 'a' }, baselineJson: base })).toBe(false);
  });
});
