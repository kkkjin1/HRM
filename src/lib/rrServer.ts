// R&R 메모 — 서버(API 라우트) 전용 조회 도우미.
import type { createServiceClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof createServiceClient>

// R&R 업무의 담당 그룹 이름(= 담당 팀원 이름). 없는 업무면 null
export async function rrGroupNameOf(supabase: Db, itemId: string) {
  const { data } = await supabase.from('team_log_items').select('team_log_groups(name)').eq('id', itemId).maybeSingle()
  const g = (data as { team_log_groups: { name: string } | null } | null)?.team_log_groups
  return g ? g.name : null
}
