# Career Flow — 디렉터리·파일 구성

- 상태: 초안 (사용자 검토 대기)
- 이 문서가 폴더·파일 배치의 기준이다. 각 단계 계획(`docs/plans/`)의 "File Structure"는 그 단계에서 만들거나 고치는 부분만 보여 준다. 둘이 다르면 이 문서를 따른다.
- 관련 문서: [product.md](product.md)(기획서), [screens.md](screens.md)(화면 구성)

---

## 1. 최상위 구성

```
career_flow/
├─ CLAUDE.md                 Claude Code용 프로젝트 안내 (개요·구조·문서 링크만)
├─ .claude/
│  ├─ rules/                 작업 규칙 (경로별로 자동 적용)
│  ├─ agents/                서브에이전트 (product-planner, developer, code-reviewer)
│  └─ skills/                프로젝트 전용 스킬 (feature-workflow: 기능 워크플로우, project-status: 현황 보고)
├─ docs/                     모든 문서 (기획·화면·구조·계획·디자인·사용 안내)
├─ prompts/                  Claude Code에 보내는 작업별 프롬프트 (.md)
├─ src/
│  ├─ instrumentation.ts     서버 시작 시 실행 (마이그레이션 → 백업 → 작업 워커)
│  ├─ app/                   화면·서버 액션·API (Next.js App Router)
│  └─ lib/                   화면과 무관한 모든 로직 (DB, AI 실행, 추출, PDF …)
├─ tests/                    Vitest 테스트
├─ drizzle/                  생성된 DB 마이그레이션 (drizzle-kit이 만듦, 손으로 고치지 않음)
├─ scripts/                  실행 스크립트·개발용 시드
├─ public/                   정적 파일 (Next.js 기본)
├─ data/                     실행 데이터 — git 제외 (7장)
└─ (설정 파일) package.json, tsconfig.json, next.config.ts, drizzle.config.ts,
   vitest.config.ts, eslint.config.mjs, postcss.config.mjs, .gitignore
```

## 2. `src/lib/` — 로직

영역(도메인)별 폴더. 각 폴더는 자기 데이터의 저장소(`repo.ts`)와 순수 함수를 가진다. 표의 "단계"는 그 파일이 처음 생기는 구현 단계(1 = 1·2단계 계획).

```
src/lib/
├─ config.ts                 경로·실행 설정 (데이터 폴더, claude 실행 파일)
├─ settings.ts               설정 키-값 (작업별 모델, 시간 제한)
├─ backup.ts                 DB 백업 (자동 일 1회, 수동)
├─ db/
│  ├─ schema.ts              Drizzle 테이블 전부
│  └─ client.ts              getDb(), runMigrations()
├─ domain/
│  ├─ types.ts               공용 타입·표시명 (SiteId, ApplicationStatus, JobType …)
│  └─ normalize.ts           회사명·URL 정규화, 사이트 판별
├─ resume/
│  ├─ schema.ts              ResumeContent, Preferences (zod)
│  ├─ repo.ts                기본 이력서 버전·희망 조건
│  ├─ diff.ts                두 이력서 비교 (변경 내역)
│  └─ fabrication.ts         지어낸 내용 검사
├─ companies/repo.ts         회사·별칭·매칭·합치기
├─ postings/repo.ts          공고 등록·조회·분석 결과 저장
├─ applications/repo.ts      지원 기록·상태 이력·중복 조회·일괄 등록·제출 이력서
├─ applications/sort.ts      지원 기록 기본 정렬(지원일 → 정렬용 일시 → id)
├─ applications/stages.ts    거친 단계 계산, 상태 필터 판정 (순수)
├─ applications/backfill.ts  정렬용 일시 일회성 채우기
├─ documents/
│  ├─ files.ts               서류 종류, 파일 이름 규칙, 지원일로 파일 고르기, 메모 "제출 서류" 줄 (순수)
│  ├─ folder.ts              data/documents 폴더 읽기, 안전한 경로 풀기
│  └─ migrate.ts             메모 "제출 서류" 줄 → 지원 기록 제출 서류 칸
├─ search/dashboard.ts       대시보드 검색·필터·요약 지표
├─ tailored/repo.ts          맞춤 이력서·리비전
├─ interview/
│  ├─ repo.ts                면접 준비·리비전·요청
│  └─ sources.ts             출처 링크 정리
├─ sync/repo.ts              사이트 반영 체크리스트·누적 규칙
├─ extract/
│  ├─ browser.ts             영구 프로필 브라우저, 전역 잠금, 사이트 로그인 창
│  └─ extract-posting.ts     공고 본문 추출
├─ pdf/
│  ├─ fonts.ts               Pretendard 글꼴 CSS (base64)
│  ├─ template.ts            이력서 JSON → HTML
│  └─ render.ts              HTML → A4 PDF, 파일명
└─ ai/
   ├─ runner.ts              AiRunner 인터페이스, AiError
   ├─ claude-cli.ts          ClaudeCliRunner (`claude -p` 실행)
   ├─ health.ts              Claude Code 설치·로그인 확인
   ├─ queue.ts               작업 큐 + 워커 (한 번에 하나)
   ├─ prompt.ts              prompts/*.md 로더
   ├─ revision.ts            다듬기·추가 요청용 새 실행 프롬프트 (D-11)
   └─ tasks/                 작업 종류별 처리기와 출력 스키마
      ├─ index.ts            JobType → 처리기 등록
      ├─ schemas.ts          AnalysisResult, ImportedApplications
      ├─ analyze-posting.ts
      ├─ import-resume.ts
      ├─ import-applications.ts
      ├─ tailor-schemas.ts   TailorOutput
      ├─ tailor-resume.ts    tailor_resume, revise_tailored
      ├─ interview-schemas.ts InterviewPrep
      ├─ prepare-interview.ts prepare_interview, revise_interview
      ├─ site-sync-schemas.ts SiteSyncOutput
      └─ site-sync.ts
```

| 단계 | 생기는 파일 |
|---|---|
| 1 | config, settings, backup, db/*, domain/*, resume/schema·repo, companies, postings, applications, search, extract/*, ai/runner·claude-cli·health·queue·prompt, ai/tasks/index·schemas·analyze-posting·import-resume·import-applications |
| 2 추가 | documents/* (`docs/plans/phase-2-past-records.md`) |
| 3 | resume/diff·fabrication, tailored/repo, pdf/*, ai/session, ai/tasks/tailor-* |
| 4 | interview/*, ai/tasks/interview-schemas·prepare-interview |
| 5 | sync/repo, ai/tasks/site-sync-* |

## 3. `src/app/` — 화면·서버 액션·API

주소 구조 = 폴더 구조. 한 화면에서만 쓰는 컴포넌트는 그 화면 폴더에, 여러 화면이 쓰는 것은 `_components/`에 둔다. `_`로 시작하는 폴더는 주소가 되지 않는다(Next.js 비공개 폴더).

```
src/app/
├─ layout.tsx                상단 내비게이션 (사이트 반영 배지, 진행 중 작업 표시)
├─ page.tsx                  대시보드 /
├─ globals.css
├─ _components/              여러 화면 공용
│  ├─ JobStatus.tsx          AI 작업 진행·실패 표시 (2초 폴링)
│  ├─ StatusBadge.tsx
│  ├─ SiteBadge.tsx
│  ├─ DuplicateBanner.tsx    중복 지원 경고
│  └─ AnalysisView.tsx       분석 결과 표시
├─ _actions/                 서버 액션 — 영역별 파일, lib 함수를 부르는 얇은 래퍼
│  ├─ applications.ts        지원 완료, 상태 변경, 메모
│  ├─ postings.ts            공고 등록, 본문 붙여넣기, 다시 분석, 회사 연결·별칭
│  ├─ resume.ts              이력서 가져오기·저장, 희망 조건
│  ├─ import.ts              지원 내역 추출·일괄 등록·직접 입력 중복 확인
│  ├─ documents.ts           메모의 제출 서류 이관
│  ├─ settings.ts            모델·시간 제한, 로그인 확인, 사이트 로그인 창, 백업, 데이터 폴더 열기
│  ├─ tailored.ts            맞춤 이력서 생성·다듬기        (3단계)
│  ├─ interview.ts           면접 준비 생성·추가 요청        (4단계)
│  └─ sync.ts                사이트 반영 완료·다시 만들기    (5단계)
├─ api/
│  ├─ jobs/[id]/route.ts     작업 상태 조회 (JobStatus가 폴링)
│  ├─ documents/[name]/route.ts  제출 서류 PDF 보기 (이름 규칙 + 종류 폴더 안만)
│  └─ pdf/
│     ├─ tailored/[revisionId]/route.ts   맞춤 이력서 PDF   (3단계)
│     └─ base/[versionId]/route.ts        기본 이력서 PDF   (3단계)
├─ postings/
│  ├─ new/page.tsx           공고 등록
│  ├─ analyzed/page.tsx      분석한 공고
│  └─ [id]/
│     ├─ page.tsx            공고 상세 (상단 + 탭)
│     ├─ ApplyForm.tsx       지원 완료 폼 (3단계에 제출 이력서 선택 추가)
│     ├─ StatusForm.tsx      상태 변경 폼
│     ├─ TailoredTab.tsx     맞춤 이력서 탭     (3단계)
│     └─ InterviewTab.tsx    면접 준비 탭       (4단계)
├─ interview/[prepId]/print/page.tsx      면접 준비 인쇄용 (4단계)
├─ resume/
│  ├─ page.tsx               기본 이력서
│  ├─ ResumeEditor.tsx
│  ├─ PreferencesForm.tsx
│  └─ DocFiles.tsx           서류 파일 탭
├─ import/
│  ├─ page.tsx               지원 내역 가져오기
│  └─ ImportReviewTable.tsx
├─ sync/page.tsx             사이트 반영 체크리스트 (5단계)
└─ settings/page.tsx         설정
```

화면 ↔ 파일 대응은 [screens.md](screens.md) 0.1의 주소와 같다.

## 4. 문서·규칙·스킬 배치 규칙

| 무엇 | 어디 | 규칙 |
|---|---|---|
| 프로젝트 안내 | `CLAUDE.md` (루트) | 꼭 필요한 정보만: 개요, 현재 단계, 명령어, 디렉터리 구조 요약, 문서 링크. 상세 내용은 쓰지 않고 `docs/`로 링크 |
| 문서 | `docs/` 아래에만 | 파일 이름에 날짜를 넣지 않는다(`kebab-case.md`). 루트에 `README.md`·`AGENTS.md` 등 다른 문서를 두지 않는다 |
| 정할 것·결정 기록 | `docs/decisions.md` | 사용자 검토용. 열린 질문은 여기에만 `D-번호`로 모은다 |
| 기획·설계 | `docs/spec/` | `product.md`(기획서), `screens.md`(화면), `architecture.md`(이 문서) |
| 구현 계획 | `docs/plans/` | `phase-<번호>-<주제>.md` |
| 디자인 | `docs/design/` | `design.md`(결정 기록), `wireframes/`(배치·문구), `mockups/`(시각 디자인) |
| 사용 안내 | `docs/guide/` | 설치·실행·백업 (구현 마지막에 작성: `usage.md`) |
| 현황판 | `docs/pm/` | `status.md`: 마일스톤·일정·백로그·위험·사용자 할 일 (메인 세션 PM이 관리) |
| 작업 기록 | `docs/work/` | 기능 워크플로우의 작업마다 한 파일. 설계·검토·회차·결정·재설계·실패·결과 |
| 테스트 케이스 | `docs/test/` | `test-cases.md`: 기능·화면별 케이스와 자동 테스트 대응표 |
| 작업 규칙 | `.claude/rules/*.md` | 코드 영역별 규칙. `paths`로 적용 범위를 정한다. 짧게, 왜 그런지 한 줄 포함 |
| 서브에이전트 | `.claude/agents/<이름>.md` | 역할별 에이전트. 기획 검토(product-planner, Opus, 읽기 전용), 구현(developer, Sonnet), 검토(code-reviewer, Sonnet, 읽기 전용) |
| 스킬 | `.claude/skills/<이름>/SKILL.md` | 반복되는 절차가 생길 때만 추가 |

새 문서를 만들면 `CLAUDE.md`의 문서 목록에 한 줄 추가한다.

## 5. 의존 방향

```
app/(page, 컴포넌트) ─▶ app/_actions ─▶ lib/<영역>/repo ─▶ lib/db
        │                                   ▲
        └──(읽기 전용 조회는 repo 직접 호출)──┘
lib/ai/queue ─▶ lib/ai/tasks/* ─▶ lib/<영역>/repo, lib/ai/claude-cli, lib/extract
instrumentation.ts ─▶ lib/db, lib/backup, lib/ai/queue
```

- `lib/`은 `app/`을 가져오지 않는다. 화면 없이 테스트할 수 있어야 한다.
- 서버 액션은 입력 검증과 `lib` 함수 호출, 화면 갱신(`revalidatePath`·`redirect`)만 한다. 규칙·계산은 `lib`에 둔다.
- AI 작업은 화면에서 직접 실행하지 않는다. 항상 `enqueueJob`으로 큐에 넣고 워커가 처리한다.
- `claude` 실행은 `lib/ai/claude-cli.ts` 한 곳에서만 한다. 브라우저(Playwright) 실행은 `lib/extract/browser.ts`와 `lib/pdf/render.ts`만 하고, 둘 다 같은 전역 잠금을 쓴다.
- 함수마다 마지막 인자로 `db?`를 받아 테스트에서 임시 DB를 넘길 수 있게 한다(기본은 `getDb()`).

## 6. 이름 규칙

| 대상 | 규칙 | 예 |
|---|---|---|
| `lib/` 파일 | kebab-case | `extract-posting.ts` |
| React 컴포넌트 파일 | PascalCase | `TailoredTab.tsx` |
| Next.js 예약 파일 | 그대로 | `page.tsx`, `layout.tsx`, `route.ts` |
| 프롬프트 | 작업 이름 kebab-case | `prompts/tailor-resume.md` |
| 작업 종류(JobType) | snake_case | `analyze_posting` |
| 테스트 | `tests/<대상>.test.ts` (평평하게) | `tests/resume-diff.test.ts` |
| 문서 | kebab-case, 날짜 없음 | `docs/plans/phase-3-tailored-resume.md` |

## 7. `prompts/`, `tests/`, `scripts/`, `data/`

```
prompts/                    1단계: analyze-posting, import-resume, import-applications
                            3단계: tailor-resume, revise-tailored
                            4단계: prepare-interview, revise-interview
                            5단계: site-sync

tests/
├─ helpers/db.ts            임시 DB (makeTestDb)
├─ fixtures/
│  ├─ fake-claude.mjs       가짜 claude 실행 파일 (모드별 응답)
│  └─ posting-*.html        공고 페이지 샘플
└─ *.test.ts                config, db, backup, normalize, resume-repo, claude-cli, queue, extract,
                            repos, search, tasks (1단계) / resume-diff, fabrication, tailored-repo,
                            tailor-task, pdf, submitted-resume (3단계) / interview-repo,
                            interview-task (4단계) / sync-repo, sync-task, settings-final (5단계)

scripts/
├─ start-career-flow.cmd    빌드 확인 → 실행 → 브라우저 열기 (바탕화면 바로가기용)
├─ seed-dev.ts              개발용 데이터 (data-dev/ 에만 씀)
└─ backfill-applied-datetime.ts  정렬용 일시 일회성 채우기 (data/ 안 파일을 읽음, --dry-run)

data/                       git 제외. 위치는 CAREER_FLOW_DATA_DIR로 바꿀 수 있음
├─ career-flow.db           SQLite
├─ uploads/                 올린 이력서·캡처 원본 (resume/, import/)
├─ documents/               제출 서류 PDF 복사본 (resume/이력서_YYYYMMDD.pdf, career/경력기술서_…, portfolio/포트폴리오_…)
├─ ai-work/<jobId>/         작업별 Claude Code 작업 폴더 (입력 파일)
├─ browser-profile/         Playwright 영구 프로필 (사이트 로그인 유지)
└─ backups/                 DB 백업 (자동 30개, 수동 10개)
```

`.gitignore`: `/data/`, `/data-*/`, `/.superpowers/`, `node_modules/`, `.next/`.
