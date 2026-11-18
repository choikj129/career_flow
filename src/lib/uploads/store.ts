import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { config } from '@/lib/config';

import { MAX_UPLOAD_BYTES, checkUpload, type UploadKind } from './check';

export { MAX_UPLOAD_BYTES, checkUpload };
export type { UploadKind };

function safeName(name: string): string {
  const base = basename(name.replace(/\\/g, '/'));
  return base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '') || 'file';
}

/**
 * 검사를 통과한 파일을 uploads/<sub>/<timestamp>-<이름>에 저장한다. 경로 부분은 버린다.
 * 저장된 절대 경로와 거절된 파일(사유)을 돌려준다.
 */
export function saveUploads(
  files: { name: string; data: Buffer }[],
  kind: UploadKind,
  sub: string,
  opts: { baseDir?: string; now?: number } = {},
): { saved: string[]; rejected: { name: string; reason: string }[] } {
  const dir = join(opts.baseDir ?? config.uploadsDir, sub);
  mkdirSync(dir, { recursive: true });
  const stamp = opts.now ?? Date.now();
  const saved: string[] = [];
  const rejected: { name: string; reason: string }[] = [];
  files.forEach((f, i) => {
    const chk = checkUpload(f.name, f.data.length, kind);
    if (!chk.ok) {
      rejected.push({ name: f.name, reason: chk.reason });
      return;
    }
    let target = join(dir, `${stamp}-${safeName(f.name)}`);
    if (saved.includes(target)) target = join(dir, `${stamp}-${i + 1}-${safeName(f.name)}`);
    writeFileSync(target, f.data);
    saved.push(target);
  });
  return { saved, rejected };
}
