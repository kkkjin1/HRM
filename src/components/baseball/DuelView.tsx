'use client'

// 1:1 실시간 대결 화면 — 투수·타자·관전자가 같은 컴포넌트를 쓴다.
// 투수가 구종·높이·구속을 고르고 제구 게이지로 던지면(가운데 초록 구간에서 멈춰야 고른 대로) baseball_duels.pitch에 공이 실리고,
// 타자·관전자 PC는 그 공을 "처음 본 순간"부터 자기 시계로 애니메이션을 돌린다(네트워크 지연이 타자에게 불리하지 않게).
// 판정은 타자 PC에서만 하고 결과 이벤트(pid로 공과 짝지음)만 저장한다. 투수·관전자는 그 결과를 받아 타구를 그린다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Equip } from '@/lib/baseballGear'
import { EquipToggle } from '@/components/baseball/GearBits'
import { BatterBadge, GaugeBar, ReadPicker } from '@/components/baseball/DuelBits'
import { FieldScene, PaLog, SWING_BTN, arrivalOf, usePitchAnimation, type Anim, type MemberLite } from '@/components/baseball/scene'
import { PITCH_TYPES, isHit, paLabel, resolvePitch, simulateGame, type PitchType, type ReadGuess, type Swing } from '@/lib/baseball'
import {
  BATTER_TIMEOUT_MS, DUEL_PITCHES, GAUGE_PERIODS, HEIGHTS, SIDES, SPEEDS,
  MOMENT_LABEL, RPS_LABEL, applyDuelEvent, duelBatterAt, duelEventMoment, duelScore, duelSituation, gaugeError, gaugeGrade, halfRoles, inningLabel, makeDuelPitch, playRps, sideLabel,
  type Duel, type DuelMoment, type GaugeGrade, type HeightChoice, type RpsChoice, type SideChoice, type SpeedChoice,
} from '@/lib/baseballDuel'

type Props = {
  duel: Duel
  meId: string | null
  memberMap: Map<string, MemberLite>
  nameOf: (id: string) => string
  applyDuel: (d: Duel) => void
  equipOf: (memberId: string | null | undefined) => Equip
  equipPicker: React.ReactNode
  scoreboardLogo?: string | null
  onBack: () => void
  dragProps: Record<string, (e: React.PointerEvent<HTMLDivElement>) => void>
  btnPrimary: string
  btnGhost: string
}

const HEIGHT_KEYS = Object.keys(HEIGHTS) as HeightChoice[]
const SPEED_KEYS = Object.keys(SPEEDS) as SpeedChoice[]
const SIDE_KEYS = Object.keys(SIDES) as SideChoice[]
const GAUGE_FEEL: Record<SpeedChoice, string> = { slow: '막대 느림', normal: '막대 보통', fast: '막대 빠름' }
// 투수 입력 순서: 구종 → 코스(높이·좌우) → 구속(고르면 그 빠르기로 제구 막대가 움직인다) → 멈춤
type PitchStep = 'type' | 'aim' | 'speed' | 'gauge'
const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, i))
const NO_READ: ReadGuess = { category: null, height: null }
const MOMENT_TONE: Record<DuelMoment, 'gold' | 'red' | 'blue'> = {
  LAST_OUT: 'red', WALKOFF_CHANCE: 'gold', FIRST_HIT: 'blue', FIRST_RUN: 'gold', TIE: 'blue', LEAD_CHANGE: 'red',
}

// pid로 결과 이벤트를 찾고, 그 공으로 타석이 끝났는지(끝났으면 결과 이름)도 같이 돌려준다
function findEvent(halves: Swing[][], pid: string) {
  for (let h = 0; h < halves.length; h++) {
    const i = halves[h].findIndex(e => e.pid === pid)
    if (i < 0) continue
    const before = simulateGame(halves[h].slice(0, i))
    const after = simulateGame(halves[h].slice(0, i + 1))
    const paEnded = after.results.length > before.results.length ? paLabel(after.results[after.results.length - 1]) : null
    return { h, i, ev: halves[h][i], paEnded }
  }
  return null
}

export default function DuelView({ duel, meId, memberMap, nameOf, applyDuel, equipOf, equipPicker, scoreboardLogo, onBack, dragProps, btnPrimary, btnGhost }: Props) {
  const h = Math.max(0, duel.halves.length - 1)
  const roles = halfRoles(duel, h)
  const role: 'pitcher' | 'batter' | 'spectator' = meId === roles.batter ? 'batter' : meId === roles.pitcher ? 'pitcher' : 'spectator'
  const participant = meId === duel.challenger_id || meId === duel.opponent_id
  const mustWin = !!duel.tournament_id
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ── 접속 확인(Realtime Presence): 상대가 이 대결 화면을 실제로 열어뒀는지. 없으면 투구를 막고 60초 뒤 부전승 처리 가능.
  // 예전엔 상대가 없어도 투수가 던지면 15초 뒤 대신 판정되는 걸 반복해 "공만 던지고 한참 뒤 다시 던지기"가 됐다.
  const opponentId = !participant ? null : meId === duel.challenger_id ? duel.opponent_id : duel.challenger_id
  const [presentIds, setPresentIds] = useState<Set<string> | null>(null) // null = 아직 확인 전
  const [absentSince, setAbsentSince] = useState<number | null>(null)
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    const supabase = createClient()
    const key = meId ?? `guest-${Math.random().toString(36).slice(2)}`
    const ch = supabase.channel(`bb-duel-presence-${duel.id}`, { config: { presence: { key } } })
    ch.on('presence', { event: 'sync' }, () => {
      const ids = new Set(Object.keys(ch.presenceState()))
      setPresentIds(ids)
      if (opponentId) setAbsentSince(prev => (ids.has(opponentId) ? null : prev ?? Date.now()))
    }).subscribe(async status => {
      if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() })
    })
    return () => { supabase.removeChannel(ch) }
  }, [duel.id, meId, opponentId])
  useEffect(() => {
    if (absentSince === null) return
    const t = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [absentSince])
  const oppPresent = !opponentId || presentIds === null || presentIds.has(opponentId)
  const absentSec = absentSince === null ? 0 : Math.max(0, Math.floor((tickNow - absentSince) / 1000))
  const WALKOVER_SEC = 60

  const duelRef = useRef(duel)
  useEffect(() => { duelRef.current = duel })
  const seenRef = useRef(new Set<string>())
  const resolvedRef = useRef<string | null>(null)

  const deadlineRef = useRef<(t: number) => void>(() => {})
  const { anim, animRef, now, setAnim, presentationActive, inputLocked } = usePitchAnimation((_a: Anim, t: number) => deadlineRef.current(t), 'duel')

  // ── 타자 노림(투구 전 선택, 이 PC에만 있다 — 투수는 결과가 저장된 뒤에야 본다). 공이 화면에 나타나는 순간의 값으로 잠근다.
  const [read, setRead] = useState<ReadGuess>(NO_READ)
  const readRef = useRef(read)
  useEffect(() => { readRef.current = read })
  const lockedReadRef = useRef<ReadGuess>(NO_READ)

  // ── 새 공 도착 → 애니메이션 (타자면 내가 판정, 관전자는 결과 대기). 투수는 던지는 순간 이미 시작했다.
  useEffect(() => {
    const p = duel.pitch
    if (!p || seenRef.current.has(p.id)) return
    seenRef.current.add(p.id)
    const r = halfRoles(duel, duel.halves.length - 1)
    if (meId === r.batter) lockedReadRef.current = readRef.current // 노림 잠금
    setAnim({ pitch: p, start: performance.now(), result: null, resultStart: null, paEnded: null, selfResolve: meId === r.batter })
  }, [duel, meId, setAnim])

  // ── 내 화면이 판정하지 않는 공(투수·관전자)의 결과가 도착 → 타구 애니메이션
  useEffect(() => {
    const a = animRef.current
    if (!a || a.result || a.selfResolve) return
    const found = findEvent(duel.halves, a.pitch.id)
    if (!found) return
    const t = performance.now()
    setAnim({ ...a, result: found.ev, resultStart: Math.max(t, arrivalOf(a)), paEnded: found.paEnded })
  }, [duel, animRef, setAnim])

  async function submitEvent(d: Duel, ev: Swing) {
    const patch = applyDuelEvent(d, ev, { mustWin })
    const upd = { ...patch, updated_at: new Date().toISOString() }
    applyDuel({ ...d, ...upd })
    const { data, error } = await createClient()
      .from('baseball_duels').update(upd)
      .eq('id', d.id).eq('pitch->>id', ev.pid!)
      .select()
    if (error) setError(`결과 저장 실패: ${error.message}`)
    else if (!data?.length) setError('이미 처리된 공이에요')
  }

  // ── 타자: 스윙/루킹 판정
  function resolve(offset: number | null, t: number) {
    const a = animRef.current
    const d = duelRef.current
    if (!a || a.result || !a.selfResolve || resolvedRef.current === a.pitch.id) return
    resolvedRef.current = a.pitch.id
    const cur = d.halves[d.halves.length - 1] ?? []
    // 판정: ① Space 타이밍 → ② (정타일 때만) 노림 → ③ 지금 타순 타자의 능력치 — judgeSwing 안에서 이 순서로
    const batter = duelBatterAt(simulateGame(cur).pa)
    const { swing: ev, paEnded } = resolvePitch(cur, a.pitch, offset, { pid: a.pitch.id, mods: { profile: batter.profile, read: lockedReadRef.current } })
    setAnim({ ...a, result: ev, resultStart: t, paEnded })
    submitEvent(d, ev)
  }
  useEffect(() => { deadlineRef.current = t => resolve(null, t) })

  function swingBat() {
    const a = animRef.current
    if (!a || a.result || !a.selfResolve || a.pitch.type === 'hbp') return
    const t = performance.now()
    resolve(t - arrivalOf(a), t)
  }
  const canSwingNow = () => {
    const a = animRef.current
    return role === 'batter' && !!a && !a.result && a.selfResolve
  }
  // 화면(필드)을 눌러도 스윙 — 모바일에서 버튼을 찾지 않아도 되게. 스윙할 공이 없으면 평소처럼 위젯 드래그.
  function onFieldPress() {
    if (!canSwingNow()) return false
    swingBat()
    return true
  }

  // ── 투수: 구종 → 코스(높이·좌우) → 구속 → 제구 게이지 (키보드 화살표·Enter 또는 터치)
  const [step, setStep] = useState<PitchStep>('type')
  const [pType, setPType] = useState<PitchType>('fastball')
  const [height, setHeight] = useState<HeightChoice>('mid')
  const [side, setSide] = useState<SideChoice>('mid')
  const [speed, setSpeed] = useState<SpeedChoice>('normal')
  // 게이지 막대는 CSS 애니메이션으로 움직인다 — 매 프레임 React로 다시 그리면 화면 전체(필드 SVG)를 다시 그려
  // 프레임이 떨어지고 막대가 몇 군데에서만 찍혀 보였다. 멈출 때는 "화면에 보이는 막대 위치"를 그대로 읽어 판정한다.
  const [gaugeStart, setGaugeStart] = useState<number | null>(null)
  const [stoppedPos, setStoppedPos] = useState<number | null>(null)
  const [gaugeFb, setGaugeFb] = useState<{ id: number; grade: GaugeGrade } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  function readGaugePos() {
    const track = trackRef.current?.getBoundingClientRect()
    const marker = markerRef.current?.getBoundingClientRect()
    if (!track || !marker || track.width <= 0) return 0.5
    return Math.max(0, Math.min(1, (marker.left + marker.width / 2 - track.left) / track.width))
  }
  const canPitch = role === 'pitcher' && duel.status === 'playing' && !duel.pitch && !inputLocked && !busy && oppPresent

  function startGauge(k: SpeedChoice) {
    setSpeed(k)
    if (!canPitch) return
    setError(null)
    setStoppedPos(null)
    setStep('gauge')
    setGaugeStart(performance.now())
  }
  function cancelGauge() {
    setGaugeStart(null)
    setStep('speed')
  }

  async function releasePitch() {
    if (gaugeStart === null) return
    const pos = readGaugePos()
    const err = gaugeError(pos)
    setStoppedPos(pos)
    setGaugeFb({ id: performance.now(), grade: gaugeGrade(err) })
    setGaugeStart(null)
    setStep('type') // 다음 공은 다시 구종부터(직전 선택은 그대로 남아 Enter만 눌러도 같은 공)
    const d = duelRef.current
    if (d.pitch || d.status !== 'playing') return
    const pitch = makeDuelPitch(pType, height, speed, err, Math.random, side)
    seenRef.current.add(pitch.id)
    setAnim({ pitch, start: performance.now(), result: null, resultStart: null, paEnded: null, selfResolve: false })
    setBusy(true)
    const upd = { pitch, updated_at: new Date().toISOString() }
    const { data, error } = await createClient()
      .from('baseball_duels').update(upd)
      .eq('id', d.id).eq('status', 'playing').is('pitch', null)
      .select()
    setBusy(false)
    if (error || !data?.length) {
      setAnim(null)
      setError(error ? `투구 실패: ${error.message}` : '지금은 던질 수 없어요')
      return
    }
    applyDuel(data[0] as Duel)
  }

  // 투수: 공을 던졌는데 타자 화면이 응답이 없으면(탭 닫힘·백그라운드) 대신 스윙 안 함으로 판정
  const pendingPitchId = duel.pitch?.id ?? null
  useEffect(() => {
    if (role !== 'pitcher' || !pendingPitchId) return
    const p = duelRef.current.pitch
    if (!p) return
    const timer = setTimeout(() => {
      const d = duelRef.current
      if (d.pitch?.id !== p.id) return
      // 스윙 안 함(null)이라 병살 굴림은 일어나지 않는다 — 예전 대리 판정과 같은 결과
      submitEvent(d, resolvePitch(d.halves[d.halves.length - 1] ?? [], p, null, { pid: p.id }).swing)
    }, (p.windup ?? 900) + BATTER_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새 공이 실릴 때마다 한 번씩만 예약
  }, [role, pendingPitchId])

  // 키보드: 타자 = Space 스윙 / 투수 = 화살표로 고르고 Enter(Space)로 다음 단계, Esc·Backspace로 이전 단계
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const ok = e.code === 'Space' || e.key === 'Enter'
      if (role === 'batter') {
        if (e.code !== 'Space' || !canSwingNow()) return
        e.preventDefault()
        swingBat()
        return
      }
      if (role !== 'pitcher' || duel.status !== 'playing') return
      const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const back = e.key === 'Escape' || e.key === 'Backspace'
      if (!ok && !dx && !dy && !back) return
      e.preventDefault()
      if (step === 'type') {
        if (dx || dy) {
          const n = DUEL_PITCHES.length
          setPType(DUEL_PITCHES[(DUEL_PITCHES.indexOf(pType) + (dx || dy) + n) % n])
        } else if (ok) setStep('aim')
      } else if (step === 'aim') {
        if (dx) setSide(SIDE_KEYS[clampIdx(SIDE_KEYS.indexOf(side) + dx, SIDE_KEYS.length)])
        else if (dy) setHeight(HEIGHT_KEYS[clampIdx(HEIGHT_KEYS.indexOf(height) + dy, HEIGHT_KEYS.length)])
        else if (ok) setStep('speed')
        else if (back) setStep('type')
      } else if (step === 'speed') {
        if (dx || dy) setSpeed(SPEED_KEYS[clampIdx(SPEED_KEYS.indexOf(speed) + (dx || dy), SPEED_KEYS.length)])
        else if (ok) startGauge(speed)
        else if (back) setStep('aim')
      } else if (step === 'gauge') {
        if (ok) releasePitch()
        else if (back) cancelGauge()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── 대결 관리 (수락/거절/취소/기권)
  async function patchDuel(upd: Partial<Duel>, onlyStatus: Duel['status']) {
    setBusy(true)
    setError(null)
    const full = { ...upd, updated_at: new Date().toISOString() }
    const { data, error } = await createClient().from('baseball_duels').update(full).eq('id', duel.id).eq('status', onlyStatus).select()
    setBusy(false)
    if (error) setError(error.message)
    else if (data?.length) applyDuel(data[0] as Duel)
  }
  // 가위바위보 (토너먼트에서 연장·안타 수까지 같을 때) — 최신 행을 읽어 updated_at 잠금으로 반영
  async function pickRps(choice: RpsChoice) {
    if (!meId || !participant) return
    const side: 'c' | 'o' = meId === duel.challenger_id ? 'c' : 'o'
    setBusy(true)
    setError(null)
    const supabase = createClient()
    for (let i = 0; i < 4; i++) {
      const { data: cur } = await supabase.from('baseball_duels').select('*').eq('id', duel.id).single()
      if (!cur || (cur as Duel).status !== 'rps') break
      const next = playRps(cur as Duel, side, choice)
      const { data, error } = await supabase.from('baseball_duels')
        .update({ ...next, updated_at: new Date().toISOString() })
        .eq('id', duel.id).eq('updated_at', (cur as Duel).updated_at).select()
      if (error) { setError(error.message); break }
      if (data?.length) { applyDuel(data[0] as Duel); break }
    }
    setBusy(false)
  }

  const forfeit = () => meId && patchDuel({ status: 'done', pitch: null, winner_id: meId === duel.challenger_id ? duel.opponent_id : duel.challenger_id }, duel.status === 'rps' ? 'rps' : 'playing')

  // ── 화면에 보일 반 이닝: 타구 애니메이션이 끝나기 전엔 방금 공을 빼고, 그 공이 속한 반 이닝을 보여준다
  const view = useMemo(() => {
    let halves = duel.halves.length ? duel.halves : [[]]
    let dispH = halves.length - 1
    if (anim?.result && presentationActive) {
      const f = findEvent(halves, anim.pitch.id)
      if (f) {
        dispH = f.h
        halves = halves.map((ev, i) => (i === f.h ? ev.filter((_, j) => j !== f.i) : ev)).slice(0, f.h + 1)
      }
    }
    const events = halves[dispH] ?? []
    return { dispH, st: simulateGame(events), score: duelScore(halves), prevLandings: events.filter(e => isHit(e.outcome)) }
  }, [duel.halves, anim, presentationActive])
  const dispRoles = halfRoles(duel, view.dispH)
  const pitcherEye = !!meId && meId === dispRoles.pitcher // 내가 던지는 반 이닝은 투수 시점
  const batsLeft = view.st.pa % 2 === 1 // FieldScene과 같은 규칙(타석마다 우·좌 번갈아)
  const finished = duel.status === 'done' && !presentationActive
  const readLocked = !!duel.pitch || inputLocked

  // ── 상황 문구(표시 전용) — 규칙 함수(duelEventMoment·duelSituation)로만 판단, 각 순간 한 번씩
  const [banner, setBanner] = useState<{ id: string; text: string; tone: 'gold' | 'red' | 'blue' } | null>(null)
  const shownMomentsRef = useRef(new Set<string>())
  const showMoment = (id: string, m: DuelMoment | null) => {
    if (!m || shownMomentsRef.current.has(id)) return
    shownMomentsRef.current.add(id)
    setBanner({ id, text: MOMENT_LABEL[m], tone: MOMENT_TONE[m] })
  }
  // 결과가 공개되는 순간(장면 끝): 그 공 전후 기록으로 첫 안타·첫 득점·동점·역전
  const revealedPid = anim?.result && !presentationActive ? anim.pitch.id : null
  useEffect(() => {
    if (!revealedPid) return
    const f = findEvent(duel.halves, revealedPid)
    if (!f) return
    const upTo = (n: number) => [...duel.halves.slice(0, f.h), duel.halves[f.h].slice(0, n)]
    showMoment(`ev:${revealedPid}`, duelEventMoment(upTo(f.i), upTo(f.i + 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 공개 순간 한 번만
  }, [revealedPid])
  // 새 타석이 시작될 때: 끝내기 찬스·LAST OUT (결과 문구와 겹치지 않게 조금 뒤에)
  const lastHalf = duel.halves[duel.halves.length - 1] ?? []
  const situationKey = duel.status === 'playing' && !duel.pitch && !inputLocked ? `sit:${duel.halves.length - 1}:${simulateGame(lastHalf).pa}` : null
  useEffect(() => {
    if (!situationKey) return
    const timer = setTimeout(() => showMoment(situationKey, duelSituation(duelRef.current, { mustWin })), 950)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 타석이 바뀔 때만
  }, [situationKey])

  const idleCaption =
    duel.status !== 'playing' ? ''
      : role === 'pitcher' ? ''
        : role === 'batter' ? `${nameOf(roles.pitcher)} 투구 준비 중…`
          : `${nameOf(roles.pitcher)} → ${nameOf(roles.batter)}`

  const rightTop = (
    <>
      <p className="leading-none text-[10px] text-[#7A8491]">{inningLabel(view.dispH)} · {nameOf(dispRoles.batter)} 타석</p>
      <p className="mt-0.5 leading-none text-[9.5px] text-[#9AA5B1]" data-lineup>{(() => { const b = duelBatterAt(view.st.pa); return `${b.order}번 ${b.label}` })()}</p>
      <PaLog results={view.st.results} />
    </>
  )

  // 전광판: 초 공격(상대) 점수 : 말 공격(도전자) 점수 — 지금 공격 중인 쪽 강조
  const attackingChallenger = view.dispH % 2 === 1
  const scoreboard = (
    <div className="mx-3 mb-1 flex items-center justify-center gap-2 rounded-lg bg-[#1F2933] text-white px-3 py-1 tabular-nums">
      <span className={`text-[11.5px] truncate max-w-[110px] ${!attackingChallenger ? 'font-bold text-[#FDE68A]' : 'opacity-80'}`}>{!attackingChallenger && '▶ '}{nameOf(duel.opponent_id)}</span>
      <span className="text-[20px] font-bold leading-none">{view.score.opponent}</span>
      <span className="text-[14px] opacity-60">:</span>
      <span className="text-[20px] font-bold leading-none">{view.score.challenger}</span>
      <span className={`text-[11.5px] truncate max-w-[110px] ${attackingChallenger ? 'font-bold text-[#FDE68A]' : 'opacity-80'}`}>{nameOf(duel.challenger_id)}{attackingChallenger && ' ◀'}</span>
      <span className="text-[10px] opacity-70 ml-1">{inningLabel(view.dispH)}{role === 'spectator' ? ' · 관전' : ''}</span>
    </div>
  )

  if (duel.status === 'invited') {
    const iAmOpponent = meId === duel.opponent_id
    return (
      <div className="px-3 pb-3 flex flex-col gap-2 text-[12px] text-[#3A4249]">
        <p>⚔ {nameOf(duel.challenger_id)} vs {nameOf(duel.opponent_id)} — {iAmOpponent ? '대결 신청이 왔어요!' : '상대 수락을 기다리는 중…'}</p>
        <div className="flex gap-2">
          {iAmOpponent && <button onClick={() => patchDuel({ status: 'playing', halves: [[]] }, 'invited')} disabled={busy} className={btnPrimary}>수락</button>}
          {iAmOpponent && <button onClick={() => patchDuel({ status: 'declined' }, 'invited')} disabled={busy} className={btnGhost}>거절</button>}
          {meId === duel.challenger_id && <button onClick={() => patchDuel({ status: 'canceled' }, 'invited')} disabled={busy} className={btnGhost}>신청 취소</button>}
          <button onClick={onBack} className={btnGhost}>목록</button>
        </div>
        {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
      </div>
    )
  }

  if (duel.status === 'declined' || duel.status === 'canceled') {
    return (
      <div className="px-3 pb-3 flex flex-col gap-2 text-[12px] text-[#3A4249]">
        <p>{duel.status === 'declined' ? '상대가 대결을 거절했어요.' : '대결 신청이 취소됐어요.'}</p>
        <button onClick={onBack} className={`self-start ${btnGhost}`}>목록으로</button>
      </div>
    )
  }

  return (
    <div>
      {scoreboard}
      <FieldScene
        anim={anim} now={now} st={view.st} dragProps={dragProps}
        batter={memberMap.get(dispRoles.batter) ?? null}
        batterGear={equipOf(dispRoles.batter)}
        pitcherGear={equipOf(dispRoles.pitcher)}
        pitcherName={nameOf(dispRoles.pitcher)}
        prevLandings={view.prevLandings}
        idleCaption={idleCaption}
        rightTop={rightTop}
        scoreboardLogo={scoreboardLogo}
        mode="duel"
        viewpoint={pitcherEye ? 'pitcher' : 'catcher'}
        aim={pitcherEye ? { height: HEIGHTS[height].value, side: SIDES[side].value } : null}
        onFieldPress={onFieldPress}
        banner={banner}
        lineup={duelBatterAt(view.st.pa)}
      />

      <div className="px-3 pb-3 flex flex-col gap-2">
        {duel.status === 'rps' && !presentationActive ? (
          <div className="flex flex-col gap-1.5 bg-[#FFF8E6]/90 border border-[#F5DFA6] rounded-lg px-2.5 py-2 text-[11.5px]">
            <p className="font-semibold text-[#7A4B00]">🤜 연장·안타 수까지 같아서 가위바위보! ({duel.rps?.round ?? 1}판)</p>
            {duel.rps?.last && (
              <p className="text-[11px] text-[#A0835A]">
                직전 판: {nameOf(duel.challenger_id)} {RPS_LABEL[duel.rps.last.c]} vs {nameOf(duel.opponent_id)} {RPS_LABEL[duel.rps.last.o]} → 비김
              </p>
            )}
            {participant ? (() => {
              const mine = meId === duel.challenger_id ? duel.rps?.c : duel.rps?.o
              return mine ? (
                <p className="text-[#5B6472]">{RPS_LABEL[mine]} 냈어요 — 상대를 기다리는 중…</p>
              ) : (
                <div className="flex gap-1.5">
                  {(Object.keys(RPS_LABEL) as RpsChoice[]).map(c => (
                    <button key={c} onClick={() => pickRps(c)} disabled={busy} className={btnPrimary}>{RPS_LABEL[c]}</button>
                  ))}
                </div>
              )
            })() : (
              <p className="text-[#5B6472]">👀 두 선수가 가위바위보 중…</p>
            )}
          </div>
        ) : finished ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-[#1F2933] bg-[#FFF8E6]/90 border border-[#F5DFA6] rounded-lg px-2.5 py-1.5">
              {duel.winner_id ? `🏆 ${nameOf(duel.winner_id)} 승리!` : '🤝 무승부'} ({nameOf(duel.opponent_id)} {duel.opponent_runs} : {duel.challenger_runs} {nameOf(duel.challenger_id)})
              {duel.rps?.last && duel.winner_id && (
                <span className="block text-[11px] font-normal text-[#A0835A]">
                  가위바위보 {duel.rps.round}판: {nameOf(duel.challenger_id)} {RPS_LABEL[duel.rps.last.c]} vs {nameOf(duel.opponent_id)} {RPS_LABEL[duel.rps.last.o]}
                </span>
              )}
              {duel.winner_id && meId === duel.winner_id && <span className="text-[#DC2626] ml-1">🎉</span>}
            </p>
            <button onClick={onBack} className={`self-start ${btnPrimary}`}>목록으로</button>
          </div>
        ) : role === 'batter' ? (
          <div className="flex flex-col items-center gap-1.5">
            {/* 지금 타자 + 노림(투구 전 선택, 공이 출발하면 잠김) — 공이 날아오는 동안엔 흐리게 */}
            <div className="self-stretch flex flex-col gap-1.5 rounded-lg bg-white/70 border border-[#EEF0F2] px-2 py-1.5">
              <BatterBadge batter={duelBatterAt(view.st.pa)} dim={readLocked} />
              <ReadPicker value={read} onChange={patch => setRead(r => ({ ...r, ...patch }))} locked={readLocked} />
            </div>
            {/* 버튼은 늘 같은 자리에 — 누르는 순간(pointerdown) 스윙. 화면(필드)을 눌러도 스윙된다 */}
            <button
              onPointerDown={e => { e.preventDefault(); swingBat() }}
              disabled={!(anim && anim.selfResolve && !anim.result)}
              className={`${SWING_BTN} touch-none disabled:opacity-40`}
            >
              🏏 스윙 <span className="text-[10.5px] font-medium opacity-85">Space · 볼은 참기</span>
            </button>
            <p className="text-[10.5px] text-[#7A8491]">
              {anim && anim.selfResolve && !anim.result ? '화면을 눌러도 스윙돼요' : `${nameOf(roles.pitcher)}의 공을 기다리는 중 (${view.st.strikes}S ${view.st.balls}B)`}
            </p>
          </div>
        ) : role === 'pitcher' ? (
          <div className="flex flex-col gap-1.5">
            {/* 단계 표시 — 누르면 그 단계로 돌아간다 */}
            <div className="flex items-center gap-1 text-[10.5px]">
              {([
                ['type', `① ${PITCH_TYPES[pType].label}`],
                ['aim', `② ${HEIGHTS[height].label} · ${sideLabel(side, batsLeft)}`],
                ['speed', `③ ${SPEEDS[speed].label}`],
              ] as [PitchStep, string][]).map(([k, label], i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[#C4CBD2]">›</span>}
                  <button onClick={() => step !== 'gauge' && setStep(k)} disabled={step === 'gauge'}
                    className={`rounded-md px-1.5 py-0.5 border ${step === k || (step === 'gauge' && k === 'speed') ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'bg-white/80 text-[#3A4249] border-[#E5E8EB]'}`}>
                    {label}
                  </button>
                </span>
              ))}
            </div>

            {step === 'type' && (
              <div className="flex flex-wrap gap-1">
                {DUEL_PITCHES.map(t => (
                  <button key={t} onClick={() => { setPType(t); setStep('aim') }}
                    className={`text-[11px] rounded-md px-1.5 py-1 border ${pType === t ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'bg-white/80 text-[#3A4249] border-[#E5E8EB] hover:bg-white'}`}>
                    {PITCH_TYPES[t].label}
                  </button>
                ))}
              </div>
            )}

            {step === 'aim' && (
              <div className="flex items-center gap-3">
                {/* 5×5 코스판(투수 시점 그대로): 가운데 3×3 = 스트라이크존, 바깥 = 볼 */}
                <div className="grid grid-cols-5 gap-0.5">
                  {HEIGHT_KEYS.map(hk => SIDE_KEYS.map(sk => {
                    const inZone = !SIDES[sk].ball && hk !== 'highBall' && hk !== 'lowBall'
                    const on = hk === height && sk === side
                    return (
                      <button key={`${hk}-${sk}`} onClick={() => { setHeight(hk); setSide(sk); setStep('speed') }}
                        title={`${HEIGHTS[hk].label} · ${sideLabel(sk, batsLeft)}`}
                        className={`w-7 h-6 rounded-[4px] border ${on ? 'bg-[#DC2626] border-[#DC2626]' : inZone ? 'bg-[#DBE6FA] border-[#B7CBF2] hover:bg-[#C6D7F7]' : 'bg-white/70 border-[#E5E8EB] hover:bg-white'}`} />
                    )
                  }))}
                </div>
                <div className="text-[11px] text-[#3A4249]">
                  <p className="font-semibold">{HEIGHTS[height].label} · {sideLabel(side, batsLeft)}</p>
                  <p className="text-[10px] text-[#9AA5B1] mt-0.5">파란 칸 = 스트라이크존<br />구석일수록 치기 어려워요</p>
                </div>
              </div>
            )}

            {step === 'speed' && (
              <div className="flex gap-1.5">
                {SPEED_KEYS.map(k => (
                  <button key={k} onClick={() => startGauge(k)} disabled={!canPitch}
                    className={`flex-1 flex flex-col items-center rounded-lg border px-2 py-1.5 disabled:opacity-40 ${speed === k ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'bg-white/80 text-[#3A4249] border-[#E5E8EB] hover:bg-white'}`}>
                    <span className="text-[12px] font-bold">{SPEEDS[k].label}</span>
                    <span className="text-[10px] opacity-80 tabular-nums">
                      {Math.round(PITCH_TYPES[pType].min + (PITCH_TYPES[pType].max - PITCH_TYPES[pType].min) * SPEEDS[k].ratio)}km/h · {GAUGE_FEEL[k]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {(step === 'gauge' || (step === 'type' && stoppedPos !== null)) && (
              <div className="flex items-center gap-2 pt-3">
                {/* 제구 게이지: 가운데 초록 구간에서 멈추면 고른 대로 — 빠른 공일수록 막대도 빠르다 */}
                <GaugeBar trackRef={trackRef} markerRef={markerRef} runKey={gaugeStart} periodMs={GAUGE_PERIODS[speed]} stoppedPos={stoppedPos} feedback={gaugeFb} />
                {step === 'gauge' && (
                  <button onPointerDown={e => { e.preventDefault(); releasePitch() }}
                    className="touch-none text-[13px] font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg px-4 py-2">멈춤!</button>
                )}
              </div>
            )}

            <p className="text-[10px] text-[#9AA5B1]">
              {step === 'type' && '←→ 구종 고르기 · Enter 다음 (눌러서 골라도 돼요)'}
              {step === 'aim' && '화살표로 코스 · Enter 다음 · Esc 뒤로'}
              {step === 'speed' && (canPitch ? '←→ 구속 · Enter면 막대 시작 · 빠를수록 막대도 빨라요' : '잠깐만요 — 지금은 던질 수 없어요(타구 처리·상대 대기)')}
              {step === 'gauge' && 'Space·Enter·멈춤! — 초록 구간이면 고른 대로, 벗어나면 코스·구속 랜덤(심하면 사구) · Esc 취소'}
            </p>
          </div>
        ) : (
          <p className="text-[11.5px] text-[#7A8491]">👀 관전 중 — {nameOf(roles.pitcher)} 투구, {nameOf(roles.batter)} 타석</p>
        )}

        {/* 상대 미접속 안내 + 60초 뒤 부전승 처리 */}
        {participant && opponentId && !oppPresent && (duel.status === 'playing' || duel.status === 'rps') && (
          <div className="flex items-center gap-2 text-[11px] bg-[#FEF2F2]/90 border border-[#FECACA] rounded-lg px-2.5 py-1.5">
            <span className="flex-1 text-[#B91C1C]">⏳ {nameOf(opponentId)}님이 아직 대결 화면에 없어요 ({absentSec}초)</span>
            {absentSec >= WALKOVER_SEC ? (
              <button onClick={() => meId && patchDuel({ status: 'done', pitch: null, winner_id: meId }, duel.status)} disabled={busy}
                className="text-[11px] font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-md px-2 py-1">부전승 처리</button>
            ) : (
              <span className="text-[10px] text-[#9AA5B1]">{WALKOVER_SEC - absentSec}초 뒤 부전승 가능</span>
            )}
          </div>
        )}
        {participant && (duel.status === 'playing' || duel.status === 'rps') && (
          <button onClick={forfeit} disabled={busy} className="self-end text-[10.5px] text-[#B0B8C1] hover:text-[#DC2626]">기권</button>
        )}
        {participant && equipPicker && !inputLocked && duel.status !== 'done' && <EquipToggle>{equipPicker}</EquipToggle>}
        {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
      </div>
    </div>
  )
}
