import { describe, expect, it } from 'vitest'
import {
  IDLE, MATE_GAP, P_SPEED, RING_LEAD, RING_OK, RING_OK_CHANCE, SMASH_H, SMASH_REACH, SWING_MS, WIN, applyHit, badminton2Step, landingPoint, launch, bmCpuInput, newBadminton2, newBmCpuMem, smashRing, teamIdx,
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

  // 💥 스매시 원: B가 A 코트 깊숙이 높게 띄운 공 — A0을 타점(SMASH_H 통과 지점)에 세우고, 원이 tau초 남았을 때 Space
  function ringHit(pressTau: number, o: { offset?: number; chance?: boolean; meter?: number } = {}) {
    let s = newBadminton2(1)
    const sh0 = launch({ x: 0.3, y: 3.5, h: 2.0, vx: 0, vy: 0, vh: 0, special: false }, -0.4, -5.2, 1.7)
    const sh = { ...sh0, chance: o.chance ?? false }
    const sp = landingPoint(sh, SMASH_H)
    s = {
      ...s, lastHit: 1, srv: 1, last: { team: 'B', kind: 'clear', by: 1 }, meter: { A: o.meter ?? 0, B: 0 },
      players: s.players.map((p, i) => (i === 0 ? { ...p, x: sp.x + (o.offset ?? 0), y: sp.y, swing: -1, pr: 0, run: 0 } : p)),
      sh,
    }
    let pressed = false
    for (let k = 0; k < 400 && s.hits === 0 && s.pause <= 0; k++) {
      const rg = smashRing(s, 0)
      const act = !pressed && !!rg && rg.tau <= pressTau
      if (act) pressed = true
      s = badminton2Step(s, [{ fwd: 0, side: 0, act }, IDLE], DT)
    }
    return s
  }

  it('스매시 원: 원이 과녁과 겹칠 때(±허용 폭) Space = 스매시, 너무 일찍 누르면 그냥 넘김', () => {
    expect(ringHit(0.02).last?.kind).toBe('smash')
    expect(ringHit(RING_OK * 0.8).last?.kind).toBe('smash')
    expect(ringHit(0.35).last?.kind).not.toBe('smash') // 너무 일찍(원이 아직 큼)
    expect(ringHit(0.02, { offset: SMASH_REACH + 0.1 }).last?.kind).not.toBe('smash') // 타점에서 벗어나 있음
  })

  it('스매시 원: 찬스볼은 허용 폭이 더 넓다', () => {
    const t = (RING_OK + RING_OK_CHANCE) / 2
    expect(ringHit(t, { chance: true }).last?.kind).toBe('smash')
    expect(ringHit(t).last?.kind).not.toBe('smash')
  })

  it('스매시 원: 원은 떨어질수록 작아지고(tau 감소), 상대 쪽으로 가는 공·세게 온 공엔 안 생긴다', () => {
    let s = newBadminton2(1)
    const sh = launch({ x: 0.3, y: 3.5, h: 2.0, vx: 0, vy: 0, vh: 0, special: false }, -0.4, -5.2, 1.7)
    s = { ...s, lastHit: 1, srv: 1, last: { team: 'B', kind: 'clear', by: 1 }, sh }
    const taus: number[] = []
    for (let k = 0; k < 200; k++) { const rg = smashRing(s, 0); if (rg) taus.push(rg.tau); s = badminton2Step(s, [IDLE, IDLE], DT); if (s.pause > 0) break }
    expect(taus.length).toBeGreaterThan(20)
    expect(taus[0]).toBeLessThanOrEqual(RING_LEAD + 0.02)
    for (let k = 1; k < taus.length; k++) expect(taus[k]).toBeLessThan(taus[k - 1])
    expect(smashRing({ ...s, last: { team: 'B', kind: 'smash', by: 1 } }, 0)).toBeNull()
    expect(smashRing(s, 1)).toBeNull() // B 쪽은 자기가 친 공
  })

  it('스매시 원 + 기 꽉 참 = ⚡ 번개 스매시', () => {
    const n = ringHit(0.02, { meter: 5 })
    expect(n.last?.kind).toBe('special')
    expect(n.meter.A).toBe(0)
  })

  // 자리·높이·밀림·찬스볼까지 정해서 친다
  function hitWith(o: { phase: number; dist?: number; h?: number; y?: number; chance?: boolean; pr?: number; inc?: 'smash' | 'normal'; rally?: number }) {
    let s = newBadminton2(1)
    const y = o.y ?? -3.4
    s = {
      ...s, lastHit: 1, srv: 1, rally: o.rally ?? 0, last: { team: 'B', kind: o.inc ?? 'normal', by: 1 },
      players: s.players.map((p, i) => (i === 0 ? { ...p, x: 0, y, swing: o.phase * SWING_MS - DT, pr: o.pr ?? 0, run: 0 } : p)),
      sh: { x: o.dist ?? 0.9, y, h: o.h ?? 2.0, vx: 0, vy: 0, vh: 0, special: false, chance: o.chance ?? false },
    }
    return badminton2Step(s, [IDLE, IDLE], DT)
  }

  it('네트 앞 높은 공 = 타이밍 상관없이 내리꽂기(빠르고 낮게)', () => {
    const n = hitWith({ phase: 0.95, y: -1.0, h: 2.0 })
    expect(n.last?.kind).toBe('kill')
    expect(landingPoint(n.sh, 0).t).toBeLessThan(0.6)
  })

  it('네트 앞 낮은 공 = 살짝 넘기기(네트 바로 너머)', () => {
    const n = hitWith({ phase: 0.5, y: -1.0, h: 0.9 })
    expect(n.last?.kind).toBe('hairpin')
    const lp = landingPoint(n.sh, 0)
    expect(lp.y).toBeGreaterThan(0)
    expect(lp.y).toBeLessThan(1.6)
  })

  it('스매시를 받으면 밀리고, 많이 밀리면 높이 띄움 = 상대 찬스볼', () => {
    const a = hitWith({ phase: 0.5, inc: 'smash', pr: 0 })
    expect(a.last?.kind).toBe('lift')
    expect(a.sh.chance).toBe(true)
    expect(a.players[0].pr).toBe(1) // 2 쌓이고, 높이 띄워 시간을 벌며 1 풀림
  })

  it('편하게 받으면 밀림이 한 칸 풀린다', () => {
    const n = hitWith({ phase: 0.1, pr: 1 })
    expect(n.players[0].pr).toBe(0)
    expect(n.last?.kind).toBe('clear')
  })

  it('랠리가 길어질수록 공이 빨라진다', () => {
    const slow = landingPoint(hitWith({ phase: 0.1, rally: 0 }).sh, 0).t
    const fast = landingPoint(hitWith({ phase: 0.1, rally: 12 }).sh, 0).t
    expect(fast).toBeLessThan(slow * 0.8)
  })

  it('공기저항: 같은 거리라도 내려올 때가 올라갈 때보다 가파르다', () => {
    const n = hitWith({ phase: 0.1 })
    const lp = landingPoint(n.sh, 0)
    // 처음 절반 시간 동안 간 거리 > 나머지 절반(뒤로 갈수록 느려짐)
    const half = badminton2Step(n, [IDLE, IDLE], (lp.t / 2) * 1000)
    expect(Math.abs(half.sh.y - n.sh.y)).toBeGreaterThan(Math.abs(lp.y - half.sh.y))
  })

  it('CPU는 상대가 서 있는 반대쪽으로 친다', () => {
    let left = 0, right = 0
    for (let seed = 1; seed <= 60; seed++) {
      const rand = mkRand(seed)
      let s = newBadminton2(1, seed)
      // B(CPU)가 받을 차례, 상대 A는 오른쪽(+x) 끝에 서 있다
      s = {
        ...s, lastHit: 0, srv: 0, hits: 1, last: { team: 'A', kind: 'normal', by: 0 },
        players: s.players.map((p, i) => (i === 0 ? { ...p, x: 2.5, y: -3.4 } : { ...p, x: 0, y: 3.4 })),
        sh: { x: 0, y: 2.6, h: 2.2, vx: 0, vy: 1.2, vh: -1, special: false },
      }
      const mem = newBmCpuMem()
      for (let t = 0; t < 1500 && s.hits === 1 && !s.pause; t += DT) s = badminton2Step(s, [IDLE, bmCpuInput(s, 1, mem, rand)], DT)
      if (s.hits === 2) { const lp = landingPoint(s.sh, 0); if (lp.x < 0) left++; else right++ }
    }
    expect(left).toBeGreaterThan(right * 2)
  })

  it('통신: 원격 타구의 밀림(pr)도 방장 상태에 반영', () => {
    let s = newBadminton2(1)
    s = { ...s, lastHit: 1, srv: 1, hits: 4, rally: 3 }
    const a = applyHit(s, { idx: 0, hits: 5, sh: { ...s.sh, vy: 8 }, meter: 1, kind: 'lift', pr: 2 })!
    expect(a.players[0].pr).toBe(2)
    expect(a.rally).toBe(4)
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
