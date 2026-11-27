import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { postings } from '@/lib/db/schema';
import { latestJobFor } from '@/lib/ai/queue';
import { checkBookmarkletToken } from '@/lib/bookmarklet/token';
import type { ReceiveResult } from '@/lib/bookmarklet/payload';
import { MAX_POSTING_TEXT_LENGTH, MIN_POSTING_TEXT_LENGTH } from '@/lib/domain/limits';
import { assertHttpUrl, canonicalizeUrl, detectSite } from '@/lib/domain/normalize';
import { registerPosting, reanalyzePosting, setPostingText } from './repo';

export type { ReceiveResult };

const MAX_TITLE_LENGTH = 300;
/** n자로 자르되 서로게이트 쌍을 가르지 않는다(자른 끝이 앞쪽 절반이면 한 글자 더 뺀다). */
function safeSlice(s: string, n: number): string {
  if (s.length <= n) return s;
  const out = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

const CUT_NOTE = ' (본문이 길어 앞 5만 자만 저장했습니다)';

/**
 * 북마크 버튼이 보낸 글자를 정리한다. 줄 끝 공백·여러 빈 줄을 줄이고, 제목이 있으면 맨 앞에 한 줄 붙인다.
 * bodyLength는 제목 줄을 붙이거나 자르기 전의 본문 길이다(짧은 본문 검사에 쓴다).
 */
export function normalizeReceivedText(
  title: string,
  text: string,
  cut: boolean,
): { text: string; bodyLength: number; cut: boolean } {
  const body = text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  const head = safeSlice(title.trim(), MAX_TITLE_LENGTH);
  const whole = head ? `페이지 제목: ${head}\n\n${body}` : body;
  const tooLong = whole.length > MAX_POSTING_TEXT_LENGTH;
  return {
    text: tooLong ? safeSlice(whole, MAX_POSTING_TEXT_LENGTH) : whole,
    bodyLength: body.length,
    cut: cut || tooLong,
  };
}

/** 4개 사이트가 아니면 주소의 호스트 이름(앞 www. 제외)을 출처 이름으로 쓴다. */
function siteNoteFor(url: string): string {
  if (detectSite(url) !== 'other') return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isHttp(url: string): boolean {
  try {
    assertHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 북마크 버튼이 보낸 공고를 받는다. 확인 값이 맞고 모든 조건이 맞을 때만 등록하고 분석한다.
 * 판단 순서는 docs/work/bookmarklet.md 1.5. 결과 어디에도 확인 값을 넣지 않는다.
 */
export function receiveFromBookmarklet(
  input: { token: string; url: string; title: string; text: string; cut: boolean },
  db: Db = getDb(),
): ReceiveResult {
  const url = input.url.trim();
  const normalized = normalizeReceivedText(input.title, input.text, input.cut);
  const httpOk = isHttp(url);
  const prefill = { url: httpOk ? url : '', text: normalized.text, siteNote: httpOk ? siteNoteFor(url) : '' };

  // 1. 확인 값
  if (!checkBookmarkletToken(input.token, db)) {
    return {
      kind: 'confirm',
      reason: 'token',
      notice:
        '북마크 버튼 확인 값이 맞지 않아 자동으로 등록하지 않았습니다. 내용을 확인하고 [등록하고 분석]을 누르세요. 설정에서 북마크 버튼을 새로 만들었다면 북마크바의 버튼도 바꾸세요.',
      prefill,
    };
  }
  // 2. 주소
  if (!httpOk) {
    return {
      kind: 'confirm',
      reason: 'url',
      notice: '이 페이지 주소는 등록할 수 없습니다(http·https만). 본문만으로 등록하려면 [등록하고 분석]을 누르세요.',
      prefill,
    };
  }

  const canonical = canonicalizeUrl(url);
  const existing = db.select().from(postings).where(eq(postings.canonicalUrl, canonical)).get();
  const cutNote = normalized.cut ? CUT_NOTE : '';

  // 3. 같은 링크, 본문 있음
  if (existing && existing.rawText?.trim()) {
    return {
      kind: 'existing',
      postingId: existing.id,
      notice: '이미 등록된 공고입니다. 본문을 바꾸려면 공고 원문 탭의 [본문 다시 붙여넣기]를 쓰세요',
    };
  }
  // 4. 짧은 본문
  if (normalized.bodyLength < MIN_POSTING_TEXT_LENGTH) {
    return {
      kind: 'confirm',
      reason: 'short',
      notice: '가져온 글자가 너무 적습니다(이미지로 된 공고일 수 있습니다). 공고 본문을 직접 붙여넣고 [등록하고 분석]을 누르세요.',
      prefill,
    };
  }
  if (existing) {
    // 5. 같은 링크, 본문 없음, 분석 대기·진행 중
    if (latestJobFor('analyze_posting', () => true, db, { postingId: existing.id, statuses: ['queued', 'running'] })) {
      return { kind: 'existing', postingId: existing.id, notice: '이미 등록된 공고입니다. 분석이 진행 중입니다' };
    }
    // 6. 같은 링크, 본문 없음: 본문을 채우고 분석
    setPostingText(existing.id, normalized.text, db, 'bookmarklet');
    reanalyzePosting(existing.id, db);
    return {
      kind: 'existing',
      postingId: existing.id,
      notice: `이미 등록된 공고입니다. 본문이 없던 공고라 가져온 본문으로 분석을 시작했습니다${cutNote}`,
    };
  }
  // 7. 새 링크
  const r = registerPosting(
    { url, pastedText: normalized.text, siteNote: siteNoteFor(url), textSource: 'bookmarklet' },
    db,
  );
  return {
    kind: 'registered',
    postingId: r.postingId,
    notice: `북마크 버튼으로 가져온 본문으로 분석을 시작했습니다${cutNote}`,
  };
}
