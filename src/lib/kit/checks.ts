import { chapterBlocks, findSection, listItems, parseMdDoc, renderMdDoc, type MdBlock } from './md-doc';
import type { KitGuide, KitWarning } from './types';

export type { KitWarning };

// 맞춤본 자동 검사: 1단계 조립 결과와 AI 결과를 비교해 경고를 낸다. 순수 함수다.

type Docs = { resumeMd: string; careerMd: string };

const NUMBER_RE = /\d+(?:[.,]\d+)*\s*(%|배|건|명|억|만|천|ms|초|분|시간|개월|개|년|x|tps|qps|gb|tb|mb)?/gi;

/** 글에서 수치(숫자 + 선택 단위)를 뽑아 쉼표·공백을 없애고 소문자로 맞춘 집합 */
function numbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUMBER_RE)) out.add(m[0].replace(/[,\s]/g, '').toLowerCase());
  return out;
}

const introSection = (doc: MdBlock) => findSection(doc, (t) => t.includes('자기소개'));
const stackSection = (doc: MdBlock) => findSection(doc, (t) => t.includes('기술 스택'));

const bodyText = (b: MdBlock | null) => (b ? b.lines.filter((l) => l.trim() !== '').map((l) => l.trim()).join('\n') : '');

/** 제목(단계·글자) 목록 */
function headings(doc: MdBlock): string[] {
  const out: string[] = [];
  const walk = (b: MdBlock) => {
    for (const c of b.children) {
      out.push(`${'#'.repeat(c.level)} ${c.title.trim()}`);
      walk(c);
    }
  };
  walk(doc);
  return out;
}

const stackLines = (doc: MdBlock): string[] =>
  (stackSection(doc)?.lines ?? []).map((l) => l.trim()).filter(Boolean).sort();

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function checkTailored(input: {
  kit: KitGuide;
  stage1: Docs;
  final: Docs;
  base: Docs;
  masterMd: string;
  otherCompanyNames: string[];
  /** false면 자기소개를 되돌리지 않고 달라졌다는 경고(intro_changed)만 낸다(작업 공간 결과, Task 9). 기본 true */
  restoreIntro?: boolean;
}): { final: Docs; warnings: KitWarning[] } {
  const { kit, stage1, base, masterMd } = input;
  const warnings: KitWarning[] = [];
  const masterNums = numbers(masterMd);

  // 자기소개는 AI가 바꿔도 조립본 값으로 되돌린다.
  const finalResume = parseMdDoc(input.final.resumeMd);
  const stage1Resume = parseMdDoc(stage1.resumeMd);
  const fi = introSection(finalResume);
  const si = introSection(stage1Resume);
  const restore = input.restoreIntro !== false;
  let introRestored = false;
  if (fi && si && bodyText(fi) !== bodyText(si)) {
    if (restore) {
      fi.lines = [...si.lines];
      introRestored = true;
      warnings.push({ kind: 'intro_restored', doc: 'resume', detail: '자기소개는 AI가 바꿀 수 없어 조립본의 자기소개로 되돌렸습니다.' });
    } else {
      warnings.push({ kind: 'intro_changed', doc: 'resume', detail: '자기소개가 조립본과 다릅니다. 작업 공간 결과라 되돌리지 않았으니 내용이 맞는지 확인하세요.' });
    }
  }
  const final: Docs = { resumeMd: introRestored ? renderMdDoc(finalResume) : input.final.resumeMd, careerMd: input.final.careerMd };

  for (const doc of ['resume', 'career'] as const) {
    const finalMd = doc === 'resume' ? final.resumeMd : final.careerMd;
    const stageMd = doc === 'resume' ? stage1.resumeMd : stage1.careerMd;
    const baseMd = doc === 'resume' ? base.resumeMd : base.careerMd;
    const finalDoc = parseMdDoc(finalMd);
    const stageDoc = parseMdDoc(stageMd);

    // 수치
    const stageNums = numbers(stageMd);
    const added = [...numbers(finalMd)].filter((n) => !stageNums.has(n));
    for (const n of added) {
      if (masterNums.has(n)) {
        warnings.push({ kind: 'new_fact_from_master', doc, detail: `새로 넣은 사실: ${n} — 마스터스토리에 있는 수치입니다. 넣어도 되는지 확인하세요.` });
      } else {
        warnings.push({ kind: 'new_number', doc, detail: `확인 필요: ${n} — 기본 서류와 마스터스토리에 없는 수치입니다.` });
      }
    }

    // 쓰면 안 되는 표현(기본 서류에 원래 있던 것은 제외)
    for (const rule of kit.terms) {
      for (const f of rule.forbidden) {
        if (f && finalMd.includes(f) && !baseMd.includes(f)) {
          warnings.push({ kind: 'forbidden_term', doc, detail: `쓰면 안 되는 표현 "${f}"이 들어갔습니다(원래 표현: ${rule.original}).` });
        }
      }
    }

    // 구조: 제목 목록, 주요 성과 수, 장 순서
    const problems: string[] = [];
    const fh = headings(finalDoc);
    const sh = headings(stageDoc);
    if (!sameList(fh, sh)) {
      const gone = sh.filter((h) => !fh.includes(h));
      const extra = fh.filter((h) => !sh.includes(h));
      problems.push(
        gone.length || extra.length
          ? `제목이 달라졌습니다${gone.length ? ` (없어짐: ${gone.join(', ')})` : ''}${extra.length ? ` (새로 생김: ${extra.join(', ')})` : ''}`
          : '제목 순서가 달라졌습니다',
      );
    }
    if (doc === 'resume') {
      const fa = findSection(finalDoc, (t) => t.includes('주요 성과'));
      const sa = findSection(stageDoc, (t) => t.includes('주요 성과'));
      const nf = fa ? listItems(fa.lines, 'ordered').items.length : 0;
      const ns = sa ? listItems(sa.lines, 'ordered').items.length : 0;
      if (nf !== ns) problems.push(`주요 성과가 ${ns}개에서 ${nf}개로 달라졌습니다`);
    } else {
      const fc = chapterBlocks(finalDoc).map((c) => c.title.trim());
      const sc = chapterBlocks(stageDoc).map((c) => c.title.trim());
      if (!sameList(fc, sc)) problems.push('경력기술서 장 순서나 이름이 달라졌습니다');
    }
    if (problems.length > 0) warnings.push({ kind: 'structure_changed', doc, detail: problems.join('; ') });

    // 기술 스택
    if (!sameList(stackLines(finalDoc), stackLines(stageDoc))) {
      warnings.push({ kind: 'stack_changed', doc, detail: '기술 스택 구획의 내용이 달라졌습니다.' });
    }

    // 다른 회사 이름
    for (const name of input.otherCompanyNames) {
      if (name.length >= 2 && finalMd.includes(name) && !baseMd.includes(name)) {
        warnings.push({ kind: 'other_company', doc, detail: `다른 회사 이름 "${name}"이 들어갔습니다.` });
      }
    }
  }
  return { final, warnings };
}
