import { describe, expect, it } from 'vitest'
import {
  IDLE, MATE_GAP, P_SPEED, SWING_MS, WIN, applyHit, badminton2Step, landingPoint, bmCpuInput, newBadminton2, newBmCpuMem, teamIdx,
  type BInput, type BmState, type BTeam,
} from '@/lib/badminton'

const DT = 1000 / 60
const mkRand = (seed: number) => { let r = seed; return () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 } }

// CPU끼리 한 판 — onStep으로 매 프레임 관찰
function cpuGame(size: 1 | 2, seed: number, onStep?: (prev: BmState, s: BmState) => void, maxMs = 15 * 60_000) {
  const rand = mkRand(seed)
  let s = newBadminton2(size, seed)
  const mems = s.players.map(() => newBmCpuMem())
  for (let t = 0; t < maxMs && !s.winner; t += DT) {
    const prev = s
    s = badminton2Step(s, s.players.map((_, i) => bmCpuInput(s, i, mems[i], rand)), DT)
    onStep?.(prev, s)
  }
  return s
}

describe('🏸 배드민턴(중계 시점) — CPU끼리 붙여 보면', () => {
  for (const size of [1, 2] as const) {
    it(`${size}:${size} 승자가 나온다(${WIN}점)`, () => {
      let pts = 0
      for (let seed = 1; seed <= 12; seed++) {
        const s = cpuGame(size, seed)
        expect(s.winner).not.toBeNull()
        expect(s.score[s.winner!]).toBe(WIN)
        pts += s.score.A + s.score.B
      }
      console.log(`${size}:${size} 12판 평균 득점 합 ${(pts / 12).toFixed(1)}`)
    })

    it(`${size}:${size} 랠리가 이어진다(득점당 타구 2회 넘게)`, () => {
      let hits = 0, pts = 0
      const kinds: Record<string, number> = {}
      for (let seed = 1; seed <= 12; seed++) {
        const s = cpuGame(size, seed, (p, n) => { if (n.last && n.last !== p.last) kinds[n.last.kind] = (kinds[n.last.kind] ?? 0) + 1 })
        hits += s.hits; pts += s.score.A + s.score.B
      }
      console.log(`${size}:${size} 타구 ${hits} / 득점 ${pts} (${(hits / pts).toFixed(2)}회)`, JSON.stringify(kinds))
      expect(hits / pts).toBeGreaterThan(2)
      for (const k of ['drop', 'clear', 'smash', 'normal']) expect(kinds[k] ?? 0, k).toBeGreaterThan(0)
    })

    it(`${size}:${size} ⚡ 번개 스매시가 나오고 받기가 훨씬 어렵다`, () => {
      let specials = 0, scored = 0
      for (let seed = 1; seed <= 12; seed++) {
        let open: BTeam | null = null
        cpuGame(size, seed, (p, n) => {
          if (n.last !== p.last && n.last?.kind === 'special') { specials++; open = n.last.team }
          else if (open && n.pause > 0 && p.pause <= 0) { if (n.last?.team === open) scored++; open = null }
          else if (open && n.lastHit !== p.lastHit) open = null // 받아냄
        })
      }
      console.log(`${size}:${size} 필살구 ${specials}번 중 득점 ${scored}번`)
      expect(specials).toBeGreaterThan(5)
      expect(scored / specials).toBeGreaterThan(0.4)
    })
  }

  it('2:2 — 두 사람 모두 공을 친다(한 명만 다 치지 않음)', () => {
    const by = [0, 0, 0, 0]
    for (let seed = 1; seed <= 6; seed++) cpuGame(2, seed, (p, n) => { if (n.hits !== p.hits && n.last) by[n.last.by]++ })
    console.log('2:2 선수별 타구', by.join(' / '))
    for (const [a, b] of [[0, 1], [2, 3]]) expect(Math.min(by[a], by[b]) / Math.max(by[a], by[b])).toBeGreaterThan(0.3)
  })
})

describe('🏸 배드민턴 규칙', () => {
  it('아무도 안 치면 자동 서브 → 상대 코트 바닥에 떨어져 서브한 팀 득점', () => {
    let s = newBadminton2(1)
    for (let t = 0; t < 8000 && s.score.A + s.score.B === 0; t += DT) s = badminton2Step(s, [IDLE, IDLE], DT)
    expect(s.score.A).toBe(1)
    expect(s.last?.kind).toBe('floor')
  })

  it('입력은 팀 기준: 위(fwd +1)는 A면 +y, B면 -y로 — 둘 다 네트 쪽으로 간다', () => {
    let s = newBadminton2(1)
    s = { ...s, srv: -1, lastHit: 0, sh: { ...s.sh, y: -3, h: 50, vx: 0, vy: 0, vh: 0 } } // 서브 대기·비행 판정 피하기
    const a0 = s.players[0], b0 = s.players[1]
    const fwd: BInput = { fwd: 1, side: 1, act: false }
    const n = badminton2Step(s, [fwd, fwd], 500)
    expect(n.players[0].y).toBeGreaterThan(a0.y)
    expect(n.players[1].y).toBeLessThan(b0.y)
    expect(n.players[0].x).toBeGreaterThan(a0.x) // A의 오른쪽 = +x
    expect(n.players[1].x).toBeLessThan(b0.x) // B의 오른쪽 = -x (180° 돌린 화면)
    expect(Math.hypot(n.players[0].x - a0.x, n.players[0].y - a0.y)).toBeCloseTo(P_SPEED * 0.5, 1) // 대각선도 같은 속도
  })

  it('2:2 — 같은 팀이 서로 향해 걸어도 겹치지 않는다', () => {
    let s = newBadminton2(2)
    s = { ...s, srv: -1, lastHit: 0, sh: { ...s.sh, y: -3, h: 500, vx: 0, vy: 0, vh: 0 } }
    for (let t = 0; t < 1500; t += DT) s = badminton2Step(s, [{ fwd: 0, side: 1, act: false }, { fwd: 0, side: -1, act: false }, IDLE, IDLE], DT)
    const [a, b] = teamIdx(s, 'A').map(i => s.players[i])
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(MATE_GAP - 0.05)
  })

  it('2:2 — 같은 팀 둘 다 휘두르면 셔틀콕에 더 가까운 사람이 친다', () => {
    let s = newBadminton2(2)
    // B가 친 공이 A 코트 (1.0, -3.0) 높이 1.2m를 지나는 중. A0은 멀리, A1은 바로 옆
    s = {
      ...s, lastHit: 2, srv: 2,
      players: s.players.map((p, i) => (i === 0 ? { ...p, x: 0.2, y: -3.2 } : i === 1 ? { ...p, x: 1.1, y: -3.1 } : p)),
      sh: { x: 1.0, y: -3.0, h: 1.2, vx: 0, vy: -0.1, vh: 0, special: false },
    }
    const n = badminton2Step(s, [{ fwd: 0, side: 0, act: true }, { fwd: 0, side: 0, act: true }, IDLE, IDLE], DT)
    expect(n.lastHit).toBe(1)
    expect(n.sh.vy).toBeGreaterThan(0) // B 코트로 넘어간다
  })

  it('2:2 서브는 팀 안에서 점수 짝/홀에 따라 번갈아', () => {
    let s = newBadminton2(2)
    const servers: number[] = [s.srv]
    for (let t = 0; t < 20_000 && s.score.A < 4; t += DT) {
      const prev = s
      s = badminton2Step(s, [IDLE, IDLE, IDLE, IDLE], DT)
      if (prev.pause > 0 && s.pause <= 0) servers.push(s.srv)
    }
    expect(servers.slice(0, 4)).toEqual([0, 1, 0, 1])
  })

  // A0이 휘두르는 도중(phase) 셔틀콕이 닿게 만든다. dist = 셔틀콕이 몸에서 떨어진 거리
  function hitAt(phase: number, dist = 0, h = 2.0) {
    let s = newBadminton2(1)
    s = {
      ...s, lastHit: 1, srv: 1,
      players: s.players.map((p, i) => (i === 0 ? { ...p, x: 0, y: -3.4, swing: phase * SWING_MS - DT } : p)),
      sh: { x: dist, y: -3.4, h, vx: 0, vy: 0, vh: 0, special: false },
    }
    return badminton2Step(s, [IDLE, IDLE], DT)
  }
  const depthOf = (s: BmState) => landingPoint(s.sh, 0).y

  it('라켓이 뒤에 있을 때(일찍) 맞으면 높고 멀리, 앞으로 넘어간 뒤(늦게) 맞으면 짧게', () => {
    const early = hitAt(0.1, 0.9), late = hitAt(0.95, 0.9)
    expect(early.last?.kind).toBe('clear')
    expect(late.last?.kind).toBe('drop')
    expect(depthOf(early)).toBeGreaterThan(4.8)
    expect(depthOf(late)).toBeLessThan(2.5)
    expect(early.sh.vh).toBeGreaterThan(late.sh.vh) // 더 높이 뜬다
  })

  it('정타(라켓이 위 + 몸 가까이 + 머리 위) = 스매시, 하나라도 빠지면 그냥 넘김', () => {
    expect(hitAt(0.5, 0.1).last?.kind).toBe('smash')
    expect(hitAt(0.5, 0.9).last?.kind).not.toBe('smash') // 멀리서 맞음
    expect(hitAt(0.15, 0.1).last?.kind).not.toBe('smash') // 너무 일찍
    expect(hitAt(0.5, 0.1, 0.8).last?.kind).not.toBe('smash') // 너무 낮음
  })

  it('팀 기가 꽉 찬 뒤 정타 = ⚡ 번개 스매시(기 소모)', () => {
    let s = newBadminton2(1)
    s = {
      ...s, lastHit: 1, srv: 1, meter: { A: 5, B: 0 },
      players: s.players.map((p, i) => (i === 0 ? { ...p, x: 0, y: -3.4, swing: 0.5 * SWING_MS - DT } : p)),
      sh: { x: 0.1, y: -3.4, h: 2, vx: 0, vy: 0, vh: 0, special: false },
    }
    const n = badminton2Step(s, [IDLE, IDLE], DT)
    expect(n.last?.kind).toBe('special')
    expect(n.sh.special).toBe(true)
    expect(n.meter.A).toBe(0)
  })

  it('통신: 원격 선수(remote)는 이 PC가 타구 판정을 안 한다 — 휘두르는 모습만', () => {
    let s = newBadminton2(1)
    s = {
      ...s, lastHit: 1, srv: 1,
      players: s.players.map((p, i) => (i === 0 ? { ...p, x: 0, y: -3.4, swing: 0.5 * SWING_MS - DT } : p)),
      sh: { x: 0.1, y: -3.4, h: 2, vx: 0, vy: 0, vh: 0, special: false },
    }
    const n = badminton2Step(s, [IDLE, IDLE], DT, { remote: [true, false] })
    expect(n.lastHit).toBe(1)
    expect(n.players[0].swing).toBeGreaterThan(0)
  })

  it('통신: 원격 타구 반영 — 받을 차례면 반영, 같은 타구가 두 번 오거나 같은 팀이 또 치면 무시', () => {
    let s = newBadminton2(1)
    s = { ...s, lastHit: 1, srv: 1, hits: 4, sh: { x: 0, y: -3, h: 1.5, vx: 0, vy: -1, vh: 0, special: false } }
    const hit = { idx: 0, hits: 5, sh: { x: 0, y: -3, h: 1.5, vx: 0, vy: 8, vh: 3, special: false }, meter: 3, kind: 'clear' as const }
    const a = applyHit(s, hit)!
    expect(a.lastHit).toBe(0)
    expect(a.hits).toBe(5)
    expect(a.meter.A).toBe(3)
    expect(a.sh.vy).toBe(8)
    expect(applyHit(a, hit)).toBeNull() // 중복
    expect(applyHit(a, { ...hit, hits: 6 })).toBeNull() // A가 친 공을 A가 또
    expect(applyHit({ ...s, pause: 500 }, hit)).toBeNull() // 득점 멈춤 중
  })

  it('통신: 참가자 예측(autoServe false)은 시간이 지나도 혼자 서브하지 않는다', () => {
    let s = newBadminton2(1)
    for (let t = 0; t < 4000; t += DT) s = badminton2Step(s, [IDLE, IDLE], DT, { remote: [true, false], autoServe: false })
    expect(s.lastHit).toBe(-1)
  })
})
