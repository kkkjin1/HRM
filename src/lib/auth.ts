import { createClient } from '@/lib/supabase/server'

// API 라우트 진입 시 항상 이걸로 세션을 확인한다 (proxy.ts 미들웨어와는 별개로,
// 라우트 핸들러 안에서도 한 번 더 검증하는 defense-in-depth).
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
