import { describe, expect, test } from 'vitest';
import { LINE_DIFF_MAX_CELLS, lineDiff } from '@/lib/kit/line-diff';

const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
const count = (d: ReturnType<typeof lineDiff>, op: string) => d.filter((x) => x.op === op).length;

describe('lineDiff (TC-KIT-26)', () => {
  test('small inputs: same, changed and moved lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nb\nc').every((x) => x.op === 'same')).toBe(true);
    const d = lineDiff('a\nb\nc', 'a\nX\nc');
    expect(d).toEqual([
      { text: 'a', op: 'same' },
      { text: 'b', op: 'del' },
      { text: 'X', op: 'ins' },
      { text: 'c', op: 'same' },
    ]);
    expect(lineDiff('', 'a')).toEqual([{ text: 'a', op: 'ins' }]);
    expect(lineDiff('a', '')).toEqual([{ text: 'a', op: 'del' }]);
  });

  test('common head and tail are kept as same without building the table', () => {
    const base = lines(3000, (i) => `줄 ${i}`);
    const changed = base.replace('줄 1500', '바뀐 줄');
    const t = Date.now();
    const d = lineDiff(base, changed);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(count(d, 'del')).toBe(1);
    expect(count(d, 'ins')).toBe(1);
    expect(count(d, 'same')).toBe(2999);
  });

  test('a huge fully-different middle falls back to delete-all then insert-all (bounded time and memory)', () => {
    const n = Math.ceil(Math.sqrt(LINE_DIFF_MAX_CELLS)) + 50;
    const a = lines(n, (i) => `a${i}`);
    const b = lines(n, (i) => `b${i}`);
    const t = Date.now();
    const d = lineDiff(a, b);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(count(d, 'del')).toBe(n);
    expect(count(d, 'ins')).toBe(n);
    expect(d.slice(0, n).every((x) => x.op === 'del')).toBe(true);
  });
});
