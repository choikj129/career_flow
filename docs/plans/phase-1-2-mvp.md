# Career Flow 1·2단계(기반 + MVP) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 이력서 등록, 공고 링크 등록 즉시 분석, 지원 완료·상태 관리, 회사 검색 대시보드, 기존 지원 내역 가져오기까지 동작하는 로컬 웹앱을 만든다. (설계서 14장의 1·2단계. 맞춤 이력서·면접 준비·사이트 반영 체크리스트는 다음 계획.)

**Architecture:** Next.js(App Router) 단일 프로젝트가 화면과 서버를 맡고, SQLite(Drizzle)에 모든 데이터를 저장한다. AI 작업은 DB 테이블 기반 작업 큐에 쌓이고, 서버 프로세스 안의 워커 하나가 `claude -p`(Claude Code CLI)를 자식 프로세스로 실행해 JSON 결과를 받아 저장한다. 공고 본문은 Playwright(영구 브라우저 프로필)로 추출한다.

**Tech Stack:** Node 22, TypeScript, Next.js 16.x(App Router, 기본값 `cacheComponents`), Tailwind 4, Drizzle ORM + better-sqlite3, zod v4(`z.toJSONSchema` 사용), Vitest, Playwright(Chromium), Claude Code CLI 2.1.x

**Spec:** `docs/spec/product.md` (화면: `docs/spec/screens.md`, 폴더·파일 배치: `docs/spec/architecture.md`)

## Global Constraints

- 사용자 1명, 로컬 실행 전용. 로그인·회원 기능 없음. 서버는 `127.0.0.1`에만 바인딩.
- Anthropic API 키·SDK를 쓰지 않는다. 모든 AI 작업은 `claude -p` 호출.
- 앱은 Claude Code 인증 파일·토큰을 읽거나 저장하지 않는다. 로그인 안 됨 → "터미널에서 `claude` 실행 후 로그인" 안내만.
- `claude` 호출 시 큰 입력(이력서·공고 본문)은 **표준입력**으로 전달, 명령줄 인자로 넘기지 않는다(Windows 명령줄 길이 제한).
- `claude` 호출 공통 옵션: `-p --safe-mode --output-format json --permission-mode dontAsk --permission-prompts none --json-schema <스키마> --model <모델> --tools <작업별 목록>`. `Bash`·`PowerShell`·`Edit`·`Write`는 어떤 작업에서도 허용하지 않는다. (`--bare`는 구독 로그인을 읽지 않으므로 쓰지 않는다.)
- `claude` 실행 위치(cwd)는 프로젝트 폴더가 아니라 `data/ai-work/<jobId>/`.
- AI 작업은 한 번에 하나만 실행. 시간 제한 기본값: 공고 분석 300초, 이력서 가져오기 300초, 지원 내역 가져오기 300초.
- 작업별 기본 모델: `opus` (설정에서 변경 가능).
- 공고 본문(`raw_text`)과 원본 URL·추출 시각은 등록 시 반드시 저장.
- 사이트에 대한 자동 로그인·자동 지원·반복 요청 금지. 공고 1건당 사용자 요청 시 1회만 페이지를 연다. 비밀번호를 입력·저장하지 않는다.
- 데이터 폴더 `data/`(DB, 업로드, AI 작업 폴더, 브라우저 프로필, 백업)는 git에서 제외.
- 사이트 ID: `remember | wanted | groupby | jobkorea | other`. 화면 표시명: 리멤버 / 원티드 / 그룹바이 / 잡코리아 / 기타.
- 지원 상태: `applied | document_passed | interview | final_passed | rejected | withdrawn`. 표시명: 지원 / 서류합격 / 면접 / 최종합격 / 불합격 / 지원취소. 면접은 차수(`interviewRound`, 1부터)를 함께 가진다.
- 화면 문구는 한국어.

## Review Focus

1. **Claude Code 로그인 만료/미로그인** — 계획 작성 중 실제로 `claude -p`가 `Failed to authenticate: OAuth session expired`를 반환했다. 사용자는 분석 실패 원인과 해결법("터미널에서 claude 로그인")을 화면에서 봐야 한다. → Task 5 테스트 `classifies auth failure`.
2. **같은 회사의 다른 표기** (`(주)카카오`/`카카오`, `토스 뱅크`/`토스뱅크`, 법인명 `비바리퍼블리카`/브랜드 `토스`) — 검색과 중복 경고가 이를 같은 회사로 잡아야 한다. → Task 3 정규화 테스트, Task 8 `search finds by legal name and alias`.
3. **로그인 벽·JS 미렌더링으로 본문이 거의 비어 있는 페이지** — 메뉴 텍스트만 가지고 엉터리 분석을 하면 안 되고, 붙여넣기 입력으로 넘어가야 한다. → Task 7 `fails on too-short text`.
4. **분석 도중 앱 재시작** — `running` 상태로 영원히 남지 않고 실패 처리 후 재시도 가능해야 한다. → Task 6 `recovers interrupted jobs`.
5. **추적 파라미터가 붙은 같은 공고 URL** (`?utm_source=...`, `#fragment`) — 같은 공고로 인식해 중복 등록하지 않아야 한다. → Task 3 `canonicalizeUrl` 테스트, Task 8 `registerPosting dedupes canonical url`.

## 시험 구현에서 확인된 사항 (2026-11-16)

Task 1~7을 한 번 구현해 본 뒤 되돌렸다. 그때 확인한 사실과 내린 결정을 이 계획의 일부로 둔다(아래가 본문과 다르면 아래를 따른다).

- **Next.js 16.4**: `create-next-app`이 만드는 `AGENTS.md`가 "학습 데이터와 다른 Next.js"라고 경고한다(이 내용은 `.claude/rules/nextjs.md`로 옮겨 두었다). 페이지·라우트·서버 액션을 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 읽는다. 기본 설정에 `cacheComponents: true`가 켜져 있으므로 DB를 읽는 페이지는 동적 렌더링으로 처리해야 한다(빌드 시점에 DB를 읽지 않도록). 방법은 Task 10에서 문서를 보고 정한다.
- `better-sqlite3`, `playwright`는 Next.js 기본 `serverExternalPackages` 목록에 이미 있다 → `next.config`에 따로 넣지 않는다.
- 라우트 핸들러의 두 번째 인자는 `{ params }: RouteContext<'/api/jobs/[id]'>`, `params`는 Promise. `RouteContext`는 생성되는 전역 타입이라 `tsc --noEmit` 전에 `npx next typegen`을 실행한다.
- `@types/node`는 `^22`로 고정(vitest 5의 peer 요구, PC는 Node 22).
- 테스트 설정: `vite-tsconfig-paths` 플러그인으로 `@/` 별칭, `fileParallelism: false`, 기본 타임아웃 30초.
- `create-next-app`은 `--yes --skip-install`을 붙여 질문 없이 생성하고, `docs/`가 있어도 생성된다.
- **구현 중 확인된 사항 (2026-11-18)**
  - `claude --json-schema`는 `z.toJSONSchema`가 붙이는 `$schema`(draft 2020-12) 키를 거부한다. 스키마는 `src/lib/ai/tasks/json-schema.ts`의 `toCliJsonSchema`(draft-7, `$schema` 없음)를 거쳐 넘긴다.
  - 원티드는 자동 브라우저 접근에 차단 페이지를 준다. `extract-posting.ts`의 `looksBlocked()`로 감지해 추출 실패로 처리한다(이후 방향은 `docs/decisions.md` D-08).
  - `next dev`는 데이터 폴더가 프로젝트 안에 있으면(`data-dev` 등) 브라우저가 무한 새로고침된다. 개발 서버용 데이터는 프로젝트 밖 폴더를 `CAREER_FLOW_DATA_DIR`로 지정한다. `next start`는 영향이 없다.
  - `next.config.ts`에 `agentRules: false`를 둔다. 없으면 dev 서버가 루트에 `AGENTS.md`를 만든다.
  - 클라이언트 컴포넌트는 `queue.ts`, `config`, `db`, `fs`에 닿는 모듈을 import하지 않는다(Turbopack 오류).
- **생성 후 정리 (Task 1)**: `create-next-app`이 만든 `AGENTS.md`·`CLAUDE.md`(생기면)·`README.md`는 지운다. 프로젝트 안내는 기존 `CLAUDE.md`, 문서는 `docs/` 아래에만 둔다(`docs/spec/architecture.md` 4장). 기존 `CLAUDE.md`나 `.claude/` 때문에 생성이 거부되면 임시 폴더에 만든 뒤 이 세 파일을 빼고 복사한다. 폴더·파일 배치는 `docs/spec/architecture.md`를 따른다.
- **Claude Code CLI 2.1.284** 옵션 확인 완료: `-p`, `--output-format json`, `--json-schema`, `--model`, `--tools`(""이면 도구 없음), `--permission-mode dontAsk`, `--permission-prompts none`, `--safe-mode`, `--resume`. 실패 응답 JSON 모양 확인: `{ is_error: true, result: "Failed to authenticate: OAuth session expired and could not be refreshed", session_id, ... }`. 성공 응답 확인 완료(2026-11-16, CLI 2.1.325, haiku, `--json-schema` 사용): `{ type, subtype: "success", is_error: false, result: "<JSON 문자열>", structured_output: { ... 스키마대로 ... }, session_id, num_turns, total_cost_usd, usage, modelUsage: { "<모델 ID>": {...} }, ... }`. 파서는 `structured_output`을 쓰고, 없으면 `result`를 JSON으로 읽는다(예비). 사용량 기록은 `usage`·`modelUsage`·`total_cost_usd`를 그대로 저장한다. 응답에 `credential_expires_at` 같은 인증 관련 필드가 있어도 앱은 저장하거나 쓰지 않는다. 한글은 표준입력(UTF-8)으로 넘겨도 정상이다. Windows 콘솔 출력에서만 깨져 보인다.
- 테스트 편의를 위한 시그니처 보강(본문 시그니처에 추가): `runDailyBackup(now?, deps?: { db?: Db; backupDir?: string })`, `new ClaudeCliRunner({ bin?, binArgs?, env? })`, `processNextJob/startWorker`의 `deps.workRoot?: string`(기본 `config.aiWorkDir`).
- `src/instrumentation.ts`는 작업 처리기(`ai/tasks/index.ts`)가 생기는 **Task 9 마지막 단계**에서 만든다(Task 6에서 만들면 빌드가 깨짐).
- `openSiteLogin`은 브라우저 창이 열리면 바로 반환하고, 사용자가 창을 닫을 때 브라우저 잠금을 푼다.
- 브라우저 잠금은 프로필 경로와 무관하게 프로세스 전체에서 하나다.

---

## File Structure

```
career_flow/
  .gitignore                     data/, node_modules/, .next/
  drizzle.config.ts
  drizzle/                       생성된 마이그레이션
  prompts/
    analyze-posting.md
    import-resume.md
    import-applications.md
  src/
    instrumentation.ts           서버 시작 시: 마이그레이션, 백업, 워커 시작
    lib/
      config.ts                  경로·실행 설정
      db/schema.ts               Drizzle 테이블
      db/client.ts               getDb(), runMigrations()
      backup.ts                  일일 백업
      settings.ts                설정 키-값 (작업별 모델)
      domain/types.ts            SiteId, ApplicationStatus 등 공용 타입·표시명
      domain/normalize.ts        회사명 정규화, URL 정규화, 사이트 판별
      resume/schema.ts           ResumeContent, Preferences (zod)
      resume/repo.ts             이력서 버전·희망 조건 저장소
      ai/runner.ts               AiRunner 인터페이스, AiError
      ai/claude-cli.ts           ClaudeCliRunner
      ai/queue.ts                작업 큐 + 워커
      ai/prompt.ts               프롬프트 템플릿 로더
      ai/tasks/schemas.ts        AnalysisResult, ImportedApplications (zod)
      ai/tasks/analyze-posting.ts
      ai/tasks/import-resume.ts
      ai/tasks/import-applications.ts
      extract/browser.ts         영구 프로필 브라우저, 잠금, 사이트 로그인 창
      extract/extract-posting.ts 본문 추출
      companies/repo.ts          회사·별칭·매칭
      postings/repo.ts           공고 등록·조회·분석 저장
      applications/repo.ts       지원·상태 이력·중복 조회·일괄 등록
      search/dashboard.ts        검색·필터·요약 지표
    app/
      layout.tsx                 상단 내비게이션
      page.tsx                   대시보드
      _actions/                  서버 액션 (영역별 파일, 얇은 래퍼)
      api/jobs/[id]/route.ts     작업 상태 조회 (폴링)
      postings/new/page.tsx
      postings/analyzed/page.tsx
      postings/[id]/page.tsx
      resume/page.tsx
      import/page.tsx
      settings/page.tsx
      _components/               JobStatus, DuplicateBanner, StatusBadge 등
  tests/
    helpers/db.ts                임시 DB 생성
    fixtures/fake-claude.mjs     가짜 claude 실행 파일
    fixtures/posting-*.html
    ... (각 Task의 테스트)
```

---

### Task 1: 프로젝트 생성과 테스트 기반

**Files:**
- Create: Next.js 프로젝트 일체(현재 폴더), `.gitignore`, `vitest.config.ts`, `src/lib/config.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces:
  - `config.dataDir: string` (환경변수 `CAREER_FLOW_DATA_DIR`, 기본 `<cwd>/data`)
  - `config.dbPath = join(dataDir, 'career-flow.db')`, `config.uploadsDir = join(dataDir,'uploads')`, `config.aiWorkDir = join(dataDir,'ai-work')`, `config.browserProfileDir = join(dataDir,'browser-profile')`, `config.backupDir = join(dataDir,'backups')`
  - `config.claudeBin: string` (환경변수 `CLAUDE_BIN`, 기본 `'claude'`)
  - `ensureDataDirs(): void` — 위 폴더 전부 생성

- [ ] **Step 1:** 구현용 브랜치 생성(`git checkout -b feat/mvp`), 이어서 `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes --skip-install` (기존 `docs/` 유지). `npm i` → `npm i drizzle-orm better-sqlite3 zod playwright` → `npm i -D @types/node@^22 drizzle-kit @types/better-sqlite3 vitest vite-tsconfig-paths`. `npx playwright install chromium`.
- [ ] **Step 2:** `.gitignore`에 `/data/`, `/data-*/`, `/.superpowers/` 추가. `package.json` 스크립트: `"test": "vitest run"`, `"start": "next start -H 127.0.0.1 -p 3939"`, `"dev": "next dev -H 127.0.0.1 -p 3939"`. `vitest.config.ts`는 위 "확인된 사항"대로.
- [ ] **Step 3: 실패하는 테스트 작성** `tests/config.test.ts`

```ts
test('ensureDataDirs creates all dirs under CAREER_FLOW_DATA_DIR', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-'));
  process.env.CAREER_FLOW_DATA_DIR = dir;
  const { config, ensureDataDirs } = await import('@/lib/config');
  ensureDataDirs();
  for (const p of [config.uploadsDir, config.aiWorkDir, config.browserProfileDir, config.backupDir])
    expect(existsSync(p)).toBe(true);
  expect(config.dbPath).toBe(join(dir, 'career-flow.db'));
});
```

- [ ] **Step 4:** `npm test` → FAIL(모듈 없음). `src/lib/config.ts` 구현(값은 모듈 로드 시 환경변수에서 읽음). Vitest에 `@` 별칭 설정. `npm test` → PASS.
- [ ] **Step 5:** `npm run build` 성공 확인 후 커밋 `chore: scaffold next.js app with test setup`.

---

### Task 2: DB 스키마, 마이그레이션, 백업, 설정

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `drizzle.config.ts`, `src/lib/backup.ts`, `src/lib/settings.ts`, `src/lib/domain/types.ts`, `tests/helpers/db.ts`, `tests/db.test.ts`, `tests/backup.test.ts`

**Interfaces:**
- Produces (`domain/types.ts`):
  - `type SiteId = 'remember'|'wanted'|'groupby'|'jobkorea'|'other'`, `SITE_LABELS: Record<SiteId,string>`
  - `type ApplicationStatus = 'applied'|'document_passed'|'interview'|'final_passed'|'rejected'|'withdrawn'`, `STATUS_LABELS`
  - `type JobType = 'analyze_posting'|'import_resume'|'import_applications'`
  - `type JobStatus = 'queued'|'running'|'succeeded'|'failed'|'canceled'`
  - `type AiErrorKind = 'auth'|'usage_limit'|'timeout'|'schema'|'cli'|'extract_failed'|'interrupted'`
- Produces (`db/schema.ts`) 테이블 (모든 시각은 ISO 문자열 `text`, JSON은 `text` + `{mode:'json'}`):
  - `resumeVersions`: id, versionNo(int unique), content(json), sourceNote(text?), createdAt
  - `preferences`: id(=1 고정), content(json), updatedAt
  - `companies`: id, displayName, legalName?, createdAt
  - `companyKeys`: id, companyId(fk), key(text **unique**), kind(`'display'|'legal'|'alias'`)
  - `postings`: id, companyId?(fk), url?(text), canonicalUrl?(text **unique**), site(SiteId), siteNote?(text — site가 'other'일 때 출처 이름, 예 "지인 추천"), positionTitle?, rawText?, fetchedAt?, extracted(json?), deadline?(text), createdAt
  - `analyses`: id, postingId(fk, **on delete cascade**), resumeVersionId(fk), result(json), fitScore(int), jobId(fk), createdAt
  - `applications`: id, postingId?(fk), companyId(fk), positionTitle, site(SiteId), siteNote?(text), appliedAt(text, YYYY-MM-DD), submittedResume(json: `{kind:'base', versionId}`), status(ApplicationStatus), interviewRound?(int), notes?(text), createdAt
  - `statusEvents`: id, applicationId(fk, **on delete cascade**), status, interviewRound?, at, note?
  - `aiJobs`: id, type(JobType), payload(json), status(JobStatus), result(json?), errorKind?, errorMessage?, sessionId?, model?, usage(json?), createdAt, startedAt?, finishedAt?
  - `settings`: key(pk), value(text)
- Produces (`db/client.ts`): `getDb(): BetterSQLite3Database<typeof schema>` (싱글턴, `config.dbPath`, `journal_mode=WAL`, `foreign_keys=ON`), `runMigrations(db): void` (`drizzle/` 폴더 적용), `createDb(path: string)` (테스트용)
- Produces (`backup.ts`): `runDailyBackup(now?: Date): Promise<string|null>` — 오늘 날짜 백업 없으면 `backups/career-flow-YYYYMMDD.db` 생성(better-sqlite3 `.backup()`), 최신 30개만 유지, 만든 경로 반환(이미 있으면 null)
- Produces (`settings.ts`): `DEFAULT_MODELS: Record<JobType, 'opus'|'sonnet'|'haiku'>` — `analyze_posting: 'opus'`, `import_resume: 'sonnet'`, `import_applications: 'sonnet'` (판단이 필요한 작업은 Opus, 옮겨 적는 작업은 Sonnet — `docs/decisions.md` D-05. 이후 단계에서 작업 종류를 추가할 때 이 표에도 추가), `getModelFor(type: JobType): string` (키 `model.<type>`, 없으면 `DEFAULT_MODELS[type]`), `setModelFor(type, model)`
- Produces (`tests/helpers/db.ts`): `makeTestDb(): Db` — 임시 파일 DB에 마이그레이션 적용

- [ ] **Step 1: 실패하는 테스트** `tests/db.test.ts`

```ts
test('migrations create tables and enforce unique canonicalUrl', () => {
  const db = makeTestDb();
  db.insert(postings).values({ site: 'wanted', canonicalUrl: 'https://www.wanted.co.kr/wd/1', createdAt: now() }).run();
  expect(() => db.insert(postings).values({ site: 'wanted', canonicalUrl: 'https://www.wanted.co.kr/wd/1', createdAt: now() }).run()).toThrow();
});
test('getModelFor defaults to opus and persists override', () => {
  const db = makeTestDb();
  expect(getModelFor('analyze_posting', db)).toBe('opus');
  expect(getModelFor('import_applications', db)).toBe('sonnet');
  setModelFor('analyze_posting', 'sonnet', db);
  expect(getModelFor('analyze_posting', db)).toBe('sonnet');
});
```
(`settings.ts` 함수는 마지막 인자로 `db = getDb()` 기본값을 받는다. 이후 모든 repo 함수도 같은 규칙.)

`tests/backup.test.ts`: `runDailyBackup(new Date('2026-11-16'))` 두 번 호출 → 첫 번째는 `career-flow-20261116.db` 경로, 두 번째는 `null`; 백업 31개를 미리 만들어 두면 실행 후 30개.

- [ ] **Step 2:** 테스트 실행 → FAIL.
- [ ] **Step 3:** 스키마·클라이언트·설정·백업 구현, `npx drizzle-kit generate`로 마이그레이션 생성.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat: sqlite schema, migrations, settings, daily backup`.

---

### Task 3: 정규화 — 회사명, URL, 사이트 판별

**Files:**
- Create: `src/lib/domain/normalize.ts`, `tests/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizeCompanyName(name: string): string`
  - `canonicalizeUrl(url: string): string`
  - `detectSite(url: string): SiteId`

- [ ] **Step 1: 실패하는 테스트**

```ts
test.each([
  ['주식회사 비바리퍼블리카', '비바리퍼블리카'],
  ['(주)카카오', '카카오'],
  ['㈜카카오', '카카오'],
  ['카카오 (주)', '카카오'],
  ['Kakao Corp.', 'kakao'],
  ['LINE Plus Co., Ltd.', 'lineplus'],
  ['토스 뱅크', '토스뱅크'],
  ['（주）우아한형제들', '우아한형제들'],   // 전각 괄호 → NFKC
  ['유한회사 테스트', '테스트'],
])('normalizeCompanyName(%s) = %s', (input, expected) => {
  expect(normalizeCompanyName(input)).toBe(expected);
});

test('canonicalizeUrl strips tracking params, fragment, trailing slash; lowercases host', () => {
  expect(canonicalizeUrl('https://WWW.Wanted.co.kr/wd/12345/?utm_source=kakao&utm_medium=x#apply'))
    .toBe('https://www.wanted.co.kr/wd/12345');
  expect(canonicalizeUrl('https://www.jobkorea.co.kr/Recruit/GI_Read/46000000?Oem_Code=C1&rPageCode=SL'))
    .toBe('https://www.jobkorea.co.kr/Recruit/GI_Read/46000000');
  expect(canonicalizeUrl('https://example.com/job?id=7&utm_campaign=a')).toBe('https://example.com/job?id=7');
});

test.each([
  ['https://career.rememberapp.co.kr/job/posting/123', 'remember'],
  ['https://www.wanted.co.kr/wd/1', 'wanted'],
  ['https://groupby.kr/positions/9', 'groupby'],
  ['https://www.jobkorea.co.kr/Recruit/GI_Read/1', 'jobkorea'],
  ['https://careers.toss.im/job/1', 'other'],
])('detectSite(%s) = %s', (url, site) => expect(detectSite(url)).toBe(site));
```

- [ ] **Step 2:** 실행 → FAIL.
- [ ] **Step 3:** 구현.
  - 회사명: NFKC → 소문자 → 법인 표기 제거(`주식회사`, `(주)`, `㈜`, `유한회사`, `(유)`, `co., ltd.`, `co.,ltd`, `ltd.`, `inc.`, `corp.`, `corporation`, `company`) → 공백·구두점 전부 제거.
  - URL: 제거할 쿼리는 `utm_*` 전부 + 사이트별 추적 키(잡코리아 `Oem_Code`, `rPageCode`, `logpath`, `sc`; 그 외 공통 `ref`, `referer`, `source`). 나머지 쿼리는 키 정렬 후 유지. 호스트 소문자, 프래그먼트·끝 슬래시 제거.
  - 사이트: 호스트명이 `rememberapp.co.kr`, `wanted.co.kr`, `groupby.kr`, `jobkorea.co.kr`로 끝나는지.
- [ ] **Step 4:** PASS 확인. **Step 5:** 커밋 `feat: company name, url, site normalization`.

---

### Task 4: 이력서·희망 조건 스키마와 저장소

**Files:**
- Create: `src/lib/resume/schema.ts`, `src/lib/resume/repo.ts`, `tests/resume-repo.test.ts`

**Interfaces:**
- Produces (`schema.ts`, zod):
  - `ResumeContent`:
    `basics {name, email?, phone?, links: {label,url}[]}`, `summary: string`,
    `experiences: {id, company, role, start('YYYY-MM'), end('YYYY-MM'|null), description, achievements: string[]}[]`,
    `projects: {id, name, org?, start?, end?, role, techStack: string[], achievements: string[], link?}[]`,
    `skills: {category, items: string[]}[]`, `education: {school, major?, degree?, start?, end?}[]`,
    `certifications: {name, issuer?, date?}[]`, `careerNarrative: string`(경력기술서),
    `portfolio: {title, url?, filePath?, summary}[]`
  - `Preferences`: `salaryMinManwon?: number, salaryMaxManwon?: number, locations: string[], workStyle: 'any'|'remote'|'hybrid'|'office', companySizes: string[], preferredIndustries: string[], avoidIndustries: string[], notes?: string`
  - `emptyResume(): ResumeContent`, `defaultPreferences(): Preferences`
- Produces (`repo.ts`):
  - `saveResumeVersion(content: ResumeContent, sourceNote?: string, db?): { id: number; versionNo: number }` — versionNo = 기존 최대 + 1, 저장 전 zod 검증
  - `getLatestResume(db?): { id; versionNo; content: ResumeContent; createdAt } | null`
  - `listResumeVersions(db?): { id; versionNo; createdAt; sourceNote }[]` (최신순)
  - `getResumeVersion(id, db?)`
  - `getPreferences(db?): Preferences` (없으면 기본값), `savePreferences(p: Preferences, db?)`

- [ ] **Step 1: 실패하는 테스트**

```ts
test('saveResumeVersion increments versionNo and getLatestResume returns newest', () => {
  const db = makeTestDb();
  const a = saveResumeVersion({ ...emptyResume(), summary: 'v1' }, 'import', db);
  const b = saveResumeVersion({ ...emptyResume(), summary: 'v2' }, undefined, db);
  expect([a.versionNo, b.versionNo]).toEqual([1, 2]);
  expect(getLatestResume(db)!.content.summary).toBe('v2');
});
test('saveResumeVersion rejects invalid content', () => {
  expect(() => saveResumeVersion({ summary: 1 } as any, undefined, makeTestDb())).toThrow();
});
test('getPreferences returns defaults then saved value', () => {
  const db = makeTestDb();
  expect(getPreferences(db).workStyle).toBe('any');
  savePreferences({ ...defaultPreferences(), locations: ['서울'] }, db);
  expect(getPreferences(db).locations).toEqual(['서울']);
});
```

- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: resume and preferences schema + repo`.

---

### Task 5: Claude Code CLI 실행기

**Files:**
- Create: `src/lib/ai/runner.ts`, `src/lib/ai/claude-cli.ts`, `tests/fixtures/fake-claude.mjs`, `tests/claude-cli.test.ts`

**Interfaces:**
- Produces (`runner.ts`):

```ts
export interface AiRunRequest {
  prompt: string;              // stdin으로 전달
  jsonSchema: object;          // --json-schema
  model: string;               // --model
  tools: string[];             // --tools ([]이면 "" 전달)
  cwd: string;                 // data/ai-work/<jobId>
  timeoutMs: number;
  resumeSessionId?: string;    // --resume
}
export interface AiRunResult { output: unknown; sessionId: string; usage: unknown; durationMs: number }
export class AiError extends Error { constructor(public kind: AiErrorKind, message: string, public sessionId?: string) }
export interface AiRunner { run(req: AiRunRequest): Promise<AiRunResult> }
```

- Produces (`claude-cli.ts`): `class ClaudeCliRunner implements AiRunner { constructor(opts?: { bin?: string }) }` (기본 `config.claudeBin`), `buildClaudeArgs(req: AiRunRequest): string[]`

- [ ] **Step 1: 가짜 CLI 작성** `tests/fixtures/fake-claude.mjs` — stdin 전부 읽고, 환경변수 `FAKE_CLAUDE_MODE`에 따라 stdout에 출력:
  - `ok`: `{"type":"result","is_error":false,"session_id":"s-1","result":"","structured_output":{"stdinLength":<stdin 글자 수>,"args":<process.argv.slice(2)>},"usage":{}}`
  - `ok_result_text`: `structured_output` 없이 `result`에 같은 객체를 JSON 문자열로
  - `auth`: `{"type":"result","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed","session_id":"s-2"}`
  - `limit`: `is_error:true`, `result:"Claude usage limit reached. Your limit will reset at 5pm"`
  - `garbage`: `not json`
  - `hang`: 60초 대기
  테스트는 `bin`으로 `process.execPath`를 쓰고 첫 인자에 스크립트 경로를 넣을 수 있도록, 생성자 옵션에 `binArgs?: string[]`(앞에 붙는 인자)도 받는다.

- [ ] **Step 2: 실패하는 테스트**

```ts
const fake = (mode: string) => new ClaudeCliRunner({ bin: process.execPath, binArgs: [FAKE], env: { FAKE_CLAUDE_MODE: mode } });
const req = (o: Partial<AiRunRequest> = {}): AiRunRequest =>
  ({ prompt: '가'.repeat(40000), jsonSchema: { type: 'object' }, model: 'opus', tools: [], cwd: tmp, timeoutMs: 5000, ...o });

test('passes large prompt via stdin and returns structured_output', async () => {
  const r = await fake('ok').run(req());
  expect((r.output as any).stdinLength).toBe(40000);
  expect(r.sessionId).toBe('s-1');
});
test('builds required flags and never passes prompt as argument', async () => {
  const args = buildClaudeArgs(req({ tools: ['Read'], resumeSessionId: 's-9' }));
  expect(args).toEqual(expect.arrayContaining(['-p', '--safe-mode', '--output-format', 'json',
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--model', 'opus', '--tools', 'Read', '--resume', 's-9', '--json-schema']));
  expect(args.join(' ')).not.toContain('가가가');
});
test('empty tools list passes empty string', () => {
  const args = buildClaudeArgs(req({ tools: [] }));
  expect(args[args.indexOf('--tools') + 1]).toBe('');
});
test('falls back to parsing result text as JSON', async () => {
  expect(((await fake('ok_result_text').run(req())).output as any).stdinLength).toBe(40000);
});
test('classifies auth failure', async () => {
  await expect(fake('auth').run(req())).rejects.toMatchObject({ kind: 'auth' });
});
test('classifies usage limit', async () => {
  await expect(fake('limit').run(req())).rejects.toMatchObject({ kind: 'usage_limit' });
});
test('non-JSON stdout is cli error', async () => {
  await expect(fake('garbage').run(req())).rejects.toMatchObject({ kind: 'cli' });
});
test('kills process on timeout', async () => {
  await expect(fake('hang').run(req({ timeoutMs: 500 }))).rejects.toMatchObject({ kind: 'timeout' });
});
test('missing binary is cli error with install hint', async () => {
  await expect(new ClaudeCliRunner({ bin: 'definitely-not-claude' }).run(req()))
    .rejects.toMatchObject({ kind: 'cli' });
});
```

- [ ] **Step 3:** FAIL 확인.
- [ ] **Step 4:** 구현. `child_process.spawn(bin, [...binArgs, ...buildClaudeArgs(req)], { cwd, shell: false, windowsHide: true })`; stdin에 prompt 쓰고 종료. 타임아웃 시 프로세스 트리 종료(Windows는 `taskkill /pid <pid> /T /F`). 분류 규칙(대소문자 무시, `is_error` 또는 비정상 종료 시 결과 문자열 대상):
  - `auth`: `/authenticat|oauth|log ?in|login/`
  - `usage_limit`: `/usage limit|rate limit|limit reached|quota/`
  - 그 외 `cli`. 메시지는 원문 그대로 보존.
  - 출력 선택: `structured_output`이 있으면 그것, 없으면 `result`를 `JSON.parse`(실패 시 `schema`).
  - `auth` 메시지에는 "터미널에서 `claude`를 실행해 다시 로그인하세요."를 덧붙인다. 바이너리 없음(ENOENT)은 "Claude Code CLI를 찾을 수 없습니다. 설치 또는 설정의 CLAUDE_BIN을 확인하세요."
- [ ] **Step 5:** PASS 확인.
- [ ] **Step 6: 실제 CLI 수동 확인** (사용자가 터미널에서 `claude` 로그인된 상태여야 함). 스크래치 스크립트로 `new ClaudeCliRunner().run({ prompt: "회사명 '토스', 포지션 'Server Developer' 추출", jsonSchema: {type:'object',properties:{company:{type:'string'},position:{type:'string'}},required:['company','position']}, model:'haiku', tools:[], cwd: <임시폴더>, timeoutMs: 120000 })` 실행.
  Expected: `output`이 `{company:'토스', position:'Server Developer'}`. 결과 JSON에서 구조화 출력이 실제로 어느 필드에 오는지 확인하고, `structured_output`이 아니면 파서를 그 필드에 맞춘다.
- [ ] **Step 7:** 커밋 `feat: claude code cli runner with error classification`.

---

### Task 6: 작업 큐와 워커

**Files:**
- Create: `src/lib/ai/queue.ts`, `src/instrumentation.ts`, `src/app/api/jobs/[id]/route.ts`, `tests/queue.test.ts`

**Interfaces:**
- Consumes: `AiRunner`, `AiError`, `aiJobs` 테이블
- Produces:

```ts
export type JobHandler = (ctx: { jobId: number; payload: any; runner: AiRunner; workDir: string; db: Db }) =>
  Promise<{ result: unknown; sessionId?: string; usage?: unknown; model?: string }>;
export function enqueueJob(type: JobType, payload: unknown, db?: Db): number;
export function getJob(id: number, db?: Db): JobRow | undefined;
export function latestJobFor(type: JobType, match: (payload: any) => boolean, db?: Db): JobRow | undefined;
export function recoverInterruptedJobs(db?: Db): number;      // running → failed(kind 'interrupted', "앱이 재시작되어 중단되었습니다")
export function processNextJob(deps: { runner: AiRunner; handlers: Record<JobType, JobHandler>; db?: Db }): Promise<boolean>; // 처리했으면 true
export function startWorker(deps: {...; pollMs?: number}): () => void; // 정지 함수 반환, 동시 실행 1개 보장
export const JOB_TIMEOUT_MS: Record<JobType, number>; // 모두 300_000
```

- `GET /api/jobs/[id]` → `{ id, type, status, errorKind, errorMessage, finishedAt }`
- `instrumentation.ts` `register()`: `NEXT_RUNTIME === 'nodejs'`일 때만 `ensureDataDirs()` → `runMigrations(getDb())` → `runDailyBackup()` → `recoverInterruptedJobs()` → `startWorker({ runner: new ClaudeCliRunner(), handlers })`. 개발 모드 재로드에 대비해 `globalThis.__cfWorkerStarted`로 한 번만 시작.

- [ ] **Step 1: 실패하는 테스트**

```ts
test('processes queued jobs one at a time in FIFO order and stores result', async () => {
  const db = makeTestDb(); const order: number[] = [];
  const a = enqueueJob('analyze_posting', { n: 1 }, db); const b = enqueueJob('analyze_posting', { n: 2 }, db);
  const handlers = { analyze_posting: async ({ payload }) => { order.push(payload.n); return { result: { ok: payload.n }, sessionId: 's' }; } } as any;
  await processNextJob({ runner: stubRunner, handlers, db }); await processNextJob({ runner: stubRunner, handlers, db });
  expect(order).toEqual([1, 2]);
  expect(getJob(a, db)).toMatchObject({ status: 'succeeded', result: { ok: 1 }, sessionId: 's' });
});
test('stores AiError kind and message on failure', async () => {
  const db = makeTestDb(); const id = enqueueJob('analyze_posting', {}, db);
  const handlers = { analyze_posting: async () => { throw new AiError('auth', '로그인 필요'); } } as any;
  await processNextJob({ runner: stubRunner, handlers, db });
  expect(getJob(id, db)).toMatchObject({ status: 'failed', errorKind: 'auth', errorMessage: '로그인 필요' });
});
test('recovers interrupted jobs', () => {
  const db = makeTestDb(); const id = enqueueJob('analyze_posting', {}, db);
  db.update(aiJobs).set({ status: 'running' }).where(eq(aiJobs.id, id)).run();
  expect(recoverInterruptedJobs(db)).toBe(1);
  expect(getJob(id, db)).toMatchObject({ status: 'failed', errorKind: 'interrupted' });
});
test('creates per-job work dir', async () => { /* handler가 받은 workDir가 config.aiWorkDir/<jobId>이고 존재함 */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현(handler 밖 예외는 `cli`로 기록). **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: sqlite-backed ai job queue and worker`.

---

### Task 7: 공고 본문 추출 (Playwright)

**Files:**
- Create: `src/lib/extract/browser.ts`, `src/lib/extract/extract-posting.ts`, `tests/fixtures/posting-full.html`, `tests/fixtures/posting-empty.html`, `tests/extract.test.ts`

**Interfaces:**
- Produces:
  - `withBrowser<T>(fn: (ctx: BrowserContext) => Promise<T>, opts?: { headless?: boolean; profileDir?: string }): Promise<T>` — `chromium.launchPersistentContext(profileDir)`, 프로세스 내 잠금(동시에 하나만). 잠금 중 다른 호출은 대기.
  - `isBrowserBusy(): boolean`
  - `openSiteLogin(site: SiteId): Promise<void>` — 화면 있는 브라우저로 로그인 페이지를 열고 사용자가 창을 닫을 때까지 잠금 유지. 로그인 URL: remember `https://career.rememberapp.co.kr/`, wanted `https://www.wanted.co.kr/`, groupby `https://groupby.kr/`, jobkorea `https://www.jobkorea.co.kr/Login/Login_Tot.asp`.
  - `extractPostingText(url: string, opts?: { profileDir?: string; timeoutMs?: number }): Promise<{ text: string; title: string }>` — 실패 시 `AiError('extract_failed', ...)`
  - `MIN_POSTING_TEXT_LENGTH = 300`, 최대 50,000자로 자름

- [ ] **Step 1:** 픽스처 작성: `posting-full.html`은 `<script>`로 렌더링 후 `<main>`에 공고 본문(400자 이상 한국어 주요업무/자격요건)을 넣는 페이지. `posting-empty.html`은 `<nav>로그인 | 회원가입</nav>`만 있는 페이지.
- [ ] **Step 2: 실패하는 테스트**

```ts
test('extracts JS-rendered text from page', async () => {
  const r = await extractPostingText(pathToFileURL(FULL).href, { profileDir: tmpProfile() });
  expect(r.text).toContain('자격요건');
  expect(r.text.length).toBeGreaterThanOrEqual(300);
});
test('fails on too-short text', async () => {
  await expect(extractPostingText(pathToFileURL(EMPTY).href, { profileDir: tmpProfile() }))
    .rejects.toMatchObject({ kind: 'extract_failed' });
});
test('serializes concurrent browser use', async () => { /* withBrowser 두 번 동시 호출 시 겹치지 않음 (시작/종료 타임스탬프 비교) */ });
```

- [ ] **Step 3:** FAIL. **Step 4:** 구현. `page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })`. 본문은 사이트별 선택자 우선(구현자가 실제 페이지를 보고 정함, 없으면 생략) → 없으면 `main`, `article`, `body` 순으로 `innerText`. 공백 정리 후 길이 검사. 메시지: "공고 본문을 읽지 못했습니다(로그인이 필요하거나 페이지 구조가 다를 수 있음). 공고 내용을 붙여넣어 주세요."
- [ ] **Step 5:** PASS. **Step 6:** 커밋 `feat: posting text extraction with persistent browser profile`.

---

### Task 8: 회사·공고·지원 저장소와 검색

**Files:**
- Create: `src/lib/ai/tasks/schemas.ts` (Task 9 본문에 적힌 `AnalysisResult`·`ImportedApplications` zod 정의를 이 Task에서 만든다), `src/lib/companies/repo.ts`, `src/lib/postings/repo.ts`, `src/lib/applications/repo.ts`, `src/lib/search/dashboard.ts`, `tests/repos.test.ts`, `tests/search.test.ts`

**Interfaces:**
- Consumes: `normalizeCompanyName`, `canonicalizeUrl`, `detectSite`, `enqueueJob`
- Produces (`companies/repo.ts`):
  - `findOrCreateCompany(input: { displayName: string; legalName?: string | null }, db?): number` — 정규화 키(display, legal) 중 하나라도 `companyKeys`에 있으면 그 회사, 없으면 생성 + 키 등록. 기존 회사에 새 키(예: 법인명)가 생기면 추가.
  - `searchCompanies(text: string, db?): { id; displayName; legalName: string|null; applicationCount: number }[]` — 회사 연결 변경·합치기 창의 검색용(정규화 키 부분일치)
  - `addCompanyAlias(companyId: number, alias: string, db?)`, `mergeCompanies(keepId: number, removeId: number, db?)` (공고·지원·키를 keep으로 이동)
  - `getCompany(id, db?)`, `listCompanyKeys(companyId, db?)`
- Produces (`postings/repo.ts`):
  - `registerPosting(input: { url?: string; pastedText?: string; siteNote?: string }, db?): { postingId: number; existing: boolean; jobId?: number }` — url 있으면 canonical로 중복 확인(있으면 `existing:true`, 작업 생성 안 함). 새 공고면 `site=detectSite`, 붙여넣기 텍스트면 `rawText`·`fetchedAt` 저장, `enqueueJob('analyze_posting', {postingId})`. url·텍스트 둘 다 없으면 예외.
  - `setPostingText(postingId, text, db?)`, `providePostingText(postingId, text, db?): number /*jobId*/` (텍스트 저장 + 재분석 작업)
  - `reanalyzePosting(postingId, db?): number`
  - `saveAnalysis(postingId, resumeVersionId, result: AnalysisResult, jobId, db?)` — analyses 추가, 공고의 `positionTitle`, `deadline`, `extracted`(=result.posting) 갱신, `findOrCreateCompany`로 회사 연결(사용자가 이미 회사 연결을 바꿨으면 유지 — `companyId`가 null일 때만 설정)
  - `getPosting(id, db?)`, `getLatestAnalysis(postingId, db?)`, `listAnalyses(postingId, db?)`
  - `listAnalyzedNotApplied(db?)` — 지원 기록 없는 공고(최신순, 최신 적합도 포함)
  - `setPostingCompany(postingId, companyId, db?)`
  - `deletePosting(postingId, db?)` — 지원 기록이 있으면 예외("지원 기록이 있는 공고는 삭제할 수 없습니다"), 이 공고의 작업이 실행 중이면 예외("작업이 끝난 뒤 삭제하세요"), 대기 중 작업은 취소. 분석은 cascade로 함께 삭제 (D-02)
  - `listSiteNotes(db?): string[]` — 지금까지 쓴 기타 출처 이름(공고·지원 기록 합쳐 중복 제거, 최근 사용순). 입력 칸 자동완성용 (D-03)
- Produces (`applications/repo.ts`):
  - `markApplied(input: { postingId: number; appliedAt?: string; site?: SiteId; siteNote?: string; notes?: string }, db?): number` — 공고의 회사·포지션·사이트 사용, 기본 appliedAt=오늘, submittedResume = `{kind:'base', versionId: 최신 이력서 id}`, 상태 `applied` + statusEvents 기록. 공고에 회사가 아직 없으면 예외("분석이 끝난 뒤 지원 완료를 눌러주세요").
  - `changeStatus(applicationId, status: ApplicationStatus, opts?: { interviewRound?: number; note?: string; at?: string }, db?)` — `interview`면 interviewRound 필수
  - `getPriorApplications(companyId: number, opts?: { excludePostingId?: number }, db?): { id; positionTitle; site; appliedAt; status }[]`
  - `bulkCreateApplications(rows: { companyName; positionTitle; site: SiteId; siteNote?: string; appliedAt: string; status: ApplicationStatus }[], db?): number` — 각 행 `findOrCreateCompany`, postingId 없이 생성
  - `getApplicationForPosting(postingId, db?)`, `listStatusEvents(applicationId, db?)`, `updateNotes(applicationId, notes, db?)`
  - `updateApplication(id, patch: { companyName?: string; positionTitle?: string; site?: SiteId; siteNote?: string|null; appliedAt?: string }, db?)` — companyName이 바뀌면 `findOrCreateCompany`로 다시 연결. 상태는 여기서 바꾸지 않는다(`changeStatus` 사용) (D-01)
  - `deleteApplication(id, db?)` — 상태 이력은 cascade로 함께 삭제. 공고는 남아 "분석한 공고"로 돌아간다 (D-01)
- Produces (`search/dashboard.ts`):
  - `searchApplications(q: { text?: string; status?: ApplicationStatus; site?: SiteId; from?: string; to?: string }, db?): DashboardRow[]` — `DashboardRow = { applicationId; postingId: number|null; companyId; companyName; positionTitle; site; appliedAt; status; interviewRound: number|null; fitScore: number|null; resumeLabel: string|null; resumeBaseVersionNo: number|null }`, appliedAt 최신순. `resumeLabel`·`resumeBaseVersionNo`는 제출한 이력서(1·2단계는 기본 이력서만: `"기본 v3"`, 3), 가져온 기록이면 둘 다 null. 3단계에서 맞춤본(`"맞춤 r2"`, 그 맞춤본의 기준 버전)을 더한다. text는 정규화 후 `companyKeys.key LIKE %q%`(별칭·법인명 포함), 포지션명 부분일치도 포함.
  - `groupDashboardRows(rows: DashboardRow[], by: 'site'|'status'|'resume'): { key: string; label: string; rows: DashboardRow[]; passed: number; decided: number }[]` — 순수 함수. 순서 고정: site는 리멤버·원티드·그룹바이·잡코리아·기타, status는 지원·서류합격·면접·최종합격·종료(불합격+지원취소), resume은 기준 버전 내림차순 + 마지막에 "모름"(null). 빈 묶음은 site·resume에서 빼고 status에서는 남긴다(보드 열 고정). `decided` = 지원 단계와 지원취소를 뺀 건수, `passed` = 그중 서류합격·면접·최종합격.
  - `getDashboardStats(now?: Date, db?): { appliedThisMonth: number; byStatus: Record<ApplicationStatus, number>; bySite: Record<SiteId, number>; analyzedNotApplied: number }`

- [ ] **Step 1: 실패하는 테스트** (`tests/repos.test.ts`, `tests/search.test.ts`)

```ts
test('registerPosting dedupes canonical url', () => {
  const db = makeTestDb();
  const a = registerPosting({ url: 'https://www.wanted.co.kr/wd/1?utm_source=x' }, db);
  const b = registerPosting({ url: 'https://www.wanted.co.kr/wd/1#apply' }, db);
  expect(b).toEqual({ postingId: a.postingId, existing: true });
  expect(a.jobId).toBeDefined();
});
test('findOrCreateCompany matches by legal name and adds new keys', () => {
  const db = makeTestDb();
  const id = findOrCreateCompany({ displayName: '토스', legalName: '(주)비바리퍼블리카' }, db);
  expect(findOrCreateCompany({ displayName: '비바리퍼블리카' }, db)).toBe(id);
  expect(findOrCreateCompany({ displayName: '토스 ', legalName: null }, db)).toBe(id);
});
test('getPriorApplications returns earlier applications to same company from other postings', () => { /* 공고 2개 같은 회사, 첫 공고 지원 → 두번째 공고 기준 조회 시 1건 */ });
test('markApplied before analysis throws', () => { /* companyId null 공고 */ });
test('changeStatus to interview requires round and records event', () => { /* round 없으면 throw; round 2 → application.interviewRound 2, events 2개 */ });
test('bulkCreateApplications links to existing company', () => { /* 기존 '카카오' + 행 '(주)카카오' → 같은 companyId */ });
test('deletePosting refuses when applied, cascades analyses otherwise', () => { /* 지원한 공고 → throw; 분석만 한 공고 → 공고·분석 삭제, 대기 작업 canceled */ });
test('updateApplication relinks company by name; deleteApplication removes events', () => { /* 회사명을 '카카오'로 바꾸면 기존 카카오 companyId; 삭제 후 statusEvents 0개, 공고는 listAnalyzedNotApplied에 다시 나타남 */ });
test('mergeCompanies moves postings, applications and keys', () => { /* 토스·비바리퍼블리카 따로 생성 → 합친 뒤 검색 '비바리'로 두 회사 기록 모두 */ });
test('listSiteNotes returns distinct recent notes', () => { /* '지인 추천' 2번, '회사 채용 페이지' 1번 → 최근순 2개 */ });

// search.test.ts
test('search finds by legal name and alias', () => {
  // '토스'(법인 비바리퍼블리카) 지원 1건, '토스뱅크' 지원 1건, '카카오' 1건
  expect(searchApplications({ text: '토스' }, db).map(r => r.companyName).sort()).toEqual(['토스', '토스뱅크']);
  expect(searchApplications({ text: '비바리' }, db)).toHaveLength(1);
  addCompanyAlias(kakaoId, 'Kakao', db);
  expect(searchApplications({ text: 'kakao' }, db)).toHaveLength(1);
});
test('filters by status and site, sorted by appliedAt desc', () => { /* ... */ });
test('getDashboardStats counts this month and analyzed-not-applied', () => { /* now=2026-11-16 기준 */ });
test('groupDashboardRows by site keeps fixed order and pass rate', () => {
  // 원티드: 서류합격 1, 지원 1, 지원취소 1 / 잡코리아: 불합격 1
  const g = groupDashboardRows(rows, 'site');
  expect(g.map(x => x.key)).toEqual(['wanted', 'jobkorea']);
  expect(g[0]).toMatchObject({ passed: 1, decided: 1 });   // 지원·지원취소는 decided에서 제외
  expect(g[1]).toMatchObject({ passed: 0, decided: 1 });
});
test('groupDashboardRows by status keeps all five columns', () => { /* 빈 열도 rows: [] 로 존재, 면접 2차 행은 interview 열 */ });
test('groupDashboardRows by resume puts unknown last', () => { /* base 3, 2, null → 키 순서 v3, v2, none */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: companies, postings, applications repos and dashboard search`.

---

### Task 9: AI 작업 정의 — 프롬프트, 출력 스키마, 처리기

**Files:**
- Create: `prompts/analyze-posting.md`, `prompts/import-resume.md`, `prompts/import-applications.md`, `src/lib/ai/prompt.ts`, `src/lib/ai/tasks/analyze-posting.ts`, `src/lib/ai/tasks/import-resume.ts`, `src/lib/ai/tasks/import-applications.ts`, `src/lib/ai/tasks/index.ts`, `tests/tasks.test.ts`

**Interfaces:**
- Consumes: `AiRunner`, `extractPostingText`, `getLatestResume`, `getPreferences`, `getModelFor`, Task 8의 `getPosting`, `setPostingText`, `saveAnalysis`, `getLatestAnalysis`.
- Uses (`schemas.ts`, Task 8에서 생성):

```ts
AnalysisResult = z.object({
  posting: z.object({
    companyDisplayName: z.string(), companyLegalName: z.string().nullable(), positionTitle: z.string(),
    experienceRequirement: z.string().nullable(), employmentType: z.string().nullable(), location: z.string().nullable(),
    deadline: z.string().nullable(),        // 'YYYY-MM-DD' 또는 null(상시)
    salary: z.string().nullable(),
    responsibilities: z.array(z.string()), requirements: z.array(z.string()),
    preferred: z.array(z.string()), techStack: z.array(z.string()),
  }),
  fit: z.object({
    score: z.number().int().min(0).max(100),
    breakdown: z.array(z.object({
      category: z.enum(['requirements','preferred','experience_years','tech_stack','domain','preferences']),
      score: z.number().int().min(0).max(100), reason: z.string() })),
  }),
  strengths: z.array(z.object({ point: z.string(), evidence: z.string() })),
  gaps: z.array(z.object({ point: z.string(), kind: z.enum(['hidden','missing']), suggestion: z.string() })),
  preferenceMismatches: z.array(z.string()),
  tailoringAdvice: z.string(),
});
ImportedApplications = z.object({ rows: z.array(z.object({
  companyName: z.string(), positionTitle: z.string(),
  site: z.enum(['remember','wanted','groupby','jobkorea','other']).nullable(),
  appliedAt: z.string().nullable(), status: z.enum([...ApplicationStatus 값]).nullable() })) });
// import_resume 출력은 ResumeContent 그대로
```

- Produces (`prompt.ts`): `renderPrompt(name: 'analyze-posting'|'import-resume'|'import-applications', vars: Record<string,string>): string` — `{{var}}` 치환, 누락 변수는 예외.
- Produces (`tasks/index.ts`): `handlers: Record<JobType, JobHandler>`
- 작업 payload:
  - `analyze_posting`: `{ postingId: number }` — rawText 없으면 `extractPostingText(url)` 후 `setPostingText` 저장 → 프롬프트(공고 본문, 최신 이력서 JSON, 희망 조건 JSON) → runner(tools `[]`) → `AnalysisResult` 검증 → `saveAnalysis(postingId, resumeVersionId, result, jobId)`. 이력서가 없으면 `AiError('cli', '기본 이력서를 먼저 등록하세요.')`.
  - `import_resume`: `{ filePaths: string[] /* uploads 내 경로 */, pastedText?: string }` — 파일을 workDir로 복사, 프롬프트에 파일명 목록 + 붙여넣은 텍스트, tools `['Read']` → `ResumeContent` 검증 → 결과만 반환(저장은 사용자가 검토 후 화면에서).
  - `import_applications`: `{ site: SiteId|null, pastedText?: string, imagePaths?: string[] }` — tools `['Read']`(이미지 있을 때), 결과 `ImportedApplications` 반환(저장은 검토 후).
- 프롬프트 필수 규칙:
  - 분석: 근거는 이력서에 실제 있는 내용만, `gaps.kind`는 "이력서에 근거가 있는데 드러나지 않음 = hidden / 근거 없음 = missing", 희망 조건이 비어 있으면 `preferences` 항목 생략, 공고 본문에 메뉴·광고 등 잡음이 있으면 무시, 모든 문장은 한국어.
  - 이력서 가져오기: 원문에 없는 내용 생성 금지, 모르는 값은 빈 문자열/빈 배열, 경험·프로젝트 `id`는 `exp-1`, `prj-1` 형식.
  - 지원 내역: 날짜는 `YYYY-MM-DD`, 연도가 없으면 올해(오늘 날짜를 변수로 전달), 판단 불가 값은 null.
- [ ] **Step 1: 실패하는 테스트** (가짜 runner가 요청을 기록하고 정해진 출력을 반환)

```ts
test('analyze_posting extracts text when missing, then saves analysis linked to latest resume', async () => {
  // 준비: 이력서 v1 저장, rawText 없는 공고 등록, extractPostingText를 vi.mock으로 '공고 본문...' 반환
  const res = await handlers.analyze_posting({ jobId, payload: { postingId }, runner: fakeRunner(VALID_ANALYSIS), workDir, db });
  expect(fakeRunner.lastReq.tools).toEqual([]);
  expect(fakeRunner.lastReq.prompt).toContain('공고 본문');
  expect(fakeRunner.lastReq.model).toBe('opus');
  expect(getPosting(postingId, db)!.rawText).toBe('공고 본문...');
  expect(getLatestAnalysis(postingId, db)!.fitScore).toBe(VALID_ANALYSIS.fit.score);
});
test('analyze_posting fails without base resume', async () => { /* rejects kind 'cli', message contains '기본 이력서' */ });
test('analyze_posting rejects schema-invalid output', async () => { /* score 150 → kind 'schema' */ });
test('import_resume copies files into work dir and allows only Read', async () => { /* lastReq.tools == ['Read'], workDir에 파일 존재 */ });
test('renderPrompt throws on missing variable', () => { expect(() => renderPrompt('analyze-posting', {})).toThrow(); });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. JSON 스키마는 `z.toJSONSchema(schema)`로 만든다. **Step 4:** PASS.
- [ ] **Step 5: 실제 CLI 수동 확인:** 샘플 공고 텍스트 + 샘플 이력서로 `analyze_posting`을 실제 `ClaudeCliRunner`로 1회 실행, 결과가 스키마를 통과하고 한국어로 나오는지 확인. 소요 시간 기록.
- [ ] **Step 6:** `src/instrumentation.ts` 작성(Task 6 Interfaces의 `register()` 설명대로: `ensureDataDirs` → `runMigrations` → `runDailyBackup` → `recoverInterruptedJobs` → `startWorker({ runner: new ClaudeCliRunner(), handlers })`, `globalThis.__cfWorkerStarted`로 한 번만). `npm run build` 성공 확인.
- [ ] **Step 7:** 커밋 `feat: analyze/import ai tasks with prompts and schemas`.

---

### Task 10: 화면 골격과 대시보드

**Files:**
- Create/Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/_actions/applications.ts`(새로), `src/app/_components/StatusBadge.tsx`, `src/app/_components/SiteBadge.tsx`, `src/app/_components/DashboardViews.tsx`(보기 4종)

**Interfaces:**
- Consumes: `searchApplications`, `groupDashboardRows`, `getDashboardStats`, `STATUS_LABELS`, `SITE_LABELS`
- 사이트 색(`SiteBadge`, 색 점 + 이름): 리멤버 `#0E7C86`, 원티드 `#6741D9`, 그룹바이 `#A15C00`, 잡코리아 `#B5179E`, 기타 `#5B6475`. 상태 색: 지원 회색, 서류합격 `#0369A1`, 면접 `#2342C8`, 최종합격 `#15803D`, 불합격·지원취소 흐린 회색. 디자인 기준은 `docs/design/mockups/index.html`(B 코발트).
- Produces: 상단 내비게이션 링크 — 대시보드(`/`), 공고 등록(`/postings/new`), 분석한 공고(`/postings/analyzed`), 기본 이력서(`/resume`), 가져오기(`/import`), 설정(`/settings`)

- [ ] **Step 1:** 대시보드 구현 (D-01, D-07 반영) — 내비게이션 오른쪽 진행 중 작업 표시(queued/running 수와 대상 공고 링크, 이 Task에서 `listActiveJobs(db?)`를 `ai/queue.ts`에 추가), "기록만" 행 표시, 기간 필터(전체/이번 달/최근 3개월/최근 1년/직접 지정), 기본 이력서가 없으면 맨 위 안내 줄, 기록만 행을 펼치면 상태 변경 + [기록 수정](작은 창: 회사·포지션·사이트·출처·지원일) + [기록 삭제](확인 창). 검색창(입력 즉시 URL 쿼리 `?q=` 갱신, 서버 컴포넌트에서 조회), 상태·사이트·기간 필터, 제목 아래 보기 탭(전체 / 사이트별 / 상태별 / 이력서별, `?view=`로 유지 — 와이어프레임 1-2·1-3), 전체 보기 표(회사 / 포지션 / 사이트 / 지원일 / 상태(면접이면 "면접 2차") / 제출한 이력서 / 적합도), 사이트별·이력서별은 접히는 묶음(머리에 개수와 "서류 통과 passed / decided"), 상태별은 5열 보드(카드를 다른 열로 끌면 상태 변경 창 — 저장해야 바뀜), 행 클릭 시 `postingId` 있으면 `/postings/[id]`, 없으면 행 펼침으로 상태 변경 UI. 상단 요약: "이번 달 지원 N · 서류합격 N · 면접 N", "분석한 공고 N건 보기" 링크. 결과 없음 문구: "'{q}'에 지원한 기록이 없습니다."
- [ ] **Step 2: 확인:** `npm run dev` 후 브라우저에서 `/` 접속, 테스트 데이터(시드 스크립트 `scripts/seed-dev.ts`로 회사 3·지원 5건 입력, `data/` 대신 `CAREER_FLOW_DATA_DIR=data-dev`)로 검색 "토스" → 2건, 필터 동작 확인, 보기 4종 전환과 새로고침 후 보기 유지 확인.
- [ ] **Step 3:** 커밋 `feat: dashboard with company search and stats`.

---

### Task 11: 공고 등록·상세 화면

**Files:**
- Create: `src/app/postings/new/page.tsx`, `src/app/postings/[id]/page.tsx`, `src/app/postings/analyzed/page.tsx`, `src/app/_components/JobStatus.tsx`, `src/app/_components/DuplicateBanner.tsx`, `src/app/_components/AnalysisView.tsx`
- Create: `src/app/_actions/postings.ts`, `src/app/postings/[id]/ApplyForm.tsx`(지원 완료 폼), `src/app/postings/[id]/StatusForm.tsx`(상태 변경 폼)
- Modify: `src/app/_actions/applications.ts`

**Interfaces:**
- Consumes: `deletePosting`, `listSiteNotes`, `searchCompanies`, `mergeCompanies`, `updateApplication`, `deleteApplication`, `registerPosting`, `providePostingText`, `reanalyzePosting`, `getPosting`, `getLatestAnalysis`, `latestJobFor`, `getPriorApplications`, `markApplied`, `changeStatus`, `updateNotes`, `getApplicationForPosting`, `listStatusEvents`, `setPostingCompany`, `addCompanyAlias`, `listAnalyzedNotApplied`, `GET /api/jobs/[id]`
- Produces (서버 액션): `registerPostingAction(formData)` → 등록 후 `/postings/[id]`로 이동(기존 공고면 "이미 등록된 공고입니다" 알림과 함께 이동)

- [ ] **Step 1: 등록 화면** — URL 입력 + "본문 직접 붙여넣기" 펼침 영역. 주소가 4개 사이트가 아니면(또는 본문만 넣으면) "출처 이름" 칸이 나타난다(선택, `listSiteNotes` 자동완성, D-03). 기본 이력서가 없으면 버튼 위에 경고 + [기본 이력서 등록] (D-07). 제출 시 상세로 이동.
- [ ] **Step 2: 상세 화면** — 상단: 회사명·포지션·사이트·마감일, **중복 경고 배너**("이 회사에 지원한 기록이 있습니다: 2025-10-03 원티드 'Server Developer' (서류합격)" 형식, 여러 건이면 목록), [지원 완료] 또는 현재 상태+상태 변경. 탭: 분석 / 공고 원문 / 지원 기록.
  - 분석 진행 중: `JobStatus`가 2초마다 `/api/jobs/[id]` 조회, "분석 중… (보통 1~2분)" + 경과 시간. 완료 시 새로고침.
  - 실패: 종류별 문구 — `extract_failed`: 붙여넣기 입력창 + [이 내용으로 분석]; `auth`: 메시지 + "터미널에서 `claude` 로그인 후 [다시 시도]"; `usage_limit`: 메시지 원문 + [다시 시도]; `timeout`: "시간 제한(N분)을 넘었습니다" + 설정 링크 + [다시 시도]; `schema`: "결과를 읽지 못했습니다" + [원문 보기] 펼침 + [다시 시도]; `interrupted`: "앱이 종료되어 작업이 중단되었습니다" + [다시 시도]; 그 외: 메시지 + [다시 시도]. 문구 기준은 `docs/spec/screens.md` 0.4.
  - 분석 탭(`AnalysisView`): 적합도 점수(큰 숫자) + 항목별 점수·근거, 잘 맞는 점(근거 포함), 부족한 점을 "이력서에서 보완 가능(hidden)" / "실제로 부족(missing)" 두 묶음으로, 희망 조건 불일치, 맞춤 이력서 조언. 하단 [다시 분석], 이전 분석 결과 목록(날짜·점수).
  - 회사 연결 편집: 회사명 옆 [회사 연결 변경] → 작은 창에서 (1) 기존 회사 검색 선택, (2) 별칭 추가, (3) "다른 회사와 합치기": 합칠 회사를 검색해 고르고 "A와 B를 합칩니다. 공고 n건, 지원 기록 n건이 A로 모입니다" 확인 → `mergeCompanies` (D-04).
  - [공고 삭제](지원 기록이 없을 때만 보임) → 확인 창("분석 결과도 함께 삭제됩니다") → 대시보드로 이동 (D-02).
  - 상단: [원본 공고 열기 ↗](URL 있을 때), 탭 이름 옆 진행 중 "…"·실패 "!" 표시, 선택한 탭은 `?tab=`로 유지. 분석 기준 이력서가 현재보다 옛 버전이면 점수 아래 "기본 이력서가 vN으로 바뀌었습니다. 다시 분석하면 반영됩니다" (D-07).
  - 공고 원문 탭: 출처 URL·읽은 시각·읽은 방법 + [본문 다시 붙여넣기] → `providePostingText` (D-07).
  - 지원 기록 탭: 지원 요약 옆 [기록 수정]·[기록 삭제] (D-01).
  - [지원 완료] → 작은 폼(지원일 기본 오늘, 사이트 기본 공고 사이트, 사이트가 기타면 출처 이름(기본: 공고의 출처), 메모) → 저장 후 지원 기록 탭에 타임라인 표시.
- [ ] **Step 3: 분석한 공고 화면** — `listAnalyzedNotApplied` 표(회사, 포지션, 사이트, 적합도, 마감일, 등록일), 마감이 지난 공고는 흐리게 + "마감" (D-07), 클릭 시 상세.
- [ ] **Step 4: 확인:** 개발 서버에서 실제 원티드 공고 URL 1건 등록 → 추출·분석 완료까지 진행 표시 → 결과 표시 → [지원 완료] → 대시보드에 나타남. 같은 URL에 `?utm_source=a`를 붙여 다시 등록 → 기존 공고로 이동. 같은 회사의 다른 공고 등록 → 중복 경고 배너 표시. 분석만 한 공고 삭제 → 목록에서 사라짐, 지원한 공고에는 [공고 삭제]가 없음. 회사 두 개를 합친 뒤 대시보드 검색에서 한 회사로 보임. 일부러 `CLAUDE_BIN=없는이름`으로 실행해 오류 문구 확인.
- [ ] **Step 5:** 커밋 `feat: posting registration, analysis view, apply and status flow`.

---

### Task 12: 기본 이력서 화면

**Files:**
- Create: `src/app/resume/page.tsx`, `src/app/resume/ResumeEditor.tsx`, `src/app/resume/PreferencesForm.tsx`
- Create: `src/app/_actions/resume.ts`

**Interfaces:**
- Consumes: `enqueueJob('import_resume', ...)`, `getJob`, `saveResumeVersion`, `getLatestResume`, `listResumeVersions`, `getResumeVersion`, `getPreferences`, `savePreferences`, `ResumeContent`, `Preferences`
- Produces (서버 액션): `uploadResumeFilesAction(formData) → jobId` (PDF/DOCX/TXT/MD를 `uploads/resume/<timestamp>-<원래이름>`에 저장, 개당 20MB 제한), `saveResumeAction(content: ResumeContent, note?: string)`

- [ ] **Step 1:** 이력서가 없으면 "기존 이력서를 올려 시작하세요" — 파일 업로드(여러 개: 이력서·경력기술서·포트폴리오) + 텍스트 붙여넣기 → 가져오기 작업 진행 표시 → 결과를 편집기에 채워 **저장 전 검토** 상태로 표시 → [기본 이력서로 저장].
- [ ] **Step 2:** 편집기 — `ResumeContent` 각 섹션 편집(항목 추가·삭제·순서 이동), 저장 시 새 버전 + 메모. 내용이 직전 버전과 같으면 버전을 만들지 않고 "바뀐 내용이 없습니다"(3단계 `diffResume` 전까지는 JSON 비교). 저장하지 않은 변경이 있으면 화면을 떠날 때 확인. 가져오기 실패 시 "직접 입력으로 시작"(빈 편집기) (D-07). 버전 목록(번호·날짜·메모), 이전 버전 보기(읽기 전용).
- [ ] **Step 3:** 희망 조건 폼(`Preferences` 전 항목, 모두 선택 입력).
- [ ] **Step 4: 확인:** 실제 이력서 PDF 업로드 → 가져오기 결과가 항목별로 채워짐 → 수정 후 저장 → v1 생성 → 한 줄 바꿔 저장 → v2, 공고 분석이 v2 기준으로 기록되는지 확인.
- [ ] **Step 5:** 커밋 `feat: base resume import, editor, versions, preferences`.

---

### Task 13: 기존 지원 내역 가져오기 화면

**Files:**
- Create: `src/app/import/page.tsx`, `src/app/import/ImportReviewTable.tsx`
- Create: `src/app/_actions/import.ts`

**Interfaces:**
- Consumes: `enqueueJob('import_applications', ...)`, `getJob`, `bulkCreateApplications`, `searchApplications`, `normalizeCompanyName`
- Produces (서버 액션): `startApplicationImportAction(formData) → jobId` (사이트 선택, 텍스트 붙여넣기, 이미지 PNG/JPG 여러 장 → `uploads/import/`), `commitApplicationImportAction(rows)`

- [ ] **Step 1:** 입력 화면 — 사이트 선택(리멤버/원티드/그룹바이/잡코리아/기타), 텍스트 영역, 이미지 업로드. [추출하기] → 진행 표시.
- [ ] **Step 2:** 검토 표 — 행마다 회사·포지션·사이트(기타면 출처 이름 칸, D-03)·지원일·상태 편집, 삭제, 행 추가, 위쪽 [처음부터](검토 표를 버리고 입력 단계로, D-07). 값이 비어 있는 칸은 강조하고 비어 있으면 저장 불가. **이미 같은 회사·같은 지원일 기록이 있는 행은 "이미 있음" 표시하고 기본 체크 해제**(같은 내역을 두 번 가져오는 경우 대비). [N건 등록].
- [ ] **Step 3: 확인:** 원티드 지원 현황 텍스트를 붙여넣어 추출 → 검토 → 등록 → 대시보드 검색에 나타남. 같은 텍스트로 다시 가져오면 전부 "이미 있음" 표시.
- [ ] **Step 4:** 커밋 `feat: import past applications from text or screenshots`.

---

### Task 14: 설정 화면과 실행 마무리

**Files:**
- Create: `src/app/settings/page.tsx`, `src/lib/ai/health.ts`, `scripts/start-career-flow.cmd`, `docs/guide/usage.md`
- Create: `src/app/_actions/settings.ts`

**Interfaces:**
- Consumes: `getModelFor`, `setModelFor`, `openSiteLogin`, `isBrowserBusy`, `ClaudeCliRunner`, `config`
- Produces: `checkClaudeHealth(): Promise<{ installed: boolean; version?: string; loggedIn: boolean | null; message: string }>` — `claude --version` 실행(설치 확인), [로그인 확인] 버튼을 눌렀을 때만 haiku로 아주 짧은 `-p` 호출해 `auth` 오류 여부 확인(사용량 아주 조금 사용 — 버튼 옆에 표시)

- [ ] **Step 1:** 설정 화면 — Claude Code 상태(버전, 로그인 확인 버튼과 결과), 작업별 모델 선택(`opus`/`sonnet`/`haiku`), 사이트별 [로그인 창 열기] 버튼(브라우저 사용 중이면 비활성 + "분석 작업이 끝난 뒤 시도하세요"), 데이터 폴더 경로와 최근 백업 시각 표시.
- [ ] **Step 2:** `scripts/start-career-flow.cmd` — 프로젝트 폴더로 이동 → `npm run build`가 안 되어 있으면 빌드 → `npm run start` → 브라우저로 `http://127.0.0.1:3939` 열기. `docs/guide/usage.md`에 설치(Node 22, `npm i`, `npx playwright install chromium`), Claude Code 로그인, 실행, 데이터 백업 위치를 한국어로 짧게 정리.
- [ ] **Step 3: 확인 (전체 흐름, 실제 사용):** `npm test` 전부 PASS → `npm run build` 성공 → 시작 스크립트로 실행 → 설정에서 로그인 확인 → 이력서 등록 → 지원 내역 가져오기 → 리멤버 공고(사이트 로그인 창으로 로그인한 뒤) 등록·분석 → 지원 완료 → 대시보드 검색. 앱을 분석 도중 종료했다가 재시작해 해당 작업이 "중단됨"으로 표시되고 [다시 시도]가 되는지 확인.
- [ ] **Step 4:** 커밋 `feat: settings, claude health check, launcher script`.

---

## Spec 대비 범위

| 설계서 항목 | 이 계획 | 비고 |
|---|---|---|
| 7.1 기본 이력서·버전·희망 조건 | Task 4, 12 | |
| 7.2 대시보드·회사 검색 | Task 8, 10 | |
| 7.3 공고 등록·자동 분석·재분석 | Task 7, 8, 9, 11 | |
| 7.4 지원 완료·상태·타임라인·메모 | Task 8, 11 | |
| 7.7 기존 지원 내역 가져오기 | Task 8, 9, 13 | |
| 8 본문 추출·사이트 로그인 | Task 7, 14 | |
| 9 AI 실행 계층 (9.1–9.3, 9.5) | Task 5, 6, 9 | 9.4 대화로 다듬기는 3단계 계획(D-11: 매번 새 실행). 실행기는 `resumeSessionId`를 이미 지원 |
| 10 데이터 모델 | Task 2 | 맞춤 이력서·면접 준비·사이트 반영 테이블은 다음 계획에서 추가 |
| 13 백업 | Task 2, 6 | |
| 7.5 맞춤 이력서 + 11 PDF | — | 다음 계획 (3단계) |
| 7.6 면접 준비 | — | 다음 계획 (4단계) |
| 7.8 사이트 반영 체크리스트 | — | 다음 계획 (5단계) |
