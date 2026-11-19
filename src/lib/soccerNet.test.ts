import { describe, expect, it } from 'vitest'
import { FIELD_W, NO_INPUT, newSoccerState, shotPower, stepSoccer, type SoccerInput } from './soccer'
import { applyGuest, applyWorld, encodeWorld, guestPos, type SoccerGuestLocal, type SoccerGuestMsg } from './soccerNet'

const STEP = 1 / 60
const seats = [{ id: 'h', team: 'A' as const }, { id: 'g', team: 'B' as const }]
const inp = (o: Partial<SoccerInput>): SoccerInput => ({ ...NO_INPUT, ...o })

describe('미니 축구 통신', () => {
  it('참가자가 공을 몰다 슛 → 방장이 같은 자리에서 차서 골, 참가자 화면 점수도 맞는다', () => {
    const host = newSoccerState(seats)
    const guest = newSoccerState(seats)
    const me: SoccerGuestLocal = { myIdx: 1, predictUntil: 0 }
    // 참가자 g(B팀)가 왼쪽 골대 앞에서 공을 가졌다고 하자
    host.players[0].x = FIELD_W - 60
    host.players[1].x = 220; host.players[1].y = 260
    host.ball.owner = 'g'
    guest.players[1].x = 220; guest.players[1].y = 260
    applyWorld(guest, JSON.parse(JSON.stringify(encodeWorld(host))), me)
    expect(guest.ball.owner).toBe('g')

    const toHost: SoccerGuestMsg[] = []
    let held = 0
    for (let i = 0; i < 120; i++) {
      // 참가자: 왼쪽을 보고 힘 모으기 0.5초 → 떼기
      const kick = i < 30
      const gi = inp({ dx: -1, kick })
      const g = guest.players[1]
      const before = g.chargeAt
      stepSoccer(guest, { g: gi }, STEP, { move: new Set(['g']), judge: false })
      if (kick) held++
      if (!kick && before !== null) {
        // 떼는 순간: 예측 슛 + 방장에게 알림
        toHost.push({ k: 's', i: 1, x: g.x, y: g.y, fx: g.fx, fy: g.fy, pw: shotPower({ ...g, chargeAt: before }, guest.t) })
        g.chargeAt = null
        me.predictUntil = guest.t + 0.5
      } else toHost.push(guestPos(g, 1, guest.ko))
      // 방장
      for (const m of toHost.splice(0)) applyGuest(host, JSON.parse(JSON.stringify(m)))
      stepSoccer(host, {}, STEP, { move: new Set(['h']), judge: true })
      if (i % 6 === 0) applyWorld(guest, JSON.parse(JSON.stringify(encodeWorld(host))), me)
    }
    expect(held).toBe(30)
    expect(host.score.B).toBe(1)
    applyWorld(guest, JSON.parse(JSON.stringify(encodeWorld(host))), me)
    expect(guest.score.B).toBe(1)
    expect(guest.lastGoal?.by).toBe('g')
  })

  it('방장이 참가자를 넘어뜨리면 참가자 몸에 넉백이 적용되고, 그 전 위치 소식은 무시된다', () => {
    const host = newSoccerState(seats)
    const guest = newSoccerState(seats)
    const me: SoccerGuestLocal = { myIdx: 1, predictUntil: 0 }
    const [h, g] = host.players
    g.x = 400; g.y = 260; host.ball.owner = 'g'
    h.x = 400 - 40; h.y = 260; h.fx = 1
    guest.players[1].x = 400; guest.players[1].y = 260
    stepSoccer(host, { h: inp({ dx: 1, act: true }) }, STEP, { move: new Set(['h']), judge: true })
    for (let i = 0; i < 6; i++) stepSoccer(host, { h: inp({ dx: 1 }) }, STEP, { move: new Set(['h']), judge: true })
    expect(g.act).toBe('down')
    expect(host.ball.owner).not.toBe('g')
    // 늦게 온 옛 위치(kc 0)는 무시
    expect(applyGuest(host, guestPos(guest.players[1], 1, 0))).toBe(false)
    const r = applyWorld(guest, encodeWorld(host), me)
    expect(r.knocked).toBe(true)
    expect(guest.players[1].act).toBe('down')
    expect(applyGuest(host, guestPos(guest.players[1], 1, 0))).toBe(true)
  })

  it('킥오프 소식을 받으면 참가자도 제자리로', () => {
    const host = newSoccerState(seats)
    const guest = newSoccerState(seats)
    const me: SoccerGuestLocal = { myIdx: 1, predictUntil: 0 }
    guest.players[1].x = 100
    host.lastGoal = { team: 'A', by: 'h', own: false }
    host.ko = 1
    const r = applyWorld(guest, encodeWorld(host), me)
    expect(r.kickoff).toBe(true)
    expect(guest.players[1].x).toBeCloseTo(FIELD_W / 2 + 34)
    // 킥오프 전 위치(ko 0)는 방장이 무시
    expect(applyGuest(host, guestPos(guest.players[1], 1, 0))).toBe(false)
  })
})
