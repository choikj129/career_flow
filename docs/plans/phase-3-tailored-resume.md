# Career Flow 3단계(맞춤 이력서: 프로필 방식 + PDF) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: **재설계 1** (2026-11-20). 작업 기록: [docs/work/tailored-resume.md](../work/tailored-resume.md) "재설계 1"
- 결정됨: D-23 a(지원 완료 때 실제로 낸 서류 기록), D-24 a(통계 "맞춤 이력서 효과"), D-25 a(맞춤본 PDF 파일 보관 안 함, 다시 만듦)
- 이 계획은 **D-26~D-29 추천안**을 기준으로 쓴다(결정 대기). 다른 선택지면 아래 "선택지별 차이"대로 바꾼다.
  - D-26 a: 맞춤 이력서를 **프로필 방식**으로 만든다. 사용자의 기본 서류(직무별 이력서·경력기술서 md)에 프로필 레시피를 앱 코드가 적용하고, AI는 허용 범위 안의 공고 용어 맞추기와 다듬기만 한다. 처음 설계의 "AI가 앱 기본 이력서(JSON)를 다시 씀", 사이트 이력서 수정 안내, 포트폴리오 활용 제안, 앱 기본 이력서 PDF는 뺀다.
  - D-27 a: 서류 키트(가이드·작성 규칙·마스터스토리·기본 서류·PDF 스타일)는 앱 화면에서 파일을 골라 올린다. 올릴 때마다 새 키트 버전으로 보관한다.
  - D-28 a: 프로필 추천은 규칙(공고 단어 세기)으로 하고 사용자가 확정한다. AI 호출 없음.
  - D-29 a: 통계 "맞춤 이력서 효과"에 프로필별 서류 통과율 표를 더한다.

**Goal:** 공고마다 (1) 직무·프로필·추가 조정을 추천받아 확정하고, (2) 기본 서류에 레시피(자기소개 교체, 핵심 역량·주요 성과·경력기술서 장 순서, 개인 프로젝트 선택)를 적용한 맞춤본을 즉시 만들고, (3) 원하면 AI로 공고 용어를 허용 범위 안에서 맞추고 대화로 다듬고, (4) 자동 검사와 제출 전 체크리스트를 확인한 뒤, (5) 이력서·경력기술서 PDF(사용자 서류와 같은 스타일)와 md를 받는다. 지원 완료 때 프로필·추가 조정·맞춤 여부가 기록되고, 통계에서 맞춤 효과와 프로필별 서류 통과율을 본다.

**Architecture:**
- **서류 키트**: 사용자가 올린 md 파일들을 `data/kit/<키트 id>/`에 보관하고, 가이드를 코드로 읽어 구조(직무·프로필·레시피·추가 조정·자기소개 후보·부품 번호표·표현 허용 범위·체크리스트)를 `kits` 테이블에 JSON으로 저장한다. 읽기 실패는 키트 화면에 항목별로 보인다.
- **1단계 조립(코드, 즉시, 호출 0)**: 기본 서류 md를 제목·목록 단위로 읽어 레시피대로 부품을 바꾸고 순서를 바꾼다. 번호를 다시 매긴다. 구조로 옮길 수 없는 추가 조정은 "AI 또는 직접 할 일"로 남긴다.
- **2단계 용어 맞추기(AI, 선택)**: 1단계 결과, 공고, 공고 단어, 허용 범위 표, 작성 규칙, 마스터스토리(사실 원본)를 넣고 문장 표현만 바꾼 md를 받는다. 다듬기도 같은 제약의 새 실행이다(D-11).
- **자동 검사(코드)**: 1단계 결과와 비교해 새 수치(마스터스토리에 있음/없음 구분), 쓰면 안 되는 표현, 자기소개 변경(되돌림), 기술 스택 줄 변경, 구조(제목·성과 수·장 순서) 변경, 다른 회사 이름을 찾는다.
- **PDF**: md → HTML(사용자 PDF 도구와 같은 구조: 제목·프로필 상자, 2단계 제목마다 섹션) + 키트의 CSS + 내장 글꼴 → Playwright A4. 파일은 보관하지 않는다(D-25).
- 앱 안 기본 이력서(JSON)는 **공고 분석용으로만** 남는다.

**Tech Stack:** 1·2단계와 동일 + `marked`(md → HTML, 새 의존성 1개. 설치 전 버전·라이선스 확인). `pretendard`는 이미 설치됨.

**Spec:** `docs/spec/product.md` 7.4·7.5·7.9·7.10·7.11·10·11장, 화면 `docs/spec/screens.md` 1장·3.4·3.7·3.9·3.10·5.3·5.5·5.6·10장, 구조 `docs/spec/architecture.md`
**선행 계획:** `phase-1-2-mvp.md`, `phase-2-past-records.md`, `phase-2-stats.md` (모두 완료)

## Global Constraints

- 1·2단계, 지난 기록, 통계 계획의 Global Constraints 전부 적용.
- 앱은 데이터 폴더 밖(`D:\` 등)을 읽지 않는다. 서류 키트는 브라우저 파일 선택으로 **사용자가 올린 사본**만 쓴다(D-27 a).
- **지어내기 금지**: 마스터스토리에 없는 사실·숫자를 만들지 않는다. 맞춤은 "부품 교체·순서 변경(코드)"과 "허용 범위 안의 용어 바꾸기(AI)"뿐이다. 지키는 방법:
  1. 1단계는 코드가 하므로 새 문장이 생기지 않는다.
  2. 2단계·다듬기 프롬프트 맨 위 규칙 + 작성 규칙·허용 범위 표·마스터스토리를 함께 넣는다.
  3. 자동 검사(Task 3)가 결과를 1단계와 비교해 경고를 낸다. 자기소개는 AI가 바꿔도 1단계 값으로 되돌린다.
- **개인 정보**: 키트 파일은 `data/` 아래에만 있다(git 제외). 테스트는 `tests/fixtures/kit/`의 **지어낸 예시 키트**만 쓴다. 사용자 파일 내용을 테스트·문서·프롬프트 파일에 옮기지 않는다.
- 새 작업 종류: `tailor_resume`(공고 용어 맞추기), `revise_tailored`(다듬기). 각 300초, 도구 없음(`tools: []`), 기본 모델 opus(D-05).
- (D-11) 다듬기는 이전 세션을 이어 붙이지 않는 새 실행이다.
- (D-25 a) 맞춤본 PDF·md는 파일로 저장하지 않는다. 리비전에 md 원문이 있어 언제든 다시 만든다. `data/documents/`에 쓰지 않는다.
- (D-23 a) [지원 완료]는 저장 한 번으로 끝나야 한다. 모든 칸에 기본값이 있다.
- 실제 `claude` 호출: **개발·검증 중 0회.** 실제 확인은 병합 뒤 사용자의 첫 실사용(TC-TAILOR-M1).
- PDF 파일명은 키트 가이드의 규칙을 따른다: `{이름}_{이력서|경력기술서}_{직무}.pdf`(회사·버전·날짜 없음). 이름은 기본 이력서 md 첫 제목의 "·" 앞부분.

## 서류 키트 형식 (앱이 읽는 규칙)

키트 = 가이드 1개 + 작성 규칙 1개 + 마스터스토리 1개 + 직무마다 이력서·경력기술서 md 1개씩 + (선택) PDF 스타일 1개. 가이드는 아래 구획을 **제목 글자**로 찾는다(번호는 무관). 형식이 맞지 않으면 키트 화면에 어느 구획·어느 줄인지 보인다.

| 구획 (제목에 들어갈 글자) | 앱이 읽는 것 |
|---|---|
| "기본 서류" 표 (열: 직무 / 이력서 / 경력기술서 / 기본 프로필) | 직무 목록, 직무별 기본 서류 파일 이름, 기본 프로필 id |
| "번호표" (굵은 줄 `**{직무} 이력서**` 아래 `- 핵심 역량: ⓐ 이름 ⓑ 이름…`, `- 주요 성과: 1 이름 · 2 이름…`, `- 경력기술서: 1 이름 · …`, `- 개인 프로젝트: 이름 · 이름…`) | 부품 이름과 기본 순서 |
| `### {직무}` 아래 프로필 표 (열: 프로필 / 공고 단어 / ① 자기소개 / ② 핵심 역량 / ③ 주요 성과 / ⑤ 경력기술서 / ④ 개인 프로젝트) | 프로필 id·이름·기본 여부(`(기본)`), 공고 단어(쉼표), 자기소개 후보 id, 순서(ⓐ… / 숫자), 개인 프로젝트 이름(쉼표) |
| "추가 조정" 목록 (`- 공고에 **단어, 단어**가 있으면: 할 일`) | 직무별 추가 조정: 트리거 단어, 할 일 문장 |
| "자기소개 후보" (`**{id} 이름**` 다음 인용 블록 `> …`) | 후보 id → 자기소개 본문(※ 줄 제외) |
| "허용 범위" 표 (열: 원래 표현 / 바꿔도 되는 표현 / 쓰면 안 되는 표현) | 용어 바꾸기 허용·금지 목록 |
| "체크리스트" (`- [ ] …`) | 제출 전 체크리스트 문장 |

기본 서류 md에서 찾는 부품(제목 글자로 찾음): 이력서의 `자기소개`(2단계 제목 본문), `핵심 역량`(그 제목 아래 첫 단계 `-` 목록), `주요 성과`(첫 단계 `1.` 번호 목록, 들여쓴 하위 줄 포함), `개인 프로젝트`로 시작하는 2단계 제목 아래 3단계 제목들, `기술 스택` 2단계 구획. 경력기술서의 `## N. …` 장(하위 `### N-k.` 포함). 번호표 개수와 md에서 찾은 개수가 다르면 키트 오류. 개인 프로젝트 이름은 공백을 뺀 글자가 제목에 들어 있거나 이름의 낱말이 모두 제목에 들어 있으면 짝짓는다(짝이 0개나 2개 이상이면 오류).

## Review Focus

1. **AI가 숫자·사실을 더함** — 1단계 결과에 없는 수치는 경고(마스터스토리에도 없으면 "확인 필요", 있으면 "새로 넣은 사실"). → TC-KIT-20.
2. **AI가 자기소개·구조·기술 스택을 바꿈** — 자기소개는 되돌림, 구조·기술 스택 변경은 경고. → TC-KIT-21·22.
3. **"쓰면 안 되는 표현"** — 기본 서류에 없던 금지 표현이 생기면 경고. → TC-KIT-23.
4. **가이드 형식이 조금 바뀜** — 읽기 실패를 조용히 넘기지 않고 키트 화면에 구획·줄을 보인다. 실패한 키트로는 맞춤본을 만들 수 없다. → TC-KIT-02·03.
5. **레시피 적용 오류** — 순서·번호 다시 매기기·개인 프로젝트 선택이 번호표와 맞는지. 주요 성과의 하위 줄이 따라 움직이는지. → TC-KIT-10~13.
6. **개인 정보가 저장소로 감** — 테스트 고정 데이터는 지어낸 예시뿐, 키트는 `data/` 아래뿐. → 검증 에이전트가 `tests/fixtures/kit/` 내용을 확인.
7. **HTML 특수문자·경로 문자** — md 안의 `<script>`, 파일명의 `/` 등. → TC-PDF-01·03.
8. **글자 잘림·한글 낱말 끊김** — 폭 1440·1024. → E2E-09.

---

## File Structure

```
prompts/
  tailor-resume.md                 (새) 공고 용어 맞추기
  revise-tailored.md               (새) 다듬기 규칙 조각(buildRevisionPrompt의 extraRules)
src/lib/
  domain/types.ts                  (수정) JobType 2종, SubmittedResume 종류
  db/schema.ts                     (수정) kits, tailoredResumes, tailoredRevisions
  config.ts                        (수정) kitDir = data/kit
  ai/queue.ts, ai/prompt.ts, ai/job-text.ts, settings.ts  (수정) 작업 종류 2개
  ai/revision.ts                   (새) buildRevisionPrompt (D-11, 4단계도 사용)
  ai/tasks/tailor-schemas.ts       (새) KitTailorOutput
  ai/tasks/tailor-resume.ts        (새) tailorResume / reviseTailored 처리기
  ai/tasks/index.ts                (수정)
  kit/types.ts                     (새) KitParsed, Track, Profile, Adjustment, TermRule … (순수)
  kit/parse-guide.ts               (새) 가이드 md → KitGuide (순수)
  kit/md-doc.ts                    (새) 기본 서류 md → 블록, 부품 찾기, 다시 쓰기 (순수)
  kit/assemble.ts                  (새) 레시피 적용(1단계) (순수)
  kit/recommend.ts                 (새) 공고 단어 세기, 직무·프로필·추가 조정 추천 (순수)
  kit/checks.ts                    (새) 자동 검사 (순수)
  kit/line-diff.ts                 (새) 줄 단위 비교 (순수, 클라이언트에서도 씀)
  kit/repo.ts                      (새) 키트 올리기·보관·최신 키트
  tailored/repo.ts                 (새) 맞춤본·리비전, 조립, 작업 요청
  applications/submitted.ts        (새) 제출 서류 선택 값·기본값·라벨 (순수)
  applications/repo.ts             (수정) markApplied·updateApplication 제출 서류
  postings/repo.ts                 (수정) deletePosting이 맞춤 작업도 취소·거부
  search/dashboard.ts              (수정) 라벨, 이력서별 묶음
  stats/load.ts, stats/aggregate.ts (수정) tailored·profile, 서류 버전별, tailoredCompare, byProfile
  resume/diff.ts                   (새) diffResume (기본 이력서 버전 비교 전용, 5.3)
  pdf/fonts.ts, pdf/md-html.ts, pdf/render.ts  (새)
src/app/
  api/kit/route.ts                 (새) 키트 올리기(POST, multipart)
  api/tailored/[revisionId]/[doc]/route.ts     (새) doc = resume|career, ?format=pdf|md|html&inline=1
  api/tailored/[revisionId]/posting-md/route.ts (새) 공고 요약 md 받기
  api/kit/[kitId]/[track]/[doc]/route.ts       (새) 기본 서류 PDF 보기(지원 기록 [보기])
  api/jobs/active/route.ts         (수정) 맞춤 작업이면 ?tab=tailored
  _actions/tailored.ts             (새) 조립·용어 맞추기·다듬기 액션
  _actions/applications.ts, _actions/settings.ts (수정)
  _components/DocSelects.tsx       (새) 제출 서류 select 3개
  _components/{SubmittedDocs,ApplicationEditModal,RecordPanel,AnalysisView}.tsx (수정)
  postings/[id]/page.tsx, ApplyForm.tsx (수정)
  postings/[id]/TailoredTab.tsx    (새, 서버) postings/[id]/ProfilePicker.tsx, TailoredControls.tsx (새, 클라이언트)
  resume/KitTab.tsx                (새) 서류 키트 탭  resume/page.tsx, ResumeTabs.tsx, VersionHistory.tsx (수정)
  page.tsx, stats/page.tsx, settings/{ModelSelects.tsx,page.tsx} (수정)
tests/
  fixtures/kit/                    (새) 지어낸 예시 키트(가이드·기본 서류 2직무·규칙·마스터스토리·스타일)
  kit-parse.test.ts, kit-assemble.test.ts, kit-recommend.test.ts, kit-checks.test.ts,
  tailored-repo.test.ts, tailor-task.test.ts, submitted.test.ts, pdf.test.ts, resume-diff.test.ts (새)
  stats.test.ts, search.test.ts, prompts.test.ts (수정), fixtures/fake-claude-e2e.mjs (수정), e2e/14-tailored.spec.ts (새)
drizzle/0005_tailored.sql
```

Task 묶음(PM 위임 단위 제안): A = Task 1·2, B = Task 3, C = Task 4, D = Task 5·8, E = Task 6, F = Task 7. 순서대로.

---

### Task 1: 데이터 구조

**Files:** Modify `src/lib/domain/types.ts`, `src/lib/db/schema.ts`, `src/lib/config.ts`, `src/lib/ai/queue.ts`, `src/lib/settings.ts`, `src/lib/ai/job-text.ts`, `src/lib/postings/repo.ts`. Create 마이그레이션, `tests/tailored-repo.test.ts`(저장 부분).

**Interfaces:**
- `types.ts`
  - `JobType`에 `'tailor_resume' | 'revise_tailored'`. 시간 제한 각 300초, 기본 모델 opus. 진행 문구 `'공고 용어 맞추는 중… (보통 1~3분)'`, `'맞춤 이력서 다듬는 중… (보통 1~3분)'`.
  - ```ts
    export type SubmittedResume =
      | { kind: 'tailored'; tailoredRevisionId: number }                        // 맞춤본
      | { kind: 'kit'; kitId: number; track: string; profileId: string; profileName: string } // 기본 서류 그대로(사이트 등록 이력서·기본 PDF)
      | { kind: 'file' }                                                        // 이력서 파일(제출 서류 칸) 또는 모름
      | { kind: 'imported' }                                                    // 가져오기·직접 입력·메일 기록
      | { kind: 'base'; versionId: number };                                    // 3단계 전 [지원 완료]. 새로 만들지 않는다
    ```
- `schema.ts` (D-26 a: 테이블 3개)
  - `kits`: `id`, `label`(text, 예 기본 서류 파일 이름의 버전 조각 `v5_20261119`, 없으면 `키트 {id}`), `files`(json `{ role: KitRole; track?: string; name: string; sha256: string; bytes: number }[]`), `parsed`(json `KitParsed | null`), `errors`(json `KitError[]`), `createdAt`.
  - `tailoredResumes`: `id`, `postingId`(fk, unique, on delete cascade), `createdAt`.
  - `tailoredRevisions`: `id`, `tailoredResumeId`(fk cascade), `revNo`, `kitId`(fk kits), `track`, `profileId`, `profileName`, `adjustments`(json `{ id: string; label: string }[]`), `source`(`'recipe' | 'terms' | 'revise'`), `resumeMd`, `careerMd`, `pendingAdjustments`(json string[] — 코드가 못 옮긴 추가 조정 할 일), `changeReasons`(json `{ doc: 'resume'|'career'; after: string; reason: string }[]`), `warnings`(json `KitWarning[]`), `notes`(text), `userRequest`(text?), `jobId`(fk ai_jobs, **nullable** — 조립은 작업 없음), `createdAt`. 유일 (`tailoredResumeId`, `revNo`).
  - `applications.submittedResume`: `$type<SubmittedResume>()`.
- `config.kitDir = join(dataDir, 'kit')`, `ensureDataDirs`에 추가.
- `deletePosting`: 대기·실행 중 작업 종류를 `analyze_posting`, `tailor_resume`, `revise_tailored`로 넓힘. 맞춤 행은 cascade.

- [ ] Step 1 테스트 TC-TAILOR-01(리비전 번호·최신순·리비전의 공고), TC-TAILOR-02(공고 삭제 cascade, 대기 작업 취소, 실행 중 거부). Step 2 FAIL → Step 3 구현 + `npx drizzle-kit generate --name tailored` → Step 4 PASS → Step 5 커밋 `feat: kit and tailored resume tables`.

---

### Task 2: 서류 키트 읽기·보관

**Files:** Create `src/lib/kit/{types,parse-guide,md-doc,repo}.ts`, `tests/fixtures/kit/*`(지어낸 예시), `tests/kit-parse.test.ts`.

**Interfaces:**

```ts
// kit/types.ts
export type KitRole = 'guide' | 'rules' | 'master' | 'resume' | 'career' | 'style';
export type Track = { name: string; resumeFile: string; careerFile: string; defaultProfileId: string;
  parts: { competencies: string[]; achievements: string[]; chapters: string[]; projects: string[] } };
export type Profile = { id: string; name: string; track: string; isDefault: boolean; keywords: string[];
  introId: string; competencyOrder: number[]; achievementOrder: number[]; chapterOrder: number[]; projects: string[] };
export type Adjustment = { id: string; track: string; triggers: string[]; instruction: string; label: string };
export type TermRule = { original: string; allowed: string[]; forbidden: string[] };
export type KitGuide = { tracks: Track[]; profiles: Profile[]; adjustments: Adjustment[];
  intros: Record<string, string>; terms: TermRule[]; checklist: string[] };
export type KitParsed = KitGuide & { styleCss: string | null };
export type KitError = { file: string; where: string; message: string };   // 화면에 그대로 보임

// kit/parse-guide.ts
export function parseGuide(md: string): { guide: KitGuide | null; errors: KitError[] };

// kit/md-doc.ts
export type MdBlock = { level: number; title: string; lines: string[]; children: MdBlock[] };  // level 0 = 문서 머리
export function parseMdDoc(md: string): MdBlock;
export function renderMdDoc(doc: MdBlock): string;          // parse → render 왕복이 원문과 같다(줄 끝 공백 제외)
export function findSection(doc: MdBlock, match: (title: string) => boolean): MdBlock | null;
export function listItems(lines: string[], kind: 'bullet' | 'ordered'): { items: string[][]; before: string[]; after: string[] };
export function checkBaseDoc(doc: MdBlock, track: Track, kind: 'resume' | 'career'): KitError[];  // 번호표 개수와 md 부품 개수 비교, 개인 프로젝트 짝짓기

// kit/repo.ts
export function saveKit(files: { name: string; data: Buffer }[], db?, dir?): { kitId: number; errors: KitError[] };
export function getKit(id: number, db?): { id; label; files; parsed: KitParsed | null; errors: KitError[]; createdAt } | null;
export function getLatestKit(db?): ReturnType<typeof getKit>;           // 오류 있는 키트도 돌려준다(화면에 오류 표시용)
export function getUsableKit(db?): (NonNullable<ReturnType<typeof getKit>> & { parsed: KitParsed }) | null; // 오류 없는 가장 최근 키트
export function readKitDoc(kitId: number, track: string, doc: 'resume' | 'career', db?, dir?): string;
export function readKitText(kitId: number, role: 'guide' | 'rules' | 'master', db?, dir?): string;
```

- 올리기 규칙(`saveKit`)
  - 받는 파일: `.md` 최대 10개 + 스타일 1개(`.css`, 또는 `build_pdf.py` 같은 `.py`에서 `CSS = """…"""` 문자열만 글자로 꺼낸다. 실행하지 않는다). 파일당 1MB, 합계 5MB.
  - 역할 정하기: 가이드 = 이름에 "가이드" 또는 내용에 "번호표"와 "자기소개 후보"가 모두 있음. 작성 규칙 = 이름에 "규칙" 또는 `rules`. 마스터스토리 = 이름에 "마스터" 또는 `master`. 기본 서류 = 가이드 "기본 서류" 표에 적힌 파일 이름과 정확히 같은 것. 역할이 없는 파일은 오류("이 파일이 어디에 쓰이는지 모릅니다").
  - 필수: 가이드·작성 규칙·마스터스토리 각 1개, 가이드 표의 모든 기본 서류. 빠지면 오류. 오류가 있어도 키트는 저장하고(화면에서 보고 고치게) `getUsableKit`은 그 키트를 건너뛴다.
  - 저장: `data/kit/<id>/<원래 이름>`(경로 부분 버림), sha256. 이전 키트는 지우지 않는다(옛 리비전의 [기본 서류 보기]·다시 조립 기준).
  - `label`: 기본 서류 파일 이름에서 `_v<숫자>_<8자리>` 조각을 찾으면 그것, 아니면 `키트 {id}`.

- [ ] Step 1 테스트(예시 키트로)
  - TC-KIT-01 `parseGuide` 정상: 직무 2개, 프로필 수, 기본 프로필, 공고 단어, 순서 배열(ⓐ→0), 추가 조정 트리거·할 일, 자기소개 후보(※ 줄 제외), 허용 범위, 체크리스트.
  - TC-KIT-02 구획 빠짐·표 열 개수 틀림 → 오류 메시지에 구획 이름, `guide: null`.
  - TC-KIT-03 `checkBaseDoc`: 핵심 역량 개수가 번호표와 다름 → 오류. 개인 프로젝트 이름 짝 0개·2개 → 오류.
  - TC-KIT-04 `parseMdDoc`/`renderMdDoc` 왕복이 같음.
  - TC-KIT-05 `saveKit`: 역할 판정, 필수 빠짐 오류, `.py`에서 CSS만 꺼냄, 경로 문자 제거, 이전 키트 유지, `getUsableKit`이 오류 키트를 건너뜀.
- [ ] Step 2~4 FAIL → 구현 → PASS. Step 5 커밋 `feat: document kit upload and parsing`.

---

### Task 3: 추천, 1단계 조립, 자동 검사

**Files:** Create `src/lib/kit/{recommend,assemble,checks,line-diff}.ts`, `tests/kit-recommend.test.ts`, `tests/kit-assemble.test.ts`, `tests/kit-checks.test.ts`.

**Interfaces:**

```ts
// kit/recommend.ts (D-28 a)
export type WordCount = { word: string; count: number };
export type Recommendation = {
  track: string; trackReason: string;
  profiles: { id: string; name: string; score: number; matched: WordCount[]; recommended: boolean }[];  // 그 직무의 프로필, 점수 ↓
  adjustments: { id: string; label: string; matched: WordCount[]; suggested: boolean }[];
  topWords: WordCount[];                 // 모든 프로필·추가 조정 단어 중 많이 나온 3개
};
export function recommend(kit: KitGuide, posting: { title: string | null; text: string }): Recommendation;

// kit/assemble.ts
export type Recipe = { track: string; profileId: string; adjustmentIds: string[] };
export type Assembled = { resumeMd: string; careerMd: string; applied: string[]; pending: string[] };
export function assemble(kit: KitGuide, base: { resumeMd: string; careerMd: string }, recipe: Recipe): Assembled;

// kit/checks.ts
export type KitWarning = {
  kind: 'new_number' | 'new_fact_from_master' | 'forbidden_term' | 'intro_restored' | 'structure_changed' | 'stack_changed' | 'other_company';
  doc: 'resume' | 'career'; detail: string;            // 화면 문장
};
export function checkTailored(input: {
  kit: KitGuide; stage1: { resumeMd: string; careerMd: string }; final: { resumeMd: string; careerMd: string };
  base: { resumeMd: string; careerMd: string }; masterMd: string; otherCompanyNames: string[];
}): { final: { resumeMd: string; careerMd: string }; warnings: KitWarning[] };   // final은 자기소개를 되돌린 결과

// kit/line-diff.ts
export function lineDiff(a: string, b: string): { text: string; op: 'same' | 'del' | 'ins' }[];
```

- 추천 규칙
  - 셀 글: 분석 결과의 주요 업무·필수 요건·우대 사항·기술 스택을 이어 붙인 글(분석이 있으면), 없으면 공고 본문. 소문자로, 단어는 부분 일치로 센다(영문은 대소문자 무시).
  - 직무: 공고 포지션명에 직무 이름(예 `FDE`)이 들어 있으면 그 직무. 아니면 직무별로 "프로필 단어 수 합"이 큰 쪽, 같으면 가이드 표의 첫 직무. `trackReason`에 이유("포지션명에 'FDE'", "공고 단어 수 7 대 2").
  - 프로필: 그 직무 프로필마다 단어 수 합. 가장 큰 프로필 추천. 0이거나 같으면 기본 프로필.
  - 추가 조정: 트리거 단어가 하나라도 나오면 `suggested`.
- 조립 규칙(`assemble`, 번호표의 기본 순서 기준)
  - 자기소개: 이력서 `자기소개` 구획의 본문(하위 제목 앞까지)을 후보 본문으로 바꾼다.
  - 핵심 역량: 목록 항목을 `competencyOrder`대로. 주요 성과: 번호 목록 항목(하위 줄 포함)을 `achievementOrder`대로 두고 `1.`부터 다시 매김.
  - 개인 프로젝트: 이력서 `개인 프로젝트` 구획의 3단계 제목 블록을 `projects` 순서로 남기고 나머지는 뺀다. 경력기술서에도 같은 구획이 있으면 같은 규칙.
  - 경력기술서 장: `## N.` 장을 `chapterOrder`대로 두고 장 번호와 하위 `### N-k.` 번호를 다시 매김.
  - 추가 조정: 할 일 문장에서 다음 두 모양만 코드로 옮긴다. ① `주요 성과 N을 K번째로` → 원래 번호 N 항목을 K번째로. ② `{구획}를 {구획} 바로 위로` → 이력서 2단계 구획 이동. 나머지 문장은 `pending`(AI 또는 직접 할 일). `applied`에는 사람이 읽는 요약("자기소개: B3 후보", "주요 성과 순서: 5 4 2 1 3 7 6", "추가 조정: …").
- 자동 검사 규칙(`checkTailored`)
  - 자기소개: `final`의 자기소개 본문이 `stage1`과 다르면 `stage1` 값으로 되돌리고 `intro_restored`.
  - 수치: Task 3 정규식(`/\d+(?:[.,]\d+)*\s*(%|배|건|명|억|만|천|ms|초|분|시간|개월|개|년|x|tps|qps|gb|tb|mb)?/gi`, 쉼표·공백 제거·소문자)으로 `final`에서 뽑은 수치가 `stage1`에 없으면: 마스터스토리에 있으면 `new_fact_from_master`("새로 넣은 사실: … — 마스터스토리에 있는 수치입니다"), 없으면 `new_number`("확인 필요: … — 기본 서류와 마스터스토리에 없는 수치입니다").
  - 금지 표현: `terms[].forbidden` 각 표현이 `final`에 있고 `base`에 없으면 `forbidden_term`.
  - 구조: 두 문서의 제목 목록(단계·글자), 주요 성과 항목 수, 경력기술서 장 순서가 `stage1`과 다르면 `structure_changed`(무엇이 다른지).
  - 기술 스택: 이력서·경력기술서 `기술 스택` 구획의 줄 집합(순서 무시)이 다르면 `stack_changed`.
  - 다른 회사: `otherCompanyNames`(앱에 있는 다른 회사 표시명, 2자 이상, 이 공고 회사 제외) 중 `final`에 있고 `base`에 없는 것 → `other_company`.

- [ ] Step 1 테스트(예시 키트)
  - TC-KIT-10 자기소개 교체, 핵심 역량 순서. TC-KIT-11 주요 성과 순서·하위 줄 함께 이동·번호 다시 매김. TC-KIT-12 경력기술서 장 순서·`N-k` 번호. TC-KIT-13 개인 프로젝트 선택·순서·빠짐. TC-KIT-14 추가 조정 ①② 코드 적용, 나머지 `pending`. TC-KIT-15 같은 입력이면 같은 결과(결정적).
  - TC-KIT-16 추천: 단어 수로 프로필, 0이면 기본, 포지션명으로 직무, 추가 조정 제안, 상위 단어 3개.
  - TC-KIT-20 수치 두 종류. TC-KIT-21 자기소개 되돌림. TC-KIT-22 구조·기술 스택 경고. TC-KIT-23 금지 표현(기본 서류에 원래 있으면 경고 없음). TC-KIT-24 다른 회사 이름. TC-KIT-25 `lineDiff`.
- [ ] Step 2~4. Step 5 커밋 `feat: profile recommendation, recipe assembly and checks`.

---

### Task 4: 맞춤본 저장과 AI 작업 (용어 맞추기·다듬기)

**Files:** Create `prompts/tailor-resume.md`, `prompts/revise-tailored.md`, `src/lib/ai/revision.ts`, `src/lib/ai/tasks/{tailor-schemas,tailor-resume}.ts`, `src/lib/tailored/repo.ts`, `tests/tailor-task.test.ts`. Modify `ai/tasks/index.ts`, `ai/prompt.ts`, `tests/prompts.test.ts`, `tests/tailored-repo.test.ts`.

**Interfaces:**

```ts
// ai/tasks/tailor-schemas.ts
export const KitTailorOutput = z.object({
  resumeMd: z.string(), careerMd: z.string(),
  changeReasons: z.array(z.object({ doc: z.enum(['resume', 'career']), after: z.string(), reason: z.string() })),
  notes: z.string(),                // 다른 프로필이 더 맞아 보이면 여기에(D-28 a: 추천은 하지 않음)
});

// ai/revision.ts (D-11)
export function buildRevisionPrompt(input: { basePrompt: string; currentJson: unknown; request: string; extraRules?: string }): string;

// tailored/repo.ts
export function getTailoredForPosting(postingId, db?): { id; postingId; createdAt } | null;
export function getRevision(id, db?): TailoredRevision | null;
export function listRevisionsForPosting(postingId, db?): RevisionSummary[];   // { id, revNo, source, profileId, profileName, userRequest, kitId, createdAt }, 최신순
export function revisionPostingId(revisionId, db?): number | null;
/** 1단계 조립. 작업 큐 없이 바로 저장(호출 0). 키트가 없거나 오류면 예외 */
export function createRecipeRevision(postingId: number, recipe: Recipe, db?): { id: number; revNo: number };
/** 2단계. 최신 리비전(조립본)의 레시피로 tailor_resume 작업. 진행 중이면 그 jobId */
export function requestTermsMatch(postingId: number, db?): number;
export function requestTailoredRevision(postingId: number, request: string, db?): number;
export function activeTailorJob(postingId, db?): JobSummary | undefined;
export function latestTailorJob(postingId, db?): JobSummary | undefined;
```

- `createRecipeRevision`: `getUsableKit` → 기본 서류 읽기 → `assemble` → `source: 'recipe'`, 경고 없음, `pendingAdjustments = pending`. 예외: "서류 키트를 먼저 올리세요 → 기본 이력서 > 서류 키트", "서류 키트에 오류가 있습니다", "그 직무·프로필이 키트에 없습니다".
- `requestTermsMatch` 예외: 맞춤본 없음 "먼저 맞춤본을 조립하세요", 진행 중이면 그 jobId. payload `{ postingId, revisionId }`(기준이 될 리비전 = 최신).
- `requestTailoredRevision` 예외: 빈 요청, 2000자 초과, 맞춤본 없음, 진행 중 작업(문구는 처음 설계와 같다).
- 처리기
  - 공통: 기준 리비전의 `kitId`·레시피로 `stage1 = assemble(...)`를 다시 만든다(결정적). 결과는 `checkTailored`로 자기소개를 되돌리고 경고를 붙여 `addRevision`.
  - `tailor_resume` `{ postingId, revisionId }`: 프롬프트 `tailor-resume` 변수 `today`, `posting_text`, `analysis_json`(없으면 `{}`), `top_words`, `profile`(id·이름·공고 단어), `pending_adjustments`, `writing_rules`(키트 작성 규칙 전문), `terms_table`(허용 범위 표를 md로), `master_story`(키트 마스터스토리 전문), `resume_md`, `career_md`(1단계 결과). `source: 'terms'`.
  - `revise_tailored` `{ postingId, request }`: 최신 리비전 기준. `basePrompt` = 위 프롬프트(그 리비전의 레시피로), `extraRules` = `revise-tailored.md`, `currentJson` = `{ resumeMd, careerMd, changeReasons, notes }`. `source: 'revise'`, `userRequest`.
- 프롬프트 필수 규칙(`tailor-resume.md` 맨 위): "마스터스토리에 없는 사실·숫자를 만들지 않는다. 바꿀 수 있는 것은 허용 범위 표 안의 공고 용어와 남은 추가 조정뿐이다. 자기소개, 제목, 항목 순서, 기술 스택, 숫자는 바꾸지 않는다. 모르면 바꾸지 않는다." / 출력은 md 원문 그대로의 모양(제목·목록 기호 유지) / 한국어 / 다른 프로필이 더 맞아 보이면 `notes`에 한 줄.
- 프롬프트 파일에는 사용자 내용이 들어가지 않는다. 모든 개인 내용은 실행할 때 키트에서 읽어 변수로 넣는다.

- [ ] Step 1 테스트(가짜 runner, 예시 키트)
  - TC-TAILOR-03 `createRecipeRevision`: r1, source recipe, `pending` 저장, jobId 없음. 키트 없음·오류 → 메시지.
  - TC-TAILOR-09 용어 맞추기: 가짜 출력이 자기소개를 바꾸고 새 숫자를 넣음 → 저장된 자기소개는 조립본 값, `intro_restored`·`new_number` 경고, `tools: []`, opus, 첫 규칙 줄 포함, 프롬프트에 마스터스토리·허용 범위 표.
  - TC-TAILOR-10 다듬기: 세션 없음, 현재 리비전 md·요청 포함, r3, `userRequest`.
  - TC-TAILOR-11 로그인 오류면 리비전 없음. TC-TAILOR-12 요청 검사. TC-TAILOR-13 키트가 바뀐 뒤에도 옛 리비전의 다듬기는 그 리비전의 키트로 1단계를 다시 만든다.
  - TC-TAILOR-14 `buildRevisionPrompt`. TC-TAILOR-15 프롬프트 변수·첫 규칙. TC-TAILOR-16 작업 종류 등록.
- [ ] Step 2~4. Step 5 커밋 `feat: tailored revisions, terms match and revise tasks`.

---

### Task 5: 제출 서류 기록 (D-23 a, 프로필 포함)

**Files:** Create `src/lib/applications/submitted.ts`, `tests/submitted.test.ts`. Modify `applications/repo.ts`, `search/dashboard.ts`, `tests/search.test.ts`.

**Interfaces:**

```ts
export type ResumeChoice =
  | { kind: 'tailored'; tailoredRevisionId: number }
  | { kind: 'kit'; kitId: number; track: string }         // 기본 서류 그대로. 프로필 = 그 직무의 기본 프로필
  | { kind: 'file'; fileName: string }
  | { kind: 'unknown' }
  | { kind: 'base'; versionId: number };                   // 예전 기록 유지 전용
export type SubmittedInput = { resume: ResumeChoice; career: string | null; portfolio: string | null };
export function encodeResumeChoice(c: ResumeChoice): string;   // 'tailored:12' | 'kit:3:백엔드' | 'file:…' | 'unknown' | 'base:3'
export function decodeResumeChoice(s: string): ResumeChoice | null;
export function currentSubmitted(sr: SubmittedResume, docs: SubmittedDocs | null): SubmittedInput;
/** 이력서 기본값: 최신 맞춤 리비전 → (키트가 있으면) 추천 직무의 기본 서류 → 지원일 기준 이력서 파일 → 모름 */
export function defaultSubmitted(i: { appliedAt: string; files: DocFile[]; latestRevisionId: number | null; kit: { id: number; track: string } | null }): SubmittedInput;
export function toColumns(input: SubmittedInput, ctx: { prevKind?: SubmittedResume['kind']; kitProfile?: { profileId: string; profileName: string } }): { submittedResume: SubmittedResume; submittedDocs: SubmittedDocs };
/** short: '맞춤 r2 · B3' | '기본 서류 백엔드 · B1' | '이력서 2026-11-02' | '기본 v3' | null. long: '맞춤 이력서 r2 (B3 정합성)' … */
export function resumeLabel(sr: SubmittedResume, docs: SubmittedDocs | null, names: { revNo?: number | null; profile?: string | null; versionNo?: number | null }, style: 'short' | 'long'): string | null;
```

- 경력기술서·포트폴리오 칸은 지금 규칙(지원일 기준 파일 / 없음 / 모름) 그대로다. 맞춤본·기본 서류의 경력기술서를 함께 냈는지는 따로 기록하지 않는다(맞춤 여부와 프로필은 이력서 칸으로 센다). 미룬 것에 적는다.
- `markApplied`·`updateApplication`·검증·`resolveSubmittedResume`은 처음 설계와 같다. 추가: `kit` 선택은 그 키트가 있고 직무가 키트에 있어야 한다. `resolveSubmittedResume`은 `tailored`·`kit`이면 `null`(앱 JSON 이력서가 아니므로) — 4단계는 대신 "맞춤본 md"를 쓰는 방법을 4단계 설계 때 정한다.
- 대시보드 이력서별 묶음: "맞춤 이력서" → "기본 서류 {직무}" → "기본 v{n}" → 이력서 파일 → 모름.

- [ ] Step 1 테스트 TC-SUBMIT-01~07(처음 설계와 같고 `kit` 종류 추가: 기본값 순서, 키트 없는 직무 거부, 라벨에 프로필). Step 2~4. Step 5 커밋 `feat: record submitted resume with profile on apply`.

---

### Task 6: PDF·md 내려받기 (D-25 a)

**Files:** Create `src/lib/pdf/{fonts,md-html,render}.ts`, `src/app/api/tailored/[revisionId]/[doc]/route.ts`, `src/app/api/tailored/[revisionId]/posting-md/route.ts`, `src/app/api/kit/[kitId]/[track]/[doc]/route.ts`, `tests/pdf.test.ts`. `npm i marked`.

**Interfaces:**
- `fontFaceCss()`: Pretendard Regular·Bold를 base64 `@font-face`로, `font-family: 'Pretendard'`(키트 CSS가 쓰는 이름과 같게).
- `mdToSectionHtml(md: string): string` — 사용자 PDF 도구와 같은 구조: 주석 제거 → `marked`(표·목록·줄바꿈) → 첫 `h1`과 첫 `hr` 전까지를 제목 + `div.box.profile`(제목이 "이름 · 직함"이면 이름은 `.name`) → `h2`마다 `section.sec > h2 + div.body`. 원문 HTML 태그는 이스케이프한다(`marked`의 html 토큰을 글자로).
- `buildPdfHtml(md: string, css: string | null): string` — `<style>` = `fontFaceCss()` + (키트 CSS 또는 앱 기본 CSS) + 줄바꿈 규칙(`word-break: keep-all; overflow-wrap: anywhere`), 본문 `div.sheet`.
- `renderPdf(html)` — `acquireBrowserLock(30_000)`, `chromium.launch()`, A4, `preferCSSPageSize: true`(키트 CSS의 `@page` 여백을 따름), 잠금 해제는 `finally`.
- `kitPdfFileName(i: { name: string; doc: 'resume' | 'career'; track: string }): string` → `{이름}_{이력서|경력기술서}_{직무}.pdf`(경로 문자·공백 제거). 이름이 없으면 `{이력서|경력기술서}_{직무}.pdf`.
- `contentDisposition(fileName, inline = false)` — 처음 설계와 같다.
- 라우트
  - `GET /api/tailored/[revisionId]/[doc]?format=pdf|md|html&inline=1` — `doc` = `resume|career`. pdf = 위 파일명, md = 같은 이름 `.md`(`text/markdown; charset=utf-8`), html = 미리보기(CSP `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:`). 없는 리비전 404, 잘못된 doc 400, 잠금 시간 초과 503.
  - `GET /api/tailored/[revisionId]/posting-md` — 공고 요약 md 받기: 회사·포지션·사이트·링크·마감, 상위 공고 단어 3개, 고른 직무·프로필·추가 조정, 공고 본문. 파일명 `공고.md`(사용자 지원 폴더 양식과 같은 이름).
  - `GET /api/kit/[kitId]/[track]/[doc]?inline=1` — 기본 서류 그대로의 PDF(지원 기록 [보기]).

- [ ] Step 1 테스트 TC-PDF-01 이스케이프(md 안 `<script>`), TC-PDF-02 섹션 구조(`h1` 다음 `.profile`, `h2`마다 `section.sec`), TC-PDF-03 `kitPdfFileName`, TC-PDF-04 `contentDisposition`, TC-PDF-05 `renderPdf`(`%PDF-`, 글꼴 포함, 잠금 대기), TC-PDF-06 줄바꿈 규칙, TC-PDF-07 라우트(404·400·형식별 Content-Type), TC-PDF-08 미리보기 CSP, TC-PDF-09 공고 요약 md 항목. Step 2~4. Step 5 커밋 `feat: kit-styled pdf and md downloads`.

---

### Task 7: 화면

**Files:** 위 File Structure의 `src/app/**` 항목, `tests/e2e/14-tailored.spec.ts`, `tests/fixtures/fake-claude-e2e.mjs`.

- [ ] Step 1 **서류 키트 탭**(`/resume?tab=kit`, 화면 문서 5.6): 키트 버전·올린 날·파일 목록(역할), [키트 파일 올리기](여러 파일), 읽은 결과(직무·프로필 표·추가 조정·허용 범위 수·체크리스트 수·부품 짝짓기 표), 오류 목록, 키트 기록(이전 버전).
- [ ] Step 2 **맞춤 이력서 탭**(3.4): 키트 없음/오류, 프로필 고르기(추천), 조립 결과, 용어 맞추기·다듬기 진행·실패, 리비전 선택, 자동 검사, 바뀐 곳, 남은 추가 조정, 제출 전 체크리스트, 미리보기(이력서|경력기술서), 내려받기, 키트가 바뀜 안내.
- [ ] Step 3 **지원 완료 창·수정 창·지원 기록**(3.7·3.9·3.10): `DocSelects`에 "기본 서류" 선택지. 지원 기록 라벨에 프로필.
- [ ] Step 4 **설정·기본 이력서**: 모델 2종("맞춤 이력서 공고 용어 맞추기", "맞춤 이력서 다듬기"). 버전 기록 "직전 버전과 비교"(`resume/diff.ts`의 `diffResume`, 5.3). 앱 기본 이력서 PDF 버튼은 만들지 않는다(D-26 a).
- [ ] Step 5 E2E TC-TAILOR-E2E-01~12(아래 표). Step 6 커밋 `feat: kit tab, profile-based tailored resume tab, submitted resume with profile`.

---

### Task 8: 통계 (D-24 a + D-29 a)

**Files:** Modify `stats/load.ts`, `stats/aggregate.ts`, `app/stats/page.tsx`, `tests/stats.test.ts`, `tests/e2e/13-stats.spec.ts`.

**Interfaces:**
- `StatItem`에 `tailored: boolean`, `profile: { id: string; name: string } | null`(tailored면 리비전의, kit이면 기록의).
- `byDocVersion(items, 'resume')`: "맞춤 이력서" → "기본 서류 {직무}"(키트 기본 서류 그대로) → 기본 v{n} → 파일 → 모름.
- `tailoredCompare(items): TailoredCompare | null` — 처음 설계와 같다.
- `byProfile(items): { id: string; name: string; tailored: Tally; plain: Tally; all: Tally }[]` — 프로필 있는 기록만, 프로필 id 순(가이드 표 순서가 아닌 글자 순). 프로필 없는 기록은 빠진다.
- 화면: "맞춤 이력서 효과" 카드 아래쪽에 "프로필별" 표(프로필 / 지원 / 통과 / 불합격 / 무응답 / 대기 / 서류 통과율 / 그중 맞춤). 프로필 기록이 없으면 표 대신 한 줄 안내.

- [ ] Step 1 TC-STATS-15(묶음 순서), TC-STATS-16(`tailoredCompare`), TC-STATS-17(`byProfile`: 맞춤·기본 서류 둘 다 셈, 프로필 없는 기록 제외). Step 2~4. Step 5 커밋 `feat: tailored effect and per-profile pass rates`.

---

## 선택지별 차이

| 결정 | 추천안(이 계획) | 다른 선택지일 때 |
|---|---|---|
| D-26 | a: 프로필 방식(코드 조립 + AI 용어 맞추기). JSON 재작성·사이트 수정 안내·포트폴리오 제안·앱 기본 이력서 PDF 뺌 | **b**(둘 다): 이 계획 + 처음 설계(작업 기록 "1. 설계", 재설계 전 이 계획 파일의 git 기록)의 JSON 맞춤 Task를 "프로필 없이 만들기"로 더함. 크기 큼→매우 큼. **c**(처음 설계 유지 + 프로필 기록만): 처음 설계로 돌아가고, 지원 완료 창에 프로필 select만 더함(키트 없음, 프로필 목록은 설정에서 직접 입력) |
| D-27 | a: 앱 화면에서 키트 올리기, 버전 보관 | **b**: Task 2의 올리기 라우트·화면을 빼고, 메인 세션이 승인 후 `data/kit/<id>/`에 복사한 뒤 앱의 [키트 다시 읽기] 버튼(폴더를 읽어 새 버전 등록)만 둔다 |
| D-28 | a: 규칙 추천 + 사용자 확정 | **b**: 추천을 AI가(분석 프롬프트에 프로필 목록을 넣고 결과에 추천 프로필 칸 추가, 분석 스키마 변경). **c**: 둘 다(규칙 점수와 AI 의견을 나란히) |
| D-29 | a: 프로필별 표 추가 | **b**: Task 8의 `byProfile`·표를 뺀다(맞춤 / 맞춤 안 함만) |

## 테스트 케이스

| ID | 대상 | 기대 결과 | 위치 |
|---|---|---|---|
| TC-TAILOR-01·02 | 저장소·공고 삭제 | Task 1 | `tailored-repo.test.ts` |
| TC-KIT-01~05 | 키트 읽기·올리기 | Task 2 | `kit-parse.test.ts` |
| TC-KIT-10~16 | 조립·추천 | Task 3 | `kit-assemble.test.ts`, `kit-recommend.test.ts` |
| TC-KIT-20~25 | 자동 검사·줄 비교 | Task 3 | `kit-checks.test.ts` |
| TC-TAILOR-03, 09~16 | 조립 저장·AI 작업 | Task 4 | `tailor-task.test.ts`, `prompts.test.ts` |
| TC-SUBMIT-01~07 | 제출 서류 | Task 5 | `submitted.test.ts`, `search.test.ts` |
| TC-PDF-01~09 | PDF·md | Task 6 | `pdf.test.ts` |
| TC-STATS-15~17 | 통계 | Task 8 | `stats.test.ts` |
| TC-RESUME-DIFF-01 | 버전 비교 | 문장·목록·순서 변경, 같으면 [] | `resume-diff.test.ts` |
| TC-TAILOR-E2E-01 | 키트 | 예시 키트 올리기 → 직무·프로필 표, 오류 키트 올리기 → 오류 목록, 맞춤 탭은 앞 키트 사용 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-02 | 프로필 고르기·조립 | 추천 프로필에 "추천", 공고 단어 3개, 추가 조정 체크 → [맞춤본 만들기] → 바로 r1(진행 표시 없음), 남은 추가 조정 표시 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-03 | 용어 맞추기 | [공고 용어 맞추기] → 진행 → r2, 자동 검사 경고(새 수치·자기소개 되돌림), 바뀐 곳에 이유 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-04 | 다듬기 | 빈 입력 비활성, 요청 → r3, 리비전 선택 `rev=` | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-05 | 내려받기 | 이력서·경력기술서 PDF·md, 공고.md, 파일명 규칙 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-06 | 키트 바뀜 | 새 키트 올림 → "키트가 바뀜" 안내 → [새 키트로 다시 조립] → 같은 프로필로 새 리비전 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-07 | 키트 없음·분석 전 | 안내 문구와 비활성 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-08 | 지원 완료 | 기본값 맞춤 r2 → 저장만 → 지원 기록 "맞춤 이력서 r2 (프로필)" [보기], 대시보드 이력서별 "맞춤 이력서" | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-09 | 배치 | 폭 1440·1024, 긴 내용(긴 프로필 이름, 긴 단어, 긴 경고 문장)에서 잘림·한글 끊김 없음(스크린샷) | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-10 | 수정 창 | 이력서를 "기본 서류 FDE"로 바꿈 → 라벨 바뀜 | `14-tailored.spec.ts` |
| TC-TAILOR-E2E-11 | 통계 | 맞춤 효과 두 줄, 프로필별 표, 기록 없을 때 안내 | `13-stats.spec.ts` |
| TC-TAILOR-E2E-12 | 체크리스트 | 가이드 체크리스트 문장이 보이고 체크는 새로고침 뒤에도 이 브라우저에 남음 | `14-tailored.spec.ts` |
| TC-TAILOR-M1 | 실제(수동, 병합 뒤 사용자) | 실제 키트 올리기 → 오류 없음, 부품 짝짓기 표가 맞는지 / 실제 공고 1건 조립 → 사용자 가이드대로 손으로 한 결과와 같은지 / 용어 맞추기 1회 + 다듬기 1회(opus 2회) | 수동 |
| TC-TAILOR-M2 | 실제 PDF(수동) | 앱 PDF를 사용자 PDF 도구 결과와 나란히 열어 모양·쪽 넘김 비교 | 수동 |

## Spec 대비 범위

| 설계서 항목 | 이 계획 |
|---|---|
| 7.5 맞춤 이력서(프로필 방식), 대화로 다듬기, 리비전, PDF | Task 1, 3, 4, 6, 7 |
| 7.11 서류 키트 | Task 2, 7 |
| 7.4·7.9 제출 서류(D-23) | Task 5, 7 |
| 7.10 맞춤 효과(D-24), 프로필별(D-29) | Task 8 |
| 9.4 다듬기 새 실행(D-11) | Task 4 |
| 11 PDF | Task 6 |
| 5.3 버전 비교(D-07) | Task 7 Step 4 |
| 반목표 "지어내기 금지" | 코드 조립 + 프롬프트 규칙 + 자동 검사 |

미룬 것: 공고 분석의 입력을 앱 JSON 이력서에서 기본 서류 md로 바꾸는 것(다음 작업 후보), 추가 조정별 통계, 지원 현황 표 내보내기, 체크리스트 체크를 기록으로 남기기, 경력기술서를 맞춤본·기본 서류로 냈는지 따로 기록하기.
