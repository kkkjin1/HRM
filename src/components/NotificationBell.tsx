'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import type { NotificationMeta, NotificationRow } from '@/lib/notifications'

type Props = {
  onNavigate?: (meta: NotificationMeta) => void
}

function fmtRelative(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '어제'
  return `${diffDay}일 전`
}

export default function NotificationBell({ onNavigate }: Props) {
  // 데스크톱/모바일 헤더에 각각 하나씩 동시에 마운트된다(CSS로 숨길 뿐 언마운트되지 않음) —
  // 채널 이름이 같으면 "cannot add postgres_changes callbacks after subscribe()"로 크래시하니
  // useId로 인스턴스마다 고유한 채널 이름을 쓴다 (useMembers.ts와 동일한 이유).
  const instanceId = useId()
  const { me, loaded } = useCurrentMember()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  useEffect(() => {
    if (!loaded || !me) return
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('member_id', me.id)
        .order('created_at', { ascending: false })
        .limit(30)
      if (active && data) setItems(data as NotificationRow[])
    })()

    const channel = supabase
      .channel(`notifications-${me.id}-${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${me.id}` }, payload => {
        setItems(prev => [payload.new as NotificationRow, ...prev].slice(0, 30))
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [loaded, me, instanceId])

  if (!loaded || !me) return null

  const unreadCount = items.filter(n => !n.read).length

  async function markRead(n: NotificationRow) {
    if (n.read) return
    setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)))
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', n.id)
  }

  async function markAllRead() {
    if (!me || unreadCount === 0) return
    setItems(prev => prev.map(x => ({ ...x, read: true })))
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('member_id', me.id).eq('read', false)
  }

  function handleClick(n: NotificationRow) {
    markRead(n)
    if (n.meta) onNavigate?.(n.meta)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="알림"
        className="relative w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-[13px]"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9.5px] font-semibold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 top-full right-0 mt-2 w-[320px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100">
            <p className="text-[12.5px] font-semibold text-gray-800">알림</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11.5px] text-gray-400 hover:text-[#4C7FE0]">모두 읽음</button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && <p className="text-[12.5px] text-gray-400 text-center py-8">알림이 없습니다.</p>}
            {items.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-start gap-2 ${n.read ? '' : 'bg-[#F0F4FF]'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${n.read ? '' : 'bg-[#4C7FE0]'}`} />
                <div>
                  <p className="text-[12.5px] text-gray-800 leading-snug">{n.body}</p>
                  <p className="text-[10.5px] text-gray-400 mt-0.5">{fmtRelative(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
