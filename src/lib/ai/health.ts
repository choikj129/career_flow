import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '@/lib/config';
import { ClaudeCliRunner, runClaudeVersion } from './claude-cli';
import { AiError, type AiRunner } from './runner';

export type ClaudeHealth = {
  installed: boolean;
  version?: string;
  loggedIn: boolean | null;
  message: string;
};

export interface HealthDeps {
  /** true일 때만 모델을 부른다(haiku, 아주 짧게). */
  checkLogin?: boolean;
  runVersion?: () => Promise<{ ok: boolean; text: string }>;
  runner?: AiRunner;
  /** 로그인 확인용 작업 폴더(테스트용). 기본은 config.aiWorkDir 아래 고정 폴더. */
  workDir?: string;
}

const LOGIN_HINT = '로그인이 필요합니다. 터미널에서 `claude`를 실행해 로그인하세요.';

/**
 * Claude Code 상태 확인. `claude --version`은 항상, 로그인 확인은 checkLogin일 때만 실행한다.
 * 인증 파일·토큰은 읽지 않는다. 로그인 여부는 짧은 호출의 성공·인증 오류로만 판단한다.
 */
export async function checkClaudeHealth(deps: HealthDeps = {}): Promise<ClaudeHealth> {
  const v = await (deps.runVersion ?? runClaudeVersion)();
  if (!v.ok) {
    return {
      installed: false,
      loggedIn: null,
      message: 'Claude Code CLI가 설치되어 있지 않거나 찾을 수 없습니다. 설치한 뒤 터미널에서 `claude`로 로그인하세요.',
    };
  }
  const version = /\d+\.\d+\.\d+/.exec(v.text)?.[0];
  if (!deps.checkLogin) {
    return { installed: true, version, loggedIn: null, message: '설치되어 있습니다.' };
  }
  const runner = deps.runner ?? new ClaudeCliRunner();
  const workDir = deps.workDir ?? join(config.aiWorkDir, 'health'); // 매번 새 폴더를 만들지 않는다
  try {
    mkdirSync(workDir, { recursive: true });
    await runner.run({
      prompt: '연결 확인입니다. ok 필드를 true로 답하세요.',
      jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      model: 'haiku',
      tools: [],
      cwd: workDir,
      timeoutMs: 60_000,
    });
    return { installed: true, version, loggedIn: true, message: '로그인되어 있습니다.' };
  } catch (e) {
    if (e instanceof AiError) {
      if (e.kind === 'auth') return { installed: true, version, loggedIn: false, message: LOGIN_HINT };
      if (e.kind === 'usage_limit') {
        return { installed: true, version, loggedIn: true, message: '로그인되어 있습니다. 다만 사용 한도에 도달했습니다.' };
      }
      return { installed: true, version, loggedIn: null, message: `확인하지 못했습니다: ${e.message}` };
    }
    return {
      installed: true,
      version,
      loggedIn: null,
      message: `확인하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
