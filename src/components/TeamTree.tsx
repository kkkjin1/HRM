'use client'

// 팀 나무. 팀 전체에 한 그루뿐이고, 하루에 한 번 누구든 물을 주면 자란다 — 개인 성과가 아니라
// "다 같이 매일 조금씩" 쌓이는 걸 보여주는 게 목적이라 개인별 진행률이 아니라 팀 전체 누적으로만 큰다.
// 거목(최고 단계) 도달 이후에는 "팀원 수 × 주5일" 물주기마다 계절 이벤트가 하나씩 쌓인다 —
// 팀이 클수록 다음 이벤트까지 더 많이 줘야 하니, 인원 변화에 따라 자연스럽게 페이스가 맞춰진다.
// 큰 아이콘 자리는 나무 고정이 아니라 "지금까지 달성한 것 중 가장 최근 것"을 보여준다 — 성장 단계든 계절
// 이벤트든, 새로 하나가 열리면 그게 대표로 올라온다.
// 아래는 끝없이 늘어나는 배지 줄이 아니라 고정 크기 두 덩어리다: 성장 단계 6칸 길 + 계절 도감 24칸(4계절×6).
// 도감은 중복이 없다 — 이벤트는 그 계절에서 아직 못 모은 것만 고르고, 계절이 다 차면 다음 계절의 빈칸을 채운다.
// 24칸을 다 모은 뒤의 이벤트는 같은 칸의 ×N 횟수로만 올라간다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { rpcTodayDate } from '@/lib/serverToday'
import { useAllMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import ClickableAvatar from '@/components/ClickableAvatar'
import { publishSeasonTheme, setSeasonThemeOff, useSeasonThemeOff } from '@/lib/seasonTheme'

type Stage = { min: number; emoji: string; label: string }
type WaterRow = { member_id: string; watered_date: string }
type Badge = { emoji: string; label: string; date?: string }

const STAGES: Stage[] = [
  { min: 0, emoji: '🌰', label: '씨앗' },
  { min: 1, emoji: '🌱', label: '새싹' },
  { min: 7, emoji: '🌿', label: '어린 나무' },
  { min: 21, emoji: '🪴', label: '나무' },
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
// inSeasonOnly: 그 계절 날짜에 열린 이벤트로만 얻는 제철 아이템(다른 계절이 넘쳐 들어올 땐 안 뽑힘).
const SEASON_POOLS: { emoji: string; label: string; inSeasonOnly?: boolean }[][] = [
  [ // 봄 (3-5월)
    { emoji: '🌸', label: '벚꽃' },
    { emoji: '🌷', label: '튤립' },
    { emoji: '🌼', label: '들꽃' },
    { emoji: '🦋', label: '나비' },
    { emoji: '🐝', label: '꿀벌' },
    { emoji: '🍀', label: '네잎클로버' },
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
    { emoji: '🍠', label: '군고구마' },
    { emoji: '🍄', label: '버섯' },
    { emoji: '🧣', label: '가을바람' },
  ],
  [ // 겨울 (12-2월)
    { emoji: '❄️', label: '눈꽃' },
    { emoji: '⛄', label: '눈사람' },
    { emoji: '🎄', label: '트리', inSeasonOnly: true },
    { emoji: '🔥', label: '모닥불' },
    { emoji: '🍊', label: '귤' },
    { emoji: '🌙', label: '겨울밤' },
  ],
]

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const SEASON_NAMES = ['봄', '여름', '가을', '겨울']
const TOTAL_COLLECTIBLES = SEASON_POOLS.reduce((n, p) => n + p.length, 0)

function seasonIdxOf(dateStr: string) {
  const month = Number(dateStr.slice(5, 7))
  return month >= 3 && month <= 5 ? 0 : month >= 6 && month <= 8 ? 1 : month >= 9 && month <= 11 ? 2 : 3
}

type Collected = { count: number; firstDate: string }
type EventHit = { emoji: string; label: string; date: string; key: string }

// 이벤트들을 시간순으로 도감 칸에 배정한다. 날짜+순번 해시로 고정 선택이라 새로고침해도 결과가 같다.
// 1) 그 날짜 계절의 빈칸 → 2) 계절이 다 찼으면 다음 계절의 빈칸 → 3) 전부 찼으면 원래 계절 칸 ×N.
function assignEvents(eventDates: { date: string; salt: number }[]) {
  const collected = new Map<string, Collected>() // key = `${계절}:${칸}`
  const hits: EventHit[] = []
  const free = (s: number) => SEASON_POOLS[s].map((_, i) => i).filter(i => !collected.has(`${s}:${i}`))
  for (const { date, salt } of eventDates) {
    const h = hashCode(`${date}:${salt}`)
    const home = seasonIdxOf(date)
    let s = home
    let idx: number
    const own = free(home)
    if (own.length > 0) {
      idx = own[h % own.length]
    } else {
      // 다음 계절부터 차례로 빈칸을 찾는다(가을이 다 찼으면 겨울 → 봄 → 여름) — 11월에 여름 아이템이 튀어나오지 않게.
      // 넘쳐 들어갈 때는 '제철 전용' 아이템(🎄 트리 등)은 고르지 않는다 — 그건 그 계절 날짜에 열린 이벤트로만 얻는다.
      // 남은 빈칸이 전부 제철 전용이면 그때는 허용(영영 안 채워지는 일 방지).
      const overflowFree = (si: number) => {
        const f = free(si)
        const notOnly = f.filter(i => !SEASON_POOLS[si][i].inSeasonOnly)
        return notOnly.length > 0 ? notOnly : f
      }
      const nextSeason = [1, 2, 3].map(k => (home + k) % SEASON_POOLS.length).find(si => free(si).length > 0)
      if (nextSeason !== undefined) {
        const f = overflowFree(nextSeason)
        s = nextSeason
        idx = f[h % f.length]
      } else {
        idx = h % SEASON_POOLS[home].length
      }
    }
    const key = `${s}:${idx}`
    const prev = collected.get(key)
    collected.set(key, prev ? { ...prev, count: prev.count + 1 } : { count: 1, firstDate: date })
    hits.push({ ...SEASON_POOLS[s][idx], date, key })
  }
  return { collected, hits }
}

function StagePath({ stageIdx }: { stageIdx: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((s, i) => (
        <div key={s.label} className="flex items-center gap-0.5">
          {i > 0 && <span className={`w-2 h-px ${i <= stageIdx ? 'bg-[#5B54C4]' : 'bg-[#E0DFDB]'}`} />}
          <span
            title={i <= stageIdx ? s.label : `${s.label} (누적 ${s.min}회)`}
            className={`text-[15px] leading-none ${i <= stageIdx ? '' : 'opacity-25 grayscale'}`}
          >
            {s.emoji}
          </span>
        </div>
      ))}
    </div>
  )
}

function SeasonCollection({ collected, latestKey }: { collected: Map<string, Collected>; latestKey: string | null }) {
  const [open, setOpen] = useState(false)
  const themeOff = useSeasonThemeOff()
  const n = collected.size
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-[#9C9C96]">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center justify-between hover:text-[#5B54C4]">
          <span className="flex items-center gap-1.5">
            <span>🎒 계절 도감</span>
            <span className="font-semibold text-[#4A4A46]">{n}/{TOTAL_COLLECTIBLES}</span>
            <span className="inline-block w-16 h-1.5 bg-[#F0EFEC] rounded-full overflow-hidden">
              <span className="block h-full bg-[#5B54C4]" style={{ width: `${(n / TOTAL_COLLECTIBLES) * 100}%` }} />
            </span>
          </span>
          <span>{open ? '접기 ▴' : '펼치기 ▾'}</span>
        </button>
      </div>
      {open && (
        <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[#B0B0AA]">
          <span>지금 채우는 계절을 모을수록 상단 메뉴줄이 그 계절 풍경으로 바뀌어요</span>
          <button
            onClick={() => setSeasonThemeOff(!themeOff)}
            className="flex-shrink-0 ml-2 underline underline-offset-2 hover:text-[#5B54C4]"
          >
            {themeOff ? '테마 켜기' : '테마 끄기'}
          </button>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-1">
          {SEASON_POOLS.map((pool, s) => (
            <div key={s} className="flex items-center gap-1">
              <span className="w-10 text-[10.5px] text-[#B0B0AA] flex-shrink-0 whitespace-nowrap" title={pool.every((_, i) => collected.has(`${s}:${i}`)) ? `${SEASON_NAMES[s]} 완성` : undefined}>
                {SEASON_NAMES[s]}{pool.every((_, i) => collected.has(`${s}:${i}`)) ? '🏅' : ''}
              </span>
              <div className="grid grid-cols-6 gap-1 flex-1">
                {pool.map((item, i) => {
                  const key = `${s}:${i}`
                  const c = collected.get(key)
                  return (
                    <div
                      key={key}
                      title={c ? `${item.label} · ${c.firstDate}${c.count > 1 ? ` · ×${c.count}` : ''}` : '아직 못 모음'}
                      className={`relative flex items-center justify-center h-7 rounded-lg border text-[14px] ${
                        c
                          ? key === latestKey ? 'border-[#5B54C4] bg-[#EEF1FE]' : 'border-[#E8E8E4] bg-[#F7F7F5]'
                          : 'border-dashed border-[#E8E8E4] bg-white text-[11px] text-[#D0D0CA]'
                      }`}
                    >
                      {c ? item.emoji : '?'}
                      {c && c.count > 1 && (
                        <span className="absolute -top-1.5 -right-1.5 text-[9px] font-semibold bg-[#5B54C4] text-white rounded-full px-1 leading-[14px]">
                          ×{c.count}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeamTree() {
  // 단계 간격(팀원 수 × 영업일)은 등록된 팀원 전체 기준 — 입사 예정자 제외 명단을 쓰면 인원이 바뀔 때마다 계절 단계가 다시 계산돼 튄다.
  const { members, loaded: membersLoaded } = useAllMembers()
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
      const { data: dateData } = await rpcTodayDate()
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
    const dates: { date: string; salt: number }[] = []
    for (let n = MAX_STAGE_THRESHOLD + interval; n <= sorted.length; n += interval) {
      dates.push({ date: sorted[n - 1].watered_date, salt: n })
    }
    return dates
  }, [waterRows, interval])
  const { collected, hits } = useMemo(() => assignEvents(events), [events])

  // 상단 메뉴줄 계절 풍경에 "지금 채우고 있는 계절"(가장 최근 이벤트가 들어간 계절)의 도감 상태를 알린다.
  // 날짜 기준이 아니라 이 기준인 이유: 가을이 다 차서 11월에 겨울 칸을 채우기 시작하면 메뉴줄도 바로 겨울로 넘어가야 팀 나무와 맞는다.
  useEffect(() => {
    const last = hits[hits.length - 1]
    if (!last) { publishSeasonTheme(null); return }
    const s = Number(last.key.split(':')[0])
    const order = [...new Set(hits.filter(h => h.key.startsWith(`${s}:`)).map(h => h.emoji))]
    publishSeasonTheme({ season: s, got: SEASON_POOLS[s].filter((_, i) => collected.has(`${s}:${i}`)).length, total: SEASON_POOLS[s].length, order })
  }, [hits, collected])

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
    ...hits.map(e => ({ emoji: e.emoji, label: e.label, date: e.date })),
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
        <p className="text-[14px] font-semibold text-[#1F1F1D]">🌳 팀 나무</p>
        {plantedAt && (
          <span className="text-[11px] text-[#B0B0AA]">
            {new Date(plantedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}에 심음
          </span>
        )}
      </div>

      {/* 좁은 칸(노트북 4칸 배치)에서는 물 주기 버튼이 아래 줄로 내려간다 — 옆에 붙여 두면 이름·횟수가 세로로 한 글자씩 쪼개졌다. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="text-[42px] leading-none flex-shrink-0" title={featured.label}>{featured.emoji}</div>
        <div className="flex-1 min-w-[150px]">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[15px] font-semibold text-[#1F1F1D] whitespace-nowrap">{featured.label}</span>
            <span className="text-[11.5px] text-[#9C9C96] whitespace-nowrap">누적 물주기 {total}회</span>
          </div>
          <div className="mt-2 h-2 bg-[#F0EFEC] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#5B54C4]" style={{ width: `${progressPct}%`, transition: 'width .35s' }} />
          </div>
          <p className="text-[10.5px] text-[#B0B0AA] mt-1">{subtext}</p>
        </div>
        <button
          onClick={water}
          disabled={!me || busy || iHaveWatered}
          className={`flex-shrink-0 whitespace-nowrap text-[13px] font-medium rounded-full px-4 py-2.5 transition-colors ${
            iHaveWatered
              ? 'bg-[#EEF1FE] text-[#5B54C4] cursor-default'
              : 'bg-[#5B54C4] text-white hover:bg-[#4A44A8] disabled:opacity-40'
          }`}
        >
          {iHaveWatered ? '오늘 물 줬어요 ✅' : '물 주기 💧'}
        </button>
      </div>

      {/* 거목 전에는 성장 단계 길, 거목 이후에는 지금 채우는 계절 6칸(모은 것은 선명하게, 남은 것은 흐리게 미리보기) */}
      {stageIdx === STAGES.length - 1 && hits.length > 0 ? (
        (() => {
          const s = Number(hits[hits.length - 1].key.split(':')[0])
          const got = SEASON_POOLS[s].filter((_, i) => collected.has(`${s}:${i}`)).length
          return (
            <div className="mt-3 pt-3 border-t border-[#E8E8E4] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#9C9C96] whitespace-nowrap">
                {SEASON_NAMES[s]} <span className="font-semibold text-[#4A4A46]">{got}/{SEASON_POOLS[s].length}</span>
              </span>
              <div className="flex items-center gap-1">
                {SEASON_POOLS[s].map((p, i) => {
                  const have = collected.has(`${s}:${i}`)
                  return (
                    <span
                      key={i}
                      title={have ? p.label : `${p.label} (아직 못 모음${p.inSeasonOnly ? ' · 제철에만' : ''})`}
                      className={`text-[15px] leading-none ${have ? '' : 'opacity-25 grayscale'}`}
                    >
                      {p.emoji}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })()
      ) : (
        <div className="mt-3 pt-3 border-t border-[#E8E8E4] flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#9C9C96]">성장 단계</span>
          <StagePath stageIdx={stageIdx} />
        </div>
      )}
      {stageIdx === STAGES.length - 1 && (
        <SeasonCollection collected={collected} latestKey={hits[hits.length - 1]?.key ?? null} />
      )}

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
