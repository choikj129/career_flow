import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  docFileName,
  docLabel,
  parseDocFileName,
  pickDocFile,
  pickDocs,
  type DocFile,
} from '@/lib/documents/files';
import { listDocFiles, resolveDocPath, docFileExists } from '@/lib/documents/folder';

const FILES: DocFile[] = [
  ['resume', '2026-09-05'],
  ['resume', '2026-10-17'],
  ['resume', '2026-11-02'],
  ['career', '2026-10-17'],
  ['career', '2026-11-02'],
  ['portfolio', '2026-07-22'],
  ['portfolio', '2026-10-17'],
].map(([kind, date]) => ({
  kind: kind as DocFile['kind'],
  date,
  fileName: docFileName(kind as DocFile['kind'], date),
}));

describe('pickDocFile / pickDocs (TC-PAST-01)', () => {
  test('before the earliest resume/career, only portfolio is known', () => {
    expect(pickDocFile('resume', '2026-08-01', FILES)).toBeNull();
    expect(pickDocFile('career', '2026-08-01', FILES)).toBeNull();
    expect(pickDocFile('portfolio', '2026-08-01', FILES)).toBe('포트폴리오_20260722.pdf');
  });
  test('same day is included', () => {
    expect(pickDocs('2026-10-17', FILES)).toEqual({
      resume: '이력서_20261017.pdf',
      career: '경력기술서_20261017.pdf',
      portfolio: '포트폴리오_20261017.pdf',
    });
  });
  test('before everything -> all null', () => {
    expect(pickDocs('2026-07-21', FILES)).toEqual({ resume: null, career: null, portfolio: null });
  });
  test('later date picks latest per kind', () => {
    expect(pickDocs('2026-11-19', FILES)).toEqual({
      resume: '이력서_20261102.pdf',
      career: '경력기술서_20261102.pdf',
      portfolio: '포트폴리오_20261017.pdf',
    });
  });
  test('invalid applied date -> null', () => {
    expect(pickDocFile('resume', '', FILES)).toBeNull();
    expect(pickDocFile('resume', '2026-13-45', FILES)).toBeNull();
  });
});

describe('parseDocFileName (TC-PAST-02)', () => {
  test('accepts the rule', () => {
    expect(parseDocFileName('이력서_20260905.pdf')).toEqual({
      kind: 'resume',
      date: '2026-09-05',
      fileName: '이력서_20260905.pdf',
    });
    expect(parseDocFileName('경력기술서_20261102.pdf')?.kind).toBe('career');
    expect(parseDocFileName('포트폴리오_20260722.pdf')?.kind).toBe('portfolio');
  });
  test('rejects everything else', () => {
    for (const n of [
      '이력서_20260905_back.pdf',
      '이력서.pdf',
      '이력서_20260905.docx',
      '이력서_20261345.pdf',
      '이력서_20260905.PDF',
      '자기소개서_20260905.pdf',
      '../이력서_20260905.pdf',
    ]) {
      expect(parseDocFileName(n), n).toBeNull();
    }
  });
  test('docLabel', () => {
    expect(docLabel('경력기술서_20261102.pdf')).toBe('경력기술서 2026-11-02');
    expect(docLabel('아무거나.pdf')).toBe('아무거나.pdf');
  });
});

function makeDocsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cf-docs-'));
  for (const k of ['resume', 'career', 'portfolio']) mkdirSync(join(dir, k), { recursive: true });
  return dir;
}

describe('listDocFiles (TC-PAST-03)', () => {
  test('valid files only, wrong-kind folder goes to ignored', () => {
    const dir = makeDocsDir();
    writeFileSync(join(dir, 'resume', '이력서_20260905.pdf'), 'x');
    writeFileSync(join(dir, 'resume', '이력서_20261102.pdf'), 'x');
    writeFileSync(join(dir, 'resume', '메모.txt'), 'x');
    writeFileSync(join(dir, 'career', '이력서_20261102.pdf'), 'x');
    const { files, ignored } = listDocFiles(dir);
    expect(files.map((f) => f.fileName)).toEqual(['이력서_20261102.pdf', '이력서_20260905.pdf']);
    expect(ignored.sort()).toEqual(['메모.txt', '이력서_20261102.pdf'].sort());
  });
  test('missing folder -> empty', () => {
    expect(listDocFiles(join(tmpdir(), 'cf-no-such-dir-xyz'))).toEqual({ files: [], ignored: [] });
  });
});

describe('resolveDocPath (TC-PAST-04)', () => {
  test('rejects traversal', () => {
    const dir = makeDocsDir();
    expect(resolveDocPath('../x.pdf', dir)).toBeNull();
    expect(resolveDocPath('이력서_20260905.pdf/../../a', dir)).toBeNull();
    expect(resolveDocPath('C:\a\이력서_20260905.pdf', dir)).toBeNull();
    expect(resolveDocPath('career-flow.db', dir)).toBeNull();
  });
  test('normal name resolves inside the kind folder', () => {
    const dir = makeDocsDir();
    expect(resolveDocPath('이력서_20260905.pdf', dir)).toBe(join(dir, 'resume', '이력서_20260905.pdf'));
  });
  test('docFileExists', () => {
    const dir = makeDocsDir();
    writeFileSync(join(dir, 'resume', '이력서_20260905.pdf'), 'x');
    expect(docFileExists('이력서_20260905.pdf', dir)).toBe(true);
    expect(docFileExists('이력서_20260906.pdf', dir)).toBe(false);
    expect(docFileExists('../이력서_20260905.pdf', dir)).toBe(false);
  });
});
