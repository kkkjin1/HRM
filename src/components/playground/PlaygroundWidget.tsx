'use client'

// 오늘의 운동장 — 상단 🎮 아이콘으로 여는 플로팅 팝업(드래그 이동, ✕/Esc 닫기).
// 옆에서 본 무대: 🏢 야근 사무실 — ⛰ 퇴근산 — 🏠 칼퇴 집. 각자 야구 캐릭터(장착 장비 그대로) + 닉네임.
// ←→ 걷기(↑↓ 없음 — 앞뒤 자리는 처음 배치로만 엇갈린다) · Space = 평지에선 휘두르기 / 산(사무실 쪽 비탈)에선 점프 / 칼퇴한 사람은 집 쪽 비탈에서 💣 업무 폭탄.
// 산 넘기는 별도 화면 없이 그 자리에서: 정상에서 굴러오는 공용 장애물(lib/playground.ts)을 피해 정상을 넘으면 칼퇴.
// 걸리거나 바로 뒷사람에게 붙잡히면(산에서 앞사람 바로 뒤 Space = 붙잡기) 사무실 쪽 기슭으로 굴러떨어지고 하루 기회(fallLimit — 게임마다 다름)가 줄어든다. 한 마디는 그날만 보인다.
// 퇴근길(무대+게임)은 날짜마다 랜덤으로 바뀐다(lib/playground.ts modeOf·MODES, 그림은 stages.tsx):
// 월 퇴근산 산사태 / 화 사무실 복도 탈출 / 수 업무 탄막 피하기 / 목 옥상 양궁 / 금 단체 줄넘기(+불꽃).
// ⚔ 대결 버튼: 접속한 팀원(또는 🤖 CPU)과 1:1 🤺 펜싱 · 🏸 배드민턴(DuelArena — 신청한 쪽 PC가 진행). 로컬(dev)에선 상단에서 골라 볼 수 있다.
//
// 실시간: Realtime 채널 하나(presence = 접속 표시, broadcast = 이동·휘두르기·붙잡기·폭탄·결과·한마디).
// 저장: playground_state(member_id, day) 1행 — 자리(x, y=앞뒤), 칼퇴 여부(side), 한 마디, 굴러떨어진 횟수(attempts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { getServerOffset, kstDate } from '@/lib/serverClock'
import { displayName } from '@/lib/members'
import { DOODLE_PALETTE } from '@/lib/data'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import { NO_EQUIP, equipFromSlots, fullSetTeam, type Equip } from '@/lib/baseballGear'
import {
  ARCH_LINE, ARCH_PASS, ARCH_SHOTS, ARENA_L, ARENA_R, ARROW_G, ARROW_VMAX, BOMB_COOLDOWN_MS, CLIMB_SPEED, DEPTH_SPEED, DESCEND_SPEED,
  CURL_PASS, CURL_STONES, DODGE_SURVIVE_MS, EDGE, GRAVITY, H, HACK_BOX, HACK_X, JUMP_V, KNOCKBACK, MESSAGE_MAX, MODES, MODE_ORDER, MTN_L, MTN_R,
  PATROL_CYCLE_MS, PEAK_X, ROPE_CLEAR, ROPE_HALF_MS, ROPE_L, ROPE_PERIOD_MS, ROPE_R, SHOT_SPEED, SWING_COOLDOWN_MS, W, WALK_SPEED,
  ARCH_BOX, angleAt, arrowPos, arrowScore, atArchLine, bombObstacle, bossCatching, bossLook, clampFlat, dropShadows, grabTarget, hitBy,
  STONE_VMAX, STONE_X0, SWEEP_WINDOW_MS, atHack, curlPowerAt, curlScore, inArena, stoneStep, inRope, liveObstacles, liveShots, modeOf, fallLimit, onClimbSide, onHomeSlope, onMountain, powerAt, ropeAngle,
  ropeBeat, ropeNeed, shotHit, spawnOf, surfaceY, swingTargets, targetH, windAt,
  type BossLook, type Mode, type Obstacle, type Side,
} from '@/lib/playground'
import { ModeLayer, STAGE_KEYFRAMES, StageArt, type ArcheryView, type CurlingView, type DodgeView, type RopeView } from '@/components/playground/stages'
import DuelArena, { type DuelMsg } from '@/components/playground/DuelArena'
import TouchPad from '@/components/playground/TouchPad'
import { DUEL_GAMES, type DSide, type DuelGame } from '@/lib/duel'
import GamepadIcon from '@/components/GamepadIcon'

type Row = { member_id: string; x: number; y: number; side: Side; message: string | null; attempts: number }
type Spot = { x: number; z: number; jy: number; side: Side; facing: 1 | -1; message: string | null; falls: number; tumbling: boolean }
type Toast = { id: number; text: string }
type Arrow = { id: string; angle: number; power: number; wind: number; firedAt: number; flight: number }
type DuelSession = { id: string; game: DuelGame; role: 'host' | 'guest'; vsCpu: boolean; mySide: DSide; oppId: string }
type LobbyMsg =
  | { type: 'invite'; id: string; from: string; to: string; game: DuelGame }
  | { type: 'accept'; id: string; from: string }
  | { type: 'decline'; id: string; from: string }
  | { type: 'cancel'; id: string; from: string }
  | { type: 'news'; id: string; text: string }

const POS_KEY = 'hrm_playground_widget_pos'
const WIDGET_W = W + 24
const BROADCAST_MS = 60
const SAVE_MS = 1500
const FOOT_X = MTN_L - 18 // 굴러떨어지면 여기로
const TUMBLE_MS = 850
// 로컬(dev)에선 하루 기회 제한 없이 계속 도전해볼 수 있게 — 배포본(production)에서만 3번 제한
const UNLIMITED = process.env.NODE_ENV !== 'production'
// 로컬(dev) 전용 연습봇 — 혼자서도 "같이 오르기·붙잡기"를 해볼 수 있게. 내 화면에만 있고 보내거나 저장하지 않는다.
const BOT_ID = 'bot'
const BOT_EQUIP: Equip = equipFromSlots({ head: { part: 'cap', team: 'kt' }, top: { part: 'uniform', team: 'kt' }, hand: { part: 'bat', team: 'kt' } })
const BOT_SPEED = CLIMB_SPEED * 0.75 // 뒤에서 따라잡아 붙잡아 볼 수 있게 조금 느리게
type Bot = {
  x: number; jy: number; vy: number; tumble: { start: number; fromX: number } | null; restUntil: number; err: number; grabReadyAt: number
  cyc: number; careless: boolean // 순찰 모드용
  dodgeStart: number // 탄막: 주차장에 들어간 서버 시각(-1 = 밖)
  rtK: number; rtMin: number; rJudged: number; rJumped: number // 줄넘기: 판정 중 박자·최저 높이·판정한 박자·뛴 박자
}
type BotCtx = { mode: Mode; day: string; serverNow: number }

const HIT_TEXT: Record<string, string> = {
  '📄': '결재 서류에 걸렸다', '📎': '클립에 미끄러졌다', '☕': '커피 쏟았다',
  '📚': '검토 자료에 깔렸다', '🧑‍💼': '부장님: "잠깐 얘기 좀…"', '📞': '전화 받아버렸다',
  '💬': '"퇴근 전에 이것만…" 메시지', '📧': '긴급 메일 맞음', '🔔': '회의 알림에 붙잡힘', '💣': '업무 폭탄 맞음',
  '👀': '부장님한테 딱 걸렸다', '🕳️': '다리가 없어서 낭떠러지로', '🥌': '컬링 점수 미달 — 처음부터', '🎯': '양궁 점수 미달 — 처음부터', '🗂️': '서류철에 맞았다',
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

function loadPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null')
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null
  } catch { return null }
}

// 저장된 자리를 무대 규칙에 맞게 — 산 위였으면 기슭으로(새로 열면 다시 올라야 한다)
function settle(r: Row): Spot {
  let x = r.x
  if (r.side === 'night' && (onMountain(x) || x >= MTN_R)) x = FOOT_X
  if (r.side === 'off' && x <= MTN_R) x = MTN_R + 24
  return { x, z: r.y, jy: 0, side: r.side, facing: 1, message: r.message, falls: r.attempts, tumbling: false }
}

export default function PlaygroundWidget({ onClose }: { onClose: () => void }) {
  const { members } = useMembers()
  const { me } = useCurrentMember()
  const myId = me?.id ?? null
  const [today, setToday] = useState<string | null>(null)
  const offsetRef = useRef(0)
  const [spots, setSpots] = useState<Map<string, Spot>>(new Map())
  const [equips, setEquips] = useState<Map<string, Equip>>(new Map())
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [dbMissing, setDbMissing] = useState(false)
  const [fx, setFx] = useState<Map<string, { swing?: number; hit?: number }>>(new Map())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [draftMsg, setDraftMsg] = useState('')
  const [clock, setClock] = useState(0) // 서버 시각 — 장애물 그리기용, 매 프레임 갱신
  const [bombs, setBombs] = useState<Obstacle[]>([])
  const [lastBomb, setLastBomb] = useState(0) // 서버 시각
  const [meSpot, setMeSpot] = useState<Spot | null>(null)
  // 오늘의 산 방식(날짜 랜덤) — 로컬(dev)에선 상단에서 바꿔 볼 수 있다(내 화면만)
  const [modeOverride, setModeOverride] = useState<Mode | null>(null)
  const mode: Mode = modeOverride ?? (today ? modeOf(today) : 'landslide')
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])
  const [fireworks, setFireworks] = useState(0)

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  // 채널 구독·루프 안에서 쓰는 값들은 ref로 — 바뀔 때마다 채널을 다시 만들지 않게
  const memberMapRef = useRef(memberMap)
  useEffect(() => { memberMapRef.current = memberMap }, [memberMap])
  const nickOf = useCallback((id: string) => (id === BOT_ID ? '🤖 연습봇' : displayName(memberMapRef.current.get(id)) || '?'), [])
  const indexRef = useRef(new Map<string, number>())
  useEffect(() => { indexRef.current = new Map(members.map((m, i) => [m.id, i])) }, [members])
  const blank = useCallback((id: string): Spot => ({ ...spawnOf(indexRef.current.get(id) ?? 0), jy: 0, side: 'night', facing: 1, message: null, falls: 0, tumbling: false }), [])

  // ── 위젯 위치(드래그) ──
  const [wpos, setWpos] = useState(() => {
    const saved = typeof window === 'undefined' ? null : loadPos()
    if (typeof window === 'undefined') return { x: 8, y: 64 }
    // 휴대폰 가로 화면처럼 낮은 화면이면 맨 위에 붙여서 창이 아래로 잘리지 않게
    const low = window.innerHeight < 560
    const p = saved ?? { x: Math.max(8, window.innerWidth - WIDGET_W - 24), y: 64 }
    return { x: Math.max(4, Math.min(p.x, window.innerWidth - 120)), y: low ? 4 : Math.max(4, Math.min(p.y, window.innerHeight - 80)) }
  })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, select')) return
    dragRef.current = { dx: e.clientX - wpos.x, dy: e.clientY - wpos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    setWpos({ x: Math.max(4, Math.min(window.innerWidth - 120, e.clientX - d.dx)), y: Math.max(4, Math.min(window.innerHeight - 80, e.clientY - d.dy)) })
  }
  const onDragEnd = () => {
    if (!dragRef.current) return
    dragRef.current = null
    try { localStorage.setItem(POS_KEY, JSON.stringify(wpos)) } catch { /* 위치 저장 실패는 무시 */ }
  }
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / WIDGET_W))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // 열 때 포커스를 비운다 — 아이콘 버튼에 포커스가 남아 있으면 Space가 그 버튼을 다시 누른다
  useEffect(() => { (document.activeElement as HTMLElement | null)?.blur?.() }, [])

  // ── 오늘 날짜·서버 시각(KST) ──
  useEffect(() => {
    let active = true
    getServerOffset().then(off => {
      if (!active) return
      offsetRef.current = off
      setToday(kstDate(Date.now() + off))
    })
    return () => { active = false }
  }, [])

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-2), { id, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800)
  }, [])

  const bumpFx = useCallback((id: string, kind: 'swing' | 'hit') => {
    const ts = Date.now()
    setFx(prev => new Map(prev).set(id, { ...prev.get(id), [kind]: ts }))
    setTimeout(() => setFx(prev => {
      if (prev.get(id)?.[kind] !== ts) return prev
      return new Map(prev).set(id, { ...prev.get(id), [kind]: undefined })
    }), kind === 'hit' ? 700 : 400)
  }, [])

  // 불금 칼퇴 축하 불꽃(3초)
  const celebrate = useCallback(() => {
    const ts = Date.now()
    setFireworks(ts)
    setTimeout(() => setFireworks(f => (f === ts ? 0 : f)), 3200)
  }, [])

  // ── 내 상태: 매 프레임 바뀌므로 ref가 원본 ──
  const meRef = useRef<Spot | null>(null)
  const vyRef = useRef(0)
  const tumbleRef = useRef<{ start: number; fromX: number; fromJy: number } | null>(null)
  const botRef = useRef<Bot | null>(UNLIMITED ? { x: FOOT_X, jy: 0, vy: 0, tumble: null, restUntil: 0, err: 0, grabReadyAt: 0, cyc: -1, careless: false, dodgeStart: -1, rtK: -1, rtMin: 0, rJudged: -1, rJumped: -1 } : null)
  const [botSpot, setBotSpot] = useState<Spot | null>(null)
  const dirtyRef = useRef(false)
  const lastSentRef = useRef(0)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const spotsRef = useRef(spots)
  const onlineRef = useRef(online)
  const bombsRef = useRef(bombs)
  useEffect(() => { spotsRef.current = spots }, [spots])
  useEffect(() => { onlineRef.current = online }, [online])
  useEffect(() => { bombsRef.current = bombs }, [bombs])

  const saveRow = useCallback(async (memberId: string, s: Spot) => {
    if (!today) return
    // 산 위는 저장하지 않는다(다시 열면 기슭부터) — 칼퇴한 사람은 집 쪽으로
    const x = s.side === 'night' ? (onMountain(s.x) || s.tumbling ? FOOT_X : s.x) : Math.max(MTN_R + 24, s.x)
    const { error } = await createClient().from('playground_state').upsert({
      member_id: memberId, day: today, x: Math.round(x), y: Math.round(s.z), side: s.side,
      message: s.message, attempts: s.falls, updated_at: new Date().toISOString(),
    })
    if (error?.code === '42P01' || error?.code === 'PGRST205') setDbMissing(true)
  }, [today])

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    void channelRef.current?.send({ type: 'broadcast', event, payload })
  }, [])

  const sendMove = useCallback((s: Spot) => {
    if (!myId) return
    lastSentRef.current = Date.now()
    send('move', { id: myId, x: s.x, z: s.z, jy: s.jy, side: s.side, f: s.facing, tb: s.tumbling })
  }, [myId, send])

  const setMe = useCallback((s: Spot, opts: { broadcast?: boolean; save?: boolean } = {}) => {
    meRef.current = s
    setMeSpot(s)
    dirtyRef.current = true
    if (opts.broadcast) sendMove(s)
    if (opts.save && myId) { dirtyRef.current = false; void saveRow(myId, s) }
  }, [myId, sendMove, saveRow])

  // 굴러떨어지기 시작 — 실제 이동은 루프가 TUMBLE_MS 동안 기슭까지 굴린다
  const startTumble = useCallback((label: string, by?: string) => {
    const cur = meRef.current
    if (!cur || !myId || tumbleRef.current) return
    tumbleRef.current = { start: performance.now(), fromX: cur.x, fromJy: cur.jy }
    vyRef.current = 0
    const falls = cur.falls + 1
    setMe({ ...cur, falls, tumbling: true }, { broadcast: true })
    send('fall', { id: myId, falls, label, by: by ?? null })
    const left = fallLimit(modeRef.current) - falls
    toast(`${by ? `✋ ${nickOf(by)}한테 붙잡혀 끌려내려갔다!` : `${label} ${HIT_TEXT[label] ?? '걸렸다'}`} — ${UNLIMITED ? `${falls}번째 (테스트: 무제한)` : left > 0 ? `남은 기회 ${left}` : '오늘 야근 확정 🌙'}`)
  }, [myId, setMe, send, toast, nickOf])

  // ── 처음 불러오기: 오늘 자리 + 장비 ──
  useEffect(() => {
    if (!today) return
    let active = true
    const supabase = createClient()
    ;(async () => {
      const [st, eq] = await Promise.all([
        supabase.from('playground_state').select('member_id, x, y, side, message, attempts').eq('day', today),
        supabase.from('baseball_equip').select('member_id, slots'),
      ])
      if (!active) return
      if (st.error) setDbMissing(true)
      const map = new Map<string, Spot>()
      for (const r of (st.data ?? []) as Row[]) map.set(r.member_id, settle(r))
      setSpots(map)
      const em = new Map<string, Equip>()
      for (const r of (eq.data ?? []) as { member_id: string; slots: unknown }[]) {
        em.set(r.member_id, equipFromSlots(r.slots))
      }
      setEquips(em)
      setLoaded(true)
    })()
    return () => { active = false }
  }, [today])

  // 내 시작 자리
  useEffect(() => {
    if (!loaded || !myId || meRef.current) return
    const start = spots.get(myId) ?? blank(myId)
    meRef.current = start
    setMeSpot(start)
    setDraftMsg(start.message ?? '')
  }, [loaded, myId, spots, blank])

  // ── 수: 업무 탄막 — 주차장에 들어간 시각부터 버틴 시간
  const dodgeStartRef = useRef<number | null>(null)
  const [dodgeSurvived, setDodgeSurvived] = useState<number | null>(null)

  // ── 목: 옥상 양궁 — 사대에서 Space 두 번(각도 → 힘)으로 발사, 3발 합계로 칼퇴/실패
  type Aim = { phase: 'angle' | 'power' | 'wait'; since: number; angle: number }
  const archRef = useRef<Aim>({ phase: 'angle', since: 0, angle: 0 })
  const [archAim, setArchAim] = useState<Aim>({ phase: 'angle', since: 0, angle: 0 })
  const archScoresRef = useRef<number[]>([])
  const [archScores, setArchScores] = useState<number[]>([])
  const [arrows, setArrows] = useState<Arrow[]>([])
  const addArrow = useCallback((a: Arrow) => setArrows(list => [...list.filter(x => x.firedAt > a.firedAt - 8000 && x.id !== a.id), a]), [])
  const setAim = useCallback((a: Aim) => { archRef.current = a; setArchAim(a) }, [])

  // ── 컬링(후보) — 투구 자리에서 Space = 힘 고정 → 스톤 출발, 미끄러지는 동안 ←→ 번갈아 = 스위핑
  type Curl = { phase: 'aim' | 'slide' | 'wait'; since: number }
  const curlRef = useRef<Curl>({ phase: 'aim', since: 0 })
  const [curl, setCurlState] = useState<Curl>({ phase: 'aim', since: 0 })
  const setCurl = useCallback((c: Curl) => { curlRef.current = c; setCurlState(c) }, [])
  const stoneRef = useRef<{ x: number; v: number } | null>(null)
  const [stone, setStone] = useState<{ x: number } | null>(null)
  const sweepTapsRef = useRef<number[]>([])
  const lastSweepKeyRef = useRef<string | null>(null)
  const [sweeping, setSweeping] = useState(false)
  const curlScoresRef = useRef<number[]>([])
  const [curlScores, setCurlScores] = useState<number[]>([])

  // ── ⚔ 1:1 대결
  const [duel, setDuel] = useState<DuelSession | null>(null)
  const duelRef = useRef<DuelSession | null>(null)
  useEffect(() => { duelRef.current = duel }, [duel])
  const [lobbyOpen, setLobbyOpen] = useState(false)
  const [duelGame, setDuelGame] = useState<DuelGame>('fencing')
  const [pendingInvite, setPendingInvite] = useState<{ id: string; to: string; game: DuelGame } | null>(null)
  const pendingRef = useRef(pendingInvite)
  useEffect(() => { pendingRef.current = pendingInvite }, [pendingInvite])
  const [invites, setInvites] = useState<{ id: string; from: string; game: DuelGame }[]>([])
  const arenaListenerRef = useRef<((m: DuelMsg) => void) | null>(null)
  const duelMsgRef = useRef<(m: LobbyMsg | DuelMsg) => void>(() => {})

  // ── 금: 단체 줄넘기 — 박자(k)별로 줄 안에 있던 사람들의 통과 여부를 모아(방송), 전원 통과면 연속 +1
  const ropeResultsRef = useRef(new Map<number, Map<string, boolean>>())
  const ropeTrackRef = useRef({ k: -1, min: 0 })
  const ropeJudgedRef = useRef(-1)
  const ropeEvalRef = useRef(-1)
  const ropeStreakRef = useRef(0)
  const [ropeStreak, setRopeStreak] = useState(0)
  const recordRope = useCallback((k: number, id: string, ok: boolean) => {
    const m = ropeResultsRef.current
    const r = m.get(k) ?? new Map<string, boolean>()
    r.set(id, ok)
    m.set(k, r)
    for (const key of m.keys()) if (key < k - 6) m.delete(key)
  }, [])

  // ── 실시간 채널 ──
  useEffect(() => {
    if (!today || !myId) return
    const supabase = createClient()
    const channel = supabase.channel(`playground-${today}`, { config: { presence: { key: myId }, broadcast: { self: false } } })
    channelRef.current = channel
    const patch = (id: string, p: Partial<Spot>) => setSpots(prev => new Map(prev).set(id, { ...(prev.get(id) ?? blank(id)), ...p }))
    channel
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        const p = payload as { id: string; x: number; z: number; jy: number; side: Side; f: 1 | -1; tb: boolean }
        patch(p.id, { x: p.x, z: p.z, jy: p.jy, side: p.side, facing: p.f, tumbling: p.tb })
      })
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        const p = payload as { id: string; message: string | null }
        patch(p.id, { message: p.message })
      })
      .on('broadcast', { event: 'swing' }, ({ payload }) => bumpFx((payload as { id: string }).id, 'swing'))
      .on('broadcast', { event: 'hit' }, ({ payload }) => {
        const p = payload as { from: string; to: string; f: 1 | -1 }
        bumpFx(p.to, 'hit')
        const cur = meRef.current
        if (p.to === myId && cur && !onMountain(cur.x)) {
          setMe({ ...cur, x: clampFlat(cur.x + p.f * KNOCKBACK, cur.side) }, { broadcast: true, save: true })
          toast(`💥 ${nickOf(p.from)}한테 맞았다!`)
        }
      })
      .on('broadcast', { event: 'grab' }, ({ payload }) => {
        const p = payload as { from: string; to: string }
        bumpFx(p.to, 'hit')
        const cur = meRef.current
        if (p.to === myId && cur && onClimbSide(cur.x)) startTumble('✋', p.from)
      })
      .on('broadcast', { event: 'bomb' }, ({ payload }) => {
        const p = payload as { id: string; from: string; start: number }
        setBombs(b => [...b.filter(x => x.start > p.start - 8000), bombObstacle(p.id, p.start)])
        toast(`💣 ${nickOf(p.from)}이(가) 업무 폭탄을 굴렸다!`)
      })
      .on('broadcast', { event: 'fall' }, ({ payload }) => {
        const p = payload as { id: string; falls: number; label: string; by: string | null }
        patch(p.id, { falls: p.falls })
        toast(`🪨 ${nickOf(p.id)} 굴러떨어짐 ${p.by ? `(${nickOf(p.by)}한테 붙잡힘)` : p.label}${!UNLIMITED && p.falls >= fallLimit(modeRef.current) ? ' — 야근 확정' : ''}`)
      })
      .on('broadcast', { event: 'arrow' }, ({ payload }) => addArrow(payload as Arrow))
      .on('broadcast', { event: 'duel' }, ({ payload }) => duelMsgRef.current(payload as LobbyMsg | DuelMsg))
      .on('broadcast', { event: 'rope' }, ({ payload }) => {
        const p = payload as { k: number; id: string; ok: boolean }
        recordRope(p.k, p.id, p.ok)
      })
      .on('broadcast', { event: 'result' }, ({ payload }) => {
        const p = payload as { id: string; result: 'win' | 'back' }
        patch(p.id, { side: p.result === 'win' ? 'off' : 'night' })
        toast(p.result === 'win' ? `🎉 ${nickOf(p.id)} ${MODES[modeRef.current].goal} 칼퇴!` : `🌙 ${nickOf(p.id)} 스스로 야근하러 돌아감…`)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() }) })
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [today, myId, bumpFx, setMe, toast, nickOf, blank, startTumble, addArrow, recordRope])

  // ── 키 입력 ──
  const keysRef = useRef(new Set<string>())
  const lastSwingRef = useRef(0)
  const lastBombRef = useRef(0)

  const swing = useCallback(() => {
    const cur = meRef.current
    if (!cur || !myId) return
    const t = Date.now()
    if (t - lastSwingRef.current < SWING_COOLDOWN_MS) return
    lastSwingRef.current = t
    bumpFx(myId, 'swing')
    send('swing', { id: myId })
    const others = members.filter(m => m.id !== myId).map(m => {
      const s = spotsRef.current.get(m.id) ?? blank(m.id)
      return { id: m.id, x: s.x, z: s.z, side: s.side }
    }).filter(o => o.side === cur.side)
    for (const id of swingTargets(cur, cur.facing, others)) {
      bumpFx(id, 'hit')
      send('hit', { from: myId, to: id, f: cur.facing })
      // 상대가 접속 중이 아니면 내가 대신 밀어서 저장한다
      if (!onlineRef.current.has(id)) {
        const base = spotsRef.current.get(id) ?? blank(id)
        const knocked: Spot = { ...base, x: clampFlat(base.x + cur.facing * KNOCKBACK, base.side) }
        setSpots(prev => new Map(prev).set(id, knocked))
        send('move', { id, x: knocked.x, z: knocked.z, jy: 0, side: knocked.side, f: knocked.facing, tb: false })
        void saveRow(id, knocked)
      }
    }
  }, [myId, members, bumpFx, send, saveRow, blank])

  const throwBomb = useCallback(() => {
    if (!myId || modeRef.current !== 'landslide') return // 업무 폭탄은 퇴근산(산사태)에서만
    const start = Date.now() + offsetRef.current
    if (start - lastBombRef.current < BOMB_COOLDOWN_MS) return
    lastBombRef.current = start
    setLastBomb(start)
    const id = `${myId.slice(0, 6)}-${start}`
    setBombs(b => [...b.filter(x => x.start > start - 8000), bombObstacle(id, start)])
    send('bomb', { id, from: myId, start })
    toast('💣 업무 폭탄 투척!')
  }, [myId, send, toast])

  // 정상을 넘는 순간 칼퇴 / 집 쪽에서 정상을 넘어 돌아오면 다시 야근 — 걷기·리듬 계단 공용
  const applyCross = useCallback((cur: Spot, nx: number): Spot => {
    if (!myId) return { ...cur, x: nx }
    if (cur.side === 'night' && cur.x < PEAK_X && nx >= PEAK_X) {
      vyRef.current = 0
      send('result', { id: myId, result: 'win' })
      toast('🎉 칼퇴 성공!')
      return { ...cur, x: nx, side: 'off', jy: 0 }
    }
    if (cur.side === 'off' && cur.x >= PEAK_X && nx < PEAK_X) {
      send('result', { id: myId, result: 'back' })
      toast('🌙 다시 야근하러 간다…')
      return { ...cur, x: nx, side: 'night' }
    }
    return { ...cur, x: nx }
  }, [myId, send, toast])

  // 목: 양궁 — 1번째 Space = 흔들리는 각도 고정, 2번째 = 차오르내리는 힘 고정 → 발사. 화살이 과녁에 닿을 때 점수
  const archPress = useCallback(() => {
    const cur = meRef.current
    if (!cur || !myId || !today) return
    if (!UNLIMITED && cur.falls >= fallLimit(modeRef.current)) { toast('🌙 오늘은 기회를 다 썼어요 — 야근 확정'); return }
    const now = Date.now() + offsetRef.current
    const a = archRef.current
    if (a.phase === 'wait') return
    if (a.phase === 'angle') { setAim({ phase: 'power', since: now, angle: angleAt(now - a.since) }); return }
    const power = powerAt(now - a.since)
    const wind = windAt(today, now)
    const res = arrowScore(ARCH_LINE + 10, a.angle, power, wind, now)
    const arrow: Arrow = { id: `${myId.slice(0, 6)}-${now}`, angle: a.angle, power, wind, firedAt: now, flight: res.flight }
    addArrow(arrow)
    send('arrow', arrow)
    setAim({ phase: 'wait', since: now, angle: a.angle })
    setTimeout(() => {
      setAim({ phase: 'angle', since: Date.now() + offsetRef.current, angle: 0 })
      const scores = [...archScoresRef.current, res.score]
      toast(res.score ? `🎯 ${res.score}점!` : '💨 빗나감')
      archScoresRef.current = scores.length < ARCH_SHOTS ? scores : []
      setArchScores(scores)
      if (scores.length < ARCH_SHOTS) return
      const total = scores.reduce((x, y) => x + y, 0)
      setTimeout(() => setArchScores(archScoresRef.current), 1800)
      const m = meRef.current
      if (!m) return
      if (total >= ARCH_PASS) {
        setMe({ ...m, side: 'off', x: MTN_R + 24 + Math.random() * 70, jy: 0 }, { broadcast: true, save: true })
        send('result', { id: myId, result: 'win' })
        toast(`🎉 ${total}점 — 칼퇴!`)
      } else {
        toast(`🎯 ${total}점 — ${ARCH_PASS}점을 못 넘었다`)
        startTumble('🎯')
      }
    }, res.flight * 1000 + 150)
  }, [myId, today, toast, setAim, addArrow, send, setMe, startTumble])

  // 컬링: Space = 차오르내리는 힘 고정 → 스톤 출발
  const curlPress = useCallback(() => {
    const cur = meRef.current
    if (!cur || !myId) return
    if (!UNLIMITED && cur.falls >= fallLimit(modeRef.current)) { toast('🌙 오늘은 기회를 다 썼어요 — 야근 확정'); return }
    const c = curlRef.current
    if (c.phase !== 'aim') return
    const power = curlPowerAt(Date.now() + offsetRef.current - c.since) // since는 서버 시각(화면 막대와 같은 기준)
    stoneRef.current = { x: STONE_X0, v: power * STONE_VMAX }
    setStone({ x: STONE_X0 })
    sweepTapsRef.current = []
    lastSweepKeyRef.current = null
    keysRef.current.clear()
    setCurl({ phase: 'slide', since: Date.now() })
  }, [myId, toast, setCurl])
  // 스톤이 멈췄을 때 — 점수 기록, 3투면 칼퇴/실패
  const curlStopped = useCallback((x: number) => {
    const score = curlScore(x)
    setCurl({ phase: 'wait', since: Date.now() })
    toast(score ? `🥌 ${score}점!` : '🥌 0점 — 하우스 밖')
    setTimeout(() => {
      setCurl({ phase: 'aim', since: Date.now() + offsetRef.current })
      const scores = [...curlScoresRef.current, score]
      curlScoresRef.current = scores.length < CURL_STONES ? scores : []
      setCurlScores(scores)
      if (scores.length < CURL_STONES) return
      const total = scores.reduce((a, b) => a + b, 0)
      setTimeout(() => { setCurlScores(curlScoresRef.current); setStone(null) }, 1800)
      const m = meRef.current
      if (!m || !myId) return
      if (total >= CURL_PASS) {
        setMe({ ...m, side: 'off', x: MTN_R + 24 + Math.random() * 70, jy: 0 }, { broadcast: true, save: true })
        send('result', { id: myId, result: 'win' })
        toast(`🎉 ${total}점 — 칼퇴!`)
      } else {
        toast(`🥌 ${total}점 — ${CURL_PASS}점을 못 넘었다`)
        startTumble('🥌')
      }
    }, 900)
  }, [myId, toast, setCurl, setMe, send, startTumble])

  // ⚔ 대결 — 로비 메시지(신청·수락·거절·취소·소식)와 경기 메시지(DuelArena로 넘김)
  const startDuel = useCallback((d: DuelSession) => {
    keysRef.current.clear()
    setLobbyOpen(false)
    setDuel(d)
  }, [])
  useEffect(() => {
    duelMsgRef.current = msg => {
      if (!myId) return
      if (msg.type === 'invite') {
        if (msg.to !== myId) return
        setInvites(list => [...list.filter(i => i.id !== msg.id), { id: msg.id, from: msg.from, game: msg.game }])
        toast(`⚔ ${nickOf(msg.from)}님이 ${DUEL_GAMES[msg.game].emoji} ${DUEL_GAMES[msg.game].name} 대결 신청!`)
      } else if (msg.type === 'cancel') {
        setInvites(list => list.filter(i => i.id !== msg.id))
      } else if (msg.type === 'accept' || msg.type === 'decline') {
        const pend = pendingRef.current
        if (!pend || pend.id !== msg.id) return
        setPendingInvite(null)
        if (msg.type === 'decline') { toast(`🙅 ${nickOf(pend.to)}님이 대결을 거절했어요`); return }
        startDuel({ id: pend.id, game: pend.game, role: 'host', vsCpu: false, mySide: 'L', oppId: pend.to })
      } else if (msg.type === 'news') {
        toast(msg.text)
      } else if (duelRef.current && msg.id === duelRef.current.id) {
        arenaListenerRef.current?.(msg)
      }
    }
  })
  const invite = useCallback((to: string) => {
    if (!myId || pendingRef.current) return
    const id = `${myId.slice(0, 6)}-${Date.now()}`
    setPendingInvite({ id, to, game: duelGame })
    send('duel', { type: 'invite', id, from: myId, to, game: duelGame })
    setTimeout(() => {
      if (pendingRef.current?.id !== id) return
      setPendingInvite(null)
      send('duel', { type: 'cancel', id, from: myId })
      toast('⌛ 상대가 응답하지 않았어요')
    }, 30000)
  }, [myId, duelGame, send, toast])
  const answer = useCallback((inv: { id: string; from: string; game: DuelGame }, ok: boolean) => {
    if (!myId) return
    setInvites(list => list.filter(i => i.id !== inv.id))
    send('duel', { type: ok ? 'accept' : 'decline', id: inv.id, from: myId })
    if (ok) startDuel({ id: inv.id, game: inv.game, role: 'guest', vsCpu: false, mySide: 'R', oppId: inv.from })
  }, [myId, send, startDuel])

  // 산 위 다른 사람들(붙잡기 후보) — 연습봇 포함
  const climbers = useCallback(() => {
    const list: { id: string; x: number; jy: number; tumbling: boolean }[] = []
    for (const [id, sp] of spotsRef.current) if (id !== myId && sp.side === 'night') list.push({ id, x: sp.x, jy: sp.jy, tumbling: sp.tumbling })
    const b = botRef.current
    if (b) list.push({ id: BOT_ID, x: b.x, jy: b.jy, tumbling: !!b.tumble })
    return list
  }, [myId])

  const grab = useCallback((id: string) => {
    if (!myId) return
    bumpFx(id, 'hit')
    toast(`✋ ${nickOf(id)} 붙잡아 끌어내렸다!`)
    const b = botRef.current
    if (id === BOT_ID && b) { b.tumble = { start: performance.now(), fromX: b.x }; b.vy = 0; return }
    send('grab', { from: myId, to: id })
  }, [myId, bumpFx, toast, nickOf, send])

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (isTyping(e.target) || duelRef.current) return // 대결 중엔 DuelArena가 키를 쓴다
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        // 컬링 스톤이 미끄러지는 동안엔 걷지 않고 스위핑 — 직전과 다른 키를 누를 때만 1회
        if (modeRef.current === 'curling' && curlRef.current.phase === 'slide') {
          if (!e.repeat && lastSweepKeyRef.current !== e.key) { sweepTapsRef.current.push(performance.now()); lastSweepKeyRef.current = e.key }
          return
        }
        keysRef.current.add(e.key)
        return
      }
      if (e.code !== 'Space' && e.key !== ' ') return
      e.preventDefault()
      if (e.repeat) return
      const cur = meRef.current
      if (!cur || cur.tumbling) return
      const md = modeRef.current
      if (md === 'archery' && cur.side === 'night' && atArchLine(cur.x)) {
        archPress()
      } else if (md === 'curling' && cur.side === 'night' && atHack(cur.x)) {
        curlPress()
      } else if (onClimbSide(cur.x)) {
        // 바로 앞에 붙잡을 사람이 있으면 점프 대신 붙잡기(그 순간 장애물이 오면 나도 위험) — 산·복도·눈길에서만
        const target = cur.side === 'night' && (md === 'landslide' || md === 'patrol') ? grabTarget(cur, climbers()) : null
        if (target) grab(target)
        else if (cur.jy === 0) vyRef.current = JUMP_V // 땅에 닿아 있을 때만(공중 점프·선입력 없음)
      } else if (cur.side === 'off' && onHomeSlope(cur.x)) {
        throwBomb()
      } else if (!onMountain(cur.x)) {
        swing()
      }
    }
    function up(e: KeyboardEvent) { keysRef.current.delete(e.key) }
    const clear = () => keysRef.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [swing, throwBomb, climbers, grab, archPress, curlPress])

  // 연습봇(탄막): 주차장 가운데쯤에서 낮은 탄은 (조금 틀리게) 뛰어넘고, 떨어지는 그림자는 옆으로 피한다. 20초 버티면 처음으로
  const botDodge = useCallback((b: Bot, t: number, dt: number, day: string, serverNow: number) => {
    if (t < b.restUntil) return
    const shots = liveShots(day, serverNow)
    let target = ARENA_L + 140
    const shadow = dropShadows(day, serverNow).find(d => Math.abs(d.x - b.x) < 30)
    if (shadow) target = shadow.x > b.x ? b.x - 60 : b.x + 60
    target = Math.max(ARENA_L + 10, Math.min(ARENA_R - 10, target))
    if (Math.abs(target - b.x) > 1) b.x += Math.sign(target - b.x) * Math.min(Math.abs(target - b.x), WALK_SPEED * (shadow ? 1 : 0.6) * dt)
    if (b.jy === 0 && b.vy === 0) {
      const low = shots.find(s => s.kind === 'low' && s.x > b.x && (s.x - b.x) / SHOT_SPEED < 0.12 + b.err)
      const high = shots.some(s => s.kind === 'high' && s.x > b.x && (s.x - b.x) / SHOT_SPEED < 0.7)
      if (low && !high) { b.vy = JUMP_V; b.err = (Math.random() - 0.5) * 0.12 }
    }
    if (b.vy !== 0 || b.jy > 0) {
      b.jy += b.vy * dt
      b.vy -= GRAVITY * dt
      if (b.jy <= 0) { b.jy = 0; b.vy = 0 }
    }
    if (!inArena(b.x)) { b.dodgeStart = -1; return }
    if (b.dodgeStart < 0) b.dodgeStart = serverNow
    if (shotHit(b.x, b.jy, shots)) { b.tumble = { start: t, fromX: b.x }; b.vy = 0; b.dodgeStart = -1; return }
    if (serverNow - b.dodgeStart >= DODGE_SURVIVE_MS) { b.x = FOOT_X; b.jy = 0; b.vy = 0; b.dodgeStart = -1; b.restUntil = t + 2000 }
  }, [])

  // 연습봇(줄넘기): 줄 안 가운데에 서서 박자에 맞춰(±60ms 오차) 뛴다 — 판정 결과는 내 화면에만 더한다
  const botRope = useCallback((b: Bot, _t: number, dt: number, serverNow: number) => {
    const target = (ROPE_L + ROPE_R) / 2 - 30
    if (Math.abs(target - b.x) > 1 && b.jy === 0) b.x += Math.sign(target - b.x) * Math.min(Math.abs(target - b.x), WALK_SPEED * 0.6 * dt)
    if (inRope(b.x)) {
      const { k, off } = ropeBeat(serverNow)
      const nextK = off < 0 ? k : k + 1
      const untilBottom = nextK * ROPE_PERIOD_MS - serverNow
      if (b.jy === 0 && b.vy === 0 && b.rJumped !== nextK && untilBottom <= (JUMP_V / GRAVITY) * 1000 + b.err * 1000) {
        b.vy = JUMP_V
        b.rJumped = nextK
        b.err = (Math.random() - 0.5) * 0.12
      }
      if (Math.abs(off) <= ROPE_HALF_MS) {
        if (b.rtK !== k) { b.rtK = k; b.rtMin = b.jy } else b.rtMin = Math.min(b.rtMin, b.jy)
      } else if (off > ROPE_HALF_MS && b.rtK === k && b.rJudged !== k) {
        b.rJudged = k
        recordRope(k, BOT_ID, b.rtMin > ROPE_CLEAR)
      }
    }
    if (b.vy !== 0 || b.jy > 0) {
      b.jy += b.vy * dt
      b.vy -= GRAVITY * dt
      if (b.jy <= 0) { b.jy = 0; b.vy = 0 }
    }
  }, [recordRope])

  // ── 메인 루프: 이동·점프·충돌·굴러떨어짐 + 보내기/저장 ──
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastSave = 0
    let blockedToastAt = 0
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const serverNow = Date.now() + offsetRef.current
      setClock(serverNow)
      const md = modeRef.current
      const cur = meRef.current
      if (cur && myId && today) {
        let next: Spot | null = null
        const tb = tumbleRef.current
        if (tb) {
          // 기슭까지 데굴데굴
          const p = Math.min(1, (t - tb.start) / TUMBLE_MS)
          const x = tb.fromX + (FOOT_X - tb.fromX) * p
          const jy = Math.max(0, tb.fromJy * (1 - p) + Math.sin(p * Math.PI) * 26)
          next = { ...cur, x, jy: p >= 1 ? 0 : jy, z: 0, side: 'night', tumbling: p < 1 }
          if (p >= 1) tumbleRef.current = null
        } else {
          const k = keysRef.current
          // 대결 중·컬링 스톤이 미끄러지는 중엔 걷지 않는다
          const dx = duelRef.current || (md === 'curling' && curlRef.current.phase === 'slide') ? 0 : (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)
          let { x, z, jy, side, facing } = cur
          if (dx) {
            facing = dx > 0 ? 1 : -1
            // 도전 구간 걷는 속도: 산·눈길 = 천천히 오르기 / 복도 = 살금살금 / 주차장·트랙·광장 = 평소대로
            const flat = md !== 'landslide'
            const courseSpeed = md === 'landslide' || md === 'patrol' ? CLIMB_SPEED : WALK_SPEED
            let speed = WALK_SPEED
            if (onClimbSide(x) || (dx > 0 && x >= MTN_L - 1 && x < PEAK_X)) speed = dx > 0 || flat ? courseSpeed : DESCEND_SPEED
            else if (onHomeSlope(x)) speed = flat ? WALK_SPEED : dx < 0 ? CLIMB_SPEED * 1.8 : DESCEND_SPEED
            let nx = x + dx * speed * dt
            // 사무실 쪽에서 도전 구간에 들어서려는데 오늘 기회를 다 썼으면 막는다(줄넘기는 기회 차감 없음)
            if (!UNLIMITED && md !== 'rope' && side === 'night' && cur.falls >= fallLimit(md) && nx > MTN_L - 2) {
              nx = MTN_L - 2
              if (t - blockedToastAt > 3000) { blockedToastAt = t; toast('🌙 오늘은 기회를 다 썼어요 — 야근 확정') }
            }
            nx = Math.max(EDGE, Math.min(W - EDGE, nx))
            // 탄막·양궁·줄넘기 날엔 걸어서 결승선을 넘을 수 없고(버티기·과녁·줄넘기로만), 칼퇴한 쪽에서 되돌아올 수도 없다
            if (md === 'dodge' || md === 'archery' || md === 'rope' || md === 'curling') {
              if (side === 'night') nx = Math.min(nx, md === 'dodge' ? ARENA_R : md === 'archery' ? ARCH_LINE + ARCH_BOX : md === 'curling' ? HACK_X + HACK_BOX : PEAK_X - 24)
              else nx = Math.max(nx, MTN_R + 4)
            }
            const crossed = applyCross({ ...cur, x, jy, side }, nx)
            x = crossed.x
            side = crossed.side
            jy = crossed.jy
          }
          if (onMountain(x)) z = Math.max(0, z - DEPTH_SPEED * 2 * dt)
          // 점프(도전 구간에서만 vy가 생긴다)
          if (vyRef.current !== 0 || jy > 0) {
            jy += vyRef.current * dt
            vyRef.current -= GRAVITY * dt
            if (jy <= 0) { jy = 0; vyRef.current = 0 }
          }
          if (!onMountain(x) && jy > 0) { jy = 0; vyRef.current = 0 }
          next = { ...cur, x, z, jy, side, facing }
          const moved = next.x !== cur.x || next.z !== cur.z || next.jy !== cur.jy || next.side !== cur.side || next.facing !== cur.facing
          // 충돌·걸림은 가만히 서 있어도 매 프레임 본다
          if (side === 'night' && onClimbSide(x)) {
            const hit = hitBy(x, jy, liveObstacles(today, serverNow, bombsRef.current, md))
            const caught = md === 'patrol' && (x !== cur.x || jy > 0) && bossCatching(today, serverNow)
            const shot = md === 'dodge' ? shotHit(x, jy, liveShots(today, serverNow)) : null
            const label = hit ? hit.label : caught ? '👀' : shot ? shot.label : null
            if (label) {
              meRef.current = next
              startTumble(label)
              raf = requestAnimationFrame(loop)
              return
            }
          }
          if (!moved) next = null
        }
        if (next) {
          const now = Date.now()
          const important = next.tumbling !== cur.tumbling || next.side !== cur.side
          setMe(next, { broadcast: important || now - lastSentRef.current >= BROADCAST_MS, save: important && !next.tumbling })
        }
        // 수: 주차장 안에서 버틴 시간 — 20초면 칼퇴, 밖으로 나가거나 맞으면 0부터
        const md2 = meRef.current
        if (md === 'dodge' && md2) {
          if (md2.side === 'night' && !md2.tumbling && inArena(md2.x)) {
            if (dodgeStartRef.current === null) dodgeStartRef.current = serverNow
            const survived = serverNow - dodgeStartRef.current
            if (survived >= DODGE_SURVIVE_MS) {
              dodgeStartRef.current = null
              setDodgeSurvived(null)
              vyRef.current = 0
              setMe({ ...md2, side: 'off', x: MTN_R + 24 + Math.random() * 70, jy: 0 }, { broadcast: true, save: true })
              send('result', { id: myId, result: 'win' })
              toast('🎉 20초 버티기 성공 — 칼퇴!')
            } else setDodgeSurvived(survived)
          } else if (dodgeStartRef.current !== null) {
            dodgeStartRef.current = null
            setDodgeSurvived(null)
          }
        }
        // 금: 줄이 바닥에 닿는 순간 앞뒤로 줄 안에 있었으면 그동안 가장 낮았던 높이로 통과 판정
        const mr = meRef.current
        if (md === 'rope' && mr && mr.side === 'night' && !mr.tumbling && inRope(mr.x)) {
          const { k: rk, off } = ropeBeat(serverNow)
          const tr = ropeTrackRef.current
          if (Math.abs(off) <= ROPE_HALF_MS) {
            if (tr.k !== rk) ropeTrackRef.current = { k: rk, min: mr.jy }
            else tr.min = Math.min(tr.min, mr.jy)
          } else if (off > ROPE_HALF_MS && tr.k === rk && ropeJudgedRef.current !== rk) {
            ropeJudgedRef.current = rk
            const ok = tr.min > ROPE_CLEAR
            recordRope(rk, myId, ok)
            send('rope', { k: rk, id: myId, ok })
            if (!ok) { bumpFx(myId, 'hit'); toast('🪢 걸렸다! 처음부터') }
          }
        }
        // 멈췄으면 마지막 위치를 한 번 더 보내고, 바뀐 게 있으면 주기적으로 저장
        const me2 = meRef.current
        const now = Date.now()
        if (me2 && dirtyRef.current && !next && now - lastSave >= SAVE_MS) {
          lastSave = now
          dirtyRef.current = false
          sendMove(me2)
          void saveRow(myId, me2)
        }
      }
      const b = botRef.current
      if (b && today) {
        if (md === 'dodge' && !b.tumble) botDodge(b, t, dt, today, serverNow)
        else if (md === 'rope' && !b.tumble) botRope(b, t, dt, serverNow)
        else if (md !== 'archery' && md !== 'curling') stepBot(b, t, dt, liveObstacles(today, serverNow, bombsRef.current, md), { mode: md, day: today, serverNow })
        // 연습봇이 내 바로 뒤에 붙으면 반반 확률로 나를 붙잡는다(2.5초에 한 번만 시도)
        const m = meRef.current
        if (m && myId && (md === 'landslide' || md === 'patrol') && !tumbleRef.current && m.side === 'night' && !b.tumble && t >= b.grabReadyAt && grabTarget(b, [{ id: myId, x: m.x, jy: m.jy, tumbling: false }])) {
          b.grabReadyAt = t + 2500
          if (Math.random() < 0.5) { bumpFx(myId, 'hit'); startTumble('✋', BOT_ID) }
        }
        setBotSpot({ x: b.x, z: 0, jy: b.jy, side: 'night', facing: 1, message: b.tumble ? '으악' : null, falls: 0, tumbling: !!b.tumble })
      }
      // 컬링: 스톤 미끄러짐(스위핑 = 최근 SWEEP_WINDOW_MS 안에 번갈아 2번 이상)
      const st = stoneRef.current
      if (md === 'curling' && st && curlRef.current.phase === 'slide') {
        const recent = sweepTapsRef.current.filter(x => t - x <= SWEEP_WINDOW_MS)
        sweepTapsRef.current = recent
        const sw = recent.length >= 2
        setSweeping(sw)
        const nst = stoneStep(st, sw, dt)
        stoneRef.current = nst
        setStone({ x: nst.x })
        if (nst.v <= 0) { setSweeping(false); curlStopped(nst.x) }
      }
      // 금: 박자마다(결과가 모이도록 300ms 기다린 뒤) 연속 횟수 갱신 — 목표를 채우면 그 박자를 통과한 참여자 전원 칼퇴
      if (md === 'rope' && today) {
        const e = Math.floor((serverNow - ROPE_HALF_MS - 300) / ROPE_PERIOD_MS)
        if (e > ropeEvalRef.current) {
          let streak = ropeStreakRef.current
          for (let q = Math.max(ropeEvalRef.current + 1, e - 2); q <= e; q++) {
            const res = ropeResultsRef.current.get(q)
            if (!res || res.size === 0 || [...res.values()].some(v => !v)) { streak = 0; continue }
            streak++
            if (streak < ropeNeed(res.size)) continue
            streak = 0
            celebrate()
            const m = meRef.current
            if (myId && m && m.side === 'night' && res.get(myId)) {
              vyRef.current = 0
              setMe({ ...m, side: 'off', x: MTN_R + 24 + Math.random() * 90, jy: 0 }, { broadcast: true, save: true })
              send('result', { id: myId, result: 'win' })
              toast('🎉 단체 줄넘기 성공 — 다 같이 칼퇴!')
            }
            if (b && res.get(BOT_ID)) { b.x = FOOT_X; b.jy = 0; b.vy = 0 }
          }
          ropeEvalRef.current = e
          if (streak !== ropeStreakRef.current) { ropeStreakRef.current = streak; setRopeStreak(streak) }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [myId, today, setMe, send, sendMove, saveRow, startTumble, toast, bumpFx, applyCross, celebrate, recordRope, botDodge, botRope, curlStopped])

  // 닫을 때 마지막 자리 저장
  useEffect(() => () => {
    const cur = meRef.current
    if (cur && myId && dirtyRef.current) void saveRow(myId, cur)
  }, [myId, saveRow])

  // ── 한 마디 ──
  function saveMessage() {
    const cur = meRef.current
    if (!cur || !myId) return
    const message = draftMsg.trim().slice(0, MESSAGE_MAX) || null
    if (message === cur.message) return
    setMe({ ...cur, message }, { save: true })
    send('msg', { id: myId, message })
  }

  // ── 그리기용 ──
  const people = members.map((m, i) => {
    const s = m.id === myId && meSpot ? meSpot : spots.get(m.id) ?? { ...spawnOf(i), jy: 0, side: 'night' as Side, facing: 1 as const, message: null, falls: 0, tumbling: false }
    return { m, s }
  })
  const renderClimbers = [
    ...people.filter(p => p.m.id !== myId && p.s.side === 'night').map(p => ({ id: p.m.id, x: p.s.x, jy: p.s.jy, tumbling: p.s.tumbling })),
    ...(botSpot ? [{ id: BOT_ID, x: botSpot.x, jy: botSpot.jy, tumbling: botSpot.tumbling }] : []),
  ]
  const nightCount = people.filter(p => p.s.side === 'night').length
  const offCount = people.length - nightCount
  const obstacles = today ? liveObstacles(today, clock, bombs, mode) : []
  const look: BossLook = mode === 'patrol' && today ? bossLook(today, clock) : 'away'
  const myFallLimit = fallLimit(mode)
  const myFallsLeft = UNLIMITED ? myFallLimit : meSpot ? Math.max(0, myFallLimit - meSpot.falls) : myFallLimit
  const bombLeft = Math.max(0, Math.ceil((lastBomb + BOMB_COOLDOWN_MS - clock) / 1000))
  // 수: 탄막 / 목: 양궁 화면 상태
  const dodgeView: DodgeView | null = mode === 'dodge' && today ? { shots: liveShots(today, clock), survived: dodgeSurvived } : null
  const atLineNow = !!meSpot && meSpot.side === 'night' && !meSpot.tumbling && atArchLine(meSpot.x)
  const archeryView: ArcheryView | null = mode === 'archery' && today ? {
    wind: windAt(today, clock), targetH: targetH(clock), atLine: atLineNow, scores: archScores,
    aim: atLineNow && archAim.phase !== 'wait' ? {
      phase: archAim.phase, angle: archAim.phase === 'angle' ? angleAt(clock - archAim.since) : archAim.angle,
      power: archAim.phase === 'power' ? powerAt(clock - archAim.since) : 0,
    } : null,
    arrows: arrows.filter(a => clock - a.firedAt <= a.flight * 1000 + 700).map(a => {
      const sec = Math.max(0, Math.min(a.flight, (clock - a.firedAt) / 1000))
      const p = arrowPos(ARCH_LINE + 10, a.angle, a.power, a.wind, sec)
      const v = a.power * ARROW_VMAX
      return { id: a.id, x: p.x, h: Math.max(0, p.h), rot: (-Math.atan2(v * Math.sin(a.angle) - ARROW_G * sec, v * Math.cos(a.angle) + a.wind * 60 * sec) * 180) / Math.PI }
    }),
  } : null
  const atHackNow = !!meSpot && meSpot.side === 'night' && !meSpot.tumbling && atHack(meSpot.x)
  const curlingView: CurlingView | null = mode === 'curling' ? {
    stone, sweeping, scores: curlScores, power: atHackNow && curl.phase === 'aim' ? curlPowerAt(clock - curl.since) : null,
  } : null
  const lookOf = (id: string) => id === BOT_ID
    ? { name: '🤖 CPU', equip: BOT_EQUIP, palette: DOODLE_PALETTE[5] }
    : { name: displayName(memberMap.get(id)) || '?', equip: equips.get(id) ?? NO_EQUIP, palette: DOODLE_PALETTE[(memberMap.get(id)?.color_key ?? 0) % 8] }
  const duelOpponents = members.filter(m => m.id !== myId && online.has(m.id))
  // 금: 줄넘기 화면 상태
  const ropeInside = mode === 'rope' ? people.filter(p => p.s.side === 'night' && inRope(p.s.x)).length + (botSpot && inRope(botSpot.x) ? 1 : 0) : 0
  const ropeView: RopeView | null = mode === 'rope' ? { angle: ropeAngle(clock), streak: ropeStreak, need: ropeNeed(Math.max(1, ropeInside)), inside: ropeInside } : null
  let hint: string | null = null
  if (meSpot && !meSpot.tumbling) {
    const night = meSpot.side === 'night'
    if (night && mode === 'curling' && (atHack(meSpot.x) || curl.phase !== 'aim')) {
      hint = curl.phase === 'aim' ? 'Space: 힘 고정 → 투구' : curl.phase === 'slide' ? (sweeping ? '🧹 스위핑 중!' : '←→ 번갈아 연타 = 스위핑') : '🥌 …'
    } else if (night && mode === 'archery' && atArchLine(meSpot.x)) {
      hint = archAim.phase === 'angle' ? 'Space: 각도 고정' : archAim.phase === 'power' ? 'Space: 힘 고정 → 발사!' : '🏹 …'
    } else if (night && !onMountain(meSpot.x) && meSpot.x > MTN_L - 40) {
      hint = myFallsLeft <= 0 && mode !== 'rope' ? '오늘은 야근 확정 🌙'
        : UNLIMITED || mode === 'rope' ? MODES[mode].go : `${MODES[mode].go} (기회 ${myFallsLeft})`
    } else if (night && mode === 'dodge' && inArena(meSpot.x)) {
      hint = 'Space 점프 · ←→ 피하기'
    } else if (night && mode === 'rope') {
      hint = inRope(meSpot.x) ? 'Space — 줄이 바닥에 닿을 때 떠 있기' : '→ 줄 안으로'
    } else if (night && onClimbSide(meSpot.x)) {
      if (mode === 'patrol' && look !== 'away') hint = look === 'look' ? '👀 멈춰!!' : '⚠ 돌아본다!'
      else hint = grabTarget(meSpot, renderClimbers) ? '✋ Space 붙잡기!' : 'Space 점프!'
    } else if (mode === 'landslide' && meSpot.side === 'off' && onHomeSlope(meSpot.x)) hint = bombLeft > 0 ? `💣 ${bombLeft}초 뒤 다시` : 'Space: 💣 업무 폭탄'
    else if (mode === 'landslide' && meSpot.side === 'off' && meSpot.x < MTN_R + 40) hint = '← 비탈에서 💣 던지기'
  }

  return (
    <>
    {/* 휴대폰·태블릿이면 화면 아래 ◀ ▶ A 버튼(키보드 대신) */}
    <TouchPad />
    <div className="fixed z-[60] select-none rounded-2xl border border-white/70 bg-white/95 shadow-[0_8px_30px_rgba(16,24,40,0.22)]"
      // 자기 레이어로 띄운다(배경 흐림 없음) — 게임 화면이 매 프레임 바뀔 때 아래 페이지(흐림 필터 등)까지 다시 칠하지 않게(야구 위젯과 같은 처리, 2026-10-24)
      style={{ left: wpos.x, top: wpos.y, width: WIDGET_W, zoom, willChange: 'transform' }}>
      <style>{KEYFRAMES + STAGE_KEYFRAMES}</style>
      <div className="flex cursor-move touch-none items-center justify-between gap-2 px-3 pb-1.5 pt-2"
        onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
        <p className="text-[13px] font-bold text-[#1F2933]">
          <GamepadIcon size={15} className="mr-1 inline-block -mt-0.5 align-middle text-[#4C7FE0]" />오늘의 운동장
          <span className="ml-2 text-[11px] font-normal text-[#7A8491]">🚶 오늘의 퇴근길: {MODES[mode].place} · {MODES[mode].emoji} {MODES[mode].name} · {online.size}명 접속 중</span>
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setLobbyOpen(v => !v)} disabled={!myId || !!duel}
            className={`rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${lobbyOpen ? 'border-[#4C7FE0] bg-[#E8EFFC] text-[#2C5BB8]' : 'border-[#E5E8EB] bg-white text-[#3A4249] hover:bg-[#F3F4F6]'} disabled:opacity-40`}>
            ⚔ 대결
          </button>
          {UNLIMITED && (
            <select value={mode} title="로컬 테스트용 — 내 화면에서만 방식을 바꿔 봐요"
              onChange={e => { setModeOverride(e.target.value as Mode); e.currentTarget.blur() }}
              className="rounded-md border border-[#E5E8EB] bg-white px-1.5 py-0.5 text-[11px] text-[#3A4249]">
              {MODE_ORDER.map(m => <option key={m} value={m}>🧪 {MODES[m].emoji} {MODES[m].name}</option>)}
            </select>
          )}
          <span className="text-[11px] text-[#5B6472]" title="오늘 굴러떨어질 수 있는 남은 횟수">
            기회 {UNLIMITED ? '∞ (테스트)' : Array.from({ length: myFallLimit }, (_, i) => (i < myFallsLeft ? '●' : '○')).join('')}
          </span>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClose} aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-[14px] text-[#7A8491] hover:bg-[#F3F4F6]">✕</button>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="relative overflow-hidden rounded-xl border border-[#D9CBB0]" style={{ width: W, height: H }}>
          <StageArt mode={mode} />
          <ModeLayer mode={mode} look={look} curling={curlingView} dodge={dodgeView} archery={archeryView} rope={ropeView} />
          {fireworks > 0 && (
            <div className="pointer-events-none absolute inset-0 z-40">
              {[[W - 230, 60, 0], [W - 140, 34, 180], [W - 70, 90, 360], [PEAK_X + 120, 54, 520], [W - 300, 110, 260], [PEAK_X + 220, 30, 700]].map(([x, y, d], i) => (
                <span key={i} className="absolute text-[30px]" style={{ left: x, top: y, animation: `pg-firework 900ms ease-out ${d}ms infinite` }}>{i % 3 === 0 ? '🎆' : i % 3 === 1 ? '🎇' : '✨'}</span>
              ))}
              <div className="absolute inset-x-0 top-14 text-center text-[18px] font-black text-[#FFF7ED] drop-shadow">🎉 불금 칼퇴 축하합니다 🎉</div>
            </div>
          )}
          <ZoneTag className="left-2 top-2" text={`🌙 야근 ${nightCount}명`} dark />
          <ZoneTag className="right-2 top-2" text={`☀️ 칼퇴 ${offCount}명`} />

          {obstacles.map(o => {
            const size = Math.min(o.top - o.bottom, o.w) * 0.85
            const rolled = o.kind === 'ping' ? 0 : ((PEAK_X - o.x) / (o.w / 2)) * (180 / Math.PI)
            return (
              <div key={o.id} className="pointer-events-none absolute z-20 flex items-center justify-center rounded-md border"
                style={{
                  left: o.x - o.w / 2, top: surfaceY(o.x, mode) - o.top, width: o.w, height: o.top - o.bottom,
                  background: o.kind === 'ping' ? 'rgba(254,226,226,0.95)' : o.kind === 'bomb' ? 'rgba(254,215,170,0.95)' : 'rgba(255,247,237,0.95)',
                  borderColor: o.kind === 'ping' || o.kind === 'bomb' ? '#E11D48' : '#7C5A3A',
                }}>
                <span style={{ fontSize: size, lineHeight: 1, transform: `rotate(${-rolled}deg)` }}>{o.label}</span>
              </div>
            )
          })}

          {botSpot && (
            <Character mode={mode} spot={botSpot} isMe={false} online nickname="🤖 연습봇" equip={BOT_EQUIP} palette={DOODLE_PALETTE[5]}
              swinging={false} hurt={!!fx.get(BOT_ID)?.hit} hint={null} />
          )}
          {[...people].sort((a, b) => b.s.z - a.s.z).map(({ m, s }) => {
            const isMe = m.id === myId
            const f = fx.get(m.id)
            return (
              <Character key={m.id} mode={mode}
                spot={s} isMe={isMe} online={isMe || online.has(m.id)}
                nickname={displayName(m)}
                equip={equips.get(m.id) ?? NO_EQUIP}
                palette={DOODLE_PALETTE[m.color_key % 8]}
                swinging={!!f?.swing} hurt={!!f?.hit}
                hint={isMe ? hint : null}
              />
            )
          })}

          <div className="pointer-events-none absolute inset-x-0 top-9 z-40 flex flex-col items-center gap-1">
            {toasts.map(t => (
              <div key={t.id} className="rounded-full bg-[#1F2933]/85 px-3 py-1 text-[11.5px] font-semibold text-white shadow" style={{ animation: 'pg-toast 220ms ease-out' }}>{t.text}</div>
            ))}
          </div>
          {!loaded && <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 text-[12px] text-[#5B6472]">불러오는 중…</div>}
          {loaded && !myId && <div className="absolute inset-x-0 bottom-2 z-50 text-center text-[11.5px] text-white">로그인 계정과 팀원이 연결되지 않아 구경만 할 수 있어요</div>}

          {duel && myId && (
            <DuelArena key={duel.id} id={duel.id} game={duel.game} role={duel.role} vsCpu={duel.vsCpu} mySide={duel.mySide}
              looks={duel.mySide === 'L' ? { L: lookOf(myId), R: lookOf(duel.oppId) } : { L: lookOf(duel.oppId), R: lookOf(myId) }}
              send={msg => send('duel', msg)}
              listen={fn => { arenaListenerRef.current = fn }}
              onEnd={(winner, score) => {
                const names = duel.mySide === 'L' ? [lookOf(myId).name, lookOf(duel.oppId).name] : [lookOf(duel.oppId).name, lookOf(myId).name]
                const text = `⚔ ${DUEL_GAMES[duel.game].emoji} ${names[0]} ${score.L} : ${score.R} ${names[1]} — ${winner === 'L' ? names[0] : names[1]} 승!`
                toast(text)
                if (!duel.vsCpu && duel.role === 'host') send('duel', { type: 'news', id: duel.id, text })
              }}
              onClose={() => setDuel(null)}
            />
          )}

          {invites.length > 0 && !duel && (
            <div className="absolute left-1/2 top-12 z-50 flex -translate-x-1/2 flex-col gap-1">
              {invites.map(inv => (
                <div key={inv.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[12px] shadow-xl">
                  <span className="font-semibold text-[#1F2933]">⚔ {displayName(memberMap.get(inv.from))}님이 {DUEL_GAMES[inv.game].emoji} {DUEL_GAMES[inv.game].name} 대결 신청</span>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => answer(inv, true)} className="rounded-md bg-[#1F2933] px-2 py-0.5 text-[11.5px] font-bold text-white">수락</button>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => answer(inv, false)} className="rounded-md border border-[#E5E8EB] px-2 py-0.5 text-[11.5px] text-[#3A4249]">거절</button>
                </div>
              ))}
            </div>
          )}

          {lobbyOpen && !duel && myId && (
            <div className="absolute right-2 top-10 z-50 w-[270px] rounded-xl bg-white p-3 text-[12px] shadow-xl">
              <p className="mb-2 font-bold text-[#1F2933]">⚔ 1:1 대결</p>
              <div className="mb-2 flex gap-1">
                {(Object.keys(DUEL_GAMES) as DuelGame[]).map(g => (
                  <button key={g} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setDuelGame(g)}
                    className={`flex-1 rounded-md px-2 py-1 text-[11.5px] font-semibold ${duelGame === g ? 'bg-[#1F2933] text-white' : 'bg-[#F3F4F6] text-[#3A4249]'}`}>
                    {DUEL_GAMES[g].emoji} {DUEL_GAMES[g].name}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 text-[10.5px] text-[#7A8491]">{DUEL_GAMES[duelGame].help}</p>
              {pendingInvite ? (
                <div className="flex items-center justify-between rounded-md bg-[#FEF9C3] px-2 py-1.5">
                  <span>{displayName(memberMap.get(pendingInvite.to))}님 수락 기다리는 중…</span>
                  <button type="button" onMouseDown={e => e.preventDefault()} className="text-[11px] text-[#7A8491] underline"
                    onClick={() => { send('duel', { type: 'cancel', id: pendingInvite.id, from: myId }); setPendingInvite(null) }}>취소</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <button type="button" onMouseDown={e => e.preventDefault()}
                    onClick={() => startDuel({ id: `cpu-${Date.now()}`, game: duelGame, role: 'host', vsCpu: true, mySide: 'L', oppId: BOT_ID })}
                    className="rounded-md bg-[#F3F4F6] px-2 py-1.5 text-left font-semibold text-[#1F2933] hover:bg-[#E5E7EB]">🤖 CPU와 대결</button>
                  {duelOpponents.length === 0 && <p className="px-1 text-[10.5px] text-[#7A8491]">지금 운동장을 연 팀원이 없어요(상대도 운동장 창을 열고 있어야 신청이 가요)</p>}
                  {duelOpponents.map(m => (
                    <button key={m.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => invite(m.id)}
                      className="rounded-md bg-[#F3F4F6] px-2 py-1.5 text-left text-[#1F2933] hover:bg-[#E5E7EB]">⚔ {displayName(m)}에게 신청</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            value={draftMsg}
            onChange={e => setDraftMsg(e.target.value.slice(0, MESSAGE_MAX))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveMessage(); (e.target as HTMLInputElement).blur() } }}
            onBlur={saveMessage}
            disabled={!myId}
            placeholder="오늘의 한 마디 (Enter로 남기기, 내일 사라짐)"
            className="min-w-0 flex-1 rounded-full border border-[#E5E8EB] bg-white px-3 py-1.5 text-[12px] focus:border-[#4C7FE0] focus:outline-none"
          />
          <span className="whitespace-nowrap text-[10.5px] text-[#7A8491]">←→ 걷기 · 평지 Space 휘두르기 · 산에서 앞사람 바로 뒤 Space = 붙잡기</span>
        </div>
        <p className="mt-1.5 text-[11px] text-[#5B6472]"><b className="text-[#1F2933]">{MODES[mode].emoji} 오늘의 퇴근길 · {MODES[mode].name}</b> ({MODES[mode].place}) — {MODES[mode].help}</p>
        {dbMissing && <p className="mt-1 text-[10.5px] text-[#C2410C]">⚠ 저장 테이블(playground_state)이 아직 없어 자리·한 마디가 저장되지 않아요(실시간은 동작)</p>}
      </div>
    </div>
    </>
  )
}

// 연습봇 한 프레임 — 방식별로:
// 산사태·불금 = 오르며 다가오는 땅 장애물을 (약간 틀리게) 뛰어넘음 / 순찰 = 부장님이 돌아보면 멈춤(가끔 방심) /
// (탄막·줄넘기는 컴포넌트 안 botDodge·botRope, 양궁·컬링 날엔 쉼) 걸리면 굴러떨어지고, 정상에 닿으면 기슭으로 리셋.
function stepBot(b: Bot, t: number, dt: number, obstacles: ReturnType<typeof liveObstacles>, ctx: BotCtx) {
  if (b.tumble) {
    const p = Math.min(1, (t - b.tumble.start) / TUMBLE_MS)
    b.x = b.tumble.fromX + (FOOT_X - b.tumble.fromX) * p
    b.jy = p >= 1 ? 0 : Math.sin(p * Math.PI) * 26
    if (p >= 1) { b.tumble = null; b.restUntil = t + 1500 }
    return
  }
  if (t < b.restUntil) return
  const { mode, day, serverNow } = ctx
  const reset = () => { b.x = FOOT_X; b.jy = 0; b.vy = 0; b.restUntil = t + 2000 }
  let frozen = false
  if (mode === 'patrol') {
    const cyc = Math.floor(serverNow / PATROL_CYCLE_MS)
    if (cyc !== b.cyc) { b.cyc = cyc; b.careless = Math.random() < 0.15 }
    frozen = !b.careless && onClimbSide(b.x) && bossLook(day, serverNow) !== 'away'
  }
  if (!frozen) {
    if (b.jy === 0 && onClimbSide(b.x)) {
      const next = obstacles.filter(o => o.kind !== 'ping' && o.x > b.x).sort((a, c) => a.x - c.x)[0]
      if (next && (next.x - b.x) / (next.speed + BOT_SPEED) <= JUMP_V / GRAVITY + b.err) {
        b.vy = JUMP_V
        b.err = (Math.random() - 0.5) * 0.14 // 다음 점프 타이밍 오차(±70ms)
      }
    }
    b.x += BOT_SPEED * dt
  }
  if (b.vy !== 0 || b.jy > 0) {
    b.jy += b.vy * dt
    b.vy -= GRAVITY * dt
    if (b.jy <= 0) { b.jy = 0; b.vy = 0 }
  }
  if (b.x >= PEAK_X) { reset(); return }
  const caught = mode === 'patrol' && !frozen && onClimbSide(b.x) && bossCatching(day, serverNow)
  if (caught || hitBy(b.x, b.jy, obstacles)) { b.tumble = { start: t, fromX: b.x }; b.vy = 0 }
}

function Character(props: {
  mode: Mode
  spot: Spot; isMe: boolean; online: boolean; nickname: string; equip: Equip; palette: { bg: string; fg: string }
  swinging: boolean; hurt: boolean; hint: string | null
}) {
  const { spot, isMe } = props
  const setTeam = fullSetTeam(props.equip)
  const feet = surfaceY(spot.x, props.mode) - spot.z * 0.8 - spot.jy
  const anim = spot.tumbling ? 'pg-tumble 380ms linear infinite' : props.hurt ? 'pg-hit 520ms ease-out' : props.swinging ? 'pg-swing 260ms ease-out' : undefined
  return (
    <div className={`absolute ${isMe ? 'z-30' : 'z-[25] transition-[left,top] duration-75 ease-linear'}`}
      style={{ left: spot.x, top: feet, transform: 'translate(-50%, -100%)', opacity: props.online ? 1 : 0.55 }}>
      <div className="flex flex-col items-center">
        {props.hint ? (
          <span className="mb-0.5 whitespace-nowrap rounded-md bg-[#FFD166] px-1.5 py-0.5 text-[10.5px] font-bold text-[#1F2933] shadow" style={{ animation: 'pg-bob 900ms ease-in-out infinite' }}>{props.hint}</span>
        ) : spot.message ? (
          <span className="mb-0.5 max-w-[130px] truncate rounded-lg bg-white px-1.5 py-0.5 text-[10.5px] text-[#1F2933] shadow">{spot.message}</span>
        ) : null}
        {/* 같은 구단 3자리 이상(풀세트)이면 이름표 테두리를 구단 색으로 + 🏅 */}
        <span className={`mb-[1px] whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold shadow ${isMe ? 'bg-[#E0A526] text-white ring-1 ring-white' : 'bg-white/90 text-[#1F2933]'}`}
          style={setTeam ? { boxShadow: `0 0 0 2px ${setTeam.primary === '#FFFFFF' ? setTeam.secondary : setTeam.primary}` } : undefined}>
          {setTeam && '🏅'}{props.nickname}{spot.falls > 0 ? <span className="ml-0.5 font-normal opacity-80">🪨{spot.falls}</span> : null}
        </span>
        <div className="relative">
          {props.hurt && <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[13px] font-black text-[#E11D48]" style={{ animation: 'pg-pop 600ms ease-out forwards' }}>퍽!💥</span>}
          <div style={{ transform: `scaleX(${spot.facing})` }}>
            <div key={anim ?? 'idle'} className="origin-bottom" style={{ animation: anim, transformOrigin: spot.tumbling ? '50% 60%' : undefined }}>
              {/* 3D 피규어 그림(야구와 같은 캐릭터) — 준비 전·WebGL 불가 땐 2D */}
              <CharacterSprite equip={props.equip} name={props.nickname} size={34} colorBg={props.palette.bg} colorFg={props.palette.fg} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoneTag({ className, text, dark = false }: { className: string; text: string; dark?: boolean }) {
  return <div className={`pointer-events-none absolute z-10 rounded-md px-2 py-0.5 text-[11px] font-bold shadow ${dark ? 'bg-[#1E2A4A]/85 text-white' : 'bg-white/90 text-[#1F2933]'} ${className}`}>{text}</div>
}

const KEYFRAMES = `
@keyframes pg-swing { 0% { transform: rotate(0deg) } 40% { transform: rotate(-28deg) } 75% { transform: rotate(32deg) } 100% { transform: rotate(0deg) } }
@keyframes pg-hit { 0% { transform: translateX(0) rotate(0) } 25% { transform: translateX(-6px) rotate(-25deg) } 55% { transform: translateX(5px) rotate(18deg) } 100% { transform: translateX(0) rotate(0) } }
@keyframes pg-tumble { from { transform: rotate(0deg) } to { transform: rotate(-360deg) } }
@keyframes pg-pop { 0% { transform: translate(-50%, 6px) scale(.6); opacity: 0 } 30% { opacity: 1; transform: translate(-50%, 0) scale(1.15) } 100% { transform: translate(-50%, -10px) scale(1); opacity: 0 } }
@keyframes pg-toast { 0% { transform: translateY(6px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }
@keyframes pg-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes pg-firework { 0% { transform: scale(.3); opacity: 0 } 30% { transform: scale(1.2); opacity: 1 } 100% { transform: scale(1.7); opacity: 0 } }
`
