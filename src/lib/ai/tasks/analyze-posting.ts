import { JOB_TIMEOUT_MS, type JobHandler } from '@/lib/ai/queue';
import { renderPrompt } from '@/lib/ai/prompt';
import { AiError } from '@/lib/ai/runner';
import { todayLocal } from '@/lib/domain/dates';
import { extractPostingText } from '@/lib/extract/extract-posting';
import { getPosting, saveAnalysis, setPostingText } from '@/lib/postings/repo';
import { getLatestResume, getPreferences } from '@/lib/resume/repo';
import { getModelFor } from '@/lib/settings';
import { toCliJsonSchema } from './json-schema';
import { runValidated } from './run-validated';
import { getUsableKit } from '@/lib/kit/repo';
import { normalizeProfileRec, profileTableMd } from '@/lib/kit/profile-table';
import { analysisOutputSchema, type AnalysisResult } from './schemas';

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
    setPostingText(postingId, text, db, 'extracted');
  }

  const model = getModelFor('analyze_posting', db);
  const kit = getUsableKit(db); // 키트가 있으면 프로필 추천을 함께 받는다(호출 수는 그대로)
  const outSchema = analysisOutputSchema(kit != null);
  const prompt = renderPrompt('analyze-posting', {
    today: todayLocal(),
    posting_text: text,
    resume_json: JSON.stringify(resume.content, null, 2),
    preferences_json: JSON.stringify(getPreferences(db), null, 2),
    profile_table: kit ? profileTableMd(kit.parsed) : '(키트 없음. profileRecommendation을 내지 않는다)',
  });
  const { data, sessionId, usage } = await runValidated(
    runner,
    {
      prompt,
      jsonSchema: toCliJsonSchema(outSchema),
      model,
      tools: [],
      cwd: workDir,
      timeoutMs: JOB_TIMEOUT_MS.analyze_posting,
    },
    outSchema,
  );
  const { profileRecommendation, ...rest } = data;
  const result: AnalysisResult = {
    ...rest,
    ...(kit && profileRecommendation ? { profileRecommendation: normalizeProfileRec(profileRecommendation, kit.parsed, text, kit.id) } : {}),
  };
  saveAnalysis(postingId, resume.id, result, jobId, db);
  return { result: { postingId, fitScore: result.fit.score }, sessionId, usage, model };
};
