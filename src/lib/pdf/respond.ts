import { BrowserLockTimeoutError } from '@/lib/extract/browser';
import { buildPdfHtml } from './md-html';
import { contentDisposition } from './names';
import { renderPdf } from './render';

// 내려받기 라우트가 함께 쓰는 응답 만들기. 파일은 저장하지 않고 요청마다 만든다(D-25 a).

const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } as const;

/** 미리보기 HTML 응답의 CSP: 스크립트·외부 요청 없음. 글꼴·이미지는 data: 만 */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";

export type DocFormat = 'pdf' | 'md' | 'html';

export function parseFormat(raw: string | null): DocFormat | null {
  if (raw == null || raw === '') return 'pdf';
  return raw === 'pdf' || raw === 'md' || raw === 'html' ? raw : null;
}

/** md 원문을 형식에 맞게 응답으로. pdfName은 `.pdf` 파일 이름, md는 같은 이름의 `.md` */
export async function respondDocument(i: {
  md: string;
  css: string | null;
  pdfName: string;
  format: DocFormat;
  inline: boolean;
}): Promise<Response> {
  const mdName = i.pdfName.replace(/\.pdf$/i, '.md');
  if (i.format === 'md') {
    return new Response(i.md, {
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': contentDisposition(mdName, i.inline),
      },
    });
  }
  const html = buildPdfHtml(i.md, i.css);
  if (i.format === 'html') {
    return new Response(html, {
      headers: { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PREVIEW_CSP },
    });
  }
  try {
    const pdf = await renderPdf(html);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(i.pdfName, i.inline),
      },
    });
  } catch (e) {
    if (e instanceof BrowserLockTimeoutError) {
      return new Response('브라우저를 사용 중입니다. 잠시 뒤에 다시 시도하세요', { status: 503, headers: { 'Retry-After': '10' } });
    }
    throw e;
  }
}
