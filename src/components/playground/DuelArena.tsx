'use client'

// 운동장 ⚔ 1:1 대결 화면(🤺 펜싱 · 🏸 배드민턴) — 운동장 무대 자리에 그대로 뜬다(별도 창 없음).
// host(신청한 쪽, 또는 CPU 대결) = 이 PC에서 lib/duel.ts로 시뮬레이션하고 15번/초 상태를 방송한다.
// guest(받은 쪽) = 입력(방향·Space)만 보내고 host가 보낸 상태를 그린다.
// 키(←→·Space)는 대결 중에 이 컴포넌트가 먼저 잡아서(capture) 운동장 캐릭터는 움직이지 않는다.

import { useEffect, useRef, useState } from 'react'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import type { Equip } from '@/lib/baseballGear'
import {
  COURT_L, COURT_R, DUEL_GAMES, METER_MAX, NET_H, NET_X, cpuInput, duelStep, isParrying, lungeReach, newCpuMem, newDuelState, tipX,
  type DSide, type DuelGame, type DuelInput, type DuelState,
} from '@/lib/duel'
import { GY, H, W } from '@/lib/playground'

type Look = { name: string; equip: Equip; palette: { bg: string; fg: string } }
export type DuelMsg =
  | { type: 'input'; id: string; dir: -1 | 0 | 1; actSeq: number }
  | { type: 'state'; id: string; s: DuelState }
  | { type: 'end'; id: string; winner: DSide | null; score: { L: number; R: number } }
  | { type: 'quit'; id: string }

const STEP_MS = 1000 / 60
const STATE_EVERY_MS = 66

export default function DuelArena(props: {
  id: string
  game: DuelGame
  role: 'host' | 'guest'
  vsCpu: boolean
  mySide: DSide
  looks: { L: Look; R: Look }
  send: (msg: DuelMsg) => void
  listen: (fn: ((msg: DuelMsg) => void) | null) => void
  onEnd: (winner: DSide | null, score: { L: number; R: number }) => void
  onClose: () => void
}) {
  const { id, game, role, vsCpu, mySide } = props
  const [view, setView] = useState<DuelState>(() => newDuelState(game, Math.floor(Math.random() * 1e6)))
  const [lost, setLost] = useState(false)
  const stateRef = useRef<DuelState>(view)
  const keys = useRef({ left: false, right: false, actSeq: 0 })
  const remote = useRef({ dir: 0 as -1 | 0 | 1, actSeq: 0, seenSeq: 0 })
  const lastStateAt = useRef(0)
  const endedRef = useRef(false)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })

  // 키: 대결 중엔 ←→·Space를 여기서 먼저 잡는다
  useEffect(() => {
    const sendInput = () => {
      if (role !== 'guest') return
      const k = keys.current
      propsRef.current.send({ type: 'input', id, dir: ((k.right ? 1 : 0) - (k.left ? 1 : 0)) as -1 | 0 | 1, actSeq: k.actSeq })
    }
    function down(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (e.repeat) return
        if (e.key === 'ArrowLeft') keys.current.left = true
        else if (e.key === 'ArrowRight') keys.current.right = true
        else keys.current.actSeq++
        sendInput()
      }
    }
    function up(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') keys.current.left = false
      else if (e.key === 'ArrowRight') keys.current.right = false
      else return
      e.stopImmediatePropagation()
      sendInput()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true) }
  }, [id, role])

  // 상대에게서 오는 메시지
  useEffect(() => {
    props.listen(msg => {
      if (msg.id !== id) return
      if (msg.type === 'input' && role === 'host') remote.current = { ...remote.current, dir: msg.dir, actSeq: msg.actSeq }
      else if (msg.type === 'state' && role === 'guest') { stateRef.current = msg.s; lastStateAt.current = Date.now(); setView(msg.s) }
      else if (msg.type === 'end' && role === 'guest' && !endedRef.current) { endedRef.current = true; propsRef.current.onEnd(msg.winner, msg.score) }
      else if (msg.type === 'quit') setLost(true)
    })
    return () => props.listen(null)
    // listen은 부모가 안정적으로 넘긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role])

  // host: 고정 스텝 시뮬레이션 + 상태 방송 / guest: 끊김 감시
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastSent = 0
    let mySeen = 0
    const cpuMem = newCpuMem()
    lastStateAt.current = Date.now()
    const loop = (t: number) => {
      acc = Math.min(acc + (t - last), 250)
      last = t
      if (role === 'host') {
        let s = stateRef.current
        while (acc >= STEP_MS) {
          acc -= STEP_MS
          const k = keys.current
          const mine: DuelInput = { dir: ((k.right ? 1 : 0) - (k.left ? 1 : 0)) as -1 | 0 | 1, act: k.actSeq !== mySeen }
          mySeen = k.actSeq
          let theirs: DuelInput
          if (vsCpu) theirs = cpuInput(s, mySide === 'L' ? 'R' : 'L', cpuMem, Math.random)
          else {
            const r = remote.current
            theirs = { dir: r.dir, act: r.actSeq !== r.seenSeq }
            r.seenSeq = r.actSeq
          }
          s = duelStep(s, mySide === 'L' ? { L: mine, R: theirs } : { L: theirs, R: mine }, STEP_MS)
        }
        stateRef.current = s
        setView(s)
        const now = Date.now()
        if (!vsCpu && now - lastSent >= STATE_EVERY_MS) { lastSent = now; propsRef.current.send({ type: 'state', id, s }) }
        if (s.winner && !endedRef.current) {
          endedRef.current = true
          if (!vsCpu) propsRef.current.send({ type: 'end', id, winner: s.winner, score: s.score })
          propsRef.current.onEnd(s.winner, s.score)
        }
      } else if (!endedRef.current && Date.now() - lastStateAt.current > 6000) {
        setLost(true)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id, role, vsCpu, mySide])

  const quit = () => {
    if (!vsCpu && !endedRef.current) props.send({ type: 'quit', id })
    props.onClose()
  }

  const s = view
  const info = DUEL_GAMES[game]
  const names = { L: props.looks.L.name, R: props.looks.R.name }
  const last = s.last
  const banner = !last ? null
    : last.startsWith('⚔') ? last
    : s.game === 'fencing' && last.endsWith(':out') ? `🚫 장외! ${names[last[0] as DSide]} 득점`
    : s.game === 'fencing' && last.endsWith(':fleche') ? `💨 ${names[last[0] as DSide]} 돌진 성공!`
    : s.game === 'fencing' && last.endsWith(':touch') ? `💥 ${names[last[0] as DSide]} 찌르기 성공!`
    : s.game === 'fencing' && last.endsWith(':parry') ? `🛡 ${names[last[0] as DSide]} 막기 성공 — 반격 기회!`
    : last.endsWith(':special') ? `⚡ ${names[last[0] as DSide]} 번개 스매시!!`
    : last.endsWith(':smash') ? `🔥 ${names[last[0] as DSide]} 스매시!`
    : last.endsWith(':net') ? `🕸 네트 — ${names[last[0] as DSide]} 득점`
    : last.endsWith(':out') ? `🚫 아웃 — ${names[last[0] as DSide]} 득점`
    : last.endsWith(':floor') ? `🏸 ${names[last[0] as DSide]} 득점`
    : null

  return (
    <div className="absolute inset-0 z-[45] overflow-hidden" style={{ background: game === 'fencing' ? '#1E1B2E' : '#14532D' }}>
      <svg className="absolute inset-0" width={W} height={H} aria-hidden>
        {game === 'fencing' ? (
          <>
            {Array.from({ length: 8 }, (_, i) => <rect key={i} x={60 + i * 130} y={30} width={70} height={110} fill="#312E81" opacity="0.5" />)}
            <rect x={COURT_L} y={GY - 6} width={COURT_R - COURT_L} height={18} fill="#E5E7EB" />
            <line x1={(COURT_L + COURT_R) / 2} y1={GY - 6} x2={(COURT_L + COURT_R) / 2} y2={GY + 12} stroke="#6B7280" strokeWidth="2" />
            <rect x="0" y={GY + 12} width={W} height={H} fill="#0F0D1A" />
          </>
        ) : (
          <>
            <rect x="0" y={GY - 30} width={W} height={H} fill="#166534" />
            <rect x={COURT_L} y={GY - 6} width={COURT_R - COURT_L} height={12} fill="#15803D" stroke="#F8FAFC" strokeWidth="2" />
            <line x1={NET_X} y1={GY} x2={NET_X} y2={GY - NET_H} stroke="#F8FAFC" strokeWidth="3" />
            <rect x={NET_X - 3} y={GY - NET_H} width={6} height={NET_H * 0.55} fill="url(#net)" />
            <defs>
              <pattern id="net" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0 L4 4 M4 0 L0 4" stroke="#E5E7EB" strokeWidth="0.6" /></pattern>
            </defs>
          </>
        )}
        {/* 칼·라켓 */}
        {(['L', 'R'] as DSide[]).map(side => {
          const f = side === 'L' ? 1 : -1
          if (s.game === 'fencing') {
            const p = s[side]
            const lean = lungeReach(p) * 0.5
            // 막기 = 칼을 세워 든 자세, 굳음 = 칼이 아래로 처짐
            if (isParrying(p)) return <line key={side} x1={p.x + f * 12} y1={GY - 22} x2={p.x + f * 20} y2={GY - 62} stroke="#93C5FD" strokeWidth="3" strokeLinecap="round" />
            if (p.stun > 0) return <line key={side} x1={p.x + f * 8} y1={GY - 30} x2={p.x + f * 34} y2={GY - 6} stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" />
            return <line key={side} x1={p.x + f * (6 + lean)} y1={GY - 34} x2={tipX(p, side)} y2={GY - 36} stroke={p.move === 'fleche' ? '#FCA5A5' : '#E5E7EB'} strokeWidth="2.5" strokeLinecap="round" />
          }
          const p = s[side]
          const swinging = p.swing >= 0 && p.swing <= 200
          const ang = swinging ? -60 + (p.swing / 200) * 120 : -40
          const rx = p.x + f * 14, ry = GY - 46
          return (
            <g key={side} transform={`translate(${rx} ${ry}) rotate(${f * ang})`}>
              <line x1={0} y1={0} x2={0} y2={-22} stroke="#F8FAFC" strokeWidth="2" />
              <ellipse cx={0} cy={-30} rx={7} ry={9} fill="none" stroke="#FDE68A" strokeWidth="2" />
            </g>
          )
        })}
        {s.game === 'badminton' && (
          <g transform={`translate(${s.sh.x} ${GY - s.sh.h})`}>
            {s.sh.special && (
              <>
                <line x1={0} y1={0} x2={s.sh.vx > 0 ? -60 : 60} y2={0} stroke="#FACC15" strokeWidth="5" opacity="0.6" />
                <circle r={11} fill="#FDE047" opacity="0.45" />
              </>
            )}
            <circle r={4} fill="#F8FAFC" />
            <polygon points={`${s.sh.vx > 0 ? -4 : 4},-4 ${s.sh.vx > 0 ? -12 : 12},0 ${s.sh.vx > 0 ? -4 : 4},4`} fill="#E5E7EB" />
          </g>
        )}
      </svg>
      {(['L', 'R'] as DSide[]).map(side => {
        const look = props.looks[side]
        const p = s[side]
        // 펜싱 찌르기 때 몸이 앞으로 쏠린다
        const lean = 'stun' in p ? lungeReach(p) * 0.5 * (side === 'L' ? 1 : -1) : 0
        const stunned = 'stun' in p && p.stun > 0
        return (
          <div key={side} className={`absolute ${role === 'guest' ? 'transition-[left] duration-75 ease-linear' : ''}`}
            style={{ left: p.x + lean, top: GY, transform: 'translate(-50%, -100%)' }}>
            <div className="flex flex-col items-center">
              <span className={`mb-[1px] whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold shadow ${side === mySide ? 'bg-[#E0A526] text-white' : 'bg-white/90 text-[#1F2933]'}`}>{stunned ? '💫 ' : ''}{look.name}</span>
              <div style={{ transform: `scaleX(${side === 'L' ? 1 : -1})` }}>
                <CharacterSprite equip={look.equip} name={look.name} size={40} colorBg={look.palette.bg} colorFg={look.palette.fg} />
              </div>
            </div>
          </div>
        )
      })}

      <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-1">
        <div className="flex items-center gap-3 rounded-xl bg-black/50 px-4 py-1.5 text-white">
          <span className="text-[13px] font-bold">{names.L}</span>
          <span className="text-[22px] font-black tabular-nums">{s.score.L} : {s.score.R}</span>
          <span className="text-[13px] font-bold">{names.R}</span>
        </div>
        <span className="text-[11px] font-semibold text-white/80">{info.emoji} {info.name} · {info.win}점 먼저 · {vsCpu ? '🤖 CPU 대결' : role === 'host' ? '방장(내 PC가 진행)' : '상대 PC가 진행'}</span>
        {s.game === 'fencing' && s.spark > 0 && <span className="text-[22px] font-black text-[#93C5FD]" style={{ animation: 'pg-toast 150ms ease-out' }}>챙!</span>}
        {s.game === 'badminton' && (
          <div className="flex gap-6 text-[11px] font-bold text-white/90">
            {(['L', 'R'] as DSide[]).map(side => (
              <span key={side}>{names[side]} 기 {'●'.repeat(s.meter[side])}{'○'.repeat(METER_MAX - s.meter[side])}{s.meter[side] >= METER_MAX ? ' 🔥' : ''}</span>
            ))}
          </div>
        )}
        {s.game === 'badminton' && s.meter[mySide] >= METER_MAX && s.pause <= 0 && (
          <span className="rounded-full bg-[#F97316] px-3 py-0.5 text-[12px] font-black text-white" style={{ animation: 'pg-bob 600ms ease-in-out infinite' }}>🔥 필살구 준비! 상대쪽 방향키 + Space</span>
        )}
        {(banner && (s.pause > 0 || (s.game === 'fencing' && s.spark > 0))) || (s.game === 'badminton' && s.sh.special && s.pause <= 0) ? <span className="rounded-full bg-[#FACC15] px-3 py-0.5 text-[13px] font-black text-[#1F2933]" style={{ animation: 'pg-toast 200ms ease-out' }}>{s.game === 'badminton' && s.sh.special && s.pause <= 0 ? `⚡ ${names[s.lastHit ?? 'L']} 번개 스매시!!` : banner}</span> : null}
        {s.game === 'badminton' && s.lastHit === null && s.pause <= 0 && (
          <span className="rounded-full bg-white/90 px-3 py-0.5 text-[11.5px] font-bold text-[#1F2933]">{s.server === mySide ? '내 서브 — Space' : `${names[s.server]} 서브 대기`}</span>
        )}
      </div>

      {(s.winner || lost) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
          {lost && !s.winner ? <p className="text-[18px] font-black">📡 상대와 연결이 끊겼어요</p> : (
            <>
              <p className="text-[34px]">{s.winner === mySide ? '🏆' : '😵'}</p>
              <p className="text-[20px] font-black">{s.winner ? `${names[s.winner]} 승리!` : ''} {s.score.L} : {s.score.R}</p>
            </>
          )}
        </div>
      )}
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={quit}
        className="absolute bottom-2 right-2 rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold text-[#1F2933] hover:bg-white">
        {s.winner || lost ? '운동장으로' : '그만하기'}
      </button>
      <p className="absolute bottom-2 left-3 text-[11px] text-white/80">{info.help}</p>
    </div>
  )
}
