import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  docFileName,
  docLabel,
  formatDocsNote,
  parseDocFileName,
  parseDocsNote,
  pickDocFile,
  pickDocs,
  type DocFile,
} from '@/lib/documents/files';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { applications } from '@/lib/db/schema';
import { bulkCreateApplications } from '@/lib/applications/repo';
import { countDocsNotesPending, migrateDocsFromNotes } from '@/lib/documents/migrate';
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

describe('docs note (TC-PAST-20)', () => {
  const dates = { resume: '2026-09-05', career: null, portfolio: '2026-07-22' };
  test('round trip', () => {
    const line = formatDocsNote(dates);
    expect(line).toBe('제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22');
    expect(parseDocsNote(line)).toEqual({ dates, rest: '' });
  });
  test('keeps the other lines', () => {
    const r = parseDocsNote(`메일 가져오기(원티드)\n${formatDocsNote(dates)}\n추가 메모`);
    expect(r?.rest).toBe('메일 가져오기(원티드)\n추가 메모');
  });
  test('other formats are null', () => {
    expect(parseDocsNote('제출 서류: 이력서 9/5')).toBeNull();
    expect(parseDocsNote('메모만')).toBeNull();
  });
});

describe('migrateDocsFromNotes (TC-PAST-21)', () => {
  const base = { companyName: '토스', positionTitle: 'A', site: 'wanted' as const, appliedAt: '2026-11-05', status: 'applied' as const };
  function setup(notes: string) {
    const dir = makeDocsDir();
    for (const f of ['resume/이력서_20260905.pdf', 'portfolio/포트폴리오_20260722.pdf']) writeFileSync(join(dir, f), 'x');
    const db = makeTestDb();
    bulkCreateApplications([{ ...base, notes }], db);
    return { dir, db };
  }
  const get = (db: ReturnType<typeof makeTestDb>) => db.select().from(applications).get()!;

  test('moves dates to file names, keeps first line', () => {
    const { dir, db } = setup('메일 가져오기(원티드)\n제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22');
    expect(countDocsNotesPending(db)).toBe(1);
    expect(migrateDocsFromNotes(dir, db)).toEqual({ migrated: 1, skipped: [] });
    const a = get(db);
    expect(a.notes).toBe('메일 가져오기(원티드)');
    expect(a.submittedDocs).toEqual({ resume: '이력서_20260905.pdf', career: null, portfolio: '포트폴리오_20260722.pdf' });
    expect(countDocsNotesPending(db)).toBe(0);
  });
  test('notes become null when only that line', () => {
    const { dir, db } = setup('제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22');
    migrateDocsFromNotes(dir, db);
    expect(get(db).notes).toBeNull();
  });
  test('missing file skips the record untouched', () => {
    const notes = '제출 서류: 이력서 2026-01-01 / 경력기술서 모름 / 포트폴리오 2026-07-22';
    const { dir, db } = setup(notes);
    const r = migrateDocsFromNotes(dir, db);
    expect(r.migrated).toBe(0);
    expect(r.skipped).toEqual([{ applicationId: get(db).id, missing: ['이력서_20260101.pdf'] }]);
    expect(get(db).notes).toBe(notes);
    expect(get(db).submittedDocs).toBeNull();
  });
  test('second run is a no-op', () => {
    const { dir, db } = setup('제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22');
    migrateDocsFromNotes(dir, db);
    expect(migrateDocsFromNotes(dir, db).migrated).toBe(0);
  });
  test('different format line is not a target', () => {
    const { dir, db } = setup('제출 서류: 이력서 9/5');
    expect(migrateDocsFromNotes(dir, db).migrated).toBe(0);
    expect(countDocsNotesPending(db)).toBe(0);
    expect(db.select().from(applications).where(eq(applications.id, get(db).id)).get()!.notes).toBe('제출 서류: 이력서 9/5');
  });
});
