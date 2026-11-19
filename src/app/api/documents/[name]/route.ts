import { readFileSync } from 'node:fs';
import { docFileExists, resolveDocPath } from '@/lib/documents/folder';

function decodeName(raw: string): string {
  if (!raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 서류 PDF 보기. 이름 규칙 + 그 종류 폴더 안의 파일만 연다. */
export async function GET(_req: Request, { params }: RouteContext<'/api/documents/[name]'>) {
  const { name: raw } = await params;
  const name = decodeName(raw);
  const path = resolveDocPath(name);
  if (!path) return new Response('잘못된 파일 이름입니다', { status: 400 });
  if (!docFileExists(name)) return new Response('파일이 없습니다', { status: 404 });
  return new Response(new Uint8Array(readFileSync(path)), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
