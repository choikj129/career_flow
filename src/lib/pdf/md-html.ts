import { Marked, type Tokens, type TokensList } from 'marked';
import { fontFaceCss } from './fonts';
import { normalizeNewlines } from '@/lib/kit/md-doc';

// 서류 md → PDF용 HTML. 사용자 PDF 도구와 같은 구조: 제목 + 프로필 상자, 2단계 제목마다 섹션.
// 사용자 서류의 원시 HTML은 실행되지 않고 글자로 보인다.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // 원문 HTML(블록·인라인)은 글자로
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return esc(text);
    },
    // 링크는 http(s)·mailto·tel만. 나머지(javascript: 등)는 글자만 남긴다
    link({ href, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href.trim())) return inner;
      return `<a href="${esc(href)}">${inner}</a>`;
    },
    // 이미지는 넣지 않는다(오프라인 PDF, 외부 요청 금지). 대체 글자만
    image({ text }: Tokens.Image) {
      return esc(text);
    },
  },
});

/** 주석을 지운다. 코드 블록(``` · ~~~)과 인라인 코드 안의 `<!-- -->`는 글자이므로 그대로 둔다 */
function stripComments(md: string): string {
  const out: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buf.length === 0) return;
    out.push(
      buf
        .join('\n')
        // 인라인 코드(백틱 묶음)는 통째로 두고, 나머지의 주석만 지운다
        .replace(/(`+)[\s\S]*?\1|<!--[\s\S]*?-->/g, (m) => (m.startsWith('`') ? m : '')),
    );
    buf = [];
  };
  for (const line of normalizeNewlines(md).split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence == null) {
      if (m) {
        flush();
        fence = m[1];
        out.push(line);
      } else buf.push(line);
    } else {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
    }
  }
  flush();
  return out.join('\n');
}

type Tok = Tokens.Generic;

function renderTokens(tokens: Tok[], links: TokensList['links']): string {
  const list = Object.assign([...tokens], { links }) as unknown as TokensList;
  return marked.parser(list);
}

const isHeading = (t: Tok, depth?: number) => t.type === 'heading' && (depth == null || (t as Tokens.Heading).depth === depth);
const blank = (ts: Tok[]) => ts.every((t) => t.type === 'space');
const inline = (s: string) => marked.parseInline(s) as string;

/**
 * 표 분류(사용자 PDF 도구와 같은 규칙). 키트 CSS가 이 class로 표 모양과 쪽 넘김을 정한다.
 * - kv: 머리 칸이 모두 비었다(머리 줄은 지운다) · proj: 4열이고 첫 머리가 "기간" · metrics: 1줄, 3열 이상, 기간·구분 없음
 */
function tableClass(t: Tokens.Table): 'kv' | 'proj' | 'metrics' | null {
  const heads = t.header.map((h) => h.text.trim());
  if (heads.length && heads.every((h) => h === '')) return 'kv';
  if (heads.length === 4 && heads[0].includes('기간')) return 'proj';
  if (t.rows.length === 1 && heads.length >= 3 && !heads.some((h) => h.includes('기간') || h.includes('구분'))) return 'metrics';
  return null;
}

/** 토큰을 HTML로 바꾸고, 표마다 분류 class를 붙인다(표 순서 = 토큰 안 표 순서) */
function renderWithTables(tokens: Tok[], links: TokensList['links']): string {
  const classes: Array<ReturnType<typeof tableClass>> = [];
  marked.walkTokens(tokens as Tokens.Generic[], (t) => {
    if (t.type === 'table') classes.push(tableClass(t as Tokens.Table));
  });
  let n = 0;
  return renderTokens(tokens, links).replace(/<table>([\s\S]*?)<\/table>/g, (whole, inner: string) => {
    const c = classes[n++];
    if (!c) return whole;
    const body = c === 'kv' ? inner.replace(/<thead>[\s\S]*?<\/thead>\s*/, '') : inner;
    return `<table class="${c}">${body}</table>`;
  });
}

/** 섹션 본문: h3마다 div.case로 묶는다(h4가 있거나 3000자가 넘으면 case long). 첫 h3 앞은 그대로 */
function renderBody(tokens: Tok[], links: TokensList['links']): string {
  if (!tokens.some((t) => isHeading(t, 3))) return renderWithTables(tokens, links);
  const out: string[] = [];
  let lead: Tok[] = [];
  let cur: Tok[] | null = null;
  const flushCase = () => {
    if (!cur) return;
    const html = renderWithTables(cur, links);
    const long = cur.some((t) => isHeading(t, 4)) || html.replace(/<[^>]+>/g, '').length > 3000;
    out.push(`<div class="${long ? 'case long' : 'case'}">${html}</div>`);
    cur = null;
  };
  for (const t of tokens) {
    if (isHeading(t, 3)) {
      if (lead.length) {
        out.push(renderWithTables(lead, links));
        lead = [];
      }
      flushCase();
      cur = [t];
    } else if (cur) cur.push(t);
    else lead.push(t);
  }
  if (lead.length) out.push(renderWithTables(lead, links));
  flushCase();
  return out.join('\n');
}

/**
 * 구조: 첫 h1 → `<h1>`, 첫 hr(또는 h2) 전까지 → `div.box.profile`, h2마다 `section.sec > h2 + div.body`.
 * 제목이 "이름 · 직함"이면 이름은 `.name`.
 */
export function mdToSectionHtml(md: string): string {
  const tokens = marked.lexer(stripComments(normalizeNewlines(md))) as Tok[] & { links: TokensList['links'] };
  const links = tokens.links;
  const out: string[] = [];
  let i = 0;

  // 첫 제목 앞의 내용은 본문 그대로 위에 둔다
  const lead: Tok[] = [];
  while (i < tokens.length && !isHeading(tokens[i])) lead.push(tokens[i++]);
  if (!blank(lead)) out.push(`<div class="body">${renderTokens(lead, links)}</div>`);

  if (i < tokens.length && isHeading(tokens[i], 1)) {
    const h = tokens[i++] as Tokens.Heading;
    const idx = h.text.indexOf('·');
    if (idx > 0) {
      out.push(`<h1><span class="name">${inline(h.text.slice(0, idx).trim())}</span> · ${inline(h.text.slice(idx + 1).trim())}</h1>`);
    } else {
      out.push(`<h1>${inline(h.text)}</h1>`);
    }
    const head: Tok[] = [];
    while (i < tokens.length && tokens[i].type !== 'hr' && !(isHeading(tokens[i]) && (tokens[i] as Tokens.Heading).depth <= 2)) {
      head.push(tokens[i++]);
    }
    if (i < tokens.length && tokens[i].type === 'hr') i++;
    if (!blank(head)) out.push(`<div class="box profile">${renderTokens(head, links)}</div>`);
  }

  // 나머지: h2마다 섹션. 첫 h2 앞에 남은 것은 본문 그대로
  let section: { title: Tokens.Heading; body: Tok[] } | null = null;
  const pre: Tok[] = [];
  const flush = () => {
    if (!section) return;
    out.push(`<section class="sec"><h2>${inline(section.title.text)}</h2><div class="body">${renderBody(section.body, links)}</div></section>`);
    section = null;
  };
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (isHeading(t, 2)) {
      flush();
      section = { title: t as Tokens.Heading, body: [] };
    } else if (section) section.body.push(t);
    else pre.push(t);
  }
  flush();
  if (!blank(pre)) out.push(`<div class="body">${renderTokens(pre, links)}</div>`);
  return out.join('\n');
}

/** 키트에 PDF 스타일이 없을 때 쓰는 앱 기본 스타일 */
export const DEFAULT_PDF_CSS = `
@page { size: A4; margin: 16mm 15mm; }
body { font-family: 'Pretendard', sans-serif; font-size: 10pt; line-height: 1.55; color: #111; margin: 0; }
h1 { font-size: 20pt; margin: 0 0 8px; }
h1 .name { font-weight: 700; }
.box.profile { border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
.box.profile ul { margin: 0; padding-left: 16px; }
.sec { margin-top: 14px; }
.sec h2 { font-size: 12.5pt; border-bottom: 1.5px solid #333; padding-bottom: 3px; margin: 0 0 6px; }
h3 { font-size: 11pt; margin: 10px 0 4px; }
ul, ol { margin: 4px 0; padding-left: 18px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 3px 6px; text-align: left; }
`;

/** 줄바꿈·쪽 넘김 규칙. 키트 CSS를 쓸 때도 붙는다(제목이 쪽 끝에 홀로 남거나 표 행·목록 항목이 쪼개지지 않게) */
const WRAP_CSS = `html, body { word-break: keep-all; overflow-wrap: anywhere; }
h1, h2, h3, h4 { break-after: avoid; }
tr, li { break-inside: avoid; }`;

/** 화면 미리보기(새 탭)에서만 좌우 여백을 준다. 인쇄(PDF)에는 영향이 없다 */
const PREVIEW_CSS = `@media screen { body { padding: 20px 28px; } }`;

/** 전체 HTML. `<style>` = 글꼴 + (키트 CSS 또는 기본 CSS) + 줄바꿈 규칙 */
export function buildPdfHtml(md: string, css: string | null, opts: { preview?: boolean } = {}): string {
  // style 요소를 닫아 버리는 글자만 막는다(키트 CSS는 사용자가 올린 파일)
  const style = [fontFaceCss(), (css?.trim() ? css : DEFAULT_PDF_CSS).replace(/<\/style/gi, '<\\/style'), WRAP_CSS, ...(opts.preview ? [PREVIEW_CSS] : [])].join('\n');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>서류</title><style>${style}</style></head>
<body><div class="sheet">
${mdToSectionHtml(md)}
</div></body></html>`;
}
