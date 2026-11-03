import type { NextConfig } from "next";
import path from "path";

// 보안 헤더 (외부 공격 대비). 기능을 깨지 않는 항목만 — 스크립트 제한(엄격 CSP)은 Tiptap·Supabase 실시간과 충돌 위험이 커서 제외.
// - 다른 사이트가 이 앱을 iframe으로 감싸 클릭을 유도하는 것 차단 (같은 사이트 iframe은 허용)
// - 파일 형식 위장 실행 차단, 외부로 나가는 주소 정보 최소화, 카메라·마이크·위치 사용 차단, HTTPS 강제
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
  // 개발 모드 "N" 표시가 좌측 하단 익명채팅 버튼을 덮어서 끈다(컴파일·런타임 에러 창은 그대로 뜬다).
  devIndicators: false,
  // 상위 폴더(do-better-workspace-v2)에 다른 프로젝트들의 lockfile이 같이 있어서, Turbopack이
  // 워크스페이스 루트를 이 앱(HRM) 대신 그 상위 폴더 전체로 잘못 추론해 전체 트리를 스캔하려다
  // dev 서버가 첫 요청에서 응답 없이 멈추는 문제가 있었다. 루트를 명시해서 고정한다.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
