---
paths:
  - "tests/**"
  - "vitest.config.ts"
---

# 테스트 규칙

- 테스트를 먼저 쓰고 실패하는 것을 확인한 뒤 구현한다(TDD). 각 단계 계획의 Step 순서가 그렇게 짜여 있다.
- 테스트 파일은 `tests/<대상>.test.ts`로 평평하게 둔다.
- DB가 필요하면 `tests/helpers/db.ts`의 `makeTestDb()`를 쓴다. 실제 `data/` 폴더는 건드리지 않는다.
  - 모든 테스트 파일은 시작 전에 데이터 폴더가 임시 폴더로 정해진다(`tests/helpers/data-dir-setup.ts`, 확인 테스트 `tests/data-dir-guard.test.ts`). 이 설정을 빼거나 우회하지 않는다.
- **시험용 데이터는 항상 지운다**(사용자 지시, 2026-11-23). 테스트·검증·확인 중에 실제 앱(`data/`, 실행 중인 앱 화면)에 시험용 공고·키트·기록이 들어가면, DB를 `data/backups/`에 백업한 뒤 바로 지우고 무엇을 지웠는지 보고한다. 묻지 않아도 된다. 사용자가 직접 넣은 데이터와 구분이 안 되면 지우기 전에 묻는다.
- Claude Code가 필요하면 `tests/fixtures/fake-claude.mjs`를 쓰고, `new ClaudeCliRunner({ bin: process.execPath, binArgs: [FAKE], env })`로 실행한다. 자동 테스트에서 실제 `claude`를 호출하지 않는다(사용량이 들고 결과가 일정하지 않기 때문이다).
- Vitest 설정:
  - `vite-tsconfig-paths`로 `@/` 별칭을 쓴다.
  - `fileParallelism: false`로 한다.
  - 기본 타임아웃은 30초다.
  - `@types/node`는 `^22`다.
- 작업을 끝냈다고 하기 전에 `npm test` 전체를 돌린다. 실패가 있으면 이름을 적어 보고한다.
