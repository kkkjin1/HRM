import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAR_BODIES } from '@/lib/raceCars'
import { BASIC_CABIN, INTERIOR_DRAW_PRICE, PROPS, TRIMS, cabinOf, ownsProp, ownsTrim, palOf, propKey, trimKey, trimPrice, viewOf } from '@/lib/raceInterior'

const sql = readFileSync(join(process.cwd(), 'supabase/race_interior_v2.sql'), 'utf8')
const fnBody = (name: string) => {
  const i = sql.indexOf(`FUNCTION ${name}(`)
  return sql.slice(i, sql.indexOf('$$;', i))
}

describe('🪑 운전석 실내(차마다 3종 + 소품)', () => {
  it('가격·종류가 SQL(race_interior_v2.sql)과 같다', () => {
    const price = fnBody('race_interior2_price'), kind = fnBody('race_interior2_kind'), draw = fnBody('race_interior2_draw')
    for (const b of CAR_BODIES) {
      expect(TRIMS[b]).toHaveLength(3)
      expect(trimPrice(b, 0)).toBe(0)
      for (const i of [1, 2]) expect(price, trimKey(b, i)).toContain(`WHEN '${trimKey(b, i)}' THEN ${trimPrice(b, i)}`)
      expect(kind).toContain(b)
    }
    for (const p of PROPS) for (const v of p.variants) {
      const k = propKey(p.key, v.key)
      if (v.get === 'shop') expect(price, k).toContain(`WHEN '${k}' THEN ${v.price}`)
      else expect(price).not.toContain(`'${k}'`)
      expect(kind, k).toContain(`'${k}'`)
      if (v.get === 'free') expect(draw).not.toContain(`('${k}')`)
      else expect(draw, k).toContain(`('${k}')`)
    }
    expect(draw).toContain(`price int := ${INTERIOR_DRAW_PRICE};`)
  })

  it('비싼 차일수록 실내 값도 비싸다', () => {
    for (let i = 1; i < CAR_BODIES.length; i++) expect(trimPrice(CAR_BODIES[i], 1)).toBeGreaterThan(trimPrice(CAR_BODIES[i - 1], 1))
  })

  it('그랜절부터는 무료 1번도 무드등이 있다', () => {
    for (const b of CAR_BODIES.slice(CAR_BODIES.indexOf('grand'))) expect(TRIMS[b][0].amb, b).toBeTruthy()
  })

  it('1번은 누구나, 나머지는 가진 것만 — 못 가진 장착은 무료로 돌아간다', () => {
    const row = { team: 'kt', interior_owned: [trimKey('lux', 2), propKey('doll', 'dog')], interior: { trims: { lux: 2, sport: 1, mini: 0 }, doll: 'dog', charm: 'star', hands: 'glove' } }
    expect(ownsTrim(row, 'super', 0)).toBe(true)
    expect(ownsTrim(row, 'sport', 1)).toBe(false)
    expect(ownsProp(row, 'charm', 'none')).toBe(true)
    const c = cabinOf(row)
    expect(c.trims).toEqual({ lux: 2, mini: 0 }) // 고르쉐 2번은 없음 → 빠짐(= 무료 1번)
    expect(c.doll).toBe('dog')
    expect(c.charm).toBe('none') // 별은 없음
    expect(cabinOf(null)).toEqual(BASIC_CABIN)
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
