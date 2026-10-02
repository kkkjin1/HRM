'use client'

// 비거리 야구 필드 그림·애니메이션 공용 모듈 — 솔로 게임(BaseballWidget)과 1:1 대결(DuelView)이 같이 쓴다.
// 투구 궤적·타이밍 계산 + 필드 SVG(FieldScene: 포수 시점 + 방송 중계 시점) + 투구 애니메이션 루프(usePitchAnimation).
// 타격 뒤 장면(수비·주루·홈런·벤치 클리어링)은 broadcast.tsx.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BackHelmetShape, BackJerseyFull, BackJerseyShape, BatShape, BoxyPants, FrontCapShape, GearPreview, JerseyShape, PantsLeg, plainTeam } from '@/components/baseball/gear'
import { teamOf, type Equip } from '@/lib/baseballGear'
import { DOODLE_PALETTE } from '@/lib/data'
import { displayName } from '@/lib/members'
import {
  OUTS_PER_INNING, PITCH_TYPES, FENCE_M, STRIKES_FOR_OUT, BALLS_FOR_WALK,
  isHit, isOut, outcomeLabel, paLabel, pitchHeight, travelMs,
  type GameState, type Pitch, type PitchType, type Slot, type Swing,
} from '@/lib/baseball'
import { BROADCAST_FADE_MS, BRAWL_MS, BroadcastView, getPlaySequence, isBroadcast, sequenceDuration, worldFrame, type GameMode } from '@/components/baseball/broadcast'

export type { GameMode }
export const LOOKING_GRACE_MS = 250 // 도착 후 이 시간 안에 안 치면 루킹/볼
export const FOLLOW_MS = 280        // 릴리스 후 팔로스루 모션

// SVG viewBox 560x208 (위쪽 58은 HUD·전광판 자리).
export const VIEW_W = 560
export const VIEW_H = 150
export const VIEW_TOP = -58
// 투구 궤적 계산용 가로 좌표(예전 가로 화면 기준) — 구종별 휘는 모양·완급을 여기서 계산해 포수 시점 원근으로 옮긴다
const PLATE_X = 58
const PLATE_Y = 104
const PX = 522
const BODY = { x: 42, y: 94 } // 몸에 맞는 공 도착점
const RELEASE: Record<Slot, { x: number; y: number }> = {
  high: { x: PX - 25, y: 68 }, mid: { x: PX - 31, y: 84 }, side: { x: PX - 32, y: 100 }, low: { x: PX - 26, y: 122 },
}

export type Anim = { pitch: Pitch; start: number; result: Swing | null; resultStart: number | null; paEnded: string | null; selfResolve: boolean }
export type Pt = { x: number; y: number }

export function windupOf(a: Anim) {
  return a.pitch.windup ?? 900
}

export function arrivalOf(a: Anim) {
  return a.start + windupOf(a) + travelMs(a.pitch.speed)
}

// 타구(공) 자체가 날아가는 시간 — 궤적 속도는 이 값으로 정해진다
export function flightDuration(s: Swing) {
  if (isHit(s.outcome) || s.outcome === 'flyout') return 800 + s.distance * 6
  if (s.outcome === 'foul') return 700
  if (s.outcome === 'groundout' || s.outcome === 'popout') return 1000
  return 600
}

// 결과 장면 전체 길이(이게 끝나야 다음 타석·카운트 반영) — 인플레이 타구는 중계 시점 장면 길이
export function resultDuration(s: Swing, mode: GameMode = 'solo') {
  if (s.outcome === 'hbp' && mode === 'duel') return BRAWL_MS
  if (s.outcome === 'groundout' || s.outcome === 'popout' || s.outcome === 'flyout' || isHit(s.outcome)) return sequenceDuration(getPlaySequence(s), s)
  return flightDuration(s)
}

export function slotOf(p: Pitch): Slot {
  return p.slot ?? PITCH_TYPES[p.type].slot
}

export function endPoint(p: Pitch): Pt {
  if (p.type === 'hbp') return BODY
  return { x: PLATE_X, y: PLATE_Y + pitchHeight(p) * 15 }
}

// 구종별 비행 중 위치 (p: 0~1, 1 = 홈플레이트 도착, 1 넘으면 같은 높이로 포수까지 직진)
export function flightPos(pitch: Pitch, p: number): Pt {
  const start = RELEASE[slotOf(pitch)]
  const end = endPoint(pitch)
  const q = Math.min(p, 1)
  const px = pitch.type === 'changeup' && p <= 1 ? p + 0.22 * Math.sin(Math.PI * p) : p
  const x = start.x + (end.x - start.x) * px
  const line = (e: number) => start.y + (end.y - start.y) * e
  let y: number
  switch (pitch.type) {
    case 'heater': y = line(q) - 5 * Math.sin(Math.PI * q); break
    case 'fastball': y = line(q) - 7 * Math.sin(Math.PI * q); break
    case 'twoseam': y = line(q) + 20 * q ** 4 * (1 - q) * 4; break
    case 'cutter': y = line(q) + 7 * q ** 4; break
    case 'splitter': y = line(q) + 13 * q ** 7; break
    case 'slider': y = line(q) + 26 * q ** 4 * (1 - q) * 4; break
    case 'changeup': y = line(q) + 18 * q ** 2 * (1 - q) * 3; break
    case 'curve': y = line(q) - 32 * Math.sin(Math.PI * q) + 30 * q ** 2 * (1 - q); break
    case 'slowcurve': y = line(q) - 48 * Math.sin(Math.PI * q) + 40 * q ** 2 * (1 - q); break
    case 'eephus': y = line(q) - 78 * Math.sin(Math.PI * q); break
    case 'knuckle': y = line(q) + 9 * Math.sin(q * 17) * (0.4 + q) * (1 - q); break
    case 'rising': y = line(q ** 1.8); break
    case 'sidearm': y = line(q ** 3); break
    // 빠지는 볼: 스트라이크처럼 오다가 마지막 구간에서 존 밖으로 빠진다 — 끝까지 봐야 참을 수 있다
    // 빠지는 볼: 끝(end)은 존 밖이지만 가운데를 향하듯 오다가 마지막 구간에서 빠진다
    case 'ball': y = start.y + (PLATE_Y - start.y) * q - 6 * Math.sin(Math.PI * q) + (end.y - PLATE_Y) * q ** 5; break
    case 'hbp': y = line(q); break
  }
  return { x, y }
}

export const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
export const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))
const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)))

export function swung(s: Swing | null) {
  return !!s && s.offset !== null && s.outcome !== 'hbp'
}

export function offsetHint(s: Swing) {
  if (s.offset === null || s.outcome === 'hbp') return ''
  if (Math.abs(s.offset) < 12) return '완벽한 타이밍'
  return `${(Math.abs(s.offset) / 1000).toFixed(2)}초 ${s.offset > 0 ? '늦음' : '빠름'}`
}

export function CountDots({ label, n, max, color }: { label: string; n: number; max: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-[10px] font-bold text-[#5B6472] w-2.5">{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="w-2 h-2 rounded-full border" style={{ background: i < n ? color : 'transparent', borderColor: i < n ? color : '#C4CBD2' }} />
      ))}
    </span>
  )
}

export function Diamond({ bases }: { bases: GameState['bases'] }) {
  const cell = (on: boolean, x: number, y: number) => (
    <rect x={x} y={y} width="7" height="7" transform={`rotate(45 ${x + 3.5} ${y + 3.5})`} fill={on ? '#F59E0B' : '#FFFFFF'} stroke={on ? '#B45309' : '#C4CBD2'} strokeWidth="1" />
  )
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-label="주자">
      {cell(bases[1], 11.5, 1)}
      {cell(bases[2], 3, 9.5)}
      {cell(bases[0], 20, 9.5)}
    </svg>
  )
}

export type MemberLite = { name: string; nickname: string | null; color_key: number; avatar_url: string | null }

// 투구 애니메이션 루프. selfResolve인 공(내가 타자)은 도착 후 일정 시간 안에 안 치면 onDeadline을 부른다(루킹/볼/사구 판정).
// 관전·투수 화면의 공은 결과가 DB로 도착할 때까지 기다린다(너무 오래면 루프만 멈춤).
export function usePitchAnimation(onDeadline: (a: Anim, t: number) => void, mode: GameMode = 'solo') {
  const [anim, setAnimState] = useState<Anim | null>(null)
  const animRef = useRef<Anim | null>(null)
  const [now, setNow] = useState(0)
  const cbRef = useRef(onDeadline)
  useEffect(() => { cbRef.current = onDeadline })

  const setAnim = useCallback((next: Anim | null) => {
    animRef.current = next
    setAnimState(next)
  }, [])

  useEffect(() => {
    if (!anim) return
    let raf = 0
    const tick = () => {
      const t = performance.now()
      setNow(t)
      const a = animRef.current
      if (!a) return
      const grace = a.pitch.type === 'hbp' ? 0 : LOOKING_GRACE_MS
      if (!a.result && a.selfResolve && t > arrivalOf(a) + grace) cbRef.current(a, t)
      const cur = animRef.current
      if (cur?.result && cur.resultStart !== null && t > cur.resultStart + resultDuration(cur.result, mode)) return
      if (cur && !cur.result && t > arrivalOf(cur) + 20000) return // 결과가 끝내 안 오면 루프만 멈춘다
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anim, mode])

  const animEnd = anim?.result && anim.resultStart !== null ? anim.resultStart + resultDuration(anim.result, mode) : null
  const animActive = !!anim && (!anim.result || animEnd === null || now < animEnd)
  return { anim, animRef, now, setAnim, animActive }
}

export function PaLog({ results }: { results: GameState['results'] }) {
  return (
    <ul className="mt-1 ml-auto max-w-[118px] flex flex-wrap justify-end gap-x-1.5 text-[9.5px] leading-[12px] tabular-nums">
      {/* 최근 4타석만, 좁은 폭에서 줄바꿈 — 세로로 길면 (확대된) 투수와, 가로로 길면 자막과 겹친다 */}
      {results.slice(-4).map((r, j, arr) => {
        const i = results.length - arr.length + j
        const color = !r ? 'text-[#C4CBD2]' : r.kind === 'HR' ? 'text-[#DC2626] font-semibold' : isOut(r.kind) ? 'text-[#9AA5B1]' : 'text-[#15803D]'
        return <li key={i} className={`whitespace-nowrap ${color}`}>{i + 1} {r ? paLabel(r) : '·'}</li>
      })}
    </ul>
  )
}

// 등번호: 이름으로 정해지는 1~99 (같은 사람은 늘 같은 번호)
function backNumber(name: string) {
  let h = 7
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973
  return (h % 99) + 1
}
const teamShort = (key: Equip['cap']) => teamOf(key)?.name.split(' ')[0] ?? '기본'

// 타석 등장 선수 카드(방송 하단 자막처럼) — 정면 모습으로 모자 로고·유니폼 글씨·방망이가 다 보인다
function PlayerCard({ x, y, name, sub, equip, palette, opacity }: { x: number; y: number; name: string; sub: string; equip: Equip; palette: { bg: string; fg: string }; opacity: number }) {
  if (opacity <= 0) return null
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity} pointerEvents="none" data-layer="player-card">
      <rect x="0" y="0" width="122" height="84" rx="8" fill="#FFFFFF" fillOpacity="0.9" stroke="#E5E8EB" />
      <g transform="translate(2 2)"><GearPreview equip={equip} size={52} colorBg={palette.bg} colorFg={palette.fg} /></g>
      <text x="58" y="18" fontSize="11" fontWeight="800" fill="#1F2933">{name}</text>
      <text x="58" y="30" fontSize="8.5" fontWeight="600" fill="#7A8491">{sub}</text>
      {([['모자', equip.cap], ['유니폼', equip.uniform], ['방망이', equip.bat]] as const).map(([label, key], i) => (
        <text key={label} x="58" y={46 + i * 12} fontSize="8" fill="#5B6472"><tspan fill="#9AA5B1">{label} </tspan><tspan fontWeight="700" fill={teamOf(key)?.primary ?? '#5B6472'}>{teamShort(key)}</tspan></text>
      ))}
    </g>
  )
}

// 필드 한 장면 — 포수 시점(대기·투구·스윙) 위에, 인플레이 타구면 방송 중계 시점(BroadcastView)이 컷 전환으로 덮는다.
// 주자·카운트(좌상), rightTop(우상, 기본 = 점수·타석·타석별 기록), 자막.
export function FieldScene(props: {
  anim: Anim | null
  now: number
  st: GameState
  prevLandings: Swing[]
  batter: MemberLite | null
  batterGear?: Equip
  pitcherGear?: Equip
  pitcherName?: string
  idleCaption?: string
  rightTop?: ReactNode
  scoreboardLogo?: string | null // 전광판에 흐리게 띄울 구단 로고(배경 로고 설정)
  dragProps?: Record<string, (e: React.PointerEvent<HTMLDivElement>) => void>
  mode?: GameMode
  viewpoint?: 'catcher' | 'pitcher' // 대결에서 내가 투수면 투수 시점(포수·타자가 보이게)
  aim?: { height: number; side: number } | null // 투수 시점: 지금 겨냥한 곳(던지기 전까지 표시)
  onFieldPress?: () => boolean // 화면을 누르면 먼저 호출 — true면(스윙 처리됨) 위젯 드래그를 시작하지 않는다
}) {
  const { anim, now, st, batter } = props
  const mode = props.mode ?? 'solo'
  const pitcherEye = props.viewpoint === 'pitcher'
  const uid = useId().replace(/:/g, '')
  // 좌·우타, 좌·우투는 타석마다 번갈아(같은 타석은 모든 화면에서 같게): 타자 우·좌·우·좌…, 투수 우·우·좌·좌…
  const batsLeft = st.pa % 2 === 1
  const throwsLeft = Math.floor(st.pa / 2) % 2 === 1
  const palette = DOODLE_PALETTE[(batter?.color_key ?? 0) % 8]
  const windup = !!anim && now - anim.start < windupOf(anim)
  const resultShown = anim?.result && anim.resultStart !== null && now >= anim.resultStart ? anim.result : null

  // 타격 뒤 장면: 확정된 결과 → 중계 시점 장면(시간의 순수 함수). 판정·카운트와 무관한 그림 전용 상태.
  const playT = resultShown && anim?.resultStart != null ? now - anim.resultStart : null
  const playSeq = resultShown ? getPlaySequence(resultShown, mode) : null
  const playDur = resultShown ? resultDuration(resultShown, mode) : 0
  const onAir = isBroadcast(playSeq) && playT !== null && playT < playDur
  const frame = onAir && playSeq && resultShown && playT !== null ? worldFrame(playSeq, resultShown, playT, st.bases, batsLeft) : null
  const bw = onAir && playT !== null ? ease(seg(playT, 40, 40 + BROADCAST_FADE_MS)) * (1 - ease(seg(playT, playDur - BROADCAST_FADE_MS, playDur))) : 0
  const phase = !anim ? 'idle' : !resultShown ? 'pitch' : onAir ? 'broadcast' : playT !== null && playT >= playDur ? 'complete' : 'result'

  // 구종·구속은 친 뒤에만 공개 — 투구폼과 궤적만 보고 읽어야 한다.
  let caption = ''
  let subCaption = ''
  if (resultShown?.outcome === 'flyout') {
    caption = `잡혔다! ${resultShown.distance}m 뜬공 아웃`
    const hint = offsetHint(resultShown)
    subCaption = `${PITCH_TYPES[resultShown.type].label} ${resultShown.speed}km/h${hint ? ` · ${hint}` : ''}`
  } else if (resultShown) {
    caption = anim?.paEnded
      ? (isHit(resultShown.outcome) ? `${anim.paEnded} ${resultShown.distance}m` : anim.paEnded)
      : outcomeLabel(resultShown)
    const hint = offsetHint(resultShown)
    subCaption = `${PITCH_TYPES[resultShown.type].label} ${resultShown.speed}km/h${hint ? ` · ${hint}` : ''}`
  } else if (anim) {
    caption = windup ? '투구 준비…' : ''
  } else {
    caption = props.idleCaption ?? ''
  }
  if (frame?.holdCaption) { caption = ''; subCaption = '' } // OUT/SAFE/홈런 순간까지 결과 문구를 아낀다
  if (anim && !resultShown && !windup) caption = '' // 공이 날아오는 동안엔 화면을 비운다
  const bigCaption = !!resultShown && (!!anim?.paEnded || isHit(resultShown.outcome))
  // 자막 자리: 중계 시점은 펜스 위 관중석(전광판 문구가 있으면 그 아래), 포수 시점은 홈플레이트 아래(양옆 타석의 타자와 안 겹치게)
  const capY = bw > 0.5 ? (frame?.board ? -14 : -36) : 134
  // 선수 카드: 대기 중(투구 시작하면 사라짐), 홈런 세리머니 때 다시
  const homerCard = frame?.board?.label === 'HOME RUN!' ? bw * ease(seg(frame.board.k, 0, 0.12)) : 0
  const idleCard = !anim ? 1 : 1 - seg(now - anim.start, 0, 300)
  const cardOp = pitcherEye ? 0 : Math.max(homerCard, bw > 0 ? 0 : idleCard)
  const batterName = batter ? displayName(batter) : '타자'
  const bEquip: Equip = props.batterGear ?? { cap: null, uniform: null, bat: null }

  const hudPanel = 'absolute top-1 z-20 pointer-events-none rounded-lg bg-white/65 backdrop-blur-[2px] border border-white/80'

  return (
    <div className="cursor-move touch-none relative" {...props.dragProps}
      onPointerDown={e => {
        if (props.onFieldPress?.()) { e.preventDefault(); return }
        props.dragProps?.onPointerDown?.(e)
      }}>
      {/* HUD — 필드 그림과 독립된 위 레이어 */}
      <div className={`${hudPanel} left-2.5 flex items-center gap-2 px-1.5 py-1`}>
        <Diamond bases={st.bases} />
        <span className="flex flex-col gap-0.5">
          <CountDots label="S" n={st.strikes} max={STRIKES_FOR_OUT - 1} color="#F59E0B" />
          <CountDots label="B" n={st.balls} max={BALLS_FOR_WALK - 1} color="#16A34A" />
          <CountDots label="O" n={st.outs} max={OUTS_PER_INNING} color="#DC2626" />
        </span>
      </div>
      <div className={`${hudPanel} right-2.5 text-right px-2 py-1`}>
        {props.rightTop ?? (
          <>
            <p className="leading-none tabular-nums whitespace-nowrap">
              <span className="text-[18px] font-bold text-[#1F2933]">{st.runs}</span><span className="text-[10.5px] font-medium text-[#5B6472] ml-0.5">점</span>
              <span className="text-[10.5px] text-[#5B6472] ml-2">{st.finished ? st.pa : st.pa + 1}번째 타석</span>
            </p>
            {st.results.length > 0 && <PaLog results={st.results} />}
          </>
        )}
      </div>

      <svg viewBox={`0 ${VIEW_TOP} ${VIEW_W} ${VIEW_H - VIEW_TOP}`} className="relative z-0 w-full h-auto block" role="img" aria-label="야구 필드"
        data-mode={bw > 0 ? 'BROADCAST' : 'CATCHER'} data-play-phase={phase} data-play-seq={playSeq?.type ?? 'none'}>
        {bw < 1 && pitcherEye && (
          <PitcherView anim={anim} now={now} uid={uid} pitcherGear={props.pitcherGear} batterGear={props.batterGear} palette={palette}
            batsLeft={batsLeft} throwsLeft={throwsLeft} logo={props.scoreboardLogo} pitcherName={props.pitcherName ?? '투수'} batterName={batterName} aim={props.aim} />
        )}
        {bw < 1 && !pitcherEye && (
          <CatcherView anim={anim} now={now} uid={uid} pitcherGear={props.pitcherGear} batterGear={props.batterGear} palette={palette}
            batsLeft={batsLeft} throwsLeft={throwsLeft} bases={st.bases} logo={props.scoreboardLogo} batterName={batterName} />
        )}
        {frame && bw > 0 && (
          <BroadcastView frame={frame} weight={bw} uid={uid} logo={props.scoreboardLogo} pitcherGear={props.pitcherGear} batterGear={props.batterGear}
            batterColor={palette.bg} prevLandings={props.prevLandings} />
        )}

        <PlayerCard x={6} y={62} name={batterName} sub={`${batsLeft ? '좌타' : '우타'} · ${st.pa + 1}번째 타석`} equip={bEquip} palette={palette} opacity={cardOp} />
        {props.pitcherName && props.pitcherGear && bw === 0 && !pitcherEye && (
          <PlayerCard x={VIEW_W - 128} y={62} name={props.pitcherName} sub={`투수 · ${throwsLeft ? '좌투' : '우투'}`} equip={props.pitcherGear} palette={{ bg: '#E5E7EB', fg: '#374151' }} opacity={idleCard} />
        )}

        {/* 이름표 (포수 시점) */}
        {bw < 0.5 && !pitcherEye && (
          <g opacity={1 - bw * 2} pointerEvents="none">
            {batter && cardOp < 0.5 && <text x={batsLeft ? VIEW_W - 118 : 118} y={VIEW_H - 4} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3A4249" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="2.5" strokeLinejoin="round">{displayName(batter)} <tspan fontWeight="500" fill="#7A8491">{batsLeft ? '좌타' : '우타'}</tspan></text>}
            <text x={VIEW_W / 2 + 46} y={9} textAnchor="start" fontSize="8.5" fontWeight="600" fill="#3A4249" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="2.5" strokeLinejoin="round">{props.pitcherName ? `${props.pitcherName} ` : ''}<tspan fontWeight="500" fill="#7A8491">{throwsLeft ? '좌투' : '우투'}</tspan></text>
          </g>
        )}

        {/* 안내·결과 자막 — 흰 테두리로 배경 위에서도 읽히게 */}
        {caption && (
          <text x={VIEW_W / 2} y={capY} textAnchor="middle" fontSize={bigCaption ? 18 : 12.5} fontWeight="700" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3.5" strokeOpacity="0.9" strokeLinejoin="round" fill={resultShown && resultShown.distance >= FENCE_M ? '#DC2626' : '#1F2933'}>{caption}</text>
        )}
        {subCaption && <text x={VIEW_W / 2} y={capY + 14} textAnchor="middle" fontSize="10" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3" strokeOpacity="0.9" strokeLinejoin="round" fill="#3A4249">{subCaption}</text>}
      </svg>
    </div>
  )
}

// 주 액션 버튼 — 투구(파랑)·스윙(빨강, 조금 더 크게)
export const PITCH_BTN = 'inline-flex items-center justify-center gap-1 h-10 rounded-[18px] px-4 text-[12.5px] font-bold text-white whitespace-nowrap bg-[#4C7FE0] hover:bg-[#3A6CC8] active:bg-[#335FB3] active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0 shadow-[0_2px_6px_rgba(76,127,224,0.28)] transition-colors'
export const SWING_BTN = 'inline-flex items-center justify-center gap-1.5 h-11 rounded-[20px] px-6 text-[14px] font-bold text-white whitespace-nowrap bg-[#DC2626] hover:bg-[#C42020] active:bg-[#A91B1B] active:translate-y-px shadow-[0_2px_8px_rgba(220,38,38,0.3)] transition-colors'

// 하단 컨트롤바 — 왼쪽 "장비 바꾸기"(equip 없으면 자리만 비움), 가운데 주 액션. wide면 가운데를 전체 폭으로.
export function GameControls({ equip, wide, children }: { equip?: ReactNode; wide?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative z-10 mx-2 mb-2 rounded-xl bg-white/80 backdrop-blur-sm border border-white shadow-[0_1px_4px_rgba(16,24,40,0.08)] px-2.5 py-2">
      {wide ? children : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 min-h-[44px]">
          <div className="min-w-0">
            {equip && (
              <button onClick={() => setOpen(v => !v)} className="text-[10.5px] text-[#5B6472] hover:text-[#1F2933] whitespace-nowrap">
                👕 장비 바꾸기 {open ? '▲' : '▼'}
              </button>
            )}
          </div>
          <div className="flex justify-center">{children}</div>
          <div />
        </div>
      )}
      {equip && open && <div className="mt-2 bg-white/80 border border-[#E5E8EB] rounded-lg px-2 py-1.5">{equip}</div>}
    </div>
  )
}


// ── 2.5D 포수 시점 (대기·투구·스윙) ──
// 투구는 홈플레이트 뒤에서 본 원근 화면 — 공이 멀리서 점처럼 출발해 존 앞에서 확 커진다.
// 판정 시각(arrivalOf)은 그대로고, 공의 화면 위치만 원근 투영으로 바꾼다. 타구가 인플레이면 FieldScene이 중계 시점으로 넘긴다.
const CV = { cx: VIEW_W / 2, f: 200, camH: 1.25, horizon: 0, zPlate: 2.0, zRubber: 23.5 }
const PITCHER_EXAG = 3.0 // 멀리 있는 투수를 읽을 수 있게 과장해서 크게
const proj = (X: number, Y: number, Z: number): Pt => ({ x: CV.cx + (CV.f * X) / Z, y: CV.horizon + (CV.f * (CV.camH - Y)) / Z })
const CV_MOUND = proj(0, 0, CV.zRubber)
const CV_PS = (CV.f / CV.zRubber) * PITCHER_EXAG // 투수 그림: 1m당 화면 단위
const cvPitcherPt = (p: Pt): Pt => ({ x: CV_MOUND.x + p.x * CV_PS, y: CV_MOUND.y - p.y * CV_PS })
// 투수 기준이 아니라 화면 기준(오른손 투수의 던지는 팔 = 화면 왼쪽)
const COCK_F: Record<Slot, Pt> = { high: { x: -0.42, y: 1.95 }, mid: { x: -0.6, y: 1.6 }, side: { x: -0.78, y: 1.3 }, low: { x: -0.6, y: 0.75 } }
const RELEASE_F: Record<Slot, Pt> = { high: { x: -0.22, y: 2.05 }, mid: { x: -0.45, y: 1.75 }, side: { x: -0.88, y: 1.28 }, low: { x: -0.62, y: 0.55 } }
const BREAK_X: Partial<Record<PitchType, number>> = { slider: 0.32, cutter: 0.14, curve: 0.18, slowcurve: 0.22, twoseam: -0.22, changeup: -0.12, splitter: -0.05, sidearm: 0.1 }
const Z_RELEASE = CV.zRubber - 1.3
const CV_Z = (worldZ: number) => worldZ + CV.zPlate // 경기장 z(홈 = 0) → 포수 카메라 깊이
// 내야(베이스·주자)는 좌우를 살짝 좁혀 그린다 — 1·3루 주자가 화면 위 HUD 패널에 가리지 않게
const projInfield = (X: number, Z: number): Pt => { const q = proj(X, 0, CV_Z(Z)); return { x: CV.cx + (q.x - CV.cx) * 0.72, y: q.y } }

function frontPitcherPose(a: Anim | null, now: number) {
  const pose = {
    head: { x: 0, y: 1.72 }, shL: { x: -0.19, y: 1.48 }, shR: { x: 0.19, y: 1.48 }, hip: { x: 0, y: 0.95 },
    footL: { x: -0.2, y: 0 }, footR: { x: 0.2, y: 0 }, kneeR: { x: 0.2, y: 0.48 }, kneeL: { x: -0.2, y: 0.48 },
    hand: { x: -0.06, y: 1.22 }, glove: { x: 0.08, y: 1.24 }, holding: true, grow: 1,
  }
  if (!a) return pose
  const t = now - a.start
  const w = windupOf(a)
  const slot = slotOf(a.pitch)
  if (t < w) {
    const u = t / w
    if (u < 0.4) { // 다리 들기
      const k = ease(u / 0.4)
      pose.footR = lerp(pose.footR, { x: 0.1, y: 0.55 }, k)
      pose.kneeR = lerp(pose.kneeR, { x: 0.24, y: 0.85 }, k)
    } else if (u < 0.85) { // 내딛으며 팔 뒤로
      const k = ease((u - 0.4) / 0.45)
      pose.footR = lerp({ x: 0.1, y: 0.55 }, { x: 0.24, y: -0.14 }, k)
      pose.kneeR = lerp({ x: 0.24, y: 0.85 }, { x: 0.26, y: 0.42 }, k)
      pose.hand = lerp(pose.hand, COCK_F[slot], k)
      pose.glove = lerp(pose.glove, { x: 0.48, y: 1.45 }, k)
      pose.hip = lerp(pose.hip, { x: 0.02, y: 0.88 }, k)
      pose.head = lerp(pose.head, { x: 0.02, y: 1.66 }, k)
      pose.grow = 1 + 0.05 * k
    } else { // 릴리스
      const k = ease((u - 0.85) / 0.15)
      pose.footR = { x: 0.24, y: -0.14 }
      pose.kneeR = { x: 0.26, y: 0.42 }
      pose.hand = lerp(COCK_F[slot], RELEASE_F[slot], k)
      pose.glove = { x: 0.48, y: 1.45 }
      pose.hip = { x: 0.02, y: 0.86 }
      pose.head = { x: 0.0, y: 1.6 }
      pose.grow = 1.05 + 0.03 * k
    }
    return pose
  }
  const k = ease(Math.min(1, (t - w) / FOLLOW_MS)) // 팔로스루
  pose.holding = false
  pose.footR = { x: 0.24, y: -0.14 }
  pose.kneeR = { x: 0.26, y: 0.42 }
  pose.footL = lerp(pose.footL, { x: -0.1, y: 0.3 }, k)
  pose.kneeL = lerp(pose.kneeL, { x: -0.18, y: 0.55 }, k)
  pose.hand = lerp(RELEASE_F[slot], { x: 0.34, y: 0.78 }, k)
  pose.glove = { x: 0.4, y: 1.15 }
  pose.hip = { x: 0.03, y: 0.84 }
  pose.head = { x: 0.04, y: 1.56 }
  pose.grow = 1.08
  return pose
}

const isBatted = (s: Swing) => isHit(s.outcome) || s.outcome === 'groundout' || s.outcome === 'popout' || s.outcome === 'flyout' || s.outcome === 'foul'

// 포수 시점에서 본 공 — 월드 좌표(m)를 Z(깊이)를 따라 원근 보간
function catcherBall(a: Anim, now: number, batsLeft: boolean, throwsLeft: boolean): { at: Pt; r: number; shadow: Pt; opacity: number } | null {
  const t = now - a.start
  const w = windupOf(a)
  if (t < w) return null
  const slot = slotOf(a.pitch)
  const rf = RELEASE_F[slot]
  const rel = cvPitcherPt({ x: throwsLeft ? -rf.x : rf.x, y: rf.y })
  // 그려진 손 위치에서 출발하도록 릴리스 지점의 월드 좌표를 역산
  const X0 = ((rel.x - CV.cx) * Z_RELEASE) / CV.f
  const Y0 = CV.camH - ((rel.y - CV.horizon) * Z_RELEASE) / CV.f
  const hbp = a.pitch.type === 'hbp'
  const X1 = hbp ? (batsLeft ? 0.55 : -0.55) : (a.pitch.side ?? 0) * 0.215
  const Y1 = hbp ? 1.0 : 0.75 - pitchHeight(a.pitch) * 0.3
  const out = (X: number, Y: number, Z: number, opacity = 1) => {
    const zc = Math.max(0.9, Z)
    return { at: proj(X, Y, zc), r: Math.max(1.6, (0.037 * 3.4 * CV.f) / zc), shadow: proj(X, 0, zc), opacity }
  }
  // 친 공: 방망이에 맞은 순간부터 외야 쪽(파울은 뒤쪽 위)으로 튕겨 나간다
  const res = a.result
  if (res && a.resultStart !== null && now >= a.resultStart && isBatted(res)) {
    const k = (now - a.resultStart) / 450
    if (k >= 1) return null
    if (res.outcome === 'foul') return out(X1 + (batsLeft ? 2.5 : -2.5) * k, Y1 + 7 * k, CV.zPlate - 1.0 * k, 1 - k)
    const low = res.outcome === 'groundout' || (isHit(res.outcome) && res.distance < 45)
    return out(X1 + (batsLeft ? -3 : 3) * k * 0.4, low ? Y1 * (1 - k) + 0.1 : Y1 + 6 * k, CV.zPlate + 26 * k, 1 - k * 0.6)
  }
  const p = (t - w) / travelMs(a.pitch.speed)
  if (p > 1.12 || (hbp && p > 1.04)) return null
  // 가로 궤적 계산(flightPos)의 x 진행(체인지업의 완급)과 위아래 휘는 정도를 그대로 가져온다
  const sp = flightPos(a.pitch, Math.min(p, 1))
  const s0 = RELEASE[slot]
  const e0 = endPoint(a.pitch)
  const kx = p <= 1 ? Math.max(0, Math.min(1, (s0.x - sp.x) / (s0.x - e0.x))) : 1
  const lineY = s0.y + (e0.y - s0.y) * Math.min(p, 1)
  const devM = -(sp.y - lineY) * 0.022
  const Z = p <= 1 ? Z_RELEASE + (CV.zPlate - Z_RELEASE) * kx : CV.zPlate - (p - 1) * 9
  const brk = (BREAK_X[a.pitch.type] ?? 0) * kx ** 3 * (throwsLeft ? -1 : 1) // 좌투는 반대로 휜다
  return out(X0 + (X1 - X0) * kx + brk, Y0 + (Y1 - Y0) * kx + devM, Z, p > 1 ? 1 - (p - 1) / 0.12 : 1)
}

// 타자 스윙(포수 시점) — 방망이 끝: 준비 → 존 앞 → 팔로스루
type BatKey = { hands: Pt; tip: Pt }
const CV_BAT: [BatKey, BatKey, BatKey] = [
  { hands: { x: 0.42, y: 1.55 }, tip: { x: 0.05, y: 2.25 } },
  { hands: { x: 0.2, y: 1.25 }, tip: { x: 1.05, y: 1.2 } },
  { hands: { x: -0.15, y: 1.5 }, tip: { x: -0.5, y: 1.95 } },
]
// 투수 시점(정면): 손은 뒷어깨(홈플레이트 반대쪽) 위, 방망이는 뒤로 비스듬히 → 플레이트 앞으로 → 반대편 어깨 위로
const PV_BAT: [BatKey, BatKey, BatKey] = [
  { hands: { x: -0.22, y: 1.45 }, tip: { x: -0.52, y: 2.15 } },
  { hands: { x: 0.18, y: 1.2 }, tip: { x: 1.0, y: 1.12 } },
  { hands: { x: 0.22, y: 1.5 }, tip: { x: -0.35, y: 1.95 } },
]
function batPose(a: Anim | null, now: number, keys: [BatKey, BatKey, BatKey] = CV_BAT) {
  const [ready, contact, finish] = keys
  if (!a?.result || a.resultStart === null || !swung(a.result) || now < a.resultStart - 60) return ready
  const w = Math.min(1, (now - a.resultStart + 60) / 200)
  if (w < 0.5) { const k = ease(w / 0.5); return { hands: lerp(ready.hands, contact.hands, k), tip: lerp(ready.tip, contact.tip, k) } }
  const k = ease((w - 0.5) / 0.5)
  return { hands: lerp(contact.hands, finish.hands, k), tip: lerp(contact.tip, finish.tip, k) }
}

function CatcherView({ anim, now, uid, pitcherGear, batterGear, palette, batsLeft, throwsLeft, bases, logo, batterName }: {
  anim: Anim | null; now: number; uid: string; pitcherGear?: Equip; batterGear?: Equip; palette: { bg: string; fg: string }
  batsLeft: boolean; throwsLeft: boolean; bases: GameState['bases']; logo?: string | null; batterName: string
}) {
  const pose = frontPitcherPose(anim, now)
  const ball = anim ? catcherBall(anim, now, batsLeft, throwsLeft) : null
  const mx = throwsLeft ? -1 : 1 // 좌투는 좌우 반전
  const P = (p0: Pt) => { const q = cvPitcherPt({ x: p0.x * mx, y: p0.y }); return { x: CV_MOUND.x + (q.x - CV_MOUND.x) * pose.grow, y: CV_MOUND.y + (q.y - CV_MOUND.y) * pose.grow } }
  const pCap = teamOf(pitcherGear?.cap)
  const pUni = teamOf(pitcherGear?.uniform)
  const bCap = teamOf(batterGear?.cap)
  const bUni = teamOf(batterGear?.uniform)
  const bBat = teamOf(batterGear?.bat)
  const zoneTL = proj(-0.215, 1.05, CV.zPlate)
  const zoneBR = proj(0.215, 0.45, CV.zPlate)
  const plate = [proj(-0.215, 0, 1.75), proj(0.215, 0, 1.75), proj(0.215, 0, 1.45), proj(0, 0, 1.25), proj(-0.215, 0, 1.45)]
  const homeDirt = proj(0, 0, 3.2)
  const baseW = [{ x: 19.4, z: 19.4 }, { x: 0, z: 38.8 }, { x: -19.4, z: 19.4 }]
  const infield = [projInfield(0, 0), projInfield(19.4, 19.4), projInfield(0, 38.8), projInfield(-19.4, 19.4)]
  const head = P(pose.head)
  const bat = batPose(anim, now)
  // 타자(등 뒤 모습) — 오른손 타자는 포수 시점 왼쪽 타석, 좌타는 반대편
  const B = (x: number, y: number): Pt => (batsLeft ? { x: VIEW_W - 200 - x * 52, y: 140 - y * 52 } : { x: 200 + x * 52, y: 140 - y * 52 })
  const helmet = bCap?.cap ?? '#1F4E8C'
  const jersey = bUni?.primary ?? palette.bg // 주자 몸통 색(작아서 트림 색이 더 잘 보인다)
  return (
    <g data-layer="catcher-view" pointerEvents="none">
      <defs>
        <linearGradient id={`${uid}-cvsky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E3EBF3" /><stop offset="1" stopColor="#F1F4F6" /></linearGradient>
        <linearGradient id={`${uid}-cvgrass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C2D8B5" /><stop offset="1" stopColor="#D6E6CB" /></linearGradient>
        <filter id={`${uid}-cvsoft`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <pattern id={`${uid}-cvcrowd`} width="6" height="5" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="#F4F1EA" /><circle cx="4.5" cy="3.8" r="1" fill="#6F8094" /></pattern>
      </defs>
      <rect x="0" y={VIEW_TOP} width={VIEW_W} height={VIEW_H - VIEW_TOP} fill={`url(#${uid}-cvsky)`} />
      {/* 외야 관중석·전광판·펜스 (흐리게) */}
      <g filter={`url(#${uid}-cvsoft)`} opacity="0.32">
        <path d={`M0 ${VIEW_TOP + 20} L180 -14 L380 -14 L560 ${VIEW_TOP + 20} L560 -2 L0 -2 Z`} fill="#93A3B5" />
        <path d={`M0 ${VIEW_TOP + 20} L180 -14 L380 -14 L560 ${VIEW_TOP + 20} L560 -2 L0 -2 Z`} fill={`url(#${uid}-cvcrowd)`} opacity="0.55" />
        <rect x="236" y={VIEW_TOP + 6} width="88" height="34" rx="2" fill="#465566" />
        <rect x="0" y="-4" width={VIEW_W} height="5" fill="#5E7D6A" />
      </g>
      {logo && <image href={logo} x="262" y={VIEW_TOP + 8} width="36" height="30" preserveAspectRatio="xMidYMid meet" opacity="0.25" />}
      <rect x="0" y="1" width={VIEW_W} height={VIEW_H - 1} fill={`url(#${uid}-cvgrass)`} />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M${CV.cx + (i - 4) * 4} 1 L${CV.cx + (i - 4) * 160} ${VIEW_H} L${CV.cx + (i - 3.5) * 160} ${VIEW_H} L${CV.cx + (i - 3.5) * 4} 1 Z`} fill="#FFFFFF" opacity={i % 2 ? 0.1 : 0} />
      ))}
      <polygon points={infield.map(p => `${p.x},${p.y}`).join(' ')} fill="#E6D3B8" opacity="0.45" />
      <ellipse cx={CV_MOUND.x} cy={CV_MOUND.y + 0.5} rx="22" ry="3" fill="#E3CCAE" />
      <ellipse cx={homeDirt.x} cy={homeDirt.y + 40} rx="190" ry="52" fill="#E1CBAB" opacity="0.55" />
      <polygon points={plate.map(p => `${p.x},${p.y}`).join(' ')} fill="#FFFFFF" stroke="#B8B2A7" strokeWidth="0.8" />
      {/* 베이스 + 나가 있는 주자 */}
      {baseW.map((b, i) => {
        const q = projInfield(b.x, b.z)
        const s = (CV.f / CV_Z(b.z)) * 2.3 // 주자 1m당 화면 단위(과장)
        return (
          <g key={i}>
            <rect x={q.x - 2.4} y={q.y - 1.2} width="4.8" height="2.4" fill="#FFFFFF" opacity="0.9" />
            {bases[i] && (
              <g transform={`translate(${q.x + (i === 0 ? -6 : i === 2 ? 6 : 4)} ${q.y})`} data-runner>
                <g stroke="#2B3440" strokeLinecap="round" strokeWidth="1.6" fill="none">
                  <line x1="0" y1={-0.95 * s} x2={-0.22 * s} y2="0" /><line x1="0" y1={-0.95 * s} x2={0.22 * s} y2="0" />
                </g>
                <rect x={-0.2 * s} y={-1.5 * s} width={0.4 * s} height={0.58 * s} rx="1" fill={jersey} stroke="#2B3440" strokeWidth="0.8" />
                <circle cx="0" cy={-1.68 * s} r={0.15 * s} fill={helmet} stroke="#2B3440" strokeWidth="0.7" />
              </g>
            )}
          </g>
        )
      })}

      {/* 투수(정면) — 팔 각도가 구종 힌트 */}
      {/* 다리: 유니폼이면 같은 색 바지 + 구단 색 스타킹 */}
      <PantsLeg hip={P(pose.hip)} knee={P(pose.kneeL)} foot={P(pose.footL)} width={4.2 * pose.grow} team={pUni} />
      <PantsLeg hip={P(pose.hip)} knee={P(pose.kneeR)} foot={P(pose.footR)} width={4.2 * pose.grow} team={pUni} />
      {pUni ? (
        // 정면이라 가슴 글씨까지 보인다
        <JerseyShape a={lerp(P(pose.shL), P(pose.shR), 0.5)} b={P(pose.hip)} wTop={0.46 * CV_PS * pose.grow} wBottom={0.34 * CV_PS * pose.grow} team={pUni} />
      ) : (
        <polygon points={[pose.shL, pose.shR, { x: pose.hip.x + 0.15, y: pose.hip.y }, { x: pose.hip.x - 0.15, y: pose.hip.y }].map(P).map(p => `${p.x},${p.y}`).join(' ')}
          fill="#E5E7EB" stroke="#374151" strokeWidth="1.2" strokeLinejoin="round" />
      )}
      <g stroke="#374151" strokeLinecap="round" fill="none" strokeWidth="2.2">
        <line x1={P(pose.shL).x} y1={P(pose.shL).y} x2={P(pose.hand).x} y2={P(pose.hand).y} />
        <line x1={P(pose.shR).x} y1={P(pose.shR).y} x2={P(pose.glove).x} y2={P(pose.glove).y} />
      </g>
      <circle cx={P(pose.glove).x} cy={P(pose.glove).y} r="3.2" fill="#8B5A2B" />
      <circle cx={head.x} cy={head.y} r={0.13 * CV_PS * pose.grow} fill="#E5E7EB" stroke="#374151" strokeWidth="1.1" />
      <FrontCapShape cx={head.x} cy={head.y - 0.02 * CV_PS} r={0.15 * CV_PS * pose.grow} team={pCap} fallback="#B91C1C" />
      {pose.holding && <circle cx={P(pose.hand).x} cy={P(pose.hand).y} r="2.2" fill="#FFFFFF" stroke="#C0392B" strokeWidth="0.8" />}

      {/* 스트라이크존 */}
      <rect x={zoneTL.x} y={zoneTL.y} width={zoneBR.x - zoneTL.x} height={zoneBR.y - zoneTL.y} fill="#4C7FE0" fillOpacity="0.07" stroke="#4C7FE0" strokeOpacity="0.55" strokeDasharray="3 2" strokeWidth="1" />

      {/* 타자(등) — 무릎을 살짝 굽힌 타격 자세: 통바지(엉덩이·허벅지) + 벨트 + 어깨·소매가 있는 상의 + 두 팔로 방망이 */}
      {(() => {
        const poly = (list: [number, number][]) => list.map(([x, y]) => { const q = B(x, y); return `${q.x},${q.y}` }).join(' ')
        const sleeve = bUni?.jersey ?? palette.bg
        const h = B(bat.hands.x, bat.hands.y), tp = B(bat.tip.x, bat.tip.y)
        const arm = (sh: [number, number], el: [number, number]) => `${B(...sh).x},${B(...sh).y} ${B(...el).x},${B(...el).y} ${h.x},${h.y}`
        return (
          <g opacity="0.95">
            <ellipse cx={B(0, 0).x} cy={B(0, 0).y + 1} rx="34" ry="5" fill="#2F3A33" opacity="0.2" />
            {/* 하의: 상의 하단과 이어지는 박스형 통바지 + 짧은 양말 + 둥근 신발 */}
            <BoxyPants M={B} team={bUni} />
            {/* 팔(소매 → 팔) — 뒤쪽 팔이 먼저 */}
            <polyline points={arm([-0.25, 1.44], [-0.02, 1.2])} fill="none" stroke="#374151" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            {/* 소매 */}
            {([-1, 1] as const).map(k => <polygon key={k} points={poly([[k * 0.2, 1.5], [k * 0.33, 1.44], [k * 0.33, 1.3], [k * 0.22, 1.32]])} fill={sleeve} stroke={bUni?.primary ?? '#374151'} strokeWidth="1" strokeLinejoin="round" />)}
            {/* 등판: 어깨가 둥근 상의 + 이름 + 등번호 (유니폼 없으면 기본 티셔츠) */}
            <BackJerseyShape pts={batsLeft ? [B(0.27, 1.52), B(-0.27, 1.52), B(-0.235, 0.94), B(0.235, 0.94)] : [B(-0.27, 1.52), B(0.27, 1.52), B(0.235, 0.94), B(-0.235, 0.94)]}
              team={bUni} fallback={palette.bg} name={batterName} number={backNumber(batterName)} />
            <polyline points={arm([0.27, 1.44], [0.42, 1.22])} fill="none" stroke="#374151" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <BatShape hands={h} angleRad={Math.atan2(tp.y - h.y, tp.x - h.x)} length={Math.hypot(tp.x - h.x, tp.y - h.y)} team={bBat} width={5} />
            <circle cx={h.x} cy={h.y} r="2.8" fill="#374151" />
            {/* 목 + 헬멧 */}
            <line x1={B(0, 1.5).x} y1={B(0, 1.5).y} x2={B(0, 1.6).x} y2={B(0, 1.6).y} stroke="#374151" strokeWidth="5" strokeLinecap="round" />
            <BackHelmetShape cx={B(0, 1.71).x} cy={B(0, 1.71).y} r={11.5} team={bCap} fallback="#1F4E8C" />
          </g>
        )
      })()}

      {/* 공 + 그림자 (멀면 작게, 가까우면 크게) */}
      {ball && (
        <g opacity={ball.opacity}>
          <ellipse cx={ball.shadow.x} cy={ball.shadow.y} rx={ball.r * 1.1} ry={ball.r * 0.3} fill="#2F3A33" opacity="0.22" />
          <circle cx={ball.at.x} cy={ball.at.y} r={ball.r} fill="#FFFFFF" stroke="#C0392B" strokeWidth={Math.max(0.7, ball.r * 0.14)} data-ball />
          {ball.r > 3 && <path d={`M${ball.at.x - ball.r * 0.55} ${ball.at.y - ball.r * 0.5} Q${ball.at.x} ${ball.at.y} ${ball.at.x - ball.r * 0.55} ${ball.at.y + ball.r * 0.5}`} fill="none" stroke="#C0392B" strokeWidth={ball.r * 0.08} />}
        </g>
      )}
    </g>
  )
}

// ── 투수 시점 (대결에서 내가 투수일 때) ──
// 마운드 뒤 높은 곳에서 홈플레이트를 당겨 찍은 화면(TV 중견수 카메라 느낌) — 앞쪽에 내 뒷모습, 멀리 타자·포수·심판.
// X는 투수 화면 기준(오른쪽 +)이라 포수 시점 좌표와 부호가 반대다. 판정과는 무관한 그림 전용.
const PV = { cx: VIEW_W / 2, f: 1560, camH: 3.0, horizon: -95, dPlate: 21 }
const pv = (X: number, Y: number, dz = 0): Pt => {
  const d = PV.dPlate + dz
  return { x: PV.cx + (PV.f * X) / d, y: PV.horizon + (PV.f * (PV.camH - Y)) / d }
}
const pvScale = (dz = 0) => PV.f / (PV.dPlate + dz) // 그 깊이에서 1m당 화면 단위
const PV_ZONE_HALF = 0.215

// 공이 도착하는(또는 겨냥한) 지점 — 투수 화면 좌표(m). side는 포수 시점 기준 저장값이라 부호를 뒤집는다.
function aimPoint(height: number, side: number) {
  return { X: -side * PV_ZONE_HALF, Y: 0.75 - height * 0.3 }
}

function pitcherBall(a: Anim, now: number, hand: Pt, batterX: number) {
  const t = now - a.start
  const w = windupOf(a)
  if (t < w) return null
  const hbp = a.pitch.type === 'hbp'
  const tgt = hbp ? { X: batterX + (batterX > 0 ? -0.15 : 0.15), Y: 1.0 } : aimPoint(pitchHeight(a.pitch), a.pitch.side ?? 0)
  const end = pv(tgt.X, tgt.Y)
  const radius = (scale: number) => Math.min(7, Math.max(2.4, 0.037 * 1.5 * scale))
  const shadowY = (dz: number) => pv(0, 0, dz).y
  // 친 공: 맞는 순간부터 위로 솟아 카메라 쪽(파울은 뒤쪽 위)으로
  const res = a.result
  if (res && a.resultStart !== null && now >= a.resultStart && isBatted(res)) {
    const k = (now - a.resultStart) / 450
    if (k >= 1) return null
    const away = batterX > 0 ? -1 : 1
    if (res.outcome === 'foul') {
      const at = { x: end.x + away * 60 * k, y: end.y - 120 * k }
      return { at, r: radius(pvScale(0)) * (1 - 0.4 * k), shadow: { x: at.x, y: shadowY(2 * k) }, opacity: 1 - k }
    }
    const low = res.outcome === 'groundout' || (isHit(res.outcome) && res.distance < 45)
    const at = { x: end.x + away * 40 * k, y: low ? end.y + 40 * k : end.y - 150 * k }
    return { at, r: 2.8 + 9 * k, shadow: { x: at.x, y: Math.min(VIEW_H, shadowY(0) + 30 * k) }, opacity: 1 - k * 0.5 }
  }
  const p = (t - w) / travelMs(a.pitch.speed)
  if (p > 1.3 || (hbp && p > 1.04)) return null
  if (p > 1) { // 미트 안으로
    const at = { x: end.x, y: end.y }
    return { at, r: radius(pvScale(0.55)), shadow: { x: at.x, y: shadowY(0.55) }, opacity: p > 1.15 ? 1 - (p - 1.15) / 0.15 : 1 }
  }
  const slot = slotOf(a.pitch)
  const sp = flightPos(a.pitch, p)
  const s0 = RELEASE[slot]
  const e0 = endPoint(a.pitch)
  const kx = Math.max(0, Math.min(1, (s0.x - sp.x) / (s0.x - e0.x)))
  const lineY = s0.y + (e0.y - s0.y) * p
  const devM = -(sp.y - lineY) * 0.022 // 위아래로 휘는 정도(m)
  // 원근: 가까운 손에서 멀리 있는 존까지 — 깊이가 커질수록 화면 위치가 목표점으로 빠르게 모인다
  const D0 = 4
  const d = D0 + (PV.dPlate - D0) * kx
  const g = (D0 / d - D0 / PV.dPlate) / (1 - D0 / PV.dPlate)
  const s = PV.f / d
  const rightHanded = hand.x > PV.cx ? 1 : -1 // 뒷모습에서 손이 화면 오른쪽이면 우투
  const brk = (BREAK_X[a.pitch.type] ?? 0) * kx ** 3 * rightHanded // 포수 시점과 좌우가 반대
  const at = {
    x: end.x + (hand.x - end.x) * g - brk * s * 0.5 * (1 - g),
    y: end.y + (hand.y - end.y) * g - devM * s * (1 - g),
  }
  return { at, r: radius(s), shadow: { x: at.x, y: shadowY(d - PV.dPlate) }, opacity: 1 }
}

function PitcherView({ anim, now, uid, pitcherGear, batterGear, palette, batsLeft, throwsLeft, logo, pitcherName, batterName, aim }: {
  anim: Anim | null; now: number; uid: string; pitcherGear?: Equip; batterGear?: Equip; palette: { bg: string; fg: string }
  batsLeft: boolean; throwsLeft: boolean; logo?: string | null; pitcherName: string; batterName: string
  aim?: { height: number; side: number } | null
}) {
  const pUni = teamOf(pitcherGear?.uniform)
  const pCap = teamOf(pitcherGear?.cap)
  const bCap = teamOf(batterGear?.cap)
  const bUni = teamOf(batterGear?.uniform)
  const bBat = teamOf(batterGear?.bat)
  // 우타자는 3루 쪽 = 투수 화면 오른쪽
  const batterX = batsLeft ? -0.95 : 0.95
  const toPlate = batsLeft ? 1 : -1 // 타자 기준 "홈플레이트 쪽"의 화면 방향
  const Sb = pvScale(0)
  const base = pv(batterX, 0)
  const B = (x: number, y: number): Pt => ({ x: base.x + toPlate * x * Sb, y: base.y - y * Sb })
  const bat = batPose(anim, now, PV_BAT)

  // 내 뒷모습(앞쪽, 크게) — 타자 반대편에 세워 타자·존을 가리지 않게
  const pose = frontPitcherPose(anim, now)
  const mx = throwsLeft ? -1 : 1
  const PS = 92
  const px0 = PV.cx + (batsLeft ? 170 : -170)
  const py0 = VIEW_H + 70 // 하체는 화면 아래로 잘린다
  const shrink = 1 - (pose.grow - 1) * 0.8 // 앞으로 내디디면 카메라에서 멀어져 살짝 작게
  const P = (p0: Pt): Pt => ({ x: px0 - p0.x * mx * PS * shrink, y: py0 - p0.y * PS * shrink - (pose.grow - 1) * 40 })
  const hand = P(pose.hand)
  const sleeve = (sh: Pt): Pt => ({ x: sh.x * 1.75, y: sh.y - 0.1 })
  const myTeam = pUni ?? plainTeam('#E5E7EB')
  const ball = anim ? pitcherBall(anim, now, P(RELEASE_F[slotOf(anim.pitch)]), batterX) : null

  // 포수 미트: 대기 중엔 겨냥한 곳, 공이 날아오면 실제 도착점으로 따라간다
  const aimed = aim ? aimPoint(aim.height, aim.side) : { X: 0, Y: 0.75 }
  let mitt = aimed
  if (anim && anim.pitch.type !== 'hbp') {
    const real = aimPoint(pitchHeight(anim.pitch), anim.pitch.side ?? 0)
    const k = ease(seg(now - anim.start - windupOf(anim), 0, travelMs(anim.pitch.speed)))
    mitt = { X: aimed.X + (real.X - aimed.X) * k, Y: aimed.Y + (real.Y - aimed.Y) * k }
  }
  const mittPt = pv(mitt.X, mitt.Y, 0.55)
  const showAim = !!aim && !anim

  const zoneTL = pv(-PV_ZONE_HALF, 1.05)
  const zoneBR = pv(PV_ZONE_HALF, 0.45)
  const plate = [pv(-0.215, 0, 0), pv(0.215, 0, 0), pv(0.215, 0, 0.215), pv(0, 0, 0.43), pv(-0.215, 0, 0.215)]
  const box = (sgn: number) => [pv(sgn * 0.45, 0, -0.9), pv(sgn * 1.65, 0, -0.9), pv(sgn * 1.65, 0, 0.9), pv(sgn * 0.45, 0, 0.9)]
  const poly = (pts: Pt[]) => pts.map(p => `${p.x},${p.y}`).join(' ')
  const wallY = pv(0, 0, 18).y

  // 포수(쪼그려 앉은 정면) · 심판
  const Sc = pvScale(0.8)
  const cb = pv(0, 0, 0.8)
  const C = (x: number, y: number): Pt => ({ x: cb.x + x * Sc, y: cb.y - y * Sc })
  const Su = pvScale(1.7)
  const ub = pv(batsLeft ? 0.25 : -0.25, 0, 1.7)
  const U = (x: number, y: number): Pt => ({ x: ub.x + x * Su, y: ub.y - y * Su })
  const catcherInk = pUni?.primary ?? '#1F2933'

  return (
    <g data-layer="pitcher-view" pointerEvents="none">
      <defs>
        <linearGradient id={`${uid}-pvsky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#DCE5EE" /><stop offset="1" stopColor="#EEF2F5" /></linearGradient>
        <pattern id={`${uid}-pvcrowd`} width="7" height="6" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r="1.2" fill="#F4F1EA" /><circle cx="5.2" cy="4.4" r="1.2" fill="#6F8094" /></pattern>
        <filter id={`${uid}-pvsoft`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      <rect x="0" y={VIEW_TOP} width={VIEW_W} height={VIEW_H - VIEW_TOP} fill={`url(#${uid}-pvsky)`} />
      {/* 백네트 뒤 관중석(흐리게) + 펜스 */}
      <g filter={`url(#${uid}-pvsoft)`} opacity="0.35">
        <rect x="0" y={VIEW_TOP} width={VIEW_W} height={wallY - 14 - VIEW_TOP} fill="#93A3B5" />
        <rect x="0" y={VIEW_TOP} width={VIEW_W} height={wallY - 14 - VIEW_TOP} fill={`url(#${uid}-pvcrowd)`} opacity="0.6" />
      </g>
      {logo && <image href={logo} x={PV.cx - 22} y={VIEW_TOP + 4} width="44" height="36" preserveAspectRatio="xMidYMid meet" opacity="0.22" />}
      <rect x="0" y={wallY - 14} width={VIEW_W} height="14" fill="#3F5F4C" opacity="0.75" />
      <rect x="0" y={wallY - 14} width={VIEW_W} height="2" fill="#2E4637" opacity="0.6" />
      {/* 홈 주변 흙 + 앞쪽 잔디 */}
      <rect x="0" y={wallY} width={VIEW_W} height={VIEW_H - wallY} fill="#DDC6A5" />
      <path d={`M0 ${VIEW_H} L0 ${pv(0, 0, -3.2).y + 6} Q${PV.cx} ${pv(0, 0, -4.4).y - 6} ${VIEW_W} ${pv(0, 0, -3.2).y + 6} L${VIEW_W} ${VIEW_H} Z`} fill="#C9DCBC" opacity="0.9" />
      {/* 파울라인 · 타석 · 홈플레이트 */}
      <g stroke="#FFFFFF" strokeWidth="1.4" opacity="0.85">
        <line x1={pv(0, 0, 0.43).x} y1={pv(0, 0, 0.43).y} x2={pv(3, 0, -2.6).x} y2={pv(3, 0, -2.6).y} />
        <line x1={pv(0, 0, 0.43).x} y1={pv(0, 0, 0.43).y} x2={pv(-3, 0, -2.6).x} y2={pv(-3, 0, -2.6).y} />
      </g>
      {[-1, 1].map(sg => <polygon key={sg} points={poly(box(sg))} fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="1" />)}
      <polygon points={poly(plate)} fill="#FFFFFF" stroke="#B8B2A7" strokeWidth="0.8" />

      {/* 심판 — 포수 뒤에서 몸을 숙이고 있다(흐리게) */}
      <g opacity="0.55">
        <polygon points={poly([U(-0.24, 1.2), U(0.24, 1.2), U(0.2, 0.62), U(-0.2, 0.62)])} fill="#3B4656" />
        <polyline points={poly([U(-0.14, 0.64), U(-0.3, 0.36), U(-0.24, 0)])} fill="none" stroke="#6B7684" strokeWidth={0.13 * Su} strokeLinecap="round" />
        <polyline points={poly([U(0.14, 0.64), U(0.3, 0.36), U(0.24, 0)])} fill="none" stroke="#6B7684" strokeWidth={0.13 * Su} strokeLinecap="round" />
        <circle cx={U(0, 1.33).x} cy={U(0, 1.33).y} r={0.12 * Su} fill="#3B4656" />
      </g>

      {/* 포수(쪼그려 앉음) — 가랑이 넓게, 가슴 보호대, 마스크, 미트 */}
      <g>
        <polyline points={poly([C(-0.12, 0.45), C(-0.4, 0.42), C(-0.3, 0)])} fill="none" stroke={catcherInk} strokeWidth={0.15 * Sc} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={poly([C(0.12, 0.45), C(0.4, 0.42), C(0.3, 0)])} fill="none" stroke={catcherInk} strokeWidth={0.15 * Sc} strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={poly([C(-0.22, 0.98), C(0.22, 0.98), C(0.17, 0.42), C(-0.17, 0.42)])} fill="#2B3440" stroke={catcherInk} strokeWidth="1" />
        <circle cx={C(0, 1.12).x} cy={C(0, 1.12).y} r={0.13 * Sc} fill="#2B3440" />
        <g stroke="#9AA5B1" strokeWidth="0.7">
          {[-0.05, 0, 0.05].map(o => <line key={o} x1={C(o, 1.05).x} y1={C(o, 1.05).y} x2={C(o, 1.19).x} y2={C(o, 1.19).y} />)}
        </g>
        <FrontCapShape cx={C(0, 1.2).x} cy={C(0, 1.2).y} r={0.11 * Sc} team={pCap} fallback="#1F2933" />
        <line x1={C(0.2, 0.92).x} y1={C(0.2, 0.92).y} x2={mittPt.x} y2={mittPt.y} stroke="#2B3440" strokeWidth={0.09 * Sc} strokeLinecap="round" />
        <circle cx={mittPt.x} cy={mittPt.y} r={0.15 * Sc} fill="#8B5A2B" stroke="#5C3A1A" strokeWidth="1" />
      </g>

      {/* 스트라이크존 + 겨냥한 곳 */}
      <rect x={zoneTL.x} y={zoneTL.y} width={zoneBR.x - zoneTL.x} height={zoneBR.y - zoneTL.y} fill="#4C7FE0" fillOpacity="0.1" stroke="#4C7FE0" strokeOpacity="0.85" strokeDasharray="3 2" strokeWidth="1.2" />
      {showAim && (() => {
        const q = pv(aimed.X, aimed.Y)
        return (
          <g data-aim>
            <circle cx={q.x} cy={q.y} r="6" fill="none" stroke="#DC2626" strokeWidth="1.6" />
            <line x1={q.x - 9} y1={q.y} x2={q.x + 9} y2={q.y} stroke="#DC2626" strokeWidth="1" />
            <line x1={q.x} y1={q.y - 9} x2={q.x} y2={q.y + 9} stroke="#DC2626" strokeWidth="1" />
          </g>
        )
      })()}

      {/* 타자(정면) */}
      {(() => {
        const h = B(bat.hands.x, bat.hands.y), tp = B(bat.tip.x, bat.tip.y)
        return (
          <g>
            <ellipse cx={base.x} cy={base.y + 1} rx={0.42 * Sb} ry="4" fill="#2F3A33" opacity="0.18" />
            <BoxyPants M={B} team={bUni} />
            {/* 상의: 유니폼이 없으면 회색 연습복(같은 모양) — 반팔 소매·목선·단추선·벨트 */}
            <JerseyShape a={B(0, 1.5)} b={B(0, 0.93)} wTop={0.5 * Sb} wBottom={0.44 * Sb} team={bUni ?? plainTeam(palette.bg)} showWordmark={!!bUni} />
            {/* 팔: 소매 끝에서 시작 — 뒷팔은 팔꿈치를 바깥으로, 앞팔은 가슴 앞을 지나 손으로 */}
            <polyline points={poly([B(-0.34, 1.34), B(-0.47, 1.3), h])} fill="none" stroke="#374151" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={poly([B(0.34, 1.34), B(0.02, 1.08), h])} fill="none" stroke="#374151" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <BatShape hands={h} angleRad={Math.atan2(tp.y - h.y, tp.x - h.x)} length={Math.hypot(tp.x - h.x, tp.y - h.y)} team={bBat} width={5} />
            <circle cx={h.x} cy={h.y} r="2.8" fill="#374151" />
            <circle cx={B(0, 1.66).x} cy={B(0, 1.66).y} r={0.12 * Sb} fill="#F1D3B6" stroke="#374151" strokeWidth="1" />
            <FrontCapShape cx={B(0, 1.72).x} cy={B(0, 1.72).y} r={0.15 * Sb} team={bCap} fallback="#1F4E8C" />
          </g>
        )
      })()}

      {/* 내 뒷모습(투수) — 등에 내 이름·번호 */}
      {/* 팔·글러브·공 — 뒷모습이라 몸 앞에 있는 부분은 등에 가려지게 몸통보다 먼저 그린다 */}
      <g stroke="#374151" strokeLinecap="round" fill="none" strokeWidth="4.6">
        <line x1={P(sleeve(pose.shL)).x} y1={P(sleeve(pose.shL)).y} x2={hand.x} y2={hand.y} />
        <line x1={P(sleeve(pose.shR)).x} y1={P(sleeve(pose.shR)).y} x2={P(pose.glove).x} y2={P(pose.glove).y} />
      </g>
      <circle cx={P(pose.glove).x} cy={P(pose.glove).y} r="5" fill="#8B5A2B" />
      {pose.holding && <circle cx={hand.x} cy={hand.y} r="3.2" fill="#FFFFFF" stroke="#C0392B" strokeWidth="0.9" />}
      <PantsLeg hip={P(pose.hip)} knee={P(pose.kneeL)} foot={P(pose.footL)} width={0.17 * PS} team={myTeam} />
      <PantsLeg hip={P(pose.hip)} knee={P(pose.kneeR)} foot={P(pose.footR)} width={0.17 * PS} team={myTeam} />
      {(() => { const n0 = lerp(P(pose.shL), P(pose.shR), 0.5), n1 = P(pose.head); return <line x1={n0.x} y1={n0.y + 2} x2={n1.x} y2={n1.y} stroke="#E8C4A2" strokeWidth={0.13 * PS * shrink} strokeLinecap="round" /> })()}
      <BackJerseyFull a={lerp(P(pose.shL), P(pose.shR), 0.5)} b={P(pose.hip)} wTop={0.5 * PS * shrink} wBottom={0.42 * PS * shrink}
        team={myTeam} name={pitcherName} number={backNumber(pitcherName)} />
      <BackHelmetShape cx={P(pose.head).x} cy={P(pose.head).y} r={0.15 * PS * shrink} team={pCap} fallback="#B91C1C" />

      {/* 이름표 */}
      <text x={base.x} y={VIEW_H - 4} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3A4249" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="2.5" strokeLinejoin="round">{batterName} <tspan fontWeight="500" fill="#7A8491">{batsLeft ? '좌타' : '우타'}</tspan></text>

      {/* 공 */}
      {ball && (
        <g opacity={ball.opacity}>
          <ellipse cx={ball.shadow.x} cy={ball.shadow.y} rx={ball.r * 1.1} ry={ball.r * 0.3} fill="#2F3A33" opacity="0.2" />
          <circle cx={ball.at.x} cy={ball.at.y} r={ball.r} fill="#FFFFFF" stroke="#C0392B" strokeWidth={Math.max(0.7, ball.r * 0.14)} data-ball />
        </g>
      )}
    </g>
  )
}
