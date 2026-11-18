import { z } from 'zod';
import { JOB_TIMEOUT_MS, type JobHandler } from '@/lib/ai/queue';
import { renderPrompt } from '@/lib/ai/prompt';
import { AiError } from '@/lib/ai/runner';
import { todayLocal } from '@/lib/domain/dates';
import { extractPostingText } from '@/lib/extract/extract-posting';
import { getPosting, saveAnalysis, setPostingText } from '@/lib/postings/repo';
import { getLatestResume, getPreferences } from '@/lib/resume/repo';
import { getModelFor } from '@/lib/settings';
import { runValidated } from './run-validated';
import { AnalysisResult } from './schemas';

export const analyzePosting: JobHandler = async ({ jobId, payload, runner, workDir, db }) => {
  const postingId = Number(payload?.postingId);
  const posting = Number.isInteger(postingId) ? getPosting(postingId, db) : undefined;
  if (!posting) throw new AiError('cli', '공고를 찾을 수 없습니다.');

  const resume = getLatestResume(db);
  if (!resume) throw new AiError('cli', '기본 이력서를 먼저 등록하세요.');

  let text = posting.rawText;
  if (!text || !text.trim()) {
    if (!posting.url) throw new AiError('extract_failed', '공고 본문이 없습니다. 본문을 붙여넣어 주세요.');
    text = (await extractPostingText(posting.url)).text;
    setPostingText(postingId, text, db);
  }

  const model = getModelFor('analyze_posting', db);
  const prompt = renderPrompt('analyze-posting', {
    today: todayLocal(),
    posting_text: text,
    resume_json: JSON.stringify(resume.content, null, 2),
    preferences_json: JSON.stringify(getPreferences(db), null, 2),
  });
  const { data, sessionId, usage } = await runValidated(
    runner,
    {
      prompt,
      jsonSchema: z.toJSONSchema(AnalysisResult),
      model,
      tools: [],
      cwd: workDir,
      timeoutMs: JOB_TIMEOUT_MS.analyze_posting,
    },
    AnalysisResult,
  );
  saveAnalysis(postingId, resume.id, data, jobId, db);
  return { result: { postingId, fitScore: data.fit.score }, sessionId, usage, model };
};
