# Career Flow 5단계(사이트 반영 체크리스트 + 설정 마무리) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 이력서를 새 버전으로 저장하면 리멤버·원티드·그룹바이·잡코리아 각각에 반영할 내용을 체크리스트로 만들어 주고, 사이트별로 완료 처리하게 한다. 설정 화면에 모든 작업 종류의 모델·시간 제한, 수동 백업, 데이터 폴더 열기를 마무리한다. (설계서 7.8, 12장 7번, 13장 백업)

**Architecture:** 이력서 저장 액션이 직전 버전과 3단계 `diffResume`으로 비교해 변경이 있으면 `site_sync` 작업을 큐에 넣는다. Claude Code(도구 없음)가 변경 내역을 사이트별 화면 용어에 맞춘 반영 항목으로 바꿔 주고, 결과를 사이트별 체크리스트 행으로 저장한다. 아직 완료하지 않은 사이트가 있는 상태에서 또 저장하면, 그 사이트의 미완료 항목은 **누적 변경(가장 오래된 미반영 버전 → 최신 버전)** 하나로 합친다.

**Tech Stack:** 1~4단계와 동일

**Spec:** `docs/spec/product.md` (화면: `docs/spec/screens.md`, 폴더·파일 배치: `docs/spec/architecture.md`)
**선행 계획:** 1·2단계, 3단계 계획 (4단계와는 독립)

## Global Constraints

- 1~3단계 Global Constraints 전부 적용.
- 대상 사이트는 `remember`, `wanted`, `groupby`, `jobkorea` 4곳(`other` 제외).
- 새 작업 종류: `site_sync`(시간 제한 300초, 도구 없음, 기본 모델 `opus`).
- 변경이 없는 저장(내용이 직전 버전과 같음)은 작업을 만들지 않는다.
- 사이트에 직접 접속하거나 수정하지 않는다. 체크리스트는 사용자가 직접 반영하기 위한 안내다.
- 설정 범위: 작업별 모델(`opus`/`sonnet`/`haiku`), 작업별 시간 제한(초, 60~1800), 수동 백업, 데이터 폴더 열기, 최근 백업 목록. 설정값이 없으면 각 계획의 기본값.

## Review Focus

1. **반영하기 전에 이력서를 여러 번 저장** (v2 저장 → 반영 안 함 → v3 저장) — 사이트마다 할 일이 v1→v3 누적 하나로 보여야 하고, 이미 완료한 사이트는 v2→v3만 보여야 한다. → Task 1 `cumulative pending per site`.
2. **내용이 같은 버전 저장**(메모만 다름) — 작업도 체크리스트도 생기지 않아야 한다. → Task 2 `no job when nothing changed`.
3. **체크리스트 작업 실패** (로그인 만료 등) — 해당 버전 변경이 사라지지 않고 [다시 만들기]로 재시도할 수 있어야 한다. → Task 2 `failed sync can be retried`.
4. **시간 제한 설정에 이상한 값** (0, 음수, 문자) — 저장 거부 또는 범위로 보정되어 큐가 즉시 시간 초과로 실패하지 않아야 한다. → Task 3 `timeout setting is clamped`.
5. **수동 백업을 같은 날 여러 번** — 하루 1개 규칙의 자동 백업과 충돌하지 않고 시각이 붙은 별도 파일로 남아야 한다. → Task 3 `manual backup adds timestamped file`.

---

## File Structure

```
prompts/
  site-sync.md
src/lib/
  domain/types.ts                    (수정) JobType 'site_sync'
  db/schema.ts                       (수정) siteSyncTasks
  ai/queue.ts                        (수정) JOB_TIMEOUT_MS, 시간 제한을 설정에서 읽기
  ai/tasks/site-sync-schemas.ts      SiteSyncOutput
  ai/tasks/site-sync.ts              처리기
  ai/tasks/index.ts                  (수정)
  sync/repo.ts                       체크리스트 저장소, 누적 규칙, onResumeSaved
  settings.ts                        (수정) 시간 제한 설정
  backup.ts                          (수정) runManualBackup, listBackups
src/app/
  sync/page.tsx                      사이트 반영 체크리스트 화면
  layout.tsx                         (수정) 내비게이션 "사이트 반영" + 미완료 개수
  resume/page.tsx                    (수정) 저장 후 안내
  settings/page.tsx                  (수정) 설정 마무리
  _actions/sync.ts, settings.ts, resume.ts (sync.ts 새로, 나머지 수정)
tests/
  sync-repo.test.ts, sync-task.test.ts, settings-final.test.ts
```

---

### Task 1: 체크리스트 데이터와 누적 규칙

**Files:**
- Modify: `src/lib/domain/types.ts`, `src/lib/db/schema.ts`, `src/lib/ai/queue.ts`
- Create: `src/lib/sync/repo.ts`, 마이그레이션(`--name site_sync`), `tests/sync-repo.test.ts`

**Interfaces:**
- Consumes: `listResumeVersions`, `getResumeVersion`, `diffResume`, `enqueueJob`
- Produces:
  - `JOB_TYPES`에 `'site_sync'`, `JOB_TIMEOUT_MS.site_sync = 300_000`, `DEFAULT_MODELS.site_sync = 'sonnet'` (D-05)
  - `SYNC_SITES = ['remember','wanted','groupby','jobkorea'] as const`, `type SyncSite`
  - `siteSyncTasks`: id, site(SyncSite), fromVersionId(fk), toVersionId(fk), status(`'generating'|'ready'|'failed'|'done'|'superseded'`), items(json `SyncItem[]`|null), jobId(fk?), errorMessage?, createdAt, doneAt?
  - `type SyncItem = { field: string; action: 'replace'|'add'|'remove'|'reorder'; text: string; note: string }`
  - `planSyncTasks(toVersionId: number, db?): { site: SyncSite; fromVersionId: number }[]` — 사이트마다: 그 사이트에 `done`이 아닌(= `generating|ready|failed`) 작업이 있으면 그중 가장 작은 `fromVersionId`부터, 없으면 직전 버전부터. 직전 버전이 없으면(첫 이력서) 빈 배열.
  - `createSyncTasks(toVersionId, jobId, db?): number` — `planSyncTasks` 결과로 행 생성(`generating`), 같은 사이트의 기존 미완료 행은 `superseded`. 만든 행 수 반환.
  - `applySyncResult(jobId, perSite: Record<SyncSite, SyncItem[]>, db?)` — 그 작업의 행들을 `ready`로, items 저장
  - `failSyncTasks(jobId, message, db?)` — `failed`로
  - `markSyncDone(taskId, db?)`, `listOpenSyncTasks(db?)`(ready/failed/generating, 사이트 순서 고정), `listDoneSyncTasks(limit, db?)`, `countOpenSyncSites(db?): number`
  - `onResumeSaved(newVersionId, db?): number | null` — 직전 버전과 `diffResume` 결과가 비어 있으면 null. 아니면 `site_sync` 작업 `{ toVersionId }`를 넣고 `createSyncTasks` 후 jobId 반환.
  - `retrySync(taskId, db?): number` — `failed` 행의 toVersionId로 `onResumeSaved`와 같은 경로로 새 작업(그 버전 기준 누적 규칙 재적용)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('cumulative pending per site', () => {
  const db = makeTestDb();
  const v1 = save(db, 'a'); const v2 = save(db, 'b');
  const j2 = onResumeSaved(v2, db)!; applySyncResult(j2, allSites([item('요약 교체')]), db);
  const wanted = listOpenSyncTasks(db).find(t => t.site === 'wanted')!;
  markSyncDone(wanted.id, db);
  const v3 = save(db, 'c'); onResumeSaved(v3, db);
  const open = listOpenSyncTasks(db);
  expect(open.find(t => t.site === 'wanted')).toMatchObject({ fromVersionId: v2, toVersionId: v3 });
  expect(open.find(t => t.site === 'remember')).toMatchObject({ fromVersionId: v1, toVersionId: v3 });
  expect(open).toHaveLength(4);   // superseded 행은 목록에 없음
});
test('first resume creates no sync tasks', () => { /* v1만 저장 → onResumeSaved(v1) === null */ });
test('countOpenSyncSites counts ready and failed sites', () => { /* ... */ });
```
(`save(db, summary)`는 요약만 다른 이력서를 저장하고 id 반환하는 헬퍼)

- [ ] **Step 2:** FAIL. **Step 3:** 구현 + 마이그레이션. **Step 4:** PASS. **Step 5:** 커밋 `feat: site sync checklist data and cumulative rule`.

---

### Task 2: 체크리스트 생성 작업과 저장 연결

**Files:**
- Create: `prompts/site-sync.md`, `src/lib/ai/tasks/site-sync-schemas.ts`, `src/lib/ai/tasks/site-sync.ts`, `tests/sync-task.test.ts`
- Modify: `src/lib/ai/tasks/index.ts`, `src/lib/ai/prompt.ts`, `src/app/_actions/resume.ts`(`saveResumeAction`이 저장 후 `onResumeSaved` 호출)

**Interfaces:**
- Consumes: Task 1, `diffResume`, `getResumeVersion`, `renderPrompt`, `getModelFor`, `SITE_LABELS`
- Produces:
  - `SiteSyncOutput = z.object({ sites: z.array(z.object({ site: z.enum(SYNC_SITES), items: z.array(SyncItemSchema) })) })` — 4개 사이트가 모두 있어야 한다. 빠진 사이트가 있으면 빈 목록으로 채우지 않고 `schema` 오류로 실패시킨다(사용자가 [다시 만들기]로 재시도).
  - `site_sync` `{ toVersionId }`: 이 작업에 묶인 행들의 사이트별 `fromVersionId`가 다를 수 있으므로, **서로 다른 from 버전마다** `diffResume(from, to)`를 계산해 프롬프트에 사이트별로 넣는다(같은 from이면 한 번). 결과 → `applySyncResult`. 실패(AiError 포함) → `failSyncTasks` 후 다시 던짐(큐에도 실패로 남게).
  - 프롬프트 규칙: 사이트별 이력서 화면의 항목 이름(예: 원티드 "경력 > 주요 성과", 잡코리아 "경력기술서")으로 안내 / `text`는 사이트에 그대로 붙여넣을 최종 문구 / 변경과 무관한 항목은 넣지 않음 / 확실하지 않은 화면 항목명은 일반 이름("경력 항목")으로 / 한국어.

- [ ] **Step 1: 실패하는 테스트**

```ts
test('no job when nothing changed', () => {
  const db = makeTestDb(); save(db, 'a'); const v2 = save(db, 'a');   // 내용 동일, 메모만 다름
  expect(onResumeSaved(v2, db)).toBeNull();
  expect(listOpenSyncTasks(db)).toHaveLength(0);
});
test('handler sends per-from diffs and stores items per site', async () => {
  // wanted만 v2까지 완료된 상태에서 v3 저장 → 프롬프트에 'v1 → v3' 와 'v2 → v3' 변경 둘 다 포함, tools []
  // 결과 4사이트 → 각 행 ready, items 저장
});
test('failed sync can be retried', async () => {
  // runner가 AiError('auth') → 행 failed, errorMessage 저장, 큐 job failed
  // retrySync(failedId) → 새 job, 행 generating
});
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체.
- [ ] **Step 5: 실제 CLI 수동 확인:** 실제 이력서에서 성과 한 줄과 기술 하나를 바꿔 저장 → 4개 사이트 안내가 사이트 용어로 나오는지, 붙여넣을 문구가 바뀐 내용과 일치하는지 확인.
- [ ] **Step 6:** 커밋 `feat: site sync task triggered on resume save`.

---

### Task 3: 설정 마무리 (모델·시간 제한·백업)

**Files:**
- Modify: `src/lib/settings.ts`, `src/lib/ai/queue.ts`, `src/lib/backup.ts`, `src/app/settings/page.tsx`, `src/app/_actions/settings.ts`
- Create: `tests/settings-final.test.ts`

**Interfaces:**
- Produces:
  - `getTimeoutMsFor(type: JobType, db?): number` — 설정 키 `timeout.<type>`(초)이 있으면 그 값×1000, 없으면 `JOB_TIMEOUT_MS[type]`
  - `setTimeoutSecFor(type, sec: number, db?)` — 정수로 반올림 후 60~1800으로 보정, 숫자가 아니면 예외
  - 큐 처리기들은 `JOB_TIMEOUT_MS[...]` 대신 `getTimeoutMsFor(type, db)`를 쓴다(1~4단계 처리기 수정: 호출 지점만 교체).
  - `runManualBackup(now?, deps?): Promise<string>` — `career-flow-YYYYMMDD-HHmmss-manual.db`, 자동 백업 정리 규칙(최근 30개)과 별도로 수동 백업은 최근 10개 유지
  - `listBackups(backupDir?): { file: string; kind: 'daily' | 'manual'; size: number; mtime: string }[]` (최신순)
  - 서버 액션: `openDataFolderAction()` — Windows `explorer.exe <dataDir>` 실행(경로는 `config.dataDir` 고정, 사용자 입력 사용 안 함)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('timeout setting is clamped', () => {
  const db = makeTestDb();
  expect(getTimeoutMsFor('prepare_interview', db)).toBe(600_000);
  setTimeoutSecFor('analyze_posting', 5, db);    expect(getTimeoutMsFor('analyze_posting', db)).toBe(60_000);
  setTimeoutSecFor('analyze_posting', 99999, db); expect(getTimeoutMsFor('analyze_posting', db)).toBe(1_800_000);
  expect(() => setTimeoutSecFor('analyze_posting', NaN, db)).toThrow();
});
test('manual backup adds timestamped file', async () => {
  // 같은 날 runDailyBackup 1회 + runManualBackup 2회(시각 다름) → 파일 3개, listBackups kind 구분
});
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현.
- [ ] **Step 4: 설정 화면** — 섹션: Claude Code 상태(1·2단계) / 작업별 모델·시간 제한 표(작업 8종: 공고 분석, 이력서 가져오기, 지원 내역 가져오기, 맞춤 이력서, 맞춤 이력서 다듬기, 면접 준비, 면접 준비 다듬기, 사이트 반영 — 4단계가 아직 없으면 그 행은 숨김) / 사이트 로그인 창(1·2단계) / 데이터: 폴더 경로 + [폴더 열기], 백업 목록 + [지금 백업].
- [ ] **Step 5:** PASS + 전체. 커밋 `feat: settings for models, timeouts, manual backup`.

---

### Task 4: 사이트 반영 화면

**Files:**
- Create: `src/app/sync/page.tsx`
- Create: `src/app/_actions/sync.ts`
- Modify: `src/app/layout.tsx`, `src/app/resume/page.tsx`

**Interfaces:**
- Consumes: `listOpenSyncTasks`, `listDoneSyncTasks`, `markSyncDone`, `retrySync`, `countOpenSyncSites`, `SITE_LABELS`, `JobStatus`
- Produces (서버 액션): `markSyncDoneAction(taskId)`, `retrySyncAction(taskId)`

- [ ] **Step 1:** 내비게이션에 "사이트 반영" + 미완료 사이트 수 배지(0이면 배지 없음).
- [ ] **Step 2: 화면** — 사이트별 카드 4개(리멤버/원티드/그룹바이/잡코리아):
  - `generating`: "반영할 내용 정리 중…"
  - `ready`: "기본 이력서 v1 → v3 반영" 제목, 항목 목록(항목 / 할 일 / 붙여넣을 문구 + [복사] / 메모), [이 사이트 반영 완료]
  - `failed`: 오류 문구 + [다시 만들기]
  - 미완료가 없으면 "모든 사이트에 반영되었습니다"
  - 아래 "최근 완료" 목록(사이트, 버전 범위, 완료 시각).
- [ ] **Step 3:** 기본 이력서 저장 후 변경이 있으면 "4개 사이트에 반영할 내용을 정리하고 있습니다 → 사이트 반영" 안내 링크.
- [ ] **Step 4: 확인 (실제 사용):** 이력서 수정 저장 → 배지 4 → 원티드만 완료 → 배지 3 → 다시 수정 저장 → 원티드는 v2→v3, 나머지는 v1→v3로 표시. 메모만 바꿔 저장 → 변화 없음.
- [ ] **Step 5:** 커밋 `feat: site sync checklist page and nav badge`.

---

## Spec 대비 범위

| 설계서 항목 | 이 계획 |
|---|---|
| 7.8 새 버전 저장 → 사이트별 반영 내용, 사이트별 체크, 모두 체크 시 완료 | Task 1, 2, 4 |
| 12장 7. 설정 (작업별 모델, 시간 제한, 사이트 로그인, 데이터 폴더, 백업) | Task 3 (사이트 로그인·Claude 상태는 1·2단계) |
| 13장 백업 (일일 30개) + 수동 백업 | 1·2단계 + Task 3 |
| 9.3 시간 제한 "설정 가능" | Task 3 `getTimeoutMsFor` |
