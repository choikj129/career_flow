import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MAX_UPLOAD_BYTES, checkUpload, saveUploads } from '@/lib/uploads/store';

describe('checkUpload', () => {
  test('accepts resume documents', () => {
    for (const n of ['a.pdf', 'b.DOCX', 'c.txt', 'd.md']) {
      expect(checkUpload(n, 100, 'resume')).toEqual({ ok: true });
    }
  });
  test('rejects unsupported type for each kind', () => {
    expect(checkUpload('a.exe', 100, 'resume')).toMatchObject({ ok: false });
    expect(checkUpload('a.pdf', 100, 'image')).toMatchObject({ ok: false });
    expect(checkUpload('a.png', 100, 'resume')).toMatchObject({ ok: false });
  });
  test('accepts png/jpg images', () => {
    expect(checkUpload('a.png', 1, 'image')).toEqual({ ok: true });
    expect(checkUpload('a.JPEG', 1, 'image')).toEqual({ ok: true });
  });
  test('rejects over 20MB and empty files', () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(checkUpload('a.pdf', MAX_UPLOAD_BYTES + 1, 'resume')).toMatchObject({ ok: false });
    expect(checkUpload('a.pdf', MAX_UPLOAD_BYTES, 'resume')).toEqual({ ok: true });
    expect(checkUpload('a.pdf', 0, 'resume')).toMatchObject({ ok: false });
  });
});

describe('saveUploads', () => {
  const base = () => mkdtempSync(join(tmpdir(), 'cf-up-'));
  const f = (name: string, text = 'x') => ({ name, data: Buffer.from(text) });

  test('saves under uploads/<sub> with timestamp prefix', () => {
    const root = base();
    const r = saveUploads([f('이력서.pdf', 'hello')], 'resume', 'resume', { baseDir: root, now: 123 });
    expect(r.saved).toHaveLength(1);
    expect(r.saved[0]).toBe(join(root, 'resume', '123-이력서.pdf'));
    expect(readFileSync(r.saved[0], 'utf8')).toBe('hello');
  });
  test('strips path parts from names so files stay inside', () => {
    const root = base();
    const r = saveUploads([f('..\\..\\evil.txt'), f('../x/y.md')], 'resume', 'resume', { baseDir: root, now: 1 });
    expect(r.saved).toHaveLength(2);
    for (const p of r.saved) {
      expect(relative(join(root, 'resume'), p).startsWith('..')).toBe(false);
      expect(existsSync(p)).toBe(true);
    }
  });
  test('same name twice does not overwrite', () => {
    const root = base();
    const r = saveUploads([f('a.txt', '1'), f('a.txt', '2')], 'resume', 'resume', { baseDir: root, now: 5 });
    expect(new Set(r.saved).size).toBe(2);
  });
  test('rejected files are reported and not saved', () => {
    const root = base();
    const r = saveUploads([f('a.exe'), f('ok.txt')], 'resume', 'resume', { baseDir: root, now: 1 });
    expect(r.saved).toHaveLength(1);
    expect(r.rejected).toEqual([{ name: 'a.exe', reason: expect.any(String) }]);
  });
});
