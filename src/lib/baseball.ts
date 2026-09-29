// 비거리 야구 — 피칭머신이 랜덤 구종/구속으로 던지고, 각자 3구짜리 게임을 쳐서 하루 라운드로 순위를 가린다.
// 화면/DB와 무관한 순수 로직만 여기 둔다(판정·비거리·집계·순위). 저장은 baseball_plays(게임 1판 = 1행).

export const PITCHES_PER_GAME = 3
export const MAX_GAMES_PER_DAY = 5
export const FENCE_M = 120 // 이 이상이면 홈런

export type PitchType = 'fastball' | 'slider' | 'curve' | 'changeup' | 'knuckle'

// window: 타이밍 판정 폭 배율 — 변화가 심한 공일수록 좁다.
export const PITCH_TYPES: Record<PitchType, { label: string; min: number; max: number; window: number }> = {
  fastball: { label: '직구', min: 140, max: 155, window: 1.0 },
  slider:   { label: '슬라이더', min: 125, max: 140, window: 0.9 },
  curve:    { label: '커브', min: 105, max: 120, window: 0.85 },
  changeup: { label: '체인지업', min: 120, max: 132, window: 0.9 },
  knuckle:  { label: '너클볼', min: 100, max: 115, window: 0.75 },
}

export type Pitch = { id: string; type: PitchType; speed: number }

export type Outcome = 'perfect' | 'good' | 'fair' | 'foul' | 'miss' | 'looking'

export type Swing = {
  type: PitchType
  speed: number
  outcome: Outcome
  distance: number
  offset: number | null // 스윙 시각 - 공 도착 시각(ms). +면 늦음, -면 빠름
}

export type Play = {
  id: string
  member_id: string
  play_date: string
  game_no: number
  swings: Swing[]
  homeruns: number
  hits: number
  best_distance: number
  finished: boolean
  created_at: string
  finished_at: string | null
}

// 하루 게임 수 = 기본 1 + 누적 칭찬 4개당 1, 최대 5
export function dailyAllowance(praiseCount: number) {
  return Math.min(MAX_GAMES_PER_DAY, 1 + Math.floor(Math.max(0, praiseCount) / 4))
}

export function randomPitch(rand: () => number = Math.random): Pitch {
  const types = Object.keys(PITCH_TYPES) as PitchType[]
  const type = types[Math.floor(rand() * types.length)]
  const { min, max } = PITCH_TYPES[type]
  const speed = Math.round(min + rand() * (max - min))
  const id = `${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`
  return { id, type, speed }
}

// 실제 18.44m 비행시간은 150km/h에 0.44초라 너무 빨라서 1.8배로 늘린다 (150km/h ≈ 0.80초, 100km/h ≈ 1.19초).
export function travelMs(speed: number) {
  return Math.round((18.44 / (speed / 3.6)) * 1000 * 1.8)
}

// 스윙 타이밍 오차(ms) → 결과. offset이 null이면 스윙하지 않음(루킹).
// 구속이 빠를수록 맞았을 때 더 멀리 간다(100km/h ×1.0 ~ 150km/h ×1.12).
export function judgeSwing(offset: number | null, pitch: Pick<Pitch, 'type' | 'speed'>, rand: () => number = Math.random): { outcome: Outcome; distance: number } {
  if (offset === null) return { outcome: 'looking', distance: 0 }
  const err = Math.abs(offset) / PITCH_TYPES[pitch.type].window
  let base: number
  let outcome: Outcome
  if (err <= 25) { outcome = 'perfect'; base = 110 + rand() * 30 }
  else if (err <= 55) { outcome = 'good'; base = 75 + rand() * 35 }
  else if (err <= 95) { outcome = 'fair'; base = 20 + rand() * 55 }
  else if (err <= 140) return { outcome: 'foul', distance: 0 }
  else return { outcome: 'miss', distance: 0 }
  const speedBonus = 1 + ((pitch.speed - 100) / 50) * 0.12
  return { outcome, distance: Math.round(base * speedBonus * 10) / 10 }
}

export function isHit(outcome: Outcome) {
  return outcome === 'perfect' || outcome === 'good' || outcome === 'fair'
}

export function isHomerun(s: Pick<Swing, 'outcome' | 'distance'>) {
  return isHit(s.outcome) && s.distance >= FENCE_M
}

export function outcomeLabel(s: Pick<Swing, 'outcome' | 'distance'>) {
  switch (s.outcome) {
    case 'foul': return '파울'
    case 'miss': return '헛스윙'
    case 'looking': return '루킹 스트라이크'
    default:
      if (s.distance >= FENCE_M) return '홈런!'
      if (s.distance >= 80) return '장타'
      return '안타'
  }
}

// 게임 한 판의 집계 — hits는 홈런을 뺀 안타 수
export function tallySwings(swings: Swing[]) {
  let homeruns = 0
  let hits = 0
  let best = 0
  for (const s of swings) {
    if (!isHit(s.outcome)) continue
    if (s.distance >= FENCE_M) homeruns += 1
    else hits += 1
    if (s.distance > best) best = s.distance
  }
  return { homeruns, hits, best_distance: best, finished: swings.length >= PITCHES_PER_GAME }
}

type Score = { homeruns: number; hits: number; best: number }

// 홈런 → 안타 → 최장 비거리 순으로 비교 (a가 더 잘했으면 음수)
function compareScore(a: Score, b: Score) {
  return b.homeruns - a.homeruns || b.hits - a.hits || b.best - a.best
}

const scoreOf = (p: Play): Score => ({ homeruns: p.homeruns, hits: p.hits, best: Number(p.best_distance) })

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

export type CareerRow = { member_id: string; dayWins: number; homeruns: number; hits: number; best: number; games: number }

// 누적 — 라운드 1위 횟수(오늘 이전 끝난 라운드만), 통산 홈런·안타(모든 판 합산), 최장 비거리
export function careerStats(plays: Play[], today: string): CareerRow[] {
  const rows = new Map<string, CareerRow>()
  const get = (id: string) => {
    let r = rows.get(id)
    if (!r) { r = { member_id: id, dayWins: 0, homeruns: 0, hits: 0, best: 0, games: 0 }; rows.set(id, r) }
    return r
  }
  const byDay = new Map<string, Play[]>()
  for (const p of plays) {
    if (!p.finished) continue
    const r = get(p.member_id)
    r.games += 1
    r.homeruns += p.homeruns
    r.hits += p.hits
    r.best = Math.max(r.best, Number(p.best_distance))
    if (p.play_date < today) byDay.set(p.play_date, [...(byDay.get(p.play_date) ?? []), p])
  }
  for (const dayPlays of byDay.values()) {
    for (const w of rankDay(dayPlays).filter(r => r.rank === 1 && (r.homeruns + r.hits) > 0)) get(w.member_id).dayWins += 1
  }
  return [...rows.values()].sort((a, b) => b.dayWins - a.dayWins || b.homeruns - a.homeruns || b.hits - a.hits || b.best - a.best)
}
