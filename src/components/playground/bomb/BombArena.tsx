'use client'

// 💣 폭탄 놀이터 경기 화면 — 연습판(혼자) · 팀전(CPU / 실시간). 규칙 src/lib/bomb.ts, CPU bombCpu.ts, 통신 bombNet.ts.
// 시간은 서버 시계 기준(startAt, offset) — 실시간이면 모든 화면에서 폭탄이 같은 순간에 터진다.
// net이 없으면 이 PC가 전부 진행(나 + CPU). net.role = 'host'면 세계 진행 + 방송, 'guest'면 내 몸만 진행 + 내 위치 보냄.
// 조작: 방향키/WASD 이동, Space(또는 J) 폭탄.

import { memo, useEffect, useRef, useState } from 'react'
import Critter, { CRITTER_CSS, type CritterLook } from './Critter'
import {
  CELL_BLOCK, CELL_WALL, COLS, FUSE_SEC, ROWS, idx, mulberry32, newBombState, placeBomb, playerSpeed, stepBomb,
  type BombInput, type BombMode, type BombPlayer, type BombState, type Cell, type Dir, type Flame, type ItemKind, type Team,
} from '@/lib/bomb'
import { cpuInput, newCpuMem, type CpuMem } from '@/lib/bombCpu'
import {
  GUEST_LOST_MS, HOST_LOST_MS, WORLD_EVERY_MS, applyGuest, applyWorld, dirCode, encodeWorld, predictPos, shouldSendPos,
  type BombWire, type GuestLocal, type GuestMsg, type WorldMsg,
} from '@/lib/bombNet'

const T = 44 // 한 칸 px
const W = COLS * T
const H = ROWS * T
const STEP = 1 / 60

export const TEAM_COLOR: Record<Team, { main: string; soft: string; name: string }> = {
  A: { main: '#3f86f0', soft: '#dcebff', name: '파랑팀' },
  B: { main: '#f2734f', soft: '#ffe3d9', name: '주황팀' },
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
}

const ITEM_BG: Record<ItemKind, string> = { fire: '#ffe1d1', bomb: '#dfe6ff', speed: '#fff3c4' }
const ITEM_NAME: Record<ItemKind, string> = { fire: '범위 +1', bomb: '개수 +1', speed: '속도 +1' }

export interface ArenaSeat {
  id: string
  name: string
  look: CritterLook
  team: Team
  cpu: boolean
}

export interface BombNetCtl {
  role: 'host' | 'guest'
  send: (m: BombWire) => void // host: 세계 방송 / guest: 방장에게
  listen: (fn: ((m: BombWire) => void) | null) => void
}

export interface BombResult {
  winner: Team | 'draw' | null
  myTeam: Team
  players: { id: string; name: string; team: Team; hits: number; rescues: number; pops: number }[]
  practiceTime?: number
}

type Fx = { id: number; x: number; y: number; text: string; color: string; until: number }

export default function BombArena(props: {
  mode: BombMode
  seats: ArenaSeat[]
  myId: string
  seed: number
  startAt?: number // 서버 시각(ms). 없으면 지금
  offset?: number // 서버시각 = Date.now() + offset
  net?: BombNetCtl
  prepare?: (s: BombState) => void // 목업 시연용
  onEnd?: (r: BombResult) => void
  onRestart?: () => void
  onExit?: () => void
  exitLabel?: string
  resultNote?: string | null // 결과 화면에 덧붙일 한 줄 (🪙 보상 등)
}) {
  const { mode, seats, myId, seed, net } = props
  const role = net?.role ?? 'local'
  const offset = props.offset ?? 0
  const [startAt] = useState(() => props.startAt ?? Date.now() + offset + (mode === 'versus' ? 2500 : 0))
  const [initial] = useState(() => {
    const s = newBombState(seed, seats.map(st => ({ id: st.id, team: st.team })), 0.72, mode)
    props.prepare?.(s)
    return s
  })
  const sRef = useRef<BombState>(initial)
  const [view, setView] = useState(() => ({ s: initial, now: 0, shake: 0, fx: [] as Fx[], disp: {} as Record<string, { x: number; y: number }>, lost: false, done: null as number | null, lag: null as number | null }))
  const dirs = useRef<Dir[]>([])
  const bombPressed = useRef(false)
  const shakeUntil = useRef(0)
  const fxRef = useRef<Fx[]>([])
  const fxId = useRef(0)
  const [scale, setScale] = useState(1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<number | null>(null)
  const endedSent = useRef(false)
  const onEndRef = useRef(props.onEnd)
  useEffect(() => { onEndRef.current = props.onEnd })

  // ── 키 입력 — 나중에 누른 방향이 우선
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const d = KEY_DIR[e.code]
      if (d) {
        e.preventDefault()
        dirs.current = [...dirs.current.filter(x => x !== d), d]
      }
      if (e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault()
        if (!e.repeat) bombPressed.current = true
      }
    }
    const up = (e: KeyboardEvent) => {
      const d = KEY_DIR[e.code]
      if (d) dirs.current = dirs.current.filter(x => x !== d)
    }
    const blur = () => (dirs.current = [])
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // ── 통신 받기
  const inbox = useRef<BombWire[]>([])
  useEffect(() => {
    if (!net) return
    net.listen(m => inbox.current.push(m))
    return () => net.listen(null)
  }, [net])

  // ── 게임 루프
  useEffect(() => {
    const s = sRef.current
    const cpuIds = new Set(seats.filter(st => st.cpu).map(st => st.id))
    const mems: Record<string, CpuMem> = {}
    const rnd = mulberry32(seed ^ 0x5bd1e995)
    for (const st of seats) mems[st.id] = newCpuMem(mulberry32(Math.floor(rnd() * 1e9)))
    const guestSeen: Record<string, number> = {} // 방장: 참가자별 마지막 소식(ms)
    const recvAt: Record<string, number> = {} // 위치를 받은 시각(ms) — 부드럽게 그리기용
    const disp: Record<string, { x: number; y: number }> = {}
    const guest: GuestLocal = { myId, hitAt: null, pending: [] }
    let lastWorldSent = 0
    let urgentWorld = false
    let lastWorldRecv = Date.now()
    let lastPos: { x: number; y: number; d: number; m: 0 | 1; at: number } | null = null
    let lag: number | null = null // 참가자: 방장 소식이 몇 ms 늦게 오는지 (서버 시계 기준)
    let pendingId = -1
    let raf = 0
    const humanRemote = new Set(seats.filter(st => !st.cpu && st.id !== myId).map(st => st.id))
    if (role === 'host') for (const id of humanRemote) guestSeen[id] = Date.now() + 4000 // 시작 직후엔 여유

    const nowT = () => (Date.now() + offset - startAt) / 1000
    const addFx = (p: BombPlayer, text: string, color: string) => {
      fxRef.current.push({ id: fxId.current++, x: p.x, y: p.y, text, color, until: s.t + 1.1 })
    }
    const handleEvents = () => {
      for (const ev of s.events) {
        if (ev.kind === 'boom') shakeUntil.current = s.t + 0.12
        const p = 'id' in ev ? s.players.find(o => o.id === ev.id) : undefined
        if (ev.kind === 'rescue' && p) addFx(p, '💖 구출!', '#ff5c8a')
        if (ev.kind === 'pop' && p) addFx(p, '💥 탈락', '#f2734f')
        if (ev.kind === 'timeout' && p) addFx(p, '⌛ 탈락', '#8a94a6')
        if (ev.kind === 'hit' && p && s.mode === 'versus') addFx(p, '앗!', '#3d2b2b')
        if (ev.kind === 'pickup' && p && p.id === myId) addFx(p, ITEM_NAME[ev.item], '#2f9e5a')
        if (role === 'host' && (ev.kind === 'place' || ev.kind === 'hit' || ev.kind === 'rescue' || ev.kind === 'pop' || ev.kind === 'end' || ev.kind === 'timeout')) urgentWorld = true
        if (role === 'guest' && ev.kind === 'hit' && ev.id === myId) {
          guest.hitAt = s.t
          net?.send({ k: 'h', id: myId, by: ev.by, at: s.t })
        }
      }
      s.events = []
    }

    const tick = () => {
      const target = nowT()
      const nowMs = Date.now()
      // 받은 소식 처리
      if (net) {
        const msgs = inbox.current
        inbox.current = []
        if (role === 'host') {
          for (const m of msgs) {
            if (m.k === 'w') continue
            const g = m as GuestMsg
            guestSeen[g.id] = nowMs
            if (g.k === 'q') {
              guestSeen[g.id] = 0
              continue
            }
            if (applyGuest(s, g) && g.k === 'p') recvAt[g.id] = nowMs
          }
          handleEvents()
        } else {
          const worlds = msgs.filter((m): m is WorldMsg => m.k === 'w')
          const latest = worlds[worlds.length - 1]
          if (latest) {
            lastWorldRecv = nowMs
            const l = Math.max(0, (target - latest.t) * 1000)
            lag = lag === null ? l : lag * 0.8 + l * 0.2
            const hadEnd = s.endedAt
            if (latest.t >= s.t - 1.5) {
              // 이벤트 연출용: 방장 소식으로 바뀐 상태(부활·탈락) 감지
              const before = new Map(s.players.map(p => [p.id, p.status]))
              applyWorld(s, latest, guest, Math.max(0, target))
              for (const p of s.players) {
                const was = before.get(p.id)
                if (was === 'ghost' && p.status === 'alive') addFx(p, '💖 구출!', '#ff5c8a')
                if (was !== 'out' && p.status === 'out') addFx(p, '💥 탈락', '#f2734f')
                recvAt[p.id] = nowMs
              }
              if (hadEnd === null && s.endedAt !== null) urgentWorld = false
            }
          }
          if (nowMs - lastWorldRecv > HOST_LOST_MS && s.endedAt === null) {
            setView(v => ({ ...v, lost: true }))
          }
        }
      }

      // 시간 진행
      if (target > 0 && s.endedAt === null && doneRef.current === null) {
        let n = 0
        while (s.t + STEP <= target && n < 12) {
          const myInput: BombInput = { dir: dirs.current[dirs.current.length - 1] ?? null, bomb: bombPressed.current }
          bombPressed.current = false
          const me = s.players.find(p => p.id === myId)
          if (role === 'guest') {
            if (myInput.bomb && me && placeBomb(s, me)) {
              const b = s.bombs[s.bombs.length - 1]
              b.id = pendingId--
              guest.pending.push({ ...b })
              net?.send({ k: 'b', id: myId, cx: b.cx, cy: b.cy, at: b.placedAt })
            }
            stepBomb(s, { [myId]: { dir: myInput.dir, bomb: false } }, STEP, { move: new Set([myId]), hit: new Set([myId]), world: true, judge: false })
          } else {
            const inputs: Record<string, BombInput> = { [myId]: myInput }
            const local = new Set<string>([myId])
            for (const p of s.players) {
              const lost = role === 'host' && humanRemote.has(p.id) && nowMs - (guestSeen[p.id] ?? 0) > GUEST_LOST_MS
              if (cpuIds.has(p.id) || lost || (role === 'local' && p.id !== myId)) {
                inputs[p.id] = cpuInput(s, p, mems[p.id])
                local.add(p.id)
              }
            }
            stepBomb(s, inputs, STEP, { move: local, hit: local, world: true, judge: true })
          }
          handleEvents()
          if (s.mode === 'practice' && s.blocksLeft <= 0 && s.bombs.length === 0 && doneRef.current === null) doneRef.current = s.t
          n++
        }
      }

      // 보내기
      if (role === 'host' && net && (urgentWorld ? nowMs - lastWorldSent > 60 : nowMs - lastWorldSent >= WORLD_EVERY_MS)) {
        net.send(encodeWorld(s))
        lastWorldSent = nowMs
        urgentWorld = false
      }
      if (role === 'guest' && net) {
        const me = s.players.find(p => p.id === myId)
        if (me && me.status !== 'out') {
          const cur = { x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, d: dirCode(me.dir), m: (me.moving ? 1 : 0) as 0 | 1 }
          if (shouldSendPos(lastPos, cur, nowMs)) {
            net.send({ k: 'p', id: myId, ...cur })
            lastPos = { ...cur, at: nowMs }
          }
        }
      }

      // 다른 사람(내가 직접 안 움직이는 사람) 부드럽게
      for (const p of s.players) {
        const remote = role === 'guest' ? p.id !== myId : role === 'host' ? humanRemote.has(p.id) && nowMs - (guestSeen[p.id] ?? 0) <= GUEST_LOST_MS : false
        if (!remote) {
          disp[p.id] = { x: p.x, y: p.y }
          continue
        }
        const tgt = predictPos(p, (nowMs - (recvAt[p.id] ?? nowMs)) / 1000, playerSpeed(p))
        const d = disp[p.id] ?? tgt
        const far = Math.abs(d.x - tgt.x) + Math.abs(d.y - tgt.y) > 2
        disp[p.id] = far ? tgt : { x: d.x + (tgt.x - d.x) * 0.35, y: d.y + (tgt.y - d.y) * 0.35 }
      }

      // 끝
      if (s.endedAt !== null && !endedSent.current) {
        endedSent.current = true
        if (role === 'host' && net) for (const ms of [0, 150, 400]) setTimeout(() => net.send(encodeWorld(s)), ms)
        const myTeam = s.players.find(p => p.id === myId)?.team ?? 'A'
        onEndRef.current?.({
          winner: s.winner, myTeam,
          players: s.players.map(p => ({ id: p.id, name: seats.find(st => st.id === p.id)?.name ?? '?', team: p.team, hits: p.hits, rescues: p.rescues, pops: p.pops })),
        })
      }
      if (doneRef.current !== null && !endedSent.current) {
        endedSent.current = true
        onEndRef.current?.({ winner: null, myTeam: 'A', players: [], practiceTime: doneRef.current })
      }

      fxRef.current = fxRef.current.filter(f => f.until > s.t)
      setView(v => ({
        ...v, s, now: target, fx: [...fxRef.current], disp: { ...disp }, done: doneRef.current, lag,
        shake: s.t < shakeUntil.current ? Math.sin(s.t * 120) * 2.5 : 0,
      }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      if (role === 'guest' && s.endedAt === null) net?.send({ k: 'q', id: myId })
    }
    // 판 하나 동안 고정 (seats·seed·net은 key로 새로 만든다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 화면 폭에 맞춰 판 크기 줄이기
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { s, now, shake, fx, disp, lost, done, lag } = view
  const me = s.players.find(p => p.id === myId)
  const seatOf = (id: string) => seats.find(st => st.id === id)
  const countdown = now < 0 ? Math.ceil(-now) : 0
  const timeLeft = s.timeLimit ? Math.max(0, s.timeLimit - Math.max(0, s.t)) : 0
  const versus = s.mode === 'versus'

  return (
    <div style={{ color: '#3d2b2b' }}>
      <style>{CRITTER_CSS + ARENA_CSS}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        {me && (
          <>
            <Stat icon={<ItemIcon kind="fire" size={15} />} label="범위" value={me.range} />
            <Stat icon={<ItemIcon kind="bomb" size={15} />} label="개수" value={me.maxBombs} />
            <Stat icon={<ItemIcon kind="speed" size={15} />} label="속도" value={me.speedLv + 1} />
          </>
        )}
        {versus ? (
          <>
            <Stat icon="⏱" label="남은 시간" value={fmt(timeLeft, false)} />
            <TeamBar s={s} seats={seats} />
          </>
        ) : (
          <>
            <Stat icon="📦" label="남은 상자" value={s.blocksLeft} />
            <Stat icon="⏱" label="시간" value={fmt(done ?? Math.max(0, s.t), true)} />
            {me && <Stat icon="💥" label="맞음" value={me.hits} />}
          </>
        )}
        <div style={{ flex: 1 }} />
        {role === 'guest' && lag !== null && <span style={{ fontSize: 11.5, opacity: 0.6 }} title="방장 화면 소식이 내 화면에 오기까지 걸리는 시간">📶 {Math.round(lag)}ms</span>}
        {role === 'host' && <span style={{ fontSize: 11.5, opacity: 0.6 }}>👑 방장</span>}
        {props.onRestart && role === 'local' && <button onClick={props.onRestart} style={btn}>🔄 새 판</button>}
        {props.onExit && <button onClick={props.onExit} style={btn}>{props.exitLabel ?? '나가기'}</button>}
      </div>

      <div ref={wrapRef} style={{ width: '100%', maxWidth: W }}>
        <div style={{ width: W * scale, height: H * scale, position: 'relative' }}>
          <div
            style={{
              width: W, height: H, position: 'absolute', left: 0, top: 0, transform: `scale(${scale}) translate(${shake}px, 0)`, transformOrigin: '0 0',
              borderRadius: 14, overflow: 'hidden', boxShadow: '0 6px 20px rgba(60,90,40,.25)',
              background: 'repeating-conic-gradient(#bde8a6 0% 25%, #b1e199 0% 50%) 0 0 / 88px 88px',
            }}
          >
            <StaticLayer grid={s.grid} version={s.gridVersion} />

            {Object.entries(s.items).map(([k, it]) => {
              const i = Number(k)
              const cx = i % COLS
              const cy = Math.floor(i / COLS)
              return (
                <div key={`it${k}`} className="ba-item" title={ITEM_NAME[it.kind]} style={{ position: 'absolute', left: cx * T + 7, top: cy * T + 7, width: T - 14, height: T - 14, zIndex: cy * 10 + 3, borderRadius: 99, background: ITEM_BG[it.kind], border: '2px solid #fff', boxShadow: '0 2px 5px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon kind={it.kind} />
                </div>
              )
            })}

            {s.bombs.map(b => {
              const left = Math.max(0, b.explodeAt - s.t)
              const hurry = Math.min(1, Math.max(0, 1 - left / FUSE_SEC))
              const pulse = 1 + Math.sin(s.t * (8 + hurry * 22)) * (0.04 + hurry * 0.06)
              return (
                <div key={`b${b.id}-${b.cx}-${b.cy}`} style={{ position: 'absolute', left: b.cx * T, top: b.cy * T - 4, width: T, height: T, zIndex: b.cy * 10 + 4, transform: `scale(${pulse})`, transformOrigin: '50% 85%' }}>
                  <BombSprite hurry={hurry} />
                </div>
              )
            })}

            {s.flames.map(f => <FlameCell key={`f${f.cx}-${f.cy}`} f={f} t={s.t} />)}

            {s.players.map(p => {
              if (p.status === 'out') return null
              const st = seatOf(p.id)
              if (!st) return null
              const d = disp[p.id] ?? { x: p.x, y: p.y }
              const ghost = p.status === 'ghost'
              const shielded = s.t < p.shieldUntil
              const isMe = p.id === myId
              const tc = TEAM_COLOR[p.team]
              return (
                <div key={p.id} style={{ position: 'absolute', left: d.x * T + T / 2, top: d.y * T + T - 2, zIndex: Math.round(d.y) * 10 + 6, pointerEvents: 'none' }}>
                  {versus && <div style={{ position: 'absolute', left: -15, top: -7, width: 30, height: 10, borderRadius: 99, border: `2.5px solid ${tc.main}`, opacity: ghost ? 0.4 : 0.85 }} />}
                  <div
                    style={{
                      position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, -96%)',
                      opacity: ghost ? 0.5 : shielded && Math.floor(s.t * 10) % 2 ? 0.35 : 1,
                      filter: ghost ? 'grayscale(1) brightness(1.25)' : undefined,
                    }}
                  >
                    <div className={ghost ? 'ba-ghost' : p.moving ? 'ba-walk' : undefined} style={{ transform: p.dir === 'left' ? 'scaleX(-1)' : undefined }}>
                      <Critter look={st.look} size={T * 1.2} animate={!p.moving && !ghost} />
                    </div>
                  </div>
                  {(versus || !isMe) && (
                    <div style={{ position: 'absolute', left: 0, top: -T * 1.42, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: isMe ? tc.main : '#ffffffe6', color: isMe ? '#fff' : '#3d2b2b', border: `1.5px solid ${tc.main}` }}>
                      {isMe ? '나' : st.name}{st.cpu ? ' 🤖' : ''}
                    </div>
                  )}
                  {ghost && versus && (
                    <div className="ba-help" style={{ position: 'absolute', left: 0, top: -T * 1.95, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, color: tc.main }}>
                      구해줘! {Math.max(0, Math.ceil(p.ghostUntil - s.t))}
                    </div>
                  )}
                  {ghost && !versus && <div style={{ position: 'absolute', top: -T * 1.4, left: 0, transform: 'translateX(-50%)', fontSize: 16 }}>💫</div>}
                </div>
              )
            })}

            {fx.map(f => (
              <div key={f.id} style={{ position: 'absolute', left: f.x * T + T / 2, top: f.y * T - T * 0.9 - (1.1 - (f.until - s.t)) * 26, transform: 'translateX(-50%)', zIndex: 900, fontSize: 14, fontWeight: 900, color: f.color, textShadow: '0 1px 0 #fff, 0 0 4px #fff', opacity: Math.min(1, (f.until - s.t) * 2), pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                {f.text}
              </div>
            ))}

            {countdown > 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,250,240,.35)' }}>
                <div key={countdown} className="ba-count" style={{ fontSize: 84, fontWeight: 900, color: '#ff8a5c', textShadow: '0 4px 0 #fff' }}>{countdown}</div>
              </div>
            )}

            {(s.endedAt !== null || done !== null || lost) && (
              <ResultPanel s={s} seats={seats} myId={myId} done={done} lost={lost} note={props.resultNote ?? null} onRestart={role === 'local' ? props.onRestart : undefined} onExit={props.onExit} exitLabel={props.exitLabel} />
            )}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, opacity: 0.65, marginTop: 8 }}>
        방향키·WASD 이동 · Space 폭탄 · 폭탄은 {FUSE_SEC}초 뒤 십자로 터져요.{versus ? ' 맞으면 유령 — 같은 팀이 닿으면 부활, 상대가 닿으면 탈락!' : ' 상자에서 범위·개수·속도 아이템이 나와요.'}
      </div>
    </div>
  )
}

function TeamBar({ s, seats }: { s: BombState; seats: ArenaSeat[] }) {
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      {(['A', 'B'] as Team[]).map(t => (
        <div key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: TEAM_COLOR[t].soft, borderRadius: 99, padding: '3px 8px', border: `1.5px solid ${TEAM_COLOR[t].main}` }}>
          {s.players.filter(p => p.team === t).map(p => (
            <span key={p.id} title={`${seats.find(st => st.id === p.id)?.name ?? ''} · ${p.status === 'alive' ? '살아 있음' : p.status === 'ghost' ? '유령' : '탈락'}`}
              style={{ width: 12, height: 12, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff',
                background: p.status === 'alive' ? TEAM_COLOR[t].main : p.status === 'ghost' ? '#fff' : '#c9ccd3', border: `2px ${p.status === 'ghost' ? 'dashed' : 'solid'} ${p.status === 'out' ? '#c9ccd3' : TEAM_COLOR[t].main}` }}>
              {p.status === 'out' ? '×' : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function ResultPanel({ s, seats, myId, done, lost, note, onRestart, onExit, exitLabel }: { s: BombState; seats: ArenaSeat[]; myId: string; done: number | null; lost: boolean; note: string | null; onRestart?: () => void; onExit?: () => void; exitLabel?: string }) {
  const me = s.players.find(p => p.id === myId)
  const seat = seats.find(st => st.id === myId)
  let title = ''
  if (lost) title = '방장과 연결이 끊겼어요 😢'
  else if (done !== null) title = '상자를 다 부쉈어요! 🎉'
  else if (s.winner === 'draw') title = '무승부! 🤝'
  else if (s.winner) title = me?.team === s.winner ? '승리! 🏆' : '아쉽게 패배 😵'
  const winners = s.winner && s.winner !== 'draw' ? s.players.filter(p => p.team === s.winner) : []
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 999, background: 'rgba(255,250,240,.86)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      {winners.length ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {winners.map(p => {
            const st = seats.find(x => x.id === p.id)
            return st ? <div key={p.id} className="ba-win"><Critter look={st.look} size={96} /></div> : null
          })}
        </div>
      ) : (
        seat && <div className="critter-bob"><Critter look={seat.look} size={110} /></div>
      )}
      <div style={{ fontSize: 26, fontWeight: 900 }}>{title}</div>
      {s.winner && s.winner !== 'draw' && <div style={{ fontSize: 15, fontWeight: 800, color: TEAM_COLOR[s.winner].main }}>{TEAM_COLOR[s.winner].name} 승</div>}
      {done !== null && me && <div style={{ fontSize: 16 }}>⏱ {fmt(done, true)} · 💥 맞은 횟수 {me.hits}</div>}
      {s.mode === 'versus' && (
        <table style={{ fontSize: 13, borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          <thead>
            <tr style={{ background: '#f6efe7' }}>
              {['', '구출', '터뜨림', '맞음'].map(h => <th key={h} style={{ padding: '5px 12px', fontWeight: 800 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {s.players.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #f0e6dc' }}>
                <td style={{ padding: '4px 12px', fontWeight: 800, color: TEAM_COLOR[p.team].main }}>{p.id === myId ? '나' : seats.find(st => st.id === p.id)?.name}{seats.find(st => st.id === p.id)?.cpu ? ' 🤖' : ''}</td>
                <td style={{ textAlign: 'center' }}>{p.rescues}</td>
                <td style={{ textAlign: 'center' }}>{p.pops}</td>
                <td style={{ textAlign: 'center' }}>{p.hits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note && <div className="ba-note" style={{ fontSize: 15, fontWeight: 900, color: '#8a5a00', background: '#FFE9A8', borderRadius: 99, padding: '5px 14px' }}>{note}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {onRestart && <button onClick={onRestart} style={{ ...btn, fontSize: 15, padding: '8px 18px', background: '#ff8a5c', color: '#fff', borderColor: '#ff8a5c' }}>한 판 더</button>}
        {onExit && <button onClick={onExit} style={{ ...btn, fontSize: 15, padding: '8px 18px' }}>{exitLabel ?? '나가기'}</button>}
      </div>
    </div>
  )
}

function fmt(t: number, tenths: boolean) {
  const m = Math.floor(t / 60)
  const sec = tenths ? (t % 60).toFixed(1).padStart(4, '0') : String(Math.floor(t % 60)).padStart(2, '0')
  return `${m}:${sec}`
}

const btn: React.CSSProperties = { padding: '6px 12px', borderRadius: 99, border: '2px solid #eee2d8', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#3d2b2b' }

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 99, padding: '5px 11px', fontSize: 13, boxShadow: '0 2px 6px rgba(120,90,60,.1)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {icon} <span style={{ opacity: 0.6 }}>{label}</span> <b>{value}</b>
    </div>
  )
}

// 아이템 아이콘 (이모지는 OS마다 색이 달라서 직접 그림)
export function ItemIcon({ kind, size = 20 }: { kind: ItemKind; size?: number }) {
  if (kind === 'fire')
    return (
      <svg viewBox="0 0 20 20" width={size} height={size}>
        <path d="M10 1.5 C 13 5, 16.5 7.5, 16 12 C 15.6 16, 12.8 18.5, 10 18.5 C 7 18.5, 4.2 16, 4 12.5 C 3.8 9.5, 5.8 8, 6.5 5.5 C 7.8 7, 8 8.5, 8.6 9.2 C 9.4 6.8, 9.2 4, 10 1.5 Z" fill="#ff7a3a" stroke="#d9531c" strokeWidth={1} strokeLinejoin="round" />
        <path d="M10 9 C 11.8 11, 13 12.4, 12.6 14.4 C 12.3 16, 11.2 16.8, 10 16.8 C 8.6 16.8, 7.5 15.8, 7.5 14.3 C 7.5 12.8, 8.8 12, 10 9 Z" fill="#ffe066" />
      </svg>
    )
  if (kind === 'bomb')
    return (
      <svg viewBox="0 0 20 20" width={size} height={size}>
        <circle cx={9} cy={12} r={6.5} fill="#3a3b3f" stroke="#232427" strokeWidth={1} />
        <ellipse cx={6.6} cy={9.6} rx={1.8} ry={1.2} transform="rotate(-30 6.6 9.6)" fill="#fff" opacity={0.5} />
        <rect x={7.2} y={4} width={3.6} height={2.6} rx={0.8} fill="#9a9ca3" />
        <path d="M9 4.2 q1 -2.6 4 -2.6" fill="none" stroke="#b9925e" strokeWidth={1.1} strokeLinecap="round" />
        <circle cx={13.6} cy={1.8} r={1.5} fill="#ffd34d" />
      </svg>
    )
  return (
    <svg viewBox="0 0 20 20" width={size} height={size}>
      <path d="M11.5 1.5 L4.5 11 H9.5 L8 18.5 L15.5 8.5 H10.5 Z" fill="#ffd34d" stroke="#d29a17" strokeWidth={1.1} strokeLinejoin="round" />
    </svg>
  )
}

// 벽·상자 — 상자가 부서질 때만 다시 그린다
const StaticLayer = memo(function StaticLayer({ grid }: { grid: Cell[]; version: number }) {
  const out: React.ReactNode[] = []
  for (let cy = 0; cy < ROWS; cy++)
    for (let cx = 0; cx < COLS; cx++) {
      const c = grid[idx(cx, cy)]
      if (c !== CELL_WALL && c !== CELL_BLOCK) continue
      const border = cx === 0 || cy === 0 || cx === COLS - 1 || cy === ROWS - 1
      out.push(
        <div key={`c${cx}-${cy}`} style={{ position: 'absolute', left: cx * T, top: cy * T - 6, width: T, height: T + 6, zIndex: cy * 10 + 2 }}>
          {c === CELL_BLOCK ? <Crate /> : border ? <Hedge /> : <Stone />}
        </div>,
      )
    }
  return <>{out}</>
}, (a, b) => a.version === b.version)

function Stone() {
  return (
    <svg viewBox="0 0 44 50" width={T} height={T + 6}>
      <rect x={2} y={8} width={40} height={40} rx={9} fill="#9aa6b8" />
      <rect x={2} y={2} width={40} height={38} rx={9} fill="#c9d2df" />
      <rect x={7} y={6} width={18} height={6} rx={3} fill="#e4eaf2" />
    </svg>
  )
}
function Hedge() {
  return (
    <svg viewBox="0 0 44 50" width={T} height={T + 6}>
      <rect x={0} y={8} width={44} height={42} rx={6} fill="#5f9e55" />
      <rect x={0} y={2} width={44} height={40} rx={8} fill="#79bb6c" />
      <circle cx={12} cy={14} r={5} fill="#8fcc80" />
      <circle cx={30} cy={24} r={4} fill="#8fcc80" />
      <circle cx={34} cy={10} r={2.5} fill="#ffd6e0" />
    </svg>
  )
}
function Crate() {
  return (
    <svg viewBox="0 0 44 50" width={T} height={T + 6}>
      <rect x={3} y={9} width={38} height={39} rx={6} fill="#c98a45" />
      <rect x={3} y={3} width={38} height={37} rx={6} fill="#eab06a" stroke="#c98a45" strokeWidth={2} />
      <path d="M9 9 L35 34 M35 9 L9 34" stroke="#d1964f" strokeWidth={3.5} strokeLinecap="round" />
      <rect x={6} y={6} width={32} height={31} rx={4} fill="none" stroke="#d1964f" strokeWidth={2.5} />
      <circle cx={8} cy={8} r={1.4} fill="#a86d32" />
      <circle cx={36} cy={8} r={1.4} fill="#a86d32" />
    </svg>
  )
}

function BombSprite({ hurry }: { hurry: number }) {
  return (
    <svg viewBox="0 0 44 44" width={T} height={T} style={{ overflow: 'visible' }}>
      <ellipse cx={22} cy={39} rx={12} ry={3} fill="#000" opacity={0.15} />
      <circle cx={22} cy={25} r={13.5} fill="#3a3b3f" stroke="#232427" strokeWidth={2} />
      <circle cx={22} cy={25} r={13.5} fill="#ff6a2a" opacity={hurry * 0.5} />
      <ellipse cx={16.5} cy={19.5} rx={4} ry={2.6} transform="rotate(-30 16.5 19.5)" fill="#fff" opacity={0.45} />
      <rect x={18} y={9.5} width={8} height={5} rx={1.6} fill="#9a9ca3" stroke="#66686e" strokeWidth={1.2} />
      <path d="M22 10 q2 -6 8 -6" fill="none" stroke="#b9925e" strokeWidth={2} strokeLinecap="round" />
      <g className="ba-spark" style={{ transformOrigin: '30px 4px' }}>
        <path d="M30 -1 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 Z" fill="#ffd34d" />
        <circle cx={30} cy={4} r={1.6} fill="#fff" />
      </g>
      <circle cx={18} cy={26} r={1.8} fill="#fff" />
      <circle cx={26} cy={26} r={1.8} fill="#fff" />
      <path d="M20 30 q2 1.6 4 0" fill="none" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  )
}

function FlameCell({ f, t }: { f: Flame; t: number }) {
  const life = f.until - t
  const age = t - f.at
  const op = Math.min(1, life / 0.18)
  const grow = Math.min(1, Math.max(0, age) / 0.07)
  const base: React.CSSProperties = { position: 'absolute', zIndex: f.cy * 10 + 5, opacity: op, pointerEvents: 'none' }
  const grad = 'radial-gradient(circle, #fffbe0 0%, #ffe066 35%, #ff9a3c 70%, #ff6a3a 100%)'
  if (f.arm === 'center') {
    const d = T * 0.95 * (0.6 + 0.4 * grow)
    return <div style={{ ...base, left: f.cx * T + (T - d) / 2, top: f.cy * T + (T - d) / 2, width: d, height: d, borderRadius: 99, background: grad, boxShadow: '0 0 14px #ffb347' }} />
  }
  const horiz = f.arm === 'left' || f.arm === 'right'
  const th = T * 0.62 * (0.5 + 0.5 * grow)
  const r = th / 2
  const endR = f.end ? r : 0
  const radius = horiz
    ? f.arm === 'right' ? `0 ${endR}px ${endR}px 0` : `${endR}px 0 0 ${endR}px`
    : f.arm === 'down' ? `0 0 ${endR}px ${endR}px` : `${endR}px ${endR}px 0 0`
  const lin = horiz
    ? 'linear-gradient(180deg, #ff7a3a 0%, #ffc04a 25%, #fffbe0 50%, #ffc04a 75%, #ff7a3a 100%)'
    : 'linear-gradient(90deg, #ff7a3a 0%, #ffc04a 25%, #fffbe0 50%, #ffc04a 75%, #ff7a3a 100%)'
  return (
    <div
      style={{
        ...base,
        left: horiz ? f.cx * T - 1 : f.cx * T + (T - th) / 2,
        top: horiz ? f.cy * T + (T - th) / 2 : f.cy * T - 1,
        width: horiz ? T + 2 : th,
        height: horiz ? th : T + 2,
        borderRadius: radius,
        background: lin,
        boxShadow: '0 0 10px #ffb347',
      }}
    />
  )
}

const ARENA_CSS = `
@keyframes ba-item { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
.ba-item { animation: ba-item 1.1s ease-in-out infinite; }
@keyframes ba-spark { 0%,100% { transform: scale(1) rotate(0) } 50% { transform: scale(1.35) rotate(20deg) } }
.ba-spark { animation: ba-spark .25s linear infinite; }
@keyframes ba-walk { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-3px) rotate(4deg) } }
.ba-walk > svg { animation: ba-walk .32s ease-in-out infinite; transform-origin: 50% 100%; }
@keyframes ba-ghost { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
.ba-ghost > svg { animation: ba-ghost 1s ease-in-out infinite; }
@keyframes ba-help { 0%,100% { transform: translateX(-50%) scale(1) } 50% { transform: translateX(-50%) scale(1.12) } }
.ba-help { animation: ba-help .6s ease-in-out infinite; }
@keyframes ba-count { 0% { transform: scale(1.6); opacity: 0 } 30% { transform: scale(1); opacity: 1 } 100% { transform: scale(.9); opacity: .8 } }
.ba-count { animation: ba-count .9s ease-out; }
@keyframes ba-win { 0%,100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-14px) rotate(6deg) } }
.ba-win { animation: ba-win .7s ease-in-out infinite; }
@keyframes ba-note { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.12) } 100% { transform: scale(1); opacity: 1 } }
.ba-note { animation: ba-note .45s ease-out; }
`
