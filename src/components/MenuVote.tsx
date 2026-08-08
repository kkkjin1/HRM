'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { MENU_CATALOG, WEATHER_OPTIONS, MOOD_OPTIONS, MOOD_NONE, type Weather, type Mood } from '@/lib/data'

const MOOD_FACTOR = Number(process.env.NEXT_PUBLIC_MOOD_FACTOR ?? 1.3)

type Votes = Record<string, Mood>

function computeRanking(weather: Weather, votes: Votes) {
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
  return scored.slice(0, 4)
}

export default function MenuVote() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [weather, setWeather] = useState<Weather>('clear')
  const [weatherBy, setWeatherBy] = useState<string | null>(null)
  const [finalMenu, setFinalMenu] = useState<string | null>(null)
  const [votes, setVotes] = useState<Votes>({})
  const [loaded, setLoaded] = useState(false)
  const [badges, setBadges] = useState<Record<string, string>>({})
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
        supabase.from('day_state').select('weather, weather_by, final_menu').eq('date', dateStr).maybeSingle(),
        supabase.from('menu_vote').select('member_id, mood').eq('date', dateStr),
      ])
      if (!active) return
      setToday(dateStr)
      if (dayRes.data) {
        setWeather((dayRes.data.weather as Weather) ?? 'clear')
        setWeatherBy(dayRes.data.weather_by)
        setFinalMenu(dayRes.data.final_menu)
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
        const row = payload.new as { date: string; weather: Weather; weather_by: string | null; final_menu: string | null } | undefined
        if (!row || row.date !== todayRef.current) return
        setWeather(row.weather)
        setWeatherBy(row.weather_by)
        setFinalMenu(row.final_menu)
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  const ranking = useMemo(() => computeRanking(weather, votes), [weather, votes])

  useEffect(() => {
    const newTop = ranking.map(r => r.item.name)
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
  }, [ranking])

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

  async function spinTop1() {
    if (!today || ranking.length === 0) return
    const supabase = createClient()
    await supabase.from('day_state').upsert({ date: today, final_menu: ranking[0].item.name })
    setFinalMenu(ranking[0].item.name)
    document.getElementById('fun-roulette')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const maxScore = ranking[0]?.score || 1

  if (!loaded || !membersLoaded) return <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5"><p className="text-[13px] text-[#9C9C96]">불러오는 중...</p></div>

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <p className="text-[12px] text-[#9C9C96] mb-3">메뉴 투표</p>

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
        {ranking.map((r, idx) => (
          <div key={r.item.name} className="flex items-center gap-2">
            <span className="text-[12px] text-[#9C9C96] w-4 flex-shrink-0">{idx + 1}</span>
            <span className="text-[13px] text-[#1F1F1D] w-20 flex-shrink-0 truncate">{r.item.icon} {r.item.name}</span>
            <div className="flex-1 h-2 bg-[#F7F7F5] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#5B54C4]"
                style={{ width: `${(r.score / maxScore) * 100}%`, transition: 'width .35s' }}
              />
            </div>
            {badges[r.item.name] && (
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

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E8E8E4]">
        {finalMenu ? (
          <p className="text-[12.5px] text-[#6B6B66]">오늘의 최종 메뉴: <span className="text-[#1F1F1D] font-medium">{finalMenu}</span></p>
        ) : <span />}
        <button
          onClick={spinTop1}
          disabled={ranking.length === 0}
          className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] rounded-lg px-3.5 py-2"
        >
          1순위로 룰렛 돌리기 ↓
        </button>
      </div>
    </div>
  )
}
