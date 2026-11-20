import { JOB_TIMEOUT_MS, type JobHandler } from '@/lib/ai/queue';
import { renderPrompt } from '@/lib/ai/prompt';
import { buildRevisionPrompt } from '@/lib/ai/revision';
import { AiError } from '@/lib/ai/runner';
import { todayLocal } from '@/lib/domain/dates';
import { checkTailored } from '@/lib/kit/checks';
import { recommend } from '@/lib/kit/recommend';
import { readKitText } from '@/lib/kit/repo';
import type { TermRule } from '@/lib/kit/types';
import { getLatestAnalysis, getPosting } from '@/lib/postings/repo';
import {
  addRevision,
  getLatestRevision,
  getRevision,
  otherCompanyNames,
  rebuildStage1,
  revisionPostingId,
  REVISION_REQUEST_MAX,
  type TailoredRevision,
} from '@/lib/tailored/repo';
import { getModelFor } from '@/lib/settings';
import type { Db } from '@/lib/db/client';
import { toCliJsonSchema } from './json-schema';
import { runValidated } from './run-validated';
import { KitTailorOutput } from './tailor-schemas';

/** 허용 범위 표를 프롬프트용 md 표로 */
export function termsTableMd(terms: TermRule[]): string {
  if (terms.length === 0) return '(허용 범위 표가 비어 있습니다. 용어를 바꾸지 않는다)';
  const cell = (xs: string[]) => (xs.length ? xs.join(', ') : '-');
  return [
    '| 원래 표현 | 바꿔도 되는 표현 | 쓰면 안 되는 표현 |',
    '|---|---|---|',
    ...terms.map((t) => `| ${t.original} | ${cell(t.allowed)} | ${cell(t.forbidden)} |`),
  ].join('\n');
}

/** 작업에서 쓰는 공통 입력과 프롬프트. 기준 리비전이 정한 키트·레시피로 만든다. */
function prepare(postingId: number, rev: TailoredRevision | null, db: Db) {
  const posting = Number.isInteger(postingId) ? getPosting(postingId, db) : undefined;
  if (!posting) throw new AiError('cli', '공고를 찾을 수 없습니다.');
  if (!rev || revisionPostingId(rev.id, db) !== postingId) throw new AiError('cli', '맞춤본을 찾을 수 없습니다. 먼저 맞춤본을 조립하세요.');
  const text = posting.rawText?.trim();
  if (!text) throw new AiError('cli', '공고 본문이 없습니다.');

  let stage;
  try {
    stage = rebuildStage1(rev, db);
  } catch (e) {
    throw new AiError('cli', e instanceof Error ? e.message : '맞춤본을 다시 만들 수 없습니다.');
  }
  const { kit, base, stage1, pending } = stage;
  const profile = kit.parsed.profiles.find((p) => p.track === rev.track && p.id === rev.profileId);
  const top = recommend(kit.parsed, { title: posting.positionTitle, text }).topWords;
  const analysis = getLatestAnalysis(postingId, db);
  const masterMd = readKitText(kit.id, 'master', db);

  const basePrompt = renderPrompt('tailor-resume', {
    today: todayLocal(),
    posting_text: text,
    analysis_json: JSON.stringify(analysis?.result ?? {}, null, 2),
    top_words: top.length ? top.map((w) => `${w.word} (${w.count}회)`).join(', ') : '(없음)',
    profile: `${rev.track} / ${rev.profileId} ${rev.profileName}${profile?.keywords.length ? ` — 공고 단어: ${profile.keywords.join(', ')}` : ''}`,
    pending_adjustments: pending.length ? pending.map((p) => `- ${p}`).join('\n') : '(없음)',
    writing_rules: readKitText(kit.id, 'rules', db),
    terms_table: termsTableMd(kit.parsed.terms),
    master_story: masterMd,
    resume_md: stage1.resumeMd,
    career_md: stage1.careerMd,
  });

  return { kit, base, stage1, pending, basePrompt, masterMd, otherCompanyNames: otherCompanyNames(postingId, db) };
}

type Prepared = ReturnType<typeof prepare>;

async function runAndSave(
  ctx: Parameters<JobHandler>[0],
  type: 'tailor_resume' | 'revise_tailored',
  postingId: number,
  rev: TailoredRevision,
  p: Prepared,
  prompt: string,
  extra: { source: 'terms' | 'revise'; userRequest?: string },
) {
  const model = getModelFor(type, ctx.db);
  const { data, sessionId, usage } = await runValidated(
    ctx.runner,
    { prompt, jsonSchema: toCliJsonSchema(KitTailorOutput), model, tools: [], cwd: ctx.workDir, timeoutMs: JOB_TIMEOUT_MS[type] },
    KitTailorOutput,
  );
  // 자기소개는 AI가 바꿔도 1단계 값으로 되돌리고, 나머지는 경고로 알린다.
  const checked = checkTailored({
    kit: p.kit.parsed,
    stage1: p.stage1,
    final: { resumeMd: data.resumeMd, careerMd: data.careerMd },
    base: p.base,
    masterMd: p.masterMd,
    otherCompanyNames: p.otherCompanyNames,
  });
  const saved = addRevision(
    {
      postingId,
      kitId: rev.kitId,
      track: rev.track,
      profileId: rev.profileId,
      profileName: rev.profileName,
      adjustments: rev.adjustments,
      source: extra.source,
      resumeMd: checked.final.resumeMd,
      careerMd: checked.final.careerMd,
      pendingAdjustments: p.pending,
      changeReasons: data.changeReasons,
      warnings: checked.warnings,
      notes: data.notes,
      userRequest: extra.userRequest ?? null,
      jobId: ctx.jobId,
    },
    ctx.db,
  );
  return {
    result: { postingId, revisionId: saved.id, revNo: saved.revNo, needsWorkspace: data.needsWorkspace },
    sessionId,
    usage,
    model,
  };
}

/** 2단계: 공고 용어 맞추기. payload { postingId, revisionId } */
export const tailorResume: JobHandler = async (ctx) => {
  const postingId = Number(ctx.payload?.postingId);
  const revisionId = Number(ctx.payload?.revisionId);
  const rev = Number.isInteger(revisionId) ? getRevision(revisionId, ctx.db) : null;
  const p = prepare(postingId, rev, ctx.db);
  return runAndSave(ctx, 'tailor_resume', postingId, rev!, p, p.basePrompt, { source: 'terms' });
};

/** 다듬기(D-11): 최신 리비전과 요청으로 새 실행. payload { postingId, request } */
export const reviseTailored: JobHandler = async (ctx) => {
  const postingId = Number(ctx.payload?.postingId);
  const request = typeof ctx.payload?.request === 'string' ? ctx.payload.request.trim() : '';
  if (!request || request.length > REVISION_REQUEST_MAX) throw new AiError('cli', '다듬을 내용이 올바르지 않습니다.');
  const rev = Number.isInteger(postingId) ? getLatestRevision(postingId, ctx.db) : null;
  const p = prepare(postingId, rev, ctx.db);
  const cur = rev!;
  const prompt = buildRevisionPrompt({
    basePrompt: p.basePrompt,
    currentJson: { resumeMd: cur.resumeMd, careerMd: cur.careerMd, changeReasons: cur.changeReasons, notes: cur.notes },
    request,
    extraRules: renderPrompt('revise-tailored', {}),
  });
  return runAndSave(ctx, 'revise_tailored', postingId, cur, p, prompt, { source: 'revise', userRequest: request });
};
