# mail-import — 지난 지원 기록 직접 입력 + 서류 버전

- 요청: 지난 지원 기록을 직접 입력한다(필수: 사이트·지원일, 선택: 메모·이력서·경력기술서·포트폴리오 버전). 서류 버전은 `(이력서|경력기술서|포트폴리오)_YYYYMMDD.pdf` 파일의 날짜로 정하고, 지원일 기준으로 지원 기록에 연결한다. 종류마다 가장 이른 버전보다 앞선 지원은 "모름". 메일(원티드·잡코리아·리멤버) 지난 기록은 앱 기능이 아니라 메인 세션이 한 번 DB로 옮긴다 (2026-11-19, 범위 조정 반영)
- 브랜치: `feat/past-records` (작업 이름은 처음 요청 기준. 계획 파일도 `phase-2-past-records.md`)
- 상태: 설계 완료, 결정 대기
- 관련 결정: D-15(서류 버전 등록 방식·스키마), D-16(직접 입력 필수 칸) — 초안은 아래

## 1. 설계 (product-planner)

계획 본문: [docs/plans/phase-2-past-records.md](../plans/phase-2-past-records.md). 아래는 요약과 결정 초안이다.

### 확정된 사용자 결정 (2026-11-19, 메인 세션 전달)

- 메일 지난 기록은 설계하지 않는다. 메인 세션이 일회성으로 DB에 넣는다.
- 서류 종류는 이력서 / 경력기술서 / 포트폴리오. 자기소개서 없음. 직무별 변형본 무시.
- 유효한 파일은 `(이력서|경력기술서|포트폴리오)_YYYYMMDD.pdf`만. 버전 날짜 = 이름의 날짜(수정일 안 씀).
- 앱은 `D:\`를 읽지 않는다. 필요한 파일만 메인 세션이 승인 후 데이터 폴더로 복사한다.
- 확인된 버전(규칙 적용 후): 이력서 2026-09-05·10-17·11-02 / 경력기술서 2026-10-17·11-02 / 포트폴리오 2026-07-22·10-17.

### 목표와 범위

1. **직접 입력**: `/import`에서 `[표에 직접 입력]` → AI 없이 빈 검토 표. 필수는 사이트·지원일·회사, 선택은 포지션(D-16)·메모·서류 버전 3종. 여러 행을 한 번에 등록.
2. **서류 버전**: `data/documents/<resume|career|portfolio>/<종류>_YYYYMMDD.pdf` 복사본을 기본 이력서 화면 "서류 버전" 탭의 `[폴더에서 찾기]`로 등록. 종류·날짜·경로만 저장, 내용은 읽지 않음.
3. **지원 기록 연결**: `applications.submitted_docs`(종류별 버전 id). 지원일로 자동 선택: **같은 날 포함**, 앞선 버전 중 가장 늦은 것. 종류마다 없으면 그 종류만 "모름".
4. **메모 이관**: 메인 세션이 넣은 기록의 메모 줄 `제출 서류: 이력서 YYYY-MM-DD / 경력기술서 모름 / 포트폴리오 YYYY-MM-DD`를 `[메모의 제출 서류 옮기기]`로 `submitted_docs`에 옮기고 그 줄을 지운다. 등록 안 된 날짜가 있으면 그 기록은 건너뛴다. 다시 실행해도 안전.
5. **대시보드**: 제출 이력서 라벨·"이력서별" 묶음에 이력서 파일 버전 반영(기본 버전 → 이력서 파일 버전 → 모름).

### 만들지 않는 것

- 메일(Gmail) 파싱·가져오기 파일·메일 탭. 계속되는 자동 수집.
- 앱이 데이터 폴더 밖(`D:\` 등)을 읽는 것. 서류 PDF 내용 읽기·구조화(`claude` 호출 0회).
- 앱 화면에서 서류 PDF 올리기(새 파일은 폴더에 넣고 [폴더에서 찾기]).
- 지원 기록 수정 창(3.10)에서 서류 버전 고치기 → 3단계 Task 4에 메모함.
- [지원 완료](앞으로의 지원)에 서류 파일 버전 자동 기록. 앞으로는 앱 기본 이력서 버전이 기록된다.

### 바뀌는 문서

| 문서 | 절 | 내용 |
|---|---|---|
| `docs/plans/phase-2-past-records.md` | 새 문서 | Task 1~4, 메인 세션 준비(파일 복사 규칙, 메모 형식), 테스트 케이스 |
| `docs/spec/product.md` | 3장 비목표, 4장, 7.7, **7.9(새)**, 10장, 12장, 14장 | 지난 기록 한 번 이관 예외, 직접 입력, 서류 버전, `submitted_docs`·`document_versions` |
| `docs/spec/screens.md` | 1장(보기 전환·지원 목록 표), 5장 머리, **5.5(새)**, 6.1, 6.2 | 서류 버전 탭, [표에 직접 입력], 메모·서류 칸, 직접 입력 표시 |
| `docs/spec/architecture.md` | 2·3·7장 | `lib/documents/*`, `_actions/documents.ts`, `resume/DocVersions.tsx`, `data/documents/` |
| `docs/plans/phase-3-tailored-resume.md` | Task 4 | 수정 창에서 `submittedDocs` 고치기, 라벨 우선순위 |
| `CLAUDE.md` | 문서 표 | 새 계획 한 줄 |

### 데이터·화면·작업 흐름 변경

- **데이터** (D-15 a): 새 테이블 `document_versions(id, kind, version_date, file_path, created_at)`, (kind, version_date) 유일. `applications.submitted_docs` JSON nullable `{resume?, career?, portfolio?: id|null}`. `submitted_resume`는 그대로(가져온 기록은 `{kind:'imported'}` 유지). 마이그레이션 `0003_document_versions`.
- **파일 위치**: `data/documents/<종류 ID>/<종류 ID>_YYYYMMDD.pdf`. `.gitignore`의 `/data/`·`*.pdf`로 커밋 차단(확인: `.gitignore` "career flow" 절).
- **함수**(상세 시그니처는 계획 Task 1~3):
  - `src/lib/documents/pick.ts`: `pickDocVersion(kind, appliedAt, versions): number | null`, `pickDocs`, `parseDocFileName`, `docFileName`, `docLabel`, `formatDocsNote`, `parseDocsNote`
  - `src/lib/documents/repo.ts`: `listDocVersions`, `scanDocumentsDir`, `registerScannedDocs`, `deleteDocVersion`, `assertDocsValid`, `migrateDocsFromNotes`, `countDocsNotesPending`
  - `src/lib/applications/import-review.ts`: `findExistingMatches(rows, db?): ('same'|'same_day'|'none')[]`
  - `src/lib/applications/import-rows.ts`: `ReviewRow`에 `notes`, `docs`; `POSITION_UNKNOWN`
  - `bulkCreateApplications` 행에 `notes?`, `submittedDocs?`
- **화면**: `/import` [표에 직접 입력](사이트 필수), `/import?manual=1&site=…` 빈 검토 표, 검토 표에 메모·서류 칸, `/resume?tab=docs` 서류 버전 탭(목록, [폴더에서 찾기], [삭제], [메모의 제출 서류 옮기기]). 문구는 screens.md 5.5·6장.
- **메인 세션 일회성 작업과의 약속**(계획 0.2): 메일 기록은 지금 스키마로 넣고 메모 첫 줄에 정확히 `제출 서류: 이력서 2026-09-05 / 경력기술서 모름 / 포트폴리오 2026-07-22` 형식(순서 고정, 구분자 ` / `, 없으면 `모름`). 이 형식이 `parseDocsNote`와 맞아야 이관된다.
- **이관 한 줄**: 서류 버전을 [폴더에서 찾기]로 등록한 뒤 [메모의 제출 서류 옮기기]를 누르면 `migrateDocsFromNotes`가 메모 줄을 `submitted_docs`로 옮기고 그 줄을 지운다.

### 테스트 케이스

| ID | 기대 결과 |
|---|---|
| TC-PAST-01 | `pickDocVersion`: 같은 날 포함, 종류별, 2026-08-01 → 이력서·경력기술서 모름, 포트폴리오 07-22 |
| TC-PAST-02 | `parseDocFileName`: `<종류>_YYYYMMDD.pdf`만 통과 |
| TC-PAST-03 | 폴더 찾기: 맞는 파일만 등록, 두 번째 0건, 경로 밖 거부 |
| TC-PAST-04 | 서류 버전 삭제: 쓰는 버전 거부, 파일 유지, 기본 이력서 영향 없음 |
| TC-PAST-10 | `findExistingMatches`: same / same_day / none |
| TC-PAST-11 | 포지션 선택(D-16 a): 빈 포지션 → `(포지션 미상)`, 회사·지원일 필수 |
| TC-PAST-12 | `bulkCreateApplications`: 메모·서류 저장, 없는 id면 롤백 |
| TC-PAST-20 | 메모 줄 형식 왕복 |
| TC-PAST-21 | `migrateDocsFromNotes`: 줄만 지움, 없는 버전 건너뜀, 재실행 안전 |
| TC-PAST-30 | 대시보드 라벨·묶음 순서 |
| TC-PAST-E2E-01~05 | 직접 입력 열기·등록·서류 자동 배정·서류 버전 탭·메모 이관 |

### 정할 것 초안

**D-15 서류 버전을 앱에 어떻게 등록하고 저장할까** (데이터 모델 변경)
- 배경: 사용자는 지원 기록마다 이력서·경력기술서·포트폴리오 버전을 고르고 싶어 한다. 지금 지원 기록에는 앱 기본 이력서 버전(`submitted_resume`) 하나뿐이고, 이 기본 이력서는 내용 구조(JSON)라 PDF 파일 버전과 다르다(`src/lib/db/schema.ts:82-84`, `src/lib/resume/repo.ts:13-29`). 파일은 7개, 날짜는 파일 이름에서 나온다.
- 선택지
  - **a (추천)**: 새 테이블 `document_versions`(종류·날짜·파일 경로)와 지원 기록 `submitted_docs`(종류별 id). 파일은 `data/documents/`에 복사본, 앱은 [폴더에서 찾기]로 경로만 등록. 내용은 읽지 않는다. `claude` 0회, 새 버전도 파일만 넣으면 된다.
  - b: a에 더해 각 PDF 내용을 "이력서 가져오기"처럼 구조화해 저장. 면접 준비 등에서 그때 낸 내용을 쓸 수 있지만, 파일당 `claude` 1회(7회), 경력기술서·포트폴리오는 지금 이력서 구조에 잘 맞지 않는다. 지난 지원에 면접 준비를 다시 만들 일이 적어 이득이 작다.
  - c: 테이블 없이 메모 한 줄("제출 서류: …")로만 남긴다. 만들 것은 없지만 "이력서별" 보기·필터에 못 쓴다.
- 바뀌는 문서: 기획서 7.9·10장, 화면 문서 5.5·6.2, 계획 `phase-2-past-records.md` Task 1·3·4, 3단계 계획 Task 4.

**D-16 직접 입력에서 회사·포지션을 필수로 둘까**
- 배경: 사용자가 말한 필수는 사이트·지원일뿐이다. 지금 가져오기는 회사·포지션·지원일이 필수다(`src/lib/applications/import-rows.ts:19-25`). 회사는 이 앱의 목적인 회사 검색·중복 확인의 기준이다(기획서 1장, `applications.company_id` not null). 포지션은 그룹바이 카톡에 없을 수 있다.
- 선택지
  - **a (추천)**: 회사는 필수 유지, 포지션은 선택(빈 칸이면 `(포지션 미상)` 저장 — [지원 완료]의 기존 대체값과 같음, `src/lib/applications/repo.ts:34`). 이 규칙을 화면 복사·캡처 가져오기에도 똑같이 적용.
  - b: 회사·포지션 모두 필수(지금 그대로).
  - c: 회사도 선택. 회사 없는 기록은 검색에 안 걸려 중복 방지 목적과 맞지 않는다.
- 바뀌는 문서: 기획서 7.7, 화면 문서 6.2, 계획 Task 2, 테스트 TC-IMPORT-21 기대값.

### decisions.md "결정된 것"에 넣을 문안 (메인 세션용)

| 날짜 | 결정 | 기록된 곳 |
|---|---|---|
| 2026-11-19 | 앱을 쓰기 전의 지난 지원 기록은 한 번만 옮긴다. 원티드·잡코리아·리멤버 "지원 완료" 메일은 메인 세션이 읽어 DB에 직접 넣고(앱 기능 아님), 그룹바이 등은 앱의 직접 입력으로 넣는다. 계속되는 메일·메신저 수집은 만들지 않는다 | 기획서 3장·7.7 |
| 2026-11-19 | 서류 종류는 이력서·경력기술서·포트폴리오 셋(자기소개서 없음). 직무별 변형은 무시. 버전 파일은 `(종류)_YYYYMMDD.pdf`만, 날짜는 이름의 날짜. 지원일과 같은 날이거나 앞선 가장 늦은 버전을 쓰고, 종류마다 가장 이른 버전보다 앞선 지원은 그 종류만 "모름" | 기획서 7.9, 계획 `phase-2-past-records.md` |
| 2026-11-19 | 앱은 데이터 폴더 밖(`D:\` 등)을 읽지 않는다. 필요한 서류 파일만 승인 후 `data/documents/<종류>/`로 복사한다 | 기획서 7.9, 계획 0.1 |

## 2. 사용자 검토

| 날짜 | 결과 | 고칠 점 |
|---|---|---|

## 3. 개발·검증 회차

| 회차 | 개발 커밋 범위 | 검증 결과 | 남은 필수 항목 | 비고 |
|---|---|---|---|---|

- 다시 개발 요청은 최대 2회다. 재설계 뒤에는 다시 0회부터 센다.

## 4. 결정 요청

| D-번호 | 무엇을 | 멈춘 단계 | 답 | 재개 |
|---|---|---|---|---|

## 5. 재설계

| 회차 | 요청한 쪽 | 이유와 근거 | 바뀐 설계 | 사용자 검토 |
|---|---|---|---|---|

## 6. 실패 (해결하지 못했을 때만)

- 무엇이 실패했나:
- 실제 출력:
- 원인 (확인 / 추정 구분, 근거 `경로:줄`):
- 시도한 것 (회차별):
- 남은 선택지:

## 7. 결과

- 병합 커밋:
- 최종 검사: `npm test` / `test:e2e` / `lint` / 타입 / 빌드
- 사용자가 직접 확인할 것:
