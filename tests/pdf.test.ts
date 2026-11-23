import { makeTmpDir } from './helpers/tmp';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { acquireBrowserLock } from '@/lib/extract/browser';
import { fontFaceCss } from '@/lib/pdf/fonts';
import { buildPdfHtml, mdToSectionHtml } from '@/lib/pdf/md-html';
import { contentDisposition, kitPdfFileName, personNameFromMd } from '@/lib/pdf/names';
import { renderPdf } from '@/lib/pdf/render';
import { parseRouteId } from '@/lib/route-id';
import { buildPostingMd } from '@/lib/tailored/posting-md';

const FIX = join(process.cwd(), 'tests', 'fixtures', 'kit');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('mdToSectionHtml (TC-PDF-01, TC-PDF-02)', () => {
  test('TC-PDF-01 raw html and script in md are shown as text, unsafe links and images are dropped', () => {
    const html = mdToSectionHtml(
      [
        '# 가상 · 개발자',
        '',
        '## 소개',
        '',
        '<script>alert(1)</script>',
        '',
        '문장 <img src=x onerror=alert(2)> 끝 [나쁜](javascript:alert(3)) [좋은](https://example.com) ![그림](http://evil.example/a.png)',
        '',
        '<!-- 숨은 주석 -->',
      ].join('\n'),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('<a href="https://example.com">좋은</a>');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('숨은 주석');
  });

  test('TC-PDF-02 h1 is followed by .profile box, h2 makes one section.sec each, name span', () => {
    const html = mdToSectionHtml(fixture('이력서_백엔드_v1_20260101.md'));
    const h1 = html.indexOf('<h1>');
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(html).toContain('<span class="name">홍길동</span> · 백엔드 개발자');
    expect(html.indexOf('class="box profile"')).toBeGreaterThan(h1);
    expect(html.indexOf('class="box profile"')).toBeLessThan(html.indexOf('<section class="sec">'));
    const h2s = fixture('이력서_백엔드_v1_20260101.md').match(/^## /gm)!.length;
    expect(html.match(/<section class="sec">/g)).toHaveLength(h2s);
    expect(html).toContain('<section class="sec"><h2>자기소개</h2><div class="body">');
    expect(html).toContain('gildong@example.com');
  });

  test('a title without "·" and a doc without hr still work; hr ends the profile box', () => {
    const a = mdToSectionHtml('# 제목만\n\n## 장\n\n내용');
    expect(a).toContain('<h1>제목만</h1>');
    expect(a).not.toContain('box profile');
    const b = mdToSectionHtml('# 가 · 나\n\n- 연락처\n\n---\n\n## 장\n\n내용');
    expect(b).toContain('box profile');
    expect(b).not.toContain('<hr');
  });
});

describe('mdToSectionHtml extras (TC-PDF-10, TC-PDF-11)', () => {
  test('TC-PDF-10 comments inside fenced and inline code are kept, comments elsewhere are removed', () => {
    const md = ['# 가 · 나', '', '## 장', '', '```', '<!-- 코드 안 주석 -->', '```', '', '인라인 `<!-- 인라인 주석 -->` 끝 <!-- 지울 주석 -->', ''].join('\n');
    const html = mdToSectionHtml(md);
    expect(html).toContain('&lt;!-- 코드 안 주석 --&gt;');
    expect(html).toContain('&lt;!-- 인라인 주석 --&gt;');
    expect(html).not.toContain('지울 주석');
  });

  test('TC-PDF-11 tables and nested lists are converted', () => {
    const md = ['# 가 · 나', '', '## 장', '', '| 열A | 열B |', '|---|---|', '| 값1 | 값2 |', '', '- 위', '  - 아래 항목', '- 다음', ''].join('\n');
    const html = mdToSectionHtml(md);
    expect(html).toContain('<table>');
    expect(html).toMatch(/<th[^>]*>열A<\/th>/);
    expect(html).toMatch(/<td[^>]*>값2<\/td>/);
    expect(html).toMatch(/<li>위\s*<ul>\s*<li>아래 항목<\/li>\s*<\/ul>\s*<\/li>/);
  });
});

describe('names (TC-PDF-03, TC-PDF-04)', () => {
  test('TC-PDF-03 kitPdfFileName: name_doc_track, path chars and spaces removed, no name', () => {
    expect(kitPdfFileName({ name: '홍길동', doc: 'resume', track: '백엔드' })).toBe('홍길동_이력서_백엔드.pdf');
    expect(kitPdfFileName({ name: '홍길동', doc: 'career', track: '데이터' })).toBe('홍길동_경력기술서_데이터.pdf');
    expect(kitPdfFileName({ name: '홍 길/동', doc: 'resume', track: '백엔드/데이터 팀' })).toBe('홍길동_이력서_백엔드데이터팀.pdf');
    expect(kitPdfFileName({ name: '', doc: 'resume', track: '백엔드' })).toBe('이력서_백엔드.pdf');
    expect(kitPdfFileName({ name: '..\\..\\x', doc: 'resume', track: 'a:b' })).not.toMatch(/[\\/:]/);
    expect(personNameFromMd('# 홍길동 · 백엔드 개발자\n')).toBe('홍길동');
    expect(personNameFromMd('본문만')).toBe('');
    // TC-PDF-12: "·"가 없는 제목은 이름이 아니다(제목 전체를 이름으로 쓰지 않는다)
    expect(personNameFromMd('# 제목만 있는 서류\n')).toBe('');
    expect(kitPdfFileName({ name: personNameFromMd('# 제목만 있는 서류'), doc: 'resume', track: '백엔드' })).toBe('이력서_백엔드.pdf');
  });

  test('TC-PDF-15 parseRouteId accepts only plain positive integers', () => {
    expect(parseRouteId('12')).toBe(12);
    expect(parseRouteId('0')).toBeNull();
    expect(parseRouteId('-1')).toBeNull();
    expect(parseRouteId('1.5')).toBeNull();
    expect(parseRouteId('abc')).toBeNull();
    expect(parseRouteId('')).toBeNull();
    expect(parseRouteId('99999999999999999999')).toBeNull();
  });

  test('TC-PDF-04 contentDisposition: attachment/inline, ascii fallback, utf-8 name, no header injection', () => {
    const a = contentDisposition('홍길동_이력서.pdf');
    expect(a).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
    expect(a).toContain(encodeURIComponent('홍길동_이력서.pdf'));
    expect(contentDisposition('a.pdf', true)).toMatch(/^inline;/);
    const bad = contentDisposition('x".pdf\r\nSet-Cookie: a=b');
    expect(bad).not.toMatch(/[\r\n]/);
    expect(bad.split('filename="')[1].split('";')[0]).not.toContain('"');
  });
});

describe('buildPdfHtml (TC-PDF-06)', () => {
  test('style = font + css + wrap rules; kit css is used, default otherwise; style cannot be closed early', () => {
    const withKit = buildPdfHtml('# 가 · 나\n\n## 장\n\n내용', 'body{color:red}');
    expect(withKit).toContain("font-family:'Pretendard'");
    expect(withKit).toContain('body{color:red}');
    expect(withKit).toContain('word-break: keep-all');
    expect(withKit).toContain('overflow-wrap: anywhere');
    expect(withKit).toContain('<div class="sheet">');
    expect(buildPdfHtml('# 가', null)).toContain('@page');
    const evil = buildPdfHtml('# 가', 'a{}</style><script>alert(1)</script>');
    expect(evil).not.toContain('</style><script>');
    expect(fontFaceCss()).toContain('font-weight:700');
  });

  test('TC-PDF-13 page-break rules apply with the default css and with kit css', () => {
    for (const html of [buildPdfHtml('# 가', null), buildPdfHtml('# 가', 'body{color:red}')]) {
      expect(html).toMatch(/h1,\s*h2,\s*h3[^{]*\{[^}]*break-after:\s*avoid/);
      expect(html).toMatch(/tr,\s*li[^{]*\{[^}]*break-inside:\s*avoid/);
    }
  });

  test('TC-PDF-13 preview adds side padding on screen only', () => {
    expect(buildPdfHtml('# 가', null, { preview: true })).toMatch(/@media screen\s*\{[^}]*padding/);
    expect(buildPdfHtml('# 가', null)).not.toContain('@media screen');
  });
});

describe('renderPdf (TC-PDF-05)', () => {
  test('makes a PDF with the font embedded, and waits for the browser lock', async () => {
    const release = await acquireBrowserLock();
    let done = false;
    const p = renderPdf(buildPdfHtml(fixture('이력서_백엔드_v1_20260101.md'), null), { lockTimeoutMs: 20_000 }).then((b) => {
      done = true;
      return b;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(done).toBe(false); // 잠금이 풀릴 때까지 기다린다
    release();
    const pdf = await p;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
    expect(pdf.toString('latin1')).toMatch(/Pretendard/);
  }, 60_000);

  test('lock timeout rejects', async () => {
    const release = await acquireBrowserLock();
    try {
      await expect(renderPdf('<p>x</p>', { lockTimeoutMs: 100 })).rejects.toThrow(/브라우저/);
    } finally {
      release();
    }
  });
});

describe('buildPostingMd (TC-PDF-09)', () => {
  test('has company, position, site, link, deadline, top 3 words, chosen recipe, posting text', () => {
    const md = buildPostingMd({
      company: '가상회사',
      position: '백엔드 개발자',
      site: '원티드',
      url: 'https://example.com/job/1',
      deadline: null,
      topWords: [
        { word: 'Kafka', count: 4 },
        { word: 'Java', count: 3 },
        { word: 'AWS', count: 2 },
        { word: '넷째', count: 1 },
      ],
      track: '백엔드',
      profileId: 'B2',
      profileName: '성능',
      adjustments: ['결제 경험 강조'],
      postingText: '본문 ``` 안에 코드',
    });
    for (const s of ['가상회사', '백엔드 개발자', '원티드', 'https://example.com/job/1', '- 마감: 없음', 'Kafka (4회)', 'AWS (2회)', '직무: 백엔드', 'B2 성능', '결제 경험 강조', '본문 ``` 안에 코드']) {
      expect(md).toContain(s);
    }
    expect(md).not.toContain('넷째');
    expect(md.indexOf('## 공고 본문')).toBeGreaterThan(md.indexOf('## 고른 직무'));
  });
});

describe('routes (TC-PDF-07, TC-PDF-08)', () => {
  type Ctx<P> = { params: Promise<P> };
  let tailored: (req: Request, c: Ctx<{ revisionId: string; doc: string }>) => Promise<Response>;
  let postingMd: (req: Request, c: Ctx<{ revisionId: string }>) => Promise<Response>;
  let kitRoute: (req: Request, c: Ctx<{ kitId: string; track: string; doc: string }>) => Promise<Response>;
  let revId = 0;
  let kitId = 0;

  beforeAll(async () => {
    process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-pdf-route-');
    const { getDb, runMigrations } = await import('@/lib/db/client');
    const db = getDb();
    runMigrations(db);
    const { saveKit } = await import('@/lib/kit/repo');
    const { registerPosting, setPostingText } = await import('@/lib/postings/repo');
    const { createRecipeRevision } = await import('@/lib/tailored/repo');
    kitId = saveKit(readdirSync(FIX).map((name) => ({ name, data: readFileSync(join(FIX, name)) })), db).kitId;
    const postingId = registerPosting({ url: 'https://example.com/pdf-route' }, db).postingId;
    setPostingText(postingId, 'Kafka Kafka Java 서버 공고 본문', db);
    revId = createRecipeRevision(postingId, { track: '백엔드', profileId: 'B2', adjustmentIds: [] }, db).id;
    tailored = (await import('@/app/api/tailored/[revisionId]/[doc]/route')).GET as never;
    postingMd = (await import('@/app/api/tailored/[revisionId]/posting-md/route')).GET as never;
    kitRoute = (await import('@/app/api/kit/[kitId]/[track]/[doc]/route')).GET as never;
  });

  const callT = (id: string | number, doc: string, qs = '') =>
    tailored(new Request(`http://127.0.0.1:3939/api/tailored/${id}/${doc}${qs}`), { params: Promise.resolve({ revisionId: String(id), doc }) });

  test('404 missing revision, 400 bad doc and bad format', async () => {
    expect((await callT(99999, 'resume')).status).toBe(404);
    expect((await callT('abc', 'resume')).status).toBe(404);
    expect((await callT(revId, 'other')).status).toBe(400);
    expect((await callT(revId, 'resume', '?format=docx')).status).toBe(400);
  });

  test('md format: text/markdown, attachment, same file name with .md, body is the revision md', async () => {
    const res = await callT(revId, 'resume', '?format=md');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const cd = res.headers.get('content-disposition')!;
    expect(cd).toMatch(/^attachment;/);
    expect(decodeURIComponent(cd)).toContain('홍길동_이력서_백엔드.md');
    expect(await res.text()).toContain('# 홍길동 · 백엔드 개발자');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('TC-PDF-08 html preview has the locked-down CSP and no script', async () => {
    const res = await callT(revId, 'career', '?format=html&inline=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('font-src data:');
    expect(csp).not.toMatch(/script-src/);
    expect(await res.text()).not.toContain('<script');
  });

  test('pdf format (default): application/pdf, inline when asked, file name', async () => {
    const dl = await callT(revId, 'resume');
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toBe('application/pdf');
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(decodeURIComponent(dl.headers.get('content-disposition')!)).toContain('홍길동_이력서_백엔드.pdf');
    expect(Buffer.from(await dl.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    const inl = await callT(revId, 'career', '?format=pdf&inline=1');
    expect(inl.headers.get('content-disposition')).toMatch(/^inline;/);
  }, 60_000);

  test('503 when the browser lock is not available in time', async () => {
    const { renderPdf: _ignored } = await import('@/lib/pdf/render');
    void _ignored;
    const release = await acquireBrowserLock();
    try {
      const { vi } = await import('vitest');
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const p = callT(revId, 'resume');
      await vi.advanceTimersByTimeAsync(31_000);
      vi.useRealTimers();
      expect((await p).status).toBe(503);
    } finally {
      release();
    }
  });

  test('TC-PDF-09 posting-md route: 공고.md with the posting and recipe', async () => {
    const ok = await postingMd(new Request('http://x/'), { params: Promise.resolve({ revisionId: String(revId) }) });
    expect(ok.status).toBe(200);
    expect(decodeURIComponent(ok.headers.get('content-disposition')!)).toContain('공고.md');
    const body = await ok.text();
    expect(body).toContain('Kafka');
    expect(body).toContain('B2');
    expect(body).toContain('서버 공고 본문');
    const miss = await postingMd(new Request('http://x/'), { params: Promise.resolve({ revisionId: '99999' }) });
    expect(miss.status).toBe(404);
  });

  test('kit base document route: pdf, 404 for unknown track/kit, 400 for bad doc', async () => {
    const call = (k: string, track: string, doc: string, qs = '') =>
      kitRoute(new Request(`http://x/${qs}`), { params: Promise.resolve({ kitId: k, track, doc }) });
    const ok = await call(String(kitId), encodeURIComponent('백엔드'), 'resume', '?inline=1');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    expect(ok.headers.get('content-disposition')).toMatch(/^inline;/);
    expect((await call(String(kitId), '없는직무', 'resume')).status).toBe(404);
    expect((await call('999', '백엔드', 'resume')).status).toBe(404);
    expect((await call(String(kitId), '백엔드', 'x')).status).toBe(400);
  }, 60_000);

  test('TC-PDF-14 a base document file that cannot be read gives 404, not a crash', async () => {
    const { config } = await import('@/lib/config');
    rmSync(join(config.kitDir, String(kitId)), { recursive: true, force: true });
    const res = await kitRoute(new Request('http://x/'), { params: Promise.resolve({ kitId: String(kitId), track: encodeURIComponent('백엔드'), doc: 'resume' }) });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('읽을 수 없');
  });
});
