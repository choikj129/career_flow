// 서류 키트 구조. 순수 타입이라 클라이언트에서도 쓴다.

export type KitRole = 'guide' | 'rules' | 'master' | 'resume' | 'career' | 'style';

export type Track = {
  name: string;
  resumeFile: string;
  careerFile: string;
  defaultProfileId: string;
  parts: { competencies: string[]; achievements: string[]; chapters: string[]; projects: string[] };
};

export type Profile = {
  id: string;
  name: string;
  track: string;
  isDefault: boolean;
  keywords: string[];
  introId: string;
  competencyOrder: number[];
  achievementOrder: number[];
  chapterOrder: number[];
  projects: string[];
};

export type Adjustment = { id: string; track: string; triggers: string[]; instruction: string; label: string };
export type TermRule = { original: string; allowed: string[]; forbidden: string[] };

export type KitGuide = {
  tracks: Track[];
  profiles: Profile[];
  adjustments: Adjustment[];
  intros: Record<string, string>;
  terms: TermRule[];
  checklist: string[];
};
export type KitParsed = KitGuide & { styleCss: string | null };

/** 화면에 그대로 보이는 읽기 오류 */
export type KitError = { file: string; where: string; message: string };

export type KitFile = { role: KitRole; track?: string; name: string; sha256: string; bytes: number };

export type KitWarning = {
  kind: 'new_number' | 'new_fact_from_master' | 'forbidden_term' | 'intro_restored' | 'structure_changed' | 'stack_changed' | 'other_company';
  doc: 'resume' | 'career';
  detail: string;
};
