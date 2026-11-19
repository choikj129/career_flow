---
paths:
  - "src/app/**"
  - "src/instrumentation.ts"
  - "next.config.ts"
---

# Next.js 16 규칙

이 프로젝트의 Next.js(16.x)는 학습 데이터에 있는 버전과 API·관례가 다르다.

- 페이지, 라우트 핸들러, 서버 액션, 설정을 쓰기 전에 `node_modules/next/dist/docs/`에서 해당 문서를 읽는다. deprecation 안내도 따른다.
- `cacheComponents`가 기본으로 켜져 있다. DB를 읽는 페이지는 동적으로 렌더링해야 한다(빌드 시점에 DB를 읽으면 안 된다).
- `params`는 Promise다. 라우트 핸들러의 두 번째 인자 타입은 `RouteContext<'/경로'>`이고, 생성되는 전역 타입이다. 그래서 `tsc --noEmit` 전에 `npx next typegen`을 실행한다.
- `better-sqlite3`와 `playwright`는 Next 기본 `serverExternalPackages`에 이미 있다. `next.config`에 다시 넣지 않는다.
- `_`로 시작하는 폴더(`_components`, `_actions`)는 주소가 되지 않는다.
- 서버는 `127.0.0.1:3939`에만 연다.
