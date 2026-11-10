'use client'

// 🧨 운동장에서 띄우는 폭탄 놀이터 경기 창 — 방 세션(useBombRooms) → 자리·모습·채널을 맞춰 BombArena를 큰 창으로.
// 사람이 2명 이상이면 실시간(방장 = 세계 진행), 혼자면 이 PC가 CPU까지 전부.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import BombArena, { type ArenaSeat, type BombResult } from './BombArena'
import BombPractice from './BombPractice'
import type { CritterLook } from './Critter'
import { cpuLook, fallbackLook } from '@/lib/bombLook'
import type { BombWire } from '@/lib/bombNet'
import { useBombNet } from '@/lib/useBombNet'
import { MAPS, boardSize, type MapId } from '@/lib/bomb'
import { TILE } from './bombThemes'
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

  const seats = useMemo<ArenaSeat[]>(() => dedupeNames(ses.players.map((id, i) => {
    const team = i < ses.size ? 'A' : 'B'
    if (id) return { id, name: props.nickOf(id), look: ses.looks[id] ?? fallbackLook(id), team, cpu: false }
    const c = cpuLook(ses.seed + i * 977)
    return { id: `cpu-${i}`, name: c.name, look: c.look, team, cpu: true }
    // 판 하나 동안 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [ses.bid])

  // 서버 시계 (앱 전체에서 한 번 잰 값을 같이 씀)
  const [offset, setOffset] = useState<number | null>(null)
  useEffect(() => { void getServerOffset().then(setOffset) }, [])

  // 화면에 맞춰 줄이기 (판 + 위아래 글줄)
  const [cols, rows] = boardSize('versus', ses.players.length)
  const boxW = cols * TILE + 40
  const { ref: boxRef, scale, h: boxH } = useFitBox(boxW, rows * TILE + 150)

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
      <div style={{ width: boxW * scale, height: boxH * scale }}>
        <div ref={boxRef} className="rounded-3xl bg-[#FFF8EF] p-5 shadow-2xl" style={{ width: boxW, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <p className="mb-2 text-[17px] font-extrabold text-[#3d2b2b]">🧨 폭탄 놀이터 · {ses.size}:{ses.size} · {MAPS[ses.map].emoji} {MAPS[ses.map].name}{humans > 1 ? '' : ' · CPU전'}</p>
          {offset === null || (role && !net) ? (
            <p className="py-20 text-center text-[14px] text-[#7a6a60]">연결하는 중…</p>
          ) : (
            <BombArena
              mode="versus" map={ses.map} seats={seats} myId={myId} seed={ses.seed} startAt={ses.startAt} offset={offset} net={net}
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
export function BombPracticeModal({ look, name, map, onEnd, onClose }: { look: CritterLook; name: string; map?: MapId; onEnd?: (r: BombResult) => Promise<string | null>; onClose: () => void }) {
  const { ref: boxRef, scale, h: boxH } = useFitBox(700, 720)
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
      <div style={{ width: 700 * scale, height: boxH * scale }}>
        <div ref={boxRef} className="rounded-3xl bg-[#FFF8EF] p-5 shadow-2xl" style={{ width: 700, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <p className="mb-2 text-[17px] font-extrabold text-[#3d2b2b]">🧨 폭탄 놀이터 · 혼자 연습판</p>
          <BombPractice look={look} name={name} map={map} onEnd={onEnd} onExit={onClose} exitLabel="나가기" />
        </div>
      </div>
    </div>,
    document.body,
  )
}

// 큰 창을 화면에 맞춰 줄이기 — 높이는 추정값이 아니라 실제 내용 높이를 잰다.
// (2026-11-10) 추정값(판+150 / 720)보다 내용이 길면 창 아래 시작·나가기 버튼이 화면 밖으로 잘렸다.
// offsetHeight는 transform(scale) 영향을 안 받아서 원래 높이 그대로 나온다.
function useFitBox(boxW: number, estH: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(estH)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    const fit = () => {
      const realH = el?.offsetHeight || estH
      setH(realH)
      setScale(Math.min(1, (window.innerWidth - 32) / boxW, (window.innerHeight - 32) / realH))
    }
    fit()
    const ro = el ? new ResizeObserver(fit) : null
    if (el) ro!.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit) }
  }, [boxW, estH])
  return { ref, scale, h }
}

// 같은 이름(CPU 오리봇 둘 등)이면 뒤에 번호
export function dedupeNames<T extends { name: string }>(list: T[]): T[] {
  const seen: Record<string, number> = {}
  return list.map(x => {
    const n = (seen[x.name] = (seen[x.name] ?? 0) + 1)
    return n > 1 ? { ...x, name: `${x.name} ${n}` } : x
  })
}
