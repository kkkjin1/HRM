'use client'

// 팀 나무. 팀 전체에 한 그루뿐이고, 하루에 한 번 누구든 물을 주면 자란다 — 개인 성과가 아니라
// "다 같이 매일 조금씩" 쌓이는 걸 보여주는 게 목적이라 개인별 진행률이 아니라 팀 전체 누적으로만 큰다.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import ClickableAvatar from '@/components/ClickableAvatar'

type Stage = { min: number; emoji: string; label: string }

const STAGES: Stage[] = [
  { min: 0, emoji: '🌰', label: '씨앗' },
  { min: 1, emoji: '🌱', label: '새싹' },
  { min: 7, emoji: '🌿', label: '어린 나무' },
  { min: 21, emoji: '🌳', label: '나무' },
  { min: 50, emoji: '🌳✨', label: '무성한 나무' },
  { min: 100, emoji: '🌲🎉', label: '거목' },
]

function stageOf(total: number) {
  let idx = 0
  for (let i = 0; i < STAGES.length; i++) if (total >= STAGES[i].min) idx = i
  return idx
}

export default function TeamTree() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [treeId, setTreeId] = useState<string | null>(null)
  const [plantedAt, setPlantedAt] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [todayWaterers, setTodayWaterers] = useState<string[]>([])
  const [today, setToday] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const treeIdRef = useRef<string | null>(null)
  const todayRef = useRef<string | null>(null)
  const meIdRef = useRef<string | null>(null)

  useEffect(() => {
    meIdRef.current = me?.id ?? null
  }, [me])

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const dateStr = dateData as string | null
      if (!active || !dateStr) return
      setToday(dateStr)
      todayRef.current = dateStr

      const { data: tree } = await supabase.from('team_tree').select('id, planted_at').limit(1).maybeSingle()
      if (!active || !tree) { setLoaded(true); return }
      setTreeId(tree.id)
      treeIdRef.current = tree.id
      setPlantedAt(tree.planted_at)

      const [{ count }, { data: todayRows }] = await Promise.all([
        supabase.from('team_tree_waterings').select('id', { count: 'exact', head: true }).eq('tree_id', tree.id),
        supabase.from('team_tree_waterings').select('member_id').eq('tree_id', tree.id).eq('watered_date', dateStr),
      ])
      if (!active) return
      setTotal(count ?? 0)
      setTodayWaterers((todayRows ?? []).map(r => r.member_id))
      setLoaded(true)
    })()

    const channel = supabase
      .channel('fun-team-tree')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_tree_waterings' }, payload => {
        const row = payload.new as { tree_id: string; member_id: string; watered_date: string }
        if (row.tree_id !== treeIdRef.current) return
        if (row.member_id === meIdRef.current) return // 내 물주기는 water()에서 이미 낙관적으로 반영됨 — 중복 카운트 방지
        setTotal(prev => prev + 1)
        if (row.watered_date === todayRef.current) {
          setTodayWaterers(prev => (prev.includes(row.member_id) ? prev : [...prev, row.member_id]))
        }
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  async function water() {
    if (!me || !today || !treeId || busy || todayWaterers.includes(me.id)) return
    setBusy(true)
    setTodayWaterers(prev => [...prev, me.id]) // 낙관적 업데이트 — 실패해도 realtime/새로고침으로 곧 정정된다
    setTotal(prev => prev + 1)
    const supabase = createClient()
    const { error } = await supabase.from('team_tree_waterings').insert({ tree_id: treeId, member_id: me.id, watered_date: today })
    if (error) {
      setTodayWaterers(prev => prev.filter(id => id !== me.id))
      setTotal(prev => Math.max(prev - 1, 0))
    }
    setBusy(false)
  }

  if (!loaded || !membersLoaded) return <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5"><p className="text-[13px] text-[#9C9C96]">불러오는 중...</p></div>
  if (!treeId) return null

  const stageIdx = stageOf(total)
  const stage = STAGES[stageIdx]
  const next = STAGES[stageIdx + 1]
  const progressPct = next ? Math.min(100, Math.round(((total - stage.min) / (next.min - stage.min)) * 100)) : 100
  const iHaveWatered = !!me && todayWaterers.includes(me.id)
  const waterers = todayWaterers.map(id => members.find(m => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m)

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#9C9C96]">팀 나무</p>
        {plantedAt && (
          <span className="text-[11px] text-[#B0B0AA]">
            {new Date(plantedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}에 심음
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-[42px] leading-none flex-shrink-0" title={stage.label}>{stage.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold text-[#1F1F1D]">{stage.label}</span>
            <span className="text-[11.5px] text-[#9C9C96]">누적 물주기 {total}회</span>
          </div>
          <div className="mt-2 h-2 bg-[#F0EFEC] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#5B54C4]" style={{ width: `${progressPct}%`, transition: 'width .35s' }} />
          </div>
          <p className="text-[10.5px] text-[#B0B0AA] mt-1">
            {next ? `다음 단계(${next.label})까지 ${next.min - total}회` : '가장 큰 단계까지 자랐습니다'}
          </p>
        </div>
        <button
          onClick={water}
          disabled={!me || busy || iHaveWatered}
          className={`flex-shrink-0 text-[13px] font-medium rounded-full px-4 py-2.5 transition-colors ${
            iHaveWatered
              ? 'bg-[#EEF1FE] text-[#5B54C4] cursor-default'
              : 'bg-[#5B54C4] text-white hover:bg-[#4A44A8] disabled:opacity-40'
          }`}
        >
          {iHaveWatered ? '오늘 물 줬어요 ✅' : '물 주기 💧'}
        </button>
      </div>

      {waterers.length > 0 && (
        <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[#E8E8E4] flex-wrap">
          <span className="text-[11px] text-[#9C9C96] mr-0.5">오늘 물 준 사람</span>
          {waterers.map(m => (
            <div key={m.id} className="flex items-center gap-1" title={displayNameFull(m)}>
              <ClickableAvatar member={m} size={20} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
