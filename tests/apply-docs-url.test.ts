import { describe, expect, test } from 'vitest';
import { applyDocUrl } from '@/lib/tailored/apply-docs-url';

describe('applyDocUrl (SA-02)', () => {
  test('pdf is the default, other formats and inline are query values, the posting is always passed', () => {
    const i = { kitId: 14, profileId: 'B4', doc: 'resume', postingId: 7 } as const;
    expect(applyDocUrl(i)).toBe('/api/kit/14/profile/B4/resume?postingId=7');
    expect(applyDocUrl({ ...i, doc: 'career' }, { format: 'html', inline: true })).toBe('/api/kit/14/profile/B4/career?postingId=7&format=html&inline=1');
    expect(applyDocUrl(i, { format: 'pdf' })).toBe('/api/kit/14/profile/B4/resume?postingId=7');
  });
  test('the profile id is path-encoded', () => {
    expect(applyDocUrl({ kitId: 1, profileId: 'A/B', doc: 'resume', postingId: 2 })).toBe('/api/kit/1/profile/A%2FB/resume?postingId=2');
  });
});
