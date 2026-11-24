import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAR_BODIES } from '@/lib/raceCars'
import {
  BASIC_CABIN, PROPS, TRIMS, cabinOf, drawPrice, interiorScore, ownsProp, ownsTrim, palOf, propKey, propPrice, propsOf, rearOf, rearOfRow, trimKey, trimPrice, viewOf,
} from '@/lib/raceInterior'

const sql = readFileSync(join(process.cwd(), 'supabase/race_interior_v3.sql'), 'utf8')
const fnBody = (name: string) => {
  const i = sql.indexOf(`FUNCTION ${name}(`)
  return sql.slice(i, sql.indexOf('$$;', i))
}

describe('🪑 운전석 실내(차마다 실내 3종 + 차마다 소품)', () => {
  it('가격·종류·뽑기 값이 SQL(race_interior_v3.sql)과 같다', () => {
    const price = fnBody('race_interior2_price'), kind = fnBody('race_interior2_kind'), draw = fnBody('race_interior2_draw')
    for (const b of CAR_BODIES) {
      expect(TRIMS[b]).toHaveLength(3)
      expect(trimPrice(b, 0)).toBe(0)
      for (const i of [1, 2]) expect(price, trimKey(b, i)).toContain(`WHEN '${trimKey(b, i)}' THEN ${trimPrice(b, i)}`)
      expect(kind).toContain(b)
      expect(draw, b).toContain(`WHEN '${b}' THEN ${drawPrice(b)}`)
      for (const p of PROPS) for (const v of p.variants) {
        const k = propKey(b, p.key, v.key)
        if (v.get === 'shop') expect(price, k).toContain(`WHEN '${k}' THEN ${propPrice(b, p.key, v.key)}`)
        else expect(price).not.toContain(`'${k}'`)
      }
    }
    for (const p of PROPS) for (const v of p.variants) {
      expect(kind, v.key).toContain(`${p.key}:${v.key}`)
      if (v.get === 'free') expect(draw).not.toContain(`('${p.key}:${v.key}')`)
      else expect(draw, v.key).toContain(`('${p.key}:${v.key}')`)
    }
  })

  it('값은 싸졌고, 비싼 차일수록 실내·소품·뽑기도 조금씩 비싸다', () => {
    for (let i = 1; i < CAR_BODIES.length; i++) {
      const [a, b] = [CAR_BODIES[i - 1], CAR_BODIES[i]]
      expect(trimPrice(b, 1)).toBeGreaterThanOrEqual(trimPrice(a, 1))
      expect(propPrice(b, 'doll', 'dog')).toBeGreaterThanOrEqual(propPrice(a, 'doll', 'dog'))
      expect(drawPrice(b)).toBeGreaterThanOrEqual(drawPrice(a))
    }
    expect(trimPrice('super', 1)).toBeGreaterThan(trimPrice('kart', 1))
    expect(trimPrice('super', 2)).toBeLessThanOrEqual(16)
  })

  it('그랜절부터는 무료 1번도 무드등이 있다', () => {
    for (const b of CAR_BODIES.slice(CAR_BODIES.indexOf('grand'))) expect(TRIMS[b][0].amb, b).toBeTruthy()
  })

  it('소품도 차마다 — 다른 차에서 산 건 이 차에선 없는 것', () => {
    const row = { team: 'kt', interior_owned: [trimKey('lux', 2), propKey('lux', 'doll', 'dog')], interior: { trims: { lux: 2, sport: 1, mini: 0 }, props: { lux: { doll: 'dog', charm: 'star', hands: 'glove' }, sport: { doll: 'dog' } } } }
    expect(ownsTrim(row, 'super', 0)).toBe(true)
    expect(ownsTrim(row, 'sport', 1)).toBe(false)
    expect(ownsProp(row, 'lux', 'doll', 'dog')).toBe(true)
    expect(ownsProp(row, 'sport', 'doll', 'dog')).toBe(false) // 차를 바꾸면 처음부터
    expect(ownsProp(row, 'sport', 'charm', 'none')).toBe(true)
    const c = cabinOf(row)
    expect(c.trims).toEqual({ lux: 2, mini: 0 })
    expect(propsOf(c, 'lux')).toEqual({ doll: 'dog', charm: 'none', hands: 'glove' }) // 별은 없음 → 없음
    expect(propsOf(c, 'sport').doll).toBe('none')
    expect(cabinOf(null)).toEqual(BASIC_CABIN)
  })

  it('1일권으로 빌린 것도 가진 것으로 친다', () => {
    const row = { interior_owned: [], interior_rent: [propKey('sedan', 'charm', 'star')] }
    expect(ownsProp(row, 'sedan', 'charm', 'star')).toBe(true)
    expect(interiorScore(row, 'sedan')).toBe(1)
  })

  it('뒷유리: 그 차에서 산 실내·소품 하나당 +1(최대 5), 다른 차 것은 안 센다', () => {
    const owned = [trimKey('sedan', 1), trimKey('sedan', 2), propKey('sedan', 'doll', 'dog'), propKey('sedan', 'charm', 'ball'), propKey('sedan', 'hands', 'mitten'), propKey('sedan', 'charm', 'star'), trimKey('lux', 1)]
    expect(interiorScore({ interior_owned: [] }, 'sedan')).toBe(0)
    expect(interiorScore({ interior_owned: owned.slice(0, 1) }, 'sedan')).toBe(1)
    expect(interiorScore({ interior_owned: owned.slice(0, 3) }, 'sedan')).toBe(3)
    expect(interiorScore({ interior_owned: owned }, 'sedan')).toBe(5) // 6개여도 최대 5
    expect(interiorScore({ interior_owned: owned }, 'lux')).toBe(1)
    const r = rearOfRow({ team: 'lg', interior_owned: owned, interior: { trims: { sedan: 2 }, props: { sedan: { doll: 'dog' } } } }, 'sedan', 'lg')
    expect(r.score).toBe(5)
    expect(r.doll).toBe('🐶')
    expect(rearOf(viewOf(BASIC_CABIN, 'sedan', 'lg'), 0).glow).toBeNull()
  })

  it('그릴 것 = 차 실내 3종 색 + 선호 구단 로고', () => {
    const v = viewOf({ ...BASIC_CABIN, trims: { super: 1 } }, 'super', 'kia')
    expect(v.skin.base).toBe(TRIMS.super[1].base)
    expect(v.eq.wheel).toEqual({ v: TRIMS.super[1].wheel, team: 'kia' })
    expect(viewOf(BASIC_CABIN, 'grand', null).skin.base).toBe(TRIMS.grand[0].base)
  })

  it('구단 색이 다 정해진다', () => {
    for (const t of [null, 'lg', 'kia', 'samsung', 'doosan', 'kt', 'ssg', 'lotte', 'hanwha', 'nc', 'kiwoom'] as const) {
      const p = palOf(t)
      expect(p.main).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
