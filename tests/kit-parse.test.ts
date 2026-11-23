import { makeTmpDir } from './helpers/tmp';
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTestDb } from './helpers/db';
import { parseGuide } from '@/lib/kit/parse-guide';
import { checkBaseDoc, listItems, parseMdDoc, renderMdDoc, findSection } from '@/lib/kit/md-doc';
import { getKit, getLatestKit, getUsableKit, isSameAsLatestKit, readKitDoc, readKitText, saveKit } from '@/lib/kit/repo';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const read = (n: string) => readFileSync(join(DIR, n), 'utf8');
const GUIDE = read('서류_가이드.md');
const fixtureFiles = () =>
  readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) }));

describe('parseGuide (TC-KIT-01)', () => {
  const { guide, errors } = parseGuide(GUIDE);
  test('no errors', () => {
    expect(errors).toEqual([]);
    expect(guide).not.toBeNull();
  });
  test('tracks and parts', () => {
    expect(guide!.tracks.map((t) => [t.name, t.resumeFile, t.careerFile, t.defaultProfileId])).toEqual([
      ['백엔드', '이력서_백엔드_v1_20260101.md', '경력기술서_백엔드.md', 'B1'],
      ['데이터', '이력서_데이터.md', '경력기술서_데이터.md', 'D1'],
    ]);
    expect(guide!.tracks[0].parts).toEqual({
      competencies: ['API 설계', '데이터베이스', '클라우드 운영'],
      achievements: ['주문 처리 개선', '배치 안정화', '캐시 도입'],
      chapters: ['가상커머스', '예시소프트', '샘플랩'],
      projects: ['가계부 앱', '독서 기록 서비스', '날씨 알림 봇'],
    });
  });
  test('profiles', () => {
    expect(guide!.profiles).toHaveLength(4);
    const b2 = guide!.profiles.find((p) => p.id === 'B2')!;
    expect(b2).toMatchObject({
      name: '성능',
      track: '백엔드',
      isDefault: false,
      keywords: ['성능', '트래픽', '캐시'],
      introId: 'B2',
      competencyOrder: [1, 0, 2],
      achievementOrder: [2, 0, 1],
      chapterOrder: [1, 0, 2],
      projects: ['날씨 알림 봇'],
    });
    expect(guide!.profiles.find((p) => p.id === 'B1')).toMatchObject({ name: '범용', isDefault: true });
  });
  test('adjustments, intros, terms, checklist', () => {
    const adj = guide!.adjustments.filter((a) => a.track === '백엔드');
    expect(adj).toHaveLength(3);
    expect(adj[0]).toMatchObject({ triggers: ['캐시', '레디스'], instruction: '주요 성과 3을 1번째로' });
    expect(guide!.adjustments.filter((a) => a.track === '데이터')).toHaveLength(1);
    expect(guide!.intros.B1).toBe('범용 백엔드 개발자로 안정적인 서비스를 만듭니다.'); // ※ 줄 제외
    expect(guide!.intros.B2).toContain('성능과 안정성');
    expect(guide!.terms[0]).toEqual({ original: '서버 개발', allowed: ['백엔드 개발', '서버 구축'], forbidden: ['풀스택 전문가'] });
    expect(guide!.terms[1].forbidden).toEqual(['업계 최고', '독보적']);
    expect(guide!.checklist).toEqual(['회사 이름이 맞는지 확인', '날짜와 숫자를 확인']);
  });
});

describe('parseGuide errors (TC-KIT-02)', () => {
  test('missing section names the section', () => {
    const md = GUIDE.replace('## 6. 자기소개 후보', '## 6. 소개 모음');
    const r = parseGuide(md);
    expect(r.guide).toBeNull();
    expect(r.errors.some((e) => e.where.includes('자기소개 후보'))).toBe(true);
  });
  test('wrong column count points at the table and line', () => {
    const md = GUIDE.replace('| B2 성능 | 성능, 트래픽, 캐시 | B2 | ⓑ ⓐ ⓒ | 3 1 2 | 2 1 3 | 날씨 알림 봇 |', '| B2 성능 | 성능, 트래픽, 캐시 | B2 | ⓑ ⓐ ⓒ |');
    const r = parseGuide(md);
    expect(r.guide).toBeNull();
    expect(r.errors.some((e) => e.where.includes('백엔드') && /열/.test(e.message))).toBe(true);
  });
  test('unknown intro id is an error', () => {
    const r = parseGuide(GUIDE.replace('| B2 성능 | 성능, 트래픽, 캐시 | B2 |', '| B2 성능 | 성능, 트래픽, 캐시 | ZZ |'));
    expect(r.guide).toBeNull();
    expect(r.errors.some((e) => e.message.includes('ZZ'))).toBe(true);
  });
});

describe('checkBaseDoc (TC-KIT-03)', () => {
  const { guide } = parseGuide(GUIDE);
  const track = guide!.tracks[0];
  test('fixture docs are consistent', () => {
    expect(checkBaseDoc(parseMdDoc(read('이력서_백엔드_v1_20260101.md')), track, 'resume')).toEqual([]);
    expect(checkBaseDoc(parseMdDoc(read('경력기술서_백엔드.md')), track, 'career')).toEqual([]);
  });
  test('competency count mismatch', () => {
    const md = read('이력서_백엔드_v1_20260101.md').replace('- **클라우드 운영**: 배포 자동화\n', '');
    const errs = checkBaseDoc(parseMdDoc(md), track, 'resume');
    expect(errs.some((e) => e.where.includes('핵심 역량'))).toBe(true);
  });
  test('project name matching 0 or 2 headings', () => {
    const none = read('이력서_백엔드_v1_20260101.md').replace('### 날씨 알림 봇', '### 전혀 다른 제목');
    expect(checkBaseDoc(parseMdDoc(none), track, 'resume').some((e) => e.message.includes('날씨 알림 봇'))).toBe(true);
    const two = read('이력서_백엔드_v1_20260101.md').replace('### 독서 기록 서비스', '### 가계부 앱 두 번째');
    expect(checkBaseDoc(parseMdDoc(two), track, 'resume').some((e) => e.message.includes('가계부 앱'))).toBe(true);
  });
  test('chapter count mismatch in career doc', () => {
    const md = read('경력기술서_백엔드.md').replace('## 3. 샘플랩 (2018 – 2020)', '### 3. 샘플랩 (2018 – 2020)');
    expect(checkBaseDoc(parseMdDoc(md), track, 'career').some((e) => e.where.includes('장'))).toBe(true);
  });
});

describe('md-doc round trip (TC-KIT-04)', () => {
  test('parse then render equals the source', () => {
    for (const n of ['이력서_백엔드_v1_20260101.md', '경력기술서_백엔드.md', '서류_가이드.md']) {
      const src = read(n);
      expect(renderMdDoc(parseMdDoc(src)).trimEnd()).toBe(src.trimEnd());
    }
  });
  test('findSection and listItems', () => {
    const doc = parseMdDoc(read('이력서_백엔드_v1_20260101.md'));
    const ach = findSection(doc, (t) => t.includes('주요 성과'))!;
    const { items, before, after } = listItems(ach.lines, 'ordered');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveLength(3); // 하위 줄 두 개가 함께 있다
    expect(items[0][1]).toContain('병목');
    expect([...before, ...items.flat(), ...after].join('\n').trim()).toBe(ach.lines.join('\n').trim());
  });
});

describe('parseGuide without tracks (TC-KIT-06)', () => {
  test('a guide whose base-document table has no rows is an error, not a crash later', () => {
    const empty = GUIDE.split('\n').filter((l) => !l.startsWith('| 백엔드 |') && !l.startsWith('| 데이터 |')).join('\n');
    const { guide, errors } = parseGuide(empty);
    expect(guide).toBeNull();
    expect(errors.some((e) => e.where.includes('기본 서류') && e.message.includes('직무'))).toBe(true);
  });
});

describe('saveKit (TC-KIT-05)', () => {
  test('roles, files on disk, label, usable kit', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-');
    const { kitId, errors } = saveKit(fixtureFiles(), db, dir);
    expect(errors).toEqual([]);
    const kit = getKit(kitId, db)!;
    expect(kit.label).toBe('v1_20260101');
    const roles = Object.fromEntries(kit.files.map((f) => [f.name, f.role]));
    expect(roles['서류_가이드.md']).toBe('guide');
    expect(roles['작성_규칙.md']).toBe('rules');
    expect(roles['마스터스토리.md']).toBe('master');
    expect(roles['이력서_백엔드_v1_20260101.md']).toBe('resume');
    expect(roles['경력기술서_데이터.md']).toBe('career');
    expect(roles['style.css']).toBe('style');
    expect(kit.files.find((f) => f.name === '이력서_데이터.md')).toMatchObject({ track: '데이터' });
    expect(kit.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(dir, String(kitId), '서류_가이드.md'))).toBe(true);
    expect(kit.parsed!.styleCss).toContain('Pretendard');
    expect(getUsableKit(db)!.id).toBe(kitId);
    expect(readKitDoc(kitId, '데이터', 'resume', db, dir)).toContain('데이터 엔지니어');
    expect(readKitText(kitId, 'master', db, dir)).toContain('마스터스토리');
  });

  test('missing required files are errors; broken kit is saved but not usable; older kit stays', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-');
    const good = saveKit(fixtureFiles(), db, dir);
    const without = fixtureFiles().filter((f) => f.name !== '작성_규칙.md' && f.name !== '경력기술서_데이터.md');
    const bad = saveKit(without, db, dir);
    expect(bad.errors.some((e) => e.message.includes('작성 규칙'))).toBe(true);
    expect(bad.errors.some((e) => e.file.includes('경력기술서_데이터.md'))).toBe(true);
    expect(getLatestKit(db)!.id).toBe(bad.kitId);
    expect(getUsableKit(db)!.id).toBe(good.kitId); // 오류 키트는 건너뛴다
    expect(existsSync(join(dir, String(good.kitId), '서류_가이드.md'))).toBe(true); // 이전 키트 유지
  });

  test('unknown file, path characters and python style file', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-');
    const files = fixtureFiles().filter((f) => f.name !== 'style.css');
    files.push({ name: '메모.md', data: Buffer.from('# 아무 파일') });
    files.push({ name: '../build_pdf.py', data: Buffer.from('X = 1\nCSS = """\nbody { color: red; }\n"""\nprint("실행되지 않는다")\n') });
    const { kitId, errors } = saveKit(files, db, dir);
    expect(errors.some((e) => e.file === '메모.md' && e.message.includes('어디에 쓰이는지'))).toBe(true);
    const kit = getKit(kitId, db)!;
    expect(kit.files.some((f) => f.name === 'build_pdf.py' && f.role === 'style')).toBe(true);
    expect(kit.parsed!.styleCss).toContain('color: red');
    expect(kit.parsed!.styleCss).not.toContain('print');
    expect(existsSync(join(dir, String(kitId), 'build_pdf.py'))).toBe(true);
  });

  test('file names: Windows-forbidden characters and colons are rejected, duplicates are an error (TC-KIT-07)', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-');
    for (const bad of ['메모:1.md', '메모?.md', '메모*.md', '메모\"x\".md', '메모<a>.md', '메모|a.md', 'CON.md', '끝점.md.']) {
      expect(() => saveKit([...fixtureFiles(), { name: bad, data: Buffer.from('x') }], db, dir), bad).toThrow('파일 이름');
    }
    expect(() => saveKit([...fixtureFiles(), { name: '서류_가이드.md', data: Buffer.from('x') }], db, dir)).toThrow('같은 이름');
    expect(getLatestKit(db)).toBeNull(); // 거부된 올리기는 키트 행을 남기지 않는다
  });

  test('a failure while writing files leaves no kit row behind (TC-KIT-08)', () => {
    const db = makeTestDb();
    const dir = join(makeTmpDir('cf-kit-'), 'blocked');
    writeFileSync(dir, 'a file where the kit folder should go'); // 폴더를 만들 수 없게 한다
    expect(() => saveKit(fixtureFiles(), db, dir)).toThrow();
    expect(getLatestKit(db)).toBeNull();
  });

  test('size limits', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-');
    expect(() => saveKit([{ name: '큰.md', data: Buffer.alloc(1024 * 1024 + 1, 97) }], db, dir)).toThrow('1MB');
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `파일${i}.md`, data: Buffer.from('x') }));
    expect(() => saveKit(many, db, dir)).toThrow('10개');
  });
});

describe('isSameAsLatestKit (TC-KIT-35, 화면 문서 5.6: 같은 내용이면 새 버전을 만들지 않는다)', () => {
  test('same files and names are the same; a changed, added or missing file is not', () => {
    const db = makeTestDb();
    const dir = makeTmpDir('cf-kit-');
    expect(isSameAsLatestKit(fixtureFiles(), db)).toBe(false); // 키트가 아직 없다
    saveKit(fixtureFiles(), db, dir);
    expect(isSameAsLatestKit(fixtureFiles(), db)).toBe(true);
    expect(isSameAsLatestKit(fixtureFiles().reverse(), db)).toBe(true);

    const changed = fixtureFiles().map((f) => (f.name === '마스터스토리.md' ? { ...f, data: Buffer.concat([f.data, Buffer.from('\n추가')]) } : f));
    expect(isSameAsLatestKit(changed, db)).toBe(false);
    expect(isSameAsLatestKit(fixtureFiles().slice(1), db)).toBe(false);
    expect(isSameAsLatestKit([...fixtureFiles(), { name: '새.md', data: Buffer.from('x') }], db)).toBe(false);
  });
});
