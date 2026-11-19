# Career Flow 지난 지원 기록 직접 입력 + 서류 버전 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: 설계 (2026-11-19). 작업 기록: [docs/work/past-records.md](../work/past-records.md)
- **열린 결정**: D-15(서류 버전 등록 방식·스키마), D-16(직접 입력 필수 칸: 회사·포지션). 초안은 작업 기록 "1. 설계 > 정할 것 초안"에 있다. 이 계획은 각 결정의 **추천안(a)**을 기준으로 쓴다. 다른 안이 골라지면 planner가 해당 Task를 고친다.
- **확정된 사용자 결정 (2026-11-19)**
  - 메일(원티드·잡코리아·리멤버)의 지난 기록은 **앱 기능으로 만들지 않는다.** 메인 세션이 한 번 DB에 옮긴다(아래 "메일 기록 이관과의 관계").
  - 그룹바이 등 나머지 지난 기록은 앱에서 직접 입력한다. 필수: 지원 사이트, 지원일. 선택: 메모, 이력서·경력기술서·포트폴리오 버전.
  - 서류 종류는 이력서 / 경력기술서 / 포트폴리오 세 가지다. 자기소개서는 없다. 직무별 변형본은 무시한다.
  - 버전으로 쓰는 파일은 `(이력서|경력기술서|포트폴리오)_YYYYMMDD.pdf` 형식만이다. 버전 날짜는 파일 이름의 날짜다.
  - 앱은 `D:\`를 읽지 않는다. 필요한 파일만 메인 세션이 데이터 폴더로 복사한다.

**Goal:** (1) 지난 지원 기록을 AI 없이 표에 직접 입력해 등록한다. (2) 서류 파일(이력서·경력기술서·포트폴리오)을 날짜별 버전으로 등록하고, 지원 기록에 종류별 버전을 붙인다. 지원일로 버전을 자동으로 고르고, 종류마다 가장 이른 버전보다 앞선 지원은 그 종류만 "모름"이다. (기획서 7.7·7.9, 화면 문서 5.5·6장)

**Architecture:** 서류 버전은 내용을 읽지 않고 **종류·날짜·파일 경로**만 `document_versions`에 저장한다. 파일은 `data/documents/<종류>/`에 있는 복사본이고, 앱은 그 폴더만 읽는다. 지원 기록에는 `submitted_docs`(종류별 버전 id) JSON 칸을 더한다. 기존 `submitted_resume`(앱 안 기본 이력서 내용 버전)은 그대로 둔다. 직접 입력은 기존 가져오기 검토 표를 AI 없이 빈 행으로 여는 방식이다. `claude` 호출은 0회다.

**Tech Stack:** 1·2단계와 동일. 새 패키지 없음.

**Spec:** `docs/spec/product.md` 7.7·7.9·10장, `docs/spec/screens.md` 1장·5.5·6장, `docs/spec/architecture.md`
**선행 계획:** `docs/plans/phase-1-2-mvp.md` (완료)

## Global Constraints

- 1·2단계 계획의 Global Constraints 전부 적용.
- 앱은 메일함·메신저에 접속하지 않는다. 계속되는 자동 수집은 만들지 않는다.
- 앱은 데이터 폴더 밖을 읽지 않는다. 서류 PDF는 `data/documents/` 아래 복사본만 다루고, 내용은 읽지 않는다.
- 이 작업은 `claude`를 호출하지 않는다.
- 서류 PDF는 개인 데이터다. 커밋하지 않는다(`.gitignore`의 `/data/`, `*.pdf`가 이미 막는다).
- 서류 종류 ID: `resume`(이력서) / `career`(경력기술서) / `portfolio`(포트폴리오).
- 서류 버전 배정: 지원일과 **같은 날이거나 앞선** 버전 중 가장 늦은 것. 종류마다 따로 정하고, 없으면 그 종류만 `null`(모름).

## Review Focus

1. **서류 버전 날짜 경계** — 지원일 = 버전 날짜면 그 버전. 가장 이른 버전보다 앞서면 그 종류만 null. → Task 1 `pickDocVersion`.
2. **기본 이력서가 서류 버전으로 바뀜** — 서류 버전은 `resume_versions`와 다른 테이블이다. `getLatestResume`는 그대로다. → Task 1.
3. **경로 밖 파일 접근** — `filePath`가 `data/documents/` 밖을 가리키면 거부한다. → Task 1 `rejects paths outside documents dir`.
4. **메모 이관이 메모를 망가뜨림** — "제출 서류:" 줄만 지우고 나머지 메모는 그대로 둔다. 등록되지 않은 날짜가 있으면 그 기록은 건드리지 않는다. → Task 3 `migrateDocsFromNotes`.
5. **직접 입력이 중복을 만듦** — 같은 회사·같은 지원일·같은 포지션이 이미 있으면 "이미 있음"으로 체크 해제. → Task 2 `findExistingMatches`.

---

## File Structure

```
src/lib/
  documents/
    pick.ts           DOC_KINDS, DOC_KIND_LABELS, docLabel, docFileName, parseDocFileName,
                      pickDocVersion, pickDocs, formatDocsNote, parseDocsNote — 순수(클라이언트도 import)
    repo.ts           listDocVersions, scanDocumentsDir, registerScannedDocs, deleteDocVersion,
                      assertDocsValid, migrateDocsFromNotes
  applications/
    import-rows.ts    (수정) ReviewRow에 notes·docs, 포지션 선택(D-16 a)
    import-review.ts  (수정) findExistingMatches
    repo.ts           (수정) bulkCreateApplications 행에 notes·submittedDocs
  domain/normalize.ts (수정) normalizePosition
  db/schema.ts        (수정) documentVersions, applications.submittedDocs
  config.ts           (수정) documentsDir
  search/dashboard.ts (수정) 이력서 라벨·이력서별 묶음
src/app/
  import/page.tsx             (수정) ?manual=1
  import/ImportForm.tsx       (수정) [표에 직접 입력]
  import/ImportReviewTable.tsx (수정) 메모·서류 열, 같은 날 표시
  resume/DocVersions.tsx      (새) "서류 버전" 탭
  resume/page.tsx, resume/ResumeTabs.tsx (수정)
  _actions/import.ts          (수정)
  _actions/documents.ts       (새)
drizzle/0003_document_versions.sql   (npx drizzle-kit generate --name document_versions)
tests/
  document-versions.test.ts (새)
  import-review.test.ts, repos.test.ts, normalize.test.ts, search.test.ts (수정)
  e2e/12-past-records.spec.ts (새), e2e/05-import.spec.ts (수정)
data/ (git 제외)
  documents/resume/resume_YYYYMMDD.pdf
  documents/career/career_YYYYMMDD.pdf
  documents/portfolio/portfolio_YYYYMMDD.pdf
```

---

## 0. 메인 세션이 하는 준비 (앱 코드 아님)

### 0.1 서류 파일 복사 (사용자 승인 후)

| 항목 | 규칙 |
|---|---|
| 대상 | 사용자 서류 폴더와 그 `백업/` 폴더에서 이름이 정확히 `(이력서\|경력기술서\|포트폴리오)_YYYYMMDD.pdf`인 파일만. 접미사가 붙은 것, 날짜 없는 것, pdf가 아닌 것, 없는 날짜는 제외 |
| 위치 | `data/documents/<종류 ID>/` (`resume`, `career`, `portfolio`) |
| 파일 이름 | `<종류 ID>_YYYYMMDD.pdf` (예 `career_20261017.pdf`). 한글 경로 문제를 피하고, 앱이 이름만으로 종류·날짜를 읽기 위해서다 |
| 겹침 | 같은 종류·날짜가 현재 폴더와 `백업/`에 둘 다 있으면 현재 폴더 것 하나만 |
| 이미 있음 | 대상 파일이 있으면 덮어쓰지 않고 사용자에게 알린다 |
| 원본 | 옮기거나 고치지 않는다(복사만) |

- 2026-11-19 확인 결과(규칙 적용 후): 이력서 2026-09-05, 2026-10-17, 2026-11-02 / 경력기술서 2026-10-17, 2026-11-02 / 포트폴리오 2026-07-22, 2026-10-17. 7개, 겹침 없음.
- 복사 뒤 앱의 기본 이력서 화면 "서류 버전" 탭에서 `[폴더에서 찾기]`를 누르면 등록된다.

### 0.2 메일 기록 이관과의 관계

- 메인 세션이 메일 기록을 DB에 넣을 때는 지금 스키마 그대로 `submittedResume: {kind:'imported'}`, `postingId: null`, `status: 'applied'`로 넣는다.
- 그때 쓰던 서류는 날짜 규칙(같은 날 포함, 가장 늦은 버전)으로 계산해 `notes`의 **한 줄**로 적는다. 형식은 `formatDocsNote`와 같아야 한다:

  ```
  제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22
  ```
  - 순서 고정(이력서 / 경력기술서 / 포트폴리오), 구분자 ` / `, 날짜는 `YYYY-MM-DD`, 버전이 없으면 `모름`.
  - 메모가 따로 있으면 그 아래 줄에 이어 쓴다.
- **이관**: 이 계획이 구현된 뒤 서류 버전을 등록하고, "서류 버전" 탭의 `[메모의 제출 서류 옮기기]`(Task 3 `migrateDocsFromNotes`)를 한 번 누르면 이 줄이 `submittedDocs`로 옮겨지고 줄은 메모에서 지워진다.

---

### Task 1: 서류 버전 (D-15 a)

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/config.ts`
- Create: `src/lib/documents/pick.ts`, `src/lib/documents/repo.ts`, 마이그레이션, `tests/document-versions.test.ts`

**Interfaces — `schema.ts`:**
- `documentVersions`: id, kind(text `DocKind` not null), versionDate(text not null, YYYY-MM-DD), filePath(text not null — `config.documentsDir` 기준 상대 경로, 예 `career/career_20261017.pdf`), createdAt(text not null). **(kind, versionDate) unique.**
- `applications.submittedDocs`: text json nullable, `$type<SubmittedDocs>()`. 기존 행은 null(= 셋 다 모름).
- `submittedResume`는 그대로.

**Interfaces — `config.ts`:** `documentsDir = join(dataDir, 'documents')`. `ensureDataDirs`가 `documents/resume`, `documents/career`, `documents/portfolio`까지 만든다.

**Interfaces — `pick.ts`** (순수):
- `DOC_KINDS = ['resume', 'career', 'portfolio'] as const`, `type DocKind`, `DOC_KIND_LABELS = { resume: '이력서', career: '경력기술서', portfolio: '포트폴리오' }`
- `type SubmittedDocs = Partial<Record<DocKind, number | null>>`
- `type DocVersionRef = { id: number; kind: DocKind; versionDate: string }`
- `docLabel(v: DocVersionRef): string` → `이력서 2026-09-05`
- `docFileName(kind, versionDate): string` → `resume_20260905.pdf`
- `parseDocFileName(name: string): { kind: DocKind; versionDate: string } | null` — `/^(resume|career|portfolio)_(\d{8})\.pdf$/`, 실제 있는 날짜만(`validDate`)
- `pickDocVersion(kind, appliedAt, versions): number | null` — 그 종류 중 `versionDate <= appliedAt`(**같은 날 포함**)에서 가장 늦은 것. 없거나 지원일이 잘못되면 null
- `pickDocs(appliedAt, versions): Record<DocKind, number | null>`

**Interfaces — `repo.ts`:**
- `listDocVersions(db?): (DocVersionRef & { filePath: string; fileExists: boolean; usage: number })[]` — 종류 순, 같은 종류는 날짜 늦은 순. `usage` = 그 버전을 쓴 지원 기록 수
- `scanDocumentsDir(dir = config.documentsDir, db?): { found: { kind: DocKind; versionDate: string; filePath: string }[]; ignored: string[] }` — 종류 폴더 3개만 읽는다(재귀 안 함). 폴더와 파일 이름의 종류가 다르거나 `parseDocFileName`에 안 맞으면 `ignored`(파일 이름만). 이미 등록된 (kind, versionDate)는 `found`에서 뺀다
- `registerScannedDocs(dir = config.documentsDir, db?): { added: number; ignored: string[] }` — 한 트랜잭션
- `deleteDocVersion(id, db?): void` — `usage > 0`이면 던진다: `이 버전을 쓴 지원 기록이 {n}건 있어 지울 수 없습니다.` 파일은 지우지 않는다
- `assertDocsValid(docs: SubmittedDocs, db?): void` — id가 있고 종류가 맞아야 한다. 아니면 `서류 버전을 찾을 수 없습니다.`
- 경로 안전: `resolve(documentsDir, filePath)`가 `documentsDir` 안일 때만 저장·사용. `..`·절대 경로 거부

- [ ] **Step 1: 실패하는 테스트** (`tests/document-versions.test.ts`)
  - `pickDocVersion`(확정 7개 버전): 2026-08-01 → 이력서 null, 경력기술서 null, 포트폴리오 07-22. 2026-10-17 → 셋 다 10-17(같은 날 포함). 2026-07-21 → 셋 다 null. 2026-11-19 → 이력서 11-02, 경력기술서 11-02, 포트폴리오 10-17. `''` → null
  - `parseDocFileName`: `resume_20260905.pdf` 통과. `resume_20260905_back.pdf`, `resume.pdf`, `resume_20260905.docx`, `resume_20261345.pdf` → null
  - `scanDocumentsDir`: 임시 폴더에 맞는 파일 2개, 맞지 않는 파일 1개, `career/`에 `resume_…pdf` 1개 → found 2, ignored 2. `registerScannedDocs` 두 번째 → added 0
  - `deleteDocVersion`: 쓰는 버전은 던짐, 안 쓰면 지워지고 파일은 남음
  - `rejects paths outside documents dir`
  - 서류 버전을 등록해도 `getLatestResume()`는 그대로
- [ ] **Step 2:** FAIL. **Step 3:** 구현 + `npx drizzle-kit generate --name document_versions`. **Step 4:** PASS + 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: document versions from data/documents`.

---

### Task 2: 직접 입력 행 (메모·서류·포지션 선택·이미 있음 세분화)

**Files:**
- Modify: `src/lib/applications/import-rows.ts`, `src/lib/applications/import-review.ts`, `src/lib/applications/repo.ts`, `src/lib/domain/normalize.ts`, `tests/import-review.test.ts`, `tests/repos.test.ts`, `tests/normalize.test.ts`

**Interfaces:**
- `normalize.ts`: `normalizePosition(s: string): string` — NFKC, 소문자, 글자·숫자 외 제거
- `import-rows.ts`:
  - `ReviewRow`에 `notes: string`, `docs: Record<DocKind, number | null>`. `emptyRow`는 `notes: ''`, docs 모두 null
  - 필수 칸: **사이트**(select라 항상 값이 있음), **지원일**, **회사**. **포지션은 선택**(D-16 a): `missingFields`가 포지션을 넣지 않는다
  - `POSITION_UNKNOWN = '(포지션 미상)'` — 빈 포지션은 이 값으로 저장(`markApplied`와 같은 값)
  - `rowsToRegister` 결과 행에 `notes?: string`, `submittedDocs?: SubmittedDocs`. 빈 메모·모두 null인 docs는 생략
  - `checkedRowsSchema`에 `notes: z.string().max(2000)`, `docs: z.object({ resume, career, portfolio: z.number().int().positive().nullable() })` 추가
- `import-review.ts`:
  - `type ExistingMatch = 'same' | 'same_day' | 'none'`
  - `findExistingMatches(rows: { companyName; positionTitle; appliedAt }[], db?): ExistingMatch[]` — 회사 키 + 같은 지원일 기록 중 `normalizePosition`이 같거나, 이 행 포지션이 빈 칸이거나, 기존 포지션이 `(포지션 미상)`이면 `same`. 기록은 있는데 포지션이 다르면 `same_day`. 없으면 `none`. 기존 `markExistingRows`는 `findExistingMatches(...).map(m => m !== 'none')`로 바꿔도 되고 그대로 둬도 된다(화면 복사·캡처 경로 동작은 바꾸지 않는다)
- `repo.ts` `bulkCreateApplications` 행에 `notes?`, `submittedDocs?`. 저장 전 `assertDocsValid`. `notes`는 `applications.notes`

- [ ] **Step 1: 실패하는 테스트**
  - `missingFields`: 포지션 빈 칸은 목록에 없음. 회사·지원일만
  - `rowsToRegister`: 빈 포지션 → `(포지션 미상)`, 메모·docs 전달, docs 모두 null이면 `submittedDocs` 없음
  - `findExistingMatches`: 기존 `(주)토스 / Server Dev / 2026-10-03`에 대해 `토스 / server-dev / 2026-10-03` → same, `토스 / Frontend / 2026-10-03` → same_day, `토스 / '' / 2026-10-03` → same, 날짜 다르면 none
  - `bulkCreateApplications`: 메모·서류 저장, 없는 서류 id → 던지고 아무것도 저장 안 됨
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 PASS(TC-IMPORT-21 기대값을 포지션 선택에 맞게 고친다).
- [ ] **Step 5:** 커밋 `feat: manual past records carry notes and document versions`.

---

### Task 3: 메모의 "제출 서류" 줄 이관

**Files:**
- Modify: `src/lib/documents/pick.ts`, `src/lib/documents/repo.ts`, `tests/document-versions.test.ts`

**Interfaces:**
- `formatDocsNote(docs: Record<DocKind, string | null>): string` — 날짜(또는 null)를 받아 `제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22`
- `parseDocsNote(notes: string): { docs: Record<DocKind, string | null>; rest: string } | null` — 줄 단위로 `/^제출 서류:\s*이력서 (\d{4}-\d{2}-\d{2}|모름) \/ 경력기술서 (\d{4}-\d{2}-\d{2}|모름) \/ 포트폴리오 (\d{4}-\d{2}-\d{2}|모름)\s*$/`을 찾는다. 없으면 null. `rest`는 그 줄을 뺀 나머지(앞뒤 빈 줄 정리)
- `migrateDocsFromNotes(db?): { migrated: number; skipped: { applicationId: number; missing: string[] }[] }`
  - 대상: `submittedDocs IS NULL`이고 `parseDocsNote(notes)`가 null이 아닌 기록
  - 날짜마다 (kind, versionDate) 버전을 찾는다. 하나라도 없으면 그 기록은 건너뛰고 `skipped`에 `이력서 2026-09-05` 같은 라벨을 적는다
  - 모두 찾으면 한 트랜잭션에서 `submittedDocs`를 채우고 `notes = rest || null`
  - 다시 실행해도 안전하다(이미 옮긴 기록은 `submittedDocs`가 있어 대상이 아님)
- `countDocsNotesPending(db?): number` — 대상 기록 수(탭에서 버튼을 보일지 정함)

- [ ] **Step 1: 실패하는 테스트**
  - `formatDocsNote` ↔ `parseDocsNote` 왕복
  - 메모 `제출 서류: …\n그룹바이 추천` → 옮긴 뒤 notes `그룹바이 추천`, `submittedDocs` 채워짐
  - 메모가 그 줄뿐이면 notes null
  - 등록 안 된 날짜(이력서 2026-01-01) → skipped에 라벨, 기록 그대로
  - 두 번 실행 → 두 번째 migrated 0
  - 형식이 다른 줄(`제출 서류: 이력서 9/5`)은 대상 아님
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: migrate submitted documents from notes`.

---

### Task 4: 화면

**Files:**
- Modify: `src/app/import/page.tsx`, `src/app/import/ImportForm.tsx`, `src/app/import/ImportReviewTable.tsx`, `src/app/_actions/import.ts`, `src/app/resume/page.tsx`, `src/app/resume/ResumeTabs.tsx`, `src/lib/search/dashboard.ts`
- Create: `src/app/resume/DocVersions.tsx`, `src/app/_actions/documents.ts`, `tests/e2e/12-past-records.spec.ts`
- Modify tests: `tests/search.test.ts`, `tests/e2e/05-import.spec.ts`

**화면 동작의 기준은 `docs/spec/screens.md` 5.5·6장이다.** 요약:
- `/import` 입력 단계에 `[표에 직접 입력]`(→ `/import?manual=1&site=<사이트>`). 사이트가 없거나 "모름"이면 비활성 + "직접 입력하려면 사이트를 고르세요"
- `/import?manual=1&site=groupby`: AI 없이 빈 행 1개(사이트 = 고른 사이트, 지원일 빈 칸)로 검토 표. 머리말 "지난 지원 기록을 직접 입력합니다."
- 검토 표(직접 입력·화면 복사 공통): **메모** 칸, **서류** 칸(이력서·경력기술서·포트폴리오 select 3개, 각 "모름" + 등록된 버전 날짜). 지원일을 고치면 사용자가 직접 고르지 않은 서류 select는 `pickDocs`로 다시 고른다. 직접 입력 경로는 `findExistingMatches`로 "이미 있음"(체크 해제)·"같은 날 기록 있음"(체크 유지)을 보인다
- `/resume?tab=docs`: "서류 버전" 탭
- 대시보드: `DashboardRow`에 `resumeDocVersionId: number | null`, `resumeDocDate: string | null`. `resumeLabel`: base면 `기본 v{n}`, 아니면 `submittedDocs.resume`이 있으면 `이력서 {날짜}`, 둘 다 없으면 null("모름"). `groupDashboardRows('resume')`: 기본 버전(내림차순) → 이력서 파일 버전(날짜 늦은 순, 키 `doc{id}`) → 모름

**서버 액션** (`_actions/import.ts`):
- `checkExistingMatchesAction(rows: { companyName; positionTitle; appliedAt }[]): Promise<ExistingMatch[]>`
- `commitApplicationImportAction`이 `notes`·`docs`를 받는다(스키마 공통). 알림은 지금처럼 `{n}건을 등록했습니다`

**서버 액션** (`_actions/documents.ts`):
- `registerScannedDocsAction()` → `{added}개를 등록했습니다` (0이면 `새로 찾은 파일이 없습니다`). `ignored`가 있으면 `형식이 맞지 않아 건너뛴 파일: {이름들}`
- `deleteDocVersionAction(id)`
- `migrateDocsFromNotesAction()` → `{migrated}건의 제출 서류를 옮겼습니다` + skipped가 있으면 `{n}건은 등록되지 않은 버전({라벨들}) 때문에 옮기지 않았습니다`

- [ ] **Step 1: 실패하는 테스트** — `tests/search.test.ts`(라벨·묶음), `tests/e2e/12-past-records.spec.ts`(TC-PAST-E2E-01~05)
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** `npm test`, `npm run test:e2e`, `npm run lint`, `npx next typegen && npx tsc --noEmit`, `npm run build` 모두 실패 0.
- [ ] **Step 5:** 커밋 `feat: manual past records and document versions screens`.
- [ ] **Step 6:** `docs/test/test-cases.md`에 PAST 절과 대응표, `docs/guide/usage.md`에 "서류 파일 넣는 위치"와 "지난 기록 직접 입력" 추가. 커밋 `docs: past records test cases and guide`.

---

## 테스트 케이스

| ID | 대상 | 기대 결과 | 종류 | 위치 |
|---|---|---|---|---|
| TC-PAST-01 | `pickDocVersion` | 같은 날 포함, 종류마다 따로, 가장 이른 버전 앞은 그 종류만 null (2026-08-01 → 이력서·경력기술서 모름, 포트폴리오 07-22) | 단위 | document-versions |
| TC-PAST-02 | `parseDocFileName` | `<종류>_YYYYMMDD.pdf`만 통과. 접미사·날짜 없음·pdf 아님·없는 날짜 거부 | 단위 | document-versions |
| TC-PAST-03 | 폴더 찾기·등록 | 맞는 파일만 등록, 폴더·이름 종류 불일치 무시, 두 번째 0건, 경로 밖 거부 | 통합 | document-versions |
| TC-PAST-04 | 서류 버전 삭제 | 쓰는 버전 거부, 안 쓰면 목록에서만 지움(파일 유지), 최신 기본 이력서 영향 없음 | 통합 | document-versions |
| TC-PAST-10 | `findExistingMatches` | same / same_day / none (별칭·(주) 무시, 빈 포지션·`(포지션 미상)`은 same) | 통합 | import-review |
| TC-PAST-11 | 포지션 선택(D-16 a) | 빈 포지션은 필수 칸 아님, `(포지션 미상)`으로 저장. 회사·지원일은 필수 | 단위 | import-review |
| TC-PAST-12 | `bulkCreateApplications` | 메모·서류 저장, 없는 서류 id면 전체 롤백 | 통합 | repos |
| TC-PAST-20 | `formatDocsNote`·`parseDocsNote` | 왕복 일치, 다른 형식은 null | 단위 | document-versions |
| TC-PAST-21 | `migrateDocsFromNotes` | 줄만 지우고 나머지 메모 유지, 없는 버전이면 건너뜀, 다시 실행 안전 | 통합 | document-versions |
| TC-PAST-30 | 대시보드 | 이력서 파일 버전만 있는 기록은 `이력서 {날짜}`, 묶음 순서 기본 → 파일 버전 → 모름 | 통합 | search |
| TC-PAST-E2E-01 | 직접 입력 열기 | 사이트 미선택·"모름"이면 비활성, 그룹바이 → 빈 행 1개(사이트 그룹바이) | E2E | 12-past-records |
| TC-PAST-E2E-02 | 직접 입력 등록 | 회사·지원일만 채워 등록 가능, 지원일 빈 칸이면 "지원일 필요"로 막힘, 대시보드에 포지션 `(포지션 미상)` | E2E | 12-past-records |
| TC-PAST-E2E-03 | 서류 자동 배정 | 지원일 입력 → 서류 select 자동 선택, 직접 고친 것은 날짜를 바꿔도 유지 | E2E | 12-past-records |
| TC-PAST-E2E-04 | 서류 버전 탭 | [폴더에서 찾기]로 등록, 건너뛴 파일 이름 안내, 쓰는 버전 삭제 거부 문구 | E2E | 12-past-records |
| TC-PAST-E2E-05 | 메모 이관 | "제출 서류" 줄이 있는 기록이 있으면 버튼이 보이고, 누르면 옮긴 건수 알림, 대시보드 이력서 라벨이 `이력서 {날짜}` | E2E | 12-past-records |

## Spec 대비 범위

| 기획서 | 이 계획 |
|---|---|
| 7.7 직접 입력 | Task 2·4 |
| 7.9 서류 버전 | Task 1·3·4 |
| 메일 지난 기록 | **범위 밖**. 메인 세션이 한 번 DB에 옮김(0.2) |
| 앱에서 서류 PDF 올리기 | **범위 밖**. 새 파일은 `data/documents/<종류>/`에 넣고 [폴더에서 찾기]. 앞으로의 지원은 [지원 완료]가 기본 이력서 버전을 기록하므로 지금은 필요가 작다 |
| 지원 기록 수정 창(3.10)에서 서류 버전 고치기 | **범위 밖**. 3단계 Task 4(제출 이력서 수정)와 함께 다룬다 |
