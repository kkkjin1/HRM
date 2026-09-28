import type { NextConfig } from "next";
import path from "path";

// 상위 폴더(do-better-workspace-v2)에 다른 프로젝트들의 lockfile이 같이 있어서, Turbopack이
// 워크스페이스 루트를 이 앱(HRM) 대신 그 상위 폴더 전체로 잘못 추론해 전체 트리를 스캔하려다
// dev 서버가 첫 요청에서 응답 없이 멈추는 문제가 있었다. 루트를 명시해서 고정한다.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
