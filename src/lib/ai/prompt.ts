import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PromptName = 'analyze-posting' | 'import-resume' | 'import-applications' | 'tailor-resume' | 'revise-tailored';

/** prompts/<name>.md 를 읽어 {{var}} 를 한 번에 치환한다. 누락된 변수는 예외. */
export function renderPrompt(name: PromptName, vars: Record<string, string>): string {
  const template = readFileSync(join(process.cwd(), 'prompts', `${name}.md`), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new Error(`프롬프트 변수가 없습니다: ${key}`);
    }
    return vars[key];
  });
}
