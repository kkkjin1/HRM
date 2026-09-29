'use client'

// 팀 나무. 팀 전체에 한 그루뿐이고, 하루에 한 번 누구든 물을 주면 자란다 — 개인 성과가 아니라
// "다 같이 매일 조금씩" 쌓이는 걸 보여주는 게 목적이라 개인별 진행률이 아니라 팀 전체 누적으로만 큰다.
// 거목(최고 단계) 도달 이후에는 "팀원 수 × 주5일" 물주기마다 계절 이벤트가 하나씩 쌓인다 —
// 팀이 클수록 다음 이벤트까지 더 많이 줘야 하니, 인원 변화에 따라 자연스럽게 페이스가 맞춰진다.
// 큰 아이콘 자리는 나무 고정이 아니라 "지금까지 달성한 것 중 가장 최근 것"을 보여준다 — 성장 단계든 계절
// 이벤트든, 새로 하나가 열리면 그게 대표로 올라오고 이전 것들은 액자처럼 작은 배지로 아래에 쌓인다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import ClickableAvatar from '@/components/ClickableAvatar'

type Stage = { min: number; emoji: string; label: string }
type WaterRow = { member_id: string; watered_date: string }
type Badge = { emoji: string; label: string; date?: string }

const STAGES: Stage[] = [
  { min: 0, emoji: '🌰', label: '씨앗' },
  { min: 1, emoji: '🌱', label: '새싹' },
  { min: 7, emoji: '🌿', label: '어린 나무' },
  { min: 21, emoji: '🌳', label: '나무' },
  { min: 50, emoji: '🌳', label: '무성한 나무' },
  { min: 100, emoji: '🌲', label: '거목' },
]
const MAX_STAGE_THRESHOLD = STAGES[STAGES.length - 1].min
const BUSINESS_DAYS_PER_WEEK = 5
const RANK_ICONS = ['🥇', '🥈', '🥉', '🎖️', '🌟']

function stageOf(total: number) {
  let idx = 0
  for (let i = 0; i < STAGES.length; i++) if (total >= STAGES[i].min) idx = i
  return idx
}

// 계절별 이벤트 이모지 풀 — 매번 같은 하나가 아니라 시즌 안에서도 여러 개가 돌아가며 나오게.
const SEASON_POOLS: { emoji: string; label: string }[][] = [
  [ // 봄 (3-5월)
    { emoji: '🌸', label: '벚꽃' },
    { emoji: '🌷', label: '튤립' },
    { emoji: '🌼', label: '들꽃' },
    { emoji: '🦋', label: '나비' },
    { emoji: '🐝', label: '꿀벌' },
    { emoji: '🌱', label: '새싹' },
  ],
  [ // 여름 (6-8월)
    { emoji: '🌻', label: '해바라기' },
    { emoji: '🍉', label: '수박' },
    { emoji: '🌊', label: '파도' },
    { emoji: '☀️', label: '뙤약볕' },
    { emoji: '🍦', label: '아이스크림' },
    { emoji: '🦩', label: '플라밍고' },
  ],
  [ // 가을 (9-11월)
    { emoji: '🍁', label: '단풍' },
    { emoji: '🍂', label: '낙엽' },
    { emoji: '🎃', label: '호박' },
    { emoji: '🌰', label: '밤' },
    { emoji: '🍄', label: '버섯' },
    { emoji: '🧣', label: '가을바람' },
  ],
  [ // 겨울 (12-2월)
    { emoji: '❄️', label: '눈꽃' },
    { emoji: '⛄', label: '눈사람' },
    { emoji: '🎄', label: '트리' },
    { emoji: '🔥', label: '모닥불' },
    { emoji: '🧤', label: '벙어리장갑' },
    { emoji: '🌙', label: '겨울밤' },
  ],
]

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// 이벤트가 실제로 달성된 날짜의 계절 안에서, 날짜+순번으로 고정 선택 — 새로고침해도 같은 이벤트는 항상 같은 이모지.
function seasonOf(dateStr: string, salt: number): { emoji: string; label: string } {
  const month = Number(dateStr.slice(5, 7))
  const seasonIdx = month >= 3 && month <= 5 ? 0 : month >= 6 && month <= 8 ? 1 : month >= 9 && month <= 11 ? 2 : 3
  const pool = SEASON_POOLS[seasonIdx]
  return pool[hashCode(`${dateStr}:${salt}`) % pool.length]
}

function HistoryBadges({ badges }: { badges: Badge[] }) {
  if (badges.length <= 1) return null
  return (
    <div className="mt-3 flex items-center gap-1 flex-wrap">
      {badges.map((b, i) => (
        <div
          key={i}
          title={b.date ? `${b.label} · ${b.date}` : b.label}
          className={`flex items-center justify-center w-7 h-7 rounded-lg border text-[14px] flex-shrink-0 ${
            i === badges.length - 1 ? 'border-[#5B54C4] bg-[#EEF1FE]' : 'border-[#E8E8E4] bg-[#F7F7F5]'
          }`}
        >
          {b.emoji}
        </div>
      ))}
    </div>
  )
}

export default function TeamTree() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [treeId, setTreeId] = useState<string | null>(null)
  const [plantedAt, setPlantedAt] = useState<string | null>(null)
  const [waterRows, setWaterRows] = useState<WaterRow[]>([])
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

      const { data: allRows } = await supabase
        .from('team_tree_waterings')
        .select('member_id, watered_date')
        .eq('tree_id', tree.id)
      if (!active) return
      setWaterRows(allRows ?? [])
      setLoaded(true)
    })()

    const channel = supabase
      .channel('fun-team-tree')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_tree_waterings' }, payload => {
        const row = payload.new as { tree_id: string; member_id: string; watered_date: string }
        if (row.tree_id !== treeIdRef.current) return
        if (row.member_id === meIdRef.current) return // 내 물주기는 water()에서 이미 낙관적으로 반영됨 — 중복 카운트 방지
        setWaterRows(prev => [...prev, { member_id: row.member_id, watered_date: row.watered_date }])
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  const todayWaterers = useMemo(
    () => [...new Set(waterRows.filter(r => r.watered_date === today).map(r => r.member_id))],
    [waterRows, today],
  )

  const currentMonth = today?.slice(0, 7) ?? null // 매달 새로 시작 — 역전의 기회를 위해 전체 누적이 아닌 이번 달 집계만 랭킹에 반영
  const ranking = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of waterRows) {
      if (r.watered_date.slice(0, 7) !== currentMonth) continue
      counts.set(r.member_id, (counts.get(r.member_id) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [waterRows, currentMonth])

  const interval = Math.max(members.length, 1) * BUSINESS_DAYS_PER_WEEK
  const events = useMemo(() => {
    if (waterRows.length <= MAX_STAGE_THRESHOLD) return []
    const sorted = [...waterRows].sort((a, b) => a.watered_date.localeCompare(b.watered_date))
    const result: { emoji: string; label: string; date: string }[] = []
    for (let n = MAX_STAGE_THRESHOLD + interval; n <= sorted.length; n += interval) {
      result.push({ ...seasonOf(sorted[n - 1].watered_date, n), date: sorted[n - 1].watered_date })
    }
    return result
  }, [waterRows, interval])

  async function water() {
    if (!me || !today || !treeId || busy || todayWaterers.includes(me.id)) return
    setBusy(true)
    setWaterRows(prev => [...prev, { member_id: me.id, watered_date: today }]) // 낙관적 업데이트 — 실패해도 realtime/새로고침으로 곧 정정된다
    const supabase = createClient()
    const { error } = await supabase.from('team_tree_waterings').insert({ tree_id: treeId, member_id: me.id, watered_date: today })
    if (error) {
      setWaterRows(prev => {
        const idx = prev.findIndex(r => r.member_id === me.id && r.watered_date === today)
        if (idx === -1) return prev
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
      })
    }
    setBusy(false)
  }

  if (!loaded || !membersLoaded) return <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5"><p className="text-[13px] text-[#9C9C96]">불러오는 중...</p></div>
  if (!treeId) return null

  const total = waterRows.length
  const stageIdx = stageOf(total)
  const stage = STAGES[stageIdx]
  const next = STAGES[stageIdx + 1]
  const iHaveWatered = !!me && todayWaterers.includes(me.id)
  const waterers = todayWaterers.map(id => members.find(m => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m)

  const sinceMax = Math.max(total - MAX_STAGE_THRESHOLD, 0)
  const remainder = sinceMax % interval
  const remainingToNextEvent = sinceMax > 0 && remainder === 0 ? interval : interval - remainder

  // 지금까지 달성한 모든 것(도달한 성장 단계 + 거목 이후 이벤트)을 시간순으로 — 마지막 것이 대표로 크게 나온다.
  const achievedStages = STAGES.slice(0, stageIdx + 1)
  const historyBadges: Badge[] = [
    ...achievedStages.map(s => ({ emoji: s.emoji, label: s.label })),
    ...events.map(e => ({ emoji: e.emoji, label: e.label, date: e.date })),
  ]
  const featured = historyBadges[historyBadges.length - 1]

  const progressPct = next
    ? Math.min(100, Math.round(((total - stage.min) / (next.min - stage.min)) * 100))
    : Math.round((remainder / interval) * 100)
  const subtext = next
    ? `🌿 다음 단계(${next.label})까지 ${next.min - total}회`
    : `🎊 다음 이벤트까지 ${remainingToNextEvent}회`

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
        <div className="text-[42px] leading-none flex-shrink-0" title={featured.label}>{featured.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold text-[#1F1F1D]">{featured.label}</span>
            <span className="text-[11.5px] text-[#9C9C96]">누적 물주기 {total}회</span>
          </div>
          <div className="mt-2 h-2 bg-[#F0EFEC] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#5B54C4]" style={{ width: `${progressPct}%`, transition: 'width .35s' }} />
          </div>
          <p className="text-[10.5px] text-[#B0B0AA] mt-1">{subtext}</p>
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

      <HistoryBadges badges={historyBadges} />

      {waterers.length > 0 && (
        <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[#E8E8E4] flex-wrap">
          <span className="text-[11px] text-[#9C9C96] mr-0.5">💧 오늘 물 준 사람</span>
          {waterers.map(m => (
            <div key={m.id} className="flex items-center gap-1" title={displayNameFull(m)}>
              <ClickableAvatar member={m} size={20} />
            </div>
          ))}
        </div>
      )}

      {ranking.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#E8E8E4]">
          <p className="text-[11px] text-[#9C9C96] mb-2">🏆 {currentMonth ? Number(currentMonth.slice(5, 7)) : ''}월 물주기 랭킹</p>
          <div className="space-y-1.5">
            {ranking.slice(0, 5).map(([memberId, count], i) => {
              const m = members.find(mm => mm.id === memberId)
              if (!m) return null
              return (
                <div key={memberId} className="flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center text-[13px]">{RANK_ICONS[i]}</span>
                    <ClickableAvatar member={m} size={18} />
                    <span className="text-[#4A4A46]">{displayNameFull(m)}</span>
                  </div>
                  <span className="text-[#9C9C96]">💧 {count}회</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
