'use client'

// 운동장 🏸 배드민턴(중계 시점 · 1:1 / 2:2) 화면. 로직은 lib/badminton.ts.
// 운동장 무대(1080×320)는 납작해서 중계 시점이 안 나오므로, 화면 가운데에 큰 창(960×640, 화면에 맞춰 축소)으로 띄운다.
// 카메라는 "내 팀 끝선 뒤 높은 곳" — 내 팀이 항상 아래(가까운 쪽). 팀 B면 코트를 180° 돌려 그린다.
// 혼자(CPU 대결)면 이 PC가 다 계산. 사람끼리는 아래 BmNet 설명 참고.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CharacterSpriteSvg } from '@/components/baseball/three/Sprite3D'
import { getServerOffset } from '@/lib/serverClock'
import { useSideChannel } from '@/lib/useSideChannel'
import type { Equip } from '@/lib/baseballGear'
import {
  BM_HELP, COURT_HL, COURT_HW, HIT_R, METER_MAX, NET_H, SWING_MS, WIN, applyHit, badminton2Step, bmCpuInput, fwdOf, newBadminton2, newBmCpuMem, otherTeam, teamIdx,
  type BInput, type BmHit, type BmShot, type BmState, type BTeam,
} from '@/lib/badminton'

type Look = { name: string; equip: Equip; palette: { bg: string; fg: string } }
export type BmSeat = { look: Look; cpu: boolean }

const STEP_MS = 1000 / 60

// ── 중계 카메라(핀홀, 렌즈만 아래로 민 형태 — 세로선이 세로로 남아 TV 느낌) ──
const VW = 960, VH = 640, CX = VW / 2
const CAM_D = 7 // 카메라 ~ 가까운 끝선 거리(m)
const NEAR_Y = 585, FAR_Y = 125 // 가까운/먼 끝선의 화면 y
const NEAR_HW = 330 // 가까운 끝선 반폭(px)
const H_K = 0.5 // 높이는 줄여 그린다(실제 비율이면 셔틀콕이 화면 밖으로 나감)
const F = (NEAR_HW * CAM_D) / COURT_HW
const CH = (NEAR_Y - FAR_Y) / (F * (1 / CAM_D - 1 / (CAM_D + 2 * COURT_HL)))
const HZ = NEAR_Y - (F * CH) / CAM_D
function proj(x: number, y: number, h = 0) {
  const z = y + COURT_HL + CAM_D
  const k = F / z // 이 깊이에서 1m = k px(가로)
  return { x: CX + x * k, y: HZ + F * CH / z - h * k * H_K, k }
}
const pt = (x: number, y: number, h = 0) => { const p = proj(x, y, h); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }
const quad = (x1: number, y1: number, x2: number, y2: number, h = 0) => [pt(x1, y1, h), pt(x2, y1, h), pt(x2, y2, h), pt(x1, y2, h)].join(' ')

type TrailPt = { x: number; y: number; h: number }
const MY = '#2563EB', OPP = '#EA580C'

// 사람끼리 할 때(net) — 방장(host)이 경기를 계산해 0.1초마다 상태를 보내고, 참가자(guest)는 받은 상태를 스스로 이어 그린다(예측).
// 타구는 "친 사람 PC"가 판정해 'hit'로 보낸다(지연 때문에 정타 타이밍이 밀리지 않게). 방장은 원격 참가자 코트에 공이 떨어지면
// HOLD_MS 동안 기다렸다가(그 사이 온 타구 인정) 점수를 준다. 원격 참가자가 나가면 그 자리는 CPU가 이어 친다.
export type BmNet = {
  bid: string
  role: 'host' | 'guest'
  seed: number
  relay: (payload: BmWire) => void // 전용 채널이 안 붙었을 때 운동장 채널로
  listen: (fn: ((payload: unknown) => void) | null) => void
}
type StateMsg = { s: BmState; ins: [number, number][]; at: number } // at = 방장 기준 서버 시각
type CtlMsg =
  | { kind: 'input'; idx: number; fwd: -1 | 0 | 1; side: -1 | 0 | 1; actSeq: number }
  | { kind: 'hit'; hit: BmHit }
  | { kind: 'quit'; idx: number; host?: boolean }
export type BmWire = { ev: 'state'; m: StateMsg } | { ev: 'ctl'; m: CtlMsg }
const STATE_EVERY_MS = 100
const HOLD_MS = 300

export default function BadmintonArena(props: {
  size: 1 | 2
  seats: BmSeat[] // [A0, (A1), B0, (B1)] — cpu: true = CPU 자리
  myIdx: number
  net?: BmNet // 없으면 혼자(CPU 대결)
  onEnd: (myWin: boolean, score: { my: number; opp: number }) => void
  onClose: () => void
}) {
  const { size, seats, myIdx, net } = props
  const isGuest = net?.role === 'guest'
  const [view, setView] = useState<{ s: BmState; trail: TrailPt[]; facing: number[] }>(() => ({ s: newBadminton2(size, net?.seed ?? Math.floor(Math.random() * 1e6)), trail: [], facing: seats.map(() => 1) }))
  const stateRef = useRef(view.s)
  const keys = useRef({ up: false, down: false, left: false, right: false, actSeq: 0 })
  const endedRef = useRef(false)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })
  const [scale, setScale] = useState(1)
  const [lost, setLost] = useState<string | null>(null)
  const [cpuNow, setCpuNow] = useState<boolean[]>(() => seats.map(s => s.cpu)) // 나간 사람 자리 = CPU
  const cpuRef = useRef(cpuNow)
  // 통신으로 받은 것들(루프가 꺼내 씀)
  const remoteIn = useRef(seats.map(() => ({ fwd: 0 as -1 | 0 | 1, side: 0 as -1 | 0 | 1, actSeq: 0, seen: 0 })))
  const hitQueue = useRef<BmHit[]>([])
  const snap = useRef<StateMsg | null>(null)
  const offset = useRef(0)
  const lastStateAt = useRef(0)

  useEffect(() => { void getServerOffset().then(o => { offset.current = o }) }, [])

  useEffect(() => {
    const fit = () => setScale(Math.min(1.15, (window.innerWidth * 0.96) / VW, (window.innerHeight * 0.92) / VH))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // ── 통신 ──
  const onWireRef = useRef<(w: BmWire) => void>(() => {})
  useEffect(() => {
    onWireRef.current = (w: BmWire) => {
      if (w.ev === 'state') {
        if (!isGuest) return
        snap.current = w.m
        lastStateAt.current = Date.now()
        return
      }
      const c = w.m
      if (c.kind === 'input' && !isGuest) {
        const r = remoteIn.current[c.idx]
        if (r) { r.fwd = c.fwd; r.side = c.side; r.actSeq = c.actSeq }
      } else if (c.kind === 'hit' && !isGuest) hitQueue.current.push(c.hit)
      else if (c.kind === 'quit') {
        if (c.host && isGuest) setLost('🏸 방장이 나갔어요')
        else if (!isGuest && c.idx !== myIdx) {
          const next = cpuRef.current.map((v, i) => (i === c.idx ? true : v))
          cpuRef.current = next
          setCpuNow(next)
        }
      }
    }
  })
  const sendState = useSideChannel<StateMsg>(net ? `bm-${net.bid}` : null, 'state', m => onWireRef.current({ ev: 'state', m }), m => propsRef.current.net?.relay({ ev: 'state', m }))
  const sendCtl = useSideChannel<CtlMsg>(net ? `bm-${net.bid}` : null, 'ctl', m => onWireRef.current({ ev: 'ctl', m }), m => propsRef.current.net?.relay({ ev: 'ctl', m }))
  useEffect(() => {
    if (!net) return
    lastStateAt.current = Date.now()
    net.listen(p => { const w = p as BmWire; if (w && (w.ev === 'state' || w.ev === 'ctl')) onWireRef.current(w) })
    return () => net.listen(null)
    // net은 판 동안 그대로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 키: 방향키 4개 + Space. 운동장 캐릭터가 같이 움직이지 않게 먼저 잡는다(capture). 참가자는 바뀔 때마다 방장에게 보낸다
  useEffect(() => {
    const map: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
    const report = () => {
      if (!isGuest) return
      const k = keys.current
      sendCtl({ kind: 'input', idx: myIdx, fwd: ((k.up ? 1 : 0) - (k.down ? 1 : 0)) as -1 | 0 | 1, side: ((k.right ? 1 : 0) - (k.left ? 1 : 0)) as -1 | 0 | 1, actSeq: k.actSeq })
    }
    function down(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const dir = map[e.key]
      if (!dir && e.code !== 'Space' && e.key !== ' ') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (dir) keys.current[dir] = true
      else keys.current.actSeq++
      report()
    }
    function up(e: KeyboardEvent) {
      const dir = map[e.key]
      if (!dir) return
      e.stopImmediatePropagation()
      keys.current[dir] = false
      report()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true) }
  }, [isGuest, myIdx, sendCtl])

  // 고정 스텝 루프 — 방장(혼자 포함): 진짜 계산 / 참가자: 받은 상태에서 이어 그리기(예측)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let seen = 0
    let lastSent = 0
    const mems = seats.map(() => newBmCpuMem())
    let trail: TrailPt[] = []
    const facing = seats.map(() => 1)
    let hold: { pre: BmState; post: BmState; until: number } | null = null
    let ins: [number, number][] = seats.map(() => [0, 0])
    let pending: { hits: number; at: number } | null = null // 참가자: 내가 친 타구를 방장이 반영하기 전
    const myInput = (): BInput => {
      const k = keys.current
      const inp: BInput = { fwd: ((k.up ? 1 : 0) - (k.down ? 1 : 0)) as -1 | 0 | 1, side: ((k.right ? 1 : 0) - (k.left ? 1 : 0)) as -1 | 0 | 1, act: k.actSeq !== seen }
      seen = k.actSeq
      return inp
    }
    const guestOpts = { remote: seats.map((_, i) => i !== myIdx), autoServe: false }

    const hostTick = (s0: BmState): BmState => {
      let s = s0
      // 원격 타구 반영(보류 중이면 보류 직전 상태에)
      while (hitQueue.current.length) {
        const h = hitQueue.current.shift()!
        const r = applyHit(hold ? hold.pre : s, h)
        if (r) { s = r; hold = null }
      }
      if (hold) {
        if (Date.now() < hold.until) { acc = 0; return s }
        s = hold.post
        hold = null
      }
      const remote = seats.map((_, i) => i !== myIdx && !cpuRef.current[i])
      while (acc >= STEP_MS) {
        acc -= STEP_MS
        const mine = myInput()
        const cur = s
        const inputs = cur.players.map((_, i): BInput => {
          if (i === myIdx) return mine
          if (cpuRef.current[i]) return bmCpuInput(cur, i, mems[i], Math.random)
          const r = remoteIn.current[i]
          const act = r.actSeq !== r.seen
          r.seen = r.actSeq
          return { fwd: r.fwd, side: r.side, act }
        })
        ins = inputs.map(x => [x.fwd, x.side])
        const next = badminton2Step(cur, inputs, STEP_MS, { remote })
        // 원격 사람이 있는 코트에 떨어졌으면 잠깐 보류(그 사람 PC의 타구가 오는 중일 수 있다)
        if (net && cur.pause <= 0 && next.pause > 0 && next.last?.kind === 'floor') {
          const loser = otherTeam(next.last.team)
          if (teamIdx(next, loser).some(i => remote[i])) { hold = { pre: cur, post: next, until: Date.now() + HOLD_MS }; acc = 0; return cur }
        }
        s = next
      }
      return s
    }

    const guestTick = (s0: BmState): BmState => {
      let s = s0
      const sn = snap.current
      if (sn) {
        snap.current = null
        let base = sn.s
        // 받은 상태는 보낸 지 age ms 지난 것 — 그만큼 앞으로 돌려 맞춘다(셔틀콕이 뒤로 튀지 않게)
        const age = Math.max(0, Math.min(250, Date.now() + offset.current - sn.at))
        const othersIn = sn.ins.map(([f, sd]): BInput => ({ fwd: f as -1 | 0 | 1, side: sd as -1 | 0 | 1, act: false }))
        for (let t = 0; t < age && !base.winner; t += STEP_MS) {
          const n = badminton2Step(base, othersIn, STEP_MS, guestOpts)
          if (base.pause <= 0 && n.pause > 0) break
          base = n
        }
        // 내 캐릭터는 내 PC 위치 그대로(입력이 같아 방장과 거의 같다 — 많이 어긋나면 방장 쪽으로)
        const meLocal = s.players[myIdx], meHost = base.players[myIdx]
        const far = Math.hypot(meLocal.x - meHost.x, meLocal.y - meHost.y) > 1.2
        const keepMe = !far && base.pause <= 0 && s.pause <= 0
        base = { ...base, players: base.players.map((p, i) => (i === myIdx && keepMe ? { ...p, x: meLocal.x, y: meLocal.y, swing: meLocal.swing } : p)) }
        // 내가 친 타구가 아직 방장에 반영 전이면 내 쪽 셔틀콕을 유지
        if (pending && base.hits < pending.hits && Date.now() - pending.at < 700) {
          base = { ...base, sh: s.sh, lastHit: s.lastHit, hits: s.hits, hitAt: s.hitAt, meter: s.meter, last: s.last }
        } else pending = null
        s = base
        ins = sn.ins
      }
      while (acc >= STEP_MS) {
        acc -= STEP_MS
        const mine = myInput()
        const inputs = s.players.map((_, i): BInput => (i === myIdx ? mine : { fwd: (ins[i]?.[0] ?? 0) as -1 | 0 | 1, side: (ins[i]?.[1] ?? 0) as -1 | 0 | 1, act: false }))
        const next = badminton2Step(s, inputs, STEP_MS, guestOpts)
        if (s.pause <= 0 && next.pause > 0) continue // 점수는 방장이 정한다 — 예측으론 안 준다
        if (next.hits > s.hits && next.lastHit === myIdx && next.last) {
          const team = next.players[myIdx].team
          sendCtl({ kind: 'hit', hit: { idx: myIdx, hits: next.hits, sh: next.sh, meter: next.meter[team], kind: next.last.kind as BmShot } })
          pending = { hits: next.hits, at: Date.now() }
        }
        s = next
      }
      return s
    }

    const loop = (t: number) => {
      acc = Math.min(acc + (t - last), 250)
      last = t
      let s = stateRef.current
      if (!s.winner) s = isGuest ? guestTick(s) : hostTick(s)
      else acc = 0
      stateRef.current = s
      if (net && !isGuest && (Date.now() - lastSent >= STATE_EVERY_MS || (s.winner && !endedRef.current))) {
        lastSent = Date.now()
        sendState({ s, ins, at: Date.now() + offset.current })
      }
      if (isGuest && !endedRef.current && Date.now() - lastStateAt.current > 6000) setLost('📡 방장과 연결이 끊겼어요')
      // 셔틀콕 꼬리(서브 대기·득점 멈춤 땐 비움) · 선수는 셔틀콕 쪽을 본다(월드 x 기준, 그릴 때 화면 방향으로 바꿈)
      if (s.lastHit !== -1 && s.pause <= 0) {
        const lp = trail[trail.length - 1]
        if (!lp || lp.x !== s.sh.x || lp.y !== s.sh.y) trail = [...trail, { x: s.sh.x, y: s.sh.y, h: s.sh.h }].slice(s.sh.special ? -14 : -8)
      } else if (trail.length) trail = []
      s.players.forEach((p, i) => { const dx = s.sh.x - p.x; if (Math.abs(dx) > 0.3) facing[i] = dx > 0 ? 1 : -1 })
      setView({ s, trail, facing: [...facing] })
      if (s.winner && !endedRef.current) {
        endedRef.current = true
        const myTeam = s.players[myIdx].team
        propsRef.current.onEnd(s.winner === myTeam, { my: s.score[myTeam], opp: s.score[otherTeam(myTeam)] })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // seats·myIdx·net은 판 동안 그대로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const quit = () => {
    if (net && !endedRef.current) sendCtl({ kind: 'quit', idx: myIdx, host: !isGuest })
    props.onClose()
  }

  const s = view.s
  const myTeam = s.players[myIdx].team
  const oppTeam = otherTeam(myTeam)
  const flip = fwdOf(myTeam) // 팀 B면 -1 → 코트를 돌려 그린다
  const V = (x: number, y: number) => ({ x: x * flip, y: y * flip })
  const nameOf = (i: number) => `${seats[i]?.look.name ?? '?'}${cpuNow[i] && !seats[i]?.cpu ? ' (🤖 대신)' : ''}` // 나간 사람 자리는 CPU가 이어 침
  const teamNames = (team: BTeam) => teamIdx(s, team).map(nameOf).join(' · ')
  const teamLabel = (team: BTeam) => (size === 1 ? teamNames(team) : team === myTeam ? '우리 팀' : '상대 팀')

  const flying = s.lastHit !== -1 && s.pause <= 0

  // ── 깊이 순서로 그리기(먼 쪽 먼저) ──
  const ents: { y: number; node: ReactNode }[] = []
  // 네트
  {
    const lo = 0.79
    const a = proj(-COURT_HW - 0.1, 0), b = proj(COURT_HW + 0.1, 0)
    const at = proj(-COURT_HW - 0.1, 0, NET_H), bt = proj(COURT_HW + 0.1, 0, NET_H)
    ents.push({
      y: 0,
      node: (
        <g key="net">
          <polygon points={[pt(-COURT_HW, 0, lo), pt(COURT_HW, 0, lo), pt(COURT_HW, 0, NET_H), pt(-COURT_HW, 0, NET_H)].join(' ')} fill="url(#bm-net)" stroke="#E5E7EB" strokeWidth="0.8" opacity="0.92" />
          <line x1={at.x} y1={at.y} x2={bt.x} y2={bt.y} stroke="#F8FAFC" strokeWidth="3" />
          <line x1={a.x} y1={a.y} x2={at.x} y2={at.y} stroke="#CBD5E1" strokeWidth="3.5" strokeLinecap="round" />
          <line x1={b.x} y1={b.y} x2={bt.x} y2={bt.y} stroke="#CBD5E1" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      ),
    })
  }
  // 선수
  s.players.forEach((p, i) => {
    const v = V(p.x, p.y)
    const g = proj(v.x, v.y)
    const sz = 20 + 0.36 * g.k
    const face = view.facing[i] * flip
    const mine = i === myIdx
    const color = p.team === myTeam ? MY : OPP
    const swinging = p.swing >= 0 && p.swing <= SWING_MS
    // 라켓 각도 = 샷 결정 기준(뒤 -75° → 위 0° → 앞 +75°). 위를 향할 때 맞으면 정타
    const ang = swinging ? -75 + (p.swing / SWING_MS) * 150 : -60
    const hx = g.x + face * sz * 0.3, hy = g.y - sz * 0.62
    const rl = 0.22 * g.k + 8
    const serving = s.lastHit === -1 && s.srv === i && s.pause <= 0
    // 방금 친 사람 머리 위에 샷 꼬리표(0.65초)
    const tag = s.last && s.last.by === i && s.hitAt >= 0 && s.t - s.hitAt < 650 && s.pause <= 0
      ? ({ clear: '⤴ 멀리', drop: '⤵ 짧게', smash: '💥 정타!', special: '⚡ 정타!!', normal: '' } as Record<string, string>)[s.last.kind] ?? '' : ''
    ents.push({
      y: v.y,
      node: (
        <g key={`p${i}`}>
          <ellipse cx={g.x} cy={g.y} rx={0.38 * g.k} ry={0.13 * g.k} fill="#000" opacity="0.28" />
          {mine && <ellipse cx={g.x} cy={g.y} rx={0.42 * g.k + 3} ry={0.15 * g.k + 2} fill="none" stroke={MY} strokeWidth="2.5" />}
          <g transform={`translate(${g.x} ${g.y - sz * 1.17}) scale(${face} 1) translate(${-sz / 2} 0)`}>
            <CharacterSpriteSvg equip={seats[i].look.equip} name={seats[i].look.name} size={sz} colorBg={seats[i].look.palette.bg} colorFg={seats[i].look.palette.fg} />
          </g>
          <g transform={`translate(${hx} ${hy}) rotate(${face * ang}) scale(${face} 1)`}>
            <line x1={0} y1={0} x2={0} y2={-rl} stroke="#F8FAFC" strokeWidth={Math.max(1.5, g.k * 0.025)} strokeLinecap="round" />
            <ellipse cx={0} cy={-rl - rl * 0.32} rx={rl * 0.22} ry={rl * 0.32} fill="rgba(255,255,255,0.12)" stroke={swinging ? '#FDE047' : '#FDE68A'} strokeWidth={Math.max(1.5, g.k * 0.025)} />
          </g>
          <g transform={`translate(${g.x} ${g.y - sz * 1.17 - 8})`}>
            <rect x={-(nameOf(i).length * 6 + 14) / 2} y={-13} width={nameOf(i).length * 6 + 14} height={15} rx={7.5} fill={mine ? MY : 'rgba(255,255,255,0.92)'} stroke={color} strokeWidth={mine ? 0 : 1.5} />
            <text x={0} y={-2.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={mine ? '#fff' : '#1F2933'}>{serving ? '🏸 ' : ''}{nameOf(i)}</text>
            {tag && <text x={0} y={-19} textAnchor="middle" fontSize={tag.includes('정타') ? 15 : 12.5} fontWeight="900" fill={tag.includes('정타') ? '#FDE047' : '#F8FAFC'} stroke="#0F172A" strokeWidth="3" paintOrder="stroke">{tag}</text>}
          </g>
        </g>
      ),
    })
  })
  // 셔틀콕
  if (s.pause <= 0 || s.sh.h > 0) {
    const v = V(s.sh.x, s.sh.y)
    const c = proj(v.x, v.y, Math.max(0, s.sh.h))
    const vv = V(s.sh.vx, s.sh.vy)
    const back = flying ? proj(v.x - vv.x * 0.03, v.y - vv.y * 0.03, Math.max(0, s.sh.h - s.sh.vh * 0.03)) : proj(v.x, v.y - 0.1, s.sh.h + 0.1)
    const dx = back.x - c.x, dy = back.y - c.y
    const d = Math.hypot(dx, dy) || 1
    const L = 0.11 * c.k + 3, r = 0.035 * c.k + 1.5
    const ux = dx / d, uy = dy / d
    const tr = view.trail.map(q => { const w = V(q.x, q.y); const p = proj(w.x, w.y, q.h); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ')
    ents.push({
      y: v.y,
      node: (
        <g key="sh">
          {tr && <polyline points={tr} fill="none" stroke={s.sh.special ? '#FACC15' : '#F8FAFC'} strokeWidth={s.sh.special ? 6 : 2} strokeLinecap="round" opacity={s.sh.special ? 0.7 : 0.35} />}
          {s.sh.special && <circle cx={c.x} cy={c.y} r={r * 3} fill="#FDE047" opacity="0.45" />}
          <polygon points={`${c.x - uy * r},${c.y + ux * r} ${c.x + dx / d * L - uy * r * 1.9},${c.y + dy / d * L + ux * r * 1.9} ${c.x + dx / d * L + uy * r * 1.9},${c.y + dy / d * L - ux * r * 1.9} ${c.x + uy * r},${c.y - ux * r}`} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="0.6" />
          <circle cx={c.x} cy={c.y} r={r} fill="#FEF3C7" stroke="#B45309" strokeWidth="0.6" />
        </g>
      ),
    })
  }
  ents.sort((a, b) => b.y - a.y)

  // 바닥 그림자 — 높이·떨어질 곳을 읽는 핵심
  const shV = V(s.sh.x, s.sh.y)
  const shG = proj(shV.x, shV.y)
  // 내 라켓 닿는 범위(바닥 타원)
  const me = s.players[myIdx]
  const meV = V(me.x, me.y)
  const ring = { c: proj(meV.x, meV.y), f: proj(meV.x, meV.y + HIT_R), n: proj(meV.x, meV.y - HIT_R) }

  // ── 알림 ──
  const last = s.last
  let banner: string | null = null
  if (last && s.pause > 0) {
    if (last.kind === 'floor') banner = `🏸 ${nameOf(last.by)} 득점!`
    else if (last.kind === 'net') banner = `🕸 네트 — ${teamLabel(last.team)} 득점`
    else if (last.kind === 'out') banner = `🚫 아웃 — ${teamLabel(last.team)} 득점`
  } else if (last && flying && (last.kind === 'special' || last.kind === 'smash')) {
    banner = last.kind === 'special' ? `⚡ ${nameOf(last.by)} 번개 스매시!!` : `💥 ${nameOf(last.by)} 정타 스매시!`
  }
  const serveHint = s.lastHit === -1 && s.pause <= 0 ? (s.srv === myIdx ? '내 서브 — Space (←→ 누르면 그쪽으로)' : `${nameOf(s.srv)} 서브 대기`) : null

  const scoreRow = (team: BTeam) => (
    <div className="flex items-center gap-2">
      <span className="h-5 w-1.5 rounded-full" style={{ background: team === myTeam ? MY : OPP }} />
      <span className="w-4 text-[12px]">{s.server === team ? '🏸' : ''}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{teamNames(team)}</span>
      <span className="flex gap-[2px] text-[9px]" title="기 — 5칸 찬 뒤 정타 = ⚡ 번개 스매시">
        {Array.from({ length: METER_MAX }, (_, i) => <span key={i} className={i < s.meter[team] ? 'text-[#FACC15]' : 'text-white/25'}>●</span>)}
      </span>
      <span className="w-7 text-right text-[18px] font-black tabular-nums">{s.score[team]}</span>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70">
      <div style={{ width: VW * scale, height: VH * scale }}>
        <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10" style={{ width: VW, height: VH, transform: `scale(${scale})`, transformOrigin: 'top left', background: 'radial-gradient(ellipse at 50% 35%, #1E3A5F 0%, #0B1526 75%)' }}>
          <svg className="absolute inset-0" width={VW} height={VH} aria-hidden>
            <defs>
              <pattern id="bm-net" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0 L5 5 M5 0 L0 5" stroke="#E2E8F0" strokeWidth="0.5" /></pattern>
            </defs>
            {/* 체육관 바닥 · 코트 */}
            <polygon points={quad(-6.5, -COURT_HL - 1.6, 6.5, COURT_HL + 2.6)} fill="#7C4A2D" />
            <polygon points={quad(-COURT_HW - 0.9, -COURT_HL - 1.2, COURT_HW + 0.9, COURT_HL + 1.2)} fill="#14532D" />
            <polygon points={quad(-COURT_HW, -COURT_HL, COURT_HW, COURT_HL)} fill="#15803D" />
            <g stroke="#F8FAFC" strokeWidth="2" fill="none" opacity="0.95">
              <polygon points={quad(-COURT_HW, -COURT_HL, COURT_HW, COURT_HL)} />
              {[-2.59, 2.59].map(x => <polyline key={x} points={`${pt(x, -COURT_HL)} ${pt(x, COURT_HL)}`} />)}
              {[-1.98, 1.98, -(COURT_HL - 0.76), COURT_HL - 0.76].map(y => <polyline key={y} points={`${pt(-COURT_HW, y)} ${pt(COURT_HW, y)}`} />)}
              <polyline points={`${pt(0, 1.98)} ${pt(0, COURT_HL)}`} />
              <polyline points={`${pt(0, -1.98)} ${pt(0, -COURT_HL)}`} />
            </g>
            {/* 내 라켓 범위 */}
            <ellipse cx={ring.c.x} cy={(ring.f.y + ring.n.y) / 2} rx={HIT_R * ring.c.k} ry={(ring.n.y - ring.f.y) / 2} fill="none" stroke="#BFDBFE" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.45" />
            {/* 셔틀콕 그림자 */}
            {(flying || s.lastHit === -1) && <ellipse cx={shG.x} cy={shG.y} rx={0.12 * shG.k + 1.5} ry={0.045 * shG.k + 1} fill="#000" opacity={s.sh.special ? 0.6 : 0.42} />}
            {ents.map(e => e.node)}
          </svg>

          {/* 중계 점수판 */}
          <div className="absolute left-4 top-4 w-[300px] rounded-xl bg-[#0F172A]/85 px-3 py-2 text-white shadow-lg ring-1 ring-white/10">
            <p className="mb-1 text-[10.5px] font-semibold text-white/60">🏸 배드민턴 {size === 1 ? '1:1' : '2:2'} · {WIN}점 먼저 · {net ? (isGuest ? '방장 PC가 진행' : '내 PC가 진행(방장)') : '🤖 CPU 대결'}</p>
            <div className="flex flex-col gap-1">{scoreRow(myTeam)}{scoreRow(oppTeam)}</div>
          </div>
          <div className="absolute inset-x-0 top-5 flex flex-col items-center gap-1.5">
            {s.meter[myTeam] >= METER_MAX && s.pause <= 0 && (
              <span className="rounded-full bg-[#F97316] px-3 py-0.5 text-[12.5px] font-black text-white" style={{ animation: 'pg-bob 600ms ease-in-out infinite' }}>🔥 필살구 준비! 정타로 치면 ⚡</span>
            )}
            {banner && <span className="rounded-full bg-[#FACC15] px-4 py-1 text-[15px] font-black text-[#1F2933] shadow" style={{ animation: 'pg-toast 200ms ease-out' }}>{banner}</span>}
          </div>
          {serveHint && <span className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[12px] font-bold text-[#1F2933]">{serveHint}</span>}

          {lost && !s.winner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
              <p className="text-[20px] font-black">{lost}</p>
            </div>
          )}
          {s.winner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
              <p className="text-[44px]">{s.winner === myTeam ? '🏆' : '😵'}</p>
              <p className="text-[24px] font-black">{teamLabel(s.winner)} 승리! {s.score[myTeam]} : {s.score[oppTeam]}</p>
            </div>
          )}
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={quit}
            className="absolute bottom-3 right-3 rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-[#1F2933] hover:bg-white">
            {s.winner || lost ? '운동장으로' : '그만하기'}
          </button>
          <p className="absolute bottom-3.5 left-4 max-w-[780px] text-[11px] text-white/75">{BM_HELP}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
