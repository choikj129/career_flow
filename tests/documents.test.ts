import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DOC_NONE,
  docFileName,
  docFileOf,
  docValueText,
  isValidDocValue,
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
import { countDocUsage, countDocsNotesPending, markDocsNoneBeforeFirst, migrateDocsFromNotes } from '@/lib/documents/migrate';
import { listDocFiles, resolveDocPath, docFileExists, docExistence, docExistenceIn } from '@/lib/documents/folder';

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
  test('before the earliest file: resume unknown, career none, portfolio picked', () => {
    expect(pickDocFile('resume', '2026-08-01', FILES)).toBeNull();
    expect(pickDocFile('career', '2026-08-01', FILES)).toBe(DOC_NONE);
    expect(pickDocFile('portfolio', '2026-08-01', FILES)).toBe('포트폴리오_20260722.pdf');
  });
  test('same day is included', () => {
    expect(pickDocs('2026-10-17', FILES)).toEqual({
      resume: '이력서_20261017.pdf',
      career: '경력기술서_20261017.pdf',
      portfolio: '포트폴리오_20261017.pdf',
    });
  });
  test('before everything -> resume null, career/portfolio none', () => {
    expect(pickDocs('2026-07-21', FILES)).toEqual({ resume: null, career: DOC_NONE, portfolio: DOC_NONE });
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

// ---- Task 8: "없음" 값 ----

describe('none value (TC-PAST-70, 71)', () => {
  test('pickDocFile before the earliest file: career/portfolio none, resume null', () => {
    expect(pickDocFile('resume', '2026-08-01', FILES)).toBeNull();
    expect(pickDocFile('career', '2026-08-01', FILES)).toBe(DOC_NONE);
    expect(pickDocFile('portfolio', '2026-08-01', FILES)).toBe('포트폴리오_20260722.pdf');
  });
  test('before everything', () => {
    expect(pickDocs('2026-07-21', FILES)).toEqual({ resume: null, career: DOC_NONE, portfolio: DOC_NONE });
  });
  test('boundary day for career', () => {
    expect(pickDocFile('career', '2026-10-16', FILES)).toBe(DOC_NONE);
    expect(pickDocFile('career', '2026-10-17', FILES)).toBe('경력기술서_20261017.pdf');
  });
  test('no career files at all -> null (app cannot know)', () => {
    expect(pickDocFile('career', '2026-01-01', FILES.filter((f) => f.kind !== 'career'))).toBeNull();
  });
  test('invalid applied date -> all null', () => {
    expect(pickDocs('', FILES)).toEqual({ resume: null, career: null, portfolio: null });
  });
});

describe('doc value helpers (TC-PAST-73)', () => {
  test('isValidDocValue', () => {
    expect(isValidDocValue('career', DOC_NONE)).toBe(true);
    expect(isValidDocValue('portfolio', DOC_NONE)).toBe(true);
    expect(isValidDocValue('resume', DOC_NONE)).toBe(false);
    expect(isValidDocValue('career', '경력기술서_20261017.pdf')).toBe(true);
    expect(isValidDocValue('career', '이력서_20260905.pdf')).toBe(false);
    expect(isValidDocValue('resume', null)).toBe(true);
  });
  test('docFileOf and docValueText', () => {
    expect(docFileOf(DOC_NONE)).toBeNull();
    expect(docFileOf(null)).toBeNull();
    expect(docFileOf('이력서_20260905.pdf')).toBe('이력서_20260905.pdf');
    expect(docValueText(null)).toBe('모름');
    expect(docValueText(DOC_NONE)).toBe('없음');
    expect(docValueText('이력서_20260905.pdf')).toBe('2026-09-05');
  });
  test('docExistence treats none as no file', () => {
    expect(docExistence({ career: DOC_NONE }, join(tmpdir(), 'cf-nothing')).career).toBe(false);
    expect(docExistenceIn({ career: DOC_NONE, resume: '이력서_20260905.pdf' }, new Set(['이력서_20260905.pdf']))).toEqual({
      resume: true,
      career: false,
      portfolio: false,
    });
  });
});

describe('none value in migration and marking (TC-PAST-74)', () => {
  const base = { companyName: '토스', positionTitle: 'A', site: 'wanted' as const, status: 'applied' as const };
  function dirWithFiles() {
    const dir = makeDocsDir();
    for (const f of ['resume/이력서_20260905.pdf', 'career/경력기술서_20261017.pdf', 'portfolio/포트폴리오_20260722.pdf']) {
      writeFileSync(join(dir, f), 'x');
    }
    return dir;
  }
  const NOTE = (r: string, c: string, p: string) => `제출 서류: 이력서 ${r} / 경력기술서 ${c} / 포트폴리오 ${p}`;

  test('migrateDocsFromNotes applies the none boundary to notes that say 모름', () => {
    const dir = dirWithFiles();
    const db = makeTestDb();
    bulkCreateApplications(
      [
        { ...base, appliedAt: '2026-08-01', notes: NOTE('모름', '모름', '2026-07-22') },
        { ...base, companyName: '당근', appliedAt: '2026-10-20', notes: NOTE('모름', '모름', '모름') },
      ],
      db,
    );
    expect(migrateDocsFromNotes(dir, db).migrated).toBe(2);
    const all = db.select().from(applications).all();
    const a = all.find((x) => x.appliedAt === '2026-08-01')!;
    const b = all.find((x) => x.appliedAt === '2026-10-20')!;
    expect(a.submittedDocs).toEqual({ resume: null, career: DOC_NONE, portfolio: '포트폴리오_20260722.pdf' });
    expect(b.submittedDocs).toEqual({ resume: null, career: null, portfolio: null }); // 메모의 모름은 모름 그대로
  });

  test('migrateDocsFromNotes: career 모름 after the first file stays null when no file is picked', () => {
    const dir = makeDocsDir(); // 경력기술서 파일 0개
    writeFileSync(join(dir, 'resume', '이력서_20260905.pdf'), 'x');
    const db = makeTestDb();
    bulkCreateApplications([{ ...base, appliedAt: '2026-10-20', notes: NOTE('2026-09-05', '모름', '모름') }], db);
    migrateDocsFromNotes(dir, db);
    expect(db.select().from(applications).get()!.submittedDocs).toEqual({ resume: '이력서_20260905.pdf', career: null, portfolio: null });
  });

  test('markDocsNoneBeforeFirst', () => {
    const dir = dirWithFiles();
    const db = makeTestDb();
    bulkCreateApplications(
      [
        { ...base, companyName: 'A', appliedAt: '2026-08-01', submittedDocs: { resume: '이력서_20260905.pdf', portfolio: '포트폴리오_20260722.pdf' } },
        { ...base, companyName: 'B', appliedAt: '2026-07-01' },
        { ...base, companyName: 'C', appliedAt: '2026-07-01', notes: NOTE('모름', '모름', '모름') },
        { ...base, companyName: 'D', appliedAt: '2026-10-20' },
        { ...base, companyName: 'E', appliedAt: '2026-08-01', submittedDocs: { career: DOC_NONE } },
      ],
      db,
      dir,
    );
    const snap = () => db.select().from(applications).all().map((x) => JSON.stringify([x.id, x.submittedDocs]));
    const before = snap();
    const dry = markDocsNoneBeforeFirst(dir, db, { dryRun: true });
    expect(dry).toEqual({ updated: 2, byKind: { career: 2, portfolio: 1 }, pendingNotes: 1 });
    expect(snap()).toEqual(before);

    const r = markDocsNoneBeforeFirst(dir, db);
    expect(r).toEqual({ updated: 2, byKind: { career: 2, portfolio: 1 }, pendingNotes: 1 });
    const rows = db.select().from(applications).all();
    const at = (i: number) => rows[i].submittedDocs;
    expect(at(0)).toEqual({ resume: '이력서_20260905.pdf', portfolio: '포트폴리오_20260722.pdf', career: DOC_NONE });
    expect(at(1)).toEqual({ resume: null, career: DOC_NONE, portfolio: DOC_NONE });
    expect(at(2)).toBeNull(); // 메모 이관 전 기록은 건너뜀
    expect(at(3)).toBeNull(); // 파일 이후 지원
    expect(at(4)).toEqual({ career: DOC_NONE }); // 이미 값 있음
    expect(markDocsNoneBeforeFirst(dir, db)).toMatchObject({ updated: 0 });
  });

  test('markDocsNoneBeforeFirst skips a kind with no files in the folder', () => {
    const dir = makeDocsDir();
    writeFileSync(join(dir, 'career', '경력기술서_20261017.pdf'), 'x');
    const db = makeTestDb();
    bulkCreateApplications([{ ...base, appliedAt: '2026-07-01' }], db);
    const r = markDocsNoneBeforeFirst(dir, db);
    expect(r.byKind).toEqual({ career: 1, portfolio: 0 });
    expect(db.select().from(applications).get()!.submittedDocs).toEqual({ resume: null, career: DOC_NONE, portfolio: null });
  });

  test('countDocUsage ignores none', () => {
    const dir = dirWithFiles();
    const db = makeTestDb();
    bulkCreateApplications(
      [{ ...base, appliedAt: '2026-11-01', submittedDocs: { resume: '이력서_20260905.pdf', career: DOC_NONE } }],
      db,
      dir,
    );
    expect([...countDocUsage(db).entries()]).toEqual([['이력서_20260905.pdf', 1]]);
  });
});
