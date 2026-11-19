---
paths:
  - "src/**"
---

# 코드 배치 규칙

자세한 내용은 `docs/spec/architecture.md`에 있다.

- `src/lib/`은 `src/app/`을 import하지 않는다. 로직은 화면 없이 테스트할 수 있어야 하기 때문이다.
- 서버 액션은 `src/app/_actions/<영역>.ts`에 둔다. 하는 일은 입력 검증, `lib` 함수 호출, 화면 갱신뿐이다. 규칙과 계산은 `lib`에 둔다.
- 컴포넌트 위치:
  - 한 화면에서만 쓰면 그 화면 폴더에 둔다.
  - 여러 화면이 쓰면 `src/app/_components/`에 둔다.
- AI 작업은 화면이나 액션에서 직접 실행하지 않고 `enqueueJob`으로 큐에 넣는다. 한 번에 하나씩 실행해야 하기 때문이다.
- 외부 프로그램 실행 위치를 제한한다.
  - `claude` 실행은 `src/lib/ai/claude-cli.ts`에서만 한다.
  - Playwright 실행은 `src/lib/extract/browser.ts`와 `src/lib/pdf/render.ts`에서만 하고, 둘이 같은 전역 잠금을 쓴다.
- DB를 쓰는 함수는 마지막 인자로 `db?`를 받는다. 기본값은 `getDb()`이고, 테스트에서는 임시 DB를 넘긴다.
- 파일 이름: `lib`은 kebab-case, React 컴포넌트는 PascalCase.
