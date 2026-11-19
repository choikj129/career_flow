'use server';

import { migrateDocsFromNotes } from '@/lib/documents/migrate';
import { run } from './run';
import type { ActionResult } from './types';

/** 메모의 "제출 서류" 줄을 제출 서류 칸으로 옮긴다. */
export async function migrateDocsFromNotesAction(): Promise<ActionResult> {
  let notice = '';
  const r = await run(() => {
    const { migrated, skipped } = migrateDocsFromNotes();
    notice = `${migrated}건의 제출 서류를 옮겼습니다`;
    if (skipped.length > 0) {
      const names = [...new Set(skipped.flatMap((s) => s.missing))];
      const shown = names.slice(0, 5).join(', ') + (names.length > 5 ? ` 외 ${names.length - 5}개` : '');
      notice += `. ${skipped.length}건은 폴더에 없는 파일(${shown}) 때문에 옮기지 않았습니다`;
    }
  });
  return r.ok ? { ok: true, notice } : r;
}
