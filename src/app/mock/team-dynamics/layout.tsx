import { notFound } from 'next/navigation'

// /mock은 proxy.ts가 로그인 없이 통과시키는 경로다. 이 미리보기는 개발용이라 운영 빌드(production)에서는 404로 막는다.
export default function TeamDynamicsMockLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return children
}
