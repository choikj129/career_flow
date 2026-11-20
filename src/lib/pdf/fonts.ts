import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// PDF에 넣는 글꼴. pretendard 패키지의 woff2를 base64 @font-face로 HTML에 심는다(네트워크·설치 글꼴에 기대지 않는다).
const FONT_DIR = join(process.cwd(), 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2');

let cached: string | null = null;

/** Pretendard Regular·Bold. font-family 이름은 키트 CSS가 쓰는 'Pretendard'와 같다. */
export function fontFaceCss(): string {
  if (cached) return cached;
  const face = (file: string, weight: number) => {
    const b64 = readFileSync(join(FONT_DIR, file)).toString('base64');
    return `@font-face{font-family:'Pretendard';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  };
  cached = [face('Pretendard-Regular.woff2', 400), face('Pretendard-Bold.woff2', 700)].join('\n');
  return cached;
}
