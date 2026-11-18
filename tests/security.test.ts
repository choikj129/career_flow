// 보안·제약 점검: 인증 정보 미저장, claude 인자 배열 실행, API 키 미사용, 127.0.0.1 바인딩, 데이터 폴더 git 제외.
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ClaudeCliRunner } from '@/lib/ai/claude-cli';
import type { AiRunRequest } from '@/lib/ai/runner';

const ROOT = resolve(__dirname, '..');

function listFiles(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const srcFiles = () => listFiles(join(ROOT, 'src'), ['.ts', '.tsx']);
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');

const req = (o: Partial<AiRunRequest> = {}): AiRunRequest => ({
  prompt: 'x',
  jsonSchema: { type: 'object' },
  model: 'opus',
  tools: [],
  cwd: mkdtempSync(join(tmpdir(), 'cf-sec-')),
  timeoutMs: 10_000,
  ...o,
});

function script(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cf-sec-script-'));
  const file = join(dir, 'fake.mjs');
  writeFileSync(file, `for await (const _ of process.stdin) {}\n${body}\n`);
  return file;
}

afterEach(() => vi.unstubAllEnvs());

describe('인증 정보', () => {
  test('TC-AI-20 응답에 인증 관련 필드가 있어도 결과에는 사용량만 남는다', async () => {
    const file = script(`process.stdout.write(JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, session_id: 's',
      structured_output: { ok: true },
      credential_expires_at: '2099-01-01', access_token: 'SECRET-TOKEN-123', refresh_token: 'SECRET-REFRESH',
      usage: { input_tokens: 1 }, modelUsage: { opus: { costUSD: 0.1 } }, total_cost_usd: 0.1,
    }));`);
    const r = await new ClaudeCliRunner({ bin: process.execPath, binArgs: [file] }).run(req());
    expect(Object.keys(r.usage as object).sort()).toEqual(['modelUsage', 'totalCostUsd', 'usage']);
    const dumped = JSON.stringify(r);
    expect(dumped).not.toContain('SECRET-TOKEN-123');
    expect(dumped).not.toContain('SECRET-REFRESH');
    expect(dumped).not.toContain('credential');
  });

  test('TC-AI-21 오류 응답의 메시지에도 인증 필드가 섞여 들어가지 않는다', async () => {
    const file = script(`process.stdout.write(JSON.stringify({
      type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired',
      access_token: 'SECRET-TOKEN-456', session_id: 's' }));`);
    const err = await new ClaudeCliRunner({ bin: process.execPath, binArgs: [file] }).run(req()).catch((e) => e);
    expect(err.kind).toBe('auth');
    expect(String(err.message)).not.toContain('SECRET-TOKEN-456');
  });

  test('TC-AI-22 소스가 Claude Code 인증 파일·토큰을 읽지 않는다', () => {
    for (const f of srcFiles()) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/\.credentials|credentials\.json|\.claude[\\/]\.|CLAUDE_CODE_OAUTH_TOKEN/i);
    }
  });
});

describe('API 키 미사용', () => {
  test('TC-AI-23 Anthropic SDK·API 키를 쓰지 않는다(의존성·import·환경변수 읽기)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => d.startsWith('@anthropic-ai') || d === 'anthropic')).toEqual([]);
    for (const f of srcFiles()) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/@anthropic-ai|api\.anthropic\.com|process\.env\.ANTHROPIC/);
    }
  });

  test('TC-AI-24 사용자 환경에 ANTHROPIC_API_KEY가 있어도 claude 자식 프로세스에는 넘기지 않는다(구독 로그인으로 처리)', async () => {
    // 환경변수에 API 키가 있으면 claude가 구독 대신 API 과금을 쓸 수 있다.
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-should-not-leak');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'token-should-not-leak');
    const file = script(`process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's',
      structured_output: { key: process.env.ANTHROPIC_API_KEY ?? null, token: process.env.ANTHROPIC_AUTH_TOKEN ?? null } }));`);
    const r = await new ClaudeCliRunner({ bin: process.execPath, binArgs: [file] }).run(req());
    expect(r.output).toEqual({ key: null, token: null });
  });
});

describe('명령 실행 방식', () => {
  test('TC-AI-25 child_process는 claude-cli.ts에서만 쓰고 셸을 거치지 않는다', () => {
    const users = srcFiles().filter((f) => /child_process/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(users).toEqual(['src/lib/ai/claude-cli.ts']);
    const text = readFileSync(join(ROOT, 'src/lib/ai/claude-cli.ts'), 'utf8');
    expect(text).not.toMatch(/shell:\s*true/);
    expect(text).not.toMatch(/(?<![.\w])(exec|execSync|execFile|execFileSync)\(/);
  });

  test('TC-AI-26 사용자 입력(공고 본문)이 명령줄 인자로 가지 않는다: 특수문자가 들어 있어도 표준입력으로만', async () => {
    const marker = '"; rm -rf / & echo $(whoami) `id` | 가나다';
    const file = script(`process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's',
      structured_output: { argv: process.argv.slice(2) } }));`);
    const r = await new ClaudeCliRunner({ bin: process.execPath, binArgs: [file] }).run(req({ prompt: marker }));
    expect(JSON.stringify((r.output as { argv: string[] }).argv)).not.toContain('rm -rf');
  });

  test('TC-AI-27 모델 이름 같은 값에 공백·특수문자가 있어도 인자 하나로 전달된다', async () => {
    const file = script(`process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's',
      structured_output: { argv: process.argv.slice(2) } }));`);
    const r = await new ClaudeCliRunner({ bin: process.execPath, binArgs: [file] }).run(req({ model: 'a b; c' }));
    const argv = (r.output as { argv: string[] }).argv;
    expect(argv[argv.indexOf('--model') + 1]).toBe('a b; c');
  });
});

describe('로컬 전용', () => {
  test('TC-COMMON-20 dev/start 스크립트는 127.0.0.1에만 바인딩하고 포트 3939를 쓴다', () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    for (const k of ['dev', 'start']) {
      expect(scripts[k], k).toContain('-H 127.0.0.1');
      expect(scripts[k], k).toContain('-p 3939');
      expect(scripts[k], k).not.toContain('0.0.0.0');
    }
  });

  test('TC-COMMON-21 실행 스크립트는 127.0.0.1:3939를 연다', () => {
    const cmd = readFileSync(join(ROOT, 'scripts/start-career-flow.cmd'), 'utf8');
    expect(cmd).toContain('http://127.0.0.1:3939');
    expect(cmd).not.toContain('0.0.0.0');
    expect(cmd).toContain('npm run start');
  });

  test('TC-DATA-10 data/ 와 data-* 폴더는 git에서 제외된다', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
    expect(ignore).toContain('/data/');
    expect(ignore).toContain('/data-*/');
  });
});

describe('자식 프로세스 환경', () => {
  test('TC-AI-24 buildChildEnv 는 API 과금·공급자 변수를 모두 지우고 테스트용 env 는 유지한다', async () => {
    const { buildChildEnv } = await import('@/lib/ai/claude-cli');
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
      vi.stubEnv(k, 'x');
    }
    const env = buildChildEnv({ FAKE_CLAUDE_MODE: 'ok' });
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
      expect(env[k], k).toBeUndefined();
    }
    expect(env.FAKE_CLAUDE_MODE).toBe('ok');
    expect(env.PATH ?? env.Path).toBeTruthy();
  });
});
