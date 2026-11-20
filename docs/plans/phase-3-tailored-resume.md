# Career Flow 3단계(맞춤 이력서 + PDF) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공고 화면에서 맞춤 이력서를 만들고(기준본 대비 변경 내역, 사이트 이력서 수정 안내, 포트폴리오 활용 제안), 대화로 다듬고, PDF로 받을 수 있게 한다. 지원 완료 시 실제로 낸 이력서(기본/맞춤 리비전)를 기록한다. (설계서 7.5, 11장, 9.4)

**Architecture:** 1·2단계의 작업 큐에 `tailor_resume`, `revise_tailored` 작업을 추가한다. 맞춤본은 기본 이력서와 같은 `ResumeContent` 구조로 받아 공고별 리비전으로 저장하고, 변경 내역은 AI 설명이 아니라 **코드가 기준본과 비교해 계산**한다. 지어낸 경력·숫자·기술은 코드 검사로 "확인 필요" 경고를 띄운다. PDF는 HTML 템플릿(한글 웹폰트 내장)을 Playwright로 A4 출력한다.

**Tech Stack:** 1·2단계와 동일 + `pretendard`(npm, 글꼴 파일만 사용)

**Spec:** `docs/spec/product.md` (화면: `docs/spec/screens.md`, 폴더·파일 배치: `docs/spec/architecture.md`)
**선행 계획:** `docs/plans/phase-1-2-mvp.md` (완료되어 있어야 함. 이 계획은 그 Interfaces를 그대로 쓴다)

## Global Constraints

- 1·2단계 계획의 Global Constraints와 "시험 구현에서 확인된 사항" 전부 적용.
- **기본 이력서는 절대 수정하지 않는다.** 맞춤본은 공고별 사본(리비전)으로만 저장.
- **맞춤본은 기본 이력서에 없는 사실을 추가하지 않는다**(프롬프트 최상단 규칙 + 코드 검사 경고). 표현 조정, 순서 변경, 강조, 축소만 허용.
- 새 작업 종류: `tailor_resume`(시간 제한 300초, 도구 없음), `revise_tailored`(300초, 도구 없음). 기본 모델 `opus`.
- (D-11) 대화로 다듬을 때는 이전 세션을 이어 붙이지 않고, 기준 이력서·공고·현재 리비전·요청을 넣은 새 실행으로 처리한다. 새 세션을 연다.
- PDF: A4, 한글 글꼴(Pretendard Regular/Bold) HTML에 내장, 파일명 `이름_회사_포지션_YYYYMMDD.pdf`(경력기술서만이면 `_경력기술서` 접미사). 1차는 템플릿 1종.
- 변경 내역 경로 표기(코드와 프롬프트가 같이 쓰는 약속):
  `summary`, `careerNarrative`, `experiences.<id>`, `experiences.<id>.description`, `experiences.<id>.achievements`, `projects.<id>`, `projects.<id>.achievements`, `projects.<id>.techStack`, `skills.<category>`, `order.experiences`, `order.projects`, `portfolio`

## Review Focus

1. **AI가 성과 수치·기술을 지어냄** (기준본에 없는 "응답속도 40% 개선", 써본 적 없는 "Kafka") — 저장은 하되 화면에 "확인 필요"로 눈에 띄게 표시해야 한다. → Task 2 `flags numbers absent from base`, `flags skills absent from base`.
2. **다듬기 요청이 현재 리비전을 무시함** — 새 실행에는 이전 대화가 없으므로, 프롬프트에 현재 리비전 전체가 들어가야 한다. → Task 3 `revise falls back to a new session when resume fails`.
3. **맞춤본을 만든 뒤 기본 이력서가 새 버전으로 바뀜** — 맞춤본은 만든 시점의 기준 버전에 묶여 있어야 하고, 화면에 "기준 이력서가 바뀌었습니다" 안내가 떠야 한다. → Task 1 `tailored resume keeps its base version`, Task 7 확인 단계.
4. **한글·특수문자 파일명 다운로드** (`홍길동_(주)토스/Server Dev`) — 파일명이 깨지거나 경로 문자가 섞이면 안 된다. → Task 5 `pdfFileName sanitizes`, `content-disposition encodes utf-8 filename`.
5. **이력서 내용에 HTML 특수문자** (`<`, `&`, `"`) — PDF에 그대로 글자로 나와야 하고 태그로 해석되면 안 된다. → Task 5 `escapes html in content`.

---

## File Structure

```
prompts/
  tailor-resume.md
  revise-tailored.md
src/lib/
  domain/types.ts                    (수정) JobType·SubmittedResume 확장
  db/schema.ts                       (수정) tailoredResumes, tailoredRevisions
  ai/queue.ts                        (수정) JOB_TIMEOUT_MS 항목 추가
  ai/revision.ts                     buildRevisionPrompt (4단계도 사용, D-11)
  ai/tasks/tailor-schemas.ts         TailorOutput
  ai/tasks/tailor-resume.ts          tailor_resume / revise_tailored 처리기
  ai/tasks/index.ts                  (수정) 처리기 등록
  resume/diff.ts                     diffResume
  resume/fabrication.ts              checkFabrication
  tailored/repo.ts                   맞춤본·리비전 저장소
  applications/repo.ts               (수정) markApplied 제출 이력서, resolveSubmittedResume
  pdf/template.ts                    renderResumeHtml
  pdf/fonts.ts                       글꼴 CSS(base64)
  pdf/render.ts                      renderPdf, pdfFileName, contentDisposition
src/app/
  api/pdf/tailored/[revisionId]/route.ts
  api/pdf/base/[versionId]/route.ts
  postings/[id]/TailoredTab.tsx
  postings/[id]/ApplyForm.tsx        (수정) 제출 이력서 선택
  resume/page.tsx                    (수정) 기본 이력서 PDF 버튼
tests/
  resume-diff.test.ts, fabrication.test.ts, tailor-task.test.ts, tailored-repo.test.ts, pdf.test.ts, submitted-resume.test.ts
```

---

### Task 1: 데이터 구조 확장 (맞춤본 테이블, 작업 종류, 제출 이력서)

**Files:**
- Modify: `src/lib/domain/types.ts`, `src/lib/db/schema.ts`, `src/lib/ai/queue.ts`
- Create: `src/lib/tailored/repo.ts`, 마이그레이션(`npx drizzle-kit generate --name tailored`), `tests/tailored-repo.test.ts`

**Interfaces:**
- Consumes: `ResumeContent`, `getLatestResume`, `getPosting`
- Produces (`types.ts`):
  - `JOB_TYPES`에 `'tailor_resume'`, `'revise_tailored'` 추가 (`JOB_TIMEOUT_MS`에 각각 `300_000`, `DEFAULT_MODELS`에 각각 `'opus'`)
  - `SubmittedResume = { kind: 'base'; versionId: number | null } | { kind: 'tailored'; tailoredRevisionId: number }`
- Produces (`schema.ts`):
  - `tailoredResumes`: id, postingId(fk, **unique**, **on delete cascade** — 공고 삭제 시 함께 삭제, D-02 — 공고당 맞춤본 묶음 1개), baseResumeVersionId(fk), createdAt
  - `tailoredRevisions`: id, tailoredResumeId(fk, on delete cascade), revNo(int), baseResumeVersionId(fk — 이 리비전을 만들 때의 기준 버전), content(json `ResumeContent`), changes(json `ResumeChange[]`), changeReasons(json), warnings(json `FabricationWarning[]`), siteGuide(json), portfolioTips(json), notes(text), userRequest(text?), jobId(fk), createdAt — (tailoredResumeId, revNo) unique
- Produces (`tailored/repo.ts`):
  - `getTailoredForPosting(postingId, db?): { id; postingId; baseResumeVersionId; createdAt } | null`
  - `createTailored(postingId, baseResumeVersionId, db?): number` — 이미 있으면 예외
  - `rebaseTailored(tailoredResumeId, baseResumeVersionId, db?)` — 기준 버전 변경(기존 리비전은 유지)
  - `addRevision(tailoredResumeId, rev: NewRevision, db?): { id; revNo }` — revNo = 최대+1
  - `getRevision(id, db?)`, `getLatestRevision(tailoredResumeId, db?)`, `listRevisions(tailoredResumeId, db?)` (최신순, 요약 필드만)
  - `type NewRevision = { baseResumeVersionId: number; content: ResumeContent; changes: ResumeChange[]; changeReasons: {path:string;reason:string}[]; warnings: FabricationWarning[]; siteGuide: SiteGuideItem[]; portfolioTips: PortfolioTip[]; notes: string; userRequest?: string; jobId: number }` (타입은 Task 2·3에서 정의, 이 Task에서는 import만)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('tailored resume keeps its base version and numbers revisions', () => {
  const db = makeTestDb();
  const v1 = saveResumeVersion(emptyResume(), undefined, db);
  const { postingId } = registerPosting({ pastedText: '공고' }, db);
  const tid = createTailored(postingId, v1.id, db);
  saveResumeVersion({ ...emptyResume(), summary: 'v2' }, undefined, db);
  expect(getTailoredForPosting(postingId, db)!.baseResumeVersionId).toBe(v1.id);
  const r1 = addRevision(tid, rev(), db); const r2 = addRevision(tid, rev({ userRequest: '짧게' }), db);
  expect([r1.revNo, r2.revNo]).toEqual([1, 2]);
  expect(getLatestRevision(tid, db)!.userRequest).toBe('짧게');
  expect(() => createTailored(postingId, v1.id, db)).toThrow();
});
```
(`rev()`는 테스트 헬퍼: 빈 리비전 값을 만든다.)

- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현 + 마이그레이션 생성. **Step 4:** PASS + 전체 테스트 PASS.
- [ ] **Step 5:** 커밋 `feat: tailored resume tables and repo`.

---

### Task 2: 변경 내역 계산과 "지어낸 내용" 검사

**Files:**
- Create: `src/lib/resume/diff.ts`, `src/lib/resume/fabrication.ts`, `tests/resume-diff.test.ts`, `tests/fabrication.test.ts`

**Interfaces:**
- Produces:

```ts
type ResumeChange = {
  path: string;                                   // Global Constraints의 경로 표기
  kind: 'modified' | 'added' | 'removed' | 'reordered';
  before: string | string[] | null;
  after: string | string[] | null;
};
function diffResume(base: ResumeContent, tailored: ResumeContent): ResumeChange[];

type FabricationWarning = {
  kind: 'new_experience' | 'new_project' | 'changed_fact' | 'new_skill' | 'new_number';
  path: string;
  detail: string;                                 // 화면에 그대로 보여줄 한국어 문장
};
function checkFabrication(base: ResumeContent, tailored: ResumeContent): FabricationWarning[];
```

- 규칙:
  - `diffResume`: 경험·프로젝트는 `id`로 짝지음. 문자열 필드는 다르면 `modified`, 배열(성과·기술)은 내용이 다르면 `modified`(before/after 배열), 기준본에만 있으면 `removed`, 맞춤본에만 있으면 `added`. 남은 항목들의 순서가 다르면 `order.experiences`/`order.projects`에 `reordered`(before/after는 id 배열). `skills`는 category로 짝지음. `basics`, `education`, `certifications`는 비교 대상 아님(검사에서 다룸).
  - `checkFabrication`:
    - 기준본에 없는 경험 id → `new_experience`; 프로젝트 id → `new_project`
    - 경험의 `company`, `start`, `end`, `role` 변경, `basics`/`education`/`certifications` 변경 → `changed_fact`
    - 맞춤본의 기술 이름(`skills[].items`, `projects[].techStack`)이 기준본 전체 텍스트(모든 문자열 필드를 이어붙여 소문자화)에 없으면 → `new_skill`
    - 맞춤본 문장에 있는 숫자 표현(정규식 `\d[\d,.]*\s*(%|배|건|명|억|만|천|ms|초|분|시간|개|x)?`)이 기준본 전체 텍스트에 없으면 → `new_number` (같은 숫자 중복 경고는 1번만)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('detects modified achievements, removed project and reorder', () => {
  const base = resume({ experiences: [exp('exp-1', ['A 개선']), exp('exp-2', ['B 구축'])], projects: [prj('prj-1')] });
  const t = resume({ experiences: [exp('exp-2', ['B 구축']), exp('exp-1', ['A 개선 (결제)'])], projects: [] });
  expect(diffResume(base, t)).toEqual(expect.arrayContaining([
    { path: 'experiences.exp-1.achievements', kind: 'modified', before: ['A 개선'], after: ['A 개선 (결제)'] },
    { path: 'projects.prj-1', kind: 'removed', before: expect.any(String), after: null },
    { path: 'order.experiences', kind: 'reordered', before: ['exp-1', 'exp-2'], after: ['exp-2', 'exp-1'] },
  ]));
});
test('identical resumes have no changes', () => { expect(diffResume(base, structuredClone(base))).toEqual([]); });
test('flags numbers absent from base', () => {
  const w = checkFabrication(resume({ experiences: [exp('exp-1', ['응답속도 개선'])] }),
                             resume({ experiences: [exp('exp-1', ['응답속도 40% 개선'])] }));
  expect(w).toEqual([expect.objectContaining({ kind: 'new_number', path: 'experiences.exp-1.achievements' })]);
});
test('numbers already in base are fine', () => { /* 기준 '3배 향상' → 맞춤 '처리량 3배 향상' → [] */ });
test('flags skills absent from base', () => { /* 기준 어디에도 Kafka 없음, 맞춤 skills에 Kafka → new_skill */ });
test('flags new experience and changed dates', () => { /* id exp-9 추가 → new_experience, exp-1.start 변경 → changed_fact */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: resume diff and fabrication checks`.

---

### Task 3: 맞춤 이력서 작업 (생성·다듬기)

**Files:**
- Create: `prompts/tailor-resume.md`, `prompts/revise-tailored.md`, `src/lib/ai/revision.ts`, `src/lib/ai/tasks/tailor-schemas.ts`, `src/lib/ai/tasks/tailor-resume.ts`, `tests/tailor-task.test.ts`
- Modify: `src/lib/ai/tasks/index.ts`, `src/lib/ai/prompt.ts`(템플릿 이름 추가), `src/lib/postings/repo.ts`(아래 액션 함수)

**Interfaces:**
- Consumes: `AiRunner`, `AiError`, `renderPrompt`, `getModelFor`, `getPosting`, `getLatestAnalysis`, `getResumeVersion`, `getLatestResume`, Task 1 repo, Task 2 `diffResume`/`checkFabrication`
- Produces (`tailor-schemas.ts`):

```ts
SiteGuideItem = z.object({ field: z.string(), action: z.enum(['replace','add','remove','reorder']),
  current: z.string().nullable(), suggested: z.string(), reason: z.string() });
PortfolioTip = z.object({ title: z.string(), emphasis: z.string() });
TailorOutput = z.object({
  resume: ResumeContent,
  changeReasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  siteGuide: z.array(SiteGuideItem),
  portfolioTips: z.array(PortfolioTip),
  notes: z.string(),
});
```

- Produces (`revision.ts`, D-11):

```ts
/** 다듬기용 새 실행 프롬프트. 원래 작업의 입력(기준 이력서·공고 등)과 현재 리비전 JSON, 요청을 모두 넣는다.
 *  이전 세션을 이어 붙이지 않는다(--resume 안 씀). 4단계 면접 준비 추가 요청도 이 함수를 쓴다. */
function buildRevisionPrompt(input: { basePrompt: string; currentJson: unknown; request: string }): string;
```
- Produces (작업 함수, `postings/repo.ts`):
  - `requestTailoredResume(postingId, opts?: { rebase?: boolean }, db?): number /*jobId*/` — 분석이 없으면 예외("공고 분석이 끝난 뒤 만들 수 있습니다"), 진행 중 같은 작업이 있으면 그 jobId 반환. payload `{ postingId, rebase }`.
  - `requestTailoredRevision(postingId, request: string, db?): number` — 맞춤본이 없으면 예외, 요청이 비면 예외
- 처리기:
  - `tailor_resume` `{ postingId, rebase? }`: 맞춤본 없으면 `createTailored(postingId, 최신 기본 이력서 id)`, 있으면 그 기준 버전 사용. `rebase`면 Task 1의 `rebaseTailored(tailoredResumeId, 최신 기본 이력서 id)`로 기준 버전을 바꾼 뒤 생성(결과는 다음 리비전 번호로 저장). 프롬프트 변수: 기준 이력서 JSON, 공고 본문, 분석 결과 JSON, 공고 사이트 표시명, 경로 표기 규칙. → `TailorOutput` 검증 → `diffResume`/`checkFabrication` 계산 → `addRevision`.
  - `revise_tailored` `{ postingId, request }`: 최신 리비전 기준. `buildRevisionPrompt`로 기준 이력서·공고·현재 리비전·요청을 모두 넣은 새 실행(`resumeSessionId` 없음). 결과는 **기준 이력서와 비교**해 변경 내역·경고 계산(리비전끼리 비교 아님). `userRequest` 저장.
- 프롬프트 필수 규칙(최상단): "기준 이력서에 없는 경력·프로젝트·수치·기술·자격을 추가하지 않는다. 바꿀 수 있는 것은 표현, 순서, 강조, 축소뿐이다. 모르면 바꾸지 않는다." / 경험·프로젝트 `id`는 기준본 그대로 유지 / `changeReasons.path`는 경로 표기 규칙을 따른다 / `siteGuide`는 공고가 올라온 사이트의 이력서 화면에서 고칠 항목을 사이트 용어로 / 한국어.

- [ ] **Step 1: 실패하는 테스트** (가짜 runner: 요청을 기록, 설정된 출력 반환 또는 오류)

```ts
test('tailor_resume creates tailored set on latest base and stores computed diff and warnings', async () => {
  // 기본 이력서(성과 '응답속도 개선'), 분석 완료 공고 준비. 가짜 출력: 성과를 '응답속도 40% 개선'으로 바꾼 TailorOutput
  await handlers.tailor_resume({ jobId, payload: { postingId }, runner, workDir, db });
  const t = getTailoredForPosting(postingId, db)!;
  const r = getLatestRevision(t.id, db)!;
  expect(r.changes).toEqual([expect.objectContaining({ path: 'experiences.exp-1.achievements', kind: 'modified' })]);
  expect(r.warnings).toEqual([expect.objectContaining({ kind: 'new_number' })]);
  expect(runner.lastReq.tools).toEqual([]);
  expect(runner.lastReq.prompt).toContain('기준 이력서에 없는');
});
test('revise runs a fresh call with the current revision and request', async () => {
  // lastReq.resumeSessionId 없음, lastReq.prompt에 현재 리비전 JSON·요청·'기준 이력서에 없는' 규칙 포함, 리비전 2 생성, userRequest 저장
});
test('revise propagates auth error without creating a revision', async () => { /* AiError('auth') → 그대로 reject, 리비전 없음 */ });
test('requestTailoredResume requires analysis', () => { /* 분석 없는 공고 → throw '공고 분석이 끝난 뒤' */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체 테스트.
- [ ] **Step 5: 실제 CLI 수동 확인:** 실제 기본 이력서와 실제 공고 1건으로 `tailor_resume` 실행 → 스키마 통과, 경험 id 유지, 경고가 합리적인지(오탐 정도) 확인. 다듬기 1회("요약을 3줄로") 실행해 현재 리비전을 바탕으로 바뀌는지 확인.
- [ ] **Step 6:** 커밋 `feat: tailor and revise resume tasks`.

---

### Task 4: 제출 이력서 기록

**Files:**
- Modify: `src/lib/applications/repo.ts`, `src/lib/search/dashboard.ts`
- Create: `tests/submitted-resume.test.ts`

**Interfaces:**
- Consumes: `getTailoredForPosting`, `getLatestRevision`, `getRevision`, `getResumeVersion`, `getLatestResume`
- Produces:
  - `markApplied` 입력에 `submittedResume?: SubmittedResume` 추가. 생략 시 기본값: 이 공고의 맞춤본 최신 리비전이 있으면 `{kind:'tailored', tailoredRevisionId}`, 없으면 `{kind:'base', versionId: 최신 기본 이력서 id}`.
  - `resolveSubmittedResume(sr: SubmittedResume, db?): { label: string; content: ResumeContent } | null` — label 예: `기본 이력서 v3`, `맞춤 이력서 r2`.
  - `updateApplication` patch에 `submittedResume?: SubmittedResume` 추가 — 지원 기록 수정 창에서 제출한 이력서를 바꿀 수 있다 (D-01).
  - (지난 기록·제출 서류 계획 `phase-2-past-records.md` 이후) 같은 창에서 `submittedDocs`(종류별 서류 **파일 이름**, `data/documents/` 폴더 목록에서 고름. 경력기술서·포트폴리오는 "없음"(`DOC_NONE`)도 고를 수 있고, select 선택지는 직접 입력 표와 같다 — 지난 기록 계획 Task 8)도 고칠 수 있게 `updateApplication` patch에 `submittedDocs?: SubmittedDocs`를 더한다. 가져온 기록의 `submittedResume` `{kind:'imported'}`는 그대로 유지한다. 대시보드 라벨 우선순위: 맞춤 → 기본 → 이력서 파일 → 모름.
  - `searchApplications`의 `resumeLabel`·`resumeBaseVersionNo`가 맞춤본도 채운다: 맞춤 리비전이면 `"맞춤 r2"`와 그 리비전의 `baseResumeVersionId`의 버전 번호(대시보드 "이력서별" 보기가 기준 버전으로 묶는다).
  - `listSubmittableResumes(postingId, db?): { value: SubmittedResume; label: string }[]` — 최신 기본 이력서 + 이 공고 맞춤본 리비전 전부(최신순).

- [ ] **Step 1: 실패하는 테스트:** 맞춤본이 있는 공고 `markApplied({postingId})` → `submittedResume.kind === 'tailored'`, 최신 리비전 id; 없는 공고 → `base`; 명시 지정 시 그대로; `resolveSubmittedResume`가 내용과 라벨 반환; 맞춤 r2(기준 v2)로 지원한 행은 `searchApplications` 결과에서 `resumeLabel: '맞춤 r2', resumeBaseVersionNo: 2`.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: record submitted resume revision on apply`.

---

### Task 5: PDF 출력

**Files:**
- Create: `src/lib/pdf/fonts.ts`, `src/lib/pdf/template.ts`, `src/lib/pdf/render.ts`, `src/app/api/pdf/tailored/[revisionId]/route.ts`, `src/app/api/pdf/base/[versionId]/route.ts`, `tests/pdf.test.ts`

**Interfaces:**
- Consumes: `ResumeContent`, `getRevision`, `getTailoredForPosting`, `getPosting`, `getCompany`, `getResumeVersion`
- Produces:
  - `fontFaceCss(): string` — `node_modules/pretendard/dist/web/static/woff2/Pretendard-{Regular,Bold}.woff2`를 base64로 읽어 `@font-face` 두 개(한 번 읽고 메모리에 보관). 실제 파일 경로는 설치된 패키지에서 확인.
  - `type PdfPart = 'resume' | 'narrative' | 'both'`
  - `renderResumeHtml(content: ResumeContent, opts: { part: PdfPart; fontCss?: string }): string` — 순수 함수, 모든 텍스트 HTML 이스케이프. `resume` = 기본 정보·요약·경력·프로젝트·기술·학력·자격·포트폴리오, `narrative` = 경력기술서, `both` = 둘 다(경력기술서는 새 페이지에서 시작, `page-break-before`).
  - `renderPdf(html: string): Promise<Buffer>` — `chromium.launch()`(영구 프로필·잠금과 별개) → `page.setContent(html, { waitUntil: 'load' })` → `page.pdf({ format: 'A4', printBackground: true, margin: 15mm 사방 })`.
  - `pdfFileName(i: { name: string; company?: string; position?: string; date: Date; part: PdfPart }): string` — 각 조각에서 `\ / : * ? " < > |`와 공백 제거, 빈 조각은 생략, `_` 연결, `narrative`면 `_경력기술서` 접미사, `.pdf`.
  - `contentDisposition(fileName: string): string` — `attachment; filename="resume.pdf"; filename*=UTF-8''<encodeURIComponent>`
  - `GET /api/pdf/tailored/[revisionId]?part=both|resume|narrative` (기본 `both`), `GET /api/pdf/base/[versionId]?part=...` → `application/pdf`. 없는 id는 404.
- 템플릿 디자인: 흑백 위주 단정한 1단 레이아웃, 이름 크게, 섹션 제목 + 얇은 구분선, 경력 항목은 "회사 · 직무 · 기간" 한 줄 + 설명 + 성과 글머리표. 세부 스타일은 구현자 재량.

- [ ] **Step 1: 실패하는 테스트**

```ts
test('escapes html in content', () => {
  const html = renderResumeHtml({ ...sample, summary: '<script>x</script> & "따옴표"' }, { part: 'resume' });
  expect(html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; &quot;따옴표&quot;');
  expect(html).not.toContain('<script>x');
});
test('part selects sections', () => {
  expect(renderResumeHtml(sample, { part: 'resume' })).not.toContain(sample.careerNarrative);
  expect(renderResumeHtml(sample, { part: 'narrative' })).not.toContain(sample.experiences[0].company);
  expect(renderResumeHtml(sample, { part: 'both' })).toContain('page-break-before');
});
test('pdfFileName sanitizes', () => {
  expect(pdfFileName({ name: '홍길동', company: '(주)토스/Bank', position: 'Server Dev', date: new Date('2026-11-16T09:00:00'), part: 'both' }))
    .toBe('홍길동_(주)토스Bank_ServerDev_20261116.pdf');
  expect(pdfFileName({ name: '홍길동', date: new Date('2026-11-16T09:00:00'), part: 'narrative' }))
    .toBe('홍길동_20261116_경력기술서.pdf');
});
test('content-disposition encodes utf-8 filename', () => {
  expect(contentDisposition('홍길동_토스.pdf')).toBe(`attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent('홍길동_토스.pdf')}`);
});
test('renderPdf produces a PDF with embedded font', async () => {
  const buf = await renderPdf(renderResumeHtml(sample, { part: 'both', fontCss: fontFaceCss() }));
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(5_000);
}, 60_000);
```

- [ ] **Step 2:** `npm i pretendard` 후 FAIL 확인. **Step 3:** 구현. **Step 4:** PASS.
- [ ] **Step 5: 확인:** 실제 기본 이력서로 `/api/pdf/base/<id>` 받아 열어 보고 한글·줄바꿈·페이지 넘김이 정상인지, 파일명이 규칙대로인지 확인.
- [ ] **Step 6:** 커밋 `feat: resume pdf rendering and download routes`.

---

### Task 6: 맞춤 이력서 화면

**Files:**
- Create: `src/app/postings/[id]/TailoredTab.tsx`
- Modify: `src/app/postings/[id]/page.tsx`(탭 추가, 순서: 분석 / 맞춤 이력서 / 공고 원문 / 지원 기록), `src/app/_actions/tailored.ts`(새로), `src/app/_actions/applications.ts`, `src/app/postings/[id]/ApplyForm.tsx`, `src/app/resume/page.tsx`

**Interfaces:**
- Consumes: `requestTailoredResume`, `requestTailoredRevision`, `getTailoredForPosting`, `listRevisions`, `getRevision`, `latestJobFor`, `listSubmittableResumes`, `markApplied`, `getLatestResume`, PDF 라우트, 1·2단계 `JobStatus` 컴포넌트
- Produces (서버 액션): `requestTailoredResumeAction(postingId)`, `requestTailoredRevisionAction(postingId, request)`

- [ ] **Step 1: 탭 구성**
  - 맞춤본 없음: 설명 한 줄 + [맞춤 이력서 만들기] (분석 전이면 비활성 + "분석이 끝나면 만들 수 있습니다").
  - 진행 중: `JobStatus`("맞춤 이력서 작성 중… 보통 1~3분").
  - 결과:
    - 상단: 리비전 선택(`r3 · 11/16 14:20 · "요약을 3줄로"`), [PDF 받기 ▾ (이력서+경력기술서 / 이력서만 / 경력기술서만)].
    - **확인 필요 경고**(있으면 맨 위, 노란 배경): `detail` 목록 + "기준 이력서에 없는 내용일 수 있습니다. 사실과 다르면 다듬기로 고치세요."
    - **기준 이력서가 바뀜 안내**: 맞춤본의 기준 버전 ≠ 최신 기본 이력서 버전이면 "이 맞춤본은 기본 이력서 v2 기준입니다(현재 v3)." + [최신 기준으로 다시 만들기] → `requestTailoredResume(postingId, { rebase: true })`.
    - **변경 내역**: 경로별 이전/이후 비교(삭제는 취소선, 추가는 강조), 각 항목 아래 AI가 준 이유(`changeReasons`를 path로 매칭, 없으면 생략).
    - **사이트 이력서 수정 안내**: 공고 사이트명 제목 + 항목 표(항목 / 할 일 / 현재 → 제안 / 이유), 제안 문구 옆 [복사].
    - **포트폴리오 활용**: 제목·강조점 목록.
    - **맞춤 이력서 미리보기**: `renderResumeHtml` 결과를 `iframe srcDoc`으로.
    - 하단 **다듬기 입력창**: 여러 줄 입력 + [수정 요청]. 진행 중엔 비활성.
- [ ] **Step 2: 지원 완료 폼**에 "제출한 이력서" 선택(`listSubmittableResumes`, 기본값은 `markApplied`의 기본 규칙과 같게). 지원 기록 탭에 제출 이력서 라벨 표시.
- [ ] **Step 3: 기본 이력서 화면**에 [PDF 받기 ▾] 추가(현재 버전). 버전 기록에 "직전 버전과 비교" 보기 추가 — `diffResume(이전, 선택)` 결과를 맞춤 이력서 변경 내역과 같은 모양으로 표시. 같은 내용 저장 판단도 `diffResume` 결과가 비었는지로 바꾼다 (D-07).
- [ ] **Step 4: 확인 (실제 사용):** 분석된 공고에서 맞춤본 생성 → 경고·변경 내역·사이트 안내 표시 → 다듬기 2회 → 리비전 3개 → 리비전 2 선택 후 PDF 받기 → 지원 완료에서 "맞춤 이력서 r2" 선택 → 지원 기록에 표시. 기본 이력서를 한 줄 고쳐 저장 → 맞춤 탭에 "기준 이력서가 바뀜" 안내.
- [ ] **Step 5:** 커밋 `feat: tailored resume tab, revisions, pdf download`.

---

## Spec 대비 범위

| 설계서 항목 | 이 계획 |
|---|---|
| 7.5 생성·규칙·출력 4종·대화로 다듬기·리비전·PDF | Task 1, 2, 3, 5, 6 |
| 7.4 제출한 이력서 버전 기본값 | Task 4, 6 |
| 9.4 대화로 다듬기(D-11: 매번 새 실행) | Task 3 (`buildRevisionPrompt`, 4단계에서 재사용) |
| 11 PDF (A4, 글꼴 내장, 템플릿 1종, 파일명, 이력서/경력기술서 선택) | Task 5, 6 |
| 반목표 "지어내기 금지" | 프롬프트 규칙 + Task 2 코드 검사 + Task 6 경고 표시 |

미룬 것: PDF 템플릿 추가.

주의: "다시 만들기" 이후 리비전마다 기준 버전이 다를 수 있으므로, 변경 내역·경고·PDF 화면의 "기준 버전" 표기는 맞춤본 묶음이 아니라 **각 리비전의 `baseResumeVersionId`** 를 쓴다.
