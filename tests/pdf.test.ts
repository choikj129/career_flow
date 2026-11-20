import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { acquireBrowserLock } from '@/lib/extract/browser';
import { fontFaceCss } from '@/lib/pdf/fonts';
import { buildPdfHtml, mdToSectionHtml } from '@/lib/pdf/md-html';
import { contentDisposition, kitPdfFileName, personNameFromMd } from '@/lib/pdf/names';
import { renderPdf } from '@/lib/pdf/render';
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

describe('names (TC-PDF-03, TC-PDF-04)', () => {
  test('TC-PDF-03 kitPdfFileName: name_doc_track, path chars and spaces removed, no name', () => {
    expect(kitPdfFileName({ name: '홍길동', doc: 'resume', track: '백엔드' })).toBe('홍길동_이력서_백엔드.pdf');
    expect(kitPdfFileName({ name: '홍길동', doc: 'career', track: '데이터' })).toBe('홍길동_경력기술서_데이터.pdf');
    expect(kitPdfFileName({ name: '홍 길/동', doc: 'resume', track: '백엔드/데이터 팀' })).toBe('홍길동_이력서_백엔드데이터팀.pdf');
    expect(kitPdfFileName({ name: '', doc: 'resume', track: '백엔드' })).toBe('이력서_백엔드.pdf');
    expect(kitPdfFileName({ name: '..\\..\\x', doc: 'resume', track: 'a:b' })).not.toMatch(/[\\/:]/);
    expect(personNameFromMd('# 홍길동 · 백엔드 개발자\n')).toBe('홍길동');
    expect(personNameFromMd('본문만')).toBe('');
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
    process.env.CAREER_FLOW_DATA_DIR = mkdtempSync(join(tmpdir(), 'cf-pdf-route-'));
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
});
