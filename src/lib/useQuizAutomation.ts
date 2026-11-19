'use client'

// 연상퀴즈가 한 사람 때문에 하루 종일 멈추던 문제(2026-11-19) — 대시보드를 켜 둔 아무 팀원의 화면이
// 대신 진행을 챙긴다. 모든 수정은 "지금 상태가 내가 본 그대로일 때만" 바꾸는 조건부 update라서
// 여러 화면이 동시에 시도해도 한 번만 반영된다.
//  1) 차례 대기 제한: 내 차례가 오고 TURN_WAIT_MIN분 동안 시작을 안 누르면 다음 사람에게 넘긴다.
//     (그리기는 앞 그림을 그대로 넘기고, 정답자는 '(시간 초과)'로 판을 끝낸다. 넘긴 사람은 skipped에 남는다)
//  2) 평일 AUTO_START_HOUR시 자동 시작: 그날 판이 아직 없으면 재직 팀원 전원으로 순서·단어를 뽑아 시작한다.
// 기준 시각(turn_since·started_at)은 서버 트리거가 찍는다 — supabase/add_quiz_history.sql

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuizGameStatus, type QuizGameStatus } from '@/lib/useQuizGameStatus'

export const TURN_WAIT_MIN = 60
const AUTO_START_HOUR = 10
const REVEAL_KEEP_MIN = 10 // 결과 화면은 최소 이만큼 보여 준 뒤에 자동 시작

function seoulParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday as string }
}

function blankCanvasDataUrl() {
  const c = document.createElement('canvas'); c.width = 800; c.height = 533
  const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

// 단어 목록은 게임과 같은 /quiz-words.js 를 한 번만 불러 쓴다.
let wordsPromise: Promise<string[]> | null = null
function loadWords(): Promise<string[]> {
  const w = window as unknown as { QUIZ_WORDS?: string[] }
  if (w.QUIZ_WORDS?.length) return Promise.resolve(w.QUIZ_WORDS)
  if (!wordsPromise) {
    wordsPromise = new Promise(resolve => {
      const el = document.createElement('script')
      el.src = '/quiz-words.js'
      el.onload = () => resolve(w.QUIZ_WORDS ?? [])
      el.onerror = () => { wordsPromise = null; resolve([]) }
      document.head.appendChild(el)
    })
  }
  return wordsPromise
}

export function minutesSince(iso: string | null | undefined) {
  return iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 0
}

async function skipStalledTurn(g: QuizGameStatus) {
  const supabase = createClient()
  const now = new Date().toISOString()
  if (g.status === 'drawing') {
    const drawings = g.drawings || []
    const carry = drawings.length ? drawings[drawings.length - 1] : blankCanvasDataUrl()
    const next = g.round + 1
    const last = next >= (g.drawers || []).length
    await supabase.from('quiz_game').update({
      drawings: [...drawings, carry], round: next, status: last ? 'guessing' : 'drawing', phase_deadline: null,
      skipped: [...(g.skipped || []), (g.drawers || [])[g.round]].filter(Boolean), updated_at: now,
    }).eq('id', 'main').eq('status', 'drawing').eq('round', g.round).is('phase_deadline', null)
  } else if (g.status === 'guessing') {
    await supabase.from('quiz_game').update({
      status: 'reveal', guess: '(시간 초과)', correct: false, phase_deadline: null,
      last_word: g.word, last_drawers: g.drawers, last_guesser: g.guesser, last_guess: '(시간 초과)', last_correct: false,
      last_drawings: g.drawings, skipped: [...(g.skipped || []), g.guesser].filter(Boolean), updated_at: now,
    }).eq('id', 'main').eq('status', 'guessing').is('phase_deadline', null)
  }
}

async function autoStart(g: QuizGameStatus, members: string[]) {
  const words = await loadWords()
  if (!words.length || members.length < 2) return
  const supabase = createClient()
  const { data: meta } = await supabase.from('quiz_meta').select('used_words').eq('id', 'main').maybeSingle()
  const used = new Set<string>((meta?.used_words as string[] | undefined) ?? [])
  let pool = words.filter(w => !used.has(w)); if (!pool.length) pool = words
  const word = pool[Math.floor(Math.random() * pool.length)]
  const order = shuffle(members)
  const { data } = await supabase.from('quiz_game').update({
    status: 'drawing', present_members: members, guesser: order[order.length - 1], drawers: order.slice(0, -1), word, round: 0,
    drawings: [], guess: null, correct: null, phase_deadline: null, started_by: '자동 시작', updated_at: new Date().toISOString(),
  }).eq('id', 'main').eq('status', g.status).select('id')
  if (!data?.length) return // 다른 화면이 먼저 시작함
  let nextUsed = [...used, word]; if (nextUsed.length >= words.length) nextUsed = [word]
  await supabase.from('quiz_meta').update({ used_words: nextUsed, updated_at: new Date().toISOString() }).eq('id', 'main')
}

export function useQuizAutomation(memberNames: string[], enabled: boolean) {
  const row = useQuizGameStatus()
  const rowRef = useRef(row)
  const namesRef = useRef(memberNames)
  const busy = useRef(false)
  useEffect(() => { rowRef.current = row; namesRef.current = memberNames })

  useEffect(() => {
    if (!enabled) return
    const check = async () => {
      const g = rowRef.current
      if (!g || busy.current) return
      busy.current = true
      try {
        if ((g.status === 'drawing' || g.status === 'guessing') && !g.phase_deadline && minutesSince(g.turn_since) >= TURN_WAIT_MIN) {
          await skipStalledTurn(g)
          return
        }
        const kst = seoulParts()
        const weekday = kst.weekday !== 'Sat' && kst.weekday !== 'Sun'
        const startedToday = g.started_at ? seoulParts(new Date(g.started_at)).date === kst.date : false
        const idle = g.status === 'setup' || (g.status === 'reveal' && minutesSince(g.turn_since) >= REVEAL_KEEP_MIN)
        if (weekday && kst.hour >= AUTO_START_HOUR && !startedToday && idle) await autoStart(g, namesRef.current)
      } catch { /* 다음 확인 때 다시 시도 */ } finally { busy.current = false }
    }
    void check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [enabled, row])
}
