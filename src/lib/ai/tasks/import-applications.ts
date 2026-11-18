import { z } from 'zod';
import { JOB_TIMEOUT_MS, type JobHandler } from '@/lib/ai/queue';
import { renderPrompt } from '@/lib/ai/prompt';
import { AiError } from '@/lib/ai/runner';
import { todayLocal } from '@/lib/domain/dates';
import { SITE_IDS, SITE_LABELS, type SiteId } from '@/lib/domain/types';
import { getModelFor } from '@/lib/settings';
import { runValidated } from './run-validated';
import { ImportedApplications } from './schemas';
import { copyUploadsToWorkDir } from './uploads';

/** 결과만 돌려준다. 저장은 사용자가 화면에서 검토한 뒤에 한다. */
export const importApplications: JobHandler = async ({ payload, runner, workDir, db }) => {
  const pastedText = typeof payload?.pastedText === 'string' ? payload.pastedText.trim() : '';
  const names = copyUploadsToWorkDir(payload?.imagePaths, workDir);
  if (names.length === 0 && !pastedText) {
    throw new AiError('cli', '가져올 이미지나 텍스트가 없습니다.');
  }
  const site: SiteId | null = SITE_IDS.includes(payload?.site) ? payload.site : null;
  const model = getModelFor('import_applications', db);
  const prompt = renderPrompt('import-applications', {
    today: todayLocal(),
    site: site ? `${site} (${SITE_LABELS[site]})` : '(모름)',
    files: names.length ? names.map((n) => `- ${n}`).join('\n') : '(없음)',
    pasted_text: pastedText || '(없음)',
  });
  const { data, sessionId, usage } = await runValidated(
    runner,
    {
      prompt,
      jsonSchema: z.toJSONSchema(ImportedApplications),
      model,
      tools: names.length ? ['Read'] : [],
      cwd: workDir,
      timeoutMs: JOB_TIMEOUT_MS.import_applications,
    },
    ImportedApplications,
  );
  return { result: data, sessionId, usage, model };
};
