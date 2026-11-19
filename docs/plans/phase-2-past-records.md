# Career Flow 지난 지원 기록 직접 입력 + 제출 서류 파일 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: 설계 (2026-11-19, D-15·D-16 결정 반영). 작업 기록: [docs/work/past-records.md](../work/past-records.md)
- **확정된 사용자 결정 (2026-11-19)**
  - 메일(원티드·잡코리아·리멤버)의 지난 기록은 **앱 기능으로 만들지 않는다.** 메인 세션이 한 번 DB에 넣었다(아래 0.2).
  - 지난 기록은 앱에서 직접 입력할 수 있다. 필수: **사이트, 회사, 포지션, 지원일**(D-16). 선택: 메모, 이력서·경력기술서·포트폴리오 파일.
  - 서류 종류는 이력서 / 경력기술서 / 포트폴리오 세 가지다. 자기소개서는 없다. 직무별 변형본은 무시한다.
  - 버전으로 쓰는 파일은 `(이력서|경력기술서|포트폴리오)_YYYYMMDD.pdf` 형식만이다. 버전 날짜는 파일 이름의 날짜다.
  - 앱은 `D:\`를 읽지 않는다. 파일은 프로젝트 데이터 폴더에 복사해 두고(완료, 7개), 지원 기록은 **파일 이름만** 참조한다. [보기]를 누르면 그 파일을 브라우저에서 PDF로 보여 준다(D-15).
  - 지원 기록에 **정렬 전용 일시** 칸을 더한다. 화면에는 보이지 않는다. 같은 지원일 안에서 순서를 정하는 데만 쓴다(D-17, Task 5).
  - 상태 필터 "서류합격"은 서류합격을 **거친** 기록을 모두 보여 준다(지금 상태와 관계없이). 면접·최종합격도 같다(Task 6).

**Goal:** (1) 지난 지원 기록을 AI 없이 표에 직접 입력해 등록한다. (2) 지원 기록마다 낸 이력서·경력기술서·포트폴리오 **파일 이름**을 저장하고, 화면에서 그 파일을 열어 본다. 지원일로 파일을 자동으로 고르고, 종류마다 가장 이른 파일보다 앞선 지원은 그 종류만 "모름"이다. (3) 메인 세션이 넣은 기록의 메모 "제출 서류" 줄을 이 칸으로 옮긴다. (기획서 7.7·7.9, 화면 문서 1장·3.9·5.5·6장)

**Architecture:** 버전 테이블을 두지 않는다. 서류 파일 목록은 `data/documents/<종류>/` 폴더를 읽어 **파일 이름 규칙**으로 바로 얻는다(종류·날짜가 이름에 다 있고, 종류·날짜 조합이 곧 파일 하나이므로 따로 저장할 정보가 없다). 지원 기록에는 `submitted_docs` JSON 칸(종류별 파일 이름)을 더한다. 파일 보기는 라우트 핸들러가 이름 규칙 검사 + 그 종류 폴더 안만 허용해서 PDF를 그대로 돌려준다. 기존 `submitted_resume`(앱 안 기본 이력서 내용 버전)은 그대로 둔다. 직접 입력은 기존 가져오기 검토 표를 AI 없이 빈 행으로 여는 방식이다. `claude` 호출은 0회다.

**Tech Stack:** 1·2단계와 동일. 새 패키지 없음.

**Spec:** `docs/spec/product.md` 7.7·7.9·10장, `docs/spec/screens.md` 1장·3.9·5.5·6장, `docs/spec/architecture.md`
**선행 계획:** `docs/plans/phase-1-2-mvp.md` (완료)

## Global Constraints

- 1·2단계 계획의 Global Constraints 전부 적용.
- 앱은 메일함·메신저에 접속하지 않는다. 계속되는 자동 수집은 만들지 않는다.
- 앱은 데이터 폴더 밖을 읽지 않는다. 서류는 `data/documents/<resume|career|portfolio>/` 안의 파일만 다루고, 내용은 읽지 않는다(그대로 브라우저에 보낼 뿐).
- 이 작업은 `claude`를 호출하지 않는다.
- 서류 PDF는 개인 데이터다. 커밋하지 않는다(`.gitignore`의 `/data/`, `*.pdf`가 이미 막는다). 테스트는 임시 폴더에 가짜 PDF를 만들어 쓴다.
- 서류 종류 ID와 폴더·파일 이름:

  | 종류 ID | 표시명 | 폴더 | 파일 이름 |
  |---|---|---|---|
  | `resume` | 이력서 | `data/documents/resume/` | `이력서_YYYYMMDD.pdf` |
  | `career` | 경력기술서 | `data/documents/career/` | `경력기술서_YYYYMMDD.pdf` |
  | `portfolio` | 포트폴리오 | `data/documents/portfolio/` | `포트폴리오_YYYYMMDD.pdf` |

- 파일 고르기: 지원일과 **같은 날이거나 앞선** 파일 중 날짜가 가장 늦은 것. 종류마다 따로 정하고, 없으면 그 종류만 `null`(모름).
- 직접 입력 필수 칸: 사이트, 회사, 포지션, 지원일(D-16). 기존 화면 복사·캡처 가져오기의 필수 칸 규칙은 바꾸지 않는다(이미 같음).
- 지원 기록 목록의 기본 정렬(모든 곳): **지원일 ↓ → 정렬용 일시 ↓(없으면 맨 뒤) → id ↓**. 정렬용 일시는 화면에 표시하지 않는다(D-17).

## Review Focus

1. **경로 탈출** — 파일 보기와 저장은 이름 규칙(`/^(이력서|경력기술서|포트폴리오)_\d{8}\.pdf$/`, 실제 있는 날짜)과 종류 일치를 통과해야 하고, 최종 경로가 그 종류 폴더 안이어야 한다. `..`, `/`, `\`, `%2e`, 절대 경로, 다른 종류 폴더는 모두 거부. → Task 1 `rejects traversal`, Task 4 route 테스트.
2. **날짜 경계** — 지원일 = 파일 날짜면 그 파일. 가장 이른 파일보다 앞서면 그 종류만 null. → Task 1 `pickDocFile`.
3. **파일이 나중에 없어짐** — 지원 기록에는 이름만 있으므로 파일이 지워지면 [보기] 대신 "파일 없음"을 보이고, 기록은 그대로 둔다. → Task 4.
4. **메모 이관이 메모를 망가뜨림** — "제출 서류:" 줄만 지우고 첫 줄(`메일 가져오기(원티드)` 등)과 다른 메모는 남긴다. 폴더에 없는 날짜가 있으면 그 기록은 건드리지 않는다. → Task 3.
5. **직접 입력이 중복을 만듦** — 같은 회사·같은 지원일·같은 포지션이 이미 있으면 "이미 있음"으로 체크 해제. → Task 2 `findExistingMatches`.
6. **같은 날 순서가 뒤집힘** — 정렬용 일시가 없는 행(NULL)은 같은 날 맨 뒤, 직접 입력·가져오기는 표 위쪽 행이 더 최근. 일시 문자열은 항상 `+09:00`과 밀리초를 붙인 같은 모양이어야 문자열 비교가 맞다. → Task 5.

---

## File Structure

```
src/lib/
  documents/
    files.ts          DOC_KINDS, DOC_KIND_LABELS, docFileName, parseDocFileName, docLabel,
                      pickDocFile, pickDocs, formatDocsNote, parseDocsNote — 순수(클라이언트도 import)
    folder.ts         listDocFiles, resolveDocPath, docFileExists — 파일 시스템(서버 전용)
    migrate.ts        migrateDocsFromNotes, countDocsNotesPending
  applications/
    import-rows.ts    (수정) ReviewRow에 notes·docs
    import-review.ts  (수정) findExistingMatches
    repo.ts           (수정) bulkCreateApplications 행에 notes·submittedDocs
  domain/normalize.ts (수정) normalizePosition
  db/schema.ts        (수정) applications.submittedDocs
  config.ts           (수정) documentsDir
  search/dashboard.ts (수정) 이력서 라벨·이력서별 묶음
src/app/
  api/documents/[name]/route.ts  (새) 서류 PDF 보기
  _components/SubmittedDocs.tsx  (새) 제출 서류 3줄 + [보기]
  _components/RecordPanel.tsx    (수정) 기록만 행 펼침에 제출 서류
  postings/[id]/page.tsx         (수정) 지원 기록 탭(3.9)에 제출 서류
  import/page.tsx                (수정) ?manual=1
  import/ImportForm.tsx          (수정) [표에 직접 입력]
  import/ImportReviewTable.tsx   (수정) 메모·서류 칸, 같은 날 표시
  resume/DocFiles.tsx            (새) "서류 파일" 탭
  resume/page.tsx, resume/ResumeTabs.tsx (수정)
  _actions/import.ts             (수정)
  _actions/documents.ts          (새) 메모 이관
src/lib/ (Task 5)
  domain/dates.ts                (수정) toKstIso, syntheticKstIso
  applications/sort.ts           (새) applicationOrder
  applications/stages.ts         (새, Task 6) reachedStages, matchesStatusFilter
  applications/backfill.ts       (새) 정렬용 일시 일회성 채우기
scripts/backfill-applied-datetime.ts  (새, Task 5) 일회성 실행 스크립트
drizzle/0003_submitted_docs.sql  (npx drizzle-kit generate --name submitted_docs)
drizzle/0004_applied_datetime.sql (npx drizzle-kit generate --name applied_datetime)
tests/
  documents.test.ts (새), documents-route.test.ts (새), applied-datetime.test.ts (새, Task 5)
  import-review.test.ts, repos.test.ts, normalize.test.ts, search.test.ts (수정)
  e2e/12-past-records.spec.ts (새)
data/ (git 제외, 이미 복사됨)
  documents/resume/이력서_YYYYMMDD.pdf
  documents/career/경력기술서_YYYYMMDD.pdf
  documents/portfolio/포트폴리오_YYYYMMDD.pdf
```

---

## 0. 이미 끝난 준비와 약속 (앱 코드 아님)

### 0.1 서류 파일 (메인 세션, 완료 2026-11-19)

- `data/documents/<종류 ID>/`에 원래 이름 그대로(`이력서_YYYYMMDD.pdf` 등) 7개를 복사했다. 이력서 2026-09-05·10-17·11-02, 경력기술서 2026-10-17·11-02, 포트폴리오 2026-07-22·10-17.
- 새 파일을 쓰게 되면 같은 이름 규칙으로 그 폴더에 넣기만 하면 된다. 앱에서 등록하는 절차는 없다(폴더를 읽을 때마다 목록이 바뀐다).

### 0.2 메인 세션이 넣은 지난 기록과의 약속

- 메일 기록(452건)과 그룹바이 기록은 지금 스키마로 들어가 있다: `submittedResume: {kind:'imported'}`, `postingId: null`.
- 메모(`notes`)는 두 줄이다.

  ```
  메일 가져오기(원티드)
  제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22
  ```
  - 첫 줄: `메일 가져오기(원티드|잡코리아|리멤버)` 또는 `수기 입력(그룹바이)`. 이관 뒤에도 남는다.
  - 둘째 줄: 순서 고정(이력서 / 경력기술서 / 포트폴리오), 구분자 ` / `, 날짜 `YYYY-MM-DD` 또는 `모름`.
- 이관(Task 3): 날짜를 파일 이름(`이력서_20260905.pdf`)으로 바꿔 `submittedDocs`에 넣고 둘째 줄을 지운다.

---

### Task 1: 서류 파일 규칙과 폴더 읽기

**Files:**
- Modify: `src/lib/config.ts`
- Create: `src/lib/documents/files.ts`, `src/lib/documents/folder.ts`, `tests/documents.test.ts`

**Interfaces — `config.ts`:** `documentsDir = join(dataDir, 'documents')`. `ensureDataDirs`가 `documents/resume`, `documents/career`, `documents/portfolio`까지 만든다(이미 있으면 그대로).

**Interfaces — `files.ts`** (순수):
- `DOC_KINDS = ['resume', 'career', 'portfolio'] as const`, `type DocKind`
- `DOC_KIND_LABELS: Record<DocKind, string> = { resume: '이력서', career: '경력기술서', portfolio: '포트폴리오' }`
- `type SubmittedDocs = Partial<Record<DocKind, string | null>>` — 값은 파일 이름(예 `이력서_20261102.pdf`) 또는 null(모름)
- `type DocFile = { kind: DocKind; date: string; fileName: string }` — date는 `YYYY-MM-DD`
- `docFileName(kind, date: string): string` → `이력서_20261102.pdf`
- `parseDocFileName(name: string): DocFile | null` — `/^(이력서|경력기술서|포트폴리오)_(\d{8})\.pdf$/`(확장자 소문자만), 표시명 → 종류, 실제 있는 날짜만(`validDate`). 아니면 null
- `docLabel(fileName: string): string` → `이력서 2026-11-02` (규칙에 안 맞으면 이름 그대로)
- `pickDocFile(kind, appliedAt, files: DocFile[]): string | null` — 그 종류 중 `date <= appliedAt`(**같은 날 포함**)에서 가장 늦은 파일 이름. 없거나 지원일이 잘못되면 null
- `pickDocs(appliedAt, files): Record<DocKind, string | null>`
- `isDocsForKind(kind, fileName): boolean` — `parseDocFileName(fileName)?.kind === kind`

**Interfaces — `folder.ts`** (서버 전용):
- `listDocFiles(dir = config.documentsDir): { files: DocFile[]; ignored: string[] }` — 종류 폴더 3개만 읽는다(재귀 안 함, 파일만). 이름이 규칙에 맞고 종류가 폴더와 같으면 `files`, 아니면 `ignored`(파일 이름만). 종류 순 → 날짜 늦은 순. 폴더가 없으면 빈 목록
- `resolveDocPath(fileName: string, dir = config.documentsDir): string | null` — `parseDocFileName`이 null이면 null. 경로 = `join(dir, kind, fileName)`. `resolve(경로)`가 `resolve(dir, kind) + sep`로 시작하지 않으면 null
- `docFileExists(fileName, dir?): boolean` — `resolveDocPath` 후 `statSync().isFile()`

- [ ] **Step 1: 실패하는 테스트** (`tests/documents.test.ts`, 임시 폴더)
  - `pickDocFile`(확정 7개): 2026-08-01 → 이력서 null, 경력기술서 null, 포트폴리오 `포트폴리오_20260722.pdf`. 2026-10-17 → 셋 다 `…_20261017.pdf`(같은 날 포함). 2026-07-21 → 셋 다 null. 2026-11-19 → 이력서·경력기술서 `…_20261102.pdf`, 포트폴리오 `…_20261017.pdf`. `''` → null
  - `parseDocFileName`: `이력서_20260905.pdf` 통과. `이력서_20260905_back.pdf`, `이력서.pdf`, `이력서_20260905.docx`, `이력서_20261345.pdf`, `이력서_20260905.PDF`, `자기소개서_20260905.pdf` → null
  - `listDocFiles`: `resume/`에 맞는 파일 2개 + `메모.txt`, `career/`에 `이력서_…pdf` 1개 → files 2, ignored 2
  - `resolveDocPath`: `../x.pdf`, `이력서_20260905.pdf/../../a`, `C:\a\이력서_20260905.pdf` → null. 정상 이름 → `<dir>/resume/이력서_20260905.pdf` (`rejects traversal`)
  - `docLabel('경력기술서_20261102.pdf') === '경력기술서 2026-11-02'`
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: document files by name rule in data/documents`.

---

### Task 2: 지원 기록의 제출 서류 칸과 직접 입력 행

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/applications/import-rows.ts`, `src/lib/applications/import-review.ts`, `src/lib/applications/repo.ts`, `src/lib/domain/normalize.ts`, `tests/import-review.test.ts`, `tests/repos.test.ts`, `tests/normalize.test.ts`
- Create: 마이그레이션 `npx drizzle-kit generate --name submitted_docs`

**Interfaces:**
- `schema.ts`: `applications.submittedDocs` = `text('submitted_docs', { mode: 'json' }).$type<SubmittedDocs>()` (nullable). 기존 행은 null(= 셋 다 모름). `submittedResume`는 그대로
- `normalize.ts`: `normalizePosition(s: string): string` — NFKC, 소문자, 글자·숫자 외 제거
- `import-rows.ts`:
  - `ReviewRow`에 `notes: string`, `docs: Record<DocKind, string | null>`. `emptyRow`는 `notes: ''`, docs 모두 null
  - 필수 칸은 지금 그대로(회사·포지션·지원일, 사이트는 select로 항상 있음). `missingFields` 변경 없음
  - `rowsToRegister` 결과 행에 `notes?: string`, `submittedDocs?: SubmittedDocs`. 빈 메모·모두 null인 docs는 생략
  - `checkedRowsSchema`에 `notes: z.string().max(2000)`, `docs: z.object({ resume, career, portfolio: z.string().max(40).nullable() })` 추가. 값이 있으면 `isDocsForKind(kind, v)`여야 한다(refine)
- `import-review.ts`:
  - `type ExistingMatch = 'same' | 'same_day' | 'none'`
  - `findExistingMatches(rows: { companyName; positionTitle; appliedAt }[], db?): ExistingMatch[]` — 회사 키 + 같은 지원일 기록 중 `normalizePosition`이 같거나 기존 포지션이 `(포지션 미상)`이면 `same`, 기록은 있는데 포지션이 다르면 `same_day`, 없으면 `none`. 기존 `markExistingRows`는 그대로(화면 복사·캡처 경로 동작 유지)
- `repo.ts`: `bulkCreateApplications` 행에 `notes?`, `submittedDocs?`. 저장 전 `assertDocsValid(docs)`(Task 1 `isDocsForKind` + `docFileExists`). 실패 메시지 `서류 파일을 찾을 수 없습니다: {파일 이름}`. `notes`는 `applications.notes`

- [ ] **Step 1: 실패하는 테스트**
  - `rowsToRegister`: 메모·docs 전달, docs 모두 null이면 `submittedDocs` 없음
  - `checkedRowsSchema`: `docs.resume = '경력기술서_20261102.pdf'`(종류 다름) → 실패, `'../x.pdf'` → 실패
  - `findExistingMatches`: 기존 `(주)토스 / Server Dev / 2026-10-03`에 대해 `토스 / server-dev / 2026-10-03` → same, `토스 / Frontend / 2026-10-03` → same_day, 날짜 다르면 none. 기존 포지션 `(포지션 미상)` → same
  - `bulkCreateApplications`: 메모·서류 저장, 폴더에 없는 파일 이름 → 던지고 아무것도 저장 안 됨
- [ ] **Step 2:** FAIL. **Step 3:** 구현 + 마이그레이션. **Step 4:** PASS + 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: submitted document files on applications`.

---

### Task 3: 메모의 "제출 서류" 줄 이관

**Files:**
- Modify: `src/lib/documents/files.ts`, `tests/documents.test.ts`
- Create: `src/lib/documents/migrate.ts`

**Interfaces:**
- `files.ts`:
  - `formatDocsNote(dates: Record<DocKind, string | null>): string` → `제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22`
  - `parseDocsNote(notes: string): { dates: Record<DocKind, string | null>; rest: string } | null` — 줄 단위로 `/^제출 서류:\s*이력서 (\d{4}-\d{2}-\d{2}|모름) \/ 경력기술서 (\d{4}-\d{2}-\d{2}|모름) \/ 포트폴리오 (\d{4}-\d{2}-\d{2}|모름)\s*$/`. 없으면 null. `rest` = 그 줄을 뺀 나머지(줄 순서 유지, 앞뒤 빈 줄 정리)
- `migrate.ts`:
  - `migrateDocsFromNotes(dir = config.documentsDir, db?): { migrated: number; skipped: { applicationId: number; missing: string[] }[] }`
    - 대상: `submittedDocs IS NULL`이고 `parseDocsNote(notes)`가 null이 아닌 기록
    - 날짜마다 `docFileName(kind, date)`로 이름을 만들고 `docFileExists`로 확인. 하나라도 없으면 그 기록은 건너뛰고 `missing`에 파일 이름을 적는다. `모름`은 null
    - 모두 있으면 한 트랜잭션에서 `submittedDocs` = 종류별 파일 이름(또는 null), `notes = rest || null`
    - 다시 실행해도 안전(옮긴 기록은 `submittedDocs`가 있어 대상이 아님)
  - `countDocsNotesPending(db?): number`

- [ ] **Step 1: 실패하는 테스트**
  - `formatDocsNote` ↔ `parseDocsNote` 왕복
  - 메모 `메일 가져오기(원티드)\n제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22` → 옮긴 뒤 notes `메일 가져오기(원티드)`, `submittedDocs = { resume: '이력서_20260905.pdf', career: null, portfolio: '포트폴리오_20260722.pdf' }`
  - 메모가 그 줄뿐이면 notes null
  - 폴더에 없는 날짜(이력서 2026-01-01) → skipped에 `이력서_20260101.pdf`, 기록 그대로
  - 두 번 실행 → 두 번째 migrated 0
  - 형식이 다른 줄(`제출 서류: 이력서 9/5`)은 대상 아님
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: migrate submitted documents from notes`.

---

### Task 4: 화면과 파일 보기

**Files:**
- Create: `src/app/api/documents/[name]/route.ts`, `src/app/_components/SubmittedDocs.tsx`, `src/app/resume/DocFiles.tsx`, `src/app/_actions/documents.ts`, `tests/documents-route.test.ts`, `tests/e2e/12-past-records.spec.ts`
- Modify: `src/app/_components/RecordPanel.tsx`, `src/app/postings/[id]/page.tsx`, `src/app/import/page.tsx`, `src/app/import/ImportForm.tsx`, `src/app/import/ImportReviewTable.tsx`, `src/app/_actions/import.ts`, `src/app/resume/page.tsx`, `src/app/resume/ResumeTabs.tsx`, `src/lib/search/dashboard.ts`, `tests/search.test.ts`

**화면 동작의 기준은 `docs/spec/screens.md` 1장·3.9·5.5·6장이다.**

**파일 보기 라우트** `GET /api/documents/[name]`:
- `name`은 URL 디코딩된 파일 이름 하나(예 `/api/documents/%EC%9D%B4%EB%A0%A5%EC%84%9C_20261102.pdf`). 종류는 이름에서 정한다
- `resolveDocPath(name)`이 null이면 400 `잘못된 파일 이름입니다`. 파일이 없으면 404 `파일이 없습니다`
- 응답: 파일 바이트 그대로, `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=UTF-8''<인코딩한 이름>`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`
- 서버는 `127.0.0.1`에만 열려 있으므로(1·2단계 Global Constraints) 추가 인증은 두지 않는다
- 동적 라우트(`await connection()` 또는 Next.js 16 규칙대로 캐시 안 함). `.claude/rules/nextjs.md` 따름

**`SubmittedDocs` 컴포넌트** (`{ docs: SubmittedDocs | null; exists: Record<DocKind, boolean> }`):
- 세 줄: `이력서  2026-11-02  [보기]` / `경력기술서  모름` / `포트폴리오  2026-07-22  [보기]`
- [보기]는 `<a href="/api/documents/{encodeURIComponent(name)}" target="_blank" rel="noopener">`. 파일이 없으면 [보기] 대신 회색 "파일 없음"
- 쓰는 곳: 대시보드 "기록만" 행 펼침(`RecordPanel`), 공고 상세 지원 기록 탭(3.9) 지원 요약 아래

**대시보드**: `DashboardRow`에 `resumeDocFile: string | null`. `resumeLabel`: base면 `기본 v{n}`, 아니면 `submittedDocs.resume`이 있으면 `docLabel`(`이력서 2026-11-02`), 둘 다 없으면 null("모름"). `groupDashboardRows('resume')`: 기본 버전(내림차순) → 이력서 파일(날짜 늦은 순, 키 `doc:{파일 이름}`, 라벨 `이력서 2026-11-02`) → 모름

**가져오기 화면**:
- `/import` 입력 단계에 `[표에 직접 입력]`(→ `/import?manual=1&site=<사이트>`). 사이트를 안 골랐거나 "모름"이면 비활성 + "직접 입력하려면 사이트를 고르세요"
- `/import?manual=1&site=groupby`: AI 없이 빈 행 1개(사이트 = 고른 사이트, 다른 칸 빈 칸)로 검토 표. `listDocFiles().files`를 표에 넘긴다
- 검토 표(직접 입력·화면 복사 공통): **메모** 칸, **서류** 칸(이력서·경력기술서·포트폴리오 select 3개, 각 "모름" + 폴더의 파일 날짜). 지원일을 고치면 사용자가 직접 고르지 않은 select는 `pickDocs`로 다시 고른다. 직접 입력 경로는 `findExistingMatches`로 "이미 있음"(체크 해제)·"같은 날 기록 있음"(체크 유지)

**서류 파일 탭** `/resume?tab=docs` (`DocFiles.tsx`):
- `listDocFiles()` 결과를 종류별로: 날짜, 이 파일을 쓴 지원 기록 수, [보기]
- `ignored`가 있으면 "이름 규칙에 맞지 않아 쓰지 않는 파일: {이름들}"
- 메모 이관 줄: `countDocsNotesPending() > 0`일 때만 `[메모의 제출 서류 옮기기]`
- 등록·삭제 버튼은 없다(파일을 폴더에 넣거나 빼면 목록이 바뀐다)

**서버 액션**:
- `_actions/import.ts`: `checkExistingMatchesAction(rows: { companyName; positionTitle; appliedAt }[]): Promise<ExistingMatch[]>`. `commitApplicationImportAction`이 `notes`·`docs`를 받는다(알림은 지금처럼 `{n}건을 등록했습니다`)
- `_actions/documents.ts`: `migrateDocsFromNotesAction()` → `{migrated}건의 제출 서류를 옮겼습니다`. skipped가 있으면 `{n}건은 폴더에 없는 파일({이름들}) 때문에 옮기지 않았습니다`(이름은 최대 5개 + "외 n개")

- [ ] **Step 1: 실패하는 테스트**
  - `tests/documents-route.test.ts`: 라우트 핸들러를 직접 불러 정상 이름 → 200 + `application/pdf` + inline. `..%2F..%2Fcareer-flow.db`, `이력서_20260905.pdf%00.txt`, `career-flow.db` → 400. 규칙엔 맞지만 없는 파일 → 404
  - `tests/search.test.ts`: `submittedDocs.resume`만 있는 기록 → `resumeLabel` `이력서 2026-11-02`, 묶음 순서 기본 → 파일 → 모름
  - `tests/e2e/12-past-records.spec.ts`: TC-PAST-E2E-01~06
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** `npm test`, `npm run test:e2e`, `npm run lint`, `npx next typegen && npx tsc --noEmit`, `npm run build` 모두 실패 0.
- [ ] **Step 5:** 커밋 `feat: manual past records, submitted documents view`.
- [ ] **Step 6:** `docs/test/test-cases.md`에 PAST 절과 대응표, `docs/guide/usage.md`에 "서류 파일 넣는 위치와 이름 규칙", "지난 기록 직접 입력" 추가. 커밋 `docs: past records test cases and guide`.

---

### Task 5: 정렬용 일시 (D-17)

Task 2 다음에 해도 되고 Task 4와 나란히 해도 된다(파일이 겹치는 `repo.ts`·`dashboard.ts`는 한 developer가 순서대로 고친다).

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/domain/dates.ts`, `src/lib/applications/repo.ts`, `src/lib/search/dashboard.ts`, `tests/repos.test.ts`, `tests/search.test.ts`
- Create: `src/lib/applications/sort.ts`, `src/lib/applications/backfill.ts`, `scripts/backfill-applied-datetime.ts`, 마이그레이션 `npx drizzle-kit generate --name applied_datetime`, `tests/applied-datetime.test.ts`

**데이터:**
- `applications.appliedDatetime` = `text('applied_datetime')`, nullable. 값은 **한국 시간 ISO, 고정 모양** `YYYY-MM-DDTHH:mm:ss.SSS+09:00`(문자열 비교로 정렬하기 위해 모양을 하나로 맞춘다). 화면·수정 창·내보내기에 보이지 않는다.
- 정렬 전용이다. 실제 지원 시각이 아닐 수 있다(직접 입력·그룹바이는 만든 값). 이 뜻을 `schema.ts` 주석에 적는다.

**Interfaces:**
- `dates.ts`
  - `toKstIso(d: Date): string` — `Intl.DateTimeFormat`(`Asia/Seoul`)로 위 모양. PC 시간대와 무관
  - `syntheticKstIso(appliedAt: string, rank: number): string` — 같은 날 안의 순서만 표현하는 값. `rank` 0이 가장 최근. `${appliedAt}T12:00:00.000+09:00`에서 `rank`초를 뺀 값(`rank`는 0~43199). 예: rank 0 → `T12:00:00.000`, rank 1 → `T11:59:59.000`
- `sort.ts`
  - `applicationOrder` = `[desc(applications.appliedAt), sql\`${applications.appliedDatetime} IS NULL\`, desc(applications.appliedDatetime), desc(applications.id)]` — NULL은 같은 날 맨 뒤. 지원 기록 목록을 정렬하는 모든 곳이 이것을 쓴다: `getPriorApplications`, `listApplicationsForPosting`, `getRecentApplications`, `searchApplications`(대시보드 전체·묶음·보드 카드 순서), 회사 검색 결과
- `repo.ts`
  - `markApplied`: `appliedDatetime = toKstIso(now)`(저장 시각. 지원일을 과거로 바꿔 저장해도 같은 날 안의 순서용이라 그대로 둔다)
  - `bulkCreateApplications(rows, db?)`: 행 순서 = 표 순서(위가 먼저). **같은 지원일 행끼리** 위에서부터 rank 0, 1, 2…로 `syntheticKstIso(appliedAt, rank)`. 같은 날 이미 있는 기록과의 순서는 따지지 않는다(정렬 전용)
  - `updateApplication`: 지원일을 바꿔도 `appliedDatetime`은 그대로
- `backfill.ts` (일회성, 화면 없음)
  - `type BackfillEntry = { site: SiteId; companyName: string; positionTitle: string; appliedAt: string; appliedDatetime: string }`
  - `parseMailTimeLines(site: SiteId, text: string): BackfillEntry[]` — 줄마다 `UTC시각|회사|포지션`. 시각 → `toKstIso`, 지원일 = 그 KST 날짜. 빈 줄 무시, 모양이 다른 줄은 던지지 않고 건너뛰어 개수를 센다
  - `parseGroupbyTable(md: string): BackfillEntry[]` — 마크다운 표(열: 회사 | 포지션 | 날짜 `YYYYMMDD`)에서 머리·구분 줄을 빼고 **위에서부터** 읽는다. 표는 최신이 위다. 같은 날짜 안에서 나온 순서대로 rank 0, 1…을 주고 `syntheticKstIso`
  - `backfillAppliedDatetime(entries: BackfillEntry[], db?): { updated: number; unmatched: BackfillEntry[]; ambiguous: BackfillEntry[] }`
    - 대상은 `appliedDatetime IS NULL`인 기록만(다시 실행해도 덮어쓰지 않음)
    - 맞추는 키: 사이트 + `normalizeCompanyName(회사 표시명)` + `normalizePosition(포지션)` + 지원일
    - 같은 키의 기록과 항목이 여러 개면 id 오름차순 기록에 시각 오름차순 항목을 짝짓는다. 개수가 다르면 남는 항목은 `ambiguous`
    - 못 찾은 항목은 `unmatched`. 한 트랜잭션
- `scripts/backfill-applied-datetime.ts` — `npx tsx scripts/backfill-applied-datetime.ts [--dry-run]`
  - 읽는 파일(데이터 폴더 안, 커밋 안 됨): `data/backups/data-<site>[-n].txt`(파일 이름의 `<site>`가 사이트: `wanted`·`jobkorea`·`remember`), `data/groupby-history.md`(사이트 `groupby`)
  - `--dry-run`이면 맞춘 수·못 맞춘 수만 출력하고 저장하지 않는다. 출력에 회사·포지션을 쓰지 않는다(개수와 줄 번호만)
  - 실제 실행 전 `db.$client.backup('data/backups/before-applied-datetime.db')`로 백업한다(`src/lib/backup.ts:33`과 같은 방식, 이미 있으면 덮어쓰지 않고 멈춤). 실행은 `tsx`(이미 devDependency, `package.json:35`)

**일회성 실행 절차** (developer가 스크립트를 만들고, 실행은 메인 세션이 사용자 확인 후)
1. 마이그레이션 적용(앱을 한 번 시작하거나 테스트 DB에서 확인).
2. `--dry-run`으로 개수 확인: 메일 452건, 그룹바이 17건이 모두 맞아야 한다. 못 맞춘 것이 있으면 멈추고 사용자에게 알린다.
3. 실제 실행. 결과 개수를 작업 기록 7절에 적는다.
4. 대시보드에서 같은 날 기록 순서를 사용자가 눈으로 확인한다(그룹바이는 표 순서, 메일은 수신 시각 순).

- [ ] **Step 1: 실패하는 테스트** (`tests/applied-datetime.test.ts`, 임시 DB·가짜 문자열)
  - `toKstIso(new Date('2026-03-03T16:30:00Z')) === '2026-03-04T01:30:00.000+09:00'`
  - `syntheticKstIso('2026-11-09', 0) > syntheticKstIso('2026-11-09', 1)`(문자열 비교)
  - 정렬: 같은 지원일에 일시 A(10:00) / B(09:00) / C(NULL) → A, B, C. 지원일이 다르면 지원일이 먼저
  - `bulkCreateApplications`에 같은 날 3행 → 표 위 행이 목록에서 먼저. 다른 날 행은 rank가 따로 시작
  - `markApplied` → `appliedDatetime`이 `+09:00` 모양
  - `parseGroupbyTable`: 가짜 표(머리·구분 줄, 같은 날 2행) → 위 행이 rank 0
  - `parseMailTimeLines`: 정상 2줄 + 깨진 줄 1개 → 2개, 건너뜀 1
  - `backfillAppliedDatetime`: 맞는 기록 채움, `(주)` 차이 무시, 이미 값이 있는 기록은 안 바꿈, 못 찾은 항목은 unmatched, 같은 키 2건은 id 순으로 짝지음
- [ ] **Step 2:** FAIL. **Step 3:** 구현 + 마이그레이션 + 스크립트. **Step 4:** PASS + 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: hidden applied datetime for ordering with one-time backfill`.

---

### Task 6: 상태 필터를 "거친 단계" 기준으로

사용자 요청(2026-11-19): "상태를 서류합격으로 조회하면 서류 합격된 목록이 다 나와야 됨(해당 상태가 지난 목록이 다 보여야 된다는 것)". 지금은 `searchApplications`가 지금 상태만 본다(`src/lib/search/dashboard.ts:43` `eq(applications.status, q.status)`). 그래서 서류합격 뒤 면접·불합격·지원취소로 바뀐 기록은 빠진다.

**규칙** (`src/lib/applications/stages.ts`, 순수)

| 필터 | 보이는 기록 |
|---|---|
| 지원 | 지금 상태가 지원 (그대로) |
| 서류합격 | 지금 상태가 서류합격·면접·최종합격 **또는** 상태 이력에 서류합격·면접·최종합격이 있는 기록 (예: 서류합격 → 불합격, 서류합격 → 지원취소) |
| 면접 | 지금 상태가 면접·최종합격 **또는** 이력에 면접·최종합격이 있는 기록 |
| 최종합격 | 지금 상태가 최종합격 **또는** 이력에 최종합격이 있는 기록 (예: 최종합격 뒤 지원취소) |
| 불합격 / 지원취소 | 지금 상태 그대로 |

- 지금 상태가 **지원**이면 이력이 있어도 거친 단계로 치지 않는다. 상태를 잘못 눌렀다 되돌린 경우(서류합격 → 지원)를 막기 위해서다.
- 면접·최종합격은 서류합격을 거친 것으로 본다(가져온 기록은 중간 이력이 없을 수 있다).

**보기별 적용**

| 곳 | 기준 | 이유 |
|---|---|---|
| 상태 필터(모든 보기) | 거친 단계 | 사용자 요청 |
| 상태별 보드의 칸 | **지금 상태 그대로** | 카드가 칸 하나에만 있어야 끌어 놓기로 상태를 바꿀 수 있다(화면 문서 1장). 필터는 보드에도 적용되므로, "서류합격" 필터 + 보드면 서류를 통과한 기록이 지금 상태 칸에 나뉘어 보인다 |
| 요약 줄의 서류합격·면접·최종합격 수 | 거친 단계 | 숫자를 누르거나 필터를 걸었을 때 나오는 건수와 같게 한다 |
| 요약 줄의 전체 기록 수, 지원·불합격·지원취소 수 | 지금 상태 그대로 | 합계가 맞아야 한다(`src/app/page.tsx:110`) |
| 서류 통과율 (사이트별·이력서별 묶음 머리) | 거친 단계 | `passed` = 서류합격을 거친 기록, `decided` = `passed` + 지금 상태 불합격(서류합격을 거치지 않은 것). 지금은 서류합격 뒤 불합격·지원취소가 "통과 못 함"으로 잘못 세진다 |

- (2026-11-19, D-18) 묶음 서류 통과율은 통계 작업(`docs/plans/phase-2-stats.md` Task 4)에서 `Tally`로 바뀐다. 분모에 무응답(지원 후 30일 넘은 지원)이 더해진다. 거친 단계 규칙은 이 Task 그대로다.

**Files:**
- Create: `src/lib/applications/stages.ts`, `tests/stages.test.ts`
- Modify: `src/lib/search/dashboard.ts`, `src/app/page.tsx`(요약 줄 숫자), `src/app/_components/DashboardFilters.tsx`(안내 문구), `tests/search.test.ts`

**Interfaces:**
- `stages.ts`
  - `type ReachedStage = 'document_passed' | 'interview' | 'final_passed'`
  - `reachedStages(current: ApplicationStatus, history: ApplicationStatus[]): Set<ReachedStage>` — 위 규칙. `current === 'applied'`면 빈 집합
  - `matchesStatusFilter(filter: ApplicationStatus, current: ApplicationStatus, reached: Set<ReachedStage>): boolean` — 서류합격·면접·최종합격은 `reached.has(filter)`, 나머지는 `current === filter`
- `dashboard.ts`
  - `searchApplications`: SQL에서 `status` 조건을 빼고, `statusEvents`에서 `status IN ('document_passed','interview','final_passed')`인 행을 지원 기록별로 한 번에 읽어 `reachedStages` 계산 → `matchesStatusFilter`로 거른다(기록 수백 건 규모라 메모리에서 거르면 충분)
  - `DashboardRow`에 `reached: ReachedStage[]` 추가(묶음 통과율 계산용)
  - `makeGroup`의 `passed`/`decided`를 위 표대로 바꾼다
  - `getDashboardStats`에 `reachedCounts: Record<ReachedStage, number>` 추가. `byStatus`는 그대로(합계용)
- 화면
  - 요약 줄의 서류합격·면접·최종합격 숫자는 `reachedCounts`
  - 상태 필터가 서류합격·면접·최종합격일 때 필터 아래에 작은 회색 안내 "이 단계를 거친 기록을 모두 보여 줍니다(지금 상태와 관계없이)"

- [ ] **Step 1: 실패하는 테스트**
  - `tests/stages.test.ts`: (지원, []) → 빈 집합. (불합격, [서류합격]) → {서류합격}. (지원취소, [서류합격, 면접]) → {서류합격, 면접}. (면접, []) → {서류합격, 면접}. (지원, [서류합격]) → 빈 집합(되돌림). (지원취소, [최종합격]) → 셋 다
  - `tests/search.test.ts`: 기록 A 서류합격 → 불합격, B 서류합격 → 면접, C 지원, D 불합격(이력 없음). 필터 서류합격 → A, B. 필터 면접 → B. 필터 불합격 → A, D. 상태별 보드 묶음에서 A는 "종료" 칸, B는 "면접" 칸(지금 상태). `getDashboardStats().reachedCounts.document_passed === 2`, `byStatus` 합계 4
  - 통과율: 사이트 묶음 {A, B, C, D} → passed 2, decided 3
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 PASS, 대시보드 E2E(`tests/e2e/01-dashboard.spec.ts`)의 상태 필터·요약 기대값이 바뀌면 함께 고친다.
- [ ] **Step 5:** 커밋 `feat: status filter shows records that passed the stage`.

---

## 테스트 케이스

| ID | 대상 | 기대 결과 | 종류 | 위치 |
|---|---|---|---|---|
| TC-PAST-01 | `pickDocFile` | 같은 날 포함, 종류마다 따로, 가장 이른 파일 앞은 그 종류만 null (2026-08-01 → 이력서·경력기술서 모름, 포트폴리오 07-22) | 단위 | documents |
| TC-PAST-02 | `parseDocFileName` | `(이력서\|경력기술서\|포트폴리오)_YYYYMMDD.pdf`만 통과. 접미사·날짜 없음·pdf 아님·대문자 확장자·없는 날짜·자기소개서 거부 | 단위 | documents |
| TC-PAST-03 | `listDocFiles` | 맞는 파일만 목록, 폴더와 이름 종류가 다르면 무시 목록, 폴더 없으면 빈 목록 | 통합 | documents |
| TC-PAST-04 | `resolveDocPath` | `..`·절대 경로·구분자 섞인 이름 거부, 정상 이름은 그 종류 폴더 안 경로 | 단위 | documents |
| TC-PAST-10 | `findExistingMatches` | same / same_day / none (별칭·(주) 무시, 기존 `(포지션 미상)`은 same) | 통합 | import-review |
| TC-PAST-11 | 행 검증 | docs 값의 종류가 칸과 다르거나 규칙 밖이면 스키마 실패. 필수 칸(회사·포지션·지원일) 규칙은 그대로 | 단위 | import-review |
| TC-PAST-12 | `bulkCreateApplications` | 메모·서류 파일 이름 저장, 폴더에 없는 파일이면 전체 롤백 | 통합 | repos |
| TC-PAST-20 | 메모 줄 형식 | `formatDocsNote` ↔ `parseDocsNote` 왕복, 다른 형식은 null | 단위 | documents |
| TC-PAST-21 | `migrateDocsFromNotes` | 둘째 줄만 지우고 첫 줄 유지, 날짜 → 파일 이름, 폴더에 없는 파일이면 건너뜀, 재실행 안전 | 통합 | documents |
| TC-PAST-30 | 파일 보기 라우트 | 정상 200 PDF inline, 경로 탈출·규칙 밖 400, 없는 파일 404 | 통합 | documents-route |
| TC-PAST-31 | 대시보드 | 이력서 파일만 있는 기록은 `이력서 {날짜}`, 묶음 순서 기본 → 파일 → 모름 | 통합 | search |
| TC-PAST-40 | `toKstIso`·`syntheticKstIso` | 고정 모양 `…+09:00`, rank가 작을수록 문자열이 큼 | 단위 | applied-datetime |
| TC-PAST-41 | 정렬 | 지원일 ↓ → 일시 ↓(NULL 맨 뒤) → id ↓, 모든 목록 함수에 같은 순서 | 통합 | applied-datetime |
| TC-PAST-42 | 입력 순서 유지 | 직접 입력·가져오기에서 같은 날 위 행이 먼저, [지원 완료]는 저장 시각 | 통합 | applied-datetime |
| TC-PAST-43 | 일회성 채우기 | 메일 줄·그룹바이 표 읽기, 키 맞추기(`(주)` 무시), 이미 값 있으면 안 바꿈, 못 찾음·애매함 보고 | 통합 | applied-datetime |
| TC-PAST-50 | `reachedStages` | 이력·지금 상태로 거친 단계 계산, 지금 상태가 지원이면 빈 집합, 면접은 서류합격 포함 | 단위 | stages |
| TC-PAST-51 | 상태 필터 | 서류합격 필터에 서류합격 뒤 불합격·면접·지원취소 기록 포함, 지원·불합격·지원취소 필터는 지금 상태 | 통합 | search |
| TC-PAST-52 | 상태별 보드 | 칸은 지금 상태 기준 그대로 | 통합 | search |
| TC-PAST-53 | 요약 줄 | 서류합격·면접·최종합격 수 = 그 필터 결과 수, 전체 합계는 지금 상태 기준 | 통합 | search |
| TC-PAST-54 | 서류 통과율 | 서류합격 뒤 불합격·지원취소도 통과로 셈 | 통합 | search |
| TC-PAST-M1 | 실제 데이터 채우기 | dry-run에서 메일 452·그룹바이 17건 모두 맞음, 실행 뒤 대시보드 같은 날 순서 확인 | 수동 | 실제 개인 데이터라 자동 불가 |
| TC-PAST-E2E-01 | 직접 입력 열기 | 사이트 미선택·"모름"이면 비활성, 그룹바이 → 빈 행 1개(사이트 그룹바이) | E2E | 12-past-records |
| TC-PAST-E2E-02 | 직접 입력 등록 | 회사·포지션·지원일을 채워야 등록 가능, 하나라도 비면 "… 필요"로 막힘, 등록 후 대시보드에 나옴 | E2E | 12-past-records |
| TC-PAST-E2E-03 | 서류 자동 선택 | 지원일 입력 → 서류 select 자동 선택(같은 날 포함), 직접 고친 것은 날짜를 바꿔도 유지 | E2E | 12-past-records |
| TC-PAST-E2E-04 | 제출 서류 보기 | 기록만 행 펼침에 세 줄, [보기]가 새 탭에서 PDF 응답(200, application/pdf), 파일을 지우면 "파일 없음" | E2E | 12-past-records |
| TC-PAST-E2E-05 | 서류 파일 탭 | 폴더의 파일이 종류별·날짜순, 규칙 밖 파일 안내, [보기] | E2E | 12-past-records |
| TC-PAST-E2E-06 | 메모 이관 | "제출 서류" 줄이 있는 기록이 있으면 버튼이 보이고, 누르면 옮긴 건수 알림, 대시보드 라벨 `이력서 {날짜}`, 메모 첫 줄은 남음 | E2E | 12-past-records |

## Spec 대비 범위

| 기획서 | 이 계획 |
|---|---|
| 7.7 직접 입력 | Task 2·4 |
| 7.9 제출 서류 파일 | Task 1·3·4 |
| 10장 `applied_datetime`(정렬 전용) | Task 5 |
| 7.2 상태 필터 = 거친 단계 | Task 6 |
| 메일 지난 기록 | **범위 밖**. 메인 세션이 한 번 DB에 넣음(0.2) |
| 앱에서 서류 PDF 올리기 | **범위 밖**. 폴더에 넣으면 바로 목록에 나온다 |
| 지원 기록 수정 창(3.10)에서 제출 서류 고치기 | **범위 밖**. 3단계 Task 4(제출 이력서 수정)와 함께 다룬다 |
| [지원 완료](앞으로의 지원)에 서류 파일 기록 | **범위 밖**. 앞으로의 지원은 앱 기본 이력서·맞춤 이력서 버전이 기록된다 |
