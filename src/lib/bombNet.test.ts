import { describe, expect, it } from 'vitest'
import { FUSE_SEC, hitPlayer, newBombState, stepBomb, type BombState } from './bomb'
import { applyGuest, applyWorld, encodeWorld, fastForward, shouldSendPos, type GuestLocal } from './bombNet'

const seats = [{ id: 'h', team: 'A' as const }, { id: 'g', team: 'B' as const }]
const pair = () => ({ host: newBombState(5, seats, 0.7, 'versus'), guest: newBombState(5, seats, 0.7, 'versus') })
const DT = 1 / 60
const adv = (s: BombState, sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) stepBomb(s, {}, DT) }
const local = (): GuestLocal => ({ myId: 'g', hitAt: null, pending: [] })
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

describe('방장 소식 반영', () => {
  it('같은 시드면 처음 판이 같다', () => {
    const { host, guest } = pair()
    expect(host.grid).toEqual(guest.grid)
  })
  it('소식을 받으면 폭탄·상자·상대 위치가 맞춰지고 내 위치는 그대로', () => {
    const { host, guest } = pair()
    host.players[0].x = 3
    host.bombs.push({ id: 1, cx: 5, cy: 5, owner: 'h', range: 1, placedAt: 0, explodeAt: FUSE_SEC })
    host.players[1].x = 9 // 방장이 알고 있는 (옛) 내 위치
    guest.players[1].x = 12
    applyWorld(guest, json(encodeWorld(host)), local(), 0)
    expect(guest.players[0].x).toBe(3)
    expect(guest.bombs.length).toBe(1)
    expect(guest.players[1].x).toBe(12)
  })
  it('늦게 온 소식이면 지금 시각까지 폭탄 터짐을 다시 돌린다', () => {
    const { host, guest } = pair()
    host.bombs.push({ id: 1, cx: 7, cy: 7, owner: 'h', range: 1, placedAt: 0, explodeAt: 1 })
    adv(host, 0.9)
    const msg = json(encodeWorld(host)) // t=0.9 소식, 아직 안 터짐
    applyWorld(guest, msg, local(), 1.1) // 받는 쪽은 이미 1.1초
    expect(guest.bombs.length).toBe(0)
    expect(guest.flames.length).toBeGreaterThan(0)
    expect(guest.t).toBeCloseTo(1.1, 5)
  })
  it('내가 맞았다고 알렸는데 방장 소식이 아직 살아 있다고 하면 유령 유지', () => {
    const { host, guest } = pair()
    adv(host, 0.5); adv(guest, 0.5)
    hitPlayer(guest, guest.players[1], 'h')
    const me = local(); me.hitAt = guest.t
    applyWorld(guest, json(encodeWorld(host)), me, guest.t)
    expect(guest.players[1].status).toBe('ghost')
  })
  it('내가 막 놓은 폭탄은 소식에 없어도 잠깐 남겨 둔다', () => {
    const { host, guest } = pair()
    const b = { id: -1, cx: 13, cy: 11, owner: 'g', range: 1, placedAt: 0.2, explodeAt: 0.2 + FUSE_SEC }
    guest.bombs.push(b)
    const me = local(); me.pending = [b]
    adv(host, 0.25)
    applyWorld(guest, json(encodeWorld(host)), me, 0.3)
    expect(guest.bombs.some(o => o.cx === 13 && o.cy === 11)).toBe(true)
  })
})

describe('참가자 소식 반영(방장)', () => {
  it('위치·폭탄·피격을 반영한다', () => {
    const { host } = pair()
    adv(host, 1)
    expect(applyGuest(host, { k: 'p', id: 'g', x: 12.5, y: 11, d: 2, m: 1 })).toBe(true)
    expect(host.players[1].x).toBe(12.5)
    expect(applyGuest(host, { k: 'b', id: 'g', cx: 13, cy: 11, at: 0.95 })).toBe(true)
    expect(host.bombs[0].explodeAt).toBeCloseTo(0.95 + FUSE_SEC, 3)
    // 같은 칸에 또는 안 됨, 개수 한도
    expect(applyGuest(host, { k: 'b', id: 'g', cx: 13, cy: 11, at: 1 })).toBe(false)
    expect(applyGuest(host, { k: 'h', id: 'g', by: 'h', at: 1 })).toBe(true)
    expect(host.players[1].status).toBe('ghost')
  })
  it('너무 늦게 온 폭탄은 0.4초까지만 앞당긴다', () => {
    const { host } = pair()
    adv(host, 2)
    applyGuest(host, { k: 'b', id: 'g', cx: 13, cy: 11, at: 0.5 })
    expect(host.bombs[0].placedAt).toBeCloseTo(host.t - 0.4, 3)
  })
})

describe('보내기 간격', () => {
  it('가만히 있으면 박동 간격만, 움직이면 최소 간격마다', () => {
    const last = { x: 1, y: 1, d: 1, m: 0 as const, at: 0 }
    expect(shouldSendPos(last, { x: 1, y: 1, d: 1, m: 0 }, 200)).toBe(false)
    expect(shouldSendPos(last, { x: 1, y: 1, d: 1, m: 0 }, 500)).toBe(true)
    expect(shouldSendPos(last, { x: 1.5, y: 1, d: 3, m: 1 }, 100)).toBe(false)
    expect(shouldSendPos(last, { x: 1.5, y: 1, d: 3, m: 1 }, 150)).toBe(true)
  })
})

describe('fastForward', () => {
  it('판정(승패)은 하지 않는다', () => {
    const { guest } = pair()
    hitPlayer(guest, guest.players[0], 'g')
    fastForward(guest, 1)
    expect(guest.winner).toBeNull()
  })
})
