# 2단계 추가: 통계 화면 구현 계획

> **For agentic workers:** 테스트를 먼저 쓰고(실패 확인) → 구현 → 통과 확인 → 커밋. Task 순서대로 한다. 작업 기록: [docs/work/stats-dashboard.md](../work/stats-dashboard.md)

- 작성: 2026-11-19 (D-18·D-19·D-20·D-21 결정 반영)
- 선행: `docs/plans/phase-2-past-records.md`(완료, Task 7 "과제·코딩테스트" 상태 포함). `applications.submitted_docs`, `src/lib/applications/stages.ts`(`reachedStages`), `src/lib/documents/files.ts`(`docLabel`, `parseDocFileName`)를 쓴다.

**Goal:** 지원 기록만으로 서류 통과율을 기간(월·년), 서류 버전, 사이트, 요일별로 보고, 단계별 흐름을 본다. 새 화면 `/stats`를 만들고, 대시보드 묶음의 통과율도 같은 정의로 맞춘다. (기획서 7.10, 화면 문서 10장)

**Architecture:**
- 집계는 `src/lib/stats/`의 순수 함수로 한다.
  - 지원 기록을 한 번 읽어 `StatItem[]`로 만들고, 나머지는 메모리에서 집계한다.
  - 수백 건 규모라 요청당 쿼리는 3회(지원 기록, 상태 이력, 기본 이력서 버전)면 충분하다.
- 그래프는 서버 컴포넌트가 SVG로 그린다. 클라이언트 JS와 새 의존성이 없다(D-20).
- 전환과 필터는 모두 주소 파라미터로 한다.
- 스키마 변경은 없다. `claude` 호출은 0회다.

**Tech Stack:** 1·2단계와 같다. 새 패키지는 없다.

**Spec:** `docs/spec/product.md` 7.2·7.10, `docs/spec/screens.md` 1장·10장, `docs/design/design.md` 7장, 와이어프레임 `docs/design/wireframes/stats.html`

## Global Constraints

- 1·2단계 계획의 Global Constraints는 모두 적용한다.
- 새 npm 패키지를 추가하지 않는다(D-20). 그래프는 SVG 요소로 직접 그린다.
- 입력 부담을 늘리지 않는다. 통계 화면에는 저장 동작이 없다(읽기 전용).
- 기간 기준은 모두 지원일(`applied_at`, YYYY-MM-DD)이다. 정렬용 일시(`applied_datetime`)는 쓰지 않는다(D-17).
- 결과 분류와 비율 정의는 대시보드와 통계 화면이 **같은 함수**를 쓴다(D-18).

## Review Focus

1. **정의 일치**: 대시보드 묶음 머리와 통계 화면의 같은 조건 숫자가 같아야 한다. 예: 사이트 원티드, 기간 전체. → TC-STATS-14, E2E-07
2. **날짜 경계**: 무응답 30일 경계, 윤년, 오늘이 속한 달의 `partial`. 문자열 날짜를 `Date.UTC`로 비교해서 시간대 영향이 없어야 한다. → TC-STATS-01·03·04
3. **되돌린 상태**: 지금 상태가 지원이면 이력에 서류합격이 있어도 통과가 아니다(`reachedStages` 규칙). → TC-STATS-10
4. **0으로 나누기**: 모든 비율은 분모 0이면 null이고, 화면은 "–"를 보인다. NaN·Infinity가 화면에 나오면 안 된다.
5. **SVG 크기**: 막대 0건, 최대값 0, 24개월 이상 긴 기간에도 겹치거나 깨지지 않아야 한다(`niceMax(0) = 1`).

## File Structure

```
src/lib/
  domain/dates.ts            (수정) daysBetween, weekdayMon0
  applications/repo.ts       (수정) listReachedHistory  ← search/dashboard.ts의 readReached를 옮김
  stats/outcome.ts           (새) NO_RESPONSE_DAYS, Outcome, classifyOutcome  (순수)
  stats/rates.ts             (새) Tally, tally, sampleLevel, formatPercent    (순수)
  stats/aggregate.ts         (새) byPeriod, byDocVersion, bySite, funnel, byWeekday (순수)
  stats/load.ts              (새) StatItem, loadStatItems, getStats          (DB 읽기)
  stats/params.ts            (새) parseStatsParams, statsHref, toStatsQuery
  stats/chart-scale.ts       (새) niceMax, ticks                             (순수)
  search/dashboard.ts        (수정) DashboardGroup.tally, groupDashboardRows(rows, by, today)
src/app/
  stats/page.tsx             (새) 통계 화면
  stats/StatsFilters.tsx     (새, 클라이언트) 기간·사이트
  stats/SummaryCards.tsx     (새) S1
  stats/StackedBarChart.tsx  (새, SVG) S2
  stats/HBarChart.tsx        (새, SVG) S3·S4·S5
  stats/ColumnChart.tsx      (새, SVG) S7
  stats/StatsTable.tsx       (새) 공용 표
  _components/RateText.tsx   (새) 비율 문구 + 표본 표시 (대시보드·통계 공용)
  _components/Nav.tsx        (수정) "통계" 링크
  _components/DashboardViews.tsx (수정) 묶음 머리 통과율, today prop
  page.tsx                   (수정) "통계 보기 →", today 전달
tests/
  stats.test.ts              (새) Task 1·2 단위·통합
  search.test.ts, stages.test.ts (수정) 묶음 통과율 기대값
  e2e/13-stats.spec.ts       (새)
```

---

### Task 1: 날짜 도우미, 결과 분류, 비율

**Files:**
- Modify: `src/lib/domain/dates.ts`, `src/lib/applications/repo.ts`, `src/lib/search/dashboard.ts`(가져오는 곳만 바꿈)
- Create: `src/lib/stats/outcome.ts`, `src/lib/stats/rates.ts`, `tests/stats.test.ts`

**Interfaces:**

```ts
// src/lib/domain/dates.ts
/** to − from 일수. 둘 다 YYYY-MM-DD. Date.UTC로 계산해 시간대 영향이 없다. */
export function daysBetween(from: string, to: string): number;
/** YYYY-MM-DD의 요일. 0=월 … 6=일 */
export function weekdayMon0(date: string): number;

// src/lib/applications/repo.ts
/** 상태 이력 중 REACHED_STAGES(서류합격·과제·코딩테스트·면접·최종합격) 행을 지원 기록별로 모은다. (dashboard.ts readReached를 옮김) */
export function listReachedHistory(db?: Db): Map<number, ApplicationStatus[]>;

// src/lib/stats/outcome.ts (순수)
export const NO_RESPONSE_DAYS = 30;
export type Outcome = 'passed' | 'rejected' | 'no_response' | 'pending' | 'withdrawn';
export const OUTCOMES: Outcome[]; // 위 순서
export const OUTCOME_LABELS: Record<Outcome, string>; // 서류 통과 / 불합격 / 무응답 / 대기 / 지원취소
/**
 * 위에서부터 처음 맞는 것:
 * reached에 document_passed → passed, status withdrawn → withdrawn, rejected → rejected,
 * applied이고 daysBetween(appliedAt, today) < noResponseDays → pending, 그 밖 applied → no_response.
 * status가 document_passed·assignment·interview·final_passed면 reachedStages 규칙상 reached에 document_passed가 있다.
 */
export function classifyOutcome(
  a: { status: ApplicationStatus; appliedAt: string; reached: readonly ReachedStage[] },
  today: string,
  noResponseDays?: number,
): Outcome;

// src/lib/stats/rates.ts (순수)
export const MIN_SAMPLE = 5;
export const ENOUGH_SAMPLE = 20;
export type SampleLevel = 'none' | 'few' | 'low' | 'ok';
export type Tally = {
  total: number; passed: number; rejected: number; noResponse: number; pending: number; withdrawn: number;
  sample: number;               // passed + rejected + noResponse
  passRate: number | null;      // passed / sample, sample 0이면 null
  decidedRate: number | null;   // passed / (passed + rejected), 분모 0이면 null
  noResponseRate: number | null;// noResponse / sample
  sampleLevel: SampleLevel;     // sample 기준
  decidedLevel: SampleLevel;    // passed + rejected 기준
};
export function tally(outcomes: readonly Outcome[]): Tally;
/** 0 → none, 1~4 → few, 5~19 → low, 20+ → ok */
export function sampleLevel(n: number): SampleLevel;
/** 0.01918 → "1.9%", 1 → "100%", 0 → "0.0%" (소수 한 자리, 100%만 정수) */
export function formatPercent(rate: number): string;
```

- [ ] **Step 1: 실패하는 테스트** `tests/stats.test.ts`
  - TC-STATS-01 `classifyOutcome`: today `2026-11-30`, 지원일이 29일 전이면 pending, 30일 전이면 no_response, 당일이면 pending. 불합격 + reached [서류합격]이면 passed. 지원취소 + reached []이면 withdrawn. 불합격 + []이면 rejected. noResponseDays 7이면 8일 전 지원은 no_response.
  - TC-STATS-02 `tally`·`sampleLevel`·`formatPercent`: 통과 2·불합격 1·무응답 7·대기 3·취소 1이면 total 14, sample 10, passRate 0.2, decidedRate 2/3, noResponseRate 0.7. 0/4/5/19/20은 none/few/low/low/ok. 0.01918은 "1.9%". 빈 배열이면 모든 rate가 null.
  - TC-STATS-03 `daysBetween`·`weekdayMon0`: 2026-02-28→2026-03-01 = 1, 2024-02-28→2024-03-01 = 2, 같은 날 0, 거꾸로면 음수. 2026-11-16 = 0, 2026-11-22 = 6.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현한다.
  - `readReached`를 `listReachedHistory`로 옮기고 `dashboard.ts`가 그것을 쓰게 바꾼다. 동작은 그대로다. 기존 `tests/search.test.ts`, `tests/stages.test.ts`가 그대로 통과해야 한다.
- [ ] **Step 4:** PASS, 그리고 `npm test` 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: stats outcome classification and rates`.

---

### Task 2: 읽기, 집계, 주소, 축

**Files:**
- Create: `src/lib/stats/load.ts`, `src/lib/stats/aggregate.ts`, `src/lib/stats/params.ts`, `src/lib/stats/chart-scale.ts`
- Modify: `tests/stats.test.ts`

**Interfaces:**

```ts
// src/lib/stats/load.ts
export type DocKind = 'resume' | 'career' | 'portfolio';
export type StatItem = {
  applicationId: number; companyId: number; site: SiteId; appliedAt: string; status: ApplicationStatus;
  reached: ReachedStage[]; outcome: Outcome;
  baseVersionNo: number | null;                       // submitted_resume.kind === 'base'일 때 버전 번호
  docs: Record<DocKind, string | null>;               // submitted_docs 값: 파일 이름, 'none'(없음, 경력기술서·포트폴리오), null(모름)
};
export type StatsQuery = { site?: SiteId; from?: string; to?: string }; // 지원일 기준, 양끝 포함
/** applications(site·기간 조건) + listReachedHistory + resume_versions. today = todayLocal(now) */
export function loadStatItems(q: StatsQuery, now?: Date, db?: Db): StatItem[];

export type StatsData = {
  isEmptyAll: boolean;                  // 필터와 관계없이 지원 기록 0건
  firstMonth: string | null;            // 필터 결과 중 가장 이른 지원월 YYYY-MM
  lastMonth: string | null;
  summary: Tally & { assignment: number; interview: number; final: number }; // 과제·코딩테스트·면접·최종합격을 거친 수
  periods: PeriodBucket[];
  docs: DocBucket[];
  sites: SiteBucket[];
  funnel: FunnelStep[];
  weekdays: WeekdayBucket[];
};
export function getStats(
  p: { query: StatsQuery; unit: 'month' | 'year'; doc: DocKind },
  now?: Date,
  db?: Db,
): StatsData;

// src/lib/stats/aggregate.ts (순수)
export type PeriodBucket = { key: string; label: string; partial: boolean; tally: Tally }; // key YYYY-MM 또는 YYYY
/** range.from 없으면 가장 이른 지원일의 단위부터, range.to 없으면 today의 단위까지. 빈 단위도 0건으로 넣는다. items가 비면 [] */
export function byPeriod(items: StatItem[], unit: 'month' | 'year', range: { from?: string; to?: string }, today: string): PeriodBucket[];
export type DocBucket = { key: string; label: string; unknown: boolean; absent: boolean; firstApplied: string | null; lastApplied: string | null; tally: Tally };
/** resume: 기본 v{n}(번호 ↓) → 파일(날짜 ↓, 라벨 docLabel) → 모름. career·portfolio: 파일 → 없음(key 'absent', absent true, 값 DOC_NONE) → 모름(key 'none', unknown true). 0건 묶음은 없음. (2026-11-20 "없음" 추가: 계획 phase-2-past-records Task 8) */
export function byDocVersion(items: StatItem[], kind: DocKind): DocBucket[];
export type SiteBucket = { site: SiteId; tally: Tally };
export function bySite(items: StatItem[]): SiteBucket[]; // SITE_IDS 순서, 0건 제외
export type FunnelStep = {
  stage: 'applied' | 'document_passed' | 'assignment' | 'interview' | 'final_passed';
  count: number;
  ofPrev: number | null;
  optional: boolean; // assignment만 true(거치지 않을 수 있는 곁가지)
};
/**
 * 순서: applied, document_passed, assignment, interview, final_passed (항상 5개).
 * applied = 전체 − outcome withdrawn. 나머지는 reached에 그 단계가 있는 수.
 * ofPrev의 "앞 단계"는 optional이 아닌 바로 앞 단계다: assignment·interview 모두 document_passed 대비.
 */
export function funnel(items: StatItem[]): FunnelStep[];
export type WeekdayBucket = { weekday: number; label: string; tally: Tally };
export function byWeekday(items: StatItem[]): WeekdayBucket[]; // 월~일 7칸 항상

// src/lib/stats/params.ts
export const STATS_PERIODS = ['all', '3m', '1y', 'custom'] as const;
export type StatsParams = {
  period: (typeof STATS_PERIODS)[number]; from?: string; to?: string; site?: SiteId;
  unit: 'month' | 'year'; mode: 'count' | 'ratio'; doc: DocKind;
};
export function parseStatsParams(sp: Record<string, string | string[] | undefined>): StatsParams;
/** /stats?… 기본값(all, month, count, resume)은 생략 */
export function statsHref(p: Partial<StatsParams>): string;
/** periodRange(dashboard-params.ts) 재사용 */
export function toStatsQuery(p: StatsParams, now?: Date): StatsQuery;

// src/lib/stats/chart-scale.ts (순수)
/** 1·2·5×10^k 중 n 이상인 가장 작은 값. n ≤ 0이면 1 */
export function niceMax(n: number): number;
/** 0부터 max까지 count칸 눈금(기본 4) */
export function ticks(max: number, count?: number): number[];
```

- [ ] **Step 1: 실패하는 테스트** (`tests/stats.test.ts`에 추가)
  - TC-STATS-04 `byPeriod` 월: 2026-01-10, 2026-03-05 기록, today 2026-03-20이면 01·02·03 세 칸이고 02는 total 0, 03만 partial. range `{from:'2025-12-01'}`이면 2025-12부터.
  - TC-STATS-05 `byPeriod` 년: 2024·2026 기록, today 2026-..이면 2024·2025·2026이고 2026만 partial.
  - TC-STATS-06 `byDocVersion`: 기본 v1·v2, 이력서 파일 2개, 모름이 섞여 있으면 순서는 v2, v1, 이력서 2026-11-02, 이력서 2026-09-05, 모름. first/lastApplied가 맞고, `career`는 기본 버전을 무시한다. (Task 8 추가, TC-PAST-75) `career`에 파일 2개·없음·모름이 섞이면 경력기술서 2026-11-02, 2026-10-17, 없음(absent), 모름(unknown) 순.
  - TC-STATS-07 `bySite`: 순서와 0건 제외, 기타 포함.
  - TC-STATS-08 `funnel`: 통과 못 한 지원취소는 지원에서 뺀다. optional이 아닌 단계(지원·서류 통과·면접·최종합격) 수는 줄어들기만 한다. 앞 단계 0이면 ofPrev null. 과제 단계: 서류합격 3(그중 과제 1, 과제 없이 면접 2)이면 assignment count 1·ofPrev 1/3, interview count 2·ofPrev 2/3(서류 통과 대비), assignment만 optional true.
  - TC-STATS-09 `byWeekday`: 기록이 없어도 7칸이고, 라벨은 "월"~"일".
  - TC-STATS-10 `loadStatItems`(임시 DB, `makeTestDb`):
    - 사이트·기간 필터가 지원일 양끝을 포함한다.
    - `docs`를 읽는다.
    - 서류합격 → 지원취소 기록은 passed다.
    - 서류합격 → 지원(되돌림)은 통과가 아니다. 지원일에 따라 pending 또는 no_response다.
  - TC-STATS-11 `getStats`: 빈 DB면 isEmptyAll true. 기록이 있고 필터 결과가 0이면 false이고 summary.total 0. summary.interview는 면접을 거친 수, summary.assignment는 과제·코딩테스트를 거친 수다. 지금 상태가 과제·코딩테스트인 기록은 passed다.
  - TC-STATS-12 params: 잘못된 unit·mode·doc·site는 기본값이 된다. `period=month`는 all이 된다. custom이 아니면 from/to를 무시한다. statsHref에서 기본값은 생략된다. toStatsQuery('3m')는 dashboard `periodRange`와 같다.
  - TC-STATS-13 chart-scale: niceMax 0→1, 7→10, 13→20, 46→50, 329→500. ticks(20)은 [0,5,10,15,20].
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS, 그리고 전체 PASS.
- [ ] **Step 5:** 커밋 `feat: stats aggregation`.

---

### Task 3: 통계 화면과 SVG 그래프

**Files:**
- Create: `src/app/stats/page.tsx`, `StatsFilters.tsx`, `SummaryCards.tsx`, `StackedBarChart.tsx`, `HBarChart.tsx`, `ColumnChart.tsx`, `StatsTable.tsx`, `src/app/_components/RateText.tsx`, `tests/e2e/13-stats.spec.ts`
- Modify: `src/app/_components/Nav.tsx`

**Interfaces (컴포넌트 props)**
- `RateText({ passed, sample, rate, level, compact? })`: 표본 규칙대로 문구를 만든다.
  - none이면 "–"와 보조 글자 "결과 없음"(compact면 "결과 대기")
  - few면 "표본 부족 (n=3)"
  - low면 `12.5% (1/8)`와 "표본 적음" 배지
  - ok면 `1.9% (9/469)`
- `StackedBarChart({ buckets: PeriodBucket[]; mode: 'count' | 'ratio' })`
  - 계열 순서(아래→위): 통과, 불합격, 무응답, 대기
  - 막대 위에 통과율 숫자를 쓴다. few·none이면 "–"다.
  - x축 라벨: 월 단위는 해가 바뀌는 칸만 `YY-MM`, 나머지는 `MM`. partial 칸에는 "(진행 중)"을 붙인다.
- `HBarChart({ rows: { key; label; sub?; total; passed; color?; tally }[] })`: 길이는 지원 수(최대값 기준)이고, 통과 부분을 진하게 그린다. 오른쪽에 `RateText`를 둔다.
- `ColumnChart({ cols: { label; total; passed; tally }[] })`: S7에 쓴다.
- 공통: `<svg viewBox>` + `width="100%"`. 막대마다 `<title>`을 단다. 클라이언트 JS는 없다. 색은 design.md 7장.

**화면**: 배치는 와이어프레임 S-1~S-4를 따르고, 문구·상황별 표시는 화면 문서 10장을 따른다.
- `Nav.tsx`의 `LINKS`에서 대시보드 다음에 `{ href: "/stats", label: "통계" }`를 넣는다.
- 단계별 흐름(S5): `optional` 단계(과제·코딩테스트)는 줄을 들여 쓰고 이름 옆에 보조 글자 "(거치지 않을 수 있음)"을 단다. 막대 색은 design.md 7장(청람 `#1F5FAD`). 0건이어도 줄은 보인다.

- [ ] **Step 1: E2E 먼저** `tests/e2e/13-stats.spec.ts`
  - 시드의 지원일은 오늘 기준 상대 날짜로 만든다.
  - TC-STATS-E2E-01 내비 "통계" → `/stats`. 카드 6개와 "기간별 지원과 결과"가 보이고, "표로 보기"를 펼치면 행이 나온다.
  - TC-STATS-E2E-02 [연별]을 누르면 주소에 `unit=year`가 생기고 표 첫 열이 연도가 된다. [비율]을 누르면 `mode=ratio`.
  - TC-STATS-E2E-03 사이트 원티드를 고르면 카드 "지원" 숫자가 원티드 시드 건수와 같다. S4는 한 줄이고 "사이트 필터 적용 중"이 보인다.
  - TC-STATS-E2E-04 빈 DB(`empty-*` 방식)에서는 빈 상태 문구와 [공고 등록]이 보인다. 직접 지정 기간에 0건이면 [필터 지우기]를 누르고 `/stats`로 간다.
  - TC-STATS-E2E-05 [경력기술서]를 누르면 `doc=career`가 되고 묶음 라벨이 `경력기술서 …`가 된다.
  - TC-STATS-E2E-06 분모 3인 묶음은 "표본 부족 (n=3)", 분모 8인 묶음은 "표본 적음"으로 보인다.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS, 그리고 `npm test`, `npm run test:e2e`, `npm run lint`, 타입, 빌드.
- [ ] **Step 5:** 커밋 `feat: stats screen with svg charts`.

---

### Task 4: 대시보드 통과율 통일과 연결

past-records Task 6의 묶음 통과율(`passed`/`decided`)을 이 계획의 `Tally`로 바꾼다. 거친 단계 규칙은 Task 6 그대로다. 달라지는 것은 분모에 무응답(30일 넘은 '지원')을 더하는 것 하나뿐이다.

**Files:**
- Modify: `src/lib/search/dashboard.ts`, `src/app/_components/DashboardViews.tsx`, `src/app/page.tsx`, `tests/search.test.ts`, `tests/e2e/01-dashboard.spec.ts`(묶음 머리 문구가 바뀌면)

**Interfaces:**
- `DashboardGroup = { key; label; rows; tally: Tally }`. `passed`·`decided`는 지운다.
- `groupDashboardRows(rows, by, today: string)`: 각 행에 `classifyOutcome({status, appliedAt, reached}, today)`를 적용해 `tally`를 만든다.
- `DashboardViews`에 `today` prop을 더한다. `page.tsx`가 `todayLocal()`을 넘긴다.
- 묶음 머리 문구는 `서류 통과 {passed} / {sample} · {RateText compact}`다. sample이 0이면 "결과 대기"만 쓴다.
- 요약 줄 "분석한 공고 N건 보기 →" 옆에 `<Link href={statsHref({ site, period, from, to })}>통계 보기 →</Link>`를 둔다. 대시보드 period가 `month`면 period를 넘기지 않는다.

- [ ] **Step 1: 실패하는 테스트**
  - TC-STATS-14 `tests/search.test.ts`: Task 6 시나리오(A 서류합격→불합격, B 서류합격→면접, C 지원, D 불합격)를 쓴다. today는 C 지원일 + 10일과 + 40일 두 가지다.
    - +10일이면 사이트 묶음 tally가 passed 2, sample 3, pending 1이다.
    - +40일이면 passed 2, sample 4, noResponse 1이다.
    - 기존 TC-PAST-54(`passed 2, decided 3`) 단언을 이 단언으로 바꾼다.
  - TC-STATS-E2E-07: 대시보드에서 사이트 원티드와 기간 최근 1년을 고르고 "통계 보기 →"를 누르면 `/stats?period=1y&site=wanted`로 간다. 사이트별 보기 묶음 머리에 `서류 통과` 문구가 보인다.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** 전체 검사 PASS.
- [ ] **Step 5:** 커밋 `feat: dashboard pass rate uses stats definition`.

---

## 테스트 케이스

| ID | 대상 | 종류 | 위치 |
|---|---|---|---|
| TC-STATS-01 | `classifyOutcome` | 단위 | stats |
| TC-STATS-02 | `tally`·`sampleLevel`·`formatPercent` | 단위 | stats |
| TC-STATS-03 | `daysBetween`·`weekdayMon0` | 단위 | stats |
| TC-STATS-04 | `byPeriod` 월 | 단위 | stats |
| TC-STATS-05 | `byPeriod` 년 | 단위 | stats |
| TC-STATS-06 | `byDocVersion` | 단위 | stats |
| TC-STATS-07 | `bySite` | 단위 | stats |
| TC-STATS-08 | `funnel` | 단위 | stats |
| TC-STATS-09 | `byWeekday` | 단위 | stats |
| TC-STATS-10 | `loadStatItems` | 통합 | stats |
| TC-STATS-11 | `getStats` | 통합 | stats |
| TC-STATS-12 | 주소 파라미터 | 단위 | stats |
| TC-STATS-13 | 축 눈금 | 단위 | stats |
| TC-STATS-14 | 대시보드 묶음 통과율 | 통합 | search |
| TC-STATS-E2E-01~07 | 화면·전환·필터·빈 상태·서류 종류·표본·대시보드 연결 | E2E | 13-stats |
| TC-STATS-M1 | 실제 데이터 숫자 | 수동 | 개인 데이터라 자동 불가 |

기대 결과는 [docs/test/test-cases.md](../test/test-cases.md) 11장에 있다.

## Spec 대비 범위

| 기획서 | 이 계획 |
|---|---|
| 7.10 결과 분류·비율 | Task 1 |
| 7.10 S1~S5·S7 | Task 2·3 |
| 7.2 대시보드 묶음 통과율 | Task 4 |
| S6 서류 통과까지 걸린 일수 | **범위 밖**(D-21) |
| S8 재지원, S9 적합도별, 시간대별, 포지션 키워드별 | **범위 밖**(데이터가 쌓인 뒤 다시 검토) |
| 통계 목업(디자인 B) | **범위 밖**. 와이어프레임 + design.md 7장 색 표로 구현 |
