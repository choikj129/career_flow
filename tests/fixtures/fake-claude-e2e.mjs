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
const stdin = Buffer.concat(chunks).toString('utf8');

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
  : keys.includes('basics')
    ? 'import_resume'
    : keys.includes('rows')
      ? 'import_applications'
      : keys.includes('ok')
        ? 'health'
        : 'unknown';

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
      kind === 'analyze_posting' ? analysis() : kind === 'import_resume' ? resume() : kind === 'import_applications' ? applications() : kind === 'health' ? { ok: true } : {},
    );
}
