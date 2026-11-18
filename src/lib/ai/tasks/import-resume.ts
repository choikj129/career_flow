import { JOB_TIMEOUT_MS, type JobHandler } from '@/lib/ai/queue';
import { renderPrompt } from '@/lib/ai/prompt';
import { AiError } from '@/lib/ai/runner';
import { ResumeContent } from '@/lib/resume/schema';
import { getModelFor } from '@/lib/settings';
import { toCliJsonSchema } from './json-schema';
import { runValidated } from './run-validated';
import { copyUploadsToWorkDir } from './uploads';

/** 결과만 돌려준다. 저장은 사용자가 화면에서 검토한 뒤에 한다. */
export const importResume: JobHandler = async ({ payload, runner, workDir, db }) => {
  const pastedText = typeof payload?.pastedText === 'string' ? payload.pastedText.trim() : '';
  const names = copyUploadsToWorkDir(payload?.filePaths, workDir);
  if (names.length === 0 && !pastedText) {
    throw new AiError('cli', '가져올 파일이나 텍스트가 없습니다.');
  }
  const model = getModelFor('import_resume', db);
  const prompt = renderPrompt('import-resume', {
    files: names.length ? names.map((n) => `- ${n}`).join('\n') : '(없음)',
    pasted_text: pastedText || '(없음)',
  });
  const { data, sessionId, usage } = await runValidated(
    runner,
    {
      prompt,
      jsonSchema: toCliJsonSchema(ResumeContent),
      model,
      tools: ['Read'],
      cwd: workDir,
      timeoutMs: JOB_TIMEOUT_MS.import_resume,
    },
    ResumeContent,
  );
  return { result: data, sessionId, usage, model };
};
