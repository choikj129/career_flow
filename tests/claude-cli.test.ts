import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { ClaudeCliRunner, buildClaudeArgs } from '@/lib/ai/claude-cli';
import type { AiRunRequest } from '@/lib/ai/runner';
import { makeTmpDir } from './helpers/tmp';

const FAKE = resolve(__dirname, 'fixtures/fake-claude.mjs');
let tmp: string;
beforeAll(() => {
  tmp = makeTmpDir('cf-ai-');
});

const fake = (mode: string) =>
  new ClaudeCliRunner({ bin: process.execPath, binArgs: [FAKE], env: { FAKE_CLAUDE_MODE: mode } });
const req = (o: Partial<AiRunRequest> = {}): AiRunRequest => ({
  prompt: '가'.repeat(40000),
  jsonSchema: { type: 'object' },
  model: 'opus',
  tools: [],
  cwd: tmp,
  timeoutMs: 5000,
  ...o,
});

describe('ClaudeCliRunner', () => {
  test('passes large prompt via stdin and returns structured_output', async () => {
    const r = await fake('ok').run(req());
    expect((r.output as { stdinLength: number }).stdinLength).toBe(40000);
    expect(r.sessionId).toBe('s-1');
  });

  test('builds required flags and never passes prompt as argument', () => {
    const args = buildClaudeArgs(req({ tools: ['Read'], resumeSessionId: 's-9' }));
    expect(args).toEqual(
      expect.arrayContaining([
        '-p', '--safe-mode', '--output-format', 'json',
        '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
        '--model', 'opus', '--tools', 'Read', '--resume', 's-9', '--json-schema',
      ]),
    );
    expect(args.join(' ')).not.toContain('가가가');
    expect(args).not.toContain('--bare');
  });

  test('empty tools list passes empty string', () => {
    const args = buildClaudeArgs(req({ tools: [] }));
    expect(args[args.indexOf('--tools') + 1]).toBe('');
  });

  test('falls back to parsing result text as JSON', async () => {
    expect(((await fake('ok_result_text').run(req())).output as { stdinLength: number }).stdinLength).toBe(40000);
  });

  test('classifies auth failure', async () => {
    const p = fake('auth').run(req());
    await expect(p).rejects.toMatchObject({ kind: 'auth', sessionId: 's-2' });
    await expect(fake('auth').run(req())).rejects.toThrow(/터미널에서 `claude`를 실행해 다시 로그인하세요/);
  });

  test('classifies usage limit', async () => {
    await expect(fake('limit').run(req())).rejects.toMatchObject({ kind: 'usage_limit' });
  });

  test('non-JSON stdout is cli error', async () => {
    await expect(fake('garbage').run(req())).rejects.toMatchObject({ kind: 'cli' });
  });

  test('kills process on timeout', async () => {
    await expect(fake('hang').run(req({ timeoutMs: 500 }))).rejects.toMatchObject({ kind: 'timeout' });
  });

  test('missing binary is cli error with install hint', async () => {
    const p = new ClaudeCliRunner({ bin: 'definitely-not-claude' }).run(req());
    await expect(p).rejects.toMatchObject({ kind: 'cli' });
    await expect(new ClaudeCliRunner({ bin: 'definitely-not-claude' }).run(req())).rejects.toThrow(
      /Claude Code CLI를 찾을 수 없습니다/,
    );
  });
});
