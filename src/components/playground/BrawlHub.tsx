'use client'

// 🥊 운동장 격투장 — 로비(인원·맵·목숨) · 대기실 · 모집 카드 · 경기 창을 한 곳에 모은 훅(축구 SoccerHub와 같은 모양).
// PlaygroundWidget은 이 훅을 부르고(useBrawlHub) 운동장 채널 'bw' 메시지를 onMsg로 넘기고 ui를 그리기만 한다.
// 경기: 사람 2명 이상이면 실시간(방장 PC가 판정·CPU), 혼자면 이 PC가 전부.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import PgModal from '@/components/playground/PgModal'
import GameArena, { AR, Pill, type GameLayout } from '@/components/playground/GameArena'
import { FULL_OVERLAY_STYLE } from '@/components/playground/fullStage'
import BrawlArena, { BRAWL_WORLD, type BrawlResult } from '@/components/playground/BrawlArena'
import { useFitBox } from '@/components/playground/soccer/SoccerGame'
import { BRAWL_MAPS, MAP_ORDER, type BrawlState, type Entrant } from '@/lib/brawl'
import type { BrawlWire } from '@/lib/brawlNet'
import { useBrawlNet } from '@/lib/useBrawlNet'
import { bwCount, useBrawlRooms, type BwGameRelay, type BwMapPick, type BwRoomMsg, type BwSession } from '@/lib/useBrawlRooms'
import { getServerOffset } from '@/lib/serverClock'
import type { Member } from '@/lib/members'
import { displayName } from '@/lib/members'

export const BRAWL_COLORS = ['#E0A526', '#3B82F6', '#EF4444', '#22C55E', '#EC4899']
const CPU_NAMES = ['🤖 로봇 곰', '🤖 로봇 여우', '🤖 로봇 너구리', '🤖 로봇 수달', '🤖 로봇 펭귄']

export function entrantsOf(ses: Pick<BwSession, 'players' | 'seed'>, nameOf: (id: string) => string): Entrant[] {
  let cpuN = 0
  return ses.players.map((id, i) => id
    ? { id, name: nameOf(id), color: BRAWL_COLORS[i % BRAWL_COLORS.length], cpu: false }
    : { id: `cpu-${i}`, name: CPU_NAMES[(ses.seed + cpuN++) % CPU_NAMES.length], color: BRAWL_COLORS[i % BRAWL_COLORS.length], cpu: true })
}

const HELP = '←→ 이동 · ↑ 점프(공중 1번 더) · ↓ 가드 · Space 꾹 눌러 기 모으고 떼면 펀치(0.1초 이상, 오래 모을수록 셈)'

export function useBrawlHub(opts: {
  myId: string | null
  memberMap: Map<string, Member>
  onlineCount: number
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
  send: (event: string, payload: Record<string, unknown>) => void
  serverNow: () => number
  arena?: { layout: GameLayout; onWindow?: () => void } // 풀화면 게임 화면
}) {
  const { myId, memberMap, toast, addNews, nickOf, send } = opts
  const [lobby, setLobby] = useState(false)
  const [cap, setCap] = useState(4)
  const [mapPick, setMapPick] = useState<BwMapPick>('random')
  const [lives, setLives] = useState(3)
  const serverNowRef = useRef(opts.serverNow)
  useEffect(() => { serverNowRef.current = opts.serverNow })
  const nameOf = useCallback((id: string) => displayName(memberMap.get(id)) || '?', [memberMap])

  const rooms = useBrawlRooms({
    myId, toast, addNews, nickOf, serverNow: () => serverNowRef.current(),
    send: (event, msg) => send(event, msg as unknown as Record<string, unknown>),
  })
  const busy = !!rooms.session || !!rooms.room

  // 판 결과 → 소식(사람 2명 이상, 방장만)
  const onEnd = useCallback((r: BrawlResult) => {
    const meF = r.ranking.find(f => f.id === myId)
    toast(r.winner?.id === myId ? '🥊 우승! 🏆' : `🥊 ${meF?.place ?? '-'}위`)
    const ses = rooms.session
    if (!ses || !myId || ses.hostId !== myId || ses.players.filter(Boolean).length < 2) return
    const humans = r.ranking.filter(f => !f.cpu)
    const text = `🥊 격투기 ${BRAWL_MAPS[ses.map].emoji} ${BRAWL_MAPS[ses.map].name} — 🏆 ${r.winner?.name ?? '?'}${humans.length > 1 ? ` (${humans.map(f => `${f.place}위 ${f.name}`).join(' · ')})` : ''}`
    addNews(text)
    send('bw', { type: 'news', text })
  }, [rooms.session, myId, toast, addNews, send])

  const enter = useCallback(() => {
    const offer = rooms.offers[0]
    if (offer && offer.count < offer.cap) rooms.join(offer)
    else setLobby(true)
  }, [rooms])

  const onMsg = rooms.onMsg as (m: BwRoomMsg | BwGameRelay) => void
  const modalOpen = !!myId && ((lobby && !busy) || (!!rooms.room && !rooms.session))

  let ui: ReactNode = null
  if (myId) ui = (
    <>
      {lobby && !busy && (
        <PgModal icon="🥊" iconBg="#FFE4E6" title="격투장" sub="낭떠러지 밀어내기 · 개인전 최대 5명" onClose={() => setLobby(false)} width={760} rightWidth={280}
          left={<>
            <p className="text-[12.5px] leading-relaxed text-[#334155]">{mapPick === 'ring' ? <>링 안에서 체력으로 겨뤄요. 체력이 0이 되면 다운 — <b>Space 연타 10번</b>이면 한 번 일어나요. 로프에 세게 부딪히면 잠깐 무방비! 마지막까지 남은 사람이 우승.</> : <>큰 글러브로 밀어서 무대 밖으로 떨어뜨리세요. 맞을수록 <b>%</b>가 쌓이고, %가 높을수록 멀리 날아가요. 마지막까지 남은 사람이 우승!</>}</p>
            <p className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-[11.5px] text-[#475569]">{HELP}<br /><span className="text-[#94A3B8]">강펀치를 모으는 중에 맞으면 더 아파요 · 30초가 지나면 맵마다 무대가 무너져요</span></p>
            {/* 모드: 낭떠러지 밀어내기 | 링 서바이벌 */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F1F5F9] p-1">
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { if (mapPick === 'ring') setMapPick('random') }}
                className={`rounded-lg px-2 py-2 text-left ${mapPick !== 'ring' ? 'bg-white shadow-sm' : ''}`}>
                <p className="text-[13px] font-extrabold text-[#0F172A]">⛰ 낭떠러지 밀어내기</p><p className="text-[10.5px] text-[#64748B]">밀어서 떨어뜨리기 · 목숨제</p></button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setMapPick('ring')}
                className={`rounded-lg px-2 py-2 text-left ${mapPick === 'ring' ? 'bg-white shadow-sm' : ''}`}>
                <p className="text-[13px] font-extrabold text-[#0F172A]">🥊 링 서바이벌</p><p className="text-[10.5px] text-[#64748B]">체력 0이면 다운 · 연타로 1번 일어남</p></button>
            </div>
            {mapPick !== 'ring' && <>
              <p className="text-[12px] font-bold text-[#0F172A]">맵</p>
              <div className="grid grid-cols-5 gap-1.5">
                <MapBtn on={mapPick === 'random'} onClick={() => setMapPick('random')} emoji="🎲" name="랜덤" />
                {MAP_ORDER.map(k => <MapBtn key={k} on={mapPick === k} onClick={() => setMapPick(k)} emoji={BRAWL_MAPS[k].emoji} name={BRAWL_MAPS[k].name} />)}
              </div>
            </>}
            {mapPick !== 'random' && <p className="text-[11px] text-[#64748B]">{BRAWL_MAPS[mapPick].hint}</p>}
          </>}
          right={<>
            <p className="text-[12px] font-bold text-[#0F172A]">인원 <span className="font-normal text-[#94A3B8]">· 빈자리는 CPU</span></p>
            <Seg values={[2, 3, 4, 5]} value={cap} onChange={setCap} label={n => `${n}명`} />
            {mapPick !== 'ring' && <><p className="text-[12px] font-bold text-[#0F172A]">목숨</p>
            <Seg values={[1, 3, 5]} value={lives} onChange={setLives} label={n => `♥${n}`} /></>}
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { rooms.openRoom(cap, false, mapPick, lives); setLobby(false) }}
              className="rounded-xl bg-[#0F172A] px-3 py-2 text-left font-semibold text-white transition-colors hover:bg-[#1E293B]">👥 방 열기 <span className="font-normal text-white/60">· 팀원 모집</span></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { rooms.openRoom(cap, true, mapPick, lives); setLobby(false) }}
              className="rounded-xl bg-[#F1F5F9] px-3 py-2 text-left font-semibold text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">🤖 CPU랑 바로 ({cap}명)</button>
            <p className="text-[10px] text-[#94A3B8]">지금 운동장 연 팀원 {Math.max(0, opts.onlineCount - 1)}명</p>
          </>} />
      )}

      {rooms.room && !rooms.session && (() => {
        const r = rooms.room
        const host = r.host === myId
        return (
          <PgModal icon="🥊" iconBg="#FFE4E6" title={`격투기 · 최대 ${r.cap}명`} sub={`${r.map === 'random' ? '🎲 랜덤 맵' : `${BRAWL_MAPS[r.map].emoji} ${BRAWL_MAPS[r.map].name}`} · ${r.map === 'ring' ? '체력 서바이벌' : `목숨 ${r.lives}`}`} width={760} rightWidth={280}
            left={<>
              <p className="text-[11px] text-[#64748B]">{host ? '팀원이 참가하면 아래에 보여요 · 빈자리는 CPU가 채워요' : `${nickOf(r.host)}님이 시작하기를 기다리는 중…`}</p>
              <div className="flex flex-col gap-1">
                {Array.from({ length: r.cap }, (_, i) => {
                  const id = r.seats.filter(Boolean)[i] || null
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                      <span className="h-3.5 w-3.5 rounded-full" style={{ background: BRAWL_COLORS[i] }} />
                      <span className="font-semibold text-[#0F172A]">{id ? `${nameOf(id)}${id === r.host ? ' 👑' : ''}${id === myId ? ' (나)' : ''}` : <span className="text-[#94A3B8]">🤖 CPU (빈자리)</span>}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-[#94A3B8]">{HELP}</p>
            </>}
            right={<>
              {host && <>
                <p className="text-[12px] font-bold text-[#0F172A]">인원</p>
                <Seg values={[2, 3, 4, 5].filter(n => n >= bwCount(r.seats))} value={r.cap} onChange={n => rooms.setRoomOpt({ cap: n })} label={n => `${n}명`} />
                <p className="text-[12px] font-bold text-[#0F172A]">맵</p>
                <select value={r.map} onChange={e => rooms.setRoomOpt({ map: e.target.value as BwMapPick })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#0F172A]">
                  <option value="random">🎲 랜덤</option>
                  {MAP_ORDER.map(k => <option key={k} value={k}>{BRAWL_MAPS[k].emoji} {BRAWL_MAPS[k].name}</option>)}
                  <option value="ring">🥊 링 서바이벌</option>
                </select>
                {r.map !== 'ring' && <><p className="text-[12px] font-bold text-[#0F172A]">목숨</p>
                <Seg values={[1, 3, 5]} value={r.lives} onChange={n => rooms.setRoomOpt({ lives: n })} label={n => `♥${n}`} /></>}
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={rooms.start} className="rounded-xl bg-[#0F172A] px-3 py-2.5 text-[13px] font-extrabold text-white hover:bg-[#1E293B]">▶ 시작</button>
              </>}
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={rooms.leave} className="rounded-xl bg-[#F1F5F9] px-3 py-2 font-semibold text-[#0F172A] hover:bg-[#E2E8F0]">{host ? '방 닫기' : '나가기'}</button>
            </>} />
        )
      })()}

      {rooms.session && (
        <BrawlGame key={rooms.session.bid} session={rooms.session} myId={myId} nameOf={nameOf}
          relay={payload => send('bw', { type: 'game', bid: rooms.session!.bid, payload } as unknown as Record<string, unknown>)}
          setRelayListener={rooms.setRelayListener}
          onEnd={onEnd}
          onClose={() => rooms.endSession()}
          onRestart={() => { const ses = rooms.session!; rooms.endSession(); rooms.openRoom(ses.players.length, true, mapPick, ses.lives) }}
          arena={opts.arena} />
      )}
    </>
  )

  // 모집 카드(운동장 위)
  const offerCards = (className: string) => (rooms.offers.length > 0 && !busy ? (
    <div className={`absolute left-1/2 z-[55] flex -translate-x-1/2 flex-col gap-1.5 ${className}`}>
      {rooms.offers.slice(0, 2).map(o => (
        <div key={o.bid} className="flex items-center gap-3 rounded-2xl bg-[#0F172A] py-2 pl-2.5 pr-2 text-white shadow-[0_18px_40px_-12px_rgba(15,23,42,0.6)] ring-1 ring-white/10" style={{ animation: 'pg-toast 220ms ease-out' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F43F5E] text-[18px]">🥊</span>
          <div className="leading-tight">
            <p className="text-[12.5px] font-bold">{nickOf(o.host)}님이 격투기 모집 중</p>
            <p className="text-[11px] text-white/65">{o.count}/{o.cap}명 · 빈자리는 CPU</p>
          </div>
          <button type="button" disabled={o.count >= o.cap} onMouseDown={e => e.preventDefault()} onClick={() => { setLobby(false); rooms.join(o) }}
            className="rounded-xl bg-[#FACC15] px-4 py-2 text-[12.5px] font-extrabold text-[#0F172A] transition-colors hover:bg-[#FDE047] disabled:opacity-40">{o.count >= o.cap ? '꽉 참' : '참가하기'}</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => rooms.dismissOffer(o.bid)}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-white/55 transition-colors hover:text-white">다음에</button>
        </div>
      ))}
    </div>
  ) : null)

  const sub = rooms.offers[0] ? `${rooms.offers[0].count}/${rooms.offers[0].cap} 모집 중` : '밀어내기 · 링 서바이벌'
  // PC 광장 고르기 화면 위 참가 띠용(2026-11-24) — 첫 모집 하나
  const o0 = rooms.offers[0]
  const invite = o0 && !busy ? { id: o0.bid, host: o0.host, label: '격투기', count: o0.count, cap: o0.cap, join: () => { setLobby(false); rooms.join(o0) }, dismiss: () => rooms.dismissOffer(o0.bid) } : null
  return { ui, offerCards, busy, playing: !!rooms.session, lobby, setLobby, enter, onMsg, modalOpen, hasOffer: rooms.offers.length > 0, sub, invite }
}

function MapBtn({ on, onClick, emoji, name }: { on: boolean; onClick: () => void; emoji: string; name: string }) {
  return (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-bold ${on ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#334155] hover:bg-[#E2E8F0]'}`}>
      <span className="text-[18px]">{emoji}</span>{name}
    </button>
  )
}
function Seg({ values, value, onChange, label }: { values: number[]; value: number; onChange: (n: number) => void; label: (n: number) => string }) {
  return (
    <div className="flex gap-1 rounded-xl bg-[#F1F5F9] p-1">
      {values.map(n => (
        <button key={n} type="button" onMouseDown={e => e.preventDefault()} onClick={() => onChange(n)}
          className={`flex-1 rounded-lg py-1 text-[12px] font-bold ${value === n ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B]'}`}>{label(n)}</button>
      ))}
    </div>
  )
}

// 경기 창 — 세션 → 자리·채널을 맞춰 BrawlArena. 풀화면(arena)이면 GameArena, 아니면 창
function BrawlGame(props: {
  session: BwSession
  myId: string
  nameOf: (id: string) => string
  relay: (payload: BrawlWire) => void
  setRelayListener: (fn: ((m: BrawlWire) => void) | null) => void
  onEnd: (r: BrawlResult) => void
  onClose: () => void
  onRestart: () => void
  arena?: { layout: GameLayout; onWindow?: () => void }
}) {
  const { session: ses, myId } = props
  const humans = ses.players.filter(Boolean).length
  const role = humans > 1 ? (ses.hostId === myId ? 'host' : 'guest') : null
  const { net, deliver } = useBrawlNet(role ? ses.bid : null, role, props.relay)
  const { setRelayListener } = props
  useEffect(() => {
    setRelayListener(deliver)
    return () => setRelayListener(null)
  }, [deliver, setRelayListener])
  // 판 하나 동안 고정
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entrants = useMemo(() => entrantsOf(ses, props.nameOf), [ses.bid])
  const [offset, setOffset] = useState<number | null>(null)
  useEffect(() => { void getServerOffset().then(setOffset) }, [])
  const [result, setResult] = useState<BrawlResult | null>(null)
  const keepRef = useRef<BrawlState | null>(null) // 창 모드↔풀화면 전환에도 판이 이어지게
  const keep = useMemo(() => ({ get: () => keepRef.current, set: (s: BrawlState) => { keepRef.current = s } }), [])
  const onEndRef = useRef(props.onEnd)
  useEffect(() => { onEndRef.current = props.onEnd })
  const onResult = useCallback((r: BrawlResult) => { setResult(r); onEndRef.current(r) }, [])
  const { ref, scale, h } = useFitBox(1000)
  const m = BRAWL_MAPS[ses.map]
  const title = `🥊 격투기 · ${m.emoji} ${m.name}`
  const sub = `${ses.players.length}명${humans > 1 ? '' : ' · CPU전'} · ${ses.map === 'ring' ? '체력 서바이벌' : `목숨 ${ses.lives}`}`

  const endOverlay = result && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45">
      <div className="w-[360px] rounded-2xl bg-white p-5 text-center shadow-2xl">
        <p className="text-[13px] text-gray-500">{m.emoji} {m.name}</p>
        <p className="mt-1 text-[22px] font-black text-[#1F2933]">{result.winner?.id === myId ? '🏆 우승!' : `🏆 ${result.winner?.name ?? '무승부'} 우승`}</p>
        <ol className="mt-3 space-y-1 text-left text-[13.5px]">
          {result.ranking.map(f => (
            <li key={f.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${f.id === myId ? 'bg-amber-50 font-bold' : ''}`}>
              <span className="w-6 text-gray-400">{f.place}위</span>
              <span className="h-3 w-3 rounded-full" style={{ background: f.color }} />
              <span className="flex-1">{f.name}</span>
              <span className="text-gray-400">{f.lives > 0 ? `♥${f.lives} · ${Math.round(f.pct)}%` : '탈락'}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex gap-2">
          {humans <= 1 && <button type="button" onClick={props.onRestart} className="flex-1 rounded-xl bg-[#1F2933] py-2.5 text-[14px] font-bold text-white">다시 한 판</button>}
          <button type="button" onClick={props.onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-bold text-[#1F2933]">나가기</button>
        </div>
      </div>
    </div>
  )
  const ready = offset !== null && !(role && !net)
  const arenaNode = ready
    ? <BrawlArena entrants={entrants} myId={myId} map={ses.map} lives={ses.lives} seed={ses.seed} startAt={ses.startAt} offset={offset!} net={net} onResult={onResult} overlay={endOverlay} keep={keep} />
    : <div className="flex items-center justify-center text-[15px]" style={{ width: BRAWL_WORLD.w, height: BRAWL_WORLD.h, color: AR.sub }}>연결하는 중…</div>

  if (props.arena) {
    return (
      <GameArena layout={props.arena.layout} title={title} sub={sub} onBack={props.onClose} onClose={props.onClose} onWindow={props.arena.onWindow}
        world={BRAWL_WORLD} scene={arenaNode} status={<Pill>{humans > 1 ? `사람 ${humans}명` : 'CPU전'}</Pill>}
        deck={props.arena.layout === 'wide' ? <p className="text-[13px]" style={{ color: '#C7D2E3' }}>{HELP}</p> : undefined} />
    )
  }
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B1220]" style={FULL_OVERLAY_STYLE}>
      <div style={{ width: 1000 * scale, height: h * scale }}>
        <div ref={ref} className="rounded-2xl bg-[#F8FAFC] p-3 shadow-2xl" style={{ width: 1000, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[17px] font-extrabold text-[#0F172A]">{title} <span className="text-[13px] font-semibold text-[#64748B]">· {sub}</span></p>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={props.onClose} className="ml-auto rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-[12.5px] font-semibold text-[#0F172A] hover:bg-[#E2E8F0]">나가기</button>
          </div>
          <div className="overflow-hidden rounded-xl" style={{ width: 974, height: (974 * BRAWL_WORLD.h) / BRAWL_WORLD.w }}>
            <div style={{ transform: `scale(${974 / BRAWL_WORLD.w})`, transformOrigin: '0 0' }}>{arenaNode}</div>
          </div>
          <p className="mt-2 text-[12px] text-[#64748B]">{HELP}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
