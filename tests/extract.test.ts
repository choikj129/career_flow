import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractPostingText, MIN_POSTING_TEXT_LENGTH } from '@/lib/extract/extract-posting';
import { isBrowserBusy, withBrowser } from '@/lib/extract/browser';

const FULL = resolve(__dirname, 'fixtures/posting-full.html');
const EMPTY = resolve(__dirname, 'fixtures/posting-empty.html');
const tmpProfile = () => mkdtempSync(join(tmpdir(), 'cf-profile-'));

describe('extractPostingText', () => {
  test('extracts JS-rendered text from page', async () => {
    const r = await extractPostingText(pathToFileURL(FULL).href, { profileDir: tmpProfile() });
    expect(r.text).toContain('자격요건');
    expect(r.text.length).toBeGreaterThanOrEqual(MIN_POSTING_TEXT_LENGTH);
    expect(r.title).toContain('서버 개발자');
  }, 60_000);

  test('fails on too-short text', async () => {
    await expect(
      extractPostingText(pathToFileURL(EMPTY).href, { profileDir: tmpProfile() }),
    ).rejects.toMatchObject({ kind: 'extract_failed' });
  }, 60_000);

  test('fails on unreachable url as extract_failed', async () => {
    await expect(
      extractPostingText('http://127.0.0.1:1/none', { profileDir: tmpProfile(), timeoutMs: 5000 }),
    ).rejects.toMatchObject({ kind: 'extract_failed' });
  }, 60_000);
});

describe('withBrowser', () => {
  test('serializes concurrent browser use', async () => {
    const spans: { start: number; end: number }[] = [];
    const run = () =>
      withBrowser(
        async () => {
          const start = Date.now();
          await new Promise((r) => setTimeout(r, 100));
          spans.push({ start, end: Date.now() });
        },
        { profileDir: tmpProfile() },
      );
    const p1 = run();
    const p2 = run();
    expect(isBrowserBusy()).toBe(true);
    await Promise.all([p1, p2]);
    expect(spans).toHaveLength(2);
    expect(spans[1].start).toBeGreaterThanOrEqual(spans[0].end);
    expect(isBrowserBusy()).toBe(false);
  }, 60_000);
});
