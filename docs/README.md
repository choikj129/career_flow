# Career Flow

개인 취업 활동을 한곳에서 관리하고 분석하는 **로컬 웹앱**입니다. 한 사람이 자기 PC(Windows)에서 쓰도록 만들었고, 주소는 `http://127.0.0.1:3939`라 그 PC 밖에서는 열리지 않습니다.

AI 작업(공고 분석, 이력서 정리 등)은 모두 PC에 설치된 **Claude Code CLI(`claude -p`)를 구독 로그인으로 호출**해 처리합니다. Anthropic API 키는 쓰지 않습니다.

> 이 저장소에는 코드와 설계 문서만 있습니다. 지원 기록·이력서·DB 같은 개인 데이터는 `data/` 폴더에만 저장되고 저장소에 올라가지 않습니다.

## 무엇을 하나

| 기능 | 설명 |
|---|---|
| 지원 기록 관리 | 지원한 회사·포지션·사이트·상태(서류합격·과제·면접·최종 등)와 상태 이력을 기록하고, 회사 이름으로 검색해 **같은 회사에 중복 지원하는 것을 막습니다**. 회사 별칭(한글·영문)으로도 찾습니다 |
| 공고 분석 | 공고 링크나 본문을 넣으면 기본 이력서·경력 자료와 비교해 적합도, 잘 맞는 점, 이력서에 덜 드러난 강점, 실제로 부족한 점을 정리합니다 |
| 프로필 추천 | 직무별로 미리 만들어 둔 이력서 프로필(예: 성능형, 정합성형, 오너십형) 중 공고에 맞는 것을 추천하고, 공고 맞춤 이력서가 필요한 정도(%)와 이유를 알려 줍니다 |
| 지원 서류 PDF | 추천 프로필의 이력서·경력기술서를 PDF로 바로 받습니다(파일 이름에 회사 이름) |
| 맞춤 이력서 요청 | 공고에 맞춘 이력서가 필요하면, 별도의 이력서 작업 공간(Claude Code 세션)에 붙여 넣을 요청문을 한 번에 복사합니다 |
| 공고 가져오기 | 브라우저 북마크 버튼 "Career Flow로 보내기"로, 보고 있는 공고 페이지의 글자를 앱으로 넘겨 바로 등록·분석합니다(사이트에 따로 접속하지 않음) |
| 지난 기록 가져오기 | 각 사이트의 "지원 현황" 화면 복사·캡처를 표로 정리해 한꺼번에 등록합니다 |
| 통계 | 서류 통과율(기간·서류 버전·사이트·요일별), 단계별 흐름, 맞춤 이력서 효과, 프로필별 결과 |

예정: 면접 준비 자료, 채용 사이트별 이력서 반영 체크리스트.

## 지키는 원칙

- **로컬 전용·개인용**: `127.0.0.1`에서만 열립니다.
- **채용 사이트 자동화 없음**: 자동 지원, 자동 로그인, 크롤링, 접속 차단 우회를 하지 않습니다. 공고 글은 사용자가 붙여 넣거나, 사용자가 연 페이지에서 북마크 버튼으로 넘깁니다.
- **지어내지 않기**: 분석과 이력서 관련 AI 작업은 기본 이력서·경력 자료에 없는 경력·수치·기술을 만들어 내지 않도록 프롬프트 규칙과 코드 검사를 함께 둡니다.
- **API 키·인증 정보 없음**: Claude Code의 로그인 정보는 읽거나 저장하지 않습니다.

## 기술 스택

- Next.js 16 (App Router, 서버 액션), React 19, TypeScript
- SQLite + Drizzle ORM (`better-sqlite3`), zod
- Playwright (PDF 만들기, 로그인 창), Vitest + Playwright E2E
- AI: Claude Code CLI(`claude -p --output-format json --json-schema …`), 작업 큐로 한 번에 하나씩 실행

## 실행

필요한 것: Windows, Node.js 22, Claude Code CLI(터미널에서 `claude`로 로그인).

```bash
npm i
npx playwright install chromium
npm run build
npm run start      # http://127.0.0.1:3939
```

개발: `npm run dev`, 테스트: `npm test`(Vitest), `npm run test:e2e`(Playwright).

설치·실행·백업 자세한 안내: [guide/usage.md](guide/usage.md)

## 구조

```
src/app/     화면·서버 액션·API 라우트
src/lib/     로직(DB, AI 실행·작업 큐, 공고 추출, 서류 키트·PDF, 통계)
prompts/     Claude Code 작업별 프롬프트
tests/       Vitest·E2E
docs/        기획·화면·설계·계획·결정 기록
```

자세한 배치와 의존 방향: [spec/architecture.md](spec/architecture.md)

## 문서

| 문서 | 내용 |
|---|---|
| [spec/product.md](spec/product.md) | 기획서: 목적, 기능, AI 실행 방식, 데이터 모델 |
| [spec/screens.md](spec/screens.md) | 화면 구성 |
| [decisions.md](decisions.md) | 결정 기록 |
| [pm/status.md](pm/status.md) | 진행 현황 |
| [test/test-cases.md](test/test-cases.md) | 테스트 케이스 |

## 만든 방식

설계·개발·검증을 Claude Code의 여러 에이전트(기획·개발·화면/로직/품질 검증)에 나눠 맡기고, 메인 세션이 PM으로 진행과 결정을 관리하는 방식으로 만들었습니다. 작업마다 설계 → 사용자 검토 → 개발(테스트 먼저) → 검증 → 병합 기록이 [work/](work/)에 남아 있습니다.
