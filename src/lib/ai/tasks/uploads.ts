import { copyFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { config } from '@/lib/config';
import { AiError } from '@/lib/ai/runner';

function insideUploads(file: string): string {
  let root: string;
  let real: string;
  try {
    root = realpathSync(config.uploadsDir);
    real = realpathSync(file);
  } catch {
    throw new AiError('cli', '업로드한 파일을 찾을 수 없습니다.');
  }
  const rel = relative(root, real);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new AiError('cli', '업로드 폴더 밖의 파일은 사용할 수 없습니다.');
  }
  if (!statSync(real).isFile()) throw new AiError('cli', '파일이 아닙니다.');
  return real;
}

/** 업로드 폴더 안의 파일만 작업 폴더로 복사하고, 복사된 파일 이름 목록을 돌려준다. */
export function copyUploadsToWorkDir(paths: unknown, workDir: string): string[] {
  const names: string[] = [];
  if (paths != null && !Array.isArray(paths)) throw new AiError('cli', '파일 경로가 올바르지 않습니다.');
  const checked = ((paths ?? []) as unknown[]).map((p) => {
    if (typeof p !== 'string' || !p) throw new AiError('cli', '파일 경로가 올바르지 않습니다.');
    return insideUploads(p);
  });
  checked.forEach((real, i) => {
    let name = basename(real);
    if (names.includes(name)) name = `${i + 1}-${name}`;
    copyFileSync(real, join(workDir, name));
    names.push(name);
  });
  return names;
}
