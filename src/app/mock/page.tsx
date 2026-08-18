'use client'

import { useState } from 'react'
import {
  WEATHER_OPTIONS, LOTTERY_MOOD_OPTIONS, LOTTERY_PRESETS,
  type Weather, type LotteryMood, type LotteryPreset,
} from '@/lib/data'

const MOCK_MEMBERS = [
  { id: '1', name: '김진일' },
  { id: '2', name: '박주현' },
  { id: '3', name: '이민지' },
  { id: '4', name: '최다혜' },
]

type Votes = Record<string, LotteryMood>

function seededPick<T>(arr: T[], seed: string): T {
  const n = seed.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return arr[n % arr.length]
}

function getDominantMood(votes: Votes): LotteryMood {
  const counts: Record<string, number> = {}
  for (const m of Object.values(votes)) counts[m] = (counts[m] ?? 0) + 1
  const entries = Object.entries(counts)
  if (entries.length === 0) return 'neutral'
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0] as LotteryMood
}

function pickResult(weather: Weather, votes: Votes): LotteryPreset {
  const mood = getDominantMood(votes)
  const exact = LOTTERY_PRESETS.filter(p => p.moods.includes(mood) && p.weathers.includes(weather))
  const byMood = LOTTERY_PRESETS.filter(p => p.moods.includes(mood))
  const pool = exact.length > 0 ? exact : byMood.length > 0 ? byMood : LOTTERY_PRESETS
  return seededPick(pool, '2026-08-17')
}

export default function MockPage() {
  const [weather, setWeather] = useState<Weather>('clear')
  const [votes, setVotes] = useState<Votes>({ '1': 'tired' })
  const myId = '1'

  function toggleMood(mood: LotteryMood) {
    setVotes(prev =>
      prev[myId] === mood
        ? (({ [myId]: _, ...rest }) => rest)(prev)
        : { ...prev, [myId]: mood }
    )
  }

  function toggleMember(id: string, mood: LotteryMood = 'tired') {
    if (id === myId) return
    setVotes(prev =>
      prev[id]
        ? (({ [id]: _, ...rest }) => rest)(prev)
        : { ...prev, [id]: mood }
    )
  }

  const participated = MOCK_MEMBERS.filter(m => votes[m.id])
  const ratio = participated.length / MOCK_MEMBERS.length
  const isRevealed = ratio >= 1
  const blurPx = isRevealed ? 0 : Math.max(3, Math.round(18 * (1 - ratio)))
  const result = pickResult(weather, votes)
  const myMood = votes[myId] ?? null

  return (
    <div className="min-h-screen bg-[#F7F7F5] p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-[12px] text-[#9C9C96]">목업 — 다른 멤버 이름 클릭으로 참여 토글</p>

        <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[#1F1F1D]">🎴 오늘의 팀 운세</span>
              <span className="text-[12px] text-[#9C9C96]">
                {isRevealed ? '전원 참여 완료 🎉' : `${participated.length}/${MOCK_MEMBERS.length}명 참여해야 공개`}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              {WEATHER_OPTIONS.map(w => (
                <button
                  key={w.key}
                  onClick={() => setWeather(w.key)}
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
            {/* 기분 선택 + 참여 현황 */}
            <div className="flex flex-col gap-3 sm:w-52 flex-shrink-0">
              <div>
                <p className="text-[11px] text-[#9C9C96] mb-1.5">내 기분 <span className="text-[#E8614D]">*필수</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {LOTTERY_MOOD_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => toggleMood(opt.key)}
                      className={`text-[12px] px-2.5 py-1 rounded-full transition-colors ${
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
                {MOCK_MEMBERS.map(m => {
                  const voted = !!votes[m.id]
                  const moodLabel = LOTTERY_MOOD_OPTIONS.find(o => o.key === votes[m.id])?.label
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMember(m.id, 'tired')}
                      className="flex items-center gap-1.5 text-left"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${voted ? 'bg-[#5B54C4]' : 'bg-[#E8E8E4]'}`} />
                      <span className={`text-[12px] ${voted ? 'text-[#1F1F1D]' : 'text-[#B0B0AB]'}`}>{m.name}</span>
                      {voted && moodLabel && <span className="text-[10px] text-[#9C9C96]">{moodLabel}</span>}
                      {m.id !== myId && (
                        <span className="text-[10px] text-[#D0D0CB] ml-auto">{voted ? '클릭해제' : '클릭참여'}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 블러 결과 */}
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
          </div>
        </div>

        <p className="text-[12px] text-[#9C9C96] text-center">블러 {blurPx}px · 참여 {Math.round(ratio * 100)}% · 우세기분: {getDominantMood(votes)}</p>
      </div>
    </div>
  )
}
