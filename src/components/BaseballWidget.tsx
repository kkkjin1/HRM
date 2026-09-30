'use client'

// 비거리 야구 — 버튼을 누르면 화면 위에 뜨는 플로팅 위젯(드래그로 이동, ✕로 닫기).
// 개인전: 각자 자기 PC에서 1이닝(3아웃)짜리 게임(1S1B까지 버팀, 2S 삼진·2B 볼넷, 주자·득점)을 치고,
// 결과(baseball_plays 1행)가 하루 라운드(서버 날짜 기준)로 모인다.
// 목록 화면 = 오늘 팀원별 상태 + 랭킹(오늘/누적) + (관리자만) 추가 게임 수, 플레이 화면 = 졸라맨 타자 vs 졸라맨 투수.
// 오른쪽 아래 모서리를 끌면 위젯 전체(글씨 포함)가 확대/축소된다.
// 목록에서 팀원에게 ⚔ 대결을 신청하면 1:1 실시간 대결(DuelView), 진행 중인 대결은 누구나 관전할 수 있다.
// 토너먼트는 팀원 누구나 개최(TournamentPanel), 진행은 위젯을 연 PC들이 같이 맡는다(useTournamentDirector).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useAuthEmail, useBonus, useCareerPlays, useDuels, usePraiseCounts, useTodayPlays, useTournamentDirector, useTournaments } from '@/lib/useBaseball'
import { getServerOffset, kstDate } from '@/lib/serverClock'
import { displayName } from '@/lib/members'
import Avatar from '@/components/Avatar'
import { FieldScene, arrivalOf, usePitchAnimation, type Anim, type MemberLite } from '@/components/baseball/scene'
import DuelView from '@/components/baseball/DuelView'
import TournamentPanel from '@/components/baseball/TournamentPanel'
import { isAlive } from '@/lib/baseballTournament'
import { duelScore, halfRoles, inningLabel, isFreshDuel, type Duel } from '@/lib/baseballDuel'
import {
  BASEBALL_ADMIN_EMAIL,
  careerStats, dailyAllowance, isHit, judgeSwing, paLabel, randomPitch, rankDay, simulateGame, tallySwings,
  type Play, type Swing,
} from '@/lib/baseball'

const WIDGET_W = 440
const WIDGET_H = 340
const POS_KEY = 'hrm_baseball_widget_pos'
const SIZE_KEY = 'hrm_baseball_widget_scale'
const MIN_SCALE = 0.8
const MAX_SCALE = 2
const MEDALS = ['🥇', '🥈', '🥉']

function scoreText(r: { runs: number; homeruns: number; hits: number }) {
  return `${r.runs}점 · 홈런 ${r.homeruns} · 안타 ${r.hits}`
}

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null
  } catch {
    return null
  }
}

function loadScale(): number {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY))
    return v >= MIN_SCALE && v <= MAX_SCALE ? v : 1
  } catch {
    return 1
  }
}

function clampPos(p: { x: number; y: number }, scale = 1) {
  return {
    x: Math.max(4, Math.min(window.innerWidth - WIDGET_W * scale - 4, p.x)),
    y: Math.max(4, Math.min(window.innerHeight - 120, p.y)),
  }
}

export default function BaseballWidget({ onClose }: { onClose: () => void }) {
  const { members } = useMembers()
  const { me, loaded: meLoaded } = useCurrentMember()
  const email = useAuthEmail()
  const isAdmin = email === BASEBALL_ADMIN_EMAIL
  // "오늘"은 서버 시각(KST) 기준 — PC 날짜가 틀려도 모두 같은 라운드를 본다.
  const [today, setToday] = useState(() => kstDate(Date.now()))
  useEffect(() => {
    let active = true
    getServerOffset().then(off => { if (active) setToday(kstDate(Date.now() + off)) })
    return () => { active = false }
  }, [])
  const { plays, loaded: playsLoaded, applyLocal } = useTodayPlays(today)
  const { counts: praiseCounts, loaded: praiseLoaded } = usePraiseCounts()
  const { bonus, setBonus } = useBonus(today)
  const [tab, setTab] = useState<'today' | 'career'>('today')
  const careerPlays = useCareerPlays(tab === 'career')

  const [view, setView] = useState<'list' | 'play' | 'duel'>('list')
  const [duelId, setDuelId] = useState<string | null>(null)
  const { duels, applyDuel } = useDuels()
  // 신청 만료·오래 멈춘 대결 판정용 시계 (15초마다)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])
  const [playId, setPlayId] = useState<string | null>(null)
  // 도착 후 안 치면 루킹/볼 판정 — resolveSwing은 아래에 선언되므로 ref로 연결
  const deadlineRef = useRef<(t: number) => void>(() => {})
  const { anim, animRef, now, setAnim, animActive } = usePitchAnimation((_a: Anim, t: number) => deadlineRef.current(t))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolvedPitchRef = useRef<string | null>(null)

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const nameOf = (id: string) => displayName(memberMap.get(id)) || '(알 수 없음)'
  const allowanceOf = (id: string) => dailyAllowance(praiseCounts.get(id) ?? 0, bonus.get(id) ?? 0)

  const current = plays.find(p => p.id === playId) ?? null
  const playRef = useRef<Play | null>(null)
  useEffect(() => { playRef.current = current }, [current])

  const myPlays = me ? plays.filter(p => p.member_id === me.id) : []
  const myAllowance = me ? allowanceOf(me.id) : 0
  const myUnfinished = myPlays.find(p => !p.finished) ?? null
  const myRemaining = Math.max(0, myAllowance - myPlays.length)

  const todayRank = useMemo(() => rankDay(plays), [plays])
  const career = useMemo(() => (careerPlays ? careerStats(careerPlays, today) : null), [careerPlays, today])

  // ── 게임 시작/이어하기 ──
  async function ready() {
    if (!me || busy) return
    setError(null)
    if (myUnfinished) {
      setPlayId(myUnfinished.id)
      setAnim(null)
      setView('play')
      return
    }
    if (myRemaining <= 0) return
    setBusy(true)
    const gameNo = myPlays.reduce((m, p) => Math.max(m, p.game_no), 0) + 1
    const { data, error } = await createClient()
      .from('baseball_plays')
      .insert({ member_id: me.id, play_date: today, game_no: gameNo })
      .select()
      .single()
    setBusy(false)
    if (error || !data) {
      setError(error?.code === '23505' ? '다른 창에서 이미 시작한 게임이 있어요. 잠시 후 다시 눌러주세요' : `게임을 시작하지 못했어요: ${error?.message ?? ''}`)
      return
    }
    applyLocal(data as Play)
    setPlayId((data as Play).id)
    setAnim(null)
    setView('play')
  }

  // ── 투구/스윙 ──
  function throwPitch() {
    const p = playRef.current
    if (!p || p.finished || animActive) return
    setError(null)
    setAnim({ pitch: randomPitch(), start: performance.now(), result: null, resultStart: null, paEnded: null, selfResolve: true })
  }

  function resolveSwing(offset: number | null, t: number) {
    const a = animRef.current
    const p = playRef.current
    if (!a || a.result || !p || resolvedPitchRef.current === a.pitch.id) return
    resolvedPitchRef.current = a.pitch.id
    const { outcome, distance } = judgeSwing(offset, a.pitch)
    const swing: Swing = { type: a.pitch.type, speed: a.pitch.speed, outcome, distance, offset: offset === null ? null : Math.round(offset) }

    const before = simulateGame(p.swings)
    const swings = [...p.swings, swing]
    const after = simulateGame(swings)
    const paEnded = after.results.length > before.results.length ? paLabel(after.results[after.results.length - 1]) : null
    setAnim({ ...a, result: swing, resultStart: t, paEnded })

    const tally = tallySwings(swings)
    const patch = { swings, ...tally, finished_at: tally.finished ? new Date().toISOString() : null }
    applyLocal({ ...p, ...patch })
    createClient().from('baseball_plays').update(patch).eq('id', p.id).then(({ error }) => {
      if (error) setError(`결과 저장 실패: ${error.message}`)
    })
  }

  function swingBat() {
    const a = animRef.current
    if (!a || a.result || a.pitch.type === 'hbp') return // 몸쪽 공은 휘둘러도 사구
    const t = performance.now()
    resolveSwing(t - arrivalOf(a), t)
  }

  useEffect(() => { deadlineRef.current = t => resolveSwing(null, t) })

  // 스페이스바 스윙
  useEffect(() => {
    if (view !== 'play') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const a = animRef.current
      if (!a || a.result) return
      e.preventDefault()
      swingBat()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- swingBat은 ref만 읽는다
  }, [view])

  function backToList() {
    setAnim(null)
    setPlayId(null)
    setDuelId(null)
    setView('list')
  }

  // ── 1:1 대결 ──
  const liveDuels = useMemo(() => [...duels.values()].filter(d => isFreshDuel(d, clock)), [duels, clock])
  // ── 토너먼트 (모집·진행 중 1개, 없으면 2시간 안에 끝난 것) ──
  const { tournaments, applyTournament } = useTournaments()
  const activeTournament = useMemo(() => {
    const list = [...tournaments.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return list.find(t => t.status === 'recruiting' || t.status === 'running')
      ?? list.find(t => t.status === 'done' && clock - new Date(t.updated_at).getTime() < 2 * 3600 * 1000)
      ?? null
  }, [tournaments, clock])
  useTournamentDirector(activeTournament, duels, applyTournament, applyDuel)

  // 대결 중이거나 토너먼트에서 아직 살아있는 선수는 친선 대결 신청 불가
  const busyWithDuel = (id: string) =>
    liveDuels.some(d => d.challenger_id === id || d.opponent_id === id) || (!!activeTournament && isAlive(activeTournament, id))
  const currentDuel = duelId ? duels.get(duelId) ?? null : null

  async function challenge(opponentId: string) {
    if (!me || busyWithDuel(me.id) || busyWithDuel(opponentId)) return
    setError(null)
    const { data, error } = await createClient()
      .from('baseball_duels')
      .insert({ challenger_id: me.id, opponent_id: opponentId })
      .select()
      .single()
    if (error || !data) { setError(`대결 신청 실패: ${error?.message ?? ''}`); return }
    applyDuel(data as Duel)
    setDuelId((data as Duel).id)
    setView('duel')
  }

  function openDuel(id: string) {
    setAnim(null)
    setDuelId(id)
    setView('duel')
  }

  // 내가 낀 대결이 시작되면(상대가 수락) 목록에 있을 때 자동으로 대결 화면을 연다 — 같은 대결은 한 번만
  const autoOpenedRef = useRef(new Set<string>())
  useEffect(() => {
    if (!me || view !== 'list') return
    const mine = liveDuels.find(d => (d.status === 'playing' || d.status === 'rps') && (d.challenger_id === me.id || d.opponent_id === me.id) && !autoOpenedRef.current.has(d.id))
    if (!mine) return
    autoOpenedRef.current.add(mine.id)
    openDuel(mine.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openDuel은 setState만 부른다
  }, [liveDuels, me, view])

  async function changeBonus(memberId: string, delta: number) {
    if (!isAdmin || !me) return
    const err = await setBonus(memberId, (bonus.get(memberId) ?? 0) + delta, me.name)
    if (err) setError(`추가 횟수 저장 실패: ${err}`)
  }

  // ── 위치(드래그) ── 위젯은 열 때만 마운트되므로(SSR 없음) 초기값을 바로 window 기준으로 잡는다.
  const [scale, setScale] = useState(() => (typeof window === 'undefined' ? 1 : loadScale()))
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    const sc = loadScale()
    return clampPos(loadPos() ?? { x: window.innerWidth - WIDGET_W * sc - 24, y: window.innerHeight - WIDGET_H * sc - 110 }, sc)
  })
  const resizeRef = useRef<{ x0: number; s0: number } | null>(null)

  // 오른쪽 아래 모서리 드래그 → 가로로 끈 만큼 위젯 전체 배율 조정
  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.stopPropagation()
    resizeRef.current = { x0: e.clientX, s0: scale }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = resizeRef.current
    if (!r) return
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, r.s0 + (e.clientX - r.x0) / WIDGET_W))
    setScale(Math.round(next * 100) / 100)
  }
  function onResizeEnd() {
    if (!resizeRef.current) return
    resizeRef.current = null
    try { localStorage.setItem(SIZE_KEY, String(scale)) } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
  }
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, scale))
  }
  function onDragEnd() {
    if (!dragRef.current) return
    dragRef.current = null
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
  }
  const dragProps = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }

  // ── 렌더 ──
  const btnPrimary = 'text-[12px] font-semibold text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-3 py-1.5'
  const btnGhost = 'text-[11.5px] text-[#5B6472] bg-white/70 border border-[#E5E8EB] hover:bg-white rounded-lg px-2.5 py-1'

  return (
    <div
      className="fixed z-[60] select-none rounded-2xl bg-white/75 backdrop-blur-md border border-white/70 shadow-[0_8px_30px_rgba(16,24,40,0.18)]"
      style={{ left: pos.x, top: pos.y, width: WIDGET_W * scale }}
    >
      {/* 내용 전체를 배율만큼 확대(글씨·버튼 포함) — 눈이 안 좋은 사람도 크게 볼 수 있게 */}
      <div style={{ zoom: scale, width: WIDGET_W }}>
      <div className="cursor-move touch-none flex items-center justify-between gap-2 px-3 pt-2 pb-1" {...dragProps}>
        <span className="text-[11.5px] font-semibold text-[#5B6472]">
          ⚾ 비거리 야구
          <span className="font-normal text-[#9AA5B1] ml-1.5">오늘 라운드 · {today.slice(5).replace('-', '.')}</span>
        </span>
        <span className="flex items-center gap-1">
          {(view === 'duel' || (view === 'play' && !animActive)) && (
            <button onClick={backToList} className="text-[11px] text-[#7A8491] hover:text-[#1F2933] rounded px-1.5 py-0.5">목록</button>
          )}
          <button onClick={onClose} title="닫기" className="text-[13px] leading-none text-[#7A8491] hover:text-[#DC2626] rounded px-1.5 py-0.5">✕</button>
        </span>
      </div>

      {view === 'list' ? (
        <ListView
          members={members.map(m => m.id)}
          meId={me?.id ?? null}
          meLoaded={meLoaded}
          plays={plays}
          loaded={playsLoaded && praiseLoaded}
          nameOf={nameOf}
          memberMap={memberMap}
          allowanceOf={allowanceOf}
          bonus={bonus}
          isAdmin={isAdmin}
          onChangeBonus={changeBonus}
          myPraise={me ? praiseCounts.get(me.id) ?? 0 : 0}
          myAllowance={myAllowance}
          myRemaining={myRemaining}
          myUnfinished={!!myUnfinished}
          onReady={ready}
          busy={busy}
          todayRank={todayRank}
          career={career}
          tab={tab}
          setTab={setTab}
          btnPrimary={btnPrimary}
          btnGhost={btnGhost}
          liveDuels={liveDuels}
          busyWithDuel={busyWithDuel}
          onChallenge={challenge}
          onOpenDuel={openDuel}
          tournamentPanel={
            <TournamentPanel
              tournament={activeTournament}
              meId={me?.id ?? null}
              isAdmin={isAdmin}
              nameOf={nameOf}
              memberMap={memberMap}
              duels={duels}
              applyTournament={applyTournament}
              onOpenDuel={openDuel}
              btnPrimary={btnPrimary}
              btnGhost={btnGhost}
            />
          }
        />
      ) : view === 'duel' ? (
        currentDuel ? (
          <DuelView
            key={currentDuel.id}
            duel={currentDuel}
            meId={me?.id ?? null}
            memberMap={memberMap}
            nameOf={nameOf}
            applyDuel={applyDuel}
            onBack={backToList}
            dragProps={dragProps}
            btnPrimary={btnPrimary}
            btnGhost={btnGhost}
          />
        ) : (
          <p className="px-3 pb-3 text-[11.5px] text-[#9AA5B1]">대결을 불러오는 중…</p>
        )
      ) : (
        <PlayView
          play={current}
          anim={anim}
          now={now}
          animActive={animActive}
          batter={me ? memberMap.get(me.id) ?? null : null}
          dragProps={dragProps}
          onThrow={throwPitch}
          onSwing={swingBat}
          onBack={backToList}
          onAgain={ready}
          remaining={myRemaining}
          busy={busy}
          btnPrimary={btnPrimary}
          btnGhost={btnGhost}
        />
      )}

      {error && <p className="px-3 pb-2 text-[11px] text-[#DC2626]">⚠ {error}</p>}
      </div>

      {/* 크기 조절 손잡이 */}
      <div
        title="끌어서 크기 조절"
        className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize touch-none"
        onPointerDown={onResizeStart} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd}
      >
        <svg viewBox="0 0 16 16" className="w-full h-full text-[#9AA5B1]" aria-hidden>
          <path d="M14 6 L6 14 M14 10 L10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

function ListView(props: {
  members: string[]
  meId: string | null
  meLoaded: boolean
  plays: Play[]
  loaded: boolean
  nameOf: (id: string) => string
  memberMap: Map<string, MemberLite>
  allowanceOf: (id: string) => number
  bonus: Map<string, number>
  isAdmin: boolean
  onChangeBonus: (memberId: string, delta: number) => void
  myPraise: number
  myAllowance: number
  myRemaining: number
  myUnfinished: boolean
  onReady: () => void
  busy: boolean
  todayRank: ReturnType<typeof rankDay>
  career: ReturnType<typeof careerStats> | null
  tab: 'today' | 'career'
  setTab: (t: 'today' | 'career') => void
  btnPrimary: string
  btnGhost: string
  liveDuels: Duel[]
  busyWithDuel: (id: string) => boolean
  onChallenge: (opponentId: string) => void
  onOpenDuel: (id: string) => void
  tournamentPanel: ReactNode
}) {
  const { plays, meId, nameOf, memberMap, todayRank } = props
  const invitesToMe = props.liveDuels.filter(d => d.status === 'invited' && d.opponent_id === meId)
  const mySent = props.liveDuels.filter(d => d.status === 'invited' && d.challenger_id === meId)
  const playingDuels = props.liveDuels.filter(d => d.status === 'playing' || d.status === 'rps')
  const [manage, setManage] = useState(false)
  const rankOf = new Map(todayRank.map(r => [r.member_id, r]))
  // 나를 맨 위로
  const ordered = meId ? [meId, ...props.members.filter(id => id !== meId)].filter(id => memberMap.has(id)) : props.members

  return (
    <div className="px-3 pb-3 flex flex-col gap-2.5">
      {props.meLoaded && !meId && <p className="text-[11px] text-[#9AA5B1]">팀원으로 등록된 계정만 참여할 수 있어요.</p>}
      {meId && (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11px] text-[#7A8491]">
            👏 칭찬 {props.myPraise}개 → 오늘 <b className="text-[#1F2933]">{props.myAllowance}게임</b> · 남은 {props.myRemaining}
            <span className="text-[#B0B8C1]"> (기본 1 + 칭찬 4개당 1, 최대 5)</span>
          </p>
          {props.isAdmin && (
            <button onClick={() => setManage(v => !v)}
              className={`text-[10.5px] rounded-md px-1.5 py-0.5 border flex-shrink-0 ${manage ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'text-[#7A8491] border-[#E5E8EB] hover:bg-white'}`}>
              ⚙ 횟수
            </button>
          )}
        </div>
      )}

      {props.tournamentPanel}

      {/* 대결: 받은 신청 / 보낸 신청 / 진행 중(관전) */}
      {(invitesToMe.length > 0 || mySent.length > 0 || playingDuels.length > 0) && (
        <div className="flex flex-col gap-1">
          {invitesToMe.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-[11.5px] bg-[#FFF8E6]/90 border border-[#F5DFA6] rounded-lg px-2.5 py-1.5">
              <span className="flex-1">⚔ <b>{nameOf(d.challenger_id)}</b>님이 대결을 신청했어요!</span>
              <button onClick={() => props.onOpenDuel(d.id)} className={props.btnPrimary}>보기</button>
            </div>
          ))}
          {mySent.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-[11px] text-[#7A8491] px-1">
              <span className="flex-1">⏳ {nameOf(d.opponent_id)}님 수락 대기 중</span>
              <button onClick={() => props.onOpenDuel(d.id)} className={props.btnGhost}>열기</button>
            </div>
          ))}
          {playingDuels.map(d => {
            const mine = d.challenger_id === meId || d.opponent_id === meId
            const h = Math.max(0, d.halves.length - 1)
            const sc = duelScore(d.halves)
            const r = halfRoles(d, h)
            return (
              <div key={d.id} className="flex items-center gap-2 text-[11px] bg-white/80 border border-[#EEF0F2] rounded-lg px-2.5 py-1">
                <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-pulse flex-shrink-0" />
                <span className="flex-1 truncate tabular-nums">
                  {nameOf(d.opponent_id)} {sc.opponent} : {sc.challenger} {nameOf(d.challenger_id)}
                  <span className="text-[#9AA5B1] ml-1.5">{inningLabel(h)} · {nameOf(r.pitcher)} 투구</span>
                </span>
                <button onClick={() => props.onOpenDuel(d.id)} className={mine ? props.btnPrimary : props.btnGhost}>{mine ? '입장' : '👀 관전'}</button>
              </div>
            )
          })}
        </div>
      )}

      <ul className="bg-white/80 rounded-lg border border-[#EEF0F2] divide-y divide-[#F0F2F5] max-h-[176px] overflow-y-auto">
        {ordered.map(id => {
          const mine = plays.filter(p => p.member_id === id)
          const done = mine.filter(p => p.finished).length
          const playing = mine.some(p => !p.finished)
          const best = rankOf.get(id)
          const isMe = id === meId
          const extra = props.bonus.get(id) ?? 0
          return (
            <li key={id} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] ${isMe ? 'bg-[#4C7FE0]/[0.05]' : ''}`}>
              <Avatar member={memberMap.get(id)} size={20} />
              <span className={`w-16 truncate ${isMe ? 'font-semibold text-[#1F2933]' : 'text-[#2B333B]'}`}>{nameOf(id)}</span>
              <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                playing ? 'bg-[#4C7FE0]/10 text-[#4C7FE0]' : done > 0 ? 'bg-[#16A34A]/10 text-[#15803D]' : 'bg-[#F0F2F5] text-[#9AA5B1]'
              }`}>
                {playing ? '플레이 중' : done > 0 ? `게임완료 ${done}/${props.allowanceOf(id)}` : '대기'}
              </span>
              {manage ? (
                <span className="flex-1 flex items-center justify-end gap-1 text-[10.5px] text-[#5B6472]">
                  <span className="tabular-nums">오늘 {props.allowanceOf(id)}게임 (추가 {extra})</span>
                  <button onClick={() => props.onChangeBonus(id, -1)} disabled={extra <= 0} className="w-5 h-5 rounded border border-[#E5E8EB] bg-white disabled:opacity-30">−</button>
                  <button onClick={() => props.onChangeBonus(id, 1)} className="w-5 h-5 rounded border border-[#E5E8EB] bg-white">+</button>
                </span>
              ) : (
                <span className="flex-1 text-right text-[10.5px] text-[#5B6472] tabular-nums truncate">{best ? scoreText(best) : ''}</span>
              )}
              {!isMe && !manage && meId && (
                <button onClick={() => props.onChallenge(id)} disabled={props.busyWithDuel(id) || props.busyWithDuel(meId)}
                  title="1:1 실시간 대결 신청" className="text-[10.5px] rounded-md px-1.5 py-0.5 border border-[#E5E8EB] bg-white/80 text-[#5B6472] hover:bg-white disabled:opacity-30 flex-shrink-0">
                  ⚔ 대결
                </button>
              )}
              {isMe && !manage && (
                props.myUnfinished ? (
                  <button onClick={props.onReady} disabled={props.busy} className={props.btnPrimary}>이어하기</button>
                ) : props.myRemaining > 0 ? (
                  <button onClick={props.onReady} disabled={props.busy || !props.loaded} className={props.btnPrimary}>준비</button>
                ) : (
                  <span className="text-[10.5px] text-[#B0B8C1] flex-shrink-0">오늘 끝</span>
                )
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-1 text-[11px]">
        {(['today', 'career'] as const).map(t => (
          <button key={t} onClick={() => props.setTab(t)}
            className={`px-2.5 py-1 rounded-full ${props.tab === t ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-white/80'}`}>
            {t === 'today' ? '오늘 랭킹' : '누적'}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[#B0B8C1]">{props.tab === 'today' ? '1인 최고 1게임 · 득점→홈런→안타→비거리' : '라운드 1위 횟수 → 통산 득점'}</span>
      </div>

      {props.tab === 'today' ? (
        todayRank.length === 0 ? (
          <p className="text-[11.5px] text-[#9AA5B1] px-1">아직 완료된 게임이 없어요. 첫 기록을 남겨보세요.</p>
        ) : (
          <ol className="space-y-1 max-h-[120px] overflow-y-auto">
            {todayRank.map(r => (
              <li key={r.member_id} className="flex items-center gap-2 text-[11.5px] px-1">
                <span className="w-5 text-center">{MEDALS[r.rank - 1] ?? <span className="text-[10.5px] text-[#9AA5B1]">{r.rank}</span>}</span>
                <span className="w-20 truncate text-[#2B333B]">{nameOf(r.member_id)}</span>
                <span className="flex-1 text-right tabular-nums text-[#1F2933]">{scoreText(r)} · {r.best > 0 ? `${r.best}m` : '-'}</span>
              </li>
            ))}
          </ol>
        )
      ) : !props.career ? (
        <p className="text-[11.5px] text-[#9AA5B1] px-1">불러오는 중…</p>
      ) : props.career.length === 0 ? (
        <p className="text-[11.5px] text-[#9AA5B1] px-1">아직 누적 기록이 없어요.</p>
      ) : (
        <ol className="space-y-1 max-h-[120px] overflow-y-auto">
          {props.career.map((r, i) => (
            <li key={r.member_id} className="flex items-center gap-2 text-[11.5px] px-1">
              <span className="w-5 text-center">{MEDALS[i] ?? <span className="text-[10.5px] text-[#9AA5B1]">{i + 1}</span>}</span>
              <span className="w-20 truncate text-[#2B333B]">{nameOf(r.member_id)}</span>
              <span className="flex-1 text-right tabular-nums text-[#1F2933]">
                {r.dayWins > 0 && <span className="text-[#B7791F] mr-1.5">👑 {r.dayWins}회</span>}
                {r.runs}점 · 홈런 {r.homeruns} · 안타 {r.hits} · 최장 {r.best}m
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function PlayView(props: {
  play: Play | null
  anim: Anim | null
  now: number
  animActive: boolean
  batter: MemberLite | null
  dragProps: Record<string, (e: React.PointerEvent<HTMLDivElement>) => void>
  onThrow: () => void
  onSwing: () => void
  onBack: () => void
  onAgain: () => void
  remaining: number
  busy: boolean
  btnPrimary: string
  btnGhost: string
}) {
  const { play, anim, now, animActive, batter } = props
  const events = play?.swings ?? []
  // 애니메이션이 끝나기 전까진 방금 친 공을 카운트/주자에 반영하지 않는다(결과를 미리 스포하지 않게)
  const liveIdx = anim?.result && animActive ? events.length - 1 : -1
  const shownEvents = liveIdx >= 0 ? events.slice(0, liveIdx) : events
  const st = simulateGame(shownEvents)
  const full = simulateGame(events)

  const gameOver = !!play?.finished && !animActive

  if (!play) return <p className="px-3 pb-3 text-[11.5px] text-[#9AA5B1]">게임을 불러오는 중…</p>

  return (
    <div>
      <FieldScene
        anim={anim} now={now} st={st} batter={batter} dragProps={props.dragProps}
        prevLandings={shownEvents.filter(s => isHit(s.outcome))}
        idleCaption={play && !play.finished ? `${st.pa + 1}번째 타석 — 던지기를 누르세요` : ''}
      />

      <div className="px-3 pb-3 flex flex-col gap-2">
        {gameOver ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-[#1F2933] bg-[#F0FDF4]/90 border border-[#BBF7D0] rounded-lg px-2.5 py-1.5">
              🎉 게임완료! {scoreText(full)}{full.lob > 0 ? ` · 잔루 ${full.lob}` : ''}{full.best > 0 ? ` · 최장 ${full.best}m` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={props.onBack} className={props.btnPrimary}>목록·랭킹 보기</button>
              {props.remaining > 0 && <button onClick={props.onAgain} disabled={props.busy} className={props.btnGhost}>한 게임 더 (남은 {props.remaining})</button>}
            </div>
          </div>
        ) : anim && !anim.result ? (
          <button onClick={props.onSwing} className="self-start text-[12.5px] font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg px-4 py-1.5">
            🏏 스윙 <span className="text-[10px] font-normal opacity-80">Space · 볼은 참기</span>
          </button>
        ) : (
          <button onClick={props.onThrow} disabled={animActive} className={`self-start ${props.btnPrimary}`}>
            ⚾ 던지기 · {st.pa + 1}번째 타석 · {st.outs}아웃 ({st.strikes}S {st.balls}B)
          </button>
        )}
      </div>
    </div>
  )
}
