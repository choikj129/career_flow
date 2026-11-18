import type { AiErrorKind } from '@/lib/domain/types';

export interface AiRunRequest {
  prompt: string; // stdin으로 전달
  jsonSchema: object; // --json-schema
  model: string; // --model
  tools: string[]; // --tools ([]이면 "" 전달)
  cwd: string; // data/ai-work/<jobId>
  timeoutMs: number;
  resumeSessionId?: string; // --resume
}

export interface AiRunResult {
  output: unknown;
  sessionId: string;
  usage: unknown;
  durationMs: number;
}

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public sessionId?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface AiRunner {
  run(req: AiRunRequest): Promise<AiRunResult>;
}
