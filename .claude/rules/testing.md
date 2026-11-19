---
paths:
  - "tests/**"
  - "vitest.config.ts"
---

# 테스트 규칙

- 테스트를 먼저 쓰고 실패하는 것을 확인한 뒤 구현한다(TDD). 각 단계 계획의 Step 순서가 그렇게 짜여 있다.
- 테스트 파일은 `tests/<대상>.test.ts`로 평평하게 둔다.
- DB가 필요하면 `tests/helpers/db.ts`의 `makeTestDb()`를 쓴다. 실제 `data/` 폴더는 건드리지 않는다.
- Claude Code가 필요하면 `tests/fixtures/fake-claude.mjs`를 쓰고, `new ClaudeCliRunner({ bin: process.execPath, binArgs: [FAKE], env })`로 실행한다. 자동 테스트에서 실제 `claude`를 호출하지 않는다(사용량이 들고 결과가 일정하지 않기 때문이다).
- Vitest 설정:
  - `vite-tsconfig-paths`로 `@/` 별칭을 쓴다.
  - `fileParallelism: false`로 한다.
  - 기본 타임아웃은 30초다.
  - `@types/node`는 `^22`다.
- 작업을 끝냈다고 하기 전에 `npm test` 전체를 돌린다. 실패가 있으면 이름을 적어 보고한다.
