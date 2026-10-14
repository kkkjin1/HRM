'use client'

// 익명채팅 SOS 팝업 — 누군가 익명채팅에서 SOS를 보내면 모든 팀원에게 한 번 뜬다.
// 접속(새로고침) 때 오늘 SOS 중 아직 확인 안 한 것을 띄우고, 켜 둔 채로 있을 때 새로 온 SOS도 바로 띄운다.
// "확인"한 SOS id는 이 브라우저(localStorage)에 남겨 다시 뜨지 않게 한다. 내가 보낸 SOS는 띄우지 않는다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'

type SosRow = { id: string; chat_date: string; author_id: string; body: string; created_at: string; is_sos: boolean }

const SEEN_KEY = 'hrm_sos_seen'

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
function writeSeen(ids: string[]) {
  // 오래된 id가 끝없이 쌓이지 않게 최근 200개만 남긴다.
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200))) } catch {}
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function SosPopup() {
  const { me, loaded } = useCurrentMember()
  const [queue, setQueue] = useState<SosRow[]>([])

  useEffect(() => {
    if (!loaded || !me) return
    let active = true
    const myId = me.id
    const supabase = createClient()
    const add = (rows: SosRow[]) => {
      const seen = readSeen()
      const fresh = rows.filter(r => r.is_sos && r.author_id !== myId && !seen.has(r.id))
      if (fresh.length > 0) setQueue(prev => [...prev, ...fresh.filter(r => !prev.some(p => p.id === r.id))])
    }

    ;(async () => {
      const { data: today } = await supabase.rpc('today_date')
      if (!active || !today) return
      const { data } = await supabase
        .from('anon_chat')
        .select('*')
        .eq('chat_date', today as string)
        .eq('is_sos', true)
        .order('created_at', { ascending: true })
      if (active) add((data ?? []) as SosRow[])
    })()

    const channel = supabase
      .channel(`sos-popup-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anon_chat' }, payload => add([payload.new as SosRow]))
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [loaded, me])

  if (queue.length === 0) return null

  function confirmAll() {
    writeSeen([...readSeen(), ...queue.map(q => q.id)])
    setQueue([])
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center px-4">
      <div role="alertdialog" aria-labelledby="sos-title" className="bg-white rounded-2xl border-2 border-red-300 shadow-2xl w-full max-w-[420px] p-5">
        <p id="sos-title" className="text-[16px] font-bold text-red-600 mb-1">🆘 팀원 SOS</p>
        <p className="text-[12.5px] text-[#7A8491] mb-4">익명채팅으로 도움 요청이 왔어요. 도와줄 수 있다면 익명채팅으로 답해주세요.</p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
          {queue.map(q => (
            <div key={q.id} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-[14px] text-red-800 leading-relaxed whitespace-pre-wrap break-words">{q.body}</p>
              <p className="text-[11px] text-red-400 mt-0.5">{fmtTime(q.created_at)}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={confirmAll} autoFocus className="text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg px-4 py-2">확인</button>
        </div>
      </div>
    </div>
  )
}
