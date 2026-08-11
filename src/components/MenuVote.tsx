'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { MENU_CATALOG, WEATHER_OPTIONS, MOOD_OPTIONS, MOOD_NONE, type Weather, type Mood } from '@/lib/data'
import LadderPopup, { type LadderCandidate } from '@/components/LadderPopup'
import ClickableAvatar from '@/components/ClickableAvatar'

const MOOD_FACTOR = Number(process.env.NEXT_PUBLIC_MOOD_FACTOR ?? 1.3)
const TOP_N = 4

type Votes = Record<string, Mood>
type Scored = { item: (typeof MENU_CATALOG)[number]; score: number }

function scoreAllMenus(weather: Weather, votes: Votes): Scored[] {
  const moods = Object.values(votes)
  const totalVotes = moods.filter(m => m !== 'none').length
  const moodCount: Record<string, number> = {}
  for (const m of moods) if (m !== 'none') moodCount[m] = (moodCount[m] ?? 0) + 1

  const scored = MENU_CATALOG.map(item => {
    let score = item.w[weather]
    if (totalVotes > 0) {
      for (const opt of MOOD_OPTIONS) {
        const ratio = (moodCount[opt.key] ?? 0) / totalVotes
        score += ratio * item.m[opt.key] * MOOD_FACTOR
      }
    }
    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored
}

// 가중치(점수) 기반 비복원 추출 — 새로고침으로 "다른 추천"을 보여줄 때 쓴다.
function weightedSample(scored: Scored[], n: number): Scored[] {
  const pool = [...scored]
  const picked: Scored[] = []
  for (let k = 0; k < n && pool.length > 0; k++) {
    const total = pool.reduce((sum, s) => sum + Math.max(s.score, 0.01), 0)
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(pool[i].score, 0.01)
      if (r <= 0) { idx = i; break }
    }
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked.sort((a, b) => b.score - a.score)
}

export default function MenuVote() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [weather, setWeather] = useState<Weather>('clear')
  const [weatherBy, setWeatherBy] = useState<string | null>(null)
  const [votes, setVotes] = useState<Votes>({})
  const [loaded, setLoaded] = useState(false)
  const [badges, setBadges] = useState<Record<string, string>>({})
  const [shuffleClick, setShuffleClick] = useState<{ weather: Weather; votes: Votes; sample: Scored[] } | null>(null)
  const [ladder, setLadder] = useState<{ candidates: LadderCandidate[]; winner: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const todayRef = useRef<string | null>(null)
  const prevTopRef = useRef<string[]>([])
  const initializedRef = useRef(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const dateStr = dateData as string | null
      if (!dateStr) return
      todayRef.current = dateStr

      const [dayRes, votesRes] = await Promise.all([
        supabase.from('day_state').select('weather, weather_by').eq('date', dateStr).maybeSingle(),
        supabase.from('menu_vote').select('member_id, mood').eq('date', dateStr),
      ])
      if (!active) return
      setToday(dateStr)
      if (dayRes.data) {
        setWeather((dayRes.data.weather as Weather) ?? 'clear')
        setWeatherBy(dayRes.data.weather_by)
      }
      const voteMap: Votes = {}
      for (const v of votesRes.data ?? []) voteMap[v.member_id] = v.mood as Mood
      setVotes(voteMap)
      setLoaded(true)
    })()

    const channel = supabase
      .channel('fun-menu-vote')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_vote' }, payload => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { date: string; member_id: string }
          if (old.date !== todayRef.current) return
          setVotes(prev => { const next = { ...prev }; delete next[old.member_id]; return next })
        } else {
          const row = payload.new as { date: string; member_id: string; mood: Mood }
          if (row.date !== todayRef.current) return
          setVotes(prev => ({ ...prev, [row.member_id]: row.mood }))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        const row = payload.new as { date: string; weather: Weather; weather_by: string | null } | undefined
        if (!row || row.date !== todayRef.current) return
        setWeather(row.weather)
        setWeatherBy(row.weather_by)
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  const trueRanking = useMemo(() => scoreAllMenus(weather, votes).slice(0, TOP_N), [weather, votes])
  // 셔플 결과는 그걸 뽑았던 시점의 weather/votes 참조와 지금 것이 같을 때만 유효하다.
  // 투표나 날씨가 바뀌면(= votes/weather 참조가 바뀌면) 자동으로 최신 순위로 되돌아간다.
  const shuffled = shuffleClick && shuffleClick.weather === weather && shuffleClick.votes === votes ? shuffleClick.sample : null
  const displayedRanking = shuffled ?? trueRanking

  useEffect(() => {
    const newTop = trueRanking.map(r => r.item.name)
    if (!initializedRef.current) {
      initializedRef.current = true
      prevTopRef.current = newTop
      return
    }
    const prev = prevTopRef.current
    const next: Record<string, string> = {}
    newTop.forEach((name, idx) => {
      const prevIdx = prev.indexOf(name)
      if (prevIdx === -1) next[name] = 'new'
      else if (prevIdx !== idx) next[name] = prevIdx > idx ? `▲${prevIdx - idx}` : `▼${idx - prevIdx}`
    })
    setBadges(next)
    prevTopRef.current = newTop
  }, [trueRanking])

  function nameOf(id: string | null) {
    return members.find(m => m.id === id)?.name ?? ''
  }

  async function changeWeather(key: Weather) {
    if (!today) return
    const supabase = createClient()
    await supabase.from('day_state').upsert({ date: today, weather: key, weather_by: me?.id ?? null })
    setWeather(key)
    setWeatherBy(me?.id ?? null)
  }

  async function selectMood(mood: Mood) {
    if (!me || !today) return
    const supabase = createClient()
    if (votes[me.id] === mood) {
      await supabase.from('menu_vote').delete().eq('date', today).eq('member_id', me.id)
      setVotes(prev => { const next = { ...prev }; delete next[me.id]; return next })
    } else {
      await supabase.from('menu_vote').upsert({ date: today, member_id: me.id, mood })
      setVotes(prev => ({ ...prev, [me.id]: mood }))
    }
  }

  function refreshRecommendations() {
    const all = scoreAllMenus(weather, votes)
    setShuffleClick({ weather, votes, sample: weightedSample(all, TOP_N) })
  }

  async function openLadder() {
    if (!today || busy || displayedRanking.length === 0) return
    setBusy(true)
    const supabase = createClient()
    const names = displayedRanking.map(r => r.item.name)
    const weights = displayedRanking.map(r => Math.max(r.score, 0.01))
    const { data: winner, error } = await supabase.rpc('pick_final_menu', { p_names: names, p_weights: weights })
    setBusy(false)
    if (error || !winner) return
    setLadder({
      candidates: displayedRanking.map(r => ({ name: r.item.name, icon: r.item.icon, score: r.score })),
      winner: winner as string,
    })
  }

  function closeLadder() {
    setLadder(null)
    document.getElementById('fun-roulette')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const maxScore = displayedRanking[0]?.score || 1

  if (!loaded || !membersLoaded) return <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5"><p className="text-[13px] text-[#9C9C96]">불러오는 중...</p></div>

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#9C9C96]">메뉴 투표</p>
        <button onClick={refreshRecommendations} className="text-[11.5px] text-[#6B6B66] hover:text-[#5B54C4]" title="다른 추천 보기">
          🔄 새로고침
        </button>
      </div>

      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {WEATHER_OPTIONS.map(w => (
          <button
            key={w.key}
            onClick={() => changeWeather(w.key)}
            className={`text-[12.5px] px-2.5 py-1.5 rounded-full transition-colors ${
              weather === w.key ? 'bg-[#5B54C4] text-white' : 'text-[#6B6B66] border border-[#E8E8E4] hover:bg-[#F7F7F5]'
            }`}
          >
            {w.icon} {w.label}
          </button>
        ))}
      </div>
      {weatherBy && <p className="text-[11px] text-[#9C9C96] mb-3">{nameOf(weatherBy)}님이 {WEATHER_OPTIONS.find(w => w.key === weather)?.label}으로 변경</p>}

      <div className="space-y-2 mb-4">
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-2 flex-wrap">
            <ClickableAvatar member={m} size={20} />
            <span className="text-[12px] text-[#6B6B66] w-14 flex-shrink-0 truncate">{m.name}</span>
            {[...MOOD_OPTIONS, MOOD_NONE].map(mo => {
              const active = votes[m.id] === mo.key
              const clickable = me?.id === m.id
              return (
                <button
                  key={mo.key}
                  onClick={() => clickable && selectMood(mo.key)}
                  disabled={!clickable}
                  className={`text-[11.5px] px-2 py-1 rounded-full border transition-colors ${
                    active ? 'bg-[#EEEDFE] border-[#5B54C4] text-[#5B54C4]' : 'border-[#E8E8E4] text-[#9C9C96]'
                  } ${clickable ? 'hover:bg-[#F7F7F5] cursor-pointer' : 'cursor-default'}`}
                >
                  {mo.label}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {displayedRanking.map((r, idx) => (
          <div key={r.item.name} className="flex items-center gap-2">
            <span className="text-[12px] text-[#9C9C96] w-4 flex-shrink-0">{idx + 1}</span>
            <span className="text-[13px] text-[#1F1F1D] w-20 flex-shrink-0 truncate">{r.item.icon} {r.item.name}</span>
            <div className="flex-1 h-2 bg-[#F7F7F5] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#5B54C4]"
                style={{ width: `${(r.score / maxScore) * 100}%`, transition: 'width .35s' }}
              />
            </div>
            {!shuffled && badges[r.item.name] && (
              <span
                className={`text-[10.5px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  badges[r.item.name] === 'new' ? 'bg-[#EAF3DE] text-[#173404]' :
                  badges[r.item.name].startsWith('▲') ? 'text-[#04342C] bg-[#E1F5EE]' : 'text-[#4B1528] bg-[#FBEAF0]'
                }`}
              >
                {badges[r.item.name]}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end mt-4 pt-3 border-t border-[#E8E8E4]">
        <button
          onClick={openLadder}
          disabled={displayedRanking.length === 0 || busy}
          className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-50 rounded-lg px-3.5 py-2"
        >
          사다리타기로 메뉴 뽑기 🪜
        </button>
      </div>

      {ladder && <LadderPopup candidates={ladder.candidates} winner={ladder.winner} onClose={closeLadder} />}
    </div>
  )
}
