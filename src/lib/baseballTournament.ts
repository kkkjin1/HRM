// 비거리 야구 토너먼트 — 순수 로직(대진 추첨, 부전승, 다음 경기 배정, 우승 판정).
// 저장은 baseball_tournaments 1행: entrants(참가 신청) → 시작 시 players(추첨된 순서)와 bracket(라운드별 경기),
// 참가자가 홀수면 랜덤 1명은 excluded_id(경기 대신 우승자 베팅 bet_pick만 가능).
// 경기는 한 번에 하나씩 순서대로 — 진행할 다음 경기가 생기면 duel_id를 먼저 정해 bracket에 적고 그 id로 baseball_duels를 만든다.

import type { Duel } from '@/lib/baseballDuel'

export type TournamentStatus = 'recruiting' | 'running' | 'done' | 'canceled'

export type Match = {
  a: string
  b: string | null       // null = 부전승
  duel_id: string | null
  winner: string | null
}

export type Tournament = {
  id: string
  status: TournamentStatus
  created_by: string | null
  entrants: string[]
  players: string[]
  excluded_id: string | null
  bet_pick: string | null
  bracket: Match[][]
  champion_id: string | null
  created_at: string
  updated_at: string
}

function shuffle<T>(arr: T[], rand: () => number) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pairUp(ids: string[]): Match[] {
  const out: Match[] = []
  for (let i = 0; i < ids.length; i += 2) out.push({ a: ids[i], b: ids[i + 1] ?? null, duel_id: null, winner: null })
  return out
}

// 시작: 참가자 섞기 → 홀수면 1명 제외(베팅 전용) → 1라운드 대진
export function seedBracket(entrants: string[], rand: () => number = Math.random) {
  const shuffled = shuffle([...new Set(entrants)], rand)
  const excluded_id = shuffled.length % 2 === 1 && shuffled.length > 1 ? shuffled.pop()! : null
  return { players: shuffled, excluded_id, bracket: [pairUp(shuffled)] }
}

export function totalRounds(playerCount: number) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, playerCount))))
}

export function roundName(r: number, total: number) {
  const left = total - r
  if (left === 1) return '결승'
  if (left === 2) return '준결승'
  if (left === 3) return '8강'
  return `${r + 1}라운드`
}

export type NextStep = {
  bracket: Match[][]
  status: TournamentStatus
  champion_id: string | null
  createDuel: { id: string; round: number; match_no: number; a: string; b: string } | null
}

// 현재 대진표 + 경기 결과를 보고 한 걸음 진행한다. 바뀐 게 없으면 null.
// - 부전승 처리, 끝난 경기의 승자 기록
// - 라운드가 다 끝나면 승자들로 다음 라운드(홀수면 마지막 사람 부전승), 1명 남으면 우승
// - 진행 중인 경기가 없으면 다음 경기 하나를 배정(duel_id 발급)
export function nextStep(t: Pick<Tournament, 'bracket' | 'status'>, duels: Map<string, Pick<Duel, 'status' | 'winner_id'>>, newId: () => string): NextStep | null {
  if (t.status !== 'running' || t.bracket.length === 0) return null
  const bracket = t.bracket.map(r => r.map(m => ({ ...m })))
  let changed = false
  let champion: string | null = null
  let status: TournamentStatus = 'running'

  for (let guard = 0; guard < 10; guard++) {
    const r = bracket.length - 1
    const round = bracket[r]
    for (const m of round) {
      if (m.winner) continue
      if (m.b === null) { m.winner = m.a; changed = true; continue }
      if (m.duel_id) {
        const d = duels.get(m.duel_id)
        if (d?.status === 'done' && d.winner_id) { m.winner = d.winner_id; changed = true }
      }
    }
    if (round.every(m => m.winner)) {
      const winners = round.map(m => m.winner!)
      if (winners.length === 1) { champion = winners[0]; status = 'done'; changed = true; break }
      bracket.push(pairUp(winners))
      changed = true
      continue
    }
    break
  }

  let createDuel: NextStep['createDuel'] = null
  if (status === 'running') {
    const r = bracket.length - 1
    const round = bracket[r]
    const inProgress = round.some(m => m.duel_id && !m.winner)
    if (!inProgress) {
      const i = round.findIndex(m => !m.winner && !m.duel_id && m.b !== null)
      if (i >= 0) {
        const id = newId()
        round[i].duel_id = id
        createDuel = { id, round: r, match_no: i, a: round[i].a, b: round[i].b! }
        changed = true
      }
    }
  }
  return changed ? { bracket, status, champion_id: champion, createDuel } : null
}

// 지금 진행 중인 경기(duel_id는 있고 승자는 없음)
export function currentMatch(t: Pick<Tournament, 'bracket'>) {
  for (let r = 0; r < t.bracket.length; r++) {
    const i = t.bracket[r].findIndex(m => m.duel_id && !m.winner)
    if (i >= 0) return { round: r, match_no: i, match: t.bracket[r][i] }
  }
  return null
}

// 베팅은 첫 경기가 끝나기 전까지만
export function betOpen(t: Pick<Tournament, 'bracket' | 'status'>) {
  if (t.status !== 'running') return false
  const first = t.bracket[0]?.find(m => m.b !== null)
  return !!first && !first.winner
}

// 아직 탈락하지 않은 선수인지 (진행 중 토너먼트 선수는 친선 대결 신청을 막는다)
export function isAlive(t: Pick<Tournament, 'status' | 'players' | 'bracket'>, id: string) {
  if (t.status !== 'running' || !t.players.includes(id)) return false
  return !t.bracket.some(r => r.some(m => m.winner && m.winner !== id && (m.a === id || m.b === id)))
}
