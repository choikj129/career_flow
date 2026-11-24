// E2E 시드: 앱의 맞춤본(리비전)은 2026-11-24부터 화면에서 만들 수 없어서(이력서 세션 요청으로 바뀜),
// 이전 맞춤본·제출 서류 기본값·통계 시나리오에 필요한 리비전을 앱 코드로 직접 만든다. 실제 claude는 부르지 않는다.
//
//   CAREER_FLOW_DATA_DIR=<E2E 데이터 폴더> tsx tests/e2e/seed-revision.ts <공고 id> <직무> <프로필 id>
//
// 마지막 줄에 {"id":…, "revNo":…} JSON을 쓴다.
import { basename } from 'node:path';
import { config } from '../../src/lib/config';
import { getDb, runMigrations } from '../../src/lib/db/client';
import { createRecipeRevision } from '../../src/lib/tailored/repo';

if (!process.env.CAREER_FLOW_DATA_DIR || !basename(config.dataDir).startsWith('data-')) {
  console.error('CAREER_FLOW_DATA_DIR이 data-로 시작하는 E2E 데이터 폴더여야 합니다.');
  process.exit(1);
}
const [postingId, track, profileId] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const db = getDb();
runMigrations(db);
const rev = createRecipeRevision(postingId, { track, profileId, adjustmentIds: [] }, db);
console.log(JSON.stringify({ id: rev.id, revNo: rev.revNo }));
