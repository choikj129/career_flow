// 추출 테스트용 로컬 http 서버. 127.0.0.1의 임시 포트에서 주어진 HTML을 돌려준다(외부 접속 없음).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FixtureServer = { url: (path: string) => string; close: () => Promise<void> };

/** pages: 경로(예: '/a') -> HTML 문자열 */
export async function startFixtureServer(pages: Record<string, string>): Promise<FixtureServer> {
  const server: Server = createServer((req, res) => {
    const html = pages[(req.url ?? '/').split('?')[0]];
    if (html === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
