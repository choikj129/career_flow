// E2E용 앱 서버 실행기: node tests/e2e/start-app.mjs <seeded|empty> <port>
// 임시 폴더에 새 데이터 폴더를 만들고(seeded는 scripts/seed-dev.ts로 시드),
// CLAUDE_BIN을 가짜 claude 셔임으로 지정해 `next start`(빌드된 앱)를 띄운다. 실제 claude는 호출되지 않는다.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [name, port] = [process.argv[2], process.argv[3]];
const project = resolve(process.cwd());
const root = join(tmpdir(), 'career-flow-e2e', name);
const data = join(root, `data-e2e-${name}`);
rmSync(root, { recursive: true, force: true });
mkdirSync(data, { recursive: true });

copyFileSync(join(project, 'tests/fixtures/fake-claude-e2e.mjs'), join(root, 'fake-claude-e2e.mjs'));
let bin;
if (process.platform === 'win32') {
  bin = join(root, 'claude.cmd');
  writeFileSync(bin, '@ECHO off\r\nnode "%dp0%/fake-claude-e2e.mjs" %*\r\n');
} else {
  bin = join(root, 'claude');
  writeFileSync(bin, '#!/usr/bin/env node\nimport("./fake-claude-e2e.mjs");\n');
  chmodSync(bin, 0o755);
}

const env = {
  ...process.env,
  CAREER_FLOW_DATA_DIR: data,
  CLAUDE_BIN: bin,
  FAKE_CLAUDE_CONTROL: join(root, 'fake-control.json'),
  FAKE_CLAUDE_LOG: join(root, 'fake-calls.log'),
};

if (name === 'seeded') {
  const r = spawnSync(process.execPath, [join(project, 'node_modules/tsx/dist/cli.mjs'), 'scripts/seed-dev.ts'], { env, cwd: project, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const child = spawn(process.execPath, [join(project, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', port], {
  env,
  cwd: project,
  stdio: 'inherit',
});
const stop = () => child.kill();
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
