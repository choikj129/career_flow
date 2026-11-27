# 북마크 버튼 "Career Flow로 보내기" (공고 본문 자동 가져오기)

- 요청 (2026-11-27): "공고 링크 던졌을 때 본문을 다 못 읽는 거면 의미가 없는 거 같은데 … 어떻게든 자동화 할 방법이 없나" → PM이 세 방법(북마크 버튼 / 캡처 글자 추출 / 실제 Chrome 창 자동 접속)을 제시 → 사용자: "방법 1로 진행, 바로 분석까지"
- 배경: 원티드 등은 앱의 숨은 브라우저(headless) 접속을 막는다(11-23 확인). 차단 우회·크롤링은 하지 않는다(CLAUDE.md). 지금은 사용자가 본문을 복사해 붙여 넣는다.
- 방향(사용자 선택): 사용자의 Chrome 북마크바 버튼(북마클릿)을 공고 페이지에서 누르면, 그 페이지에서 접힌 "더 보기"를 펼치고 화면 글자와 주소를 모아 Career Flow(127.0.0.1:3939) 새 탭으로 넘기고, **바로 등록하고 분석까지** 한다. 사이트에 따로 접속하지 않는다. 글자는 브라우저에서 로컬 앱으로만 간다.
- 브랜치: `feat/bookmarklet` (폴더 `C:\project\career_flow-bookmarklet`)
- 상태: 검토 대기 (설계 2026-11-27)
- 관련 결정: D-08(본문 붙여넣기 흐름), 등록 흐름(중복 링크 처리), 공고 회사·포지션 직접 입력(posting-edit)

## 1. 설계 (product-planner)

### 1.1 목표와 범위

- 사용자가 공고 페이지에서 북마크바의 **[Career Flow로 보내기]** 한 번만 누르면: 접힌 "더 보기"를 펼침 → 화면 글자·주소·제목을 모음 → `127.0.0.1:3939/postings/receive` 새 탭 → 앱이 **확인 없이 등록하고 분석 시작** → 공고 상세(분석 진행 표시)로 이동.
- 설정 화면에 끌어다 놓을 버튼, [코드 복사], [새로 만들기](확인 값 교체), 설치 안내.
- 반목표 점검: 기록 입력이 늘지 않는다(오히려 "링크 붙여넣기"가 "버튼 한 번"이 됨). 본문은 등록 순간 저장된다(7.3 그대로). AI 호출 수는 수동 등록과 같다(공고 1건당 분석 1회).

### 1.2 만들지 않는 것

- 앱이 채용 사이트에 접속하는 것(크롤링·숨은 브라우저 재시도·로그인 자동화). 북마크 버튼은 사용자가 이미 연 화면의 글자만 읽는다.
- Chrome 확장 프로그램, 다른 브라우저 전용 처리, 사이트별 본문 영역 규칙(공통 규칙 하나만).
- 공고 이미지 글자 읽기(OCR). 이미지로 된 공고는 글자가 적어 "확인 후 등록"으로 빠진다(아래 1.5).
- 이미 본문이 있는 공고의 본문 덮어쓰기(기존 [본문 다시 붙여넣기]를 쓴다).
- 앱이 꺼져 있는지 미리 알아보는 요청(사설망 접근 권한 창이 뜰 수 있어 하지 않는다).
- DNS 리바인딩 같은 앱 전체 보안 강화(기존부터 있는 범위, 이번 작업 밖).

### 1.3 전달 방법: 주소 뒤 `#` 조각(fragment) + 새 탭 — 결정

| 방법 | 판단 |
|---|---|
| **a. `window.open('http://127.0.0.1:3939/postings/receive#cf=…')` (채택)** | `#` 뒤는 서버로 가지 않는다(서버 로그·요청에 남지 않음). 최상위 탭 이동이라 CORS가 없고, Chrome의 사설망 접근 제한(PNA, 지금은 Local Network Access 권한)은 fetch·iframe 같은 하위 요청 대상이라 걸리지 않는 것으로 안다(**추측, TC-BM-M1에서 실제 Chrome으로 확인**). 앱 페이지가 같은 출처에서 서버 액션을 부르므로 Next의 서버 액션 출처 검사가 그대로 지킨다 |
| b. 다른 출처에서 폼 POST(`target=_blank`) | 다른 사이트가 보낸 POST를 받는 입구를 새로 열어야 한다(서버 액션은 다른 출처를 막음). 사이트 간 요청 위조 입구가 생겨 버림 |
| c. fetch로 앱에 직접 보내기 | 사설망 접근 권한 창·CORS 설정이 필요. 버림 |
| d. 빈 탭을 열고 `postMessage` | 주소·방문 기록에 아무것도 안 남는 장점이 있으나, 사이트가 COOP 헤더를 쓰면 창 연결이 끊겨 실패한다. 버림 |

- **형식**: `#cf=` + `encodeURIComponent(JSON.stringify({ v: 1, k: 토큰, u: location.href, t: document.title, x: 본문, c: 잘렸나 }))`.
- **길이**: 본문은 북마크 버튼에서 `MAX_POSTING_TEXT_LENGTH`(50,000자)로 자른다. 한글 1자 = 인코딩 9자라 최악 약 45만 자 주소 → Chrome 주소 한도(2MB) 안. 서버도 다시 50,000자로 자른다(오류 대신 자름, 1.5).
- **창 옵션**: `window.open(주소, '_blank', 'noopener,noreferrer')`. 앱 탭이 채용 사이트 창을 건드리지 못하고, 채용 사이트로 앱 주소가 새지 않는다.
- 클릭 뒤 펼치기 대기는 800ms로 둔다. Chrome의 사용자 동작 유효 시간(약 5초) 안이라 팝업 차단에 걸리지 않는다.

### 1.4 보안 (로컬 앱 수준에 맞게)

**지킬 것**: 다른 웹사이트가 `window.open('http://127.0.0.1:3939/postings/receive#…')`를 해도 공고가 등록되거나 `claude`가 불리면 안 된다.

- **확인 값(토큰)**: 무작위 24바이트를 base64url로 만든 32자. 설정 DB(`settings` 표, 키 `bookmarklet.token`, 만든 시각 `bookmarklet.createdAt`)에 둔다. **새 표·칸 없음**(기존 키-값 표).
  - 설정 화면을 처음 열 때 없으면 만든다(`getOrCreateBookmarkletToken`).
  - 북마크 버튼 코드 안에만 들어간다. 화면에 글자로 따로 보이지 않는다.
- **토큰이 맞을 때만** 바로 등록·분석. 없거나 틀리면 **등록하지 않고** 공고 등록 폼을 받은 내용으로 채워서 보여 준다(사용자가 [등록하고 분석]을 눌러야 함). 이때 `claude` 호출 0회.
- 비교는 `crypto.timingSafeEqual`(길이가 다르면 바로 false). 저장된 토큰이 없으면 언제나 false.
- **남는 곳 줄이기**
  - 서버 로그: `#` 뒤는 서버로 가지 않는다. 서버 액션 입력·토큰을 `console.log`하지 않는다.
  - 주소창·뒤로 가기: 받는 페이지가 `location.hash`를 읽은 **직후, 서버 액션을 부르기 전에** `history.replaceState(null, '', '/postings/receive')`로 지운다.
  - Chrome 방문 기록(chrome://history): 처음 연 주소(토큰·본문 포함)가 남을 수 있다. 이 PC 안의 기록이고 토큰으로 할 수 있는 일은 "이 앱에 공고 등록·분석"뿐이라 받아들인다. 사용 안내에 적는다.
  - Chrome 북마크: 코드에 토큰이 들어 있어 Chrome 동기화를 켜 두면 Google 계정 북마크에도 들어간다. 같은 이유로 받아들이고 안내에 적는다.
  - 북마크 버튼은 그 페이지 안에서 돌기 때문에 그 페이지의 스크립트가 원하면 토큰을 볼 수 있다(북마클릿의 한계). 채용 사이트가 이 앱을 노릴 일은 거의 없어 받아들이고, 새어 나갔다고 생각되면 [새로 만들기]로 바꾼다.
- [새로 만들기]: 토큰을 바꾼다. 예전 버튼은 그 순간부터 "확인 후 등록"으로 떨어진다(깨지지는 않음).
- 서버 액션은 Next가 같은 출처만 받는다(기존). 다른 사이트가 액션을 직접 부를 수 없다.

### 1.5 앱이 받는 쪽: `/postings/receive`

**순서** (`receiveFromBookmarklet`, 위에서부터 처음 걸리는 것):

| # | 조건 | 결과 `kind` | 등록·분석 | 사용자에게 보이는 것 |
|---|---|---|---|---|
| 1 | 토큰 없음·틀림 | `confirm` (`reason: 'token'`) | 안 함 | 채운 등록 폼 + 노란 안내 "북마크 버튼 확인 값이 맞지 않아 자동으로 등록하지 않았습니다. 내용을 확인하고 [등록하고 분석]을 누르세요. 설정에서 북마크 버튼을 새로 만들었다면 북마크바의 버튼도 바꾸세요." |
| 2 | 주소가 http(s)가 아님(`assertHttpUrl` 실패, 예: 내 PC의 파일) | `confirm` (`reason: 'url'`) | 안 함 | 링크 칸은 비우고 본문만 채운 폼 + "이 페이지 주소는 등록할 수 없습니다(http·https만). 본문만으로 등록하려면 [등록하고 분석]을 누르세요." |
| 3 | 같은 링크의 공고가 있고 **본문이 있음** | `existing` | 안 함 | 그 공고 상세 + 알림 "이미 등록된 공고입니다. 본문을 바꾸려면 공고 원문 탭의 [본문 다시 붙여넣기]를 쓰세요" |
| 4 | 본문 글자 < `MIN_POSTING_TEXT_LENGTH`(300자, 제목 줄 빼고 셈) | `confirm` (`reason: 'short'`) | 안 함 | 채운 폼 + "가져온 글자가 너무 적습니다(이미지로 된 공고일 수 있습니다). 공고 본문을 직접 붙여넣고 [등록하고 분석]을 누르세요." |
| 5 | 같은 링크의 공고가 있고 본문이 비어 있음, 분석 작업이 대기·진행 중 | `existing` | 안 함 | 상세 + "이미 등록된 공고입니다. 분석이 진행 중입니다" |
| 6 | 같은 링크의 공고가 있고 본문이 비어 있음(예: 링크로 읽기 실패) | `existing` | 본문 저장(출처 `bookmarklet`) + 분석 1회 | 상세 + "이미 등록된 공고입니다. 본문이 없던 공고라 가져온 본문으로 분석을 시작했습니다" |
| 7 | 새 링크 | `registered` | 등록(본문 출처 `bookmarklet`) + 분석 1회 | 상세 + "북마크 버튼으로 가져온 본문으로 분석을 시작했습니다" |

- 1·2·4번(`confirm`) 폼은 기존 `NewPostingForm`에 처음 값을 넣은 것이다. 제출은 기존 `registerPostingAction`(본문 출처 `pasted`)을 그대로 쓴다.
- 6·7번에서 본문이 잘렸으면 알림 끝에 " (본문이 길어 앞 5만 자만 저장했습니다)"를 붙인다.
- 같은 링크 판단은 기존 `canonicalizeUrl` 그대로(추적 꼬리·`#` 무시).
- 기본 이력서가 없어도 등록한다(기존 등록과 같음. 분석이 "기본 이력서를 먼저 등록하세요."로 실패한다).

**본문 정리** (`normalizeReceivedText(title, text, cut)` — 서버, 순수 함수):
1. `\r\n` → `\n`, 각 줄 끝 공백 제거, 빈 줄 3개 이상 → 2개, 앞뒤 공백 제거.
2. 제목이 있으면 맨 앞에 `페이지 제목: {title}` 한 줄과 빈 줄을 붙인다(분석이 회사·포지션을 찾기 쉽게). 제목은 앞뒤 공백 제거, 300자로 자름.
3. 전체를 50,000자로 자른다. 자르면 `cut = true`(북마크 버튼이 이미 자른 경우 `c: true`도 `cut`).
4. 300자 검사(4번)는 제목 줄을 붙이기 전 본문 길이로 한다.

**사이트·출처 이름**: 사이트는 기존 `detectSite(url)`. 결과가 `other`이면 `siteNote` = 주소의 호스트 이름에서 앞 `www.`를 뺀 것(예: `careers.example.com`). 4개 사이트면 `siteNote` 없음. 페이지 제목은 출처 이름으로 쓰지 않는다(대개 공고 제목이라서). 회사·포지션은 넣지 않고 분석이 채운다.

**받는 화면 흐름** (`ReceiveBookmarklet.tsx`, 클라이언트):
1. 처음 한 번만(ref로 막음, React 개발 모드 두 번 실행 대비): `const raw = location.hash` → 바로 `history.replaceState(null, '', '/postings/receive')`.
2. `parseBookmarkletHash(raw)`가 `null`이면 빈 상태: "받은 공고가 없습니다. 공고 페이지에서 북마크바의 [Career Flow로 보내기]를 누르세요." + [공고 등록으로](→ `/postings/new`) + [설정에서 북마크 버튼 받기](→ `/settings#bookmarklet`).
3. 아니면 "공고를 등록하는 중…"을 보이고 `receiveBookmarkletAction(payload)` 호출.
4. `registered`·`existing` → `router.replace('/postings/{id}?notice=' + encodeURIComponent(notice))`(기존 Toast가 알림을 띄우고 주소에서 지움).
5. `confirm` → 노란 안내 + `NewPostingForm`(처음 값 채움, 본문 펼침이 열린 상태).
6. `error` → 빨간 줄 "받은 내용을 읽지 못했습니다: {message}" + [공고 등록으로].
- 앱이 꺼져 있을 때: Chrome이 "연결할 수 없음" 탭을 보인다(북마크 버튼은 알 수 없다). 그 탭 주소에 `#…`가 그대로 있으므로 **앱을 켠 뒤 그 탭을 새로고침하면 이어서 등록된다**. 사용 안내에 적는다.
- 처리 후 새로고침하면 `#`이 지워져 있어 빈 상태가 보인다(다시 등록하지 않음).

### 1.6 북마크 버튼 코드 (앱이 만든다)

`buildBookmarkletCode({ token, appOrigin }): string` — 손으로 쓴 JS 원문 문자열(`BOOKMARKLET_SOURCE`)의 자리표시를 `JSON.stringify(값)`으로 바꾸고 `'javascript:' + encodeURIComponent(원문)`을 돌려준다(원문 속 `%`가 Chrome의 javascript: 주소 해석에 깨지지 않게). TS 함수를 `.toString()`으로 쓰지 않는다(빌드가 코드를 바꿀 수 있음). 결과 길이 6,000자 이하.

- `appOrigin`: 설정 화면 요청의 `host` 헤더로 `http://{host}`(평소 `http://127.0.0.1:3939`, E2E는 그 포트).

원문이 하는 일:
1. `location.origin === APP`이면 `alert('Career Flow 화면에서는 쓸 수 없습니다. 공고 페이지에서 누르세요.')` 후 끝.
2. 범위 `root` = `document.querySelector('main, [role=main], article')`의 글자가 300자 이상이면 그것, 아니면 `document.body`.
3. **펼치기** (모두 `try/catch`, 실패해도 계속):
   - `root` 안 `details:not([open])` 최대 20개 → `open = true`.
   - 후보: `root` 안 `button, [role=button], summary, a`. `a`는 `href`가 없거나 `#`·`javascript:`로 시작할 때만(다른 페이지로 넘어가지 않게).
   - 글자(공백 하나로 줄인 `textContent`)가 15자 이하이고 아래 정규식에 맞을 때만:
     `/^(상세\s*(정보|내용)?\s*)?(더\s*보기|펼치기|펼쳐\s*보기|자세히\s*보기|더\s*읽기)\s*[+▼▽∨⌄˅›>]?$|^(show|see|read)\s+more$|^more$/i`
   - 빼는 것: `type=submit`, `disabled`, `aria-expanded="true"`, 화면에 안 보이는 것(`getClientRects().length === 0`), `header, nav, footer` 안.
   - 최대 10개를 차례로 `.click()`.
4. 800ms 뒤 모으기: `root.innerText` + 같은 출처 iframe마다 `contentDocument.body.innerText`(다른 출처는 건너뜀, 잡코리아 상세처럼 본문이 iframe에 있는 경우 대비).
5. 글자가 비면 `alert('이 페이지에서 글자를 찾지 못했습니다.')` 후 끝.
6. 50,000자 넘으면 앞부분만, `c: true`.
7. `window.open(APP + '/postings/receive#cf=' + encodeURIComponent(JSON.stringify(payload)), '_blank', 'noopener,noreferrer')`.

**약관 판단(한 줄)**: 사용자가 직접 연 화면에서, 사용자가 누를 때 한 번, 화면의 "더 보기"를 대신 누르고 이미 받은 글자를 읽는 것뿐이라 자동 수집(크롤링)·자동 지원·자동 로그인에 해당하지 않고 사이트에 추가 요청을 반복하지 않는다 → 문제 소지 낮다고 판단(사이트별 약관 원문은 확인하지 않았다).

### 1.7 설정 화면 "북마크 버튼" 카드 (작업별 모델 카드 다음, `id="bookmarklet"`)

```
북마크 버튼
공고 페이지에서 누르면 그 화면의 글자와 주소를 이 앱으로 보내 바로 등록하고 분석합니다.
채용 사이트에 따로 접속하지 않습니다.

  [ Career Flow로 보내기 ]   ← 북마크바로 끌어다 놓으세요

1. Chrome에서 Ctrl+Shift+B로 북마크바를 켭니다.
2. 위 버튼을 북마크바로 끌어다 놓습니다.
3. 공고 페이지에서 북마크바의 [Career Flow로 보내기]를 누릅니다.
끌어다 놓기가 안 되면 [코드 복사] 뒤 북마크바에서 오른쪽 클릭 → 페이지 추가 → URL 칸에 붙여넣으세요.

[코드 복사]  [새로 만들기]                        만든 날 2026-11-27
버튼 안에 이 앱만 아는 확인 값이 들어 있습니다. 다른 사람에게 보내지 마세요.
```

| 요소 | 동작 |
|---|---|
| [Career Flow로 보내기] | 끌어다 놓는 링크. React 19는 `href`의 `javascript:`를 막으므로 `useEffect`에서 `ref.current.setAttribute('href', code)`로 넣는다. 설정 화면에서 누르면 `preventDefault` + 알림 "북마크바로 끌어다 놓으세요" |
| [코드 복사] | 코드 전체를 클립보드로, "복사됨". 실패하면 "복사하지 못했습니다. 아래 글을 직접 복사하세요." + 코드가 든 읽기 전용 칸 |
| [새로 만들기] | 확인 창 "북마크 버튼을 새로 만듭니다. 북마크바의 예전 버튼은 바로 분석하지 않고 확인을 받게 됩니다. 북마크바의 버튼을 지우고 새 버튼을 끌어다 놓으세요." [새로 만들기] [취소] → 토큰 교체, 알림 "북마크 버튼을 새로 만들었습니다. 북마크바의 버튼을 바꾸세요" |
| 만든 날 | `bookmarklet.createdAt`의 날짜 |

### 1.8 파일·함수 (developer용)

| 파일 | 무엇 |
|---|---|
| `src/lib/bookmarklet/token.ts` (서버) | `getOrCreateBookmarkletToken(db?): { token: string; createdAt: string }`, `regenerateBookmarkletToken(db?): { token; createdAt }`, `checkBookmarkletToken(given: unknown, db?): boolean`. `getSetting`/`setSetting` 사용 |
| `src/lib/bookmarklet/code.ts` (순수) | `BOOKMARKLET_SOURCE`, `buildBookmarkletCode({ token, appOrigin }): string` |
| `src/lib/bookmarklet/payload.ts` (순수, 클라이언트에서도 씀) | `type BookmarkletPayload = { v: 1; k: string; u: string; t: string; x: string; c: boolean }`, `parseBookmarkletHash(hash: string): BookmarkletPayload \| null`(접두 `#cf=` 아님·JSON 깨짐·필드 타입 틀림·`v !== 1`이면 null) |
| `src/lib/postings/receive.ts` (서버) | `normalizeReceivedText(title, text, cut): { text: string; bodyLength: number; cut: boolean }`, `receiveFromBookmarklet(input: { token: string; url: string; title: string; text: string; cut: boolean }, db?): ReceiveResult` |
| `src/lib/postings/repo.ts` | `registerPosting` 입력에 `textSource?: 'pasted' \| 'bookmarklet'`(기본 `pasted`). `setPostingText`의 `source`에 `'bookmarklet'` 추가 |
| `src/lib/db/schema.ts` | `rawTextSource`의 `$type`에 `'bookmarklet'` 추가(글자 칸이라 **마이그레이션 없음**) |
| `src/app/_actions/bookmarklet.ts` | `receiveBookmarkletAction(input: unknown): Promise<ReceiveResult>`(zod: token ≤ 100, url ≤ 2,000, title ≤ 1,000, text ≤ 200,000(서버에서 다시 자름), cut boolean; 검사 실패·예외는 `{ kind: 'error', message }`로 돌려주고 던지지 않음), `regenerateBookmarkletTokenAction(): Promise<ActionResult>` |
| `src/app/postings/receive/page.tsx` + `ReceiveBookmarklet.tsx` | 1.5 흐름. 서버 쪽은 `hasResume`·`siteNotes`만 넘김 |
| `src/app/postings/new/NewPostingForm.tsx` | 선택 prop `initial?: { url: string; text: string; siteNote: string }`. 본문이 있으면 `<details open>` |
| `src/app/settings/BookmarkletCard.tsx` + `page.tsx` | 1.7 |
| `src/app/postings/[id]/page.tsx` RawTab | `bookmarklet` → "북마크 버튼으로 가져옴" |
| `tests/fixtures/bookmarklet-e2e.html` | 1.9 TC-BM-14용 가짜 공고 |

```ts
type ReceiveResult =
  | { kind: 'registered'; postingId: number; notice: string }
  | { kind: 'existing'; postingId: number; notice: string }
  | { kind: 'confirm'; reason: 'token' | 'url' | 'short'; notice: string;
      prefill: { url: string; text: string; siteNote: string } }
  | { kind: 'error'; message: string };
```
- `prefill`과 모든 결과에 토큰을 넣지 않는다.
- 실제 `claude` 호출: 개발·테스트 0회(가짜 claude). 사용 때는 공고 1건당 분석 1회(기존과 같음).

### 1.9 테스트 케이스

Vitest

| ID | 대상 | 기대 결과 |
|---|---|---|
| TC-BM-01 | 토큰 | `getOrCreate` 두 번 → 같은 값, 32자 base64url. `regenerate` → 값·만든 시각 바뀜. `check`: 맞음 true / 틀림·빈 값·길이 다름·문자열 아님·저장 없음 false |
| TC-BM-02 | 코드 만들기 | `javascript:`로 시작, 줄바꿈 없음, 6,000자 이하. 뒤를 `decodeURIComponent`한 원문이 `new Function`으로 문법 오류 없음, 토큰·출처가 JSON 문자열로 들어 있음 |
| TC-BM-03 | 조각 읽기 | 올바른 `#cf=` → 값 그대로. 접두 없음·JSON 깨짐·`v: 2`·필드 빠짐·타입 틀림 → null |
| TC-BM-04 | 본문 정리 | 빈 줄 5개 → 2개, 줄 끝 공백 제거, 맨 앞 "페이지 제목: …". 50,001자 → 50,000자·`cut` true. `bodyLength`는 제목 줄 빼고 셈 |
| TC-BM-05 | 새 링크 등록 | 맞는 토큰·원티드 주소·본문 400자 → `registered`, 공고 1개, 본문 출처 `bookmarklet`, 사이트 원티드, 출처 이름 없음, 분석 작업 1개 |
| TC-BM-06 | 기타 사이트 | `https://www.careers.example.com/jobs/1` → 출처 이름 `careers.example.com` |
| TC-BM-07 | 토큰 틀림·없음 | `confirm`/`token`, 공고·작업 0개, `prefill`에 주소·정리된 본문, 결과 어디에도 토큰 없음 |
| TC-BM-08 | 주소 아님 | `file:///C:/a.html` → `confirm`/`url`, `prefill.url` 빈 값, 공고 0개 |
| TC-BM-09 | 짧은 본문 | 본문 299자 → `confirm`/`short`, 공고 0개. 300자 → 등록 |
| TC-BM-10 | 같은 링크·본문 있음 | 꼬리만 다른 주소 → `existing`, 본문 그대로, 새 작업 0개, 알림에 "[본문 다시 붙여넣기]" (짧은 본문이어도 `short`보다 이것이 먼저) |
| TC-BM-11 | 같은 링크·본문 없음 | 작업 없음 → 본문 저장(출처 `bookmarklet`)·작업 1개·"본문이 없던 공고라". 작업 대기 중 → 바뀜 없음·"분석이 진행 중입니다" |
| TC-BM-12 | 잘린 알림 | 60,000자 → 저장 50,000자, 알림 끝 "(본문이 길어 앞 5만 자만 저장했습니다)" |
| TC-BM-13 | 액션 입력 검사 | 숫자 토큰·없는 필드·300,000자 본문 → `{ kind: 'error' }`, 던지지 않음, 공고 0개 |

E2E (Playwright, 가짜 claude, `tests/e2e/20-bookmarklet.spec.ts`)

| ID | 대상 | 기대 결과 |
|---|---|---|
| TC-BM-14 | 공고 페이지에서 보내기 | 픽스처(`main` 안에 "상세 정보 더 보기" 버튼이 숨은 문단을 펼침, 폼 안 submit "더보기"는 누르면 표시 남김, `href="other.html"`의 "다른 공고 더보기" 링크)에서 코드를 실행 → 새 탭 `/postings/receive` → `/postings/{id}`, 알림 "북마크 버튼으로 가져온 본문으로 분석을 시작했습니다". 원문 탭에 숨은 문단 글자·"북마크 버튼으로 가져옴". submit 표시 없음, 원래 탭 주소 그대로. 분석 완료 |
| TC-BM-15 | 주소에서 지움 | TC-BM-14의 받는 탭에서 `#`이 남지 않음(`page.evaluate(() => location.hash) === ''`이 이동 전에도) |
| TC-BM-16 | 토큰 틀림 | 틀린 토큰으로 `/postings/receive#cf=…` 직접 열기 → 노란 안내 + 채운 폼, 공고 수 그대로. [등록하고 분석] 누르면 등록 |
| TC-BM-17 | 빈 상태 | `#` 없이 열기 → "받은 공고가 없습니다…" + 두 링크 |
| TC-BM-18 | 같은 링크 다시 | TC-BM-14 페이지에서 한 번 더 → 같은 공고, "이미 등록된 공고입니다. 본문을 바꾸려면…" |
| TC-BM-19 | 설정 카드 | 버튼 `href`가 `javascript:`로 시작, 눌러도 이동 없이 "북마크바로 끌어다 놓으세요". [코드 복사] 글 = `href`. [새로 만들기] → 확인 → 코드 바뀜. 바꾸기 전 코드로 보내면 TC-BM-16처럼 확인 폼 |
| TC-BM-20 | 폭 | 설정 카드·받는 화면(안내+폼) 1024·1240·1440에서 가로 넘침 없음, 한글 줄바꿈 keep-all |

수동

| ID | 대상 | 기대 결과 |
|---|---|---|
| TC-BM-M1 | 실제 Chrome | 북마크바에 끌어다 놓기. 원티드·리멤버·그룹바이·잡코리아 실제 공고 각 1건에서 눌러 "더 보기"가 펼쳐지고 분석까지 됨. 사설망 접근 권한 창이 뜨지 않는지 확인 |
| TC-BM-M2 | 앱 꺼짐 | 앱을 끄고 누르면 연결 오류 탭. 앱을 켜고 그 탭을 새로고침하면 등록됨 |

### 1.10 바뀌는 문서 (이 설계에서 고침)

- `docs/spec/product.md` 7.3 "등록"(북마크 버튼 줄), 8장(추출 경로 셋째), 10장 `postings.raw_text`의 출처 값.
- `docs/spec/screens.md` 0.1 화면 목록(2-1 공고 받기), 2.1 새 절 "공고 받기 `/postings/receive`", 3.6 읽은 방법, 8 설정 "북마크 버튼" 줄.
- `docs/spec/architecture.md` 2장(`bookmarklet/`, `postings/receive.ts`), 3장(`_actions/bookmarklet.ts`, `postings/receive/`, `settings/BookmarkletCard.tsx`).
- `docs/guide/usage.md` 새 절 "북마크 버튼으로 공고 보내기".
- `docs/test/test-cases.md` 16장 TC-BM.
- 와이어프레임·목업은 고치지 않는다(설정 카드 하나·기존 등록 폼 재사용. 화면 문서 1.7의 배치를 따른다).

### 1.11 정할 것 초안

- 없음. 사용자가 고른 방향(북마크 버튼, 확인 없이 바로 분석) 안에서 정했다.
- 검토 때 바꿀 수 있는 작은 판단(사용자 검토에서 보면 됨):
  - 본문이 이미 있는 공고는 북마크 버튼으로 덮어쓰지 않는다(덮어쓰기는 원문 탭의 [본문 다시 붙여넣기]).
  - 글자가 300자 미만이면 바로 분석하지 않고 확인 폼으로(이미지 공고에 `claude` 호출을 쓰지 않게).
  - Chrome 방문 기록·북마크 동기화에 확인 값이 남는 것은 받아들인다(할 수 있는 일이 "등록·분석"뿐, [새로 만들기]로 교체).

## 2. 사용자 검토

| 날짜 | 결과 | 고칠 점 |
|---|---|---|

## 3. 개발·검증 회차

| 회차 | 개발 커밋 범위 | 검증 결과 | 남은 필수 항목 | 비고 |
|---|---|---|---|---|

## 4. 결정 요청

| D-번호 | 무엇을 | 멈춘 단계 | 답 | 재개 |
|---|---|---|---|---|

## 5. 재설계

| 회차 | 요청한 쪽 | 이유와 근거 | 바뀐 설계 | 사용자 검토 |
|---|---|---|---|---|

## 7. 결과

- 병합 커밋:
- 최종 검사:
- 사용자가 직접 확인할 것:
