# Career Flow 3단계(맞춤 이력서 + PDF) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: 재설계 (2026-11-20). 처음 계획(2026-11-16)을 지금 코드(1·2단계, 지난 기록·서류 파일, 과제·코딩테스트, 통계)에 맞춰 고쳤다. 작업 기록: [docs/work/tailored-resume.md](../work/tailored-resume.md)
- 이 계획은 **D-23·D-24·D-25의 추천안**을 기준으로 쓴다(작업 기록 "정할 것 초안"). 다른 선택지면 아래 "선택지별 차이"대로 바꾼다.
  - D-23 a: [지원 완료]가 실제로 낸 서류(이력서·경력기술서·포트폴리오)를 기록한다. 맞춤본이 있으면 이력서 칸 기본값은 맞춤본.
  - D-24 a: 통계에 "맞춤 이력서 효과" 칸(맞춤본 / 맞춤 안 함 비교)을 더한다.
  - D-25 a: 맞춤본 PDF는 파일로 보관하지 않는다. 리비전 내용으로 그때그때 다시 만든다.

**Goal:** 공고 화면에서 맞춤 이력서를 만들고(기준본 대비 변경 내역, 확인 필요 경고, 사이트 이력서 수정 안내, 포트폴리오 활용 제안), 대화로 다듬고, PDF로 받는다. 지원 완료 때 실제로 낸 서류(맞춤본 또는 이력서 파일, 경력기술서·포트폴리오 파일)를 기록하고, 통계에서 맞춤본으로 낸 지원과 아닌 지원의 서류 통과율을 비교한다. (기획서 7.4·7.5·7.9·7.10·9.4·11장)

**Architecture:** 작업 큐에 `tailor_resume`, `revise_tailored`를 더한다. 맞춤본은 기본 이력서와 같은 `ResumeContent`로 받아 공고별 리비전으로 저장한다. 사실 칸(기본 정보·학력·자격, 경력의 회사·기간·직무, 프로젝트 이름·소속·기간·링크)은 **코드가 기준본 값으로 되돌린다.** 변경 내역은 AI 설명이 아니라 **코드가 기준본과 비교해 계산**하고, 기준본에 없는 수치·기술·경력은 코드 검사로 "확인 필요" 경고를 띄운다. PDF는 HTML 템플릿(한글 글꼴 내장)을 Playwright로 A4 출력한다(브라우저 전역 잠금 공유). 지원 기록의 `submitted_resume` JSON에 `tailored`·`file` 종류를 더하고, 제출 서류 칸(`submitted_docs`)을 [지원 완료]와 수정 창에서 채운다. DB에는 테이블 2개(`tailored_resumes`, `tailored_revisions`)만 더한다.

**Tech Stack:** 1·2단계와 동일. `pretendard`는 이미 설치되어 있다(`node_modules/pretendard/dist/web/static/woff2/Pretendard-{Regular,Bold}.woff2` 확인, 2026-11-20). 새 패키지 없음.

**Spec:** `docs/spec/product.md` 7.4·7.5·7.9·7.10·10·11장, 화면 `docs/spec/screens.md` 1장·3.3·3.4·3.7·3.9·3.10·5.2·5.3·5.5·10장, 구조 `docs/spec/architecture.md`
**선행 계획:** `phase-1-2-mvp.md`, `phase-2-past-records.md`(Task 1~8), `phase-2-stats.md` (모두 완료)

## Global Constraints

- 1·2단계 계획의 Global Constraints와 "시험 구현에서 확인된 사항", 지난 기록·통계 계획의 Global Constraints 전부 적용.
- **기본 이력서는 절대 수정하지 않는다.** 맞춤본은 공고별 사본(리비전)으로만 저장한다.
- **맞춤본은 기본 이력서에 없는 사실을 추가하지 않는다.** 표현 조정, 순서 변경, 강조, 축소만 허용한다. 지키는 방법은 셋이다.
  1. 프롬프트 맨 위 규칙(Task 3)
  2. 사실 칸을 기준본 값으로 되돌림(`normalizeTailored`, Task 2)
  3. 기준본에 없는 수치·기술·경력·프로젝트를 "확인 필요"로 표시(`checkFabrication`, Task 2). 사이트 수정 안내와 포트폴리오 활용 문구의 수치도 검사한다.
- 새 작업 종류: `tailor_resume`, `revise_tailored`. 시간 제한 각 300초, 도구 없음(`tools: []`), 기본 모델 `opus`(D-05).
- (D-11) 다듬기는 이전 세션을 이어 붙이지 않는다(`resumeSessionId` 없음). 기준 이력서·공고·분석·현재 리비전·요청을 모두 넣은 새 실행이다. 형식 오류 재요청(`runValidated`)만 같은 세션을 쓴다.
- `tailor_resume`은 언제나 **최신 기본 이력서**를 기준으로 새 리비전을 만든다(처음 만들기와 "최신 기준으로 다시 만들기"가 같은 작업). `revise_tailored`는 **최신 리비전의 기준 버전**을 그대로 쓴다. 변경 내역·경고는 항상 그 리비전의 기준 버전과 비교한다(리비전끼리 비교 아님).
- PDF: A4, 여백 15mm, 한글 글꼴(Pretendard Regular/Bold, base64 내장). 템플릿 1종. 본문 CSS에 `word-break: keep-all; overflow-wrap: anywhere`(한글 낱말이 중간에서 끊기지 않게, 긴 영문·주소는 줄바꿈). 파일명 `이름_회사_포지션_YYYYMMDD.pdf`(경력기술서만이면 `_경력기술서` 접미사). Playwright 실행은 `src/lib/pdf/render.ts`에서만, `acquireBrowserLock`을 함께 쓴다(`.claude/rules/code-structure.md`).
- (D-25 a) 맞춤본 PDF는 파일로 저장하지 않는다. `data/documents/`에 쓰지 않고, 서류 파일 목록(5.5)에 나오지 않는다.
- (D-23 a) 지원 기록의 제출 서류는 사용자가 실제로 낸 것을 적는다. [지원 완료]는 지금처럼 "저장" 한 번이면 끝나야 한다(반목표: 입력이 늘지 않음). 모든 칸에 기본값을 채운다.
- 실제 `claude` 호출: **개발·검증 중 0회.** 가짜 runner(Vitest)와 가짜 `claude`(E2E)만 쓴다. 실제 확인은 병합 뒤 사용자의 첫 실사용(TC-TAILOR-M1, opus 2회: 생성 1 + 다듬기 1)으로 한다.
- 변경 내역 경로 표기(코드와 프롬프트가 같이 쓰는 약속):
  `summary`, `careerNarrative`, `experiences.<id>`, `experiences.<id>.description`, `experiences.<id>.achievements`, `projects.<id>`, `projects.<id>.role`, `projects.<id>.achievements`, `projects.<id>.techStack`, `skills.<category>`, `order.experiences`, `order.projects`, `portfolio`

## Review Focus

1. **AI가 수치·기술을 지어냄** (기준본에 없는 "응답속도 40% 개선", 써 본 적 없는 "Kafka") — 저장은 하되 "확인 필요"로 눈에 띄게 표시. 사이트 수정 안내 문구에 섞인 수치도 잡는다. → Task 2 TC-TAILOR-05·06·08.
2. **AI가 회사명·기간·직무를 바꿈** — 기준본 값으로 되돌리고 "되돌림"을 알린다. PDF에는 기준본 값만 나간다. → Task 2 TC-TAILOR-07.
3. **다듬기가 현재 리비전을 무시함** — 새 실행에는 이전 대화가 없으므로 프롬프트에 현재 리비전 전체가 들어가야 한다. → Task 3 TC-TAILOR-10.
4. **기본 이력서가 바뀜** — 리비전은 만든 때의 기준 버전에 묶이고, 화면에 "기준 이력서가 바뀌었습니다" 안내. → Task 3 TC-TAILOR-13, Task 6 E2E-04.
5. **제출 서류가 틀리게 남음** — 맞춤본이 있으면 기본값이 맞춤본, 다른 공고의 맞춤본은 고를 수 없음, 가져온 기록의 종류(`imported`)는 유지. → Task 4 TC-SUBMIT-01~03.
6. **한글·특수문자 파일명** (`홍길동_(주)토스/Server Dev`) — 경로 문자 제거, UTF-8 파일명. → Task 5 TC-PDF-03·04.
7. **HTML 특수문자** (`<`, `&`, `"`) — PDF·미리보기에 글자로 나오고 태그로 해석되지 않음. 미리보기 응답에 CSP. → Task 5 TC-PDF-01·08.
8. **글자 잘림·한글 낱말 끊김** — 폭 1440·1024에서 긴 회사명·기술명·제안 문구가 잘리지 않음. → Task 6 E2E-09.

---

## File Structure

```
prompts/
  tailor-resume.md                   (새) 맞춤 이력서 생성
  revise-tailored.md                 (새) 다듬기 규칙 조각(buildRevisionPrompt의 extraRules)
src/lib/
  domain/types.ts                    (수정) JobType 2종, SubmittedResume 타입(여기로 옮김)
  db/schema.ts                       (수정) tailoredResumes, tailoredRevisions, applications.submittedResume 타입
  ai/queue.ts                        (수정) JOB_TIMEOUT_MS 2종
  ai/prompt.ts                       (수정) PromptName 2종
  ai/job-text.ts                     (수정) 진행 문구 2종
  ai/revision.ts                     (새) buildRevisionPrompt (4단계도 사용, D-11)
  ai/tasks/tailor-schemas.ts         (새) TailorOutput, SiteGuideItem, PortfolioTip, ChangeReason
  ai/tasks/tailor-resume.ts          (새) tailorResume / reviseTailored 처리기
  ai/tasks/index.ts                  (수정) 처리기 등록
  settings.ts                        (수정) DEFAULT_MODELS 2종
  resume/diff.ts                     (새) diffResume, arrayLineDiff, changePathLabel (순수, 클라이언트에서도 씀)
  resume/fabrication.ts              (새) normalizeTailored, checkFabrication (순수)
  tailored/repo.ts                   (새) 맞춤본·리비전 저장소, 작업 요청
  applications/submitted.ts          (새) ResumeChoice, 기본값, 칸 변환, 라벨 (순수, 클라이언트에서도 씀)
  applications/repo.ts               (수정) markApplied·updateApplication 제출 서류, resolveSubmittedResume
  postings/repo.ts                   (수정) deletePosting이 맞춤 작업도 취소·거부
  search/dashboard.ts                (수정) 맞춤 라벨, 이력서별 "맞춤 이력서" 묶음
  stats/load.ts, stats/aggregate.ts  (수정) tailored 표시, 서류 버전별 맞춤 묶음, tailoredCompare
  pdf/fonts.ts                       (새) fontFaceCss
  pdf/template.ts                    (새) renderResumeHtml
  pdf/render.ts                      (새) renderPdf, pdfFileName, contentDisposition
src/app/
  api/pdf/tailored/[revisionId]/route.ts           (새) 맞춤본 PDF
  api/pdf/tailored/[revisionId]/preview/route.ts   (새) 미리보기 HTML
  api/pdf/base/[versionId]/route.ts                (새) 기본 이력서 PDF
  api/jobs/active/route.ts           (수정) 맞춤 작업이면 ?tab=tailored로 링크
  _actions/tailored.ts               (새) 생성·다듬기 액션
  _actions/applications.ts           (수정) 제출 서류 입력
  _actions/settings.ts               (수정) 모델 작업 종류 enum
  _components/DocSelects.tsx         (새) 이력서·경력기술서·포트폴리오 select 3개 (지원 완료 창·수정 창 공용)
  _components/SubmittedDocs.tsx      (수정) 맞춤본 줄
  _components/ApplicationEditModal.tsx (수정) 제출 서류
  _components/RecordPanel.tsx        (수정) 수정 창에 서류 목록 전달
  _components/AnalysisView.tsx       (수정) 맞춤 이력서 조언 옆 탭 링크
  postings/[id]/page.tsx             (수정) 탭 추가, 지원 기록 라벨
  postings/[id]/TailoredTab.tsx      (새) 맞춤 이력서 탭(서버)
  postings/[id]/TailoredControls.tsx (새) 리비전 선택·PDF 메뉴·복사·다듬기 입력(클라이언트)
  postings/[id]/ApplyForm.tsx        (수정) 제출 서류
  page.tsx                           (수정) 대시보드: 수정 창용 서류 목록
  resume/page.tsx, resume/VersionHistory.tsx (수정) PDF 받기, 직전 버전과 비교
  stats/page.tsx                     (수정) 맞춤 이력서 효과 칸, 서류 버전별 보조 글자
  settings/ModelSelects.tsx, settings/page.tsx (수정) 모델 2종
tests/
  tailored-repo.test.ts, resume-diff.test.ts, fabrication.test.ts, tailor-task.test.ts,
  pdf.test.ts, submitted.test.ts (새) / stats.test.ts, search.test.ts, prompts.test.ts (수정)
  fixtures/fake-claude-e2e.mjs (수정: 맞춤 이력서 응답), e2e/14-tailored.spec.ts (새)
drizzle/0005_tailored.sql            (drizzle-kit generate --name tailored)
```

Task 묶음(PM 위임 단위 제안): A = Task 1·2, B = Task 3, C = Task 4·7, D = Task 5, E = Task 6. 순서대로 한다(E는 A~D 뒤).

---

### Task 1: 데이터 구조 (맞춤본 테이블, 작업 종류, 제출 이력서 종류)

**Files:**
- Modify: `src/lib/domain/types.ts`, `src/lib/db/schema.ts`, `src/lib/ai/queue.ts`, `src/lib/settings.ts`, `src/lib/ai/job-text.ts`, `src/lib/postings/repo.ts`
- Create: `src/lib/tailored/repo.ts`(저장 함수만, 작업 요청 함수는 Task 3), 마이그레이션 `drizzle/0005_tailored.sql`, `tests/tailored-repo.test.ts`

**Interfaces:**
- `types.ts`
  - `JobType`에 `'tailor_resume' | 'revise_tailored'`. `JOB_TIMEOUT_MS` 각 `300_000`, `DEFAULT_MODELS` 각 `'opus'`, `estimateText`: `'맞춤 이력서 작성 중… (보통 1~3분)'`, `'맞춤 이력서 다듬는 중… (보통 1~3분)'`.
  - `SubmittedResume`를 여기로 옮기고 종류를 넓힌다(JSON 칸이라 마이그레이션 없음):

    ```ts
    export type SubmittedResume =
      | { kind: 'base'; versionId: number }              // 3단계 전 [지원 완료] 기록. 새로 만들지 않는다
      | { kind: 'imported' }                             // 가져오기·직접 입력·메일 기록
      | { kind: 'file' }                                 // 3단계 [지원 완료]: 이력서는 제출 서류 칸(파일 또는 모름)
      | { kind: 'tailored'; tailoredRevisionId: number }; // 맞춤본(PDF든 사이트 수정이든)
    ```
- `schema.ts`
  - `tailoredResumes`: `id`, `postingId`(fk postings, **unique**, **on delete cascade**, D-02), `createdAt`
  - `tailoredRevisions`: `id`, `tailoredResumeId`(fk, on delete cascade), `revNo`(int), `baseResumeVersionId`(fk resume_versions), `content`(json `ResumeContent`), `changes`(json `ResumeChange[]`), `changeReasons`(json `ChangeReason[]`), `warnings`(json `FabricationWarning[]`), `siteGuide`(json `SiteGuideItem[]`), `portfolioTips`(json `PortfolioTip[]`), `notes`(text, not null, 빈 문자열 허용), `userRequest`(text, null = 처음 생성·다시 만들기), `jobId`(fk ai_jobs), `createdAt`. 유일: (`tailoredResumeId`, `revNo`). 인덱스: `tailoredResumeId`.
  - `applications.submittedResume`의 `$type<SubmittedResume>()`.
  - 처음 계획의 `tailoredResumes.baseResumeVersionId`와 `rebaseTailored`는 두지 않는다. 기준 버전은 리비전마다 있다.
- `tailored/repo.ts`

  ```ts
  type ChangeReason = { path: string; reason: string };            // tailor-schemas.ts에서 정의
  type NewRevision = {
    baseResumeVersionId: number; content: ResumeContent; changes: ResumeChange[];
    changeReasons: ChangeReason[]; warnings: FabricationWarning[]; siteGuide: SiteGuideItem[];
    portfolioTips: PortfolioTip[]; notes: string; userRequest: string | null; jobId: number;
  };
  type TailoredRevision = NewRevision & { id: number; tailoredResumeId: number; revNo: number; createdAt: string };
  type RevisionSummary = { id: number; revNo: number; baseResumeVersionId: number; userRequest: string | null; createdAt: string };

  getTailoredForPosting(postingId: number, db?): { id: number; postingId: number; createdAt: string } | null
  ensureTailored(postingId: number, db?): number               // 있으면 그 id, 없으면 만든다
  addRevision(tailoredResumeId: number, rev: NewRevision, db?): { id: number; revNo: number }  // revNo = 최대+1, 트랜잭션
  getRevision(id: number, db?): TailoredRevision | null        // content를 ResumeContent.safeParse, 실패하면 null
  getLatestRevision(tailoredResumeId: number, db?): TailoredRevision | null
  listRevisionsForPosting(postingId: number, db?): RevisionSummary[]   // 최신순(revNo ↓)
  revisionPostingId(revisionId: number, db?): number | null    // 그 리비전이 속한 공고(제출 서류 검증용)
  ```
  타입 `ResumeChange`·`FabricationWarning`은 Task 2, `SiteGuideItem`·`PortfolioTip`·`ChangeReason`은 Task 3에서 정의한다. 이 Task에서는 같은 이름으로 먼저 만들어 두고 Task 2·3에서 채워도 된다.
- `postings/repo.ts` `deletePosting`: 대기·실행 중 작업을 찾는 종류를 `analyze_posting`, `tailor_resume`, `revise_tailored`로 넓힌다(실행 중이면 "작업이 끝난 뒤 삭제하세요", 대기는 취소). 맞춤본 행은 FK cascade로 지워진다(`foreign_keys = ON`, `src/lib/db/client.ts:13`).

- [ ] **Step 1: 실패하는 테스트** (`tests/tailored-repo.test.ts`)

```ts
test('revisions are numbered per posting and keep their own base version (TC-TAILOR-01)', () => {
  const db = makeTestDb();
  const v1 = saveResumeVersion(emptyResume(), undefined, db);
  const { postingId } = registerPosting({ pastedText: '공고' }, db);
  const tid = ensureTailored(postingId, db);
  expect(ensureTailored(postingId, db)).toBe(tid);
  const r1 = addRevision(tid, rev({ baseResumeVersionId: v1.id }), db);
  const v2 = saveResumeVersion({ ...emptyResume(), summary: 'v2' }, undefined, db);
  const r2 = addRevision(tid, rev({ baseResumeVersionId: v2.id, userRequest: '짧게' }), db);
  expect([r1.revNo, r2.revNo]).toEqual([1, 2]);
  expect(getRevision(r1.id, db)!.baseResumeVersionId).toBe(v1.id);
  expect(getLatestRevision(tid, db)!.userRequest).toBe('짧게');
  expect(listRevisionsForPosting(postingId, db).map((r) => r.revNo)).toEqual([2, 1]);
  expect(revisionPostingId(r2.id, db)).toBe(postingId);
});
test('deleting a posting removes tailored rows and cancels queued tailor jobs (TC-TAILOR-02)', () => {
  // 맞춤본 + 리비전 + 대기 중 tailor_resume 작업 → deletePosting → 행 0, 작업 canceled
  // 실행 중 revise_tailored 작업이 있으면 '작업이 끝난 뒤 삭제하세요'로 거부, 아무것도 지워지지 않음
});
```
(`rev()`는 테스트 헬퍼: 빈 리비전 값을 만든다.)

- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현 + `npx drizzle-kit generate --name tailored`. **Step 4:** PASS + 전체 테스트 PASS.
- [ ] **Step 5:** 커밋 `feat: tailored resume tables and repo`.

---

### Task 2: 변경 내역 계산, 사실 칸 되돌리기, "지어낸 내용" 검사

**Files:**
- Create: `src/lib/resume/diff.ts`, `src/lib/resume/fabrication.ts`, `tests/resume-diff.test.ts`, `tests/fabrication.test.ts`

**Interfaces:** 두 파일 모두 순수 함수다. DB·파일을 import하지 않는다(`diff.ts`는 클라이언트 컴포넌트에서도 쓴다).

```ts
// resume/diff.ts
export type ResumeChange = {
  path: string;                                   // Global Constraints의 경로 표기
  kind: 'modified' | 'added' | 'removed' | 'reordered';
  before: string | string[] | null;
  after: string | string[] | null;
};
export function diffResume(base: ResumeContent, tailored: ResumeContent): ResumeChange[];
/** 배열 줄 비교: 기준에만 있는 줄 del, 맞춤에만 있는 줄 ins, 둘 다 있으면 same. 맞춤 순서를 따르고 del은 원래 자리 근처에 둔다 */
export function arrayLineDiff(before: string[], after: string[]): { text: string; op: 'same' | 'del' | 'ins' }[];
/** 경로를 화면 이름으로: '한 줄 소개', '경력기술서', '경력 > A사', '경력 > A사 > 성과', '경력 > A사 > 담당 업무',
 *  '프로젝트 > 이름', '프로젝트 > 이름 > 성과|사용 기술|역할', '기술 > 분류', '경력 순서', '프로젝트 순서', '포트폴리오'.
 *  id로 이름을 못 찾으면 id를 그대로 쓴다 */
export function changePathLabel(path: string, base: ResumeContent, tailored: ResumeContent): string;

// resume/fabrication.ts
export type FabricationWarning = {
  kind: 'new_experience' | 'new_project' | 'new_skill' | 'new_number' | 'changed_fact';
  path: string;
  detail: string;                                 // 화면에 그대로 보여 줄 한국어 문장
};
/** 사실 칸을 기준본 값으로 되돌린다. 되돌린 곳마다 changed_fact 경고 1개 */
export function normalizeTailored(base: ResumeContent, tailored: ResumeContent): { content: ResumeContent; restored: FabricationWarning[] };
/** extraTexts: 사이트 수정 안내 제안 문구·포트폴리오 활용 문구(path 예 'siteGuide.0', 'portfolioTips.1'). 수치만 검사한다 */
export function checkFabrication(base: ResumeContent, tailored: ResumeContent, extraTexts?: { path: string; text: string }[]): FabricationWarning[];
```

- 규칙
  - `diffResume`
    - 경험·프로젝트는 `id`로 짝짓는다. 문자열 칸이 다르면 `modified`. 배열(성과·기술)은 내용이 다르면 `modified`(before/after 배열). 기준본에만 있으면 `removed`, 맞춤본에만 있으면 `added`(before/after는 회사명 또는 프로젝트 이름).
    - 짝지은 항목끼리 순서가 다르면 `order.experiences`/`order.projects`에 `reordered`(before/after = id 배열).
    - `skills`는 `category`로 짝짓는다. `portfolio`는 전체를 한 덩어리로 비교(제목 배열).
    - `basics`, `education`, `certifications`, 경력의 `company/start/end/role`, 프로젝트의 `name/org/start/end/link`는 비교하지 않는다(`normalizeTailored`가 되돌린 뒤라 늘 같다).
  - `normalizeTailored`
    - `basics`, `education`, `certifications`를 기준본 값으로 바꾼다.
    - 기준본과 id가 같은 경력의 `company`, `start`, `end`, `role`, id가 같은 프로젝트의 `name`, `org`, `start`, `end`, `link`를 기준본 값으로 바꾼다.
    - 바뀐 값이 있었으면 `changed_fact` 경고: `되돌림: {경로 이름}의 {회사명·기간·직무 등}을 기본 이력서 값으로 되돌렸습니다`.
    - id가 기준본에 없는 경력·프로젝트는 지우지 않는다(경고는 `checkFabrication`이 낸다).
  - `checkFabrication`
    - 기준본에 없는 경력 id → `new_experience`(`새 경력: {회사} — 기본 이력서에 없는 경력입니다`). 프로젝트 id → `new_project`.
    - 기술 이름(`skills[].items`, `projects[].techStack`)을 소문자·앞뒤 공백 제거해 기준본 전체 텍스트(모든 문자열 칸을 이어 붙여 소문자화)에서 찾는다. 없으면 `new_skill`(`새 기술: {이름} ({경로 이름}) — 기본 이력서에 없는 기술입니다`).
    - 수치: 정규식 `/\d+(?:[.,]\d+)*\s*(%|퍼센트|배|건|명|억|만|천|ms|초|분|시간|개월|개|년|x|tps|qps|gb|tb|mb)?/gi`로 뽑는다. 쉼표·공백을 지우고 소문자로 맞춘다. 기준본 전체 텍스트에서도 같은 방식으로 뽑아 두 집합(숫자+단위, 숫자만)을 만든다. 단위가 있으면 "숫자+단위"가 기준본에 없을 때, 단위가 없으면 "숫자"가 기준본에 없을 때 `new_number`(`새 수치: "{원문 조각}" ({경로 이름}) — 기본 이력서에 없는 숫자입니다`). 같은 경로·같은 수치는 1번만.
    - `extraTexts`는 수치만 같은 방식으로 검사한다(경로 이름: `사이트 수정 안내 {n}번째`, `포트폴리오 활용 {n}번째`).

- [ ] **Step 1: 실패하는 테스트**

```ts
test('detects modified achievements, removed project and reorder (TC-TAILOR-03)', () => {
  const base = resume({ experiences: [exp('exp-1', ['A 개선']), exp('exp-2', ['B 구축'])], projects: [prj('prj-1')] });
  const t = resume({ experiences: [exp('exp-2', ['B 구축']), exp('exp-1', ['A 개선 (결제)'])], projects: [] });
  expect(diffResume(base, t)).toEqual(expect.arrayContaining([
    { path: 'experiences.exp-1.achievements', kind: 'modified', before: ['A 개선'], after: ['A 개선 (결제)'] },
    { path: 'projects.prj-1', kind: 'removed', before: expect.any(String), after: null },
    { path: 'order.experiences', kind: 'reordered', before: ['exp-1', 'exp-2'], after: ['exp-2', 'exp-1'] },
  ]));
});
test('identical resumes have no changes', () => { expect(diffResume(base, structuredClone(base))).toEqual([]); });
test('labels and line diff (TC-TAILOR-04)', () => {
  // changePathLabel('experiences.exp-1.achievements', …) === '경력 > A사 > 성과', 모르는 id는 id 그대로
  // arrayLineDiff(['a','b'], ['b','c']) → a del, b same, c ins
});
test('flags numbers absent from base (TC-TAILOR-05)', () => {
  const w = checkFabrication(resume({ experiences: [exp('exp-1', ['응답속도 개선'])] }),
                             resume({ experiences: [exp('exp-1', ['응답속도 40% 개선'])] }));
  expect(w).toEqual([expect.objectContaining({ kind: 'new_number', path: 'experiences.exp-1.achievements' })]);
});
test('numbers already in base are fine', () => { /* 기준 '처리량 3배 향상' → 맞춤 '3배 향상된 처리량' → []. 단위 없는 '2021'이 기준 날짜에 있으면 [] */ });
test('years of experience absent from base are flagged', () => { /* 맞춤 summary '백엔드 5년차', 기준에 '5년' 없음 → new_number */ });
test('flags skills absent from base, new experience and project (TC-TAILOR-06)', () => { /* Kafka → new_skill, exp-9 → new_experience, prj-9 → new_project */ });
test('restores fact fields from base (TC-TAILOR-07)', () => {
  // 맞춤본 exp-1.company 'A사(주)', start 변경, basics.email 변경, education 추가
  // → content는 기준 값, restored에 changed_fact 경고, diffResume 결과에 이 칸들 없음
});
test('checks numbers in site guide and portfolio texts (TC-TAILOR-08)', () => {
  // extraTexts [{ path: 'siteGuide.0', text: '일 1,200만 건 처리' }], 기준에 '1200만' 없음 → new_number, path 'siteGuide.0'
});
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: resume diff, fact restore and fabrication checks`.

---

### Task 3: 맞춤 이력서 작업 (생성·다듬기)

**Files:**
- Create: `prompts/tailor-resume.md`, `prompts/revise-tailored.md`, `src/lib/ai/revision.ts`, `src/lib/ai/tasks/tailor-schemas.ts`, `src/lib/ai/tasks/tailor-resume.ts`, `tests/tailor-task.test.ts`
- Modify: `src/lib/ai/tasks/index.ts`, `src/lib/ai/prompt.ts`, `src/lib/tailored/repo.ts`(요청 함수), `tests/prompts.test.ts`

**Interfaces:**
- `tailor-schemas.ts`

```ts
export const SiteGuideItem = z.object({
  field: z.string(),                                         // 사이트 이력서의 항목 이름(사이트 용어)
  action: z.enum(['replace', 'add', 'remove', 'reorder']),  // 화면: 수정 / 추가 / 삭제 / 순서
  current: z.string().nullable(),
  suggested: z.string(),                                     // 붙여넣을 문구. remove면 빈 문자열
  reason: z.string(),
});
export const PortfolioTip = z.object({ title: z.string(), emphasis: z.string() });
export const ChangeReason = z.object({ path: z.string(), reason: z.string() });
export const TailorOutput = z.object({
  resume: ResumeContent,
  changeReasons: z.array(ChangeReason),
  siteGuide: z.array(SiteGuideItem),
  portfolioTips: z.array(PortfolioTip),
  notes: z.string(),
});
```

- `revision.ts` (D-11)

```ts
/** 다듬기·추가 요청용 새 실행 프롬프트. basePrompt(원래 작업의 전체 프롬프트) + extraRules + 현재 결과 JSON + 요청.
 *  이전 세션을 이어 붙이지 않는다. 4단계 면접 준비 추가 요청도 이 함수를 쓴다. */
export function buildRevisionPrompt(input: { basePrompt: string; currentJson: unknown; request: string; extraRules?: string }): string;
```
  모양: `basePrompt` → `\n\n## 다듬기\n` → `extraRules` → `\n\n### 현재 결과(JSON)\n` + 들여쓴 JSON → `\n\n### 사용자 요청\n` + 요청.

- `tailored/repo.ts` 작업 요청 함수

```ts
/** 진행 중(대기·실행)인 tailor_resume·revise_tailored 중 이 공고 것. 없으면 undefined */
export function activeTailorJob(postingId: number, db?): JobSummary | undefined;
/** 두 종류 중 가장 최근 작업(실패 표시용) */
export function latestTailorJob(postingId: number, db?): JobSummary | undefined;
/** 처음 만들기와 "최신 기준으로 다시 만들기" 공용. 진행 중 작업이 있으면 그 jobId를 돌려준다 */
export function requestTailoredResume(postingId: number, db?): number;
export function requestTailoredRevision(postingId: number, request: string, db?): number;
```
  - `requestTailoredResume` 예외: 공고 없음 "공고를 찾을 수 없습니다", 분석 없음 "공고 분석이 끝난 뒤 만들 수 있습니다", 기본 이력서 없음 "기본 이력서를 먼저 등록하세요." payload `{ postingId }`.
  - `requestTailoredRevision` 예외: 요청이 비었음 "고칠 내용을 적어 주세요", 2000자 초과 "요청은 2000자까지 쓸 수 있습니다", 맞춤본 없음 "맞춤 이력서를 먼저 만드세요", 진행 중 작업 있음 "진행 중인 작업이 끝난 뒤 요청하세요". payload `{ postingId, request }`(앞뒤 공백 제거).

- 처리기 (`tailor-resume.ts`)
  - 공통 마무리 `finishRevision(base: ResumeVersion, out: TailorOutput, ctx)`: `normalizeTailored(base.content, out.resume)` → `diffResume(base.content, normalized)` → 경고 = `restored` + `checkFabrication(base.content, normalized, extraTexts)`(extraTexts = `siteGuide[i].suggested`, `portfolioTips[i].emphasis`) → `addRevision`.
  - `tailor_resume` `{ postingId }`: 최신 기본 이력서·최신 분석·공고 본문을 읽는다. `ensureTailored`. 프롬프트 `tailor-resume` 변수: `today`, `resume_json`, `posting_text`, `analysis_json`, `site_label`(공고 사이트 표시명), `site_guide_note`(사이트가 홈페이지 지원·기타면 "사이트 이력서 화면이 없으므로 일반적인 지원서 항목 이름을 쓴다", 아니면 "그 사이트 이력서 화면의 항목 이름을 쓴다"). `runValidated(TailorOutput)`, `tools: []`, 모델 `getModelFor('tailor_resume')`. 결과 `{ postingId, revisionId, revNo }`.
  - `revise_tailored` `{ postingId, request }`: 맞춤본의 최신 리비전과 **그 리비전의 기준 버전**을 읽는다. `basePrompt` = 그 기준 버전으로 렌더한 `tailor-resume` 프롬프트, `extraRules` = `revise-tailored.md`, `currentJson` = `{ resume, changeReasons, siteGuide, portfolioTips, notes }`(현재 리비전). `resumeSessionId` 없음. `userRequest` 저장.
  - 분석·기본 이력서·리비전이 없으면 `AiError('cli', '…')`(요청 뒤에 지워진 경우).
- 프롬프트 필수 규칙
  - `tailor-resume.md` 맨 위: "기준 이력서에 없는 경력·프로젝트·수치·기술·자격을 추가하지 않는다. 바꿀 수 있는 것은 표현, 순서, 강조, 축소뿐이다. 모르면 바꾸지 않는다."
  - 경력·프로젝트 `id`는 기준본 그대로. 회사명·기간·직무·학력·자격·연락처는 바꾸지 않는다.
  - 한 경력의 성과로 옮겨 적는 사실은 기준본에서 그 회사에서 한 일로 확인되는 것만(예: 프로젝트 `org`가 그 회사).
  - `changeReasons.path`는 경로 표기 규칙을 따른다(규칙 목록을 프롬프트에 넣는다).
  - `siteGuide`는 `{{site_label}}` 이력서 화면에서 고칠 항목을 `{{site_guide_note}}`. 기준본에 없는 수치를 쓰지 않는다.
  - 출력은 한국어. 분석 결과의 "이력서에서 보완 가능" 항목을 우선 반영한다.
  - `revise-tailored.md`: "요청과 관계없는 곳은 현재 결과 그대로 둔다. 요청이 기준 이력서에 없는 사실을 넣으라는 것이면 넣지 않고 notes에 이유를 쓴다. 위 규칙은 요청보다 우선한다."

- [ ] **Step 1: 실패하는 테스트** (가짜 runner: 요청을 기록, 설정된 출력 반환 또는 오류)

```ts
test('tailor_resume stores normalized content, computed diff and warnings (TC-TAILOR-09)', async () => {
  // 기본 이력서(성과 '응답속도 개선'), 분석 완료 공고. 가짜 출력: 성과 '응답속도 40% 개선', exp-1.company 바꿈
  await handlers.tailor_resume({ jobId, payload: { postingId }, runner, workDir, db });
  const r = getLatestRevision(getTailoredForPosting(postingId, db)!.id, db)!;
  expect(r.content.experiences[0].company).toBe(baseCompany);
  expect(r.changes).toEqual([expect.objectContaining({ path: 'experiences.exp-1.achievements', kind: 'modified' })]);
  expect(r.warnings.map((w) => w.kind).sort()).toEqual(['changed_fact', 'new_number']);
  expect(runner.lastReq.tools).toEqual([]);
  expect(runner.lastReq.model).toBe('opus');
  expect(runner.lastReq.prompt.split('\n').slice(0, 5).join('\n')).toContain('기준 이력서에 없는');
});
test('revise runs a fresh call with the current revision and request (TC-TAILOR-10)', async () => {
  // lastReq.resumeSessionId 없음, prompt에 현재 리비전 JSON·요청·'기준 이력서에 없는' 규칙,
  // 리비전 2 생성, userRequest 저장, changes는 기준 버전과 비교한 결과
});
test('revise propagates auth error without creating a revision (TC-TAILOR-11)', async () => { /* AiError('auth') → reject, 리비전 1개 그대로 */ });
test('request guards (TC-TAILOR-12)', () => {
  // 분석 없음 → '공고 분석이 끝난 뒤', 기본 이력서 없음 → throw, 진행 중이면 같은 jobId
  // 다듬기: 빈 요청·2001자·맞춤본 없음·진행 중 → 각 메시지
});
test('tailor after base change uses the latest base; old revisions keep theirs (TC-TAILOR-13)', async () => { /* r1 v1, v2 저장 → 다시 만들기 → r2.baseResumeVersionId = v2, r1은 v1 */ });
test('buildRevisionPrompt contains base prompt, rules, current json and request (TC-TAILOR-14)', () => {});
// tests/prompts.test.ts: tailor-resume 변수 누락 없음, 첫 규칙 줄에 '기준 이력서에 없는' (TC-TAILOR-15)
// 새 작업 종류가 JOB_TIMEOUT_MS·DEFAULT_MODELS·estimateText·설정 액션 enum에 모두 있음 (TC-TAILOR-16)
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 테스트.
- [ ] **Step 5:** 커밋 `feat: tailor and revise resume tasks`.
- 실제 `claude` 확인은 하지 않는다(병합 뒤 TC-TAILOR-M1).

---

### Task 4: 제출 서류 기록 (D-23 a)

**Files:**
- Create: `src/lib/applications/submitted.ts`, `tests/submitted.test.ts`
- Modify: `src/lib/applications/repo.ts`, `src/lib/search/dashboard.ts`, `tests/search.test.ts`

**Interfaces:**
- `applications/submitted.ts` (순수, 클라이언트에서도 씀)

```ts
export type ResumeChoice =
  | { kind: 'tailored'; tailoredRevisionId: number }
  | { kind: 'file'; fileName: string }
  | { kind: 'unknown' }
  | { kind: 'base'; versionId: number };          // 예전 기록을 그대로 둘 때만. 새로 고를 수 없다
/** 이력서 칸 + 경력기술서·포트폴리오 값(파일 이름 | DOC_NONE | null=모름) */
export type SubmittedInput = { resume: ResumeChoice; career: string | null; portfolio: string | null };

export function encodeResumeChoice(c: ResumeChoice): string;      // 'tailored:12' | 'file:이력서_20261102.pdf' | 'unknown' | 'base:3'
export function decodeResumeChoice(s: string): ResumeChoice | null;
/** 지금 기록 값 → 선택 값 */
export function currentSubmitted(sr: SubmittedResume, docs: SubmittedDocs | null): SubmittedInput;
/** [지원 완료] 기본값: 이력서 = 최신 맞춤 리비전(있으면) → 지원일 기준 이력서 파일 → 모름. 경력기술서·포트폴리오 = pickDocFile */
export function defaultSubmitted(appliedAt: string, files: DocFile[], latestTailoredRevisionId: number | null): SubmittedInput;
/** 칸에 쓸 값. prevKind가 'imported'면 file·unknown일 때 종류를 imported로 둔다 */
export function toColumns(input: SubmittedInput, prevKind?: SubmittedResume['kind']): { submittedResume: SubmittedResume; submittedDocs: SubmittedDocs };
/** short: '맞춤 r2' | '기본 v3' | '이력서 2026-11-02' | null. long: '맞춤 이력서 r2' | '기본 이력서 v3' | '이력서 2026-11-02' | null */
export function resumeLabel(sr: SubmittedResume, docs: SubmittedDocs | null, names: { revNo?: number | null; versionNo?: number | null }, style: 'short' | 'long'): string | null;
```
  - `toColumns`: tailored → `{kind:'tailored', tailoredRevisionId}`, docs `{ resume: null, career, portfolio }`. file → `{kind: prevKind==='imported' ? 'imported' : 'file'}`, docs.resume = 파일 이름. unknown → 같은 종류, docs.resume = null. base → `{kind:'base', versionId}`, docs.resume = null.
- `applications/repo.ts`
  - `markApplied(input: { postingId; appliedAt?; site?; siteNote?; notes?; submitted?: SubmittedInput }, db?, docsDir?)`: `submitted`가 없으면 `defaultSubmitted(appliedAt, listDocFiles(docsDir).files, 이 공고 최신 리비전 id)`. 검증 뒤 `toColumns`로 저장. 기본 이력서가 없어도 저장된다(이제 기본 이력서 버전을 쓰지 않으므로 "기본 이력서를 먼저 등록하세요." 검사를 뺀다).
  - `updateApplication(id, patch: { …기존; submitted?: SubmittedInput }, db?, docsDir?)`: `toColumns(input, app.submittedResume.kind)`.
  - 검증(`assertSubmittedValid`, 저장 전, 실패하면 아무것도 저장하지 않음):
    - tailored: 그 리비전이 있고 `revisionPostingId === 이 기록의 postingId`. 아니면 "이 공고의 맞춤 이력서가 아닙니다".
    - file: 이력서 종류이고 폴더에 있음(`isDocsForKind('resume')`, `docFileExists`). 이력서는 `DOC_NONE` 불가.
    - base: 지금 기록 값과 같을 때만. 아니면 "기본 이력서 버전은 새로 고를 수 없습니다".
    - career·portfolio: 기존 `assertDocsValid` 규칙.
  - `resolveSubmittedResume(sr: SubmittedResume, db?): { label: string; content: ResumeContent } | null` — tailored → 리비전 내용(`맞춤 이력서 r2`), base → 버전 내용(`기본 이력서 v3`), file·imported → null(앱은 PDF 내용을 읽지 않는다). 4단계 면접 준비가 쓴다.
- `search/dashboard.ts`
  - `DashboardRow`에 `tailored: boolean`. `resumeLabel` = `resumeLabel(…, 'short')`(리비전 번호는 `tailoredRevisions`의 id→revNo를 한 번 읽어 둔다). `resumeBaseVersionNo`는 base일 때만.
  - `groupDashboardRows(rows, 'resume')`: **"맞춤 이력서"**(key `tailored`, 맞춤본으로 낸 기록 전부) → 기본 v{n}(번호 큰 순) → 이력서 파일(날짜 늦은 순) → 모름.

- [ ] **Step 1: 실패하는 테스트** (`tests/submitted.test.ts`, 임시 서류 폴더에 가짜 PDF)
  - TC-SUBMIT-01 `markApplied({postingId})` 기본값: 맞춤본 있는 공고 → `tailored`(최신 리비전), 경력기술서·포트폴리오는 지원일 기준 파일 또는 없음. 맞춤본 없는 공고 → `file` + `이력서_…` 파일. 파일이 하나도 없으면 이력서 모름(종류 `file`, docs.resume null).
  - TC-SUBMIT-02 명시 값 저장. 다른 공고의 리비전 → 거부, 폴더에 없는 파일 → 거부(아무것도 저장 안 됨), 이력서 `none` → 거부.
  - TC-SUBMIT-03 `updateApplication`: file → tailored → file 바꾸기. 가져온 기록은 파일을 바꿔도 종류 `imported` 유지. 예전 `base` 기록은 이력서를 안 바꾸면 그대로, 다른 base 버전은 거부.
  - TC-SUBMIT-04 `resumeLabel`과 `searchApplications`: 맞춤 → `'맞춤 r2'`, base → `'기본 v3'`, 파일 → `'이력서 2026-11-02'`, 모름 → null. `tailored` 플래그.
  - TC-SUBMIT-05 `groupDashboardRows('resume')`: 맞춤 이력서 → 기본 v2 → 이력서 2026-11-02 → 모름 순서, 묶음 통과율은 그대로 Tally.
  - TC-SUBMIT-06 `resolveSubmittedResume`: tailored·base는 내용과 라벨, file·imported는 null.
  - TC-SUBMIT-07 `encodeResumeChoice`/`decodeResumeChoice` 왕복, 잘못된 문자열 → null.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS(기존 `search.test.ts`·`repos.test.ts`의 base 기대값이 바뀌면 이 규칙에 맞춰 고친다). **Step 5:** 커밋 `feat: record submitted documents and tailored resume on apply`.

---

### Task 5: PDF 출력 (D-25 a)

**Files:**
- Create: `src/lib/pdf/fonts.ts`, `src/lib/pdf/template.ts`, `src/lib/pdf/render.ts`, `src/app/api/pdf/tailored/[revisionId]/route.ts`, `src/app/api/pdf/tailored/[revisionId]/preview/route.ts`, `src/app/api/pdf/base/[versionId]/route.ts`, `tests/pdf.test.ts`

**Interfaces:**
- `fontFaceCss(): string` — `node_modules/pretendard/dist/web/static/woff2/Pretendard-{Regular,Bold}.woff2`를 base64로 읽어 `@font-face` 두 개(`font-family: 'CF Pretendard'`, 400·700). 한 번 읽고 메모리에 둔다.
- `type PdfPart = 'resume' | 'narrative' | 'both'`
- `renderResumeHtml(content: ResumeContent, opts: { part: PdfPart; fontCss?: string }): string` — 순수 함수. 모든 텍스트를 HTML 이스케이프. `resume` = 기본 정보·요약·경력·프로젝트·기술·학력·자격·포트폴리오(제목·링크·요약), `narrative` = 경력기술서, `both` = 둘 다(경력기술서는 새 페이지 `page-break-before: always`). 경력기술서가 비면 `both`는 이력서만. 본문 CSS `word-break: keep-all; overflow-wrap: anywhere`. 링크는 http/https만 `<a>`로, 나머지는 글자로.
- `renderPdf(html: string): Promise<Buffer>` — `acquireBrowserLock(30_000)` → `chromium.launch()`(영구 프로필 아님) → `page.setContent(html, { waitUntil: 'load' })` → `page.pdf({ format: 'A4', printBackground: true, margin: 15mm 사방 })` → 닫고 잠금 해제(`finally`). 잠금을 못 얻으면 `BrowserLockTimeoutError` 그대로.
- `pdfFileName(i: { name: string; company?: string; position?: string; date: Date; part: PdfPart }): string` — 조각마다 `\ / : * ? " < > |`와 공백 제거, 빈 조각 생략, `_` 연결, 날짜는 로컬 `YYYYMMDD`, `narrative`면 `_경력기술서`, `.pdf`.
- `contentDisposition(fileName: string, inline = false): string` — `${inline ? 'inline' : 'attachment'}; filename="resume.pdf"; filename*=UTF-8''<encodeURIComponent>`
- 라우트 (모두 `runtime` 기본, 동적)
  - `GET /api/pdf/tailored/[revisionId]?part=both|resume|narrative&inline=1` → `application/pdf`. 파일명: 기본 정보 이름, 공고 회사 표시명, 공고 포지션, 오늘. 없는 리비전 404 "맞춤 이력서를 찾을 수 없습니다". `part=narrative`인데 경력기술서가 비면 400 "경력기술서 내용이 없습니다". 잘못된 part는 `both`. 브라우저 잠금 시간 초과 503 "다른 작업이 브라우저를 쓰고 있습니다. 잠시 뒤 다시 받으세요".
  - `GET /api/pdf/tailored/[revisionId]/preview` → `text/html; charset=utf-8`, `renderResumeHtml(content, { part: 'both', fontCss })`. 헤더 `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:`, `X-Content-Type-Options: nosniff`. (맞춤 탭의 미리보기 `iframe`과 "새 탭에서 크게 보기"가 쓴다. 브라우저를 띄우지 않는다.)
  - `GET /api/pdf/base/[versionId]?part=…` → 같은 방식, 파일명은 이름과 날짜만.
- 템플릿 디자인: 흑백 위주 1단. 이름 크게(22pt), 연락처 한 줄, 섹션 제목 + 얇은 구분선, 경력은 "회사 · 직무 · 기간" 한 줄 + 담당 업무 + 성과 글머리표. 기간 표기 `2021.03 – 현재`. 세부 스타일은 구현자 재량.

- [ ] **Step 1: 실패하는 테스트** (`tests/pdf.test.ts`)

```ts
test('escapes html in content (TC-PDF-01)', () => {
  const html = renderResumeHtml({ ...sample, summary: '<script>x</script> & "따옴표"' }, { part: 'resume' });
  expect(html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; &quot;따옴표&quot;');
  expect(html).not.toContain('<script>x');
});
test('part selects sections (TC-PDF-02)', () => {
  expect(renderResumeHtml(sample, { part: 'resume' })).not.toContain(sample.careerNarrative);
  expect(renderResumeHtml(sample, { part: 'narrative' })).not.toContain(sample.experiences[0].company);
  expect(renderResumeHtml(sample, { part: 'both' })).toContain('page-break-before');
  expect(renderResumeHtml({ ...sample, careerNarrative: '' }, { part: 'both' })).not.toContain('page-break-before');
});
test('pdfFileName sanitizes (TC-PDF-03)', () => {
  expect(pdfFileName({ name: '홍길동', company: '(주)토스/Bank', position: 'Server Dev', date: new Date('2026-11-16T09:00:00'), part: 'both' }))
    .toBe('홍길동_(주)토스Bank_ServerDev_20261116.pdf');
  expect(pdfFileName({ name: '홍길동', date: new Date('2026-11-16T09:00:00'), part: 'narrative' }))
    .toBe('홍길동_20261116_경력기술서.pdf');
});
test('content-disposition encodes utf-8 filename (TC-PDF-04)', () => {
  expect(contentDisposition('홍길동_토스.pdf')).toBe(`attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent('홍길동_토스.pdf')}`);
  expect(contentDisposition('a.pdf', true)).toMatch(/^inline;/);
});
test('renderPdf produces a PDF with embedded font and waits for the browser lock (TC-PDF-05)', async () => {
  const buf = await renderPdf(renderResumeHtml(sample, { part: 'both', fontCss: fontFaceCss() }));
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(5_000);
  // 잠금을 잡은 상태에서 renderPdf → 잠금을 풀기 전에는 끝나지 않음
}, 60_000);
test('template keeps Korean words together (TC-PDF-06)', () => { /* html에 'word-break: keep-all' */ });
// TC-PDF-07 라우트: 없는 id 404, 잘못된 part → both, narrative 비었으면 400, Content-Type·Content-Disposition
// TC-PDF-08 미리보기 라우트: text/html, CSP 헤더, 내용이 이스케이프됨
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: resume pdf rendering, preview and download routes`.

---

### Task 6: 화면 (맞춤 이력서 탭, 지원 완료·수정 창, 지원 기록, 기본 이력서)

**Files:**
- Create: `src/app/postings/[id]/TailoredTab.tsx`, `src/app/postings/[id]/TailoredControls.tsx`, `src/app/_actions/tailored.ts`, `src/app/_components/DocSelects.tsx`, `tests/e2e/14-tailored.spec.ts`
- Modify: `src/app/postings/[id]/page.tsx`, `ApplyForm.tsx`, `src/app/_components/{ApplicationEditModal,RecordPanel,SubmittedDocs,AnalysisView}.tsx`, `src/app/page.tsx`, `src/app/_actions/{applications,settings}.ts`, `src/app/api/jobs/active/route.ts`, `src/app/settings/{ModelSelects.tsx,page.tsx}`, `src/app/resume/{page.tsx,VersionHistory.tsx}`, `tests/fixtures/fake-claude-e2e.mjs`

**Interfaces:**
- 서버 액션 (`_actions/tailored.ts`): `requestTailoredResumeAction(postingId: number): Promise<ActionResult>`, `requestTailoredRevisionAction(postingId: number, request: string): Promise<ActionResult>`. 성공 알림 "맞춤 이력서를 만들기 시작했습니다" / "수정 요청을 보냈습니다". `revalidatePath('/postings/<id>')`.
- `markAppliedAction`·`updateApplicationAction` 입력에 `submitted: { resume: string /* encodeResumeChoice */; career: string | null; portfolio: string | null }`. 액션이 `decodeResumeChoice`로 풀고, 못 풀면 "제출한 이력서 값이 올바르지 않습니다".
- `DocSelects` props: `{ appliedAt: string; files: DocFile[]; revisions: { id: number; revNo: number; createdAt: string }[]; value: SubmittedInput; onChange(v): void; keepBase?: { versionId: number; versionNo: number } }`. 지원일이 바뀌면 사용자가 직접 고르지 않은 칸만 다시 고른다(이력서 칸이 맞춤본이면 그대로).

- [ ] **Step 1: 맞춤 이력서 탭** (화면 문서 3.4 그대로)
  - 탭 순서: 분석 / 맞춤 이력서 / 공고 원문 / 지원 기록(`?tab=tailored`). 탭 상태 점: 맞춤 작업 진행 중 "…", 실패 "!".
  - 맞춤본 없음 / 진행 중 / 실패 / 결과 / 저장된 리비전을 읽을 수 없음 — 화면 문서 3.4 상황별 표.
  - 결과: 리비전 선택(`?rev=<id>`), [PDF 받기 ▾], 확인 필요 경고, 되돌림 알림, 기준 이력서 바뀜 안내, 변경 내역, 사이트 수정 안내([복사]), 포트폴리오 활용, 참고 메모, 미리보기(iframe), 다듬기 입력.
  - 배치: 폭 1100px 이상은 `minmax(0,1fr) 360px` 두 칸(오른쪽 미리보기 sticky), 그보다 좁으면 한 칸(미리보기는 아래). 사이트 수정 안내는 3열 표(항목 / 할 일 / 제안 문구). 화면 문서 3.4 "글자 잘림 방지" 규칙.
  - 분석 탭 "맞춤 이력서 조언" 줄 오른쪽에 `맞춤 이력서 탭으로 →` 링크.
  - 진행 중 작업 표시(내비)의 링크: 맞춤 작업이면 `/postings/<id>?tab=tailored`.
- [ ] **Step 2: 지원 완료 창·수정 창·지원 기록**
  - 지원 완료 창(3.7)과 수정 창(3.10)에 `DocSelects`. 대시보드의 기록만 행 수정 창에도 서류 목록을 넘긴다(맞춤본 선택지는 없음).
  - 지원 기록 탭(3.9): "제출한 이력서" 라벨 `resumeLabel(…, 'long')`(없으면 "모름"). 맞춤본이면 라벨이 맞춤 탭 링크(`?tab=tailored&rev=<id>`). 제출 서류 카드는 값이 하나라도 있거나 맞춤본이면 보인다. 맞춤본 줄: `이력서  맞춤 이력서 r2  [보기]`(보기 = `/api/pdf/tailored/<id>?part=both&inline=1`, 새 탭).
- [ ] **Step 3: 설정·기본 이력서**
  - 설정 작업별 모델에 "맞춤 이력서", "맞춤 이력서 다듬기"(기본 opus).
  - 기본 이력서 화면(5.2): [PDF 받기 ▾](현재 버전, 세 가지). 버전 기록(5.3): 버전 보기에 [내용 | 직전 버전과 비교] 전환. 비교는 `diffResume(직전, 선택)`을 맞춤 탭 변경 내역과 같은 모양으로(이유 없음). v1은 "첫 버전입니다". 같은 내용 저장 판단은 지금의 `sameResume`을 그대로 둔다.
- [ ] **Step 4: E2E** (`tests/e2e/14-tailored.spec.ts`, 가짜 `claude`) — 아래 테스트 케이스 TC-TAILOR-E2E-01~11. E2E-09는 긴 내용 고정 데이터(회사명 30자, 직무 25자, 기술 `Spring Cloud Data Flow`, 제안 문구 200자, 공백 없는 영문 60자 주소)로 폭 1440·1024 화면을 찍어 글자 잘림·한글 낱말 끊김이 없는지 본다.
- [ ] **Step 5:** 커밋 `feat: tailored resume tab, submitted documents on apply, pdf download`.

---

### Task 7: 통계 "맞춤 이력서 효과" (D-24 a)

**Files:**
- Modify: `src/lib/stats/load.ts`, `src/lib/stats/aggregate.ts`, `src/app/stats/page.tsx`, `tests/stats.test.ts`, `tests/e2e/13-stats.spec.ts`

**Interfaces:**
- `StatItem`에 `tailored: boolean`(`submittedResume.kind === 'tailored'`).
- `byDocVersion(items, 'resume')`: 맨 앞에 `{ key: 'tailored', label: '맞춤 이력서' }` 묶음(맞춤본 기록 전부). 나머지 순서는 그대로(기본 v{n} → 파일 → 모름). 맞춤본 기록은 다른 묶음에 넣지 않는다. 경력기술서·포트폴리오는 바뀌지 않는다(맞춤본 기록도 그 종류의 파일 값으로 센다).
- 새 함수

```ts
export type TailoredCompare = {
  since: string;          // 필터 안에서 맞춤본으로 낸 가장 이른 지원일
  tailored: Tally;        // 그날부터 맞춤본으로 낸 지원
  plain: Tally;           // 그날부터 맞춤본이 아닌 지원(파일·예전 기본 버전·가져온 기록·모름 모두)
};
export function tailoredCompare(items: StatItem[]): TailoredCompare | null;   // 맞춤본 기록이 없으면 null
```
- `StatsData`에 `tailoredCompare: TailoredCompare | null`. 사이트·기간 필터는 그대로 적용된다.
- 화면(화면 문서 10.3 "맞춤 이력서 효과"): 요약 카드 바로 아래 전체 폭 카드. 막대 2줄(맞춤 이력서 / 맞춤 안 함) + 표(구분 / 지원 / 통과 / 불합격 / 무응답 / 대기 / 서류 통과율) + 안내 줄. 비어 있으면 안내 문구만.

- [ ] **Step 1: 실패하는 테스트**
  - TC-STATS-15 `loadStatItems`가 `tailored`를 읽음. `byDocVersion('resume')` 순서: 맞춤 이력서 → 기본 v2 → 이력서 파일 → 모름. `career`는 맞춤 기록도 파일 값으로.
  - TC-STATS-16 `tailoredCompare`: 맞춤 기록 없음 → null. 맞춤 첫 지원 2026-11-21이면 그 전 기록은 빠지고, 같은 날 기록은 들어감. 사이트 필터 뒤 맞춤 기록이 없으면 null.
- [ ] **Step 2:** FAIL. **Step 3:** 구현(화면 포함). **Step 4:** PASS + E2E-08. **Step 5:** 커밋 `feat: tailored resume effect in stats`.

---

## 선택지별 차이

| 결정 | 추천안(이 계획) | 다른 선택지일 때 바뀌는 것 |
|---|---|---|
| D-23 | a: 실제 낸 서류(맞춤본 또는 파일 3종) 기록 | **b**(맞춤본·기본 버전만): Task 4에서 `ResumeChoice`의 `file`·`unknown`과 `SubmittedResume`의 `file`을 빼고 `markApplied` 기본값을 "최신 맞춤 리비전 → 최신 기본 이력서 버전"으로. 지원 완료 창은 "제출한 이력서" select 하나(맞춤 리비전들 + 기본 이력서 현재 버전). 수정 창에는 제출 서류 select 3개를 그대로 둔다(지난 기록 계획 Task 8 약속). 통계·대시보드의 맞춤 묶음은 같다 |
| D-24 | a: 통계에 맞춤 효과 칸 + 서류 버전별 맞춤 묶음 | **b**: Task 7에서 `tailoredCompare`와 카드를 뺀다(서류 버전별 "맞춤 이력서" 묶음은 남김, 없으면 맞춤 기록이 "모름"에 섞인다). **c**: Task 7 전체를 뺀다(맞춤 기록은 서류 버전별에서 "모름"으로 셈) |
| D-25 | a: PDF 파일 보관 안 함 | **b**: Task 5에 `saveTailoredPdf(revisionId, part)`를 더해 [PDF 받기] 때 `data/documents/tailored/<회사>_<포지션>_r<번호>_YYYYMMDD.pdf`에 저장, 서류 파일 화면(5.5)에 "맞춤 이력서" 묶음, 이름 규칙·보기 라우트 확장, `ensureDataDirs`에 폴더 추가 |

## 테스트 케이스

| ID | 대상 | 기대 결과 | 위치 |
|---|---|---|---|
| TC-TAILOR-01 | 맞춤본 저장소 | 공고당 묶음 1개, r1·r2 번호, 리비전마다 기준 버전, 최신순 목록, 리비전의 공고 | `tailored-repo.test.ts` |
| TC-TAILOR-02 | 공고 삭제 | 맞춤본 행 함께 삭제, 대기 맞춤 작업 취소, 실행 중이면 거부 | `tailored-repo.test.ts` |
| TC-TAILOR-03 | `diffResume` | 수정·추가·삭제·순서, 같으면 [], 기술은 분류로 짝 | `resume-diff.test.ts` |
| TC-TAILOR-04 | 경로 이름·줄 비교 | `경력 > A사 > 성과`, 모르는 id는 그대로, del/same/ins | `resume-diff.test.ts` |
| TC-TAILOR-05 | 새 수치 | 40% 경고, 기준에 있는 3배·날짜 숫자는 통과, '5년차' 경고, 같은 수치 1번만 | `fabrication.test.ts` |
| TC-TAILOR-06 | 새 기술·경력·프로젝트 | Kafka → new_skill, 새 id → new_experience/new_project | `fabrication.test.ts` |
| TC-TAILOR-07 | 사실 칸 되돌림 | 회사·기간·직무·연락처·학력·자격·프로젝트 이름은 기준 값, changed_fact | `fabrication.test.ts` |
| TC-TAILOR-08 | 안내 문구 수치 | 사이트 수정 안내·포트폴리오 문구의 새 수치 경고 | `fabrication.test.ts` |
| TC-TAILOR-09 | 생성 처리기 | 되돌린 내용·변경 내역·경고 저장, 도구 없음, opus, 규칙이 맨 위 | `tailor-task.test.ts` |
| TC-TAILOR-10 | 다듬기 처리기 | 새 실행(세션 없음), 현재 리비전·요청·규칙 포함, r2, 기준 버전과 비교 | `tailor-task.test.ts` |
| TC-TAILOR-11 | 다듬기 실패 | 로그인 오류 그대로, 리비전 안 생김 | `tailor-task.test.ts` |
| TC-TAILOR-12 | 요청 검사 | 분석·기본 이력서 없음, 빈 요청, 2001자, 맞춤본 없음, 진행 중 | `tailor-task.test.ts` |
| TC-TAILOR-13 | 기준 바뀜 | 다시 만들기는 최신 기준, 옛 리비전은 옛 기준 | `tailor-task.test.ts` |
| TC-TAILOR-14 | `buildRevisionPrompt` | 원래 프롬프트·규칙·현재 JSON·요청 순서 | `tailor-task.test.ts` |
| TC-TAILOR-15 | 프롬프트 | 변수 누락 없음, 첫 규칙 '기준 이력서에 없는' | `prompts.test.ts` |
| TC-TAILOR-16 | 작업 종류 등록 | 시간 제한·기본 모델·진행 문구·설정 enum | `tailor-task.test.ts` |
| TC-SUBMIT-01~07 | 제출 서류(D-23) | Task 4 Step 1 | `submitted.test.ts`, `search.test.ts` |
| TC-PDF-01~08 | PDF | Task 5 Step 1 | `pdf.test.ts` |
| TC-STATS-15·16 | 통계 맞춤 | Task 7 Step 1 | `stats.test.ts` |
| TC-TAILOR-E2E-01 | 생성 | 분석된 공고 → 탭 빈 상태 → [맞춤 이력서 만들기] → 진행 표시 → 결과: 경고·되돌림 알림·변경 내역·사이트 수정 안내([복사] → "복사됨")·포트폴리오·미리보기 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-02 | 다듬기 | 빈 입력이면 [수정 요청] 비활성 → 요청 → r2 → 리비전 r1 고르면 r1 내용, 주소 `rev=` | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-03 | PDF | 세 메뉴 모두 `application/pdf`, 파일명 규칙, 경력기술서 없으면 "경력기술서만" 메뉴 없음 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-04 | 기준 바뀜 | 기본 이력서 저장 → 안내 → [최신 기준으로 다시 만들기] → r3, 안내 사라짐 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-05 | 분석 전 | 버튼 비활성 + "분석이 끝나면 만들 수 있습니다" | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-06 | 지원 완료 | 기본값 맞춤 r2·경력기술서 파일 → 저장만 → 지원 기록 "맞춤 이력서 r2" + [보기] PDF, 대시보드 "맞춤 r2", 이력서별 "맞춤 이력서" 묶음 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-07 | 수정 창 | 이력서를 파일로 바꿈 → 라벨 바뀜. 기록만 행 수정 창의 서류 select(맞춤 선택지 없음) | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-08 | 통계 | 맞춤 효과 카드 두 줄·안내, 맞춤 기록 없으면 안내 문구, 서류 버전별 "맞춤 이력서" 묶음 | `13-stats.spec.ts` |
| TC-TAILOR-E2E-09 | 배치 | 폭 1440·1024, 긴 내용에서 글자 잘림·한글 낱말 끊김 없음(스크린샷) | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-10 | 기본 이력서 | [PDF 받기] 세 메뉴, 버전 "직전 버전과 비교", v1 "첫 버전입니다" | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-11 | 공고 삭제 | 맞춤본 있는 미지원 공고 삭제 → 대시보드, 맞춤 탭 주소 404 | `14-tailored.spec.ts` |
| TC-TAILOR-M1 | 실제 `claude`(수동, 병합 뒤 사용자) | 실제 공고 1건 생성 + 다듬기 1회(opus 2회): 형식 통과, 경력 id 유지, 경고가 지나치게 많지 않은지, 사이트 용어가 맞는지 | 수동 |
| TC-TAILOR-M2 | 실제 PDF(수동) | 받은 PDF를 PDF 보기 프로그램에서 열어 한글·줄바꿈·쪽 넘김·파일명 확인 | 수동 |

## Spec 대비 범위

| 설계서 항목 | 이 계획 |
|---|---|
| 7.5 생성·규칙·출력 4종·대화로 다듬기·리비전·PDF | Task 1, 2, 3, 5, 6 |
| 7.4 제출한 이력서·서류 기본값, 수정 창(D-01) | Task 4, 6 (D-23) |
| 7.9 지원 기록의 제출 서류(앞으로의 [지원 완료]) | Task 4, 6 (D-23) |
| 7.10 맞춤 이력서 효과, 서류 버전별 맞춤 묶음 | Task 7 (D-24) |
| 9.4 대화로 다듬기(D-11: 매번 새 실행) | Task 3 (`buildRevisionPrompt`, 4단계에서 재사용) |
| 11 PDF (A4, 글꼴 내장, 템플릿 1종, 파일명, 이력서/경력기술서 선택) | Task 5, 6 (D-25) |
| 5.3 버전 "직전 버전과 비교"(D-07) | Task 6 Step 3 |
| 반목표 "지어내기 금지" | 프롬프트 규칙 + Task 2 되돌림·검사 + Task 6 경고 표시 |

미룬 것: PDF 템플릿 추가, 맞춤 PDF에 경력기술서를 함께 냈는지 따로 기록하는 것(경력기술서 칸은 파일로 고른다), 기술 이름의 부분 일치 오탐 줄이기(예: `Java`가 `JavaScript` 안에 있으면 새 기술로 보지 않음).

주의: 리비전마다 기준 버전이 다를 수 있으므로 변경 내역·경고·"기준 이력서 바뀜" 안내는 **각 리비전의 `baseResumeVersionId`** 를 쓴다.
