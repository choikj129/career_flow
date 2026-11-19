---
paths:
  - "src/lib/ai/**"
  - "prompts/**"
---

# Claude Code CLI 호출 규칙

근거: `docs/spec/product.md` 4장(이용 조건), 9장(AI 실행 계층)

## 이용 조건

- Anthropic API와 API 키는 쓰지 않는다. 사용자 구독으로 `claude -p`만 실행한다.
- Claude Code 인증 파일과 토큰은 읽지도 저장하지도 다루지도 않는다. 로그인이 안 되어 있으면 "터미널에서 `claude`로 로그인하세요"라고 안내만 한다.

## 실행 방식

- 실행 옵션: `-p --safe-mode --output-format json --permission-mode dontAsk --permission-prompts none --json-schema <스키마> --model <모델> --tools <목록>`. 세션을 이어갈 때는 `--resume <id>`를 붙인다.
  - `--bare`는 쓰지 않는다. OAuth 로그인을 무시하기 때문이다.
  - 옵션은 버전마다 달라질 수 있으니 `claude --help`로 확인한다. 확인한 버전은 2.1.284, 2.1.325다.
- 프롬프트는 표준입력으로 넘긴다. 큰 입력은 작업 폴더(`data/ai-work/<jobId>/`)에 파일로 둔다. Windows 명령줄 길이 제한(약 32K자) 때문이다.
- 작업 폴더는 앱 폴더가 아닌 `data/ai-work/<jobId>/`로 한다.

## 응답 처리

- 성공 응답은 `subtype: "success"`, `is_error: false`이고, 스키마대로의 결과가 `structured_output`에 객체로 들어 있다(2.1.325에서 확인). 없으면 `result`(JSON 문자열)를 읽는다.
- 응답의 `credential_expires_at` 등 인증 관련 필드는 저장하거나 쓰지 않는다.
- 오류 응답은 `{ is_error: true, result: "<메시지>", session_id }` 모양이다.
- 결과는 zod로 검증한다. 형식이 틀리면 같은 세션에 한 번만 다시 요청한다.

## 도구 권한 (작업별 최소)

- 분석, 맞춤 이력서, 사이트 반영: 도구 없음(`""`).
- 이력서·지원 내역 가져오기: `Read`만.
- 면접 준비: `Read`, `WebSearch`, `WebFetch`.
- 셸 실행과 파일 쓰기는 어떤 작업에서도 허용하지 않는다. 결과 저장은 앱이 한다.

## 프롬프트 규칙

- 원문이나 기본 이력서에 없는 경력·프로젝트·수치·기술·자격을 만들어 내지 않는다. 맞춤 이력서 프롬프트는 이 규칙을 맨 위에 둔다. 코드 검사(`resume/fabrication.ts`)도 함께 한다.
- 출력은 한국어로 한다. 판단할 수 없는 값은 null 또는 빈 값으로 둔다.
