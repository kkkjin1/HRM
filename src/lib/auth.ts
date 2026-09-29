import { createClient } from '@/lib/supabase/server'

// API 라우트 진입 시 항상 이걸로 세션을 확인한다 (proxy.ts 미들웨어와는 별개로,
// 라우트 핸들러 안에서도 한 번 더 검증하는 defense-in-depth).
export async function requireUser() {
  const supabase = await createClient()
  // proxy.ts와 같은 이유로 getUser() 대신 로컬 JWT 검증(getClaims). 호출부는 null 여부만 본다.
  const { data } = await supabase.auth.getClaims()
  return data?.claims ?? null
}
