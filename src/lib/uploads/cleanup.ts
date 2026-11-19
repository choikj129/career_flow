import { lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { inArray } from 'drizzle-orm';
import { config } from '@/lib/config';
import { getDb, type Db } from '@/lib/db/client';
import { aiJobs } from '@/lib/db/schema';

export const UPLOADS_IN_USE_MESSAGE = '가져오기 작업이 끝난 뒤에 정리하세요.';

/** target이 root의 "안"(root 자신은 제외)인지. 문자열 경로만 본다. */
export function isInsideDir(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

type Entry = { path: string; size: number };

/** root 아래 일반 파일 목록. 링크는 따라가지 않는다. */
function walk(root: string): { files: Entry[]; links: string[]; dirs: string[] } {
  const out = { files: [] as Entry[], links: [] as string[], dirs: [] as string[] };
  const visit = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return; // 폴더가 없거나 읽을 수 없음
    }
    for (const name of names) {
      const p = join(dir, name);
      let st;
      try {
        st = lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) out.links.push(p);
      else if (st.isDirectory()) {
        out.dirs.push(p);
        visit(p);
      } else if (st.isFile()) out.files.push({ path: p, size: st.size });
    }
  };
  visit(root);
  return out;
}

/** 올린 파일(uploads/ 아래) 개수와 총 크기. */
export function summarizeUploads(baseDir: string = config.uploadsDir): { count: number; bytes: number } {
  const { files } = walk(baseDir);
  return { count: files.length, bytes: files.reduce((n, f) => n + f.size, 0) };
}

/** 대기·실행 중인 가져오기 작업이 올린 파일을 쓰고 있는지. */
export function uploadsInUse(db: Db = getDb()): boolean {
  const rows = db
    .select({ payload: aiJobs.payload })
    .from(aiJobs)
    .where(inArray(aiJobs.status, ['queued', 'running']))
    .all();
  return rows.some((r) => {
    const p = r.payload as { filePaths?: unknown; imagePaths?: unknown } | null;
    return [p?.filePaths, p?.imagePaths].some((v) => Array.isArray(v) && v.length > 0);
  });
}

/**
 * 올린 파일을 모두 지운다. 지우는 대상은 baseDir 안의 파일뿐이다(폴더 자체와 밖의 파일은 건드리지 않는다).
 * 진행 중인 가져오기 작업이 파일을 쓰고 있으면 아무것도 지우지 않고 예외를 던진다.
 */
export function clearUploads(
  opts: { baseDir?: string; db?: Db } = {},
): { count: number; bytes: number } {
  const baseDir = opts.baseDir ?? config.uploadsDir;
  if (uploadsInUse(opts.db ?? getDb())) throw new Error(UPLOADS_IN_USE_MESSAGE);
  const { files, links, dirs } = walk(baseDir);
  let count = 0;
  let bytes = 0;
  for (const f of files) {
    if (!isInsideDir(baseDir, f.path)) continue;
    try {
      unlinkSync(f.path);
      count += 1;
      bytes += f.size;
    } catch {
      /* 잠긴 파일은 남긴다 */
    }
  }
  // 링크는 링크만 지운다. 가리키는 대상은 건드리지 않는다.
  for (const l of links) {
    if (!isInsideDir(baseDir, l)) continue;
    try {
      unlinkSync(l);
    } catch {
      try {
        rmdirSync(l); // Windows 디렉터리 링크
      } catch {
        /* 무시 */
      }
    }
  }
  // 비어 있는 하위 폴더 정리(깊은 곳부터)
  for (const d of dirs.sort((a, b) => b.length - a.length)) {
    if (!isInsideDir(baseDir, d)) continue;
    try {
      rmdirSync(d);
    } catch {
      /* 비어 있지 않으면 둔다 */
    }
  }
  return { count, bytes };
}
