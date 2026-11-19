# Career Flow

개인 취업 활동 관리·분석 도구. 사용자 한 명이 자기 PC(Windows 11)에서 쓰는 로컬 웹앱이다.
- 지원 기록을 모아 회사 이름으로 검색한다(중복 지원 방지).
- 공고 링크를 넣으면 적합도를 분석한다.
- 맞춤 이력서(PDF와 사이트 수정 안내), 면접 준비 자료, 4개 채용 사이트 이력서 반영 체크리스트를 만든다.

## 현재 단계

- 현황판(마일스톤 순서·백로그·사용자 할 일, 목표일 없음): [docs/pm/status.md](docs/pm/status.md). 메인 세션은 PM 역할을 한다([.claude/rules/pm.md](.claude/rules/pm.md)), 현황 보고는 `/project-status`.

- **1·2단계 구현·검증 완료, `main`에 병합됨** (2026-11-19). 다음은 3단계(맞춤 이력서, `/feature-workflow`로 진행). 구현은 사용자가 명시적으로 지시할 때만, `docs/plans/`의 단계 순서대로 한다.
- Claude Code CLI 로그인과 응답 모양은 확인했다(2026-11-16, 2.1.325).

## 꼭 지킬 것

- AI 작업은 전부 사용자 PC의 Claude Code CLI(`claude -p`)를 호출해 구독으로 처리한다. Anthropic API와 API 키는 쓰지 않는다. Claude Code 로그인 정보(토큰·인증 파일)는 읽거나 저장하지 않는다.
- 맞춤 이력서, 이력서 가져오기, 사이트 반영 안내는 기본 이력서·원문에 없는 경력·수치·기술을 만들어 내지 않는다.
- 개인용이고 로컬에서만 동작한다(`127.0.0.1:3939`). 채용 사이트 자동 지원, 자동 로그인, 크롤링은 하지 않는다.

## 명령어 (구현 후)

```bash
npm run dev      # 개발 서버 http://127.0.0.1:3939
npm test         # Vitest 전체
npm run build    # 빌드 (tsc 전에는 npx next typegen)
npm run start    # 실행 (scripts/start-career-flow.cmd 가 이것을 부름)
```

## 디렉터리 구조

```
CLAUDE.md
.claude/rules/   작업 규칙          .claude/skills/  프로젝트 스킬(필요할 때)
.claude/agents/  서브에이전트      .claude/skills/  feature-workflow(기능 워크플로우), project-status(현황 보고)
docs/            모든 문서          prompts/         Claude Code 작업별 프롬프트
src/app/         화면·서버 액션·API  src/lib/         로직(DB, AI 실행, 추출, PDF)
tests/           Vitest             drizzle/         생성된 마이그레이션
scripts/         실행·시드          data/            실행 데이터(git 제외)
```

상세 배치와 의존 방향: [docs/spec/architecture.md](docs/spec/architecture.md)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/pm/status.md](docs/pm/status.md) | **프로젝트 현황판** (PM 관리): 마일스톤 순서·크기, 백로그·위험·사용자 할 일 |
| [docs/decisions.md](docs/decisions.md) | **정할 것·결정 기록** (사용자 검토용). 열린 질문은 여기에만 모은다 |
| [docs/spec/product.md](docs/spec/product.md) | 기획서: 목적, 기능, AI 실행 방식, 데이터 모델, 구현 단계 |
| [docs/spec/screens.md](docs/spec/screens.md) | 화면 구성: 화면별 데이터, 버튼, 상황별 표시 |
| [docs/spec/architecture.md](docs/spec/architecture.md) | 디렉터리·파일 구성, 의존 방향, 이름 규칙 |
| [docs/plans/phase-1-2-mvp.md](docs/plans/phase-1-2-mvp.md) | 1·2단계: 기반 + 공고 분석·지원 관리·대시보드 |
| [docs/plans/phase-2-past-records.md](docs/plans/phase-2-past-records.md) | 2단계 추가: 지난 기록 직접 입력·제출 서류 파일(이력서·경력기술서·포트폴리오) 연결과 보기 |
| [docs/plans/phase-3-tailored-resume.md](docs/plans/phase-3-tailored-resume.md) | 3단계: 맞춤 이력서·PDF |
| [docs/plans/phase-4-interview-prep.md](docs/plans/phase-4-interview-prep.md) | 4단계: 면접 준비 |
| [docs/plans/phase-5-site-sync-settings.md](docs/plans/phase-5-site-sync-settings.md) | 5단계: 사이트 반영 체크리스트·설정 |
| [docs/guide/usage.md](docs/guide/usage.md) | 설치·실행·백업 안내 |
| [docs/test/test-cases.md](docs/test/test-cases.md) | 기능·화면별 테스트 케이스와 자동 테스트 대응표 |
| [docs/work/](docs/work/) | 기능 워크플로우 작업 기록(작업마다 한 파일, 형식은 `_template.md`) |
| [docs/design/design.md](docs/design/design.md) | 화면 디자인: 디자인 B 결정, 색(사이트·상태), 와이어프레임·목업 링크 |

## 규칙

| 규칙 | 적용 범위 |
|---|---|
| [.claude/rules/docs.md](.claude/rules/docs.md) | 문서 작성·배치 (항상) |
| [.claude/rules/ask-first.md](.claude/rules/ask-first.md) | 큰 결정·필수 결정은 멈추고 묻기 (항상) |
| [.claude/rules/pm.md](.claude/rules/pm.md) | 메인 세션 = PM: 위임·진행 관리·현황판·보고 (항상) |
| [.claude/rules/workflow.md](.claude/rules/workflow.md) | 서브에이전트 워크플로우, 보고서 상태 블록 (항상) |
| [.claude/rules/git.md](.claude/rules/git.md) | 완료된 작업은 알아서 커밋·`main` 병합, push·강제 작업은 묻기 (항상) |
| [.claude/rules/code-structure.md](.claude/rules/code-structure.md) | `src/**` |
| [.claude/rules/nextjs.md](.claude/rules/nextjs.md) | `src/app/**` 등 |
| [.claude/rules/ai-cli.md](.claude/rules/ai-cli.md) | `src/lib/ai/**`, `prompts/**` |
| [.claude/rules/testing.md](.claude/rules/testing.md) | `tests/**` |

## 서브에이전트

메인 세션(PM)이 아래 에이전트에게 일을 맡기고 관리한다. 제품 코드는 developer가 고친다.

새 기능·다음 단계·큰 변경은 `/feature-workflow <요청>`으로 진행한다. 순서: product-planner 설계 → 사용자 검토 → developer → code-reviewer(수정 필요 시 developer로 최대 2회) → 병합. 결정이 필요하면 멈추고 묻고, 설계가 다시 필요하면 planner로 되돌리고, 해결하지 못하면 실패 사유를 적는다([.claude/skills/feature-workflow/SKILL.md](.claude/skills/feature-workflow/SKILL.md)).

| 에이전트 | 모델 | 하는 일 |
|---|---|---|
| [product-planner](.claude/agents/product-planner.md) | Opus | 설계(작업 기록·기획·계획 문서 작성), 재설계, 기획 검토·다음 작업 제안. 코드는 고치지 않음 |
| [developer](.claude/agents/developer.md) | Sonnet | 승인된 설계 구현, 테스트 먼저 작성·실행, 리뷰 지적 수정. 작업 브랜치에만 커밋 |
| [code-reviewer](.claude/agents/code-reviewer.md) | Sonnet | 설계·요구 충족 검증, 전체 테스트 실행, 버그·보안·성능 검토, 고쳐야 할 목록(필수/권장/사소). 수정하지 않음 |
