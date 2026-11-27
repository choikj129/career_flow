# 로그인 창 기능 없애기

- 요청 (2026-11-27): "북마크로 하니 로그인창은 필요 없을 거 같음. (생성한 크롬 프로필도 삭제)"
- 결정: decisions.md 2026-11-27 "로그인 창 기능을 없앤다". 앱이 만든 Chrome 프로필 `data/browser-profile`은 PM이 이미 지웠다(약 235MB).
- 브랜치: `fix/remove-login` (폴더 `C:\project\career_flow-remove-login`)
- 상태: 완료 (2026-11-27 main 병합)

## 1. 설계 (PM)

- 없앨 것:
  - 설정 화면의 사이트별 [로그인 창 열기] 버튼과 안내(`src/app/settings/SiteLoginButtons.tsx`, 설정 페이지에서 쓰는 곳).
  - 서버 액션(`src/app/_actions/settings.ts`의 로그인 창 액션).
  - `src/lib/extract/browser.ts`의 로그인 창 코드: `openSiteLogin`, `launchHeaded`, `findInstalledBrowser`, `plainBrowserArgs`, `spawnPlainBrowser` 등 로그인 창에만 쓰이는 것. **단, PDF 대체 실행(`src/lib/pdf/render.ts`의 launchPdfBrowser)이 쓰는 것이 있으면 남긴다.** 브라우저 잠금(`acquireBrowserLock` 등)은 남긴다.
  - 관련 테스트(`tests/login-browser.test.ts` 등)와 E2E의 로그인 버튼 검사. `tests/security.test.ts` TC-AI-25의 "프로세스 실행 허용 파일" 목록에서 browser.ts가 더 이상 spawn하지 않으면 뺀다.
- 링크로 읽기(공고 링크 본문 추출, `extract-posting.ts`)는 그대로 두되 **로그인 프로필을 쓰지 않게** 한다: 지금 `browserProfileDir`로 지속 프로필(persistent context)을 쓰면 일반(비지속) 실행으로 바꿔, 지운 `data/browser-profile` 폴더가 다시 생기지 않게 한다. `config.ts`의 `browserProfileDir`와 `ensureDataDirs`의 생성도 뺀다.
- 화면·기획 문서에서 로그인 창 관련 부분을 지우거나 "없앰(2026-11-27, 북마크 버튼으로 대체)"으로 고친다: `docs/spec/screens.md`(설정), `docs/spec/product.md`, `docs/guide/usage.md`, `docs/test/test-cases.md`(TC-SETTINGS-10 등은 "삭제됨" 표시), `docs/spec/architecture.md`.
- DB·데이터 변경 없음.

## 2. 사용자 검토

| 날짜 | 결과 | 고칠 점 |
|---|---|---|
| 2026-11-27 | 요청 자체가 지시 | 없음 |

## 3. 개발·검증 회차

| 회차 | 개발 커밋 범위 | 검증 결과 | 남은 필수 항목 | 비고 |
|---|---|---|---|---|
| 1 | main..3dc361c | 통과: 코드 삭제 위주라 검증 담당 없이 PM 확인(개발 쪽 npm test 718·E2E 전체 228 통과, 병합 뒤 실제 앱 설정 화면 확인) | 0 | 로그인 창 코드·화면·테스트 삭제, 링크로 읽기는 비지속 브라우저(chromium.launch)로 변경. PDF 대체 실행은 acquireBrowserLock만 써서 영향 없음 |

## 7. 결과

- 병합: 2026-11-27 main
- 최종 검사: npm test 718 / test:e2e 228 (11 skip) / lint / 타입 / 빌드 실패 0
- 사용자가 직접 확인할 것: 없음(설정 화면에서 로그인 카드가 사라진 것만 보면 됨)
