'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import {
  WEATHER_OPTIONS, LOTTERY_MOOD_OPTIONS, LOTTERY_PRESETS,
  type Weather, type LotteryMood, type LotteryPreset,
} from '@/lib/data'
import { ganzhiIndexOf, ganzhiNameOf, GANZHI_FORTUNES } from '@/lib/ganzhi'

type MoodEntry = { member_id: string; mood: LotteryMood }
type LotteryVotes = Record<string, LotteryMood>

function seededPick<T>(arr: T[], seed: string): T {
  const n = seed.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return arr[n % arr.length]
}

function getDominantMood(votes: LotteryVotes): LotteryMood {
  const counts: Record<string, number> = {}
  for (const m of Object.values(votes)) counts[m] = (counts[m] ?? 0) + 1
  const entries = Object.entries(counts)
  if (entries.length === 0) return 'neutral'
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0] as LotteryMood
}

function pickResult(weather: Weather, votes: LotteryVotes, dateStr: string): LotteryPreset {
  const mood = getDominantMood(votes)
  const exact = LOTTERY_PRESETS.filter(p => p.moods.includes(mood) && p.weathers.includes(weather))
  const byMood = LOTTERY_PRESETS.filter(p => p.moods.includes(mood))
  const pool = exact.length > 0 ? exact : byMood.length > 0 ? byMood : LOTTERY_PRESETS
  return seededPick(pool, dateStr)
}

export default function TeamLottery() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [weather, setWeather] = useState<Weather>('clear')
  const [votes, setVotes] = useState<LotteryVotes>({})
  const [absentIds, setAbsentIds] = useState<string[]>([])
  const todayRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const dateStr = dateData as string | null
      if (!dateStr) return
      todayRef.current = dateStr

      const { data: dayData } = await supabase
        .from('day_state')
        .select('weather, lottery_moods, absent_ids')
        .eq('date', dateStr)
        .maybeSingle()

      if (!active) return
      setToday(dateStr)
      if (dayData?.weather) setWeather(dayData.weather as Weather)
      const entries: MoodEntry[] = Array.isArray((dayData as Record<string,unknown> | null)?.lottery_moods)
        ? (dayData as Record<string,unknown>).lottery_moods as MoodEntry[]
        : []
      const voteMap: LotteryVotes = {}
      for (const e of entries) voteMap[e.member_id] = e.mood
      setVotes(voteMap)
      if (Array.isArray((dayData as Record<string,unknown> | null)?.absent_ids)) {
        setAbsentIds((dayData as Record<string,unknown>).absent_ids as string[])
      }
    })()

    const channel = supabase
      .channel('team-lottery')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        const row = payload.new as Record<string, unknown> | undefined
        if (!row || row.date !== todayRef.current) return
        if (row.weather) setWeather(row.weather as Weather)
        if (Array.isArray(row.lottery_moods)) {
          const voteMap: LotteryVotes = {}
          for (const e of row.lottery_moods as MoodEntry[]) voteMap[e.member_id] = e.mood
          setVotes(voteMap)
        }
        if (Array.isArray(row.absent_ids)) setAbsentIds(row.absent_ids as string[])
      })
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  async function changeWeather(key: Weather) {
    if (!today) return
    const supabase = createClient()
    await supabase.from('day_state').upsert({ date: today, weather: key, weather_by: me?.id ?? null })
    setWeather(key)
  }

  async function selectMood(mood: LotteryMood) {
    if (!me || !today) return
    const supabase = createClient()

    // 현재 배열을 읽어서 내 항목만 교체/제거
    const { data: row } = await supabase
      .from('day_state')
      .select('lottery_moods')
      .eq('date', today)
      .maybeSingle()

    const existing: MoodEntry[] = Array.isArray((row as Record<string,unknown> | null)?.lottery_moods)
      ? (row as Record<string,unknown>).lottery_moods as MoodEntry[]
      : []
    const filtered = existing.filter(e => e.member_id !== me.id)

    if (votes[me.id] === mood) {
      // 같은 거 다시 누르면 취소
      await supabase.from('day_state').upsert({ date: today, lottery_moods: filtered })
      setVotes(prev => { const n = { ...prev }; delete n[me.id]; return n })
    } else {
      const updated = [...filtered, { member_id: me.id, mood }]
      await supabase.from('day_state').upsert({ date: today, lottery_moods: updated })
      setVotes(prev => ({ ...prev, [me.id]: mood }))
    }
  }

  async function toggleAbsent(memberId: string) {
    if (!today) return
    const supabase = createClient()
    const next = absentIds.includes(memberId)
      ? absentIds.filter(id => id !== memberId)
      : [...absentIds, memberId]
    await supabase.from('day_state').upsert({ date: today, absent_ids: next })
    setAbsentIds(next)
  }

  const activeMembers = useMemo(
    () => members.filter(m => !absentIds.includes(m.id)),
    [members, absentIds]
  )
  const participated = useMemo(
    () => activeMembers.filter(m => votes[m.id]),
    [activeMembers, votes]
  )
  const ratio = activeMembers.length > 0 ? participated.length / activeMembers.length : 0
  const isRevealed = ratio >= 1 && activeMembers.length > 0
  const blurPx = isRevealed ? 0 : Math.max(3, Math.round(18 * (1 - ratio)))

  const result = useMemo(
    () => (today ? pickResult(weather, votes, today) : LOTTERY_PRESETS[0]),
    [weather, votes, today]
  )

  // 사자성어 카드와 달리 기분 투표와 무관하게, 만세력 60갑자(일진)로 정해진다 — 팀 전체가
  // 그날은 항상 같은 걸 본다. 60일 주기로 정확히 반복되는 정통 계산이라(날짜 해시가 아니다)
  // "대충 지어낸 로테이션"이 아니라 실제 만세력 체계 그대로다.
  const ganzhiIdx = useMemo(() => (today ? ganzhiIndexOf(today) : 0), [today])
  const dailyFortune = GANZHI_FORTUNES[ganzhiIdx]
  const ganzhiName = ganzhiNameOf(ganzhiIdx)

  const myMood = me ? (votes[me.id] ?? null) : null

  if (!membersLoaded) return null

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[#1F1F1D]">🎴 오늘의 팀 운세</span>
          <span className="text-[12px] text-[#9C9C96]">
            {isRevealed
              ? '전원 참여 완료 🎉'
              : activeMembers.length < members.length
                ? `${participated.length}/${activeMembers.length}명 참여해야 공개 (연차 ${members.length - activeMembers.length}명 제외)`
                : `${participated.length}/${activeMembers.length}명 참여해야 공개`}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {WEATHER_OPTIONS.map(w => (
            <button
              key={w.key}
              onClick={() => changeWeather(w.key)}
              title={w.label}
              className={`text-[13px] px-2 py-1 rounded-full transition-colors ${
                weather === w.key ? 'bg-[#5B54C4] text-white' : 'text-[#6B6B66] hover:bg-[#F7F7F5]'
              }`}
            >
              {w.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex flex-col gap-3 sm:w-52 flex-shrink-0">
          <div>
            <p className="text-[11px] text-[#9C9C96] mb-1.5">내 기분 <span className="text-[#E8614D]">*필수</span></p>
            <div className="flex flex-wrap gap-1.5">
              {LOTTERY_MOOD_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => selectMood(opt.key)}
                  disabled={!me}
                  className={`text-[12px] px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 ${
                    myMood === opt.key
                      ? 'bg-[#5B54C4] text-white'
                      : 'bg-[#F7F7F5] text-[#6B6B66] hover:bg-[#EEEDFE]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {members.map(m => {
              const isAbsent = absentIds.includes(m.id)
              const voted = !isAbsent && !!votes[m.id]
              const moodLabel = LOTTERY_MOOD_OPTIONS.find(o => o.key === votes[m.id])?.label
              return (
                <div key={m.id} className="flex items-center gap-1.5 group">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isAbsent ? 'bg-[#E8E8E4]' : voted ? 'bg-[#5B54C4]' : 'bg-[#E8E8E4]'}`} />
                  <span className={`text-[12px] ${isAbsent ? 'text-[#C4C4BC] line-through' : voted ? 'text-[#1F1F1D]' : 'text-[#B0B0AB]'}`}>{m.name}</span>
                  {isAbsent
                    ? <span className="text-[10px] text-[#B45309] bg-[#FEF3C7] rounded px-1">연차</span>
                    : voted && moodLabel && <span className="text-[10px] text-[#9C9C96]">{moodLabel}</span>}
                  <button
                    onClick={() => toggleAbsent(m.id)}
                    className="ml-auto text-[10px] text-[#D0D0CB] hover:text-[#9C9C96] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {isAbsent ? '복귀' : '연차'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl bg-gradient-to-br from-[#EEEDFE] to-[#F3F2FF] py-6 px-6 min-h-[130px] flex items-center">
          <div
            className="w-full"
            style={{ filter: `blur(${blurPx}px)`, transition: 'filter 1.2s ease', userSelect: 'none' }}
          >
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[30px] font-bold text-[#1F1F1D] tracking-widest">{result.phrase}</span>
              <span className="text-[13px] text-[#5B54C4] font-medium">{result.hanja}</span>
            </div>
            <p className="text-[13px] text-[#4B4B46] leading-relaxed">{result.sub}</p>
          </div>
        </div>

        {/* 오늘의 운세 — 기분 투표와 무관하게 날짜만으로 정해져서 블러 없이 바로 보인다 */}
        <div className="flex-1 rounded-xl bg-gradient-to-br from-[#FFF7E6] to-[#FFFBF0] py-6 px-6 min-h-[130px] flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-[11px] font-medium text-[#B8860B]">🔮 오늘의 운세</p>
            <span className="text-[10px] text-[#C9A227] bg-white/60 rounded-full px-1.5 py-0.5">{ganzhiName}일</span>
          </div>
          <p className="text-[13.5px] text-[#4B4B46] leading-relaxed mb-3">{dailyFortune.general}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6B6B66] mb-2">
            <span>행운의 색 <b className="text-[#1F1F1D] font-medium">{dailyFortune.color}</b></span>
            <span>행운의 아이템 <b className="text-[#1F1F1D] font-medium">{dailyFortune.item}</b></span>
          </div>
          <p className="text-[12px] text-[#9C7A1E]">💡 {dailyFortune.advice}</p>
        </div>
      </div>
    </div>
  )
}
