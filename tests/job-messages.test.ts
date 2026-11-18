import { describe, expect, test } from 'vitest';
import { describeJobFailure, estimateText } from '@/lib/ai/job-messages';

describe('describeJobFailure', () => {
  test('extract_failed asks for pasted text', () => {
    const f = describeJobFailure({ errorKind: 'extract_failed', errorMessage: '본문이 짧습니다' }, 'analyze_posting');
    expect(f.kind).toBe('extract_failed');
    expect(f.message).toContain('공고 본문을 읽지 못했습니다');
    expect(f.canPaste).toBe(true);
  });
  test('auth tells the user to log in from a terminal', () => {
    const f = describeJobFailure({ errorKind: 'auth', errorMessage: null }, 'analyze_posting');
    expect(f.message).toContain('터미널에서 `claude`를 실행해 로그인');
    expect(f.canPaste).toBe(false);
  });
  test('usage_limit shows the original message', () => {
    const f = describeJobFailure({ errorKind: 'usage_limit', errorMessage: 'Usage limit reached|123' }, 'analyze_posting');
    expect(f.message).toBe('Usage limit reached|123');
  });
  test('timeout states the limit in minutes and links to settings', () => {
    const f = describeJobFailure({ errorKind: 'timeout', errorMessage: null }, 'analyze_posting');
    expect(f.message).toBe('시간 제한(5분)을 넘었습니다. 설정에서 시간 제한을 늘릴 수 있습니다.');
    expect(f.settingsLink).toBe(true);
  });
  test('schema offers the raw message in a fold', () => {
    const f = describeJobFailure({ errorKind: 'schema', errorMessage: '{"bad":1}' }, 'analyze_posting');
    expect(f.message).toBe('결과를 읽지 못했습니다.');
    expect(f.detail).toBe('{"bad":1}');
  });
  test('interrupted', () => {
    expect(describeJobFailure({ errorKind: 'interrupted', errorMessage: null }, 'analyze_posting').message).toBe(
      '앱이 종료되어 작업이 중단되었습니다.',
    );
  });
  test('cli and unknown fall back to the message', () => {
    expect(describeJobFailure({ errorKind: 'cli', errorMessage: '실행 실패' }, 'analyze_posting').message).toBe('실행 실패');
    expect(describeJobFailure({ errorKind: null, errorMessage: null }, 'analyze_posting').message).toBe('작업이 실패했습니다.');
  });
});

describe('estimateText', () => {
  test('analysis wording', () => {
    expect(estimateText('analyze_posting')).toBe('분석 중… (보통 1~2분)');
  });
});
