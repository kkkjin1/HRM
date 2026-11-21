'use client'

// ⚽ 운동장에서 띄우는 미니 축구 경기 창 — 방 세션(useSoccerRooms) → 자리·유니폼·채널을 맞춰 SoccerArena를 큰 창으로.
// 사람이 2명 이상이면 실시간(방장 = 판 진행), 혼자면 이 PC가 CPU까지 전부.
// 유니폼: 팀마다 구단 하나(세션 kits) — A 홈(흰 바탕) · B 원정(구단 색 바탕). 모자·등번호는 각자 야구 장비·등번호.

import { AR, type GameLayout } from '../GameArena'
import { FULL_OVERLAY_STYLE, fullFitScale } from '../fullStage'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SoccerArena, { type SoccerResult, type SoccerSeat, type SoccerTeamInfo } from './SoccerArena'
import { useSoccerNet } from '@/lib/useSoccerNet'
import type { SoccerWire } from '@/lib/soccerNet'
import type { ScSession } from '@/lib/useSoccerRooms'
import { getServerOffset } from '@/lib/serverClock'
import { clubKit } from '@/lib/soccerKit'
import { teamOf, type Equip } from '@/lib/baseballGear'

export type SoccerPerson = { name: string; equip: Equip | null; number: number }

const CPU_NAMES = ['🤖 로봇 대리', '🤖 로봇 과장', '🤖 로봇 사원', '🤖 로봇 주임', '🤖 로봇 차장', '🤖 로봇 인턴']

export function teamInfos(kits: ScSession['kits']): Record<'A' | 'B', SoccerTeamInfo> {
  const a = teamOf(kits.A)!, b = teamOf(kits.B)!
  const same = kits.A === kits.B
  return {
    A: { club: kits.A, name: same ? `${a.name} 홈` : a.name, ring: a.primary === '#FFFFFF' ? a.secondary : a.primary },
    B: { club: kits.B, name: same ? `${b.name} 원정` : b.name, ring: same ? '#F59E0B' : b.primary === '#FFFFFF' ? b.secondary : b.primary },
  }
}

export function buildSeats(ses: Pick<ScSession, 'players' | 'size' | 'kits' | 'seed'>, personOf: (id: string) => SoccerPerson): SoccerSeat[] {
  let cpuN = 0
  return ses.players.map((id, i) => {
    const team = i < ses.size ? 'A' : 'B'
    const club = team === 'A' ? ses.kits.A : ses.kits.B
    if (id) {
      const p = personOf(id)
      return { id, name: p.name, team, kit: clubKit(club, team === 'B', p.equip), number: p.number, cpu: false }
    }
    const name = CPU_NAMES[(ses.seed + cpuN++) % CPU_NAMES.length]
    return { id: `cpu-${i}`, name, team, kit: clubKit(club, team === 'B'), number: 90 + i, cpu: true }
  })
}

export default function SoccerGame(props: {
  session: ScSession
  myId: string
  personOf: (id: string) => SoccerPerson
  relay: (payload: SoccerWire) => void
  setRelayListener: (fn: ((m: SoccerWire) => void) | null) => void
  onEnd: (r: SoccerResult) => void
  onClose: () => void
  onRestart?: () => void
  arena?: { layout: GameLayout; onWindow?: () => void } // 야구식 풀화면 게임 화면
}) {
  const { session: ses, myId } = props
  const humans = ses.players.filter(Boolean).length
  const role = humans > 1 ? (ses.hostId === myId ? 'host' : 'guest') : null
  const { net, deliver } = useSoccerNet(role ? ses.bid : null, role, props.relay)
  const { setRelayListener } = props
  useEffect(() => {
    setRelayListener(deliver)
    return () => setRelayListener(null)
  }, [deliver, setRelayListener])

  // 판 하나 동안 고정
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seats = useMemo(() => buildSeats(ses, props.personOf), [ses.bid])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const teams = useMemo(() => teamInfos(ses.kits), [ses.bid])

  const [offset, setOffset] = useState<number | null>(null)
  useEffect(() => { void getServerOffset().then(setOffset) }, [])
  const { ref, scale, h } = useFitBox(1010)

  if (props.arena) {
    const title = `⚽ 미니 축구 · ${ses.size}:${ses.size}${humans > 1 ? '' : ' · CPU전'}`
    if (offset === null || (role && !net)) {
      return createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center text-[15px]" style={{ ...FULL_OVERLAY_STYLE, background: AR.bg, color: AR.sub }}>연결하는 중…</div>,
        document.body,
      )
    }
    return (
      <SoccerArena seats={seats} teams={teams} myId={myId} seed={ses.seed} startAt={ses.startAt} offset={offset} net={net}
        onEnd={props.onEnd} onExit={props.onClose} onRestart={humans > 1 ? undefined : props.onRestart} arena={{ ...props.arena, title }} />
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B1220]" style={FULL_OVERLAY_STYLE}>
      <div style={{ width: 1010 * scale, height: h * scale }}>
        <div ref={ref} className="rounded-2xl bg-[#F8FAFC] p-3 shadow-2xl" style={{ width: 1010, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <p className="mb-2 text-[17px] font-extrabold text-[#0F172A]">⚽ 미니 축구 · {ses.size}:{ses.size}{humans > 1 ? '' : ' · CPU전'}</p>
          {offset === null || (role && !net) ? (
            <p className="py-20 text-center text-[14px] text-[#64748B]">연결하는 중…</p>
          ) : (
            <SoccerArena seats={seats} teams={teams} myId={myId} seed={ses.seed} startAt={ses.startAt} offset={offset} net={net}
              onEnd={props.onEnd} onExit={props.onClose} onRestart={humans > 1 ? undefined : props.onRestart} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// 큰 창을 화면에 맞춰 줄이기 — 실제 내용 높이를 잰다(BombGame과 같은 방식)
export function useFitBox(boxW: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(700)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    const fit = () => {
      const realH = el?.offsetHeight || 700
      setH(realH)
      setScale(fullFitScale(boxW, realH))
    }
    fit()
    const ro = el ? new ResizeObserver(fit) : null
    if (el) ro!.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit) }
  }, [boxW])
  return { ref, scale, h }
}
