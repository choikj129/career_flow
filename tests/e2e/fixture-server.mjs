// 로컬 픽스처 HTML 서버. 링크 추출 E2E가 실제 채용 사이트 대신 여기에 접속한다.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'tests/fixtures');
const port = Number(process.argv[2] ?? 3942);
createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
  const file = join(root, name);
  if (!name.endsWith('.html') || name.includes('..') || !file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`fixture server on ${port}`));
