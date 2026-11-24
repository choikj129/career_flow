// E2E용 가짜 Claude Code CLI. 앱 서버가 `claude -p` 대신 이것을 실행한다(실제 claude는 부르지 않는다).
// 작업 종류는 --json-schema 의 최상위 키로 구분하고, 입력 텍스트의 `키: 값` 줄에서 결과를 만든다.
//
// 환경변수
//   FAKE_CLAUDE_CONTROL  JSON 파일 경로. {"mode": "ok|auth|limit|garbage|schema_bad", "delayMs": 숫자}. 호출마다 다시 읽는다.
//   FAKE_CLAUDE_LOG      호출 기록을 한 줄씩 덧붙일 파일 경로({kind, model, tools, stdinLength, args})
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);

if (argv.includes('--version')) {
  process.stdout.write('2.1.999 (fake-e2e)\n');
  process.exit(0);
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const stdin = Buffer.concat(chunks).toString('utf8').replace(/\r\n/g, '\n'); // 프롬프트 파일이 CRLF여도 같은 모양으로 읽는다

const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

let control = {};
try {
  if (process.env.FAKE_CLAUDE_CONTROL && existsSync(process.env.FAKE_CLAUDE_CONTROL)) {
    control = JSON.parse(readFileSync(process.env.FAKE_CLAUDE_CONTROL, 'utf8'));
  }
} catch {
  control = {};
}
const mode = control.mode ?? 'ok';

let schema = {};
try {
  schema = JSON.parse(arg('--json-schema') ?? '{}');
} catch {
  schema = {};
}
const keys = Object.keys(schema.properties ?? {});
const kind = keys.includes('fit')
  ? 'analyze_posting'
  : keys.includes('resumeMd')
    ? stdin.includes('## 사용자 요청')
      ? 'revise_tailored'
      : 'tailor_resume'
    : keys.includes('basics')
    ? 'import_resume'
    : keys.includes('rows')
      ? 'import_applications'
      : keys.includes('ok')
        ? 'health'
        : 'unknown';
const tailored = kind === 'tailor_resume' || kind === 'revise_tailored';

if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(
    process.env.FAKE_CLAUDE_LOG,
    JSON.stringify({ kind, model: arg('--model'), tools: arg('--tools'), stdinLength: [...stdin].length, args: argv, mode }) + '\n',
  );
}

if (control.delayMs) await new Promise((r) => setTimeout(r, control.delayMs));

const out = (o) => process.stdout.write(JSON.stringify(o));
const success = (structured) =>
  out({ type: 'result', subtype: 'success', is_error: false, session_id: 'e2e-session', result: '', structured_output: structured, usage: {} });

// 입력에서 `키: 값` 줄을 찾는다(프롬프트의 규칙 문장과 겹치지 않는 키만 쓴다).
const field = (key) => new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(stdin)?.[1].trim();

/** "## 제목" 다음부터 다음 "## " 제목 앞까지 */
const section = (title) => {
  const i = stdin.indexOf(`\n## ${title}\n`);
  if (i < 0) return '';
  const rest = stdin.slice(i + title.length + 5);
  const j = rest.indexOf('\n## ');
  return j < 0 ? rest : rest.slice(0, j);
};

/** 프롬프트의 프로필 표에서 직무·프로필·추가 조정을 읽어 공고 본문의 단어 일치로 추천을 만든다 */
function profileRecommendation() {
  const table = section('프로필 표');
  const text = section('공고 본문');
  const tracks = [];
  let cur = null;
  for (const line of table.split('\n')) {
    const t = /^### 직무: (.+)$/.exec(line);
    if (t) {
      cur = { name: t[1].trim(), profiles: [], adjustments: [] };
      tracks.push(cur);
      continue;
    }
    if (!cur) continue;
    const row = /^\|\s*([^|\s]+)\s*\|\s*([^|]*?)\s*\|\s*(\(기본\))?\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (row && row[1] !== '프로필' && !/^-+$/.test(row[1])) cur.profiles.push({ id: row[1], keywords: row[4].split(',').map((x) => x.trim()).filter(Boolean) });
    const adj = /^- ([^:]+): (.+)$/.exec(line);
    if (adj) cur.adjustments.push({ id: adj[1].trim(), triggers: adj[2].split(',').map((x) => x.trim()).filter(Boolean) });
  }
  if (tracks.length === 0) return undefined;
  const track = tracks.find((t) => text.includes(t.name)) ?? tracks[0];
  const profiles = track.profiles
    .map((p) => {
      const hits = p.keywords.filter((k) => text.includes(k));
      return { id: p.id, fitPercent: hits.length ? Math.min(95, 30 + hits.length * 25) : 10, keywords: hits, reason: hits.length ? `${hits.join(', ')} 언급` : '근거 없음' };
    })
    .sort((a, b) => b.fitPercent - a.fitPercent);
  const adjustments = track.adjustments.map((a) => {
    const hits = a.triggers.filter((k) => text.includes(k));
    return { id: a.id, recommended: hits.length > 0, keywords: hits };
  });
  // 맞춤 이력서 추천도(B-14): 공고 본문의 `맞춤추천: 숫자`·`맞춤이유: 글`로 정한다. 없으면 72
  const tailorRec = { percent: Number(field('맞춤추천') ?? 72), reason: field('맞춤이유') ?? 'Kafka 운영 사례를 주요 성과 앞으로' };
  return { track: track.name, trackReason: `포지션 ${track.name}`, profiles, adjustments, tailorRec };
}

/** 코드 울타리 안의 md(이력서, 경력기술서 순서) */
function fencedMds(from) {
  const out = [];
  const re = /^(`{3,})\n([\s\S]*?)\n\1$/gm;
  for (const m of from.matchAll(re)) out.push(m[2]);
  return out;
}

/** 용어 맞추기·다듬기 결과: 허용 용어 바꾸기 + 새 수치(99%) + 자기소개 바꾸기를 일부러 넣어 자동 검사가 걸리게 한다 */
function tailorOutput() {
  let resumeMd;
  let careerMd;
  let reasons;
  if (kind === 'revise_tailored') {
    const cur = /## 현재 결과 \(JSON\)\n+```json\n([\s\S]*?)\n```/.exec(stdin);
    const json = cur ? JSON.parse(cur[1]) : { resumeMd: '', careerMd: '' };
    const request = /## 사용자 요청\n+([\s\S]*?)\n\n## 다듬기 규칙/.exec(stdin)?.[1].trim() ?? '';
    resumeMd = json.resumeMd.replace('병목 구간을 찾아 개선', '병목 구간을 찾아 개선(요청 반영)');
    careerMd = json.careerMd;
    reasons = [{ doc: 'resume', after: '병목 구간을 찾아 개선(요청 반영)', reason: `요청: ${request.slice(0, 30)}` }];
  } else {
    const mds = fencedMds(stdin.slice(stdin.indexOf('\n## 이력서 (md)\n')));
    resumeMd = (mds[0] ?? '')
      .replace('서버 개발', '백엔드 개발')
      .replace('처리 시간을 40% 줄임', '처리 시간을 40% 줄임, 처리량 99% 개선')
      .replace(/(## 자기소개\n\n)[^\n]*/, '$1AI가 바꾼 자기소개입니다.');
    careerMd = mds[1] ?? '';
    reasons = [{ doc: 'resume', after: '백엔드 개발 경험과 설계 원칙', reason: '공고 단어 "백엔드"에 맞춤' }];
  }
  return { resumeMd, careerMd, changeReasons: reasons, notes: '', needsWorkspace: control.needsWorkspace === true };
}

function analysis() {
  const company = field('회사명') ?? '이이이컴퍼니';
  const score = Number(field('적합도') ?? 80);
  return {
    posting: {
      companyDisplayName: company,
      companyLegalName: field('법인명') ?? null,
      positionTitle: field('포지션') ?? '서버 개발자',
      experienceRequirement: '3년 이상',
      employmentType: '정규직',
      location: '서울 강남',
      deadline: field('마감') ?? null,
      salary: null,
      responsibilities: ['결제 서버 개발'],
      requirements: ['Java 3년 이상'],
      preferred: ['Kafka 경험'],
      techStack: ['Java', 'Spring'],
    },
    fit: {
      score,
      breakdown: [
        { category: 'requirements', score, reason: '필수 요건 근거 있음' },
        { category: 'tech_stack', score, reason: 'Java 일치' },
      ],
    },
    strengths: [{ point: '결제 서버 경험', evidence: '이력서의 결제 서버 개발' }],
    gaps: [{ point: 'Kafka 운영', kind: 'hidden', suggestion: '프로젝트 경험을 드러내세요' }],
    preferenceMismatches: [],
    tailoringAdvice: '결제 경험을 앞세우세요',
    ...(keys.includes('profileRecommendation') ? { profileRecommendation: profileRecommendation() } : {}),
  };
}

function resume() {
  return {
    basics: { name: field('이름') ?? '홍길동', links: [] },
    summary: field('요약') ?? '',
    experiences: [
      {
        id: 'exp-1',
        company: field('회사') ?? '예시회사',
        role: field('직무') ?? '백엔드 개발자',
        start: '2020-01',
        end: null,
        description: '',
        achievements: [],
      },
    ],
    projects: [],
    skills: [],
    education: [],
    certifications: [],
    careerNarrative: '',
    portfolio: [],
  };
}

function applications() {
  const re = /^([^,\n]+),([^,\n]+),(remember|wanted|groupby|jobkorea|other),(\d{4}-\d{2}-\d{2}),(applied|document_passed|interview|final_passed|rejected|withdrawn)$/gm;
  const rows = [];
  for (const m of stdin.matchAll(re)) {
    rows.push({ companyName: m[1].trim(), positionTitle: m[2].trim(), site: m[3], appliedAt: m[4], status: m[5] });
  }
  return { rows };
}

switch (mode) {
  case 'auth':
    out({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', session_id: 'e2e-auth' });
    break;
  case 'limit':
    out({ type: 'result', is_error: true, result: 'Claude usage limit reached. Your limit will reset at 5pm', session_id: 'e2e-limit' });
    break;
  case 'garbage':
    process.stdout.write('not json');
    break;
  case 'schema_bad':
    success({ unexpected: true });
    break;
  default:
    success(
      kind === 'analyze_posting' ? analysis() : tailored ? tailorOutput() : kind === 'import_resume' ? resume() : kind === 'import_applications' ? applications() : kind === 'health' ? { ok: true } : {},
    );
}
