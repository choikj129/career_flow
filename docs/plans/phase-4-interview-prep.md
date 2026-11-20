# Career Flow 4단계(면접 준비) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공고 화면에서 면접 차수별 면접 준비 자료(회사 조사, 팀 과제, 예상 질문과 답변 소재, 부족한 점 대응, 역질문, 체크리스트, 출처)를 만들고, 대화로 추가 요청할 수 있게 한다. (설계서 7.6)

**Architecture:** 작업 큐에 `prepare_interview`, `revise_interview`를 추가한다. Claude Code에 웹 검색·웹 페이지 읽기만 허용해 회사를 조사하게 하고, 결과를 정해진 JSON 구조로 받아 차수별 리비전으로 저장한다. 입력 이력서는 **실제 제출한 이력서**(3단계 `resolveSubmittedResume`)를 쓴다. 추가 요청은 3단계의 `buildRevisionPrompt`로 매번 새 실행한다(D-11).

**Tech Stack:** 1~3단계와 동일

**Spec:** `docs/spec/product.md` (화면: `docs/spec/screens.md`, 폴더·파일 배치: `docs/spec/architecture.md`)
**선행 계획:** 1·2단계, 3단계 계획 (완료되어 있어야 함)

## Global Constraints

- 1~3단계 Global Constraints 전부 적용.
- 새 작업 종류: `prepare_interview`(시간 제한 **600초**), `revise_interview`(600초). 허용 도구: `Read,WebSearch,WebFetch` — 그 외 금지. 기본 모델 `opus`.
- 면접 준비는 지원 상태와 무관하게 만들 수 있다. 입력 이력서 우선순위: ① 지원 기록의 제출 이력서 → ② 이 공고의 최신 맞춤 리비전 → ③ 최신 기본 이력서. 화면에 어떤 이력서 기준인지 표시.
  - (3단계 재설계 1, D-23·D-26) 제출 이력서가 서류 파일(`file`·`imported`)이면 앱은 PDF 내용을 읽지 않으므로 `resolveSubmittedResume`이 null이다. 맞춤본(`tailored`)·기본 서류(`kit`)는 앱 JSON이 아니라 키트 md이므로 역시 null이다. 4단계 설계 때 "제출한 맞춤본·기본 서류의 md를 그대로 프롬프트에 넣는" 경로를 더할지 정한다. 그 전까지는 ②(이제는 맞춤본 md) → ③ 순서로 쓴다. 화면 라벨 예: "기준 이력서: 맞춤 이력서 r2 (B3)".
- 차수 라벨은 자유 입력(기본 "1차"), 공고 하나에 여러 차수 가능. 같은 라벨이 이미 있으면 새로 만들지 않고 그 준비 자료로 이동.
- 출처 URL은 `http`/`https`만 저장(그 외는 버림), 같은 URL 중복 제거. 회사 조사 문장에는 근거 출처가 있어야 하고, 찾지 못한 정보는 지어내지 말고 "확인하지 못함"으로 적는다(프롬프트 규칙).

## Review Focus

1. **잘 알려지지 않은 회사라 검색 결과가 거의 없음** — 빈 배열과 "확인하지 못함" 표기로도 스키마를 통과해야 하고, 화면이 빈 섹션에서 깨지지 않아야 한다. → Task 2 `accepts sparse research output`, Task 3 확인 단계.
2. **AI가 이상한 출처를 넣음** (`javascript:` URL, 같은 링크 여러 번) — 저장 전에 걸러야 한다. → Task 2 `sanitizes sources`.
3. **아직 지원 전인데 면접 준비를 먼저 만듦** — 제출 이력서가 없으므로 맞춤본/기본 이력서로 대체하고 그 사실을 표시해야 한다. → Task 2 `picks resume by priority`.
4. **조사가 10분을 넘김** — 시간 초과로 실패 처리되고 [다시 시도]가 보여야 한다(1·2단계 큐 동작 재사용). → Task 2 `uses 600s timeout and web tools only`.
5. **같은 차수 라벨로 두 번 요청** — 중복 생성하지 않고 기존 준비 자료로 안내해야 한다. → Task 1 `same round label returns existing prep`.

---

## File Structure

```
prompts/
  prepare-interview.md
  revise-interview.md
src/lib/
  domain/types.ts                    (수정) JobType 추가
  db/schema.ts                       (수정) interviewPreps, interviewRevisions
  ai/queue.ts                        (수정) JOB_TIMEOUT_MS
  ai/tasks/interview-schemas.ts      InterviewPrep
  ai/tasks/prepare-interview.ts      처리기 2종
  ai/tasks/index.ts                  (수정)
  interview/repo.ts                  준비 자료·리비전 저장소, 요청 함수
  interview/sources.ts               sanitizeSources
src/app/
  postings/[id]/InterviewTab.tsx
  postings/[id]/page.tsx             (수정) 탭 추가
  interview/[prepId]/print/page.tsx  인쇄용 화면
tests/
  interview-repo.test.ts, interview-task.test.ts
```

---

### Task 1: 데이터 구조와 저장소

**Files:**
- Modify: `src/lib/domain/types.ts`, `src/lib/db/schema.ts`, `src/lib/ai/queue.ts`
- Create: `src/lib/interview/repo.ts`, 마이그레이션(`--name interview`), `tests/interview-repo.test.ts`

**Interfaces:**
- Produces:
  - `JOB_TYPES`에 `'prepare_interview'`, `'revise_interview'` 추가, `JOB_TIMEOUT_MS` 각 `600_000`, `DEFAULT_MODELS` 각 `'opus'`
  - `interviewPreps`: id, postingId(fk, **on delete cascade**, D-02), roundLabel(text), createdAt — (postingId, roundLabel) unique
  - `interviewRevisions`: id, interviewPrepId(fk, on delete cascade), revNo, content(json `InterviewPrep`), resumeLabel(text — 입력으로 쓴 이력서 라벨), userRequest?, jobId(fk), createdAt — (interviewPrepId, revNo) unique
  - `interview/repo.ts`:
    - `listInterviewPreps(postingId, db?): { id; roundLabel; createdAt; latestRevNo: number | null }[]`
    - `getInterviewPrep(id, db?)`, `findPrepByRound(postingId, roundLabel, db?)`
    - `createInterviewPrep(postingId, roundLabel, db?): number` — 라벨 앞뒤 공백 제거, 빈 라벨은 "1차"
    - `addInterviewRevision(prepId, rev: { content; resumeLabel; userRequest?; jobId }, db?): { id; revNo }`
    - `getLatestInterviewRevision(prepId, db?)`, `listInterviewRevisions(prepId, db?)`
    - `requestInterviewPrep(postingId, roundLabel, db?): { prepId: number; jobId: number | null; existing: boolean }` — 같은 라벨이 있으면 `{ existing: true, jobId: null }`, 없으면 생성 후 `prepare_interview` 작업 `{ prepId }`
    - `requestInterviewRevision(prepId, request, db?): number` — 리비전이 없거나 요청이 비면 예외

- [ ] **Step 1: 실패하는 테스트**

```ts
test('same round label returns existing prep', () => {
  const db = makeTestDb(); const { postingId } = registerPosting({ pastedText: '공고' }, db);
  const a = requestInterviewPrep(postingId, ' 1차 ', db);
  const b = requestInterviewPrep(postingId, '1차', db);
  expect(a.existing).toBe(false); expect(a.jobId).not.toBeNull();
  expect(b).toEqual({ prepId: a.prepId, jobId: null, existing: true });
  expect(requestInterviewPrep(postingId, '2차 임원', db).prepId).not.toBe(a.prepId);
  expect(listInterviewPreps(postingId, db).map(p => p.roundLabel)).toEqual(['1차', '2차 임원']);
});
test('revisions are numbered per prep', () => { /* addInterviewRevision 두 번 → revNo 1,2; latest의 userRequest 확인 */ });
test('requestInterviewRevision requires an existing revision and text', () => { /* 리비전 없음 → throw, 빈 요청 → throw */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현 + 마이그레이션. **Step 4:** PASS. **Step 5:** 커밋 `feat: interview prep tables and repo`.

---

### Task 2: 면접 준비 작업 (조사·생성·다듬기)

**Files:**
- Create: `prompts/prepare-interview.md`, `prompts/revise-interview.md`, `src/lib/ai/tasks/interview-schemas.ts`, `src/lib/ai/tasks/prepare-interview.ts`, `src/lib/interview/sources.ts`, `tests/interview-task.test.ts`
- Modify: `src/lib/ai/tasks/index.ts`, `src/lib/ai/prompt.ts`

**Interfaces:**
- Consumes: `buildRevisionPrompt`, `renderPrompt`, `getModelFor`, `JOB_TIMEOUT_MS`, `getPosting`, `getCompany`, `getLatestAnalysis`, `getApplicationForPosting`, `resolveSubmittedResume`, `getTailoredForPosting`, `getLatestRevision`, `getLatestResume`, Task 1 repo
- Produces (`interview-schemas.ts`):

```ts
Source = z.object({ title: z.string(), url: z.string() });
InterviewPrep = z.object({
  company: z.object({
    overview: z.string(),                      // 사업·주요 제품 요약, 못 찾으면 "확인하지 못함"
    products: z.array(z.string()),
    size: z.string().nullable(),               // 인원·매출·투자 단계 등
    recentNews: z.array(z.object({ title: z.string(), date: z.string().nullable(), summary: z.string(), url: z.string() })),
    techStack: z.array(z.string()),
    techBlog: z.array(Source),
  }),
  teamChallenges: z.array(z.string()),          // 공고에서 읽히는 팀의 과제
  contributions: z.array(z.string()),           // 내가 기여할 수 있는 점 (이력서 근거)
  questions: z.array(z.object({
    category: z.enum(['technical', 'experience', 'behavioral', 'company']),
    question: z.string(),
    why: z.string(),                            // 이 질문이 나올 이유
    answerPoints: z.array(z.string()),          // 내 경력에서 꺼낼 답변 소재
    relatedResumeItems: z.array(z.string()),    // 경험/프로젝트 id
  })),
  gapStrategies: z.array(z.object({ gap: z.string(), strategy: z.string() })),
  questionsToAsk: z.array(z.string()),
  checklist: z.array(z.string()),
  sources: z.array(Source),
});
QUESTION_CATEGORY_LABELS = { technical: '기술', experience: '경력·프로젝트', behavioral: '인성·협업', company: '회사·지원동기' }
```

- Produces (`sources.ts`): `sanitizeSources(p: InterviewPrep): InterviewPrep` — `sources`, `techBlog`, `recentNews[].url`에서 http(s)가 아닌 항목 제거(뉴스는 url만 비우지 말고 항목 제거), `sources`·`techBlog`는 URL 기준 중복 제거.
- Produces (`prepare-interview.ts`):
  - `pickInterviewResume(postingId, db?): { label: string; content: ResumeContent } | null` — Global Constraints의 우선순위. 라벨 예: `제출한 맞춤 이력서 r2`, `맞춤 이력서 r3 (아직 지원 전)`, `기본 이력서 v4`. 하나도 없으면 null → 처리기는 `AiError('cli', '기본 이력서를 먼저 등록하세요.')`.
  - `prepare_interview` `{ prepId }`: 프롬프트 변수 — 회사명(표시명/법인명), 포지션, 공고 본문, 분석 결과(특히 `gaps`의 `missing`), 이력서 JSON, 차수 라벨, 오늘 날짜. runner 요청: `tools: ['Read','WebSearch','WebFetch']`, `timeoutMs: JOB_TIMEOUT_MS.prepare_interview`. 결과 검증 → `sanitizeSources` → `addInterviewRevision`.
  - `revise_interview` `{ prepId, request }`: `buildRevisionPrompt`(원래 입력 + 현재 리비전 + 요청, 새 실행, D-11). 결과 저장.
- 프롬프트 필수 규칙: 회사 조사는 웹 검색으로 확인한 내용만, 문장마다 근거가 되는 출처를 `sources`에 포함 / 찾지 못하면 "확인하지 못함" / 예상 질문은 카테고리별 최소 3개, 이력서에 있는 경험에서 나올 꼬리 질문 우선 / `answerPoints`는 이력서에 있는 사실만 / 차수 라벨에 "임원"·"컬처" 등이 있으면 그에 맞게 비중 조절 / 한국어.

- [ ] **Step 1: 실패하는 테스트**

```ts
test('uses 600s timeout and web tools only', async () => {
  await handlers.prepare_interview({ jobId, payload: { prepId }, runner, workDir, db });
  expect(runner.lastReq.tools).toEqual(['Read', 'WebSearch', 'WebFetch']);
  expect(runner.lastReq.timeoutMs).toBe(600_000);
  expect(getLatestInterviewRevision(prepId, db)!.revNo).toBe(1);
});
test('picks resume by priority', () => {
  // 기본 v1만 → '기본 이력서 v1'; 맞춤 r1 생성 후 → '맞춤 이력서 r1 (아직 지원 전)';
  // 기본 이력서로 지원 완료 후 → '제출한 기본 이력서 v1'
});
test('sanitizes sources', () => {
  const p = sanitizeSources(prep({ sources: [{ title: 'a', url: 'https://x.com' }, { title: 'b', url: 'https://x.com' }, { title: 'c', url: 'javascript:alert(1)' }] }));
  expect(p.sources).toEqual([{ title: 'a', url: 'https://x.com' }]);
});
test('accepts sparse research output', () => {
  expect(() => InterviewPrep.parse(prep({ company: { overview: '확인하지 못함', products: [], size: null, recentNews: [], techStack: [], techBlog: [] }, sources: [] }))).not.toThrow();
});
test('revise runs a fresh call with the current revision', async () => { /* 3단계와 같은 패턴: resumeSessionId 없음, prompt에 현재 리비전 포함 */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS + 전체.
- [ ] **Step 5: 실제 CLI 수동 확인:** 실제 공고 1건(잘 알려진 회사)과 1건(작은 회사)으로 실행해 소요 시간, 출처 품질, "확인하지 못함" 처리 확인. 600초 안에 끝나는지 기록.
- [ ] **Step 6:** 커밋 `feat: interview prep tasks with web research`.

---

### Task 3: 면접 준비 화면과 인쇄용 화면

**Files:**
- Create: `src/app/postings/[id]/InterviewTab.tsx`, `src/app/interview/[prepId]/print/page.tsx`
- Modify: `src/app/postings/[id]/page.tsx`(탭 순서: 분석 / 맞춤 이력서 / 면접 준비 / 공고 원문 / 지원 기록), `src/app/_actions/interview.ts`(새로)

**Interfaces:**
- Consumes: `requestInterviewPrep`, `requestInterviewRevision`, `listInterviewPreps`, `getLatestInterviewRevision`, `listInterviewRevisions`, `latestJobFor`, `QUESTION_CATEGORY_LABELS`, `JobStatus`
- Produces (서버 액션): `requestInterviewPrepAction(postingId, roundLabel)`, `requestInterviewRevisionAction(prepId, request)`

- [ ] **Step 1: 탭 구성**
  - 상단: 차수 칩 목록(`1차`, `2차 임원` …) + [새 차수] (라벨 입력, 기본 "1차" 또는 다음 번호). 지원 상태가 `interview`면 그 차수 번호로 기본값 제안.
  - 진행 중: `JobStatus`("회사 조사와 면접 준비 중… 보통 3~8분").
  - 결과(선택한 차수의 최신 리비전, 리비전 선택 가능):
    - 기준 이력서 라벨(`resumeLabel`)
    - **회사 개요**: 개요, 제품, 규모, 최근 뉴스(날짜·요약·링크), 기술 스택, 기술 블로그 링크
    - **팀의 과제 / 내가 기여할 점**
    - **예상 질문**: 카테고리 탭(기술/경력·프로젝트/인성·협업/회사·지원동기), 질문마다 접기 영역에 "나올 이유"와 "답변 소재", 관련 이력서 항목 이름
    - **부족한 점 대응**, **역질문**, **체크리스트**(체크박스, 상태는 브라우저 저장소에만 — 기록용 아님)
    - **출처** 목록(새 탭으로 열림)
    - 하단 추가 요청 입력창 + [요청] (예: "기술 질문을 Kafka 중심으로 더")
    - [인쇄용 보기] → `/interview/[prepId]/print` 새 탭
  - 빈 섹션은 "찾은 정보가 없습니다"로 표시.
- [ ] **Step 1(추가): 상태 변경 안내** — 상태를 면접으로 저장하면 알림에 "면접 준비 탭에서 준비 자료를 만들 수 있습니다" + [면접 준비로 이동](그 차수 번호를 기본값으로) (D-07).
- [ ] **Step 2: 인쇄용 화면**: 내비게이션 없이 한 페이지에 모든 섹션 펼침, `@media print` 스타일, 상단 [인쇄] 버튼(`window.print()`).
- [ ] **Step 3: 확인 (실제 사용):** 지원한 공고에서 1차 준비 생성 → 섹션 표시 → 추가 요청 1회 → 리비전 2 → 2차 라벨 추가 생성 → 인쇄용 보기에서 인쇄 미리보기 확인. 검색 결과가 적은 회사로도 한 번 확인해 빈 섹션 표시 확인.
- [ ] **Step 4:** 커밋 `feat: interview prep tab and print view`.

---

## Spec 대비 범위

| 설계서 7.6 항목 | 이 계획 |
|---|---|
| 상태와 무관하게 실행, 차수별 여러 개 | Task 1, 3 |
| 입력: 공고·분석·실제 제출 이력서 | Task 2 `pickInterviewResume` |
| 웹 검색 회사 조사 + 출처 | Task 2 (도구 제한, 출처 정리) |
| 출력 6종 (개요, 팀 과제·기여, 예상 질문+답변 소재, 부족한 점 대응, 역질문, 체크리스트) | Task 2 스키마, Task 3 화면 |
| 대화로 추가 요청 | Task 2 `revise_interview`, Task 3 |
