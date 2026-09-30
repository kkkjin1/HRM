// 비거리 야구 — 졸라맨 투수가 랜덤 구종/구속/투구폼으로 던지고, 3타석짜리 게임을 쳐서 하루 라운드로 순위를 가린다.
// 화면/DB와 무관한 순수 로직만 여기 둔다(판정·볼카운트·주자·득점·순위). 저장은 baseball_plays(게임 1판 = 1행),
// 투구 이벤트(swings)를 순서대로 쌓고 타석 진행은 simulateGame()으로 매번 재생해서 계산한다.

export const PA_PER_GAME = 3       // 게임당 타석 수
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
export type Pitch = { id: string; type: PitchType; speed: number; alt: number; slot: Slot; windup: number }

const SLOTS: Slot[] = ['high', 'mid', 'side', 'low']

export type Outcome = 'perfect' | 'good' | 'fair' | 'foul' | 'miss' | 'looking' | 'ball' | 'hbp'

export type Swing = {
  type: PitchType
  speed: number
  outcome: Outcome
  distance: number
  offset: number | null // 스윙 시각 - 공 도착 시각(ms). +면 늦음, -면 빠름, null = 스윙 안 함
  pid?: string          // 대결에서만: 어떤 투구의 결과인지 (관전자·투수 화면이 애니메이션과 짝지을 때 사용)
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
  const id = `${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`
  return { id, type, speed, alt, slot, windup }
}

// 실제 18.44m 비행시간(150km/h에 0.44초)의 1.2배 (150km/h ≈ 0.53초, 100km/h ≈ 0.80초, 75km/h ≈ 1.06초).
export function travelMs(speed: number) {
  return Math.round((18.44 / (speed / 3.6)) * 1000 * 1.2)
}

// 스윙 타이밍 오차(ms) → 결과. offset이 null이면 스윙하지 않음.
// 빠지는 볼: 참으면 '볼', 휘두르면 헛스윙. 몸에 맞는 공: 스윙과 무관하게 사구.
// 판정 폭: 완벽 ±8ms / 정타 ±18 / 빗맞음 ±35 / 파울 ±60 (구종별 window 배율로 더 좁아짐).
// 구속이 빠를수록 맞았을 때 더 멀리 간다(75km/h ×0.94 ~ 165km/h ×1.156).
export function judgeSwing(offset: number | null, pitch: Pick<Pitch, 'type' | 'speed'>, rand: () => number = Math.random): { outcome: Outcome; distance: number } {
  if (pitch.type === 'hbp') return { outcome: 'hbp', distance: 0 }
  if (pitch.type === 'ball') return { outcome: offset === null ? 'ball' : 'miss', distance: 0 }
  if (offset === null) return { outcome: 'looking', distance: 0 }
  const err = Math.abs(offset) / PITCH_TYPES[pitch.type].window
  let base: number
  let outcome: Outcome
  if (err <= 8) { outcome = 'perfect'; base = 115 + rand() * 35 }
  else if (err <= 18) { outcome = 'good'; base = 80 + rand() * 35 }
  else if (err <= 35) { outcome = 'fair'; base = 20 + rand() * 60 }
  else if (err <= 60) return { outcome: 'foul', distance: 0 }
  else return { outcome: 'miss', distance: 0 }
  const speedBonus = 1 + ((pitch.speed - 100) / 50) * 0.12
  return { outcome, distance: Math.round(base * speedBonus * 10) / 10 }
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
    default:
      if (s.distance >= FENCE_M) return '홈런!'
      if (s.distance >= DOUBLE_M) return '2루타'
      return '안타'
  }
}

export type PaResult = { kind: 'K' | 'BB' | 'HBP' | '1B' | '2B' | 'HR'; rbi: number; distance: number }

export type GameState = {
  pa: number            // 끝난 타석 수
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

// 볼넷·사구: 밀어내기 진루
function forceAdvance(b: [boolean, boolean, boolean]): { bases: [boolean, boolean, boolean]; scored: number } {
  if (!b[0]) return { bases: [true, b[1], b[2]], scored: 0 }
  if (!b[1]) return { bases: [true, true, b[2]], scored: 0 }
  if (!b[2]) return { bases: [true, true, true], scored: 0 }
  return { bases: [true, true, true], scored: 1 }
}

// 안타: 모든 주자가 n루씩 진루, 타자는 n루로
function hitAdvance(b: [boolean, boolean, boolean], n: 1 | 2): { bases: [boolean, boolean, boolean]; scored: number } {
  const next: [boolean, boolean, boolean] = [false, false, false]
  let scored = 0
  for (let i = 2; i >= 0; i--) {
    if (!b[i]) continue
    const to = i + n
    if (to >= 3) scored += 1
    else next[to] = true
  }
  next[n - 1] = true
  return { bases: next, scored }
}

// 투구 이벤트를 처음부터 재생해 현재 타석·카운트·주자·득점을 계산한다. 3타석이 끝나면 이후 이벤트는 무시.
export function simulateGame(events: Swing[]): GameState {
  const st: GameState = { pa: 0, strikes: 0, balls: 0, bases: [false, false, false], runs: 0, homeruns: 0, hits: 0, best: 0, results: [], finished: false, lob: 0 }
  const endPa = (r: PaResult) => {
    st.results.push(r)
    st.pa += 1
    st.strikes = 0
    st.balls = 0
    if (st.pa >= PA_PER_GAME) st.finished = true
  }
  for (const e of events) {
    if (st.finished) break
    if (isHit(e.outcome)) {
      if (e.distance > st.best) st.best = e.distance
      if (e.distance >= FENCE_M) {
        const rbi = st.bases.filter(Boolean).length + 1
        st.runs += rbi
        st.homeruns += 1
        st.bases = [false, false, false]
        endPa({ kind: 'HR', rbi, distance: e.distance })
      } else {
        const n = e.distance >= DOUBLE_M ? 2 : 1
        const { bases, scored } = hitAdvance(st.bases, n)
        st.bases = bases
        st.runs += scored
        st.hits += 1
        endPa({ kind: n === 2 ? '2B' : '1B', rbi: scored, distance: e.distance })
      }
      continue
    }
    switch (e.outcome) {
      case 'looking':
      case 'miss':
        st.strikes += 1
        if (st.strikes >= STRIKES_FOR_OUT) endPa({ kind: 'K', rbi: 0, distance: 0 })
        break
      case 'foul':
        if (st.strikes < STRIKES_FOR_OUT - 1) st.strikes += 1 // 1S에서 파울은 카운트 유지
        break
      case 'ball': {
        st.balls += 1
        if (st.balls >= BALLS_FOR_WALK) {
          const { bases, scored } = forceAdvance(st.bases)
          st.bases = bases
          st.runs += scored
          endPa({ kind: 'BB', rbi: scored, distance: 0 })
        }
        break
      }
      case 'hbp': {
        const { bases, scored } = forceAdvance(st.bases)
        st.bases = bases
        st.runs += scored
        endPa({ kind: 'HBP', rbi: scored, distance: 0 })
        break
      }
    }
  }
  st.lob = st.finished ? st.bases.filter(Boolean).length : 0
  return st
}

// 저장용 요약 (baseball_plays 컬럼)
export function tallySwings(events: Swing[]) {
  const st = simulateGame(events)
  return { homeruns: st.homeruns, hits: st.hits, runs: st.runs, lob: st.lob, best_distance: st.best, finished: st.finished }
}

export function paLabel(r: PaResult) {
  switch (r.kind) {
    case 'K': return '삼진'
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
