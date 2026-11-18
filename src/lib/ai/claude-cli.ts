import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { config } from '@/lib/config';
import type { AiErrorKind } from '@/lib/domain/types';
import { AiError, type AiRunner, type AiRunRequest, type AiRunResult } from './runner';

/** 프롬프트는 포함하지 않는다(표준입력으로 보낸다). `--bare`는 쓰지 않는다(구독 로그인을 읽지 않음). */
export function buildClaudeArgs(req: AiRunRequest): string[] {
  const args = [
    '-p',
    '--safe-mode',
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--json-schema', JSON.stringify(req.jsonSchema),
    '--model', req.model,
    '--tools', req.tools.join(','),
  ];
  if (req.resumeSessionId) args.push('--resume', req.resumeSessionId);
  return args;
}

const AUTH_RE = /authenticat|oauth|log ?in|login/i;
const LIMIT_RE = /usage limit|rate limit|limit reached|quota/i;
const AUTH_HINT = '터미널에서 `claude`를 실행해 다시 로그인하세요.';
const MISSING_HINT = 'Claude Code CLI를 찾을 수 없습니다. 설치 또는 설정의 CLAUDE_BIN을 확인하세요.';

function classify(text: string): AiErrorKind {
  if (AUTH_RE.test(text)) return 'auth';
  if (LIMIT_RE.test(text)) return 'usage_limit';
  return 'cli';
}

/**
 * Windows의 npm 전역 설치는 `claude.cmd` 셸 스크립트다. 셸을 거치지 않고(인자 주입 방지)
 * 실행하려면 스크립트가 가리키는 실제 실행 파일을 찾아야 한다.
 * 찾지 못하면 원래 이름을 그대로 쓰고, 실행 시 ENOENT로 안내 문구를 낸다.
 */
function resolveWindowsBin(bin: string, env: NodeJS.ProcessEnv): { bin: string; prefix: string[] } {
  const fallback = { bin, prefix: [] as string[] };
  const ext = extname(bin).toLowerCase();
  const exts = ext ? [''] : (env.PATHEXT ?? '.EXE;.CMD').split(';').filter(Boolean);
  const dirs = isAbsolute(bin) || /[\/]/.test(bin) ? [''] : (env.PATH ?? env.Path ?? '').split(delimiter);
  for (const dir of dirs) {
    for (const e of exts) {
      const full = dir ? join(dir, bin + e) : bin + e;
      if (!existsSync(full)) continue;
      const found = extname(full).toLowerCase();
      if (found === '.exe') return { bin: full, prefix: [] };
      if (found === '.cmd' || found === '.bat') {
        const m = /"%dp0%[\\/]([^"]+)"/i.exec(readFileSync(full, 'utf8'));
        if (!m) return fallback;
        const target = resolve(dirname(full), m[1]);
        if (!existsSync(target)) return fallback;
        return /\.(c|m)?js$/i.test(target)
          ? { bin: process.execPath, prefix: [target] }
          : { bin: target, prefix: [] };
      }
    }
  }
  return fallback;
}

function killTree(pid: number | undefined, child: { kill: (signal?: NodeJS.Signals) => boolean }): void {
  if (process.platform === 'win32' && pid) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}

/** `claude --version`만 실행한다(설치 확인용, 모델을 부르지 않는다). */
export function runClaudeVersion(
  opts: { bin?: string; env?: Record<string, string> } = {},
): Promise<{ ok: boolean; text: string }> {
  const env = { ...process.env, ...opts.env };
  let bin = opts.bin ?? config.claudeBin;
  let prefix: string[] = [];
  if (process.platform === 'win32') {
    const r = resolveWindowsBin(bin, env);
    bin = r.bin;
    prefix = r.prefix;
  }
  return new Promise((resolvePromise) => {
    let out = '';
    let settled = false;
    const finish = (v: { ok: boolean; text: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(v);
    };
    const child = spawn(bin, [...prefix, '--version'], { env, shell: false, windowsHide: true });
    const timer = setTimeout(() => {
      killTree(child.pid, child);
      finish({ ok: false, text: '' });
    }, 15_000);
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d));
    child.on('error', () => finish({ ok: false, text: '' }));
    child.on('close', (code) => finish({ ok: code === 0, text: out.trim() }));
  });
}

export interface ClaudeCliRunnerOptions {
  bin?: string;
  binArgs?: string[]; // bin 뒤, 공통 옵션 앞에 붙는 인자(테스트용)
  env?: Record<string, string>;
}

export class ClaudeCliRunner implements AiRunner {
  constructor(private opts: ClaudeCliRunnerOptions = {}) {}

  run(req: AiRunRequest): Promise<AiRunResult> {
    const started = Date.now();
    const env = { ...process.env, ...this.opts.env };
    let bin = this.opts.bin ?? config.claudeBin;
    let prefix = this.opts.binArgs ?? [];
    if (process.platform === 'win32' && !this.opts.binArgs) {
      const r = resolveWindowsBin(bin, env);
      bin = r.bin;
      prefix = r.prefix;
    }
    const args = [...prefix, ...buildClaudeArgs(req)];

    return new Promise<AiRunResult>((resolvePromise, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const child = spawn(bin, args, { cwd: req.cwd, env, shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
      child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));

      const timer = setTimeout(() => {
        killTree(child.pid, child);
        done(() => reject(new AiError('timeout', `AI 작업이 제한 시간(${Math.round(req.timeoutMs / 1000)}초)을 넘겨 중단되었습니다.`)));
      }, req.timeoutMs);

      child.on('error', (err: NodeJS.ErrnoException) => {
        done(() =>
          reject(new AiError('cli', err.code === 'ENOENT' ? MISSING_HINT : `Claude Code 실행 실패: ${err.message}`)),
        );
      });

      child.on('close', (code) => {
        done(() => {
          let json: any;
          try {
            json = JSON.parse(stdout);
          } catch {
            const text = (stderr || stdout).trim();
            const kind = classify(text);
            const msg = kind === 'auth' ? `${text}\n${AUTH_HINT}` : text || `Claude Code가 비정상 종료했습니다(코드 ${code}).`;
            reject(new AiError(kind, msg));
            return;
          }
          const sessionId: string | undefined = typeof json?.session_id === 'string' ? json.session_id : undefined;
          if (json?.is_error || (code !== 0 && code !== null)) {
            const text = String(json?.result ?? stderr ?? '').trim();
            const kind = classify(text);
            const msg = kind === 'auth' ? `${text}\n${AUTH_HINT}` : text || 'Claude Code 오류';
            reject(new AiError(kind, msg, sessionId));
            return;
          }
          let output: unknown = json.structured_output;
          if (output === undefined || output === null) {
            try {
              output = JSON.parse(String(json.result ?? ''));
            } catch {
              reject(new AiError('schema', 'Claude Code 응답에서 JSON 결과를 읽지 못했습니다.', sessionId));
              return;
            }
          }
          // 사용량만 보관한다. 인증 관련 필드(credential_expires_at 등)는 저장하지 않는다.
          const usage = { usage: json.usage, modelUsage: json.modelUsage, totalCostUsd: json.total_cost_usd };
          resolvePromise({ output, sessionId: sessionId ?? '', usage, durationMs: Date.now() - started });
        });
      });

      child.stdin.on('error', () => {}); // 프로세스가 먼저 끝나면 EPIPE가 날 수 있다
      child.stdin.end(req.prompt, 'utf8');
    });
  }
}
