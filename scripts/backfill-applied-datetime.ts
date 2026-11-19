// 일회성: 지난 기록의 정렬용 일시(applied_datetime)를 채운다(D-17). 실제 시각이 아니라 정렬용 값이다.
//
//   npx tsx scripts/backfill-applied-datetime.ts --dry-run   맞춘 수·못 맞춘 수만 출력(저장 안 함, 회사·포지션은 출력 안 함)
//   npx tsx scripts/backfill-applied-datetime.ts             백업 후 실제로 채움
//
// 읽는 파일(데이터 폴더 안): data/backups/data-<site>[-n].txt (site = wanted | jobkorea | remember, 줄마다 UTC시각|회사|포지션)
//                          data/groupby-history.md (마크다운 표, 최신이 위)
// 데이터 폴더는 CAREER_FLOW_DATA_DIR로 바꿀 수 있다(기본 data/). 먼저 앱을 한 번 시작해 마이그레이션을 적용해 둔다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/lib/config';
import { getDb } from '../src/lib/db/client';
import {
  backfillAppliedDatetime,
  parseGroupbyTable,
  parseMailTimeLinesDetailed,
  type BackfillEntry,
} from '../src/lib/applications/backfill';
import type { SiteId } from '../src/lib/domain/types';

const dryRun = process.argv.includes('--dry-run');
const db = getDb();

const cols = db.$client.prepare("PRAGMA table_info('applications')").all() as { name: string }[];
if (!cols.some((c) => c.name === 'applied_datetime')) {
  console.error('applied_datetime 칸이 없습니다. 앱을 한 번 시작해 마이그레이션을 먼저 적용하세요.');
  process.exit(1);
}

const bySite = new Map<SiteId, BackfillEntry[]>();
const add = (site: SiteId, e: BackfillEntry[]) => bySite.set(site, [...(bySite.get(site) ?? []), ...e]);
const skippedReport: string[] = [];

if (existsSync(config.backupDir)) {
  for (const f of readdirSync(config.backupDir).sort()) {
    const m = /^data-(wanted|jobkorea|remember)(?:-\d+)?\.txt$/.exec(f);
    if (!m) continue;
    const { entries, skipped } = parseMailTimeLinesDetailed(m[1] as SiteId, readFileSync(join(config.backupDir, f), 'utf8'));
    add(m[1] as SiteId, entries);
    console.log(`읽음 ${f}: ${entries.length}건` + (skipped.length ? ` (건너뛴 줄 ${skipped.length}개: ${skipped.join(', ')}번 줄)` : ''));
    if (skipped.length) skippedReport.push(f);
  }
}
const groupbyPath = join(config.dataDir, 'groupby-history.md');
if (existsSync(groupbyPath)) {
  const e = parseGroupbyTable(readFileSync(groupbyPath, 'utf8'));
  add('groupby', e);
  console.log(`읽음 groupby-history.md: ${e.length}건`);
}

async function main() {
if (!dryRun) {
  const backup = join(config.backupDir, 'before-applied-datetime.db');
  if (existsSync(backup)) {
    console.error(`백업 파일이 이미 있어 멈춥니다(덮어쓰지 않음): ${backup}`);
    console.error('이미 한 번 실행했다면 그대로 두세요(채워진 값은 다시 덮어쓰지 않습니다). 처음부터 다시 하려면 이 파일을 지우거나 이름을 바꾼 뒤 다시 실행하세요.');
    process.exit(1);
  }
  await db.$client.backup(backup);
  console.log(`백업 완료: ${backup}`);
}

let total = 0;
let updated = 0;
let problems = 0;
for (const [site, entries] of bySite) {
  const index = new Map(entries.map((e, i) => [e, i + 1]));
  const r = backfillAppliedDatetime(entries, db, { dryRun });
  total += entries.length;
  updated += r.updated;
  problems += r.unmatched.length + r.ambiguous.length;
  console.log(
    `[${site}] 항목 ${entries.length}, ${dryRun ? '맞음' : '채움'} ${r.updated}, 못 찾음 ${r.unmatched.length}` +
      (r.unmatched.length ? ` (항목 순번 ${r.unmatched.map((e) => index.get(e)).join(', ')})` : '') +
      `, 애매함 ${r.ambiguous.length}` +
      (r.ambiguous.length ? ` (항목 순번 ${r.ambiguous.map((e) => index.get(e)).join(', ')})` : ''),
  );
}
console.log(`합계: 항목 ${total}, ${dryRun ? '맞음' : '채움'} ${updated}, 문제 ${problems}${dryRun ? ' (dry-run: 저장하지 않았습니다)' : ''}`);
if (problems > 0 || skippedReport.length > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
