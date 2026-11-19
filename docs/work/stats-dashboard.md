# 통계 화면

> 형식: `docs/work/_template.md`. 기능 워크플로우의 단계 사이에 넘기는 내용을 여기에 모은다.

- 요청: 대시보드에서 월/년별 지원 수와 서류 합격률, 이력서별 지원 수와 서류 합격률 등 취업 전략에 필요한 통계를 볼 수 있는 화면(가능하면 그래프 포함). 보여줄 내용과 화면 구성부터 기획한다.
- 브랜치: `feat/stats-dashboard` (past-records 병합 뒤 생성)
- 상태: 설계 중
- 관련 결정: D-15(서류 파일 이름 참조), D-17(정렬용 지원 일시)

## 1. 설계 (product-planner)

- 작성: 2026-11-19, product-planner. 실제 `claude` 호출 0회.
- 와이어프레임: [../design/wireframes/stats.html](../design/wireframes/stats.html)
- 전제: past-records(`docs/work/past-records.md`)가 먼저 병합되어 `applications.submitted_docs`(종류별 파일 이름)가 있어야 한다. 이 설계는 그 칸을 읽기만 한다.
- 열린 결정: D-18(무응답 처리·통과율 정의), D-19(화면 위치), D-20(그래프 구현 방식), D-21(1차 범위). 아래 "정할 것 초안" 참고. **D-18 답에 따라 숫자 정의가 바뀌므로 사용자 검토 때 함께 정한다.**

### 1.1 왜 기존 통과율로는 안 되는가 (확인한 사실)

- 지금 대시보드의 서류 통과율은 `통과 / 판정`이고, 판정에서 `applied`·`withdrawn`을 뺀다(`src/lib/search/dashboard.ts:118-128`).
- 실제 데이터 성격: 469건 중 지원 460, 면접 6, 서류합격 1, 지원취소 2. 불합격 기록은 0건이다. 그래서 판정 = 7건 안팎이고 통과율은 거의 늘 100%가 된다. 전략 판단에 쓸 수 없다.
- 또 현재 상태만 보므로, **서류를 통과한 뒤 지원취소·불합격이 된 기록은 통과로 세지 않는다**(`makeGroup`이 `r.status`만 봄, `dashboard.ts:121-128`). 서류 통과 9건은 상태 이력(`status_events`)에 서류합격 날짜가 있는데, 지금 상태가 면접 6·서류합격 1이므로 나머지 2건은 다른 상태로 바뀐 것으로 **추정**한다.
- 가져온 기록의 첫 상태 이력 `at`은 실제 날짜가 아니라 가져온 시각이다(`src/lib/applications/repo.ts:121`). [지원 완료]의 첫 이력도 저장 시각이다(`repo.ts:45`). 그래서 "걸린 일수"는 첫 이력을 빼고 계산해야 한다.

### 1.2 목표와 범위

**목표**: 지원 기록만으로(추가 입력 없이) "언제·어디에·어떤 서류로 지원했을 때 서류가 잘 통과했는지"를 숫자와 그래프로 본다.

1. 새 화면 `/stats`(D-19 추천안). 상단 내비게이션에 "통계", 대시보드 요약 줄에 "통계 보기 →".
2. 지원 결과를 **5가지 결과**로 나누는 공통 규칙(1.3)과, 통과율 2종(1.4).
3. 1차 범위(D-21 추천안)의 통계 7가지(1.5의 S1~S7).
4. 그래프는 외부 라이브러리 없이 서버에서 그리는 SVG(D-20 추천안). 모든 그래프 아래에 같은 숫자의 표.
5. 대시보드 사이트별·이력서별 묶음의 통과율도 같은 정의로 바꾼다(D-18 추천안 c-1).

**만들지 않는 것**

- 상태를 일괄로 "불합격"으로 바꾸는 기능, 무응답 기록에 대한 알림·할 일. 기록 부담을 늘리지 않는다(반목표 3장).
- 시간대별 통계. 정렬용 일시(`applied_datetime`)는 실제 지원 시각이 아닐 수 있다(D-17, 기획서 10장).
- 포지션 키워드별 통계(키워드 사전이 필요함 → 나중, P3).
- 무응답 기준 일수(N)를 설정 화면에서 바꾸는 것. 코드 상수로 둔다(D-18).
- 통계 내보내기(CSV·이미지), 목표치 설정, 예측. AI 분석(`claude` 호출 0회).
- 스키마 변경. 새 테이블·칸 없음.

### 1.3 결과 분류 (모든 통계의 바탕)

지원 기록 하나를 아래 순서로 판정한다. "도달 단계"는 **현재 상태와 상태 이력 전체** 중 가장 높은 단계다.

| 도달 단계 `ReachedStage` | 조건 |
|---|---|
| `final` | 상태 또는 이력에 `final_passed` |
| `interview` | 위가 아니고, 상태 또는 이력에 `interview` |
| `document` | 위가 아니고, 상태 또는 이력에 `document_passed` |
| `applied` | 그 밖 |

| 결과 `Outcome` | 조건 (위에서부터 처음 맞는 것) | 화면 이름 |
|---|---|---|
| `passed` | 도달 단계가 `document` 이상 | 서류 통과 |
| `withdrawn` | 현재 상태 `withdrawn` | 지원취소 |
| `rejected` | 현재 상태 `rejected` | 불합격 |
| `pending` | 현재 상태 `applied`이고 지원일부터 오늘까지 N일 미만 | 대기 |
| `no_response` | 현재 상태 `applied`이고 N일 이상 | 무응답 |

- N = `NO_RESPONSE_DAYS = 30`(D-18 추천). 경계: `daysBetween(appliedAt, today) >= 30`이면 무응답. 지원일 당일은 0일.
- 서류 통과 뒤 지원취소·불합격이 된 기록은 `passed`다(서류 단계 기준으로는 통과했으므로).
- 오늘 = `todayLocal(now)`.

### 1.4 비율 정의

| 이름 | 식 | 쓰는 곳 |
|---|---|---|
| **서류 통과율** (주 지표) | 통과 ÷ (통과 + 불합격 + 무응답) | 모든 카드·그래프·표, 대시보드 묶음 머리(D-18) |
| 판정 기준 통과율 (참고) | 통과 ÷ (통과 + 불합격) | 요약 카드 보조 줄, 표의 마지막 열 |
| 무응답 비율 | 무응답 ÷ (통과 + 불합격 + 무응답) | 요약 카드, 사이트별 표 |

- 분모 = "결과가 정해진 지원"(`sample`). 대기와 지원취소는 분모에서 뺀다. 그래서 이번 달처럼 대기가 많은 기간도 비율이 낮게 왜곡되지 않는다.
- 표시 형식: `2.1%`(소수 한 자리) 옆에 항상 `9/431`처럼 분자/분모를 쓴다.
- **표본 수 표시** (`sampleLevel`)

| 분모 | 수준 | 비율 칸 표시 | 그래프 |
|---|---|---|---|
| 0 | `none` | "–" + 보조 글자 "결과 없음" | 막대만(개수) |
| 1~4 | `few` | 비율 숨김, "표본 부족 (n=3)" | 막대만, 비율 점 없음 |
| 5~19 | `low` | `12.5% (1/8)` + 회색 "표본 적음" 작은 배지 | 비율 점을 속 빈 원으로 |
| 20 이상 | `ok` | `2.1% (9/431)` | 비율 점을 채운 원으로 |

- 상수: `MIN_SAMPLE = 5`, `ENOUGH_SAMPLE = 20`(`src/lib/stats/rates.ts`).

### 1.5 보여줄 통계

기간 기준은 모두 **지원일**(`applied_at`)이다. 필터(기간·사이트)는 모든 통계에 똑같이 적용된다.

| # | 통계 | 우선 | 목적(어떤 판단에 쓰나) | 정의 | 그래프 |
|---|---|---|---|---|---|
| S1 | 요약 카드 | P1 | 지금 전체 성적을 한눈에 | 지원 수, 서류 통과 수(보조 줄에 면접·최종합격 도달 수), 서류 통과율(+판정 기준 보조 줄), 무응답 비율, 대기 수, 지원취소 수 | 없음(카드 6개) |
| S2 | 기간별 지원과 결과 (월별 / 연별) | P1 **(요청)** | 지원량을 늘렸을 때 통과도 늘었는지, 언제 성적이 좋았는지 | 단위(월·년)마다 결과 5종 개수 + 서류 통과율. 기간 안의 첫 달~마지막 달을 빈 달 없이 채움(0건 달도 막대 자리). 이번 달(올해)은 "진행 중" 표시 | 세로 누적 막대(통과·불합격·무응답·대기; 취소는 표에만) + 서류 통과율 점(오른쪽 축 없이 막대 위 숫자). [개수] / [비율](100% 누적) 전환 |
| S3 | 서류 버전별 지원과 통과율 | P1 **(요청)** | 어느 이력서·경력기술서·포트폴리오 버전이 통과가 잘 됐는지 → 어떤 버전을 계속 쓸지 | 종류 선택 [이력서][경력기술서][포트폴리오]. 묶음 키는 1.6. 묶음마다 지원 수, 통과, 서류 통과율, 그 버전으로 지원한 기간(첫 지원일~마지막 지원일) | 가로 막대(지원 수, 통과 부분 진하게) + 오른쪽 비율 |
| S4 | 사이트별 | P1 | 어느 사이트에 힘을 줄지 | 사이트마다 지원 수, 통과, 서류 통과율, 무응답 비율. `SITE_IDS` 순서, 0건 사이트는 숨김 | 가로 막대(사이트 색) |
| S5 | 단계별 깔때기 | P2(1차 포함 추천) | 어느 단계에서 가장 많이 떨어지는지 | 도달 단계 누적: 지원(전체−취소) → 서류 통과 → 면접 → 최종합격. 단계마다 개수와 앞 단계 대비 % | 가로 막대 4줄(단계 색) |
| S6 | 서류 통과까지 걸린 일수 | P2(1차 포함 추천) | 무응답 기준 N일이 맞는지, 지원 후 얼마나 기다릴지 | 통과 기록 중 "첫 이력을 뺀 이력"에서 처음 나온 `document_passed`·`interview`·`final_passed`의 날짜 − 지원일. 음수는 뺀다. 건수, 중앙값, 최소, 최대, 구간 0~3 / 4~7 / 8~14 / 15~30 / 31일 이상. 날짜가 없는 통과는 "날짜 모름 n건" | 세로 막대 5개(구간) |
| S7 | 요일별 | P2(1차 포함 추천) | 어느 요일에 지원하면 나은지(참고용) | 지원일의 요일(월~일)별 지원 수, 서류 통과율 | 세로 막대 7개 |
| S8 | 같은 회사 재지원 | P2(나중 추천) | 떨어진 회사에 다시 지원할 가치가 있는지 | 회사(`company_id`)별 지원일 순으로 첫 지원 / 두 번째 이후로 나눠 각 서류 통과율. 2건 이상 지원한 회사 수 | 표만 |
| S9 | 적합도 구간별 | P2(나중 추천) | 적합도 몇 점 이상에 지원할지 | 공고 분석이 있는 기록만. 0~49 / 50~69 / 70~84 / 85~100 구간별 서류 통과율. 분석 없는 기록 수 따로 | 가로 막대 |
| — | 시간대별, 포지션 키워드별, 주별 활동량 | P3(안 함) | — | 정렬용 일시가 실제 시각이 아님(D-17) / 키워드 사전 필요 / 월별로 충분 | — |

- P1 = 이번 작업 필수. P2 = 데이터로 바로 계산되고 비용이 작음. 포함 여부는 D-21.
- 현재 데이터 기준 기대 모습(추정): S9는 앱에서 분석한 공고가 적어 대부분 "표본 부족"이 된다. S8도 표본이 작다. 그래서 나중을 추천한다.

### 1.6 서류 버전 묶음 (S3)

- **이력서**: past-records의 대시보드 규칙과 같게 한다(`docs/plans/phase-2-past-records.md:238`).
  1. 앱의 기본 이력서로 지원(`submitted_resume.kind = 'base'`) → `기본 v{n}`, 버전 번호 내림차순
  2. 아니면 `submitted_docs.resume` 파일 → `docLabel` 결과(`이력서 2026-11-02`), 날짜 늦은 순
  3. 둘 다 없음 → "모름" (맨 끝)
- **경력기술서·포트폴리오**: `submitted_docs.career` / `.portfolio` 파일 → 날짜 늦은 순, 없으면 "모름".
- 맞춤 이력서(3단계)가 생기면 그 맞춤본의 기준 기본 버전으로 묶는다(화면 문서 1장 이력서별 규칙과 같음). 지금은 해당 기록 없음.
- "모름" 묶음은 비율을 보여 주되 보조 글자 "버전 파일보다 앞선 지원"을 붙인다.
- 해석 주의 문구(S3 카드 아래, 고정): "버전마다 쓴 기간과 사이트가 다릅니다. 기간·사이트 필터로 조건을 맞춰 비교하세요."

### 1.7 화면 구성 `/stats`

배치는 와이어프레임 [stats.html](../design/wireframes/stats.html) 프레임 S-1~S-4.

```
[상단 내비: 대시보드 · 통계 · 공고 등록 · …]
통계                                   [기간 ▾ 전체] [사이트 ▾ 전체]
결과 분류 안내 한 줄: "지원 후 30일이 지나도 '지원' 상태면 무응답으로 셉니다. ⓘ 용어 설명"

[지원 469] [서류 통과 9] [서류 통과율 2.0%] [무응답 비율 98.0%] [대기 12] [지원취소 2]
                          판정 기준 100% (9/9)

┌ 기간별 지원과 결과 ──────────────── [월별|연별]  [개수|비율] ┐
│ 세로 누적 막대 + 막대 위 통과율                               │
│ 범례: ■통과 ■불합격 ■무응답 □대기                             │
│ ▸ 표로 보기 (details)                                         │
└───────────────────────────────────────────────────────────────┘
┌ 서류 버전별 [이력서|경력기술서|포트폴리오] ┐ ┌ 사이트별 ────────┐
│ 가로 막대 + 표                             │ │ 가로 막대 + 표   │
│ 해석 주의 문구                             │ │                  │
└────────────────────────────────────────────┘ └──────────────────┘
┌ 단계별 깔때기 ┐ ┌ 서류 통과까지 걸린 일수 ┐ ┌ 요일별 ┐       (P2)
└───────────────┘ └─────────────────────────┘ └────────┘
▸ 용어 설명 (details): 결과 5종, 통과율 2종, 표본 수 표시
```

**필터·전환 (모두 주소에 남김)**

| 요소 | 값 | 주소 |
|---|---|---|
| `[기간 ▾]` | 전체 / 최근 3개월 / 최근 1년 / 직접 지정(시작일~종료일). 대시보드의 "이번 달"은 통계에 의미가 적어 뺀다 | `?period=3m\|1y\|custom&from=&to=` (기본 전체는 생략) |
| `[사이트 ▾]` | 전체 / 리멤버 / 원티드 / 그룹바이 / 잡코리아 / 기타 | `?site=` |
| `[월별 \| 연별]` | S2 단위 | `?unit=year` (기본 월별 생략) |
| `[개수 \| 비율]` | S2 막대 모양 | `?mode=ratio` (기본 개수 생략) |
| `[이력서 \| 경력기술서 \| 포트폴리오]` | S3 종류 | `?doc=career\|portfolio` (기본 이력서 생략) |

- 전환은 링크(`statsHref`)로 한다. 클라이언트 상태를 두지 않는다. 필터는 `StatsFilters`(클라이언트, 선택 즉시 `router.replace`).
- 사이트 필터가 걸리면 S4 카드는 그 사이트 한 줄만 보이고 제목 옆에 "사이트 필터 적용 중".
- 상태 필터와 검색어는 두지 않는다(통계는 결과 전체를 나눠 보는 것이라 상태 필터와 맞지 않음).

**요약 카드 문구 (S1)**

| 카드 | 큰 숫자 | 아래 보조 줄 |
|---|---|---|
| 지원 | `469` | `2024-12 ~ 2026-11` (필터 기간 안의 첫·마지막 지원월) |
| 서류 통과 | `9` | `면접 6 · 최종합격 0` |
| 서류 통과율 | `2.0%` | `9 / 455 · 판정 기준 100% (9/9)` — 판정 기준은 분모 5 미만이면 "판정 기준: 표본 부족" |
| 무응답 비율 | `98.0%` | `지원 후 30일 넘게 '지원' 상태` |
| 대기 | `12` | `지원 후 30일 안 됨` |
| 지원취소 | `2` | `통과율 계산에서 뺌` |

(숫자는 예시: 지원 469 = 통과 9 + 불합격 0 + 무응답 446 + 대기 12 + 취소 2, 분모 455. 면접·최종합격 도달 수는 서류 통과 카드 보조 줄에 둔다.)

**표 (S2 "표로 보기", S3·S4는 늘 보임)** 열: 기간(또는 버전·사이트) / 지원 / 통과 / 불합격 / 무응답 / 대기 / 취소 / 서류 통과율 / 판정 기준. 비율 칸은 1.4 표본 규칙대로.

**상황별 표시**

| 상황 | 표시 |
|---|---|
| 지원 기록이 하나도 없음 | 카드·그래프 대신 "아직 지원 기록이 없습니다. 지원 기록이 쌓이면 여기에 통계가 보입니다." + `[공고 등록]` + "이미 지원한 내역이 있다면 → 가져오기" |
| 필터 결과 0건 | "이 기간·사이트에 지원 기록이 없습니다." + `[필터 지우기]`(→ `/stats`) |
| 서류 통과가 0건 | 카드 아래 안내 한 줄: "서류합격·면접 연락을 받았다면 대시보드에서 상태를 바꿔 주세요. 통계가 정확해집니다." (링크 없음, 강요하지 않음) |
| 분모가 1~4 / 5~19 | 1.4 표본 규칙 |
| S6 통과 날짜가 하나도 없음 | "서류 통과 날짜가 있는 기록이 없습니다." |
| S3 선택한 종류의 파일 기록이 하나도 없음 | 묶음 "모름" 한 줄 + "이 종류의 제출 서류 기록이 없습니다" |
| 이번 달·올해 막대 | x축 이름 옆 "(진행 중)", 대기 부분이 많을 수 있음을 범례 아래 작은 글자로 |

**대시보드 변경**

- 요약 줄 오른쪽 "분석한 공고 N건 보기 →" 옆에 "통계 보기 →"(`/stats`, 대시보드의 기간·사이트 필터를 그대로 넘김. `period=month`면 넘기지 않음).
- 사이트별·이력서별 묶음 머리의 통과율을 1.4 "서류 통과율"로 바꾸고 문구를 `서류 통과 9 / 455 · 2.0%`로(D-18 c-1). 분모 0이면 "결과 대기" 유지, 1~4면 "표본 부족".

### 1.8 그래프 색 (디자인 B 토큰 사용)

| 계열 | 색 | 근거 |
|---|---|---|
| 서류 통과 | 하늘 `#0369A1` | 상태 색 "서류합격"(design.md 4장) |
| 면접 (깔때기) | 코발트 `#2342C8` | 상태 색 "면접" |
| 최종합격 (깔때기) | 초록 `#15803D` | 상태 색 "최종합격" |
| 불합격 | 흐린 회색 `#98A0AE` | 상태 색 "불합격" |
| 무응답 | **새 토큰** 연회색 `#D5D9E1` | 불합격과 구분되는 더 옅은 회색. 큰 면적을 차지하므로 눈에 덜 띄어야 함 |
| 대기 | 흰 면 + 회색 `#5B6475` 1px 점선 테두리 | 아직 결과가 아님을 모양으로 |
| 지원 (깔때기 첫 줄) | 회색 `#5B6475` | 상태 색 "지원" |
| 서류 통과율 점·숫자 | 코발트 `#2342C8` | 강조 색 |
| 사이트별 막대 | 사이트 색(design.md 3장) | 다른 화면과 같은 색 = 같은 사이트 |
| 서류 버전·요일·일수 막대 | 코발트 `#2342C8`(통과 부분) + 연회색 `#D5D9E1`(나머지) | 범주에 의미 있는 색이 없으므로 단색 |

- 색만으로 구분하지 않는다. 범례 + 표가 항상 있고, 대기는 점선 테두리로 모양이 다르다. 막대에 SVG `<title>`로 "2026-10 · 통과 2 · 불합격 0 · 무응답 31 · 대기 0"을 넣어 마우스를 올리면 보인다.
- 숫자는 고정폭 숫자(design.md 2장).

### 1.9 데이터·함수 변경

스키마 변경 없음. 새 폴더 `src/lib/stats/`(화면 없이 테스트 가능, `lib`은 `app`을 import하지 않음).

```ts
// src/lib/domain/dates.ts (추가)
/** 두 YYYY-MM-DD 사이의 일수(to - from). 날짜만 비교하므로 시간대 영향 없음. */
export function daysBetween(from: string, to: string): number;
/** YYYY-MM-DD의 요일. 0=월 … 6=일 */
export function weekdayMon0(date: string): number;

// src/lib/stats/outcome.ts
export const NO_RESPONSE_DAYS = 30;
export type ReachedStage = 'applied' | 'document' | 'interview' | 'final';
export type Outcome = 'passed' | 'rejected' | 'no_response' | 'pending' | 'withdrawn';
export function reachedStage(status: ApplicationStatus, eventStatuses: ApplicationStatus[]): ReachedStage;
export function classifyOutcome(
  input: { status: ApplicationStatus; appliedAt: string; reached: ReachedStage },
  today: string,
  noResponseDays?: number, // 기본 NO_RESPONSE_DAYS
): Outcome;
/** 첫 이력(생성 이력)을 뺀 이력 중 처음 통과 단계가 된 날짜(YYYY-MM-DD). 없으면 null */
export function firstPassDate(events: { id: number; status: ApplicationStatus; at: string }[]): string | null;

// src/lib/stats/rates.ts
export const MIN_SAMPLE = 5;
export const ENOUGH_SAMPLE = 20;
export type Tally = {
  total: number; passed: number; rejected: number; noResponse: number; pending: number; withdrawn: number;
  sample: number;              // passed + rejected + noResponse
  passRate: number | null;     // sample 0 이면 null
  decidedRate: number | null;  // passed + rejected 0 이면 null
  noResponseRate: number | null;
  sampleLevel: 'none' | 'few' | 'low' | 'ok';
};
export function tally(outcomes: Outcome[]): Tally;
export function sampleLevel(n: number): Tally['sampleLevel'];
/** "2.1%" 또는 null(표본 부족·없음). 화면 문구 조립은 컴포넌트에서 */
export function formatRate(rate: number | null, n: number): string | null;

// src/lib/stats/load.ts
export type StatItem = {
  applicationId: number; companyId: number; site: SiteId; appliedAt: string;
  reached: ReachedStage; outcome: Outcome; firstPassDate: string | null;
  baseVersionNo: number | null;
  docs: { resume: string | null; career: string | null; portfolio: string | null };
  fitScore: number | null; // P2 S9용. S9를 안 하면 빼도 됨
};
export type StatsQuery = { site?: SiteId; from?: string; to?: string };
/** applications 1회 + status_events 1회 + resume_versions 1회(+ analyses 1회) 읽어 조립. 기간은 지원일 기준 */
export function loadStatItems(q: StatsQuery, now?: Date, db?: Db): StatItem[];

// src/lib/stats/aggregate.ts (전부 순수 함수)
export type PeriodBucket = { key: string; label: string; partial: boolean; tally: Tally };
export function byPeriod(items: StatItem[], unit: 'month' | 'year', range: { from?: string; to?: string }, today: string): PeriodBucket[];
export type DocKind = 'resume' | 'career' | 'portfolio';
export type DocBucket = { key: string; label: string; firstApplied: string | null; lastApplied: string | null; tally: Tally };
export function byDocVersion(items: StatItem[], kind: DocKind): DocBucket[];
export function bySite(items: StatItem[]): { site: SiteId; tally: Tally }[];
export function funnel(items: StatItem[]): { stage: 'applied' | 'document' | 'interview' | 'final'; count: number; ofPrev: number | null }[];
export function daysToPass(items: StatItem[]): {
  count: number; unknown: number; median: number | null; min: number | null; max: number | null;
  buckets: { key: '0-3' | '4-7' | '8-14' | '15-30' | '31+'; count: number }[];
};
export function byWeekday(items: StatItem[]): { weekday: number; label: string; tally: Tally }[];
export type StatsData = {
  isEmptyAll: boolean; // 필터와 관계없이 지원 기록 0건
  firstMonth: string | null; lastMonth: string | null;
  summary: Tally & { interview: number; final: number };
  periods: PeriodBucket[]; docs: DocBucket[]; sites: ...; funnel: ...; days: ...; weekdays: ...;
};
export function getStats(q: StatsQuery & { unit: 'month' | 'year'; doc: DocKind }, now?: Date, db?: Db): StatsData;

// src/lib/stats/params.ts
export type StatsParams = { period: 'all' | '3m' | '1y' | 'custom'; from?: string; to?: string; site?: SiteId;
  unit: 'month' | 'year'; mode: 'count' | 'ratio'; doc: DocKind };
export function parseStatsParams(sp: Record<string, string | string[] | undefined>): StatsParams;
export function statsHref(p: Partial<StatsParams>): string; // 기본값은 생략
export function toStatsQuery(p: StatsParams, now?: Date): StatsQuery; // periodRange 재사용

// src/lib/stats/chart-scale.ts
/** 축 최대값을 1·2·5×10^k 단위로 올림. 0이면 1 */
export function niceMax(n: number): number;
/** 0~max를 count칸(기본 4)으로 나눈 눈금 */
export function ticks(max: number, count?: number): number[];
```

- 이력서 버전 라벨은 past-records의 `docLabel`(`src/lib/documents/files.ts`)을 쓴다. 날짜 늦은 순 정렬은 `parseDocFileName`의 날짜로.
- `byPeriod`: `range.from`이 없으면 items의 가장 이른 지원월부터, `range.to`가 없으면 오늘이 속한 달까지. 0건 달도 넣는다. `partial` = 그 단위가 오늘을 포함.
- 대시보드(D-18 c-1): `DashboardGroup`의 `passed`·`decided`를 `tally: Tally`로 바꾼다. `searchApplications`는 상태 이력을 읽지 않으므로, `groupDashboardRows` 호출 전에 `loadReachedStages(applicationIds, db?): Map<number, ReachedStage>`(load.ts)로 도달 단계를 받아 `classifyOutcome`에 넘긴다. 시그니처: `groupDashboardRows(rows, by, ctx: { reached: Map<number, ReachedStage>; today: string })`.
- 성능: 469건 + 이력 수백 건을 메모리에서 집계. 요청당 쿼리 4회 이하. 인덱스 추가 불필요(추정, 1000건 단위까지 문제 없음).

**화면 파일** (한 화면 전용이므로 `src/app/stats/`)

| 파일 | 종류 | 내용 |
|---|---|---|
| `src/app/stats/page.tsx` | 서버 | `parseStatsParams` → `getStats` → 배치 |
| `src/app/stats/StatsFilters.tsx` | 클라이언트 | 기간·사이트 선택, 직접 지정 날짜 |
| `src/app/stats/SummaryCards.tsx` | 서버 | S1 |
| `src/app/stats/RateText.tsx` | 서버 | 1.4 표본 규칙대로 비율 문구 |
| `src/app/stats/StackedBarChart.tsx` | 서버(SVG) | S2. props: `buckets`, `mode` |
| `src/app/stats/HBarChart.tsx` | 서버(SVG) | S3·S4·S5. props: `rows: {label, total, highlight, color?, rate}` |
| `src/app/stats/ColumnChart.tsx` | 서버(SVG) | S6·S7 |
| `src/app/stats/StatsTable.tsx` | 서버 | 공용 표 |
| `src/app/_components/Nav.tsx` | 수정 | `LINKS`에 `{ href: "/stats", label: "통계" }`를 대시보드 다음에 |
| `src/app/page.tsx`, `src/app/_components/DashboardViews.tsx` | 수정 | "통계 보기 →", 묶음 통과율(D-18 c-1) |

- SVG는 `viewBox`로 그려 너비에 맞춰 늘어나게 한다. 클라이언트 JS 없음. 애니메이션 없음.

### 1.10 테스트 케이스

| ID | 대상 | 기대 결과 |
|---|---|---|
| TC-STATS-01 | `reachedStage` | 이력에 서류합격이 있고 지금 지원취소 → `document`. 면접 뒤 불합격 → `interview`. 이력·상태 모두 지원 → `applied`. 최종합격 → `final` |
| TC-STATS-02 | `classifyOutcome` | 지원 29일 → `pending`, 30일 → `no_response`, 지원 당일 → `pending`. 통과 뒤 지원취소 → `passed`. 통과 없는 지원취소 → `withdrawn`, 불합격 → `rejected`. `noResponseDays` 인자로 경계가 바뀜 |
| TC-STATS-03 | `firstPassDate` | 첫(가장 작은 id) 이력이 면접이어도 무시. 둘째 이력의 서류합격 날짜. ISO 시각 `at`은 로컬 날짜로(`eventDate`). 통과 이력 없으면 null |
| TC-STATS-04 | `tally`·`sampleLevel`·`formatRate` | 통과 2·불합격 1·무응답 7·대기 3·취소 1 → sample 10, passRate 0.2, decidedRate 0.667, total 14. sample 0/4/5/19/20 → none/few/low/low/ok. few·none이면 `formatRate` null, 0.0213 → "2.1%" |
| TC-STATS-05 | `daysBetween`·`weekdayMon0` | 2026-02-28→03-01 = 1, 2024-02-28→03-01 = 2(윤년), 같은 날 0. 2026-11-16 = 0(월), 2026-11-22 = 6(일) |
| TC-STATS-06 | `byPeriod` 월 | 2026-01, 2026-03에만 기록 → 01·02·03 세 칸, 02는 total 0. 오늘이 속한 달 `partial` true. range.from/to 적용 |
| TC-STATS-07 | `byPeriod` 년 | 2024·2025·2026 세 칸, 올해만 `partial` |
| TC-STATS-08 | `byDocVersion('resume')` | 기본 v2 → 기본 v1 → 이력서 2026-11-02 → 이력서 2026-09-05 → 모름 순. first/lastApplied 맞음. 'career'는 파일만 보고 기본 버전은 무시 |
| TC-STATS-09 | `bySite` | `SITE_IDS` 순서, 0건 사이트 없음, 기타 포함 |
| TC-STATS-10 | `funnel` | 취소(통과 없음) 제외한 지원 ≥ 서류 ≥ 면접 ≥ 최종, `ofPrev`는 앞 단계 대비 비율, 앞 단계 0이면 null |
| TC-STATS-11 | `daysToPass` | 날짜 없는 통과는 `unknown`, 음수 제외, 중앙값 홀수·짝수(짝수는 두 값 평균), 구간 경계 3/4, 7/8, 14/15, 30/31 |
| TC-STATS-12 | `byWeekday` | 월~일 7칸 항상, 라벨 "월"~"일" |
| TC-STATS-13 | `loadStatItems`(임시 DB) | 기간·사이트 필터가 지원일 기준으로 적용. `submitted_docs` 읽음. 서류합격→지원취소 기록이 `passed`. 가져온 기록의 첫 이력 시각은 `firstPassDate`에 안 쓰임 |
| TC-STATS-14 | `getStats`(임시 DB) | 기록 0건 → `isEmptyAll` true. 필터 결과 0건이지만 전체는 있음 → false, summary.total 0 |
| TC-STATS-15 | `parseStatsParams`·`statsHref`·`toStatsQuery` | 잘못된 값은 기본값, 기본값은 주소에서 생략, custom이 아니면 from/to 무시, `period=month`는 `all`로 |
| TC-STATS-16 | `niceMax`·`ticks` | 0→1, 7→10, 13→20, 46→50, 329→500. ticks(20,4) = [0,5,10,15,20] |
| TC-STATS-17 | 대시보드 묶음(D-18 c-1) | `groupDashboardRows`가 새 정의로 tally. 통과 뒤 지원취소가 통과로 셈. 기존 `tests/search.test.ts`의 통과율 기대값을 새 정의로 고침 |
| TC-STATS-E2E-01 | 화면 | 내비 "통계" → `/stats`, 요약 카드 6개와 S2 그래프·표가 보임 |
| TC-STATS-E2E-02 | 전환 | [연별] 누르면 주소 `unit=year`, 표 행이 연 단위. [비율] 누르면 `mode=ratio` |
| TC-STATS-E2E-03 | 필터 | 사이트 원티드 → 모든 카드 숫자가 원티드 기록만, S4 한 줄 + "사이트 필터 적용 중" |
| TC-STATS-E2E-04 | 빈 상태 | 기록 0건 DB → 빈 상태 문구와 [공고 등록]. 필터 0건 → [필터 지우기] |
| TC-STATS-E2E-05 | 서류 종류 | [경력기술서] → `doc=career`, 묶음이 경력기술서 파일 기준 |
| TC-STATS-E2E-06 | 표본 표시 | 분모 3인 묶음은 "표본 부족 (n=3)", 분모 8은 "표본 적음" 배지 |
| TC-STATS-E2E-07 | 대시보드 연결 | 대시보드 "통계 보기 →"가 사이트·기간 필터를 넘김 |
| TC-STATS-M1 | 실제 데이터(수동) | 전체 지원 합 = 469, 사이트 합 = 원티드 329·리멤버 70·잡코리아 53·그룹바이 17, 서류 통과 = 9(상태 이력 기준). 메인 세션이 읽기 전용으로 확인 |

- E2E 시드는 기존 e2e 시드 방식을 따르고, 지원일을 `now` 기준 상대 날짜로 만들어 대기/무응답이 날짜에 흔들리지 않게 한다.

### 1.11 구현 순서 (계획 문서로 옮길 Task 초안)

| Task | 내용 | 파일 | 테스트 |
|---|---|---|---|
| 1 | 날짜 도우미, 결과 분류, 비율 | `domain/dates.ts`, `stats/outcome.ts`, `stats/rates.ts` | TC-STATS-01~05 |
| 2 | 읽기·집계·주소·축 | `stats/load.ts`, `stats/aggregate.ts`, `stats/params.ts`, `stats/chart-scale.ts` | 06~16 |
| 3 | `/stats` 화면, SVG 그래프 3종, 내비 | `src/app/stats/*`, `Nav.tsx` | E2E-01~06 |
| 4 | 대시보드 연결과 통과율 통일(D-18 c-1) | `search/dashboard.ts`, `page.tsx`, `DashboardViews.tsx`, `tests/search.test.ts` | 17, E2E-07 |

- 크기: 보통(D-21 추천 범위 기준). 브랜치 `feat/stats-dashboard`, past-records 병합 뒤.
- 실제 `claude` 호출 0회.

### 1.12 다른 문서에 옮길 변경 (메인 세션용)

past-records 작업이 끝난 뒤, D-18~D-21 답을 반영해서 옮긴다.

| 문서 | 절 | 바꿀 내용 |
|---|---|---|
| `docs/spec/product.md` | 3장 목표 | "지원 기록만으로 서류 통과율을 기간·사이트·서류 버전별로 본다" 한 줄 |
| `docs/spec/product.md` | 7.2 끝 또는 새 7.10 "통계" | 1.3 결과 분류, 1.4 비율 정의, 1.5 통계 목록(D-21 범위), 무응답 N일(D-18) |
| `docs/spec/product.md` | 12장 화면 구성, 14장 구현 단계 | `/stats` 추가, 단계 위치(D-19, 마일스톤 순서는 status.md) |
| `docs/spec/screens.md` | 0.1 화면 목록, 0.2 화면 이동, 0.3 내비 | "통계 `/stats`" 행, 대시보드 → 통계 링크, 내비 항목 |
| `docs/spec/screens.md` | 1장 보기 전환 아래 통과율 정의 문단 | 1.4 "서류 통과율" 정의로 교체, 표본 부족 표시, 요약 줄 "통계 보기 →" |
| `docs/spec/screens.md` | 새 절 "통계 `/stats`" | 1.7 전체(필터·전환·카드 문구·표·상황별 표시) |
| `docs/spec/screens.md` | 10장 단계별 화면 | 통계가 생기는 단계 |
| `docs/spec/architecture.md` | `src/lib/` 폴더 표, `src/app/` 화면 표 | `lib/stats/{outcome,rates,load,aggregate,params,chart-scale}.ts`, `app/stats/*`, 의존: `stats → db, domain, documents`; `search/dashboard → stats` |
| `docs/design/design.md` | 2장 토큰 | "무응답" `#D5D9E1` 추가(그래프 전용) |
| `docs/design/design.md` | 새 장 "통계 그래프 색" | 1.8 표 |
| `docs/design/design.md` | 1장 문서 구성, `wireframes/index.html` | 통계 와이어프레임 링크(index에 한 줄) |
| `docs/design/mockups/` | 새 화면 | 통계 목업(디자인 B). 사용자가 원하면 별도 작업 |
| `docs/plans/phase-2-stats.md`(새 파일) | 전체 | 1.9~1.11을 Task 1~4로. `CLAUDE.md` 문서 표에 한 줄 |
| `docs/test/test-cases.md` | 새 절 | TC-STATS-01~17, E2E-01~07, M1 |
| `docs/pm/status.md` | 마일스톤·백로그 | 통계 화면 위치(3단계 앞/뒤는 사용자 결정) |

### 1.13 정할 것 초안

**D-18 응답 없는 지원과 서류 통과율 정의** (핵심. 숫자 정의가 바뀜)

- 배경: 불합격 연락이 거의 없어 지원 기록 대부분이 '지원'으로 남는다(469건 중 460). 지금 정의(판정된 것만 분모)는 분모가 7건 안팎이라 통과율이 의미가 없다. 서류 통과 뒤 다른 상태가 된 기록도 통과로 세지 않는다.
- 선택지
  - a. **(추천)** 지원 후 30일 넘게 '지원'이면 무응답으로 보고 탈락처럼 분모에 넣는다. 30일 안 된 것은 대기로 빼고, 지원취소도 뺀다. 주 지표 = 통과 ÷ (통과+불합격+무응답). 판정 기준 통과율은 참고로 함께 보인다. 도달 단계는 상태 이력까지 본다.
  - b. 모든 지원을 분모로(취소만 뺌). 단순하지만 최근 달은 결과가 나오기 전이라 통과율이 낮게 보인다.
  - c. 지금 정의 유지 + 무응답 수만 따로 표시. 비율은 대부분 "표본 부족"이 된다.
  - N일 값: 30(추천) / 21 / 45. S6 "걸린 일수"를 보고 나중에 바꿀 수 있다(코드 상수).
  - 대시보드 묶음 머리: **c-1 (추천)** 같은 정의로 바꾼다 / c-2 대시보드는 지금 그대로 두고 통계 화면만 새 정의.
- 바뀌는 문서: 기획서 7.2·새 7.10, 화면 문서 1장 통과율 문단·통계 절, 계획 Task 1·4, `tests/search.test.ts` 기대값.

**D-19 통계 화면 위치**

- 배경: 요청은 "대시보드에서" 보는 것. 대시보드 보기 탭은 지원 기록을 묶어 보여 주는 목록이고 검색어·상태 필터가 함께 걸린다.
- 선택지
  - a. **(추천)** 새 화면 `/stats` + 내비 "통계" + 대시보드 요약 줄 "통계 보기 →"(필터 넘김). 이유: 통계에는 검색어·상태 필터가 맞지 않고(상태 필터를 걸면 통과율이 0 또는 100%가 됨), 그래프·카드가 많아 목록 화면과 섞으면 무겁다. 링크로 한 번에 간다.
  - b. 대시보드 5번째 보기 탭 "통계"(`?view=stats`). 이 탭에서는 검색창과 상태 필터를 숨기고, 기간·사이트만 남긴다. 내용(1.7 본문)은 a와 같고, 주소 파라미터가 대시보드 쪽(`dashboard-params.ts`)에 붙는다. 화면 파일은 `src/app/_components/StatsView.tsx` 등으로 바뀐다.
- 바뀌는 문서: 화면 문서 0.1·0.3·1장, 와이어프레임, 구조 문서.

**D-20 그래프 구현 방식** (새 의존성 여부)

- 배경: 필요한 그래프는 막대(세로 누적, 가로, 세로 단순) 세 가지뿐이다. 앱은 로컬 전용이라 번들 크기보다 의존성 유지 부담과 Next 16·React 19 서버 컴포넌트 호환이 더 중요하다.
- 선택지
  - a. **(추천)** 직접 SVG 컴포넌트(서버에서 그림). 새 의존성 0, 클라이언트 JS 0, 디자인 토큰을 그대로 씀. 마우스 올림 설명은 SVG `<title>`. 단점: 툴팁·애니메이션이 단순, 컴포넌트 3개 정도를 직접 유지.
  - b. Recharts. 툴팁·범례·반응형이 다 있음. 클라이언트 컴포넌트만 가능, 의존성이 많고 번들이 큼(추정 100KB대 gzip).
  - c. Chart.js + react-chartjs-2. 캔버스 기반, 비교적 가벼움(추정 70KB대 gzip). 클라이언트 전용, 표·접근성은 따로.
- 바뀌는 문서: 기획서 13장 기술 구성(b·c일 때), `package.json`(b·c), 구조 문서.

**D-21 1차 범위**

- 배경: 요청 필수는 S2(월·연별)와 S3(이력서 버전별). 나머지는 "기타 등등"에서 제안한 것이다.
- 선택지
  - a. **(추천)** P1(S1~S4) + S5 깔때기 + S6 걸린 일수 + S7 요일별. 모두 지금 데이터로 계산되고 추가 입력이 없다. S8 재지원·S9 적합도는 데이터가 쌓인 뒤.
  - b. P1만.
  - c. P1 + P2 전부(S5~S9).
- 바뀌는 문서: 기획서 새 7.10, 화면 문서 통계 절, 계획 Task 2·3, 와이어프레임 S-1의 P2 영역.

## 2. 사용자 검토

| 날짜 | 결과 | 고칠 점 |
|---|---|---|

## 3. 개발·검증 회차

| 회차 | 개발 커밋 범위 | 검증 결과 | 남은 필수 항목 | 비고 |
|---|---|---|---|---|

## 4. 결정 요청

| D-번호 | 무엇을 | 멈춘 단계 | 답 | 재개 |
|---|---|---|---|---|

## 5. 재설계

| 회차 | 요청한 쪽 | 이유와 근거 | 바뀐 설계 | 사용자 검토 |
|---|---|---|---|---|
