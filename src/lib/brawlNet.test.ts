import { describe, it, expect } from 'vitest'
import { DT, NO_INPUT, cpuInput, newBrawl, newCpuMind, step, type Entrant, type Input } from './brawl'
import { SNAP_DIST, applyWorld, decodeInput, encodeInput, encodeWorld } from './brawlNet'

const ents: Entrant[] = [
  { id: 'host', name: 'H', color: '#000', cpu: false },
  { id: 'guest', name: 'G', color: '#111', cpu: false },
  { id: 'cpu', name: 'C', color: '#222', cpu: true },
]

describe('brawlNet', () => {
  it('키 묶음은 왕복해도 그대로', () => {
    const all: Input = { left: true, right: false, up: true, down: false, jab: false, strong: true, attack: true }
    expect(decodeInput(encodeInput(all))).toEqual(all)
    expect(decodeInput(encodeInput(NO_INPUT))).toEqual(NO_INPUT)
  })

  it('참가자 화면: 남은 방장 값, 내 몸은 가까우면 내 위치 유지', () => {
    const host = newBrawl('peak', ents, 3, 1)
    const guest = newBrawl('peak', ents, 3, 1)
    host.fighters[0].x += 50 // 방장 몸이 움직임
    host.fighters[1].x += 20 // 방장이 본 내(참가자) 몸은 조금 뒤처짐
    const m = encodeWorld(host, host.fighters.map(() => NO_INPUT))
    const before = guest.fighters[1].x
    applyWorld(guest, m, 1)
    expect(guest.fighters[0].x).toBeCloseTo(host.fighters[0].x, 0)
    expect(guest.fighters[1].x).toBe(before)
    // 멀리 어긋나면 방장 쪽으로
    host.fighters[1].x = before + SNAP_DIST + 30
    applyWorld(guest, encodeWorld(host, host.fighters.map(() => NO_INPUT)), 1)
    expect(guest.fighters[1].x).toBeCloseTo(host.fighters[1].x, 0)
  })

  it('맞음·KO는 방장 값을 따르고 연출 목록으로 돌려준다', () => {
    const host = newBrawl('peak', ents, 3, 1)
    const guest = newBrawl('peak', ents, 3, 1)
    host.fighters[1].pct = 18; host.fighters[1].act = 'stun'; host.fighters[1].x += 5
    host.fighters[2].lives = 2
    const fx = applyWorld(guest, encodeWorld(host, host.fighters.map(() => NO_INPUT)), 1)
    expect(guest.fighters[1].pct).toBe(18)
    expect(guest.fighters[1].act).toBe('stun')
    expect(fx.hits.map(h => h.i)).toEqual([1])
    expect(fx.kos).toEqual([2])
  })

  it('판 끝·승자도 전달된다', () => {
    const host = newBrawl('peak', ents, 1, 1)
    const guest = newBrawl('peak', ents, 1, 1)
    host.fighters[1].x = 2000; host.fighters[2].x = 2000
    step(host, {})
    expect(host.over).toBe(true)
    applyWorld(guest, encodeWorld(host, host.fighters.map(() => NO_INPUT)), 1)
    expect(guest.over).toBe(true)
    expect(guest.winner).toBe('host')
  })

  it('방장·참가자를 같이 돌려도(소식 5프레임마다) 화면이 크게 어긋나지 않는다', () => {
    const host = newBrawl('bridge', ents, 3, 3)
    const guest = newBrawl('bridge', ents, 3, 3)
    const m = newCpuMind(7)
    let maxGap = 0
    for (let i = 0; i < 10 / DT; i++) {
      const gIn: Input = { ...NO_INPUT, right: i % 120 < 60, left: i % 120 >= 60, attack: i % 50 < 3 }
      const hIn = { host: NO_INPUT, guest: gIn, cpu: cpuInput(host, 'cpu', m) }
      step(host, hIn)
      step(guest, { host: NO_INPUT, guest: gIn, cpu: hIn.cpu }, DT, false)
      if (i % 5 === 0) applyWorld(guest, encodeWorld(host, [hIn.host, hIn.guest, hIn.cpu]), 1)
      if (host.fighters[0].lives === guest.fighters[0].lives) maxGap = Math.max(maxGap, Math.abs(host.fighters[0].x - guest.fighters[0].x))
    }
    expect(maxGap).toBeLessThan(SNAP_DIST)
  })
})
