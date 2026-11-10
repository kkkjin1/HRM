'use client'

// 💣 폭탄 놀이터 경기 화면 — 연습판(혼자) · 팀전(CPU / 실시간). 규칙 src/lib/bomb.ts, CPU bombCpu.ts, 통신 bombNet.ts.
// 시간은 서버 시계 기준(startAt, offset) — 실시간이면 모든 화면에서 폭탄이 같은 순간에 터진다.
// net이 없으면 이 PC가 전부 진행(나 + CPU). net.role = 'host'면 세계 진행 + 방송, 'guest'면 내 몸만 진행 + 내 위치 보냄.
// 조작: 방향키/WASD 이동, Space(또는 J) 폭탄.

import { memo, useEffect, useRef, useState } from 'react'
import Critter, { CRITTER_CSS, type CritterLook } from './Critter'
import {
  CELL_BLOCK, CELL_WALL, CELL_WATER, FUSE_SEC, MAPS, mulberry32, newBombState, placeBomb, playerSpeed, stepBomb,
  type BombInput, type BombMode, type BombPlayer, type BombState, type Cell, type Dir, type Flame, type ItemKind, type MapId, type Team,
} from '@/lib/bomb'
import { IceTile, PortalTile, THEMES, TILE, Water, type BombTheme } from './bombThemes'
import { cpuInput, newCpuMem, type CpuMem } from '@/lib/bombCpu'
import {
  GUEST_LOST_MS, HOST_LOST_MS, POS_MIN_BIG_MS, POS_MIN_MS, WORLD_EVERY_BIG_MS, WORLD_EVERY_MS, applyGuest, applyWorld, dirCode, encodeWorld, predictPos, shouldSendPos,
  type BombWire, type GuestLocal, type GuestMsg, type WorldMsg,
} from '@/lib/bombNet'
import { AFTER_OUT_SEC, Recorder, analyze, frameAt, playRate, type DeathStory, type Frame } from '@/lib/bombReplay'

const T = TILE // 한 칸 px — 판 크기(W·H)는 맵·인원마다 다르다
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
  map?: MapId
}) {
  const { mode, seats, myId, seed, net } = props
  const role = net?.role ?? 'local'
  const offset = props.offset ?? 0
  const [startAt] = useState(() => props.startAt ?? Date.now() + offset + (mode === 'versus' ? 2500 : 0))
  const [initial] = useState(() => {
    const s = newBombState(seed, seats.map(st => ({ id: st.id, team: st.team })), 0.72, mode, props.map ?? 'forest')
    props.prepare?.(s)
    return s
  })
  const sRef = useRef<BombState>(initial)
  const W = initial.cols * T
  const H = initial.rows * T
  const theme = THEMES[initial.map]
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
  // 🎬 리플레이: 최근 장면 기록 → 끝나면 내가 맞은 순간(없으면 결정적 장면)을 다시 보여 줌
  const recRef = useRef(new Recorder())
  const [replay, setReplay] = useState<ReplayData | null>(null)

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
    let lostNow = false // 방장 소식이 끊겼다고 보는 중 (다시 오면 풀린다)
    let lastPos: { x: number; y: number; d: number; m: 0 | 1; at: number } | null = null
    let lag: number | null = null // 참가자: 방장 소식이 몇 ms 늦게 오는지 (서버 시계 기준)
    let pendingId = -1
    let myOutAt: number | null = null
    let myClip: Frame[] | null = null
    let raf = 0
    const humanRemote = new Set(seats.filter(st => !st.cpu && st.id !== myId).map(st => st.id))
    const big = seats.filter(st => !st.cpu).length >= 5
    const worldEvery = big ? WORLD_EVERY_BIG_MS : WORLD_EVERY_MS
    const posMin = big ? POS_MIN_BIG_MS : POS_MIN_MS
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
        if (ev.kind === 'warp' && p) addFx(p, '✨ 슝!', '#2f9e8a')
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
            if (lostNow) {
              lostNow = false
              setView(v => ({ ...v, lost: false }))
            }
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
          // 시작 전(카운트다운·채널 연결 중)에는 세지 않는다
          if (target <= 0) lastWorldRecv = Math.max(lastWorldRecv, nowMs)
          else if (!lostNow && nowMs - lastWorldRecv > HOST_LOST_MS && s.endedAt === null) {
            lostNow = true
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
      if (role === 'host' && net && (urgentWorld ? nowMs - lastWorldSent > 60 : nowMs - lastWorldSent >= worldEvery)) {
        net.send(encodeWorld(s))
        lastWorldSent = nowMs
        urgentWorld = false
      }
      if (role === 'guest' && net) {
        const me = s.players.find(p => p.id === myId)
        if (me && me.status !== 'out') {
          const cur = { x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, d: dirCode(me.dir), m: (me.moving ? 1 : 0) as 0 | 1 }
          if (shouldSendPos(lastPos, cur, nowMs, posMin)) {
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
        const tgt = predictPos(p, (nowMs - (recvAt[p.id] ?? nowMs)) / 1000, playerSpeed(p, s))
        const d = disp[p.id] ?? tgt
        const far = Math.abs(d.x - tgt.x) + Math.abs(d.y - tgt.y) > 2
        disp[p.id] = far ? tgt : { x: d.x + (tgt.x - d.x) * 0.35, y: d.y + (tgt.y - d.y) * 0.35 }
      }

      // 🎬 기록 (팀전만) + 내가 탈락하면 그 장면을 잘라 둔다
      if (s.mode === 'versus' && target > 0) {
        recRef.current.rec(s)
        const meNow = s.players.find(p => p.id === myId)
        if (meNow?.status === 'out' && myOutAt === null) myOutAt = s.t
        if (myOutAt !== null && myClip === null && (s.t >= myOutAt + AFTER_OUT_SEC || s.endedAt !== null)) myClip = recRef.current.frames.slice()
      }

      // 끝
      if (s.endedAt !== null && !endedSent.current) {
        endedSent.current = true
        if (s.mode === 'versus') {
          const meEnd = s.players.find(p => p.id === myId)
          const died = myClip !== null || (!!meEnd && meEnd.status !== 'alive')
          const frames = myClip ?? recRef.current.frames.slice()
          const story = analyze(frames, died ? myId : undefined)
          if (story) setReplay({ frames, story, mine: died && story.targetId === myId, open: died, t: story.startT, playing: died, speed: 1 })
        }
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
  }, [W])

  // 🎬 리플레이 재생 — 맞는 순간·탈락 순간은 느리게
  const rOpen = !!replay?.open, rPlaying = !!replay?.playing
  useEffect(() => {
    if (!rOpen || !rPlaying) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      setReplay(r => {
        if (!r || !r.open || !r.playing) return r
        const nt = r.t + dt * playRate(r.story, r.t) * r.speed
        return nt >= r.story.endT ? { ...r, t: r.story.endT, playing: false } : { ...r, t: nt }
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [rOpen, rPlaying])

  const { s, now, shake, fx, disp, lost, done, lag } = view
  const rf = replay?.open ? frameAt(replay.frames, replay.t) : null
  const hl = rf ? replay!.story : null
  // 리플레이 중엔 기록된 장면을 같은 그림으로 그린다
  const bs: BombState = rf
    ? { ...s, t: rf.t, bombs: rf.bombs, flames: rf.flames, items: rf.items, grid: rf.grid, gridVersion: rf.gridVersion,
        players: rf.players.map(rp => ({ ...(s.players.find(p => p.id === rp.id) ?? s.players[0]), ...rp })) }
    : s
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
        <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }} title={MAPS[s.map].help}>{MAPS[s.map].emoji} {MAPS[s.map].name}</span>
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
              borderRadius: 14, overflow: 'hidden', boxShadow: `0 6px 20px ${theme.frame}`,
              background: `repeating-conic-gradient(${theme.floor[0]} 0% 25%, ${theme.floor[1]} 0% 50%) 0 0 / ${T * 2}px ${T * 2}px`,
            }}
          >
            <FloorLayer s={bs} />
            <StaticLayer grid={bs.grid} cols={bs.cols} rows={bs.rows} theme={theme} version={bs.gridVersion} />

            {Object.entries(bs.items).map(([k, it]) => {
              const i = Number(k)
              const cx = i % bs.cols
              const cy = Math.floor(i / bs.cols)
              return (
                <div key={`it${k}`} className="ba-item" title={ITEM_NAME[it.kind]} style={{ position: 'absolute', left: cx * T + 7, top: cy * T + 7, width: T - 14, height: T - 14, zIndex: cy * 10 + 3, borderRadius: 99, background: ITEM_BG[it.kind], border: '2px solid #fff', boxShadow: '0 2px 5px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon kind={it.kind} />
                </div>
              )
            })}

            {bs.bombs.map(b => {
              const left = Math.max(0, b.explodeAt - bs.t)
              const hurry = Math.min(1, Math.max(0, 1 - left / FUSE_SEC))
              const pulse = 1 + Math.sin(bs.t * (8 + hurry * 22)) * (0.04 + hurry * 0.06)
              return (
                <div key={`b${b.id}-${b.cx}-${b.cy}`} style={{ position: 'absolute', left: b.cx * T, top: b.cy * T - 4, width: T, height: T, zIndex: b.cy * 10 + 4, transform: `scale(${pulse})`, transformOrigin: '50% 85%' }}>
                  <BombSprite hurry={hurry} />
                </div>
              )
            })}

            {bs.flames.map(f => <FlameCell key={`f${f.cx}-${f.cy}`} f={f} t={bs.t} />)}

            {bs.players.map(p => {
              if (p.status === 'out') return null
              const st = seatOf(p.id)
              if (!st) return null
              const d = (rf ? null : disp[p.id]) ?? { x: p.x, y: p.y }
              const dim = !!hl && p.id !== hl.targetId && p.id !== hl.ownerId && p.id !== hl.outBy
              const ghost = p.status === 'ghost'
              const shielded = bs.t < p.shieldUntil
              const isMe = p.id === myId
              const tc = TEAM_COLOR[p.team]
              return (
                <div key={p.id} style={{ position: 'absolute', left: d.x * T + T / 2, top: d.y * T + T - 2, zIndex: Math.round(d.y) * 10 + 6, pointerEvents: 'none', opacity: dim ? 0.35 : 1 }}>
                  {versus && <div style={{ position: 'absolute', left: -15, top: -7, width: 30, height: 10, borderRadius: 99, border: `2.5px solid ${tc.main}`, opacity: ghost ? 0.4 : 0.85 }} />}
                  <div
                    style={{
                      position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, -96%)',
                      opacity: ghost ? 0.5 : shielded && Math.floor(bs.t * 10) % 2 ? 0.35 : 1,
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
                      구해줘! {Math.max(0, Math.ceil(p.ghostUntil - bs.t))}
                    </div>
                  )}
                  {ghost && !versus && <div style={{ position: 'absolute', top: -T * 1.4, left: 0, transform: 'translateX(-50%)', fontSize: 16 }}>💫</div>}
                </div>
              )
            })}

            {hl && rf && <ReplayMarks s={bs} story={hl} nameOf={id => (id === myId ? '나' : seatOf(id)?.name ?? '?')} />}

            {!rf && fx.map(f => (
              <div key={f.id} style={{ position: 'absolute', left: f.x * T + T / 2, top: f.y * T - T * 0.9 - (1.1 - (f.until - bs.t)) * 26, transform: 'translateX(-50%)', zIndex: 900, fontSize: 14, fontWeight: 900, color: f.color, textShadow: '0 1px 0 #fff, 0 0 4px #fff', opacity: Math.min(1, (f.until - bs.t) * 2), pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                {f.text}
              </div>
            ))}

            {countdown > 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,250,240,.35)' }}>
                <div key={countdown} className="ba-count" style={{ fontSize: 84, fontWeight: 900, color: '#ff8a5c', textShadow: '0 4px 0 #fff' }}>{countdown}</div>
              </div>
            )}

            {replay?.open && (
              <ReplayOverlay r={replay} seats={seats} myId={myId} set={setReplay} low={(frameAt(replay.frames, replay.story.hitT ?? replay.story.startT).players.find(p => p.id === replay.story.targetId)?.y ?? bs.rows) < bs.rows / 2} />
            )}

            {(s.endedAt !== null || done !== null || lost) && !replay?.open && (
              <ResultPanel s={s} seats={seats} myId={myId} done={done} lost={lost} note={props.resultNote ?? null} onRestart={role === 'local' ? props.onRestart : undefined} onExit={props.onExit} exitLabel={props.exitLabel}
                replayLabel={replay ? (replay.mine ? '🎬 내가 왜 죽었지? 다시 보기' : '🎬 결정적 장면 다시 보기') : null}
                onReplay={replay ? () => setReplay(r => (r ? { ...r, open: true, playing: true, t: r.story.startT } : r)) : undefined} />
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

function ResultPanel({ s, seats, myId, done, lost, note, onRestart, onExit, exitLabel, onReplay, replayLabel }: { s: BombState; seats: ArenaSeat[]; myId: string; done: number | null; lost: boolean; note: string | null; onRestart?: () => void; onExit?: () => void; exitLabel?: string; onReplay?: () => void; replayLabel?: string | null }) {
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
        {onReplay && replayLabel && <button onClick={onReplay} style={{ ...btn, fontSize: 15, padding: '8px 18px', background: '#3d2b2b', color: '#fff', borderColor: '#3d2b2b' }}>{replayLabel}</button>}
        {onRestart && <button onClick={onRestart} style={{ ...btn, fontSize: 15, padding: '8px 18px', background: '#ff8a5c', color: '#fff', borderColor: '#ff8a5c' }}>한 판 더</button>}
        {onExit && <button onClick={onExit} style={{ ...btn, fontSize: 15, padding: '8px 18px' }}>{exitLabel ?? '나가기'}</button>}
      </div>
    </div>
  )
}

// ── 🎬 리플레이 ─────────────────────────────────
interface ReplayData {
  frames: Frame[]
  story: DeathStory
  mine: boolean // 내가 죽은 장면인지(아니면 결정적 장면)
  open: boolean
  t: number
  playing: boolean
  speed: number
}

const sameBomb = (b: { owner: string; cx: number; cy: number; placedAt: number }, k: DeathStory['bomb']) =>
  !!k && b.owner === k.owner && b.cx === k.cx && b.cy === k.cy && Math.abs(b.placedAt - k.placedAt) < 0.01

// 판 위 강조: 범인 폭탄(빨간 고리 + 이름표) · 폭탄 주인(노란 고리) · 나(맞은 사람) · 터뜨린 상대 · 맞는 순간 💥
function ReplayMarks({ s, story, nameOf }: { s: BombState; story: DeathStory; nameOf: (id: string) => string }) {
  const t = s.t
  const out: React.ReactNode[] = []
  const BW = s.cols * T
  // 판 가장자리(시작 자리)에서도 이름표가 잘리지 않게 안쪽으로 당긴다
  const cl = (px: number, m: number) => Math.max(m, Math.min(BW - m, px))
  const tag = (key: string, x: number, y: number, text: string, bg: string, dy = 0) => (
    <div key={key} className="ba-rtag" style={{ position: 'absolute', left: cl(x * T + T / 2, 8 + text.length * 6.5), top: Math.max(4, y * T - T * 1.05 + dy), zIndex: 935, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 900, color: '#fff', background: bg, borderRadius: 99, padding: '2px 9px', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.3)', pointerEvents: 'none' }}>{text}</div>
  )
  const ring = (key: string, x: number, y: number, color: string, size = 1.25) => (
    <div key={key} className="ba-ring" style={{ position: 'absolute', left: x * T + T / 2, top: y * T + T / 2, width: T * size, height: T * size, marginLeft: (-T * size) / 2, marginTop: (-T * size) / 2, borderRadius: 99, border: `4px solid ${color}`, boxShadow: `0 0 14px ${color}`, zIndex: 930, pointerEvents: 'none' }} />
  )
  const k = story.bomb
  const b = k ? s.bombs.find(q => sameBomb(q, k)) : undefined
  if (b && k) {
    out.push(ring('rb', b.cx, b.cy, '#ef4444', 1.3))
    out.push(tag('tb', b.cx, b.cy, `💣 ${k.owner === story.targetId && nameOf(k.owner) === '나' ? '내' : nameOf(k.owner) + '의'} 폭탄 · ${Math.max(0, k.explodeAt - t).toFixed(1)}초`, '#ef4444', -4))
  } else if (k && t >= k.explodeAt - 0.05 && t < k.explodeAt + 0.9) {
    // 터지는 순간: 범인 폭탄에서 맞은 사람까지 뻗은 줄을 빨갛게
    const me = s.players.find(p => p.id === story.targetId)
    if (me) {
      const tx = Math.round(me.x), ty = Math.round(me.y)
      const x0 = Math.min(k.cx, tx), x1 = Math.max(k.cx, tx), y0 = Math.min(k.cy, ty), y1 = Math.max(k.cy, ty)
      if (k.cx === tx || k.cy === ty)
        out.push(<div key="path" style={{ position: 'absolute', left: x0 * T + 3, top: y0 * T + 3, width: (x1 - x0 + 1) * T - 6, height: (y1 - y0 + 1) * T - 6, border: '3px dashed #ef4444', borderRadius: 10, background: 'rgba(239,68,68,.16)', zIndex: 925, pointerEvents: 'none' }} />)
    }
    out.push(tag('tboom', k.cx, k.cy, '펑!', '#ef4444', -4))
  }
  for (const p of s.players) {
    if (p.status === 'out' && p.id !== story.targetId) continue
    if (p.id === story.ownerId && p.id !== story.targetId) {
      out.push(ring(`ro${p.id}`, p.x, p.y - 0.15, '#f59e0b'))
      out.push(tag(`to${p.id}`, p.x, p.y, `💣 폭탄 주인 · ${nameOf(p.id)}`, '#d97706', -T * 0.55))
    }
    if (p.id === story.outBy && story.outT !== null && t >= story.outT - 1.6) {
      out.push(ring(`rp${p.id}`, p.x, p.y - 0.15, '#7c2d12'))
      out.push(tag(`tp${p.id}`, p.x, p.y, `💥 터뜨린 상대 · ${nameOf(p.id)}`, '#7c2d12', -T * 0.55))
    }
    if (p.id === story.targetId) {
      out.push(ring(`rt${p.id}`, p.x, p.y - 0.15, '#3d2b2b', 1.15))
      const self = story.ownerId === story.targetId
      const hit = story.hitT !== null && t >= story.hitT
      const label = hit ? (p.status === 'out' ? `😵 ${nameOf(p.id)} 탈락` : `👻 ${nameOf(p.id)}`) : self ? `💣 ${nameOf(p.id)} (자기 폭탄!)` : nameOf(p.id)
      out.push(tag(`tt${p.id}`, p.x, p.y, label, '#3d2b2b', -T * 0.55))
      if (story.hitT !== null && Math.abs(t - story.hitT) < 0.45)
        out.push(<div key="hit" className="ba-hit" style={{ position: 'absolute', left: cl(p.x * T + T / 2, 70), top: Math.max(24, p.y * T - T * 0.2), zIndex: 940, transform: 'translate(-50%, -50%)', fontSize: 34, fontWeight: 900, color: '#ef4444', textShadow: '0 2px 0 #fff, 0 0 8px #fff', pointerEvents: 'none', whiteSpace: 'nowrap' }}>💥 맞음!</div>)
    }
  }
  return <>{out}</>
}

// 판 위·아래 자막과 조작 — 단계별 설명 + 범인(캐릭터·폭탄) 카드 + 재생 막대
function ReplayOverlay({ r, seats, myId, set, low }: { r: ReplayData; seats: ArenaSeat[]; myId: string; set: React.Dispatch<React.SetStateAction<ReplayData | null>>; low: boolean }) {
  const { story: st, t } = r
  const seat = (id: string | null) => (id ? seats.find(x => x.id === id) : undefined)
  const nm = (id: string | null) => (id === myId ? '나' : seat(id)?.name ?? '?')
  const subj = st.targetId === myId ? '내가' : `${nm(st.targetId)}님이`
  const owner = seat(st.ownerId)
  const self = st.ownerId === st.targetId
  const ownerTxt = self ? (st.targetId === myId ? '내가 놓은' : '자기가 놓은') : `${nm(st.ownerId)}${st.ownerId === myId ? '가' : '님이'} 놓은`
  let line = '다시 보는 중…'
  if (st.bomb && t < st.bomb.placedAt) line = '곧 폭탄이 놓여요… 👀'
  else if (st.bomb && st.hitT !== null && t < st.hitT) line = `${ownerTxt} 폭탄 💣 — 범위 ${st.bomb.range}칸, ${Math.max(0, st.bomb.explodeAt - t).toFixed(1)}초 뒤 펑!`
  else if (st.hitT !== null && t < st.hitT) line = '이 순간을 잘 보세요 👀'
  if (st.hitT !== null && t >= st.hitT) line = `펑! ${subj} ${st.ownerId ? `${ownerTxt} 폭탄` : '불꽃'}에 맞아 유령이 됐어요`
  if (st.outT !== null && t >= st.outT) line = st.outKind === 'pop' ? `👻 유령일 때 ${nm(st.outBy)}${st.outBy === myId ? '가' : '님이'} 닿아서 탈락!` : '⌛ 6초 안에 같은 팀 구출을 못 받아 탈락'
  else if (st.outKind === 'ended' && st.hitT !== null && t >= st.hitT + 0.5) line = '😵 구해 줄 팀원이 없어 판이 끝났어요'
  const why = !st.ownerId ? null : self ? `${st.targetId === myId ? '내' : '자기'} 폭탄에 스스로 맞음` : `${nm(st.ownerId)}의 폭탄`
  const span = Math.max(0.1, st.endT - st.startT)
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - st.startT) / span) * 100))}%`
  const slow = playRate(st, t) < 1
  const done = t >= st.endT
  return (
    <>
      {/* 위: 제목 + 지금 단계 자막 */}
      {/* 맞은 사람이 판 위쪽에 있으면 자막을 아래(조작 카드 위)로 내려 가리지 않게 */}
      <div style={{ position: 'absolute', left: 10, right: 10, ...(low ? { bottom: 128 } : { top: 10 }), zIndex: 960, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', background: 'rgba(30,22,22,.82)', borderRadius: 99, padding: '3px 12px' }}>
          🎬 {r.mine ? '내가 왜 죽었을까?' : `결정적 장면 · ${nm(st.targetId)}`}{slow && r.playing ? ' · 🐢 느리게' : ''}
        </div>
        <div key={line.replace(/[\d.]+초/, '')} className="ba-note" style={{ fontSize: 17, fontWeight: 900, color: '#3d2b2b', background: '#fff', borderRadius: 14, padding: '6px 14px', border: '2.5px solid #ef4444', boxShadow: '0 4px 14px rgba(0,0,0,.25)', textAlign: 'center' }}>{line}</div>
      </div>
      {/* 아래: 범인 카드 + 재생 막대·버튼 */}
      <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 960, background: 'rgba(255,250,240,.96)', borderRadius: 16, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {owner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 12, padding: '3px 10px 3px 4px', border: `2.5px solid ${TEAM_COLOR[owner.team].main}` }}>
              <Critter look={owner.look} size={40} />
              <div style={{ lineHeight: 1.15 }}>
                <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 800 }}>폭탄 주인</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: TEAM_COLOR[owner.team].main }}>{nm(owner.id)}{owner.cpu ? ' 🤖' : ''}</div>
              </div>
              <svg viewBox="0 0 44 44" width={32} height={32} style={{ overflow: 'visible', marginLeft: 2 }}>
                <circle cx={22} cy={25} r={13.5} fill="#3a3b3f" stroke="#ef4444" strokeWidth={3} />
                <path d="M22 10 q2 -6 8 -6" fill="none" stroke="#b9925e" strokeWidth={2} strokeLinecap="round" />
                <circle cx={30} cy={4} r={3} fill="#ffd34d" />
              </svg>
              {st.bomb && <div style={{ fontSize: 12, fontWeight: 800 }}>범위 {st.bomb.range}칸</div>}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.4 }}>
            {why && <div>💥 맞은 이유: <b style={{ color: '#ef4444' }}>{why}</b></div>}
            {st.outKind === 'pop' && <div>😵 탈락: 유령일 때 <b style={{ color: '#7c2d12' }}>{nm(st.outBy)}</b>에게 닿음</div>}
            {st.outKind === 'timeout' && <div>😵 탈락: 6초 안에 구출 못 받음</div>}
            {st.outKind === 'ended' && <div>😵 구해 줄 팀원이 없어 판 끝</div>}
            {!why && <div>{st.hitT === null ? '맞은 장면을 찾지 못했어요' : '불꽃 주인을 찾지 못했어요'}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={btn} onClick={() => set(x => (x ? (x.t >= x.story.endT ? { ...x, t: x.story.startT, playing: true } : { ...x, playing: !x.playing }) : x))}>
            {r.playing ? '⏸' : done ? '↻ 다시' : '▶'}
          </button>
          <div
            style={{ position: 'relative', flex: 1, height: 10, background: '#eee2d8', borderRadius: 99, cursor: 'pointer' }}
            onClick={e => {
              const rc = e.currentTarget.getBoundingClientRect()
              const k = (e.clientX - rc.left) / rc.width
              set(x => (x ? { ...x, t: st.startT + span * Math.max(0, Math.min(1, k)) } : x))
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(t), background: '#ff8a5c', borderRadius: 99 }} />
            {st.bomb && <span title="폭탄 놓음" style={{ position: 'absolute', left: pct(st.bomb.placedAt), top: -9, transform: 'translateX(-50%)', fontSize: 12 }}>💣</span>}
            {st.hitT !== null && <span title="맞음" style={{ position: 'absolute', left: pct(st.hitT), top: -9, transform: 'translateX(-50%)', fontSize: 12 }}>💥</span>}
            {st.outT !== null && <span title="탈락" style={{ position: 'absolute', left: pct(st.outT), top: -9, transform: 'translateX(-50%)', fontSize: 12 }}>😵</span>}
          </div>
          <button style={btn} onClick={() => set(x => (x ? { ...x, speed: x.speed === 1 ? 0.5 : 1 } : x))}>{r.speed === 1 ? '1배' : '0.5배'}</button>
          <button style={{ ...btn, background: '#ff8a5c', color: '#fff', borderColor: '#ff8a5c' }} onClick={() => set(x => (x ? { ...x, open: false, playing: false } : x))}>결과 보기</button>
        </div>
      </div>
    </>
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

// 벽·상자·물 — 상자가 부서질 때만 다시 그린다
const StaticLayer = memo(function StaticLayer({ grid, cols, rows, theme }: { grid: Cell[]; cols: number; rows: number; theme: BombTheme; version: number }) {
  const out: React.ReactNode[] = []
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const c = grid[cy * cols + cx]
      if (c === CELL_WATER) {
        out.push(<div key={`c${cx}-${cy}`} style={{ position: 'absolute', left: cx * T, top: cy * T, width: T, height: T, zIndex: 1 }}><Water /></div>)
        continue
      }
      if (c !== CELL_WALL && c !== CELL_BLOCK) continue
      const border = cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1
      const Tile = c === CELL_BLOCK ? theme.block : border ? theme.border : theme.wall
      out.push(
        <div key={`c${cx}-${cy}`} style={{ position: 'absolute', left: cx * T, top: cy * T - 6, width: T, height: T + 6, zIndex: cy * 10 + 2 }}>
          <Tile />
        </div>,
      )
    }
  return <>{out}</>
}, (a, b) => a.version === b.version)

// 바닥 장치 — 얼음 칸·순간이동 문 (판 하나 동안 그대로)
const FloorLayer = memo(function FloorLayer({ s }: { s: BombState }) {
  return (
    <>
      {Object.keys(s.ice).map(k => {
        const i = Number(k)
        return <div key={`i${k}`} style={{ position: 'absolute', left: (i % s.cols) * T, top: Math.floor(i / s.cols) * T, width: T, height: T, zIndex: 1 }}><IceTile /></div>
      })}
      {s.portals.flatMap(([a, b], n) => [a, b].map(i => (
        <div key={`p${i}`} style={{ position: 'absolute', left: (i % s.cols) * T, top: Math.floor(i / s.cols) * T, width: T, height: T, zIndex: 1 }}><PortalTile pair={n} /></div>
      )))}
    </>
  )
}, () => true)

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
@keyframes ba-ring { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.18); opacity: .7 } }
.ba-ring { animation: ba-ring .7s ease-in-out infinite; }
@keyframes ba-rtag { 0%,100% { margin-top: 0 } 50% { margin-top: -3px } }
.ba-rtag { animation: ba-rtag .9s ease-in-out infinite; }
@keyframes ba-hit { 0% { transform: translate(-50%, -50%) scale(.4); opacity: 0 } 40% { transform: translate(-50%, -50%) scale(1.25); opacity: 1 } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1 } }
.ba-hit { animation: ba-hit .35s ease-out; }
@keyframes ba-portal { 0%,100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.12); opacity: 1 } }
.ba-portal { animation: ba-portal 1.2s ease-in-out infinite; transform-origin: center; }
`
