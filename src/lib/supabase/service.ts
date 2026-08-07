import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// 서버 전용 "마스터키" 클라이언트 — 절대 클라이언트(브라우저) 코드에서 import하면 안 됨.
// RLS를 완전히 우회하므로, 이 클라이언트를 쓰는 API 라우트는 자체적으로 접근 제어(비밀번호 등)를 반드시 해야 한다.
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.')

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } }
  )
}
