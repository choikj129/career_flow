import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ClaudeCliRunner } from '@/lib/ai/claude-cli';
import { checkClaudeHealth } from '@/lib/ai/health';

const FAKE = resolve(__dirname, 'fixtures/fake-claude.mjs');
const fake = (mode: string) =>
  new ClaudeCliRunner({ bin: process.execPath, binArgs: [FAKE], env: { FAKE_CLAUDE_MODE: mode } });
const versionOk = { runVersion: async () => ({ ok: true as const, text: '2.1.325 (Claude Code)' }) };
const versionMissing = { runVersion: async () => ({ ok: false as const, text: '' }) };

describe('checkClaudeHealth', () => {
  test('without login check reports version only and never runs the model', async () => {
    let called = false;
    const runner = {
      run: async () => {
        called = true;
        throw new Error('no');
      },
    };
    const r = await checkClaudeHealth({ ...versionOk, runner });
    expect(called).toBe(false);
    expect(r).toMatchObject({ installed: true, version: '2.1.325', loggedIn: null });
  });
  test('not installed', async () => {
    const r = await checkClaudeHealth({ ...versionMissing, checkLogin: true, runner: fake('ok') });
    expect(r.installed).toBe(false);
    expect(r.loggedIn).toBeNull();
    expect(r.message).toContain('설치');
  });
  test('login check ok uses haiku and no tools', async () => {
    let req: any;
    const runner = {
      run: async (q: any) => {
        req = q;
        return { output: { ok: true }, sessionId: '', usage: {}, durationMs: 1 };
      },
    };
    const r = await checkClaudeHealth({ ...versionOk, checkLogin: true, runner });
    expect(r.loggedIn).toBe(true);
    expect(req.model).toBe('haiku');
    expect(req.tools).toEqual([]);
    expect(req.prompt.length).toBeLessThan(200);
  });
  test('auth failure means not logged in with terminal hint', async () => {
    const r = await checkClaudeHealth({ ...versionOk, checkLogin: true, runner: fake('auth') });
    expect(r.loggedIn).toBe(false);
    expect(r.message).toContain('claude');
  });
  test('other failure leaves login unknown', async () => {
    const r = await checkClaudeHealth({ ...versionOk, checkLogin: true, runner: fake('garbage') });
    expect(r.loggedIn).toBeNull();
  });
  test('usage limit still counts as logged in', async () => {
    const r = await checkClaudeHealth({ ...versionOk, checkLogin: true, runner: fake('limit') });
    expect(r.loggedIn).toBe(true);
  });
});
