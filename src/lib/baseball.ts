// 비거리 야구 — 졸라맨 투수가 랜덤 구종/구속/투구폼으로 던지고, 1이닝(3아웃)짜리 게임을 쳐서 하루 라운드로 순위를 가린다.
// 화면/DB와 무관한 순수 로직만 여기 둔다(판정·볼카운트·주자·득점·순위). 저장은 baseball_plays(게임 1판 = 1행),
// 투구 이벤트(swings)를 순서대로 쌓고 타석 진행은 simulateGame()으로 매번 재생해서 계산한다.

export const OUTS_PER_INNING = 3  // 3아웃이면 이닝(반 이닝) 종료 — 사구·볼넷·안타는 계속 이어진다
export const STRIKES_FOR_OUT = 2   // 1S까지 버티고 2번째 스트라이크면 삼진
export const BALLS_FOR_WALK = 2    // 1B까지 버티고 2번째 볼이면 볼넷
export const MAX_GAMES_PER_DAY = 5 // 칭찬으로 얻는 게임 수 상한 (관리자 추가분은 별도)
export const FENCE_M = 125         // 이 이상이면 홈런
export const DOUBLE_M = 85         // 이 이상이면 2루타
export const FIELD_M = 160         // 필드 끝
export const BASEBALL_ADMIN_EMAIL = 'ji.kim@egnis.kr' // 팀원별 추가 게임 수를 줄 수 있는 유일한 계정 (DB 정책과 동일)

export type PitchType =
  | 'heater' | 'fastball' | 'twoseam' | 'slider' | 'changeup' | 'curve' | 'knuckle'
  | 'rising' | 'sidearm' | 'splitter' | 'cutter' | 'slowcurve' | 'eephus' | 'ball' | 'hbp'

// 투구폼(릴리스 높이) — 오버핸드/스리쿼터/사이드암/언더핸드. 팔 각도로 구종을 짐작하는 힌트
export type Slot = 'high' | 'mid' | 'side' | 'low'

// window: 타이밍 판정 폭 배율 — 변화가 심한 공일수록 좁다. weight: 등장 비율.
export const PITCH_TYPES: Record<PitchType, { label: string; min: number; max: number; window: number; slot: Slot; weight: number }> = {
  heater:    { label: '강속구',          min: 152, max: 165, window: 0.9,  slot: 'high', weight: 1 },
  fastball:  { label: '직구',            min: 140, max: 151, window: 1.0,  slot: 'mid',  weight: 1.1 },
  twoseam:   { label: '투심',            min: 138, max: 148, window: 0.9,  slot: 'mid',  weight: 0.9 },
  cutter:    { label: '커터',            min: 138, max: 148, window: 0.9,  slot: 'mid',  weight: 0.9 },
  splitter:  { label: '스플리터',        min: 135, max: 145, window: 0.8,  slot: 'high', weight: 0.9 },
  slider:    { label: '슬라이더',        min: 125, max: 140, window: 0.9,  slot: 'mid',  weight: 1 },
  changeup:  { label: '체인지업',        min: 118, max: 132, window: 0.85, slot: 'mid',  weight: 1 },
  curve:     { label: '커브',            min: 105, max: 120, window: 0.85, slot: 'high', weight: 0.9 },
  slowcurve: { label: '슬로 커브',       min: 85,  max: 100, window: 0.8,  slot: 'high', weight: 0.6 },
  eephus:    { label: '이퓨스',          min: 70,  max: 85,  window: 0.8,  slot: 'high', weight: 0.4 },
  knuckle:   { label: '너클볼',          min: 100, max: 115, window: 0.7,  slot: 'mid',  weight: 0.7 },
  rising:    { label: '라이징(언더핸드)', min: 125, max: 138, window: 0.85, slot: 'low',  weight: 0.8 },
  sidearm:   { label: '사이드암',        min: 130, max: 142, window: 0.9,  slot: 'side', weight: 0.8 },
  ball:      { label: '빠지는 볼',       min: 100, max: 155, window: 1.0,  slot: 'mid',  weight: 3.0 },
  hbp:       { label: '몸에 맞는 공',    min: 120, max: 145, window: 1.0,  slot: 'mid',  weight: 0.45 },
}

// alt: 빠지는 볼이 위(-1)/아래(+1) 중 어디로 빠지는지. slot: 투구폼(빠지는 볼·사구는 아무 폼으로나 던짐).
// windup: 투구 모션 길이(ms) — 매번 달라서 박자로 외워 칠 수 없다.
// height: 도착 높이(-1 = 존 맨 위, 0 = 한가운데, +1 = 존 맨 아래, |h| > 1.1 = 존 밖). 예전 기록엔 없을 수 있다.
// side: 도착 좌우(포수 시점 기준 -1 = 존 왼쪽 끝(3루 쪽), +1 = 오른쪽 끝, |s| > 1.1 = 존 밖). 대결 투수가 코스를 고를 때만 있다(없으면 한가운데).
export type Pitch = { id: string; type: PitchType; speed: number; alt: number; slot: Slot; windup: number; height?: number; side?: number }

export const ZONE_EDGE = 1.1 // |height|가 이보다 크면 존 밖(볼)

export function pitchHeight(p: Pick<Pitch, 'type' | 'alt' | 'height'>) {
  if (typeof p.height === 'number') return p.height
  return p.type === 'ball' ? p.alt * 1.5 : 0
}

const SLOTS: Slot[] = ['high', 'mid', 'side', 'low']

// groundout/popout: 높거나 낮은 공을 쳐서 빗맞은 땅볼·뜬공 아웃
// flyout: 잘 맞았지만 외야에서 잡힌 뜬공(distance = 잡힌 거리)
export type Outcome = 'perfect' | 'good' | 'fair' | 'foul' | 'miss' | 'looking' | 'ball' | 'hbp' | 'groundout' | 'popout' | 'flyout'

export type Swing = {
  type: PitchType
  speed: number
  outcome: Outcome
  distance: number
  offset: number | null // 스윙 시각 - 공 도착 시각(ms). +면 늦음, -면 빠름, null = 스윙 안 함
  pid?: string          // 대결에서만: 어떤 투구의 결과인지 (관전자·투수 화면이 애니메이션과 짝지을 때 사용)
  dp?: boolean          // 땅볼 병살 — 판정 순간(1루 주자 + 2아웃 미만)에 정해져 저장된다. 예전 기록엔 없다
  read?: SwingRead      // 대결에서만: 타자가 투구 전에 노린 구종 계열·높이와 적중 여부(연출·기록용). 안 노렸거나 예전 기록엔 없다
}

export type Play = {
  id: string
  member_id: string
  play_date: string
  game_no: number
  swings: Swing[]
  homeruns: number
  hits: number
  runs: number
  lob: number
  best_distance: number
  finished: boolean
  created_at: string
  finished_at: string | null
}

// 하루 게임 수 = 기본 1 + 누적 칭찬 4개당 1 (최대 5) + 관리자 추가분
export function dailyAllowance(praiseCount: number, bonus = 0) {
  return Math.min(MAX_GAMES_PER_DAY, 1 + Math.floor(Math.max(0, praiseCount) / 4)) + Math.max(0, bonus)
}

export function randomPitch(rand: () => number = Math.random): Pitch {
  const entries = Object.entries(PITCH_TYPES) as [PitchType, (typeof PITCH_TYPES)[PitchType]][]
  const total = entries.reduce((s, [, v]) => s + v.weight, 0)
  let r = rand() * total
  let type: PitchType = 'fastball'
  for (const [k, v] of entries) {
    if ((r -= v.weight) < 0) { type = k; break }
  }
  const { min, max } = PITCH_TYPES[type]
  const speed = Math.round(min + rand() * (max - min))
  const alt = rand() < 0.5 ? -1 : 1
  const slot = type === 'ball' || type === 'hbp' ? SLOTS[Math.floor(rand() * SLOTS.length)] : PITCH_TYPES[type].slot
  const windup = Math.round(600 + rand() * 900)
  // 도착 높이: 빠지는 볼은 존 밖(1.25~1.7), 나머지는 존 안 어디든(-1~1)
  const height = type === 'ball' ? alt * (1.25 + rand() * 0.45) : rand() * 2 - 1
  const id = `${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`
  return { id, type, speed, alt, slot, windup, height }
}

// 실제 18.44m 비행시간(150km/h에 0.44초)의 1.2배 (150km/h ≈ 0.53초, 100km/h ≈ 0.80초, 75km/h ≈ 1.06초).
export function travelMs(speed: number) {
  return Math.round((18.44 / (speed / 3.6)) * 1000 * 1.2)
}

// 타구 질별 안타 확률 — 가상 타자 시뮬레이션으로 "잘 치는 사람 ≈ 3할"이 되게 맞춘 값 (scratchpad sim.cjs 참고)
export const HIT_RATE = { perfect: 0.5, good: 0.3, fair: 0.14 }

// ── 구종 3계열 (대결 노림수용) — 원래 구종(type)은 그대로, 계열은 여기서만 파생 ──
// 빠른 = 구속 125km/h 이상·변화 작음 / 휘는 = 큰 아치·옆 휨 / 떨어지는 = 느린 오프스피드·막판 낙차(너클은 흔들리며 떨어지는 공)
export type PitchCategory = 'FAST' | 'BREAK' | 'DROP'
export const PITCH_CATEGORY: Record<PitchType, PitchCategory | null> = {
  heater: 'FAST', fastball: 'FAST', twoseam: 'FAST', cutter: 'FAST', sidearm: 'FAST', rising: 'FAST',
  slider: 'BREAK', curve: 'BREAK', slowcurve: 'BREAK', eephus: 'BREAK',
  splitter: 'DROP', changeup: 'DROP', knuckle: 'DROP',
  ball: null, hbp: null, // 개인전 전용·제구 실패로만 나오는 공 — 계열 없음
}
export const CATEGORY_LABEL: Record<PitchCategory, string> = { FAST: '⚡ 빠른', BREAK: '↪ 휘는', DROP: '⤵ 떨어지는' }
export function pitchCategory(type: PitchType): PitchCategory | null {
  return PITCH_CATEGORY[type]
}

// 타자용 높이 3단 — 노림 판정 전용(스트라이크존 판정과 무관). height는 -1 = 존 맨 위, +1 = 맨 아래.
// 대결 투수 코스: 높은 볼 -1.5 · 높게 -0.8 → 높음 / 가운데 0 → 가운데 / 낮게 0.8 · 낮은 볼 1.5 → 낮음. 경계 ±0.4(가운데와 높게/낮게의 중간)
export type HeightBand = 'HIGH' | 'MID' | 'LOW'
export const HEIGHT_BAND_EDGE = 0.4
export const HEIGHT_LABEL: Record<HeightBand, string> = { HIGH: '높음', MID: '가운데', LOW: '낮음' }
export function heightBand(height: number): HeightBand {
  return height < -HEIGHT_BAND_EDGE ? 'HIGH' : height > HEIGHT_BAND_EDGE ? 'LOW' : 'MID'
}

// ── 타격 보정 (대결 전용) — 정타(PERFECT/GOOD/FAIR)가 난 뒤에만 결과를 조금 바꾼다. 타이밍 판정 자체는 바꾸지 않는다 ──
export type ContactQuality = 'perfect' | 'good' | 'fair'
export type ReadGuess = { category: PitchCategory | null; height: HeightBand | null } // null = 안 노림
// 저장용(Swing.read) — 무엇을 노렸고 맞았는지. 결과(outcome)는 이미 저장되므로 재생 때 다시 판정하지 않는다
export type SwingRead = { pitchCategory: PitchCategory | null; height: HeightBand | null; pitchHit: boolean; heightHit: boolean }

// 노림 보정 상수 — 실데이터 보고 조정.
// 노린 것이 전부 빗나간 패널티: 처음 제안 −1%p·×0.98로는 "아무거나 찍기"가 안 노림보다 득점 +10~13% 유리해져서(시뮬)
// 설계안 값 −3%p·×0.96으로 시작(찍기 +4% 수준). 제대로 읽었을 때 이득(45% 읽기 +16%·60% +31%)은 유지된다.
export const READ_BONUS = {
  categoryHitAdd: 0.02,  // 구종 적중: 안타 확률 +2%p
  categoryDist: 1.015,   //            비거리 ×1.015
  heightEdgeMul: 0.92,   // 높이 적중: 구석 감점(edge) ×0.92
  bothHitAdd: 0.02,      // 둘 다 적중: 안타 확률 추가 +2%p
  perfectBothDist: 1.05, //            PERFECT일 때만 비거리 ×1.05 추가
  missHitAdd: -0.03,     // 노린 것이 전부 빗나감: 안타 확률 −3%p
  missDist: 0.96,        //                        비거리 ×0.96
}

// 타자 유형 보정. timing은 GOOD·FAIR·파울 경계에만 곱한다 — PERFECT 폭(±8ms)은 모두 같고, 파울/헛스윙이 GOOD 이상으로 바뀌지 않는다.
export type BatterProfile = {
  timing: number      // GOOD·FAIR·파울 경계 배율
  weak: number        // 구석 빗맞음 확률 배율
  hitAdd: number      // GOOD·FAIR 인플레이 안타 확률 가산
  perfectDist: number // PERFECT 비거리 배율
  goodDist: number    // GOOD 비거리 배율
}
export const NEUTRAL_PROFILE: BatterProfile = { timing: 1, weak: 1, hitAdd: 0, perfectDist: 1, goodDist: 1 }

export type SwingMods = { profile?: BatterProfile; read?: ReadGuess | null }

const hasGuess = (g: ReadGuess | null | undefined): g is ReadGuess => !!g && (g.category !== null || g.height !== null)

// 노림 적중 여부 — 실제 공(구종 계열·도착 높이)과 비교
export function evaluateRead(guess: ReadGuess, pitch: Pick<Pitch, 'type' | 'alt' | 'height'>): SwingRead {
  return {
    pitchCategory: guess.category,
    height: guess.height,
    pitchHit: guess.category !== null && pitchCategory(pitch.type) === guess.category,
    heightHit: guess.height !== null && heightBand(pitchHeight({ type: pitch.type, alt: pitch.alt ?? 1, height: pitch.height })) === guess.height,
  }
}

type ContactAdjust = { edgeMul: number; weakMul: number; hitAdd: number; distMul: number }
const NO_ADJUST: ContactAdjust = { edgeMul: 1, weakMul: 1, hitAdd: 0, distMul: 1 }

// 2단계: 노림 보정 (정타 이후에만 호출된다)
export function readAdjust(read: SwingRead | null, quality: ContactQuality): ContactAdjust {
  if (!read || (read.pitchCategory === null && read.height === null)) return NO_ADJUST
  const both = read.pitchHit && read.heightHit
  const missed = !read.pitchHit && !read.heightHit
  if (missed) return { edgeMul: 1, weakMul: 1, hitAdd: READ_BONUS.missHitAdd, distMul: READ_BONUS.missDist }
  return {
    edgeMul: read.heightHit ? READ_BONUS.heightEdgeMul : 1,
    weakMul: 1,
    hitAdd: (read.pitchHit ? READ_BONUS.categoryHitAdd : 0) + (both ? READ_BONUS.bothHitAdd : 0),
    distMul: (read.pitchHit ? READ_BONUS.categoryDist : 1) * (both && quality === 'perfect' ? READ_BONUS.perfectBothDist : 1),
  }
}

// 3단계: 타자 능력치 보정 (정타 이후)
export function profileAdjust(p: BatterProfile, quality: ContactQuality): ContactAdjust {
  return {
    edgeMul: 1,
    weakMul: p.weak,
    hitAdd: quality === 'perfect' ? 0 : p.hitAdd,
    distMul: quality === 'perfect' ? p.perfectDist : quality === 'good' ? p.goodDist : 1,
  }
}

// 스윙 타이밍 오차(ms) + 공 높이 → 결과. offset이 null이면 스윙하지 않음.
// 존 밖 공: 참으면 '볼', 휘두르면 타이밍이 맞아도 대부분 빗맞은 아웃(낮으면 땅볼·높으면 뜬공)이나 파울, 안 맞으면 헛스윙.
// 존 가장자리 공: 타이밍이 맞아도 가장자리일수록 빗맞은 아웃 확률 ↑, 비거리 ↓. 몸에 맞는 공: 스윙과 무관하게 사구.
// 판정 폭: 완벽 ±8ms / 정타 ±18 / 빗맞음 ±35 / 파울 ±60 (구종별 window 배율로 더 좁아짐).
// 구속이 빠를수록 맞았을 때 더 멀리 간다(75km/h ×0.94 ~ 165km/h ×1.156).
// 순서: ① Space 타이밍 → 정타 여부·질 확정 ② (정타일 때만) 노림 보정 ③ 타자 능력치 보정 → 결과. mods가 없으면(개인전) 예전과 완전히 같다.
export function judgeSwing(offset: number | null, pitch: Pick<Pitch, 'type' | 'speed'> & Partial<Pick<Pitch, 'alt' | 'height' | 'side'>>, rand: () => number = Math.random, mods: SwingMods = {}): { outcome: Outcome; distance: number } {
  if (pitch.type === 'hbp') return { outcome: 'hbp', distance: 0 }
  const h = pitchHeight({ type: pitch.type, alt: pitch.alt ?? 1, height: pitch.height })
  const sd = pitch.side ?? 0
  const outZone = pitch.type === 'ball' || Math.abs(h) > ZONE_EDGE || Math.abs(sd) > ZONE_EDGE
  const weakOut: Outcome = h >= 0 ? 'groundout' : 'popout'
  if (offset === null) return { outcome: outZone ? 'ball' : 'looking', distance: 0 }
  const err = Math.abs(offset) / PITCH_TYPES[pitch.type].window
  // ① 타이밍 — 존 밖 공은 노림·능력치와 무관
  if (outZone) {
    if (err <= 35) return { outcome: rand() < 0.7 ? weakOut : 'foul', distance: 0 }
    return { outcome: 'miss', distance: 0 }
  }
  const profile = mods.profile ?? NEUTRAL_PROFILE
  const tb = profile.timing // PERFECT(8)는 곱하지 않는다
  let base: number
  let outcome: ContactQuality
  if (err <= 8) { outcome = 'perfect'; base = 115 + rand() * 35 }
  else if (err <= 18 * tb) { outcome = 'good'; base = 80 + rand() * 35 }
  else if (err <= 35 * tb) { outcome = 'fair'; base = 20 + rand() * 60 }
  else if (err <= 60 * tb) return { outcome: 'foul', distance: 0 }
  else return { outcome: 'miss', distance: 0 }
  // ② 노림 ③ 능력치 — 정타일 때만
  const r = readAdjust(hasGuess(mods.read) ? evaluateRead(mods.read, { type: pitch.type, alt: pitch.alt ?? 1, height: pitch.height }) : null, outcome)
  const pr = profileAdjust(profile, outcome)
  const edge = Math.min(1, Math.max(Math.abs(h), Math.abs(sd))) * r.edgeMul * pr.edgeMul // 위아래·좌우 중 더 구석인 쪽
  if (edge > 0.5 && rand() < (edge - 0.5) * 1.2 * r.weakMul * pr.weakMul) return { outcome: weakOut, distance: 0 } // 가장자리 → 빗맞음
  const speedBonus = 1 + ((pitch.speed - 100) / 50) * 0.12
  const distance = Math.round(base * speedBonus * (1 - 0.3 * edge) * r.distMul * pr.distMul * 10) / 10
  // 인플레이 타구도 수비에 잡힌다(실제 야구처럼) — 잘 맞을수록 안타 확률이 높고, 잡히면 강한 타구는 외야 뜬공·약한 타구는 땅볼
  const hitRate = Math.max(0, Math.min(1, HIT_RATE[outcome] + r.hitAdd + pr.hitAdd))
  if (rand() >= hitRate) {
    if (outcome === 'fair') return { outcome: 'groundout', distance: 0 }
    return { outcome: 'flyout', distance: Math.round(Math.min(distance, FENCE_M - 2 - rand() * 12) * 10) / 10 }
  }
  return { outcome, distance }
}

// 저장된 스윙의 타이밍이 PERFECT 구간이었는지(연출용) — PERFECT 폭은 타자 유형과 무관하게 같다. 저장 offset은 반올림값
export function isPerfectTiming(s: Pick<Swing, 'type' | 'offset'>) {
  return s.offset !== null && Math.abs(s.offset) / PITCH_TYPES[s.type].window <= 8
}

// 노림 적중 문구(결과가 나온 뒤 짧게) — 둘 다 맞고 PERFECT 타이밍으로 쳐냈을 때만 강한 문구. 다 빗나가면 아무것도 안 띄운다
export function readFeedback(s: Pick<Swing, 'read' | 'type' | 'offset' | 'outcome'>): { text: string; strong: boolean } | null {
  const r = s.read
  if (!r) return null
  if (r.pitchHit && r.heightHit) {
    const crushed = isPerfectTiming(s) && (isHit(s.outcome) || s.outcome === 'flyout')
    return crushed ? { text: '완벽히 노렸다!', strong: true } : { text: '구종·코스 적중', strong: false }
  }
  if (r.pitchHit) return { text: '구종 적중', strong: false }
  if (r.heightHit) return { text: '코스 적중', strong: false }
  return null
}

export function isHit(outcome: Outcome) {
  return outcome === 'perfect' || outcome === 'good' || outcome === 'fair'
}

export function outcomeLabel(s: Pick<Swing, 'outcome' | 'distance'>) {
  switch (s.outcome) {
    case 'foul': return '파울'
    case 'miss': return '헛스윙'
    case 'looking': return '루킹 스트라이크'
    case 'ball': return '볼'
    case 'hbp': return '몸에 맞는 공!'
    case 'groundout': return '땅볼 아웃'
    case 'popout': return '뜬공 아웃'
    case 'flyout': return '잡혔다! 뜬공 아웃'
    default:
      if (s.distance >= FENCE_M) return '홈런!'
      if (s.distance >= DOUBLE_M) return '2루타'
      return '안타'
  }
}

export type PaResult = { kind: 'K' | 'GO' | 'DP' | 'FO' | 'BB' | 'HBP' | '1B' | '2B' | 'HR'; rbi: number; distance: number }

export function isOut(kind: PaResult['kind']) {
  return kind === 'K' || kind === 'GO' || kind === 'DP' || kind === 'FO'
}

export type GameState = {
  pa: number            // 끝난 타석 수
  outs: number
  strikes: number
  balls: number
  bases: [boolean, boolean, boolean] // 1·2·3루
  runs: number
  homeruns: number
  hits: number          // 홈런 제외 안타
  best: number
  results: PaResult[]
  finished: boolean
  lob: number           // 경기 종료 시 남은 주자
}

// 병살: 땅볼일 때 1루 주자가 있고 2아웃 전이면 이 확률로 병살(타자 + 1루 주자 아웃)
export const DP_RATE = 0.5

// 판정 직후(타석 전 상태 before 기준) 이 땅볼을 병살로 처리할지 — 결과(Swing.dp)로 저장해 다시 계산해도 같게
export function rollDoublePlay(before: Pick<GameState, 'bases' | 'outs'>, outcome: Outcome, rand: () => number = Math.random) {
  return outcome === 'groundout' && before.bases[0] && before.outs < OUTS_PER_INNING - 1 && rand() < DP_RATE
}

// ── 주자 이동(진루) — 실제 게임(simulateGame)과 중계 화면(broadcast.tsx placeRunners)이 이 한 곳만 쓴다 ──
export type Bases = [boolean, boolean, boolean]
export type BaseIdx = 0 | 1 | 2 // 1·2·3루
// from: 'batter' = 타석의 타자. to: 'home' = 홈인(득점), 'out' = 아웃. 제자리 주자는 from === to.
export type RunnerMove = { from: BaseIdx | 'batter'; to: BaseIdx | 'home' | 'out' }
export type BaseTransition = { before: Bases; after: Bases; scored: number; moves: RunnerMove[] } // moves: 1·2·3루 주자 순 → 타자

// 타석 결과 하나로 주자가 어디서 어디로 가는지. 규칙:
// 홈런 = 전원 홈인 / 안타 = 모든 주자 n루씩(1B 1칸·2B 2칸) / 볼넷·사구 = 밀어내기 / 병살 = 1루 주자·타자 아웃 / 그 외 아웃 = 주자 그대로
export function baseTransition(before: Bases, kind: PaResult['kind']): BaseTransition {
  const runnerTo: (BaseIdx | 'home' | 'out')[] = [0, 1, 2]
  let batterTo: RunnerMove['to'] = 'out'
  const step = (i: number, n: number): BaseIdx | 'home' => (i + n >= 3 ? 'home' : ((i + n) as BaseIdx))
  switch (kind) {
    case 'HR':
      for (let i = 0; i < 3; i++) runnerTo[i] = 'home'
      batterTo = 'home'
      break
    case '1B':
    case '2B': {
      const n = kind === '2B' ? 2 : 1
      for (let i = 0; i < 3; i++) runnerTo[i] = step(i, n)
      batterTo = (n - 1) as BaseIdx
      break
    }
    case 'BB':
    case 'HBP': // 밀어내기: 1루부터 꽉 찬 주자만 한 칸씩
      if (before[0]) {
        runnerTo[0] = 1
        if (before[1]) {
          runnerTo[1] = 2
          if (before[2]) runnerTo[2] = 'home'
        }
      }
      batterTo = 0
      break
    case 'DP':
      runnerTo[0] = 'out'
      break
  }
  const moves: RunnerMove[] = []
  const after: Bases = [false, false, false]
  let scored = 0
  for (let i = 0; i < 3; i++) {
    if (!before[i]) continue
    moves.push({ from: i as BaseIdx, to: runnerTo[i] })
  }
  moves.push({ from: 'batter', to: batterTo })
  for (const m of moves) {
    if (m.to === 'home') scored += 1
    else if (m.to !== 'out') after[m.to] = true
  }
  return { before: [...before] as Bases, after, scored, moves }
}

// 이 투구 이벤트로 타석이 끝나면 그 결과와 주자 이동, 아니면(카운트만 바뀜) null. 판정 시점 상태(st) 기준.
export function paOutcome(st: Pick<GameState, 'strikes' | 'balls' | 'bases' | 'outs'>, e: Pick<Swing, 'outcome' | 'distance' | 'dp'>): { kind: PaResult['kind']; transition: BaseTransition } | null {
  let kind: PaResult['kind'] | null = null
  if (isHit(e.outcome)) kind = e.distance >= FENCE_M ? 'HR' : e.distance >= DOUBLE_M ? '2B' : '1B'
  else {
    switch (e.outcome) {
      case 'looking':
      case 'miss': if (st.strikes + 1 >= STRIKES_FOR_OUT) kind = 'K'; break
      case 'groundout': kind = e.dp && st.bases[0] && st.outs < OUTS_PER_INNING - 1 ? 'DP' : 'GO'; break // 병살 조건은 판정 때와 같게 다시 확인
      case 'popout':
      case 'flyout': kind = 'FO'; break
      case 'ball': if (st.balls + 1 >= BALLS_FOR_WALK) kind = 'BB'; break
      case 'hbp': kind = 'HBP'; break
    }
  }
  return kind ? { kind, transition: baseTransition(st.bases, kind) } : null
}

// 투구 이벤트를 처음부터 재생해 현재 타석·카운트·주자·득점을 계산한다. 3아웃이면 이닝 종료, 이후 이벤트는 무시.
export function simulateGame(events: Swing[]): GameState {
  const st: GameState = { pa: 0, outs: 0, strikes: 0, balls: 0, bases: [false, false, false], runs: 0, homeruns: 0, hits: 0, best: 0, results: [], finished: false, lob: 0 }
  for (const e of events) {
    if (st.finished) break
    if (isHit(e.outcome) && e.distance > st.best) st.best = e.distance
    const pa = paOutcome(st, e)
    if (!pa) { // 타석 계속 — 카운트만
      if (e.outcome === 'looking' || e.outcome === 'miss') st.strikes += 1
      else if (e.outcome === 'foul' && st.strikes < STRIKES_FOR_OUT - 1) st.strikes += 1 // 1S에서 파울은 카운트 유지
      else if (e.outcome === 'ball') st.balls += 1
      continue
    }
    const { kind, transition } = pa
    st.bases = transition.after
    st.runs += transition.scored
    st.outs += transition.moves.filter(m => m.from !== 'batter' && m.to === 'out').length // 병살로 잡힌 주자
    if (kind === 'HR') st.homeruns += 1
    else if (kind === '1B' || kind === '2B') st.hits += 1
    st.results.push({ kind, rbi: transition.scored, distance: isHit(e.outcome) ? e.distance : 0 })
    st.pa += 1
    st.strikes = 0
    st.balls = 0
    if (isOut(kind)) st.outs += 1
    if (st.outs >= OUTS_PER_INNING) st.finished = true
  }
  st.lob = st.finished ? st.bases.filter(Boolean).length : 0
  return st
}

// ── 판정 pipeline — 개인전·대결(타자 판정·투수 대리 판정)이 모두 이것 하나로 결과 이벤트를 만든다 ──
// 화면·DB·시계를 모른다(offset은 호출부가 잰 값). 랜덤 순서: judgeSwing → rollDoublePlay (예전과 같음).
export type PitchResolution = { swing: Swing; before: GameState; after: GameState; paEnded: string | null }

// mods(대결 전용): 타자 능력치·노림. 없으면 개인전과 같은 판정. 노림을 하나라도 골랐으면 swing.read에 적중 여부를 남긴다.
export function resolvePitch(
  events: Swing[],
  pitch: Pick<Pitch, 'type' | 'speed'> & Partial<Pick<Pitch, 'alt' | 'height' | 'side'>>,
  offset: number | null,
  opts: { pid?: string; rand?: () => number; mods?: SwingMods } = {},
): PitchResolution {
  const rand = opts.rand ?? Math.random
  const mods = opts.mods ?? {}
  const { outcome, distance } = judgeSwing(offset, pitch, rand, mods)
  const before = simulateGame(events)
  const swing: Swing = { type: pitch.type, speed: pitch.speed, outcome, distance, offset: offset === null ? null : Math.round(offset) }
  if (opts.pid) swing.pid = opts.pid
  if (rollDoublePlay(before, outcome, rand)) swing.dp = true
  if (hasGuess(mods.read)) swing.read = evaluateRead(mods.read, { type: pitch.type, alt: pitch.alt ?? 1, height: pitch.height })
  const after = simulateGame([...events, swing])
  const paEnded = after.results.length > before.results.length ? paLabel(after.results[after.results.length - 1]) : null
  return { swing, before, after, paEnded }
}

// 저장용 요약 (baseball_plays 컬럼)
export function tallySwings(events: Swing[]) {
  const st = simulateGame(events)
  return { homeruns: st.homeruns, hits: st.hits, runs: st.runs, lob: st.lob, best_distance: st.best, finished: st.finished }
}

export function paLabel(r: PaResult) {
  switch (r.kind) {
    case 'K': return '삼진'
    case 'GO': return '땅볼 아웃'
    case 'DP': return '병살'
    case 'FO': return '뜬공 아웃'
    case 'BB': return '볼넷'
    case 'HBP': return '사구'
    case '1B': return '안타'
    case '2B': return '2루타'
    case 'HR': return r.rbi > 1 ? `${r.rbi}점 홈런` : '홈런'
  }
}

type Score = { runs: number; homeruns: number; hits: number; best: number }

// 득점 → 홈런 → 안타 → 최장 비거리 순으로 비교 (a가 더 잘했으면 음수)
function compareScore(a: Score, b: Score) {
  return b.runs - a.runs || b.homeruns - a.homeruns || b.hits - a.hits || b.best - a.best
}

const scoreOf = (p: Play): Score => ({ runs: p.runs ?? 0, homeruns: p.homeruns, hits: p.hits, best: Number(p.best_distance) })

export type RankRow = Score & { member_id: string; rank: number; games: number }

// 같은 점수면 같은 순위(공동). 한 사람당 가장 잘한 1게임만 반영, 끝난 게임만 센다.
export function rankDay(plays: Play[]): RankRow[] {
  const byMember = new Map<string, { best: Score; games: number }>()
  for (const p of plays) {
    if (!p.finished) continue
    const cur = byMember.get(p.member_id)
    const s = scoreOf(p)
    if (!cur) byMember.set(p.member_id, { best: s, games: 1 })
    else byMember.set(p.member_id, { best: compareScore(s, cur.best) < 0 ? s : cur.best, games: cur.games + 1 })
  }
  const rows = [...byMember.entries()].map(([member_id, v]) => ({ member_id, ...v.best, games: v.games }))
  rows.sort(compareScore)
  return rows.map(r => ({ ...r, rank: rows.findIndex(x => compareScore(x, r) === 0) + 1 }))
}

export type CareerRow = { member_id: string; dayWins: number; runs: number; homeruns: number; hits: number; best: number; games: number }

// 누적 — 라운드 1위 횟수(오늘 이전 끝난 라운드만), 통산 득점·홈런·안타(모든 판 합산), 최장 비거리
export function careerStats(plays: Play[], today: string): CareerRow[] {
  const rows = new Map<string, CareerRow>()
  const get = (id: string) => {
    let r = rows.get(id)
    if (!r) { r = { member_id: id, dayWins: 0, runs: 0, homeruns: 0, hits: 0, best: 0, games: 0 }; rows.set(id, r) }
    return r
  }
  const byDay = new Map<string, Play[]>()
  for (const p of plays) {
    if (!p.finished) continue
    const r = get(p.member_id)
    r.games += 1
    r.runs += p.runs ?? 0
    r.homeruns += p.homeruns
    r.hits += p.hits
    r.best = Math.max(r.best, Number(p.best_distance))
    if (p.play_date < today) byDay.set(p.play_date, [...(byDay.get(p.play_date) ?? []), p])
  }
  for (const dayPlays of byDay.values()) {
    for (const w of rankDay(dayPlays).filter(r => r.rank === 1 && (r.runs + r.homeruns + r.hits) > 0)) get(w.member_id).dayWins += 1
  }
  return [...rows.values()].sort((a, b) => b.dayWins - a.dayWins || b.runs - a.runs || b.homeruns - a.homeruns || b.hits - a.hits || b.best - a.best)
}
