import { describe, expect, test } from 'vitest';
import { fence } from '@/lib/ai/fence';

describe('fence', () => {
  test('plain text gets a three-backtick fence', () => {
    expect(fence('본문')).toBe('```\n본문\n```');
  });
  test('a longer run of backticks inside makes the fence longer', () => {
    const f = fence('앞\n```\n## 제목처럼 보이는 줄\n```\n뒤');
    expect(f.startsWith('````\n')).toBe(true);
    expect(f.endsWith('\n````')).toBe(true);
    const f6 = fence('`````` 여섯');
    expect(f6.startsWith('```````\n')).toBe(true);
  });
});
