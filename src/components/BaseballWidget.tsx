'use client'

// 비거리 야구 — 버튼을 누르면 화면 위에 뜨는 플로팅 위젯(드래그로 이동, ✕로 닫기).
// 개인전: 각자 자기 PC에서 3타석짜리 게임(1S1B까지 버팀, 2S 삼진·2B 볼넷, 주자·득점)을 치고,
// 결과(baseball_plays 1행)가 하루 라운드(서버 날짜 기준)로 모인다.
// 목록 화면 = 오늘 팀원별 상태 + 랭킹(오늘/누적) + (관리자만) 추가 게임 수, 플레이 화면 = 졸라맨 vs 피칭머신.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useAuthEmail, useBonus, useCareerPlays, usePraiseCounts, useTodayPlays } from '@/lib/useBaseball'
import { getServerOffset, kstDate } from '@/lib/serverClock'
import { DOODLE_PALETTE } from '@/lib/data'
import { displayName } from '@/lib/members'
import Avatar from '@/components/Avatar'
import {
  PA_PER_GAME, PITCH_TYPES, FENCE_M, STRIKES_FOR_OUT, BALLS_FOR_WALK, BASEBALL_ADMIN_EMAIL,
  careerStats, dailyAllowance, isHit, judgeSwing, outcomeLabel, paLabel, randomPitch, rankDay, simulateGame, tallySwings, travelMs,
  type GameState, type Pitch, type Play, type Slot, type Swing,
} from '@/lib/baseball'

const WINDUP_MS = 900
const LOOKING_GRACE_MS = 300 // 도착 후 이 시간 안에 안 치면 루킹/볼

// SVG 좌표 (viewBox 420x150). 기계를 오른쪽 끝에 멀리 둬서 구속·구종 차이가 궤적으로 보이게 한다.
const VIEW_W = 420
const VIEW_H = 150
const PLATE_X = 58
const PLATE_Y = 104
const MACH_X = 378 // 기계 몸통 왼쪽 끝
const GROUND_Y = 132
const SCALE = (410 - PLATE_X) / 150 // 1m당 px
const HANDS = { x: 48, y: 98 }
const BODY = { x: 42, y: 94 } // 몸에 맞는 공 도착점
const ZONE = { x: 51, y: 88, w: 14, h: 30 } // 스트라이크존 표시
const SLOT_Y: Record<Slot, number> = { high: 92, mid: 104, low: 124 }
const WIDGET_W = 440
const WIDGET_H = 330
const POS_KEY = 'hrm_baseball_widget_pos'
const MEDALS = ['🥇', '🥈', '🥉']

type Anim = { pitch: Pitch; start: number; result: Swing | null; resultStart: number | null; paEnded: string | null }

function arrivalOf(a: Anim) {
  return a.start + WINDUP_MS + travelMs(a.pitch.speed)
}

function resultDuration(s: Swing) {
  if (isHit(s.outcome)) return 800 + s.distance * 6
  if (s.outcome === 'foul') return 700
  return 600
}

function startY(p: Pitch) {
  if (p.type === 'sidearm') return 114
  return SLOT_Y[PITCH_TYPES[p.type].slot]
}

function endPoint(p: Pitch): { x: number; y: number } {
  if (p.type === 'hbp') return BODY
  if (p.type === 'ball') return { x: PLATE_X, y: PLATE_Y + p.alt * 30 }
  return { x: PLATE_X, y: PLATE_Y }
}

// 구종별 비행 중 위치 (p: 0~1, 1 = 홈플레이트 도착, 1 넘으면 같은 높이로 포수까지 직진)
function flightPos(pitch: Pitch, p: number): { x: number; y: number } {
  const sx = MACH_X - 6
  const sy = startY(pitch)
  const end = endPoint(pitch)
  const q = Math.min(p, 1)
  const px = pitch.type === 'changeup' && p <= 1 ? p + 0.22 * Math.sin(Math.PI * p) : p
  const x = sx + (end.x - sx) * px
  const line = (e: number) => sy + (end.y - sy) * e
  let y: number
  switch (pitch.type) {
    case 'heater': y = line(q) - 5 * Math.sin(Math.PI * q); break
    case 'fastball': y = line(q) - 7 * Math.sin(Math.PI * q); break
    case 'twoseam': y = line(q) + 20 * q ** 4 * (1 - q) * 4; break
    case 'slider': y = line(q) + 26 * q ** 4 * (1 - q) * 4; break
    case 'changeup': y = line(q) + 18 * q ** 2 * (1 - q) * 3; break
    case 'curve': y = line(q) - 32 * Math.sin(Math.PI * q) + 30 * q ** 2 * (1 - q); break
    case 'knuckle': y = line(q) + 9 * Math.sin(q * 17) * (0.4 + q) * (1 - q); break
    case 'rising': y = line(q ** 1.8); break
    case 'sidearm': y = line(q ** 3); break
    case 'ball': y = line(q) - 6 * Math.sin(Math.PI * q); break
    case 'hbp': y = line(q); break
  }
  return { x, y }
}

function landX(distance: number) {
  return PLATE_X + Math.min(distance, 150) * SCALE
}

// 현재 시각(now) 기준 공 위치. null이면 공을 그리지 않는다.
function ballPos(a: Anim, now: number): { x: number; y: number } | null {
  const t = now - a.start
  if (t < WINDUP_MS) return null
  const res = a.result
  if (res && a.resultStart !== null && now >= a.resultStart) {
    const r = Math.min(1, (now - a.resultStart) / resultDuration(res))
    if (res.outcome === 'hbp') {
      if (r >= 1) return null
      return { x: BODY.x + 40 * r, y: BODY.y + (GROUND_Y - BODY.y) * r - 60 * r * (1 - r) }
    }
    if (res.outcome === 'foul') {
      if (r >= 1) return null
      return { x: PLATE_X - 60 * r, y: PLATE_Y - 130 * r }
    }
    if (isHit(res.outcome)) {
      const lx = landX(res.distance)
      const h = 20 + Math.min(res.distance, 150) * 0.6
      return { x: PLATE_X + (lx - PLATE_X) * r, y: PLATE_Y + (GROUND_Y - PLATE_Y) * r - 4 * h * r * (1 - r) }
    }
  }
  const p = (t - WINDUP_MS) / travelMs(a.pitch.speed)
  if (a.pitch.type === 'hbp') return p <= 1 ? flightPos(a.pitch, p) : BODY
  if (p >= 1.15) return null // 포수 미트로 사라짐
  return flightPos(a.pitch, p)
}

function swung(s: Swing | null) {
  return !!s && s.offset !== null && s.outcome !== 'hbp'
}

function batAngle(a: Anim | null, now: number) {
  const READY = -125
  const FOLLOW = 30
  if (!a?.result || a.resultStart === null || !swung(a.result)) return READY
  const t = now - a.resultStart
  if (t < 0) return READY
  return READY + (FOLLOW - READY) * Math.min(1, t / 120)
}

function offsetHint(s: Swing) {
  if (s.offset === null || s.outcome === 'hbp') return ''
  if (Math.abs(s.offset) < 12) return '완벽한 타이밍'
  return `${(Math.abs(s.offset) / 1000).toFixed(2)}초 ${s.offset > 0 ? '늦음' : '빠름'}`
}

function scoreText(r: { runs: number; homeruns: number; hits: number }) {
  return `${r.runs}점 · 홈런 ${r.homeruns} · 안타 ${r.hits}`
}

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null
  } catch {
    return null
  }
}

function clampPos(p: { x: number; y: number }) {
  return {
    x: Math.max(4, Math.min(window.innerWidth - WIDGET_W - 4, p.x)),
    y: Math.max(4, Math.min(window.innerHeight - 120, p.y)),
  }
}

export default function BaseballWidget({ onClose }: { onClose: () => void }) {
  const { members } = useMembers()
  const { me, loaded: meLoaded } = useCurrentMember()
  const email = useAuthEmail()
  const isAdmin = email === BASEBALL_ADMIN_EMAIL
  // "오늘"은 서버 시각(KST) 기준 — PC 날짜가 틀려도 모두 같은 라운드를 본다.
  const [today, setToday] = useState(() => kstDate(Date.now()))
  useEffect(() => {
    let active = true
    getServerOffset().then(off => { if (active) setToday(kstDate(Date.now() + off)) })
    return () => { active = false }
  }, [])
  const { plays, loaded: playsLoaded, applyLocal } = useTodayPlays(today)
  const { counts: praiseCounts, loaded: praiseLoaded } = usePraiseCounts()
  const { bonus, setBonus } = useBonus(today)
  const [tab, setTab] = useState<'today' | 'career'>('today')
  const careerPlays = useCareerPlays(tab === 'career')

  const [view, setView] = useState<'list' | 'play'>('list')
  const [playId, setPlayId] = useState<string | null>(null)
  const [anim, setAnimState] = useState<Anim | null>(null)
  const animRef = useRef<Anim | null>(null)
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolvedPitchRef = useRef<string | null>(null)

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const nameOf = (id: string) => displayName(memberMap.get(id)) || '(알 수 없음)'
  const allowanceOf = (id: string) => dailyAllowance(praiseCounts.get(id) ?? 0, bonus.get(id) ?? 0)

  const current = plays.find(p => p.id === playId) ?? null
  const playRef = useRef<Play | null>(null)
  useEffect(() => { playRef.current = current }, [current])

  const myPlays = me ? plays.filter(p => p.member_id === me.id) : []
  const myAllowance = me ? allowanceOf(me.id) : 0
  const myUnfinished = myPlays.find(p => !p.finished) ?? null
  const myRemaining = Math.max(0, myAllowance - myPlays.length)

  const todayRank = useMemo(() => rankDay(plays), [plays])
  const career = useMemo(() => (careerPlays ? careerStats(careerPlays, today) : null), [careerPlays, today])

  function setAnim(next: Anim | null) {
    animRef.current = next
    setAnimState(next)
  }

  const animEnd = anim?.result && anim.resultStart !== null ? anim.resultStart + resultDuration(anim.result) : null
  const animActive = !!anim && (!anim.result || animEnd === null || now < animEnd)

  // ── 게임 시작/이어하기 ──
  async function ready() {
    if (!me || busy) return
    setError(null)
    if (myUnfinished) {
      setPlayId(myUnfinished.id)
      setAnim(null)
      setView('play')
      return
    }
    if (myRemaining <= 0) return
    setBusy(true)
    const gameNo = myPlays.reduce((m, p) => Math.max(m, p.game_no), 0) + 1
    const { data, error } = await createClient()
      .from('baseball_plays')
      .insert({ member_id: me.id, play_date: today, game_no: gameNo })
      .select()
      .single()
    setBusy(false)
    if (error || !data) {
      setError(error?.code === '23505' ? '다른 창에서 이미 시작한 게임이 있어요. 잠시 후 다시 눌러주세요' : `게임을 시작하지 못했어요: ${error?.message ?? ''}`)
      return
    }
    applyLocal(data as Play)
    setPlayId((data as Play).id)
    setAnim(null)
    setView('play')
  }

  // ── 투구/스윙 ──
  function throwPitch() {
    const p = playRef.current
    if (!p || p.finished || animActive) return
    setError(null)
    setAnim({ pitch: randomPitch(), start: performance.now(), result: null, resultStart: null, paEnded: null })
  }

  function resolveSwing(offset: number | null, t: number) {
    const a = animRef.current
    const p = playRef.current
    if (!a || a.result || !p || resolvedPitchRef.current === a.pitch.id) return
    resolvedPitchRef.current = a.pitch.id
    const { outcome, distance } = judgeSwing(offset, a.pitch)
    const swing: Swing = { type: a.pitch.type, speed: a.pitch.speed, outcome, distance, offset: offset === null ? null : Math.round(offset) }

    const before = simulateGame(p.swings)
    const swings = [...p.swings, swing]
    const after = simulateGame(swings)
    const paEnded = after.results.length > before.results.length ? paLabel(after.results[after.results.length - 1]) : null
    setAnim({ ...a, result: swing, resultStart: t, paEnded })

    const tally = tallySwings(swings)
    const patch = { swings, ...tally, finished_at: tally.finished ? new Date().toISOString() : null }
    applyLocal({ ...p, ...patch })
    createClient().from('baseball_plays').update(patch).eq('id', p.id).then(({ error }) => {
      if (error) setError(`결과 저장 실패: ${error.message}`)
    })
  }

  function swingBat() {
    const a = animRef.current
    if (!a || a.result || a.pitch.type === 'hbp') return // 몸쪽 공은 휘둘러도 사구
    const t = performance.now()
    resolveSwing(t - arrivalOf(a), t)
  }

  // 애니메이션 루프 (끝나면 멈춤) + 루킹/볼/사구 자동 판정
  useEffect(() => {
    if (!anim) return
    let raf = 0
    const tick = () => {
      const t = performance.now()
      setNow(t)
      const a = animRef.current
      if (!a) return
      const grace = a.pitch.type === 'hbp' ? 0 : LOOKING_GRACE_MS
      if (!a.result && t > arrivalOf(a) + grace) resolveSwing(null, t)
      const cur = animRef.current
      if (cur?.result && cur.resultStart !== null && t > cur.resultStart + resultDuration(cur.result)) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveSwing은 ref만 읽어 매 렌더 새로 만들어져도 동작이 같다
  }, [anim])

  // 스페이스바 스윙
  useEffect(() => {
    if (view !== 'play') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const a = animRef.current
      if (!a || a.result) return
      e.preventDefault()
      swingBat()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- swingBat은 ref만 읽는다
  }, [view])

  function backToList() {
    setAnim(null)
    setPlayId(null)
    setView('list')
  }

  async function changeBonus(memberId: string, delta: number) {
    if (!isAdmin || !me) return
    const err = await setBonus(memberId, (bonus.get(memberId) ?? 0) + delta, me.name)
    if (err) setError(`추가 횟수 저장 실패: ${err}`)
  }

  // ── 위치(드래그) ── 위젯은 열 때만 마운트되므로(SSR 없음) 초기값을 바로 window 기준으로 잡는다.
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    return clampPos(loadPos() ?? { x: window.innerWidth - WIDGET_W - 24, y: window.innerHeight - WIDGET_H - 110 })
  })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }))
  }
  function onDragEnd() {
    if (!dragRef.current) return
    dragRef.current = null
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
  }
  const dragProps = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }

  // ── 렌더 ──
  const btnPrimary = 'text-[12px] font-semibold text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-3 py-1.5'
  const btnGhost = 'text-[11.5px] text-[#5B6472] bg-white/70 border border-[#E5E8EB] hover:bg-white rounded-lg px-2.5 py-1'

  return (
    <div
      className="fixed z-[60] select-none rounded-2xl bg-white/75 backdrop-blur-md border border-white/70 shadow-[0_8px_30px_rgba(16,24,40,0.18)]"
      style={{ left: pos.x, top: pos.y, width: WIDGET_W, maxWidth: 'calc(100vw - 8px)' }}
    >
      <div className="cursor-move touch-none flex items-center justify-between gap-2 px-3 pt-2 pb-1" {...dragProps}>
        <span className="text-[11.5px] font-semibold text-[#5B6472]">
          ⚾ 비거리 야구
          <span className="font-normal text-[#9AA5B1] ml-1.5">오늘 라운드 · {today.slice(5).replace('-', '.')}</span>
        </span>
        <span className="flex items-center gap-1">
          {view === 'play' && !animActive && (
            <button onClick={backToList} className="text-[11px] text-[#7A8491] hover:text-[#1F2933] rounded px-1.5 py-0.5">목록</button>
          )}
          <button onClick={onClose} title="닫기" className="text-[13px] leading-none text-[#7A8491] hover:text-[#DC2626] rounded px-1.5 py-0.5">✕</button>
        </span>
      </div>

      {view === 'list' ? (
        <ListView
          members={members.map(m => m.id)}
          meId={me?.id ?? null}
          meLoaded={meLoaded}
          plays={plays}
          loaded={playsLoaded && praiseLoaded}
          nameOf={nameOf}
          memberMap={memberMap}
          allowanceOf={allowanceOf}
          bonus={bonus}
          isAdmin={isAdmin}
          onChangeBonus={changeBonus}
          myPraise={me ? praiseCounts.get(me.id) ?? 0 : 0}
          myAllowance={myAllowance}
          myRemaining={myRemaining}
          myUnfinished={!!myUnfinished}
          onReady={ready}
          busy={busy}
          todayRank={todayRank}
          career={career}
          tab={tab}
          setTab={setTab}
          btnPrimary={btnPrimary}
        />
      ) : (
        <PlayView
          play={current}
          anim={anim}
          now={now}
          animActive={animActive}
          batter={me ? memberMap.get(me.id) ?? null : null}
          dragProps={dragProps}
          onThrow={throwPitch}
          onSwing={swingBat}
          onBack={backToList}
          onAgain={ready}
          remaining={myRemaining}
          busy={busy}
          btnPrimary={btnPrimary}
          btnGhost={btnGhost}
        />
      )}

      {error && <p className="px-3 pb-2 text-[11px] text-[#DC2626]">⚠ {error}</p>}
    </div>
  )
}

type MemberLite = { name: string; nickname: string | null; color_key: number; avatar_url: string | null }

function ListView(props: {
  members: string[]
  meId: string | null
  meLoaded: boolean
  plays: Play[]
  loaded: boolean
  nameOf: (id: string) => string
  memberMap: Map<string, MemberLite>
  allowanceOf: (id: string) => number
  bonus: Map<string, number>
  isAdmin: boolean
  onChangeBonus: (memberId: string, delta: number) => void
  myPraise: number
  myAllowance: number
  myRemaining: number
  myUnfinished: boolean
  onReady: () => void
  busy: boolean
  todayRank: ReturnType<typeof rankDay>
  career: ReturnType<typeof careerStats> | null
  tab: 'today' | 'career'
  setTab: (t: 'today' | 'career') => void
  btnPrimary: string
}) {
  const { plays, meId, nameOf, memberMap, todayRank } = props
  const [manage, setManage] = useState(false)
  const rankOf = new Map(todayRank.map(r => [r.member_id, r]))
  // 나를 맨 위로
  const ordered = meId ? [meId, ...props.members.filter(id => id !== meId)].filter(id => memberMap.has(id)) : props.members

  return (
    <div className="px-3 pb-3 flex flex-col gap-2.5">
      {props.meLoaded && !meId && <p className="text-[11px] text-[#9AA5B1]">팀원으로 등록된 계정만 참여할 수 있어요.</p>}
      {meId && (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11px] text-[#7A8491]">
            👏 칭찬 {props.myPraise}개 → 오늘 <b className="text-[#1F2933]">{props.myAllowance}게임</b> · 남은 {props.myRemaining}
            <span className="text-[#B0B8C1]"> (기본 1 + 칭찬 4개당 1, 최대 5)</span>
          </p>
          {props.isAdmin && (
            <button onClick={() => setManage(v => !v)}
              className={`text-[10.5px] rounded-md px-1.5 py-0.5 border flex-shrink-0 ${manage ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'text-[#7A8491] border-[#E5E8EB] hover:bg-white'}`}>
              ⚙ 횟수
            </button>
          )}
        </div>
      )}

      <ul className="bg-white/80 rounded-lg border border-[#EEF0F2] divide-y divide-[#F0F2F5] max-h-[176px] overflow-y-auto">
        {ordered.map(id => {
          const mine = plays.filter(p => p.member_id === id)
          const done = mine.filter(p => p.finished).length
          const playing = mine.some(p => !p.finished)
          const best = rankOf.get(id)
          const isMe = id === meId
          const extra = props.bonus.get(id) ?? 0
          return (
            <li key={id} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] ${isMe ? 'bg-[#4C7FE0]/[0.05]' : ''}`}>
              <Avatar member={memberMap.get(id)} size={20} />
              <span className={`w-16 truncate ${isMe ? 'font-semibold text-[#1F2933]' : 'text-[#2B333B]'}`}>{nameOf(id)}</span>
              <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                playing ? 'bg-[#4C7FE0]/10 text-[#4C7FE0]' : done > 0 ? 'bg-[#16A34A]/10 text-[#15803D]' : 'bg-[#F0F2F5] text-[#9AA5B1]'
              }`}>
                {playing ? '플레이 중' : done > 0 ? `게임완료 ${done}/${props.allowanceOf(id)}` : '대기'}
              </span>
              {manage ? (
                <span className="flex-1 flex items-center justify-end gap-1 text-[10.5px] text-[#5B6472]">
                  <span className="tabular-nums">오늘 {props.allowanceOf(id)}게임 (추가 {extra})</span>
                  <button onClick={() => props.onChangeBonus(id, -1)} disabled={extra <= 0} className="w-5 h-5 rounded border border-[#E5E8EB] bg-white disabled:opacity-30">−</button>
                  <button onClick={() => props.onChangeBonus(id, 1)} className="w-5 h-5 rounded border border-[#E5E8EB] bg-white">+</button>
                </span>
              ) : (
                <span className="flex-1 text-right text-[10.5px] text-[#5B6472] tabular-nums truncate">{best ? scoreText(best) : ''}</span>
              )}
              {isMe && !manage && (
                props.myUnfinished ? (
                  <button onClick={props.onReady} disabled={props.busy} className={props.btnPrimary}>이어하기</button>
                ) : props.myRemaining > 0 ? (
                  <button onClick={props.onReady} disabled={props.busy || !props.loaded} className={props.btnPrimary}>준비</button>
                ) : (
                  <span className="text-[10.5px] text-[#B0B8C1] flex-shrink-0">오늘 끝</span>
                )
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-1 text-[11px]">
        {(['today', 'career'] as const).map(t => (
          <button key={t} onClick={() => props.setTab(t)}
            className={`px-2.5 py-1 rounded-full ${props.tab === t ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-white/80'}`}>
            {t === 'today' ? '오늘 랭킹' : '누적'}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[#B0B8C1]">{props.tab === 'today' ? '1인 최고 1게임 · 득점→홈런→안타→비거리' : '라운드 1위 횟수 → 통산 득점'}</span>
      </div>

      {props.tab === 'today' ? (
        todayRank.length === 0 ? (
          <p className="text-[11.5px] text-[#9AA5B1] px-1">아직 완료된 게임이 없어요. 첫 기록을 남겨보세요.</p>
        ) : (
          <ol className="space-y-1 max-h-[120px] overflow-y-auto">
            {todayRank.map(r => (
              <li key={r.member_id} className="flex items-center gap-2 text-[11.5px] px-1">
                <span className="w-5 text-center">{MEDALS[r.rank - 1] ?? <span className="text-[10.5px] text-[#9AA5B1]">{r.rank}</span>}</span>
                <span className="w-20 truncate text-[#2B333B]">{nameOf(r.member_id)}</span>
                <span className="flex-1 text-right tabular-nums text-[#1F2933]">{scoreText(r)} · {r.best > 0 ? `${r.best}m` : '-'}</span>
              </li>
            ))}
          </ol>
        )
      ) : !props.career ? (
        <p className="text-[11.5px] text-[#9AA5B1] px-1">불러오는 중…</p>
      ) : props.career.length === 0 ? (
        <p className="text-[11.5px] text-[#9AA5B1] px-1">아직 누적 기록이 없어요.</p>
      ) : (
        <ol className="space-y-1 max-h-[120px] overflow-y-auto">
          {props.career.map((r, i) => (
            <li key={r.member_id} className="flex items-center gap-2 text-[11.5px] px-1">
              <span className="w-5 text-center">{MEDALS[i] ?? <span className="text-[10.5px] text-[#9AA5B1]">{i + 1}</span>}</span>
              <span className="w-20 truncate text-[#2B333B]">{nameOf(r.member_id)}</span>
              <span className="flex-1 text-right tabular-nums text-[#1F2933]">
                {r.dayWins > 0 && <span className="text-[#B7791F] mr-1.5">👑 {r.dayWins}회</span>}
                {r.runs}점 · 홈런 {r.homeruns} · 안타 {r.hits} · 최장 {r.best}m
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function CountDots({ label, n, max, color }: { label: string; n: number; max: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-[10px] font-bold text-[#5B6472] w-2.5">{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="w-2 h-2 rounded-full border" style={{ background: i < n ? color : 'transparent', borderColor: i < n ? color : '#C4CBD2' }} />
      ))}
    </span>
  )
}

function Diamond({ bases }: { bases: GameState['bases'] }) {
  const cell = (on: boolean, x: number, y: number) => (
    <rect x={x} y={y} width="7" height="7" transform={`rotate(45 ${x + 3.5} ${y + 3.5})`} fill={on ? '#F59E0B' : '#FFFFFF'} stroke={on ? '#B45309' : '#C4CBD2'} strokeWidth="1" />
  )
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-label="주자">
      {cell(bases[1], 11.5, 1)}
      {cell(bases[2], 3, 9.5)}
      {cell(bases[0], 20, 9.5)}
    </svg>
  )
}

function PlayView(props: {
  play: Play | null
  anim: Anim | null
  now: number
  animActive: boolean
  batter: MemberLite | null
  dragProps: Record<string, (e: React.PointerEvent<HTMLDivElement>) => void>
  onThrow: () => void
  onSwing: () => void
  onBack: () => void
  onAgain: () => void
  remaining: number
  busy: boolean
  btnPrimary: string
  btnGhost: string
}) {
  const { play, anim, now, animActive, batter } = props
  const events = play?.swings ?? []
  // 애니메이션이 끝나기 전까진 방금 친 공을 카운트/주자에 반영하지 않는다(결과를 미리 스포하지 않게)
  const liveIdx = anim?.result && animActive ? events.length - 1 : -1
  const shownEvents = liveIdx >= 0 ? events.slice(0, liveIdx) : events
  const st = simulateGame(shownEvents)
  const full = simulateGame(events)

  const ball = anim ? ballPos(anim, now) : null
  const angle = (batAngle(anim, now) * Math.PI) / 180
  const windup = !!anim && now - anim.start < WINDUP_MS
  const shake = windup ? Math.sin(now / 25) * 1.2 : 0
  const animEnd = anim?.result && anim.resultStart !== null ? anim.resultStart + resultDuration(anim.result) : null
  const landed = anim?.result && isHit(anim.result.outcome) && animEnd !== null && now >= animEnd ? anim.result : null
  const resultShown = anim?.result && anim.resultStart !== null && now >= anim.resultStart ? anim.result : null
  const prevLandings = shownEvents.filter(s => isHit(s.outcome))
  const palette = DOODLE_PALETTE[(batter?.color_key ?? 0) % 8]
  const gameOver = !!play?.finished && !animActive
  const nozzleY = anim ? startY(anim.pitch) : SLOT_Y.mid

  // 구종·구속은 친 뒤에만 공개 — 발사구 높이와 궤적만 보고 읽어야 한다.
  let caption = ''
  let subCaption = ''
  if (resultShown) {
    caption = anim?.paEnded
      ? (isHit(resultShown.outcome) ? `${anim.paEnded} ${resultShown.distance}m` : anim.paEnded)
      : outcomeLabel(resultShown)
    const hint = offsetHint(resultShown)
    subCaption = `${PITCH_TYPES[resultShown.type].label} ${resultShown.speed}km/h${hint ? ` · ${hint}` : ''}`
  } else if (anim) {
    caption = windup ? '투구 준비…' : ''
  } else if (play && !play.finished) {
    caption = `${st.pa + 1}번째 타석 — 기계를 가동하세요`
  }
  const bigCaption = !!resultShown && (!!anim?.paEnded || isHit(resultShown.outcome))

  if (!play) return <p className="px-3 pb-3 text-[11.5px] text-[#9AA5B1]">게임을 불러오는 중…</p>

  return (
    <div>
      <div className="cursor-move touch-none relative" {...props.dragProps}>
        {/* 스코어보드: 주자·카운트(좌) / 득점·타석(우) */}
        <div className="absolute left-3 top-1 flex items-center gap-2 pointer-events-none">
          <Diamond bases={st.bases} />
          <span className="flex flex-col gap-0.5">
            <CountDots label="S" n={st.strikes} max={STRIKES_FOR_OUT - 1} color="#F59E0B" />
            <CountDots label="B" n={st.balls} max={BALLS_FOR_WALK - 1} color="#16A34A" />
            <CountDots label="O" n={st.results.filter(r => r.kind === 'K').length} max={PA_PER_GAME} color="#DC2626" />
          </span>
        </div>
        <div className="absolute right-3 top-1 text-right pointer-events-none">
          <p className="leading-none tabular-nums">
            <span className="text-[14px] font-bold text-[#1F2933]">{st.runs}</span><span className="text-[10px] font-medium text-[#7A8491] ml-0.5">점</span>
            <span className="text-[10px] text-[#7A8491] ml-1.5">{Math.min(st.pa + 1, PA_PER_GAME)}/{PA_PER_GAME}타석</span>
          </p>
          {/* 타석별 기록 (작게, 세로) */}
          <ul className="mt-0.5 text-[9px] leading-[11px] tabular-nums">
            {Array.from({ length: PA_PER_GAME }, (_, i) => {
              const r = st.results[i]
              const color = !r ? 'text-[#C4CBD2]' : r.kind === 'HR' ? 'text-[#DC2626] font-semibold' : r.kind === 'K' ? 'text-[#9AA5B1]' : 'text-[#15803D]'
              return <li key={i} className={color}>{i + 1} {r ? paLabel(r) : '·'}</li>
            })}
          </ul>
        </div>

        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto block" role="img" aria-label="야구 필드">
          <line x1="6" y1={GROUND_Y} x2={VIEW_W - 6} y2={GROUND_Y} stroke="#8BC77A" strokeWidth="3" strokeLinecap="round" />
          {[30, 60, 90, 150].map(m => (
            <g key={m}>
              <line x1={landX(m)} y1={GROUND_Y} x2={landX(m)} y2={GROUND_Y + 4} stroke="#7FAF6F" strokeWidth="1" />
              <text x={landX(m)} y={GROUND_Y + 13} textAnchor="middle" fontSize="8" fill="#6B8F60">{m}</text>
            </g>
          ))}
          <rect x={landX(FENCE_M) - 1.5} y={GROUND_Y - 16} width="3" height="16" fill="#2F6B3A" />
          <text x={landX(FENCE_M)} y={GROUND_Y - 19} textAnchor="middle" fontSize="8" fontWeight="700" fill="#2F6B3A">HR</text>
          <text x={landX(FENCE_M)} y={GROUND_Y + 13} textAnchor="middle" fontSize="8" fill="#2F6B3A">{FENCE_M}</text>

          {prevLandings.map((s, i) => (
            <g key={i}>
              <circle cx={landX(s.distance)} cy={GROUND_Y - 2} r="2.5" fill="#FFFFFF" stroke="#9AA5B1" />
              <text x={landX(s.distance)} y={GROUND_Y - 7} textAnchor="middle" fontSize="8" fill="#7A8491">{s.distance}</text>
            </g>
          ))}

          {/* 스트라이크존 */}
          <rect x={ZONE.x} y={ZONE.y} width={ZONE.w} height={ZONE.h} fill="#4C7FE0" fillOpacity="0.06" stroke="#4C7FE0" strokeOpacity="0.35" strokeDasharray="2 2" />
          <polygon points={`${PLATE_X - 6},${GROUND_Y} ${PLATE_X + 6},${GROUND_Y} ${PLATE_X + 6},${GROUND_Y - 2} ${PLATE_X},${GROUND_Y - 4} ${PLATE_X - 6},${GROUND_Y - 2}`} fill="#FFFFFF" stroke="#B8B2A7" />

          {/* 피칭머신 (멀리) — 발사구 높이가 구종마다 달라진다 */}
          <g transform={`translate(${shake},0)`}>
            <line x1={MACH_X + 6} y1="118" x2={MACH_X + 2} y2={GROUND_Y} stroke="#6B7280" strokeWidth="2.5" />
            <line x1={MACH_X + 22} y1="118" x2={MACH_X + 26} y2={GROUND_Y} stroke="#6B7280" strokeWidth="2.5" />
            <rect x={MACH_X} y="86" width="28" height="32" rx="5" fill="#9CA3AF" stroke="#4B5563" strokeWidth="1.2" />
            <circle cx={MACH_X + 14} cy="102" r="8" fill="#D1D5DB" stroke="#4B5563" strokeWidth="1.2" />
            <circle cx={MACH_X + 14} cy="102" r="2.5" fill="#4B5563" />
            <line x1={MACH_X - 2} y1="88" x2={MACH_X - 2} y2="128" stroke="#9CA3AF" strokeWidth="1.5" />
            <rect x={MACH_X - 8} y={nozzleY - 4} width="9" height="8" rx="2" fill="#4B5563" />
            <text x={MACH_X + 14} y="80" textAnchor="middle" fontSize="14">🤖</text>
          </g>

          {/* 졸라맨 타자 */}
          <g>
            <line x1={HANDS.x} y1={HANDS.y} x2={HANDS.x + Math.cos(angle) * 28} y2={HANDS.y + Math.sin(angle) * 28} stroke="#8B5A2B" strokeWidth="4" strokeLinecap="round" />
            <line x1="40" y1="84" x2="40" y2="110" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
            <line x1="40" y1="110" x2="33" y2={GROUND_Y} stroke="#374151" strokeWidth="3" strokeLinecap="round" />
            <line x1="40" y1="110" x2="48" y2={GROUND_Y} stroke="#374151" strokeWidth="3" strokeLinecap="round" />
            <line x1="40" y1="90" x2={HANDS.x} y2={HANDS.y} stroke="#374151" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="40" cy="75" r="8.5" fill={palette.bg} stroke={palette.fg} strokeWidth="1.2" />
            <path d="M31.5 73.5 Q40 63 48.5 73.5 L51 74.5 L31.5 74.5 Z" fill="#1F4E8C" />
            {batter && <text x="40" y={GROUND_Y + 14} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3A4249">{displayName(batter)}</text>}
          </g>

          {ball && <circle cx={ball.x} cy={ball.y} r="3.5" fill="#FFFFFF" stroke="#C0392B" strokeWidth="1" />}

          {landed && (
            <g>
              <line x1={landX(landed.distance)} y1={GROUND_Y} x2={landX(landed.distance)} y2={GROUND_Y - 16} stroke="#DC2626" strokeWidth="1.2" />
              <polygon points={`${landX(landed.distance)},${GROUND_Y - 16} ${landX(landed.distance) + 9},${GROUND_Y - 13} ${landX(landed.distance)},${GROUND_Y - 10}`} fill="#DC2626" />
            </g>
          )}

          {caption && (
            <text x={VIEW_W / 2} y="26" textAnchor="middle" fontSize={bigCaption ? 17 : 12} fontWeight="700" fill={resultShown && resultShown.distance >= FENCE_M ? '#DC2626' : '#1F2933'}>{caption}</text>
          )}
          {subCaption && <text x={VIEW_W / 2} y="41" textAnchor="middle" fontSize="10" fill="#5B6472">{subCaption}</text>}
        </svg>
      </div>

      <div className="px-3 pb-3 flex flex-col gap-2">
        {gameOver ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-[#1F2933] bg-[#F0FDF4]/90 border border-[#BBF7D0] rounded-lg px-2.5 py-1.5">
              🎉 게임완료! {scoreText(full)}{full.lob > 0 ? ` · 잔루 ${full.lob}` : ''}{full.best > 0 ? ` · 최장 ${full.best}m` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={props.onBack} className={props.btnPrimary}>목록·랭킹 보기</button>
              {props.remaining > 0 && <button onClick={props.onAgain} disabled={props.busy} className={props.btnGhost}>한 게임 더 (남은 {props.remaining})</button>}
            </div>
          </div>
        ) : anim && !anim.result ? (
          <button onClick={props.onSwing} className="self-start text-[12.5px] font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg px-4 py-1.5">
            🏏 스윙 <span className="text-[10px] font-normal opacity-80">Space · 볼은 참기</span>
          </button>
        ) : (
          <button onClick={props.onThrow} disabled={animActive} className={`self-start ${props.btnPrimary}`}>
            🤖 던지기 · {Math.min(st.pa + 1, PA_PER_GAME)}/{PA_PER_GAME}타석 ({st.strikes}S {st.balls}B)
          </button>
        )}
      </div>
    </div>
  )
}
