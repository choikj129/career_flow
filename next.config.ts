import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 개발 서버가 루트에 AGENTS.md를 만들지 않게 한다(문서는 docs/ 아래에만 둔다).
  agentRules: false,
  partialPrefetching: true,
  // 이력서·캡처 파일 업로드(파일당 20MB, 여러 개)를 서버 액션으로 받는다.
  experimental: { serverActions: { bodySizeLimit: '100mb' } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
