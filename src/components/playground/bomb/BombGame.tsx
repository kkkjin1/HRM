'use client'

// 🧨 운동장에서 띄우는 폭탄 놀이터 경기 창 — 방 세션(useBombRooms) → 자리·모습·채널을 맞춰 BombArena를 큰 창으로.
// 사람이 2명 이상이면 실시간(방장 = 세계 진행), 혼자면 이 PC가 CPU까지 전부.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import BombArena, { type ArenaSeat, type BombResult } from './BombArena'
import BombPractice from './BombPractice'
import type { CritterLook } from './Critter'
import { cpuLook, fallbackLook } from '@/lib/bombLook'
import type { BombWire } from '@/lib/bombNet'
import { useBombNet } from '@/lib/useBombNet'
import { getServerOffset } from '@/lib/serverClock'
import type { BbSession } from '@/lib/useBombRooms'

export default function BombGame(props: {
  session: BbSession
  myId: string
  nickOf: (id: string) => string
  relay: (payload: BombWire) => void // 전용 채널이 안 붙었을 때 운동장 채널로
  setRelayListener: (fn: ((m: BombWire) => void) | null) => void
  onEnd: (r: BombResult) => Promise<string | null>
  onClose: () => void
}) {
  const { session: ses, myId } = props
  const [note, setNote] = useState<string | null>(null)
  const humans = ses.players.filter(Boolean).length
  const role = humans > 1 ? (ses.hostId === myId ? 'host' : 'guest') : null
  const { net, deliver } = useBombNet(role ? ses.bid : null, role, props.relay)
  const { setRelayListener } = props
  useEffect(() => {
    setRelayListener(deliver)
    return () => setRelayListener(null)
  }, [deliver, setRelayListener])

  const seats = useMemo<ArenaSeat[]>(() => ses.players.map((id, i) => {
    const team = i < ses.size ? 'A' : 'B'
    if (id) return { id, name: props.nickOf(id), look: ses.looks[id] ?? fallbackLook(id), team, cpu: false }
    const c = cpuLook(ses.seed + i * 977)
    return { id: `cpu-${i}`, name: c.name, look: c.look, team, cpu: true }
    // 판 하나 동안 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ses.bid])

  // 서버 시계 (앱 전체에서 한 번 잰 값을 같이 씀)
  const [offset, setOffset] = useState<number | null>(null)
  useEffect(() => { void getServerOffset().then(setOffset) }, [])

  // 화면에 맞춰 줄이기 (판 660×572 + 위아래 글줄)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / 700, (window.innerHeight - 32) / 720))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
      <div style={{ width: 700 * scale, height: 720 * scale }}>
        <div className="rounded-3xl bg-[#FFF8EF] p-5 shadow-2xl" style={{ width: 700, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <p className="mb-2 text-[17px] font-extrabold text-[#3d2b2b]">🧨 폭탄 놀이터 · {ses.size === 1 ? '1:1' : '2:2'}{humans > 1 ? '' : ' · CPU전'}</p>
          {offset === null || (role && !net) ? (
            <p className="py-20 text-center text-[14px] text-[#7a6a60]">연결하는 중…</p>
          ) : (
            <BombArena
              mode="versus" seats={seats} myId={myId} seed={ses.seed} startAt={ses.startAt} offset={offset} net={net}
              onEnd={r => { void props.onEnd(r).then(setNote) }} resultNote={note} onExit={props.onClose} exitLabel="나가기"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// 혼자 연습판 큰 창
export function BombPracticeModal({ look, name, onEnd, onClose }: { look: CritterLook; name: string; onEnd?: (r: BombResult) => Promise<string | null>; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / 700, (window.innerHeight - 32) / 720))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
      <div style={{ width: 700 * scale, height: 720 * scale }}>
        <div className="rounded-3xl bg-[#FFF8EF] p-5 shadow-2xl" style={{ width: 700, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <p className="mb-2 text-[17px] font-extrabold text-[#3d2b2b]">🧨 폭탄 놀이터 · 혼자 연습판</p>
          <BombPractice look={look} name={name} onEnd={onEnd} onExit={onClose} exitLabel="나가기" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
