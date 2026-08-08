'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { buildWheel, totalWeight, type RouletteMenu } from '@/lib/roulette'
import { DOODLE_PALETTE } from '@/lib/data'
import type { Member } from '@/lib/members'

const TABS: { key: RouletteMenu; label: string }[] = [
  { key: 'meal', label: '밥' },
  { key: 'coffee', label: '커피' },
  { key: 'snack', label: '간식' },
]

const SIZE = 240
const CENTER = 120
const OUTER_R = 100
const INNER_R = 30
const TICK_INNER = 104
const TICK_OUTER = 112
const TICK_COUNT = 48
const HUB_R = 26
const CORP_COLOR = '#EEEDFE'

type DayRouletteState = {
  meal_payer: string | null; meal_spun: boolean
  coffee_payer: string | null; coffee_spun: boolean
  snack_payer: string | null; snack_spun: boolean
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutSlicePath(cx: number, cy: number, outerR: number, innerR: number, start: number, end: number) {
  const p0o = polar(cx, cy, outerR, start)
  const p1o = polar(cx, cy, outerR, end)
  const p0i = polar(cx, cy, innerR, end)
  const p1i = polar(cx, cy, innerR, start)
  const largeArc = end - start > 180 ? 1 : 0
  return `M ${p0o.x} ${p0o.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${p1o.x} ${p1o.y} L ${p0i.x} ${p0i.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${p1i.x} ${p1i.y} Z`
}

function toRouletteMembers(members: Member[]) {
  return members.map(m => ({ id: m.id, name: m.name, role: m.role }))
}

export default function Roulette() {
  const { members, loaded } = useMembers()
  const [activeTab, setActiveTab] = useState<RouletteMenu>('meal')
  const [dayState, setDayState] = useState<DayRouletteState | null>(null)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState<{ menu: RouletteMenu; payer: string | null } | null>(null)
  // 지금 이 탭에서 애니메이션 중인 메뉴. 다른 곳에서 온 realtime 갱신이 이 메뉴의
  // spun/payer를 애니메이션 끝나기 전에 덮어써서 결과가 미리 노출되는 걸 막는다.
  const spinningMenuRef = useRef<RouletteMenu | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data: today } = await supabase.rpc('today_date')
      if (!today) return
      const { data } = await supabase
        .from('day_state')
        .select('meal_payer, meal_spun, coffee_payer, coffee_spun, snack_payer, snack_spun')
        .eq('date', today)
        .maybeSingle()
      if (active) {
        setDayState(
          (data as DayRouletteState | null) ?? {
            meal_payer: null, meal_spun: false,
            coffee_payer: null, coffee_spun: false,
            snack_payer: null, snack_spun: false,
          }
        )
      }
    })()

    const channel = supabase
      .channel('day_state-roulette')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        const row = payload.new as DayRouletteState | undefined
        if (!row) return
        const protectedMenu = spinningMenuRef.current
        if (!protectedMenu) {
          setDayState(row)
          return
        }
        // 애니메이션 중인 메뉴의 필드만 이전 값으로 유지하고, 나머지는 실시간 값을 반영한다.
        setDayState(prev => {
          const merged = { ...row }
          if (prev && protectedMenu === 'meal') { merged.meal_spun = prev.meal_spun; merged.meal_payer = prev.meal_payer }
          if (prev && protectedMenu === 'coffee') { merged.coffee_spun = prev.coffee_spun; merged.coffee_payer = prev.coffee_payer }
          if (prev && protectedMenu === 'snack') { merged.snack_spun = prev.snack_spun; merged.snack_payer = prev.snack_payer }
          return merged
        })
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  const wheel = useMemo(() => buildWheel(activeTab, toRouletteMembers(members)), [activeTab, members])
  const total = totalWeight(wheel) || 1

  const segments = useMemo(() => {
    return wheel.reduce<Array<(typeof wheel)[number] & { start: number; end: number; mid: number; percent: number }>>(
      (list, seg) => {
        const start = list.length > 0 ? list[list.length - 1].end : 0
        const end = start + (seg.weight / total) * 360
        return [...list, { ...seg, start, end, mid: (start + end) / 2, percent: (seg.weight / total) * 100 }]
      },
      []
    )
  }, [wheel, total])

  function colorFor(memberId: string | null) {
    if (memberId === null) return CORP_COLOR
    const m = members.find(x => x.id === memberId)
    return DOODLE_PALETTE[(m?.color_key ?? 0) % 8].bg
  }

  function nameOf(id: string | null) {
    if (id === null) return '법인카드'
    return members.find(m => m.id === id)?.name ?? '알 수 없음'
  }

  const alreadySpun = dayState
    ? activeTab === 'meal' ? dayState.meal_spun : activeTab === 'coffee' ? dayState.coffee_spun : dayState.snack_spun
    : false
  const payerId = dayState
    ? activeTab === 'meal' ? dayState.meal_payer : activeTab === 'coffee' ? dayState.coffee_payer : dayState.snack_payer
    : null

  async function handleSpin() {
    if (spinning || busy || alreadySpun || members.length === 0) return
    setBusy(true)
    spinningMenuRef.current = activeTab
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const { data: picked, error } = await supabase.rpc('spin', { p_menu: activeTab, p_user: userData.user?.id ?? null })
    setBusy(false)
    if (error) { spinningMenuRef.current = null; return }

    const target = segments.find(s => s.memberId === picked)?.mid ?? 0
    setRotation(prev => prev + 360 * 5 + (((360 - target) - (prev % 360) + 720) % 360))
    setSpinning(true)
    setRevealed({ menu: activeTab, payer: picked as string | null })
  }

  function handleTransitionEnd() {
    if (!spinning) return
    setSpinning(false)
    spinningMenuRef.current = null
    if (!revealed) return
    setDayState(prev => {
      if (!prev) return prev
      if (revealed.menu === 'meal') return { ...prev, meal_spun: true, meal_payer: revealed.payer }
      if (revealed.menu === 'coffee') return { ...prev, coffee_spun: true, coffee_payer: revealed.payer }
      return { ...prev, snack_spun: true, snack_payer: revealed.payer }
    })
  }

  if (!loaded) return <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="flex items-center gap-1 mb-4">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-[13px] px-3 py-1.5 rounded-full transition-colors ${
              activeTab === t.key ? 'bg-[#5B54C4] text-white' : 'text-[#6B6B66] hover:bg-[#F7F7F5]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {members.length === 0 ? (
        <p className="text-[13px] text-[#9C9C96] py-8 text-center">멤버가 없습니다. 멤버 관리에서 추가해주세요.</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <g
                onTransitionEnd={handleTransitionEnd}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: `${CENTER}px ${CENTER}px`,
                  transition: spinning ? 'transform 3.6s cubic-bezier(.13,.75,.05,1)' : 'none',
                }}
              >
                {Array.from({ length: TICK_COUNT }).map((_, i) => {
                  const angle = (i * 360) / TICK_COUNT
                  const p0 = polar(CENTER, CENTER, TICK_INNER, angle)
                  const p1 = polar(CENTER, CENTER, TICK_OUTER, angle)
                  return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#E8E8E4" strokeWidth={1.5} />
                })}
                {segments.map(seg => (
                  <path
                    key={seg.memberId ?? 'corp'}
                    d={donutSlicePath(CENTER, CENTER, OUTER_R, INNER_R, seg.start, seg.end)}
                    fill={colorFor(seg.memberId)}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                ))}
                {segments.map(seg => {
                  const p = polar(CENTER, CENTER, (OUTER_R + INNER_R) / 2, seg.mid)
                  return (
                    <text key={`label-${seg.memberId ?? 'corp'}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#1F1F1D">
                      <tspan x={p.x} dy="-0.3em">{seg.label}</tspan>
                      <tspan x={p.x} dy="1.2em">{seg.percent.toFixed(0)}%</tspan>
                    </text>
                  )
                })}
              </g>
              <circle cx={CENTER} cy={CENTER} r={HUB_R} fill="#FFFFFF" stroke="#E8E8E4" strokeWidth={2} />
              <path d={`M ${CENTER - 7} 4 L ${CENTER + 7} 4 L ${CENTER} 18 Z`} fill="#5B54C4" />
            </svg>
          </div>

          <div className="flex-1 min-w-0 w-full">
            <div className="mb-3">
              {alreadySpun ? (
                <p className="text-[15px] text-[#1F1F1D]">
                  오늘의 결과: <span className="font-semibold text-[#5B54C4]">{nameOf(payerId)}</span>
                  {payerId === null && ' 🎉 (법인카드)'}
                </p>
              ) : (
                <button
                  onClick={handleSpin}
                  disabled={spinning || busy}
                  className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-50 rounded-lg px-4 py-2.5"
                >
                  {spinning ? '돌리는 중...' : '룰렛 돌리기'}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {segments.map(seg => (
                <div key={seg.memberId ?? 'corp'} className="flex items-center gap-2">
                  <span className="text-[12px] text-[#6B6B66] w-14 flex-shrink-0 truncate">{seg.label}</span>
                  <div className="flex-1 h-2 bg-[#F7F7F5] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${seg.percent}%`, background: colorFor(seg.memberId) }} />
                  </div>
                  <span className="text-[11px] text-[#9C9C96] w-10 text-right flex-shrink-0">{seg.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
