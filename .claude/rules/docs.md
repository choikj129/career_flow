# 문서 규칙

- 문서는 `docs/` 아래에만 둔다. 루트에는 `CLAUDE.md` 외의 문서(`README.md`, `AGENTS.md` 등)를 두지 않는다. 도구가 자동으로 만든 것도 지우거나 `docs/`로 옮긴다.
  - 저장소 소개는 `docs/README.md`에 둔다(GitHub는 루트에 README가 없으면 `docs/README.md`를 첫 화면에 보여 준다). 공개 저장소라 이름·연락처·실제 지원 회사 같은 개인 정보는 넣지 않는다. 기능이 크게 바뀌면 같이 고친다.
- 파일 이름에 날짜를 넣지 않는다. 이름은 kebab-case로 쓴다. 날짜가 필요하면 본문에 적는다.
- 위치:
  - 기획·설계: `docs/spec/`
  - 구현 계획: `docs/plans/phase-<번호>-<주제>.md`
  - 디자인: `docs/design/`
  - 사용 안내: `docs/guide/`
  - 프로젝트 현황판: `docs/pm/status.md` (PM 관리)
  - 테스트 케이스: `docs/test/`
  - 기능 워크플로우 작업 기록: `docs/work/<작업 이름>.md` (형식 `docs/work/_template.md`)
- 사용자가 정해야 할 것은 `docs/decisions.md` 한 곳에 `D-번호`로 모은다. 다른 문서에는 질문 목록을 따로 두지 않고 그 번호를 링크한다. 결정되면 "결정된 것" 표로 옮기고 관련 문서를 고친다.
- 스킬이 다른 경로를 기본값으로 쓰더라도(예: `docs/superpowers/specs/YYYY-MM-DD-...`) 이 규칙을 따른다.
- 새 문서를 만들면 `CLAUDE.md`의 "문서" 표에 한 줄 추가한다. `CLAUDE.md`에는 개요, 구조, 링크만 둔다. 상세 내용은 `docs/`에 쓰고 링크한다.
- 폴더·파일 배치를 바꾸면 `docs/spec/architecture.md`를 같이 고친다.
- 설계 문서를 먼저 끝낸다. 구현은 사용자가 명시적으로 지시할 때만 한다.
