'use client'

// "일정" 탭 중 내가 담당자(assignee)인 이번주(월~일) 일정 + "업무" 탭 보고일정 서브태스크 중
// 내가 작성자(author)인 이번주 항목을 모아 날짜순으로 정리한다.
// ActionItemReminderModal이 회의 액션아이템과 함께 보여주는 용도로만 쓰인다.
// team_log_schedule/team_log_subtasks는 realtime publication에 등록돼 있지 않아서(회의
// 액션아이템과 달리) 마운트 시 한 번만 조회한다 — 모달이 하루 1회 반짝 뜨는 용도라 충분하다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'

export type WeekOutlookItem = { id: string; kind: 'schedule' | 'report'; title: string; date: string; context: string }

type ScheduleRow = { id: string; title: string; event_date: string; assignee: string; tag: string | null; status: string | null }
type SubtaskRow = { id: string; title: string; entry_date: string; author: string; team_log_items: { title: string } | { title: string }[] | null }

function nameMatches(field: string, myName: string) {
  return field
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .some(name => name === myName || name.includes(myName) || myName.includes(name))
}

function itemTitleOf(row: SubtaskRow) {
  const t = row.team_log_items
  if (!t) return ''
  return Array.isArray(t) ? (t[0]?.title ?? '') : t.title
}

function weekRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: fmt(monday), end: fmt(sunday) }
}

export function useMyWeekOutlook(): WeekOutlookItem[] {
  const { me, loaded } = useCurrentMember()
  const [items, setItems] = useState<WeekOutlookItem[]>([])

  useEffect(() => {
    if (!loaded || !me) return
    let active = true
    const supabase = createClient()
    const { start, end } = weekRange()

    ;(async () => {
      const [scheduleRes, subtaskRes] = await Promise.all([
        supabase
          .from('team_log_schedule')
          .select('id, title, event_date, assignee, tag, status')
          .gte('event_date', start)
          .lte('event_date', end),
        supabase
          .from('team_log_subtasks')
          .select('id, title, entry_date, author, team_log_items(title)')
          .eq('entry_type', '보고일정')
          .gte('entry_date', start)
          .lte('entry_date', end),
      ])
      if (!active || !me) return

      const schedule = ((scheduleRes.data as ScheduleRow[] | null) ?? [])
        .filter(r => nameMatches(r.assignee, me.name) && r.status !== 'done' && r.status !== 'cancelled')
        .map(r => ({ id: r.id, kind: 'schedule' as const, title: r.title, date: r.event_date, context: r.tag ?? '일정' }))

      const reports = ((subtaskRes.data as SubtaskRow[] | null) ?? [])
        .filter(r => nameMatches(r.author, me.name))
        .map(r => ({ id: r.id, kind: 'report' as const, title: r.title, date: r.entry_date, context: itemTitleOf(r) || '보고일정' }))

      setItems([...schedule, ...reports].sort((a, b) => a.date.localeCompare(b.date)))
    })()

    return () => { active = false }
  }, [loaded, me])

  return items
}
