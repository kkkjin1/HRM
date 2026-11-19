'use client'

// ⚽ 미니 축구 경기 화면 — CPU전(혼자) · 실시간(방장/참가자). 규칙 src/lib/soccer.ts, CPU soccerCpu.ts, 통신 soccerNet.ts.
// 시간은 서버 시계 기준(startAt, offset). net이 없으면 이 PC가 전부 진행(나 + CPU).
// 조작: 방향키 이동 · E 달리기 · D 슛(누른 만큼 세게) · S 패스 · A 태클 · X 개인기/몸통박치기
//   (예전 키 Shift·Space(슛/태클 겸용)·C 도 그대로 동작)

import { useEffect, useRef, useState } from 'react'
import {
  BR, CHECK_COOL, DODGE_COOL, FIELD_H, FIELD_W, GOAL_BOT, GOAL_DEPTH, GOAL_TOP, PR,
  busy, mulberry32, newSoccerState, passBall, rollBall, shootBall, shotPower, stepSoccer, timeLeft,
  type SoccerInput, type SoccerState, type Team,
} from '@/lib/soccer'
import { newSoccerCpuMem, soccerCpuInput, type SoccerCpuMem } from '@/lib/soccerCpu'
import {
  GUEST_LOST_MS, HOST_LOST_MS, POS_MIN_BIG_MS, POS_MIN_MS, PREDICT_HOLD_SEC, WORLD_EVERY_BIG_MS, WORLD_EVERY_MS,
  applyGuest, applyWorld, encodeWorld, guestPos, shouldSendPos,
  type SoccerGuestLocal, type SoccerGuestMsg, type SoccerWire, type SoccerWorldMsg,
} from '@/lib/soccerNet'
import type { SoccerNetCtl } from '@/lib/useSoccerNet'
import type { Kit } from '@/lib/soccerKit'
import { logoUrl, type TeamKey } from '@/lib/baseballGear'
import { SoccerKid, type KidPose } from './SoccerKid'

const STEP = 1 / 60
const PAD = 12
const TOP = 56 // 맨 위 선수 머리·이름표가 잘리지 않게
const OX = GOAL_DEPTH + PAD
const BOX_W = FIELD_W + OX * 2
const BOX_H = FIELD_H + TOP + PAD

export interface SoccerSeat {
  id: string
  name: string
  team: Team
  kit: Kit
  number: number
  cpu: boolean
}

export interface SoccerTeamInfo { club: TeamKey; name: string; ring: string }

export interface SoccerResult {
  winner: Team | 'draw' | null
  myTeam: Team
  score: Record<Team, number>
  players: { id: string; name: string; team: Team; goals: number; steals: number; shots: number; cpu: boolean }[]
}

type Fx = { id: number; x: number; y: number; text: string; color: string; until: number }

const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
}

export default function SoccerArena(props: {
  seats: SoccerSeat[]
  teams: Record<Team, SoccerTeamInfo>
  myId: string
  seed: number
  startAt: number // 서버 시각(ms)
  offset: number // 서버시각 = Date.now() + offset
  net?: SoccerNetCtl
  onEnd?: (r: SoccerResult) => void
  onExit?: () => void
  onRestart?: () => void
  resultNote?: string | null
}) {
  const { seats, myId, seed, net, offset, startAt } = props
  const role = net?.role ?? 'local'
  const [initial] = useState(() => newSoccerState(seats.map(st => ({ id: st.id, team: st.team }))))
  const sRef = useRef<SoccerState>(initial)
  const keys = useRef(new Set<string>())
  const edge = useRef({ act: false, pass: false })
  const [view, setView] = useState(() => ({ s: initial, now: -3, fx: [] as Fx[], disp: {} as Record<string, { x: number; y: number }>, lost: false, lag: null as number | null, shake: 0, goalBanner: null as null | { team: Team; by: string | null; own: boolean; until: number } }))
  const fxRef = useRef<Fx[]>([])
  const fxId = useRef(0)
  const [scale, setScale] = useState(1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const endedSent = useRef(false)
  const onEndRef = useRef(props.onEnd)
  useEffect(() => { onEndRef.current = props.onEnd })
  const [result, setResult] = useState<SoccerResult | null>(null)

  // ── 키
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      const c = e.code
      if (KEY_DIR[c] || c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyE' || c === 'KeyD' || c === 'KeyS' || c === 'KeyA' || c === 'KeyX' || c === 'KeyC') {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.repeat) return
      keys.current.add(c)
      if (c === 'KeyX') edge.current.act = true
      if (c === 'KeyC' || c === 'KeyS') edge.current.pass = true
    }
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code) }
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // ── 통신 받기
  const inbox = useRef<SoccerWire[]>([])
  useEffect(() => {
    if (!net) return
    net.listen(m => inbox.current.push(m))
    return () => net.listen(null)
  }, [net])

  // ── 게임 루프
  useEffect(() => {
    const s = sRef.current
    const myIdx = s.players.findIndex(p => p.id === myId)
    const cpuIds = new Set(seats.filter(st => st.cpu).map(st => st.id))
    const rnd = mulberry32(seed ^ 0x2c1b3c6d)
    const mems: Record<string, SoccerCpuMem> = {}
    for (const st of seats) mems[st.id] = newSoccerCpuMem(mulberry32(Math.floor(rnd() * 1e9)), 0.5 + rnd() * 0.25)
    const humanRemote = new Set(seats.filter(st => !st.cpu && st.id !== myId).map(st => st.id))
    const big = seats.filter(st => !st.cpu).length >= 5
    const worldEvery = big ? WORLD_EVERY_BIG_MS : WORLD_EVERY_MS
    const posMin = big ? POS_MIN_BIG_MS : POS_MIN_MS
    const guestSeen: Record<string, number> = {}
    if (role === 'host') for (const id of humanRemote) guestSeen[id] = Date.now() + 4000
    const recvAt: Record<string, number> = {}
    const disp: Record<string, { x: number; y: number }> = {}
    const gl: SoccerGuestLocal = { myIdx, predictUntil: 0 }
    let lastWorldSent = 0
    let urgent = false
    let lastWorldRecv = Date.now()
    let lostNow = false
    let lag: number | null = null
    let lastPos: { x: number; y: number; a: number; ch: number; at: number } | null = null
    let goalSeqSeen = 0
    let banner: null | { team: Team; by: string | null; own: boolean; until: number } = null
    let shakeUntil = 0
    const stealsSeen: Record<string, number> = {}
    let raf = 0

    const nowT = () => (Date.now() + offset - startAt) / 1000
    const addFx = (id: string, text: string, color: string) => {
      const p = s.players.find(o => o.id === id)
      if (p) fxRef.current.push({ id: fxId.current++, x: p.x, y: p.y, text, color, until: s.t + 1.1 })
    }
    const readInput = (): SoccerInput => {
      const k = keys.current
      let dx = 0, dy = 0
      for (const c of k) { const d = KEY_DIR[c]; if (d) { dx += d[0]; dy += d[1] } }
      // 엔진의 kick 은 "공 있으면 슛 / 없으면 태클" 하나라서, D(슛)는 공 있을 때만·A(태클)는 공 없을 때만 kick 으로 넘긴다
      const mine = myIdx >= 0 && s.ball.owner === s.players[myIdx].id
      const inp: SoccerInput = {
        dx: Math.sign(dx), dy: Math.sign(dy),
        sprint: k.has('KeyE') || k.has('ShiftLeft') || k.has('ShiftRight'),
        kick: k.has('Space') || (mine ? k.has('KeyD') : k.has('KeyA')),
        act: edge.current.act,
        pass: edge.current.pass,
      }
      edge.current.act = false
      edge.current.pass = false
      return inp
    }
    const handleEvents = () => {
      for (const ev of s.events) {
        if (ev.kind === 'steal') { addFx(ev.id, '뺏었다!', '#16A34A'); urgent = true }
        else if (ev.kind === 'dodged') { addFx(ev.id, '✨ 개인기!', '#0EA5E9'); urgent = true }
        else if (ev.kind === 'post') { if (s.ball.last) addFx(s.ball.last, '땡! 골대 🥅', '#475569') }
        else if (ev.kind === 'shoot' || ev.kind === 'pass' || ev.kind === 'tackle' || ev.kind === 'check' || ev.kind === 'end') urgent = true
        else if (ev.kind === 'goal') urgent = true
      }
      s.events = []
    }
    // 골 연출(방장·참가자 공통: goalSeq가 늘면)
    const watchGoal = () => {
      if (s.goalSeq > goalSeqSeen) {
        goalSeqSeen = s.goalSeq
        const g = s.lastGoal
        if (g) {
          banner = { ...g, until: s.t + 2.2 }
          shakeUntil = s.t + 0.35
        }
      }
      for (const p of s.players) {
        const was = stealsSeen[p.id] ?? 0
        if (role === 'guest' && p.steals > was) addFx(p.id, '뺏었다!', '#16A34A')
        stealsSeen[p.id] = p.steals
      }
    }

    const tick = () => {
      const target = nowT()
      const nowMs = Date.now()
      // 받은 소식
      if (net) {
        const msgs = inbox.current
        inbox.current = []
        if (role === 'host') {
          for (const m of msgs) {
            if (m.k === 'w') continue
            const g = m as SoccerGuestMsg
            const id = s.players[g.i]?.id
            if (!id) continue
            guestSeen[id] = nowMs
            if (g.k === 'q') { guestSeen[id] = 0; continue }
            if (applyGuest(s, g)) {
              if (g.k === 'p') recvAt[id] = nowMs
              else urgent = true
            }
          }
          handleEvents()
        } else {
          const worlds = msgs.filter((m): m is SoccerWorldMsg => m.k === 'w')
          const latest = worlds[worlds.length - 1]
          if (latest) {
            lastWorldRecv = nowMs
            if (lostNow) { lostNow = false; setView(v => ({ ...v, lost: false })) }
            const l = Math.max(0, (target - latest.t) * 1000)
            lag = lag === null ? l : lag * 0.8 + l * 0.2
            if (latest.t >= s.t - 1.5) {
              applyWorld(s, latest, gl)
              const predicting = s.t < gl.predictUntil
              if (!predicting && !s.ball.owner) rollBall(s, Math.max(0, target - latest.t))
              for (const p of s.players) recvAt[p.id] = nowMs
            }
          }
          if (target <= 0) lastWorldRecv = Math.max(lastWorldRecv, nowMs)
          else if (!lostNow && nowMs - lastWorldRecv > HOST_LOST_MS && s.endedAt === null) {
            lostNow = true
            setView(v => ({ ...v, lost: true }))
          }
        }
      }

      // 진행
      if (target > 0 && s.phase !== 'end') {
        // 탭이 멈췄다 돌아오는 등 너무 뒤처졌으면 건너뛴다(한꺼번에 따라잡느라 멈추지 않게) — 시계는 모두 서버 기준
        if (target - s.t > 0.4) s.t = target - STEP
        let n = 0
        while (s.t + STEP <= target && n < 12) {
          const inp = n === 0 ? readInput() : { ...readInput(), act: false, pass: false }
          const me = s.players[myIdx]
          if (role === 'guest' && me) {
            const playing = s.phase === 'play' && !busy(me, s.t)
            // 떼는 순간 슛 / 패스 — 내 화면에서 바로 차고 방장에게 알림
            if (playing && !inp.kick && me.kickHeld && me.chargeAt !== null && s.ball.owner === me.id) {
              const pw = shotPower(me, s.t)
              net?.send({ k: 's', i: myIdx, x: me.x, y: me.y, fx: me.fx, fy: me.fy, pw })
              shootBall(s, me, pw)
              gl.predictUntil = s.t + PREDICT_HOLD_SEC
            } else if (playing && inp.pass && s.ball.owner === me.id) {
              net?.send({ k: 'ps', i: myIdx, x: me.x, y: me.y, fx: me.fx, fy: me.fy })
              passBall(s, me)
              gl.predictUntil = s.t + PREDICT_HOLD_SEC
            }
            stepSoccer(s, { [myId]: inp }, STEP, { move: new Set([myId]), judge: false })
            s.events = s.events.filter(e => e.kind !== 'wall' && e.kind !== 'post')
          } else {
            const inputs: Record<string, SoccerInput> = { [myId]: inp }
            const local = new Set<string>([myId])
            for (const p of s.players) {
              const lost = role === 'host' && humanRemote.has(p.id) && nowMs - (guestSeen[p.id] ?? 0) > GUEST_LOST_MS
              if (cpuIds.has(p.id) || lost || (role === 'local' && p.id !== myId)) {
                inputs[p.id] = soccerCpuInput(s, p, mems[p.id])
                local.add(p.id)
              }
            }
            stepSoccer(s, inputs, STEP, { move: local, judge: true })
          }
          handleEvents()
          n++
        }
      }
      watchGoal()

      // 보내기
      if (role === 'host' && net && (urgent ? nowMs - lastWorldSent > 50 : nowMs - lastWorldSent >= worldEvery)) {
        net.send(encodeWorld(s))
        lastWorldSent = nowMs
        urgent = false
      }
      if (role === 'guest' && net && target > 0) {
        const me = s.players[myIdx]
        if (me) {
          const msg = guestPos(me, myIdx, s.ko)
          if (shouldSendPos(lastPos, msg, nowMs, posMin)) {
            net.send(msg)
            lastPos = { x: msg.x, y: msg.y, a: msg.a, ch: msg.ch, at: nowMs }
          }
        }
      }

      // 다른 사람(내가 안 움직이는 사람) 부드럽게
      for (const p of s.players) {
        const remote = role === 'guest' ? p.id !== myId : role === 'host' ? humanRemote.has(p.id) && nowMs - (guestSeen[p.id] ?? 0) <= GUEST_LOST_MS : false
        if (!remote) { disp[p.id] = { x: p.x, y: p.y }; continue }
        const age = Math.min(0.15, Math.max(0, (nowMs - (recvAt[p.id] ?? nowMs)) / 1000))
        const tx = p.x + p.vx * age, ty = p.y + p.vy * age
        const d = disp[p.id] ?? { x: tx, y: ty }
        const far = Math.abs(d.x - tx) + Math.abs(d.y - ty) > 80
        disp[p.id] = far ? { x: tx, y: ty } : { x: d.x + (tx - d.x) * 0.35, y: d.y + (ty - d.y) * 0.35 }
      }

      // 끝
      if (s.phase === 'end' && !endedSent.current) {
        endedSent.current = true
        if (role === 'host' && net) for (const ms of [0, 150, 400]) setTimeout(() => net.send(encodeWorld(s)), ms)
        const myTeam = s.players[myIdx]?.team ?? 'A'
        const r: SoccerResult = {
          winner: s.winner, myTeam, score: { ...s.score },
          players: s.players.map(p => {
            const st = seats.find(x => x.id === p.id)
            return { id: p.id, name: st?.name ?? '?', team: p.team, goals: p.goals, steals: p.steals, shots: p.shots, cpu: !!st?.cpu }
          }),
        }
        setTimeout(() => setResult(r), 1600)
        onEndRef.current?.(r)
      }

      fxRef.current = fxRef.current.filter(f => f.until > s.t)
      if (banner && s.t > banner.until) banner = null
      setView(v => ({
        ...v, s, now: target, fx: [...fxRef.current], disp: { ...disp }, lag, goalBanner: banner,
        shake: s.t < shakeUntil ? Math.sin(s.t * 90) * 3 : 0,
      }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      if (role === 'guest' && s.phase !== 'end') net?.send({ k: 'q', i: myIdx })
    }
    // 판 하나 동안 고정 (seats·seed·net은 key로 새로 만든다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 화면 폭에 맞춰 줄이기
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / BOX_W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { s, now, fx, disp, lost, lag, shake, goalBanner } = view
  const me = s.players.find(p => p.id === myId)
  const seatOf = (id: string) => seats.find(st => st.id === id)
  const countdown = now < 0 ? Math.ceil(-now) : 0
  const left = timeLeft(s)
  const tA = props.teams.A, tB = props.teams.B
  const ownerId = s.ball.owner
  const ballDisp = (() => {
    if (ownerId) {
      const o = s.players.find(p => p.id === ownerId)
      const d = o ? disp[o.id] ?? o : null
      if (o && d) return { x: d.x + o.fx * (PR + BR + 1), y: d.y + o.fy * (PR + BR + 1) }
    }
    return { x: s.ball.x, y: s.ball.y }
  })()
  const ballSpeed = Math.hypot(s.ball.vx, s.ball.vy)

  return (
    <div style={{ color: '#0F172A' }}>
      <style>{SOCCER_CSS}</style>
      {/* 머리줄: 점수판 · 시간 · 기력 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0F172A', color: '#fff', borderRadius: 12, padding: '5px 12px' }}>
          <TeamBadge info={tA} side="A" mine={me?.team === 'A'} />
          <span style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{s.score.A} : {s.score.B}</span>
          <TeamBadge info={tB} side="B" mine={me?.team === 'B'} />
          <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: s.golden ? '#FACC15' : left < 15 ? '#FCA5A5' : '#E2E8F0' }}>
            {s.golden ? `⚡ 골든골 ${Math.ceil(left)}` : fmt(left)}
          </span>
        </div>
        {me && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
            <span>기력</span>
            <span style={{ width: 90, height: 8, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden', display: 'inline-block' }}>
              <span style={{ display: 'block', height: '100%', width: `${me.stamina * 100}%`, background: me.tired ? '#F87171' : '#22C55E', transition: 'width 80ms linear' }} />
            </span>
            <CoolChip label={s.ball.owner === myId ? 'X 개인기' : 'X 박치기'} left={s.ball.owner === myId ? me.dodgeCool - s.t : me.checkCool - s.t} total={s.ball.owner === myId ? DODGE_COOL : CHECK_COOL} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {role === 'guest' && lag !== null && <span style={{ fontSize: 11, opacity: 0.6 }} title="방장 화면 소식이 내 화면에 오기까지">📶 {Math.round(lag)}ms</span>}
        {role === 'host' && <span style={{ fontSize: 11, opacity: 0.6 }}>👑 방장</span>}
        {props.onExit && <button onClick={props.onExit} style={btn}>나가기</button>}
      </div>

      <div ref={wrapRef} style={{ width: '100%', maxWidth: BOX_W }}>
        <div style={{ width: BOX_W * scale, height: BOX_H * scale, position: 'relative' }}>
          <div style={{ width: BOX_W, height: BOX_H, position: 'absolute', left: 0, top: 0, transform: `scale(${scale}) translate(${shake}px, 0)`, transformOrigin: '0 0', borderRadius: 16, overflow: 'hidden', background: '#2F7D3A' }}>
            <Pitch />
            {/* 그림자·선수·공 — 아래(y 큰)일수록 앞 */}
            {s.players.map((p, i) => {
              const st = seatOf(p.id)
              if (!st) return null
              const d = disp[p.id] ?? { x: p.x, y: p.y }
              const isMe = p.id === myId
              const act = p.act !== 'none' && s.t < p.actUntil ? p.act : 'none'
              const pose: KidPose = act === 'tackle' ? 'tackle' : act === 'down' ? 'down' : act === 'check' ? 'check' : act === 'dodge' ? 'dodge' : p.moving ? 'run' : s.phase === 'end' && s.winner === p.team ? 'cheer' : 'stand'
              const ring = props.teams[p.team].ring
              const charging = p.chargeAt !== null && ownerId === p.id
              const power = charging ? shotPower(p, s.t) : 0
              return (
                <div key={p.id} style={{ position: 'absolute', left: OX + d.x, top: TOP + d.y, zIndex: Math.round(d.y) + 10, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: -PR - 2, top: -5, width: PR * 2 + 4, height: 10, borderRadius: '50%', border: `2.5px solid ${ring}`, background: isMe ? `${ring}33` : 'rgba(0,0,0,0.12)' }} />
                  {act === 'dodge' && <div className="sc-trail" style={{ position: 'absolute', left: -p.adx * 24 - 20, top: -58, opacity: 0.35 }}><SoccerKid kit={st.kit} number={st.number} pose="dodge" phase={0} size={40} facing={p.fx < 0 ? -1 : 1} /></div>}
                  <div style={{ position: 'absolute', left: -20, top: -54 }}>
                    <SoccerKid kit={st.kit} number={st.number} pose={pose} phase={now * 13 + i} size={40} facing={p.fx < 0 ? -1 : 1} />
                  </div>
                  <div style={{ position: 'absolute', left: 0, top: -72, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: isMe ? ring : 'rgba(255,255,255,0.92)', color: isMe ? '#fff' : '#0F172A', border: `1.5px solid ${ring}` }}>
                    {isMe ? '나' : st.name}{st.cpu ? ' 🤖' : ''}
                  </div>
                  {isMe && <div className="sc-bob" style={{ position: 'absolute', left: -5, top: -87, fontSize: 11, color: '#FACC15', textShadow: '0 1px 0 #0F172A' }}>▼</div>}
                  {charging && (
                    <div style={{ position: 'absolute', left: -20, top: -80, width: 40, height: 6, borderRadius: 99, background: 'rgba(15,23,42,0.55)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${power * 100}%`, background: power > 0.85 ? '#EF4444' : power > 0.5 ? '#F59E0B' : '#FACC15' }} />
                    </div>
                  )}
                  {act === 'tackle' && <div style={{ position: 'absolute', left: -12, top: -6, fontSize: 12 }}>💨</div>}
                  {act === 'down' && <div className="sc-spin" style={{ position: 'absolute', left: -6, top: -46, fontSize: 12 }}>💫</div>}
                </div>
              )
            })}
            {/* 공 */}
            <div style={{ position: 'absolute', left: OX + ballDisp.x, top: TOP + ballDisp.y, zIndex: Math.round(ballDisp.y) + 12, pointerEvents: 'none' }}>
              {ballSpeed > 420 && !ownerId && <div style={{ position: 'absolute', left: -BR - (s.ball.vx / ballSpeed) * 26, top: -BR - (s.ball.vy / ballSpeed) * 26, width: BR * 2, height: BR * 2, borderRadius: 99, background: 'rgba(255,255,255,0.35)', filter: 'blur(3px)' }} />}
              <div style={{ position: 'absolute', left: -BR, top: -BR + 3, width: BR * 2, height: BR, borderRadius: '50%', background: 'rgba(0,0,0,0.25)' }} />
              <svg width={BR * 2 + 2} height={BR * 2 + 2} viewBox="-8 -8 16 16" style={{ position: 'absolute', left: -BR - 1, top: -BR - 4 }}>
                <g transform={`rotate(${(ballDisp.x + ballDisp.y) * 4})`}>
                  <circle r={7} fill="#fff" stroke="#1F2937" strokeWidth={0.8} />
                  <polygon points="0,-2.6 2.5,-0.8 1.5,2.1 -1.5,2.1 -2.5,-0.8" fill="#1F2937" />
                  {[0, 72, 144, 216, 288].map(a => <circle key={a} cx={Math.sin((a * Math.PI) / 180) * 6} cy={-Math.cos((a * Math.PI) / 180) * 6} r={1.3} fill="#1F2937" />)}
                </g>
              </svg>
            </div>
            {/* 떠오르는 글자 */}
            {fx.map(f => (
              <div key={f.id} className="sc-fx" style={{ position: 'absolute', left: OX + f.x, top: TOP + f.y - 70, transform: 'translateX(-50%)', zIndex: 900, fontSize: 13, fontWeight: 900, color: f.color, textShadow: '0 1px 0 #fff, 0 0 6px #fff', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{f.text}</div>
            ))}
            {/* 골! */}
            {goalBanner && (
              <div className="sc-goal" style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 64, fontWeight: 900, color: '#FACC15', textShadow: '0 4px 0 #0F172A, 0 0 24px rgba(250,204,21,0.8)', letterSpacing: 4 }}>GOAL!</div>
                <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: '#fff', background: 'rgba(15,23,42,0.75)', padding: '4px 14px', borderRadius: 99 }}>
                  {goalBanner.own ? `😱 자책골 (${nameOfSeat(seats, goalBanner.by, myId)})` : `⚽ ${nameOfSeat(seats, goalBanner.by, myId)}`} · {props.teams[goalBanner.team].name}
                </div>
              </div>
            )}
            {countdown > 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.25)' }}>
                <div className="sc-pop" key={countdown} style={{ fontSize: 72, fontWeight: 900, color: '#fff', textShadow: '0 4px 0 #0F172A' }}>{countdown}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(15,23,42,0.7)', padding: '4px 12px', borderRadius: 99 }}>{me ? `나는 ${props.teams[me.team].name} · ${me.team === 'A' ? '오른쪽' : '왼쪽'} 골대로 공격` : ''}</div>
              </div>
            )}
            {lost && (
              <div style={{ position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)', zIndex: 1100, background: '#0F172A', color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 99 }}>방장 연결이 끊겼어요… 잠시 기다리거나 나가기</div>
            )}
            {result && <ResultCard r={result} teams={props.teams} myId={myId} note={props.resultNote ?? null} onExit={props.onExit} onRestart={props.onRestart} />}
          </div>
        </div>
      </div>
      <p style={{ marginTop: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>
        <Kbd>방향키</Kbd> 이동 · <Kbd>E</Kbd> 달리기 · <Kbd>D</Kbd> 누른 만큼 센 <b>슛</b> · <Kbd>S</Kbd> <b>패스</b> · <Kbd>A</Kbd> <b>태클</b> ·{' '}
        <Kbd>X</Kbd> 공 있으면 <b>개인기</b>(태클·박치기 피함) / 없으면 <b>몸통박치기</b>
      </p>
    </div>
  )
}

function nameOfSeat(seats: SoccerSeat[], id: string | null, myId: string) {
  if (!id) return '?'
  if (id === myId) return '나'
  return seats.find(s => s.id === id)?.name ?? '?'
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function TeamBadge({ info, side, mine }: { info: SoccerTeamInfo; side: Team; mine: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexDirection: side === 'A' ? 'row' : 'row-reverse' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl(info.club)} alt="" width={22} height={22} style={{ objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 1 }} />
      <span style={{ fontSize: 11.5, fontWeight: 800, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: mine ? '#FACC15' : '#E2E8F0' }}>{info.name}</span>
    </span>
  )
}

function CoolChip({ label, left, total }: { label: string; left: number; total: number }) {
  const ready = left <= 0
  return (
    <span style={{ position: 'relative', overflow: 'hidden', display: 'inline-block', padding: '1px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 800, background: ready ? '#DCFCE7' : '#F1F5F9', color: ready ? '#15803D' : '#94A3B8' }}>
      {!ready && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(1 - left / total) * 100}%`, background: '#E2E8F0' }} />}
      <span style={{ position: 'relative' }}>{label}{ready ? ' ✓' : ''}</span>
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd style={{ border: '1px solid #CBD5E1', borderBottomWidth: 2, borderRadius: 5, background: '#fff', padding: '0 4px', fontSize: 10.5, fontWeight: 800, color: '#334155' }}>{children}</kbd>
}

// 경기장 바닥(잔디 줄무늬·선·골대)
function Pitch() {
  const stripes = 10
  const sw = FIELD_W / stripes
  const cy = FIELD_H / 2
  const box = { w: 110, h: 250 }
  return (
    <svg width={BOX_W} height={BOX_H} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <pattern id="sc-net" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 0 L6 6 M6 0 L0 6" stroke="#fff" strokeWidth="0.7" opacity="0.6" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={BOX_W} height={BOX_H} fill="#2B6F35" />
      <g transform={`translate(${OX} ${TOP})`}>
        {Array.from({ length: stripes }, (_, i) => <rect key={i} x={i * sw} y={0} width={sw} height={FIELD_H} fill={i % 2 ? '#3E9A4C' : '#45A653'} />)}
        <g fill="none" stroke="#fff" strokeWidth={2.5} opacity={0.85}>
          <rect x={0} y={0} width={FIELD_W} height={FIELD_H} rx={4} />
          <line x1={FIELD_W / 2} y1={0} x2={FIELD_W / 2} y2={FIELD_H} />
          <circle cx={FIELD_W / 2} cy={cy} r={62} />
          <rect x={0} y={cy - box.h / 2} width={box.w} height={box.h} />
          <rect x={FIELD_W - box.w} y={cy - box.h / 2} width={box.w} height={box.h} />
          <path d={`M${box.w} ${cy - 40} A 46 46 0 0 1 ${box.w} ${cy + 40}`} />
          <path d={`M${FIELD_W - box.w} ${cy - 40} A 46 46 0 0 0 ${FIELD_W - box.w} ${cy + 40}`} />
        </g>
        <circle cx={FIELD_W / 2} cy={cy} r={3} fill="#fff" />
        {/* 골대 */}
        {[0, 1].map(side => {
          const x = side === 0 ? -GOAL_DEPTH : FIELD_W
          return (
            <g key={side}>
              <rect x={x} y={GOAL_TOP} width={GOAL_DEPTH} height={GOAL_BOT - GOAL_TOP} fill="rgba(255,255,255,0.12)" />
              <rect x={x} y={GOAL_TOP} width={GOAL_DEPTH} height={GOAL_BOT - GOAL_TOP} fill="url(#sc-net)" />
              <path d={side === 0 ? `M0 ${GOAL_TOP} L${-GOAL_DEPTH} ${GOAL_TOP} L${-GOAL_DEPTH} ${GOAL_BOT} L0 ${GOAL_BOT}` : `M${FIELD_W} ${GOAL_TOP} L${FIELD_W + GOAL_DEPTH} ${GOAL_TOP} L${FIELD_W + GOAL_DEPTH} ${GOAL_BOT} L${FIELD_W} ${GOAL_BOT}`} fill="none" stroke="#fff" strokeWidth={3} />
              <circle cx={side === 0 ? 0 : FIELD_W} cy={GOAL_TOP} r={4} fill="#fff" />
              <circle cx={side === 0 ? 0 : FIELD_W} cy={GOAL_BOT} r={4} fill="#fff" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function ResultCard({ r, teams, myId, note, onExit, onRestart }: { r: SoccerResult; teams: Record<Team, SoccerTeamInfo>; myId: string; note: string | null; onExit?: () => void; onRestart?: () => void }) {
  const win = r.winner === r.myTeam
  const title = r.winner === 'draw' ? '🤝 무승부' : win ? '🏆 승리!' : '😵 아쉽게 패배'
  const mvp = [...r.players].sort((a, b) => b.goals * 3 + b.steals - (a.goals * 3 + a.steals))[0]
  return (
    <div className="sc-pop" style={{ position: 'absolute', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 900 }}>{title}</div>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 800, marginTop: 2, color: '#475569' }}>{teams.A.name} {r.score.A} : {r.score.B} {teams.B.name}</div>
        {mvp && (mvp.goals > 0 || mvp.steals > 0) && <div style={{ textAlign: 'center', fontSize: 12.5, marginTop: 6, color: '#B45309', fontWeight: 800 }}>⭐ MVP {mvp.id === myId ? '나' : mvp.name}</div>}
        <table style={{ width: '100%', marginTop: 10, fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: '#94A3B8', fontSize: 11 }}><th style={{ textAlign: 'left' }}>선수</th><th>⚽ 골</th><th>🦶 슛</th><th>🛡 뺏기</th></tr></thead>
          <tbody>
            {r.players.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #F1F5F9', fontWeight: p.id === myId ? 800 : 500 }}>
                <td style={{ padding: '4px 0' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: teams[p.team].ring, marginRight: 6 }} />{p.id === myId ? '나' : p.name}{p.cpu ? ' 🤖' : ''}</td>
                <td style={{ textAlign: 'center' }}>{p.goals}</td>
                <td style={{ textAlign: 'center' }}>{p.shots}</td>
                <td style={{ textAlign: 'center' }}>{p.steals}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {note && <p style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: '#15803D', fontWeight: 700 }}>{note}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          {onRestart && <button onClick={onRestart} style={{ ...btn, background: '#0F172A', color: '#fff' }}>🔄 한 판 더</button>}
          {onExit && <button onClick={onExit} style={btn}>나가기</button>}
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: 12.5, fontWeight: 800, background: '#F1F5F9', color: '#0F172A', cursor: 'pointer' }

const SOCCER_CSS = `
@keyframes sc-fx { from { opacity: 1; transform: translate(-50%, 0) } to { opacity: 0; transform: translate(-50%, -26px) } }
.sc-fx { animation: sc-fx 1.1s ease-out forwards }
@keyframes sc-pop { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.sc-pop { animation: sc-pop 260ms cubic-bezier(.2,1.4,.4,1) }
@keyframes sc-goal { 0% { transform: scale(0.3); opacity: 0 } 25% { transform: scale(1.15); opacity: 1 } 40% { transform: scale(1) } 100% { opacity: 1 } }
.sc-goal { animation: sc-goal 700ms ease-out }
@keyframes sc-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
.sc-bob { animation: sc-bob 700ms ease-in-out infinite }
@keyframes sc-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
.sc-spin { animation: sc-spin 700ms linear infinite }
`

