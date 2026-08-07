import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isTeamLogRequestAuthorized } from '@/lib/team-log-auth'

export async function GET() {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const [groups, items, subtasks] = await Promise.all([
    supabase.from('team_log_groups').select('id, name, color, sort_order').order('sort_order'),
    supabase.from('team_log_items').select('id, group_id, title, status, sort_order').order('sort_order'),
    supabase.from('team_log_subtasks')
      .select('id, item_id, author, entry_type, entry_date, title, content, sort_order, created_at')
      .order('sort_order'),
  ])

  const err = groups.error || items.error || subtasks.error
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 })

  const tree = (groups.data ?? []).map(g => ({
    ...g,
    items: (items.data ?? [])
      .filter(i => i.group_id === g.id)
      .map(i => ({
        ...i,
        subtasks: (subtasks.data ?? []).filter(s => s.item_id === i.id),
      })),
  }))

  return NextResponse.json({ ok: true, groups: tree })
}
