import { readdirSync, statSync, type Dirent } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { config } from '@/lib/config';
import { DOC_KINDS, parseDocFileName, type DocFile, type DocKind, type SubmittedDocs } from './files';

// 서버 전용: 데이터 폴더 안의 서류 폴더만 읽는다. 파일 내용은 읽지 않는다.

/** 종류 폴더 3개만 읽는다(재귀 안 함, 파일만). 규칙에 맞고 폴더와 종류가 같으면 files, 아니면 ignored. */
export function listDocFiles(dir: string = config.documentsDir): { files: DocFile[]; ignored: string[] } {
  const files: DocFile[] = [];
  const ignored: string[] = [];
  for (const kind of DOC_KINDS) {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(dir, kind), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const f = parseDocFileName(e.name);
      if (f && f.kind === kind) files.push(f);
      else ignored.push(e.name);
    }
  }
  files.sort((a, b) => DOC_KINDS.indexOf(a.kind) - DOC_KINDS.indexOf(b.kind) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { files, ignored };
}

/** 이름 규칙 통과 + 그 종류 폴더 안의 경로일 때만 절대 경로. 아니면 null. */
export function resolveDocPath(fileName: string, dir: string = config.documentsDir): string | null {
  const f = parseDocFileName(fileName);
  if (!f) return null;
  const folder = resolve(dir, f.kind);
  const full = resolve(join(folder, fileName));
  if (!full.startsWith(folder + sep)) return null;
  return full;
}

export function docFileExists(fileName: string, dir: string = config.documentsDir): boolean {
  const p = resolveDocPath(fileName, dir);
  if (!p) return false;
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 기록에 적힌 파일이 지금 폴더에 있는지 종류별로. */
export function docExistence(
  docs: SubmittedDocs | null | undefined,
  dir?: string,
): Record<DocKind, boolean> {
  const has = (k: DocKind) => {
    const n = docs?.[k];
    return n ? docFileExists(n, dir) : false;
  };
  return { resume: has('resume'), career: has('career'), portfolio: has('portfolio') };
}
