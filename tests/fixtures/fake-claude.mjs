// 테스트용 가짜 Claude Code CLI. 환경변수 FAKE_CLAUDE_MODE로 동작을 고른다.
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const stdin = Buffer.concat(chunks).toString('utf8');
const mode = process.env.FAKE_CLAUDE_MODE ?? 'ok';
const payload = { stdinLength: [...stdin].length, args: process.argv.slice(2) };

const out = (o) => process.stdout.write(JSON.stringify(o));

switch (mode) {
  case 'ok':
    out({ type: 'result', subtype: 'success', is_error: false, session_id: 's-1', result: '', structured_output: payload, usage: {} });
    break;
  case 'ok_result_text':
    out({ type: 'result', subtype: 'success', is_error: false, session_id: 's-1', result: JSON.stringify(payload), usage: {} });
    break;
  case 'auth':
    out({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', session_id: 's-2' });
    break;
  case 'limit':
    out({ type: 'result', is_error: true, result: 'Claude usage limit reached. Your limit will reset at 5pm', session_id: 's-3' });
    break;
  case 'garbage':
    process.stdout.write('not json');
    break;
  case 'hang':
    await new Promise((r) => setTimeout(r, 60_000));
    break;
}
