'use client'

// 회의수정 탭 액션아이템 중 "나"에게 배정되고 기한이 오늘이거나 지난(overdue) 항목을 조회한다.
// ActionItemReminderModal(하루 1회 강제 확인)과 ActionItemReminderWidget(우측하단 상시노출)가
// 같은 쿼리/매칭 로직을 공유한다. postgres_changes로 team_log_meeting_items 변경을 구독해
// 완료 체크·기한 수정이 다른 탭/기기에서 일어나도 새로고침 없이 반영된다.

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'

export type ReminderItem = { id: string; meetingId: string; meetingTitle: string; content: string; dueDate: string; overdue: boolean }

type Row = {
  id: string
  meeting_id: string
  content: string
  owner: string
  due_date: string
  team_log_meetings: { title: string } | { title: string }[] | null
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nameMatches(ownerField: string, myName: string) {
  return ownerField
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .some(name => name === myName || name.includes(myName) || myName.includes(name))
}

function meetingTitleOf(row: Row) {
  const t = row.team_log_meetings
  if (!t) return '회의'
  return Array.isArray(t) ? (t[0]?.title ?? '회의') : t.title
}

export function useMyActionReminders(): ReminderItem[] {
  const { me, loaded } = useCurrentMember()
  const [items, setItems] = useState<ReminderItem[]>([])
  const instanceId = useId()

  useEffect(() => {
    if (!loaded || !me) return
    let active = true
    const supabase = createClient()

    async function load() {
      const today = todayStr()
      const { data } = await supabase
        .from('team_log_meeting_items')
        .select('id, meeting_id, content, owner, due_date, team_log_meetings(title)')
        .eq('kind', 'action')
        .eq('done', false)
        .not('due_date', 'is', null)
        .lte('due_date', today)

      if (!active || !data || !me) return
      const mine = (data as Row[])
        .filter(row => nameMatches(row.owner, me.name))
        .map(row => ({
          id: row.id,
          meetingId: row.meeting_id,
          meetingTitle: meetingTitleOf(row),
          content: row.content,
          dueDate: row.due_date,
          overdue: row.due_date < today,
        }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      setItems(mine)
    }

    load()
    const channel = supabase
      .channel(`action-reminders-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_meeting_items' }, load)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [loaded, me, instanceId])

  return items
}
