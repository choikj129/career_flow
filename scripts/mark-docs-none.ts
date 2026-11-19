// 일회성: 경력기술서·포트폴리오의 가장 이른 파일보다 앞선 지원에서 값이 비어 있는(모름) 종류를 "없음"으로 바꾼다(Task 8).
//
//   npx tsx scripts/mark-docs-none.ts --dry-run   바뀔 기록 수만 출력(저장 안 함, 회사·포지션은 출력 안 함)
//   npx tsx scripts/mark-docs-none.ts             백업(data/backups/before-docs-none.db) 후 실제로 바꿈
//
// 서류 파일은 data/documents/<career|portfolio>/ 폴더에서 읽는다. 데이터 폴더는 CAREER_FLOW_DATA_DIR로 바꿀 수 있다.
// 메모 이관 전 기록(제출 서류 칸이 비어 있고 메모에 "제출 서류:" 줄이 있는 기록)은 건너뛴다.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/lib/config';
import { getDb } from '../src/lib/db/client';
import { markDocsNoneBeforeFirst } from '../src/lib/documents/migrate';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const db = getDb();
  const cols = db.$client.prepare("PRAGMA table_info('applications')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'submitted_docs')) {
    console.error('submitted_docs 칸이 없습니다. 앱을 한 번 시작해 마이그레이션을 먼저 적용하세요.');
    process.exit(1);
  }
  if (!dryRun) {
    const backup = join(config.backupDir, 'before-docs-none.db');
    if (existsSync(backup)) {
      console.error(`백업 파일이 이미 있습니다. 지우거나 이름을 바꾸고 다시 실행하세요: ${backup}`);
      process.exit(1);
    }
    await db.$client.backup(backup);
    console.log(`백업 완료: ${backup}`);
  }
  const r = markDocsNoneBeforeFirst(config.documentsDir, db, { dryRun });
  console.log(
    `${dryRun ? '바뀔' : '바꾼'} 기록 ${r.updated}건 (경력기술서 ${r.byKind.career}, 포트폴리오 ${r.byKind.portfolio})` +
      (dryRun ? ' (dry-run: 저장하지 않았습니다)' : ''),
  );
  if (r.pendingNotes > 0) {
    console.log(`이관 전이라 건너뛴 기록 ${r.pendingNotes}건: 메모의 제출 서류를 먼저 옮기고(기본 이력서 → 서류 파일 탭) 다시 실행하세요.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
