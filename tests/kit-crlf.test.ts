import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTestDb } from './helpers/db';
import { makeTmpDir } from './helpers/tmp';
import { parseGuide } from '@/lib/kit/parse-guide';
import { assemble } from '@/lib/kit/assemble';
import { checkBaseDoc, normalizeNewlines, parseMdDoc, renderMdDoc } from '@/lib/kit/md-doc';
import { readKitDoc, readKitText, saveKit } from '@/lib/kit/repo';
import { buildPdfHtml, mdToSectionHtml } from '@/lib/pdf/md-html';

// 사용자 키트는 Windows에서 CRLF일 수 있다. 같은 내용이 LF일 때와 같은 결과여야 한다(체크아웃 설정과 무관).
const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const lf = (n: string) => readFileSync(join(DIR, n), 'utf8').replace(/\r\n/g, '\n');
const crlf = (n: string) => lf(n).replace(/\n/g, '\r\n');
const RESUME = '이력서_백엔드_v1_20260101.md';
const CAREER = '경력기술서_백엔드.md';
const GUIDE = '서류_가이드.md';

describe('CRLF kit files (TC-KIT-36)', () => {
  test('normalizeNewlines', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  test('parseGuide gives the same result and no errors', () => {
    const a = parseGuide(lf(GUIDE));
    const b = parseGuide(crlf(GUIDE));
    expect(b.errors).toEqual([]);
    expect(b.guide).toEqual(a.guide);
  });

  test('round trip renders LF text equal to the source', () => {
    for (const n of [RESUME, CAREER, GUIDE]) {
      expect(renderMdDoc(parseMdDoc(crlf(n))).trimEnd()).toBe(lf(n).trimEnd());
    }
  });

  test('checkBaseDoc finds the same problems', () => {
    const track = parseGuide(lf(GUIDE)).guide!.tracks[0];
    const bad = lf(RESUME).replace('- **클라우드 운영**: 배포 자동화\n', '');
    const a = checkBaseDoc(parseMdDoc(bad), track, 'resume');
    const b = checkBaseDoc(parseMdDoc(bad.replace(/\n/g, '\r\n')), track, 'resume');
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(checkBaseDoc(parseMdDoc(crlf(RESUME)), track, 'resume')).toEqual([]);
  });

  test('assemble gives the same result for CRLF base docs', () => {
    const kit = parseGuide(crlf(GUIDE)).guide!;
    const run = (resumeMd: string, careerMd: string) => assemble(kit, { resumeMd, careerMd }, { track: '백엔드', profileId: 'B2', adjustmentIds: [] });
    const a = run(lf(RESUME), lf(CAREER));
    const b = run(crlf(RESUME), crlf(CAREER));
    expect(b.resumeMd).toBe(a.resumeMd);
    expect(b.careerMd).toBe(a.careerMd);
    expect(b.resumeMd).not.toContain('\r');
  });

  test('saveKit stores CRLF files and reads them back as LF', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-crlf-');
    const files = readdirSync(DIR).map((name) => ({
      name,
      data: Buffer.from(name.endsWith('.md') ? crlf(name) : readFileSync(join(DIR, name), 'utf8')),
    }));
    const r = saveKit(files, db, dir);
    expect(r.errors).toEqual([]);
    const doc = readKitDoc(r.kitId, '백엔드', 'resume', db, dir);
    expect(doc).not.toContain('\r');
    expect(doc.trimEnd()).toBe(lf(RESUME).trimEnd());
    expect(readKitText(r.kitId, 'guide', db, dir)).not.toContain('\r');
  });

  test('PDF html is the same for CRLF markdown', () => {
    const md = lf(RESUME);
    const md2 = crlf(RESUME);
    expect(mdToSectionHtml(md2)).toBe(mdToSectionHtml(md));
    expect(buildPdfHtml(md2, null)).toBe(buildPdfHtml(md, null));
  });
});
