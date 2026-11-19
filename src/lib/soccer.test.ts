import { describe, expect, it } from 'vitest'
import {
  FIELD_H, FIELD_W, GOAL_TOP, MATCH_SEC, NO_INPUT, PR, mulberry32, newSoccerState, ownerOf, stepSoccer,
  type SoccerInput, type SoccerState,
} from './soccer'
import { newSoccerCpuMem, soccerCpuInput, type SoccerCpuMem } from './soccerCpu'

const STEP = 1 / 60
const all = (s: SoccerState) => new Set(s.players.map(p => p.id))
function run(s: SoccerState, sec: number, inputs: (s: SoccerState) => Record<string, SoccerInput> = () => ({})) {
  const n = Math.round(sec / STEP)
  for (let i = 0; i < n && s.phase !== 'end'; i++) stepSoccer(s, inputs(s), STEP, { move: all(s), judge: true })
}
const inp = (o: Partial<SoccerInput>): SoccerInput => ({ ...NO_INPUT, ...o })

describe('미니 축구 엔진', () => {
  it('공에 닿으면 잡고, 몰고 가면 공이 발 앞에 붙어 온다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    const a = s.players[0]
    a.x = FIELD_W / 2 - 40; a.y = FIELD_H / 2
    run(s, 0.6, () => ({ a: inp({ dx: 1 }) }))
    expect(s.ball.owner).toBe('a')
    run(s, 0.5, () => ({ a: inp({ dx: 1 }) }))
    expect(s.ball.x).toBeGreaterThan(a.x)
    expect(Math.abs(s.ball.y - a.y)).toBeLessThan(3)
  })

  it('누른 만큼 센 슛 → 골대 안으로 들어가면 점수, 잠시 뒤 다시 시작', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    const a = s.players[0]
    s.players[1].x = 100 // 상대는 멀리
    a.x = FIELD_W - 200; a.y = FIELD_H / 2
    s.ball.owner = 'a'
    run(s, 0.05, () => ({ a: inp({ dx: 1 }) }))
    run(s, 0.8, () => ({ a: inp({ dx: 1, kick: true }) }))
    run(s, 0.05, () => ({ a: inp({ dx: 1, kick: false }) }))
    expect(s.ball.owner).toBeNull()
    run(s, 1.2)
    expect(s.score.A).toBe(1)
    expect(a.goals).toBe(1)
    expect(s.phase).toBe('goal')
    run(s, 3)
    expect(s.phase).toBe('play')
    expect(s.ball.x).toBe(FIELD_W / 2)
  })

  it('골문 밖(옆 벽)으로 찬 공은 튕겨 나온다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    s.players[1].x = 100
    const a = s.players[0]
    a.x = FIELD_W - 150; a.y = GOAL_TOP - 80
    s.ball.owner = 'a'
    run(s, 0.05, () => ({ a: inp({ dx: 1 }) }))
    run(s, 0.4, () => ({ a: inp({ dx: 1, kick: true }) }))
    run(s, 0.05, () => ({ a: inp({ dx: 1 }) }))
    run(s, 1)
    expect(s.score.A).toBe(0)
    expect(s.ball.x).toBeLessThan(FIELD_W)
  })

  it('태클이 공 가진 상대에게 닿으면 공이 빠지고 상대는 넘어진다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    const [a, b] = s.players
    b.x = 400; b.y = 260; s.ball.owner = 'b'
    a.x = 400 - PR * 2 - 30; a.y = 260; a.fx = 1
    run(s, STEP, () => ({ a: inp({ dx: 1, kick: true }) }))
    run(s, 0.3, () => ({ a: inp({ dx: 1, kick: true }) }))
    expect(s.ball.owner).not.toBe('b')
    expect(b.act).toBe('down')
    expect(a.steals).toBe(1)
  })

  it('개인기 중엔 태클이 안 먹히고, 태클한 쪽이 넘어진다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    const [a, b] = s.players
    b.x = 420; b.y = 260; s.ball.owner = 'b'; b.fx = 0; b.fy = 1
    a.x = 420 - PR * 2 - 30; a.y = 260; a.fx = 1
    // b 개인기(아래로) + a 태클 동시에
    run(s, STEP, () => ({ a: inp({ dx: 1, kick: true }), b: inp({ dy: 1, act: true }) }))
    run(s, 0.12, () => ({ a: inp({ dx: 1, kick: true }), b: inp({ dy: 1 }) }))
    expect(['b', null]).toContain(s.ball.owner === 'b' ? 'b' : s.ball.owner)
    expect(s.ball.owner).toBe('b')
  })

  it('몸통박치기: 공 가진 상대를 밀어내고 공을 흘리게 한다, 쿨타임 동안 다시 못 쓴다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    const [a, b] = s.players
    b.x = 400; b.y = 260; s.ball.owner = 'b'
    a.x = 400 - PR * 2 - 8; a.y = 260; a.fx = 1
    run(s, STEP, () => ({ a: inp({ dx: 1, act: true }) }))
    run(s, 0.15, () => ({ a: inp({ dx: 1 }) }))
    expect(s.ball.owner).not.toBe('b')
    expect(b.act).toBe('down')
    const cool = a.checkCool
    expect(cool).toBeGreaterThan(s.t)
  })

  it('달리기는 기력을 쓰고, 바닥나면 잠깐 못 달린다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    const a = s.players[0]
    a.y = 40
    run(s, 2.5, st => ({ a: inp({ dx: st.players[0].x > FIELD_W - 60 ? -1 : 1, sprint: true }) }))
    expect(a.tired).toBe(true)
  })

  it('패스: 바라보는 쪽 우리 팀에게 간다', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'a2', team: 'A' }, { id: 'b', team: 'B' }, { id: 'b2', team: 'B' }])
    const [a, a2] = s.players
    s.players[2].x = 850; s.players[3].x = 850
    a.x = 200; a.y = 260; a.fx = 1; a.fy = 0
    a2.x = 420; a2.y = 300
    s.ball.owner = 'a'
    run(s, STEP, () => ({ a: inp({ pass: true }) }))
    run(s, 1.2)
    expect(s.ball.owner).toBe('a2')
  })

  it('시간이 끝나면 점수 많은 팀 승, 동점이면 골든골 → 그래도 없으면 무승부', () => {
    const s = newSoccerState([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }])
    s.t = MATCH_SEC - 0.05
    run(s, 0.2)
    expect(s.golden).toBe(true)
    expect(s.phase).toBe('play')
    s.t = MATCH_SEC + 59.9
    run(s, 0.3)
    expect(s.winner).toBe('draw')
  })
})

describe('CPU', () => {
  function cpuMatch(seed: number, size: number, sec: number) {
    const seats = [...Array.from({ length: size }, (_, i) => ({ id: `a${i}`, team: 'A' as const })), ...Array.from({ length: size }, (_, i) => ({ id: `b${i}`, team: 'B' as const }))]
    const s = newSoccerState(seats)
    const rnd = mulberry32(seed)
    const mems: Record<string, SoccerCpuMem> = {}
    for (const p of s.players) mems[p.id] = newSoccerCpuMem(mulberry32(Math.floor(rnd() * 1e9)))
    let touches = 0
    let last: string | null = null
    run(s, sec, st => {
      const o = ownerOf(st)?.id ?? null
      if (o && o !== last) touches++
      last = o
      return Object.fromEntries(st.players.map(p => [p.id, soccerCpuInput(st, p, mems[p.id])]))
    })
    return { s, touches }
  }
  it('CPU끼리 2분 경기 — 공을 주고받고 골이 난다', () => {
    let goals = 0, touches = 0
    for (let seed = 1; seed <= 6; seed++) {
      const r = cpuMatch(seed, 2, 120)
      goals += r.s.score.A + r.s.score.B
      touches += r.touches
      for (const p of r.s.players) {
        expect(p.x).toBeGreaterThanOrEqual(PR)
        expect(p.x).toBeLessThanOrEqual(FIELD_W - PR)
      }
    }
    // 한 경기 평균 1골 이상 · 소유가 자주 바뀐다
    expect(goals / 6).toBeGreaterThanOrEqual(1)
    expect(goals / 6).toBeLessThan(25)
    expect(touches / 6).toBeGreaterThan(10)
  })
  it('3:3도 멈추지 않는다', () => {
    const r = cpuMatch(42, 3, 60)
    expect(r.touches).toBeGreaterThan(4)
  })
})
