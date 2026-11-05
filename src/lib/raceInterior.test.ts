import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERIOR_DRAW_PRICE, SLOTS, TEAM_KEYS, defaultEquip, interiorOf, itemKey, ownsInterior, palOf } from '@/lib/raceInterior'

const sql = readFileSync(join(process.cwd(), 'supabase/add_race_interior.sql'), 'utf8')
const fnBody = (name: string) => {
  const i = sql.indexOf(`FUNCTION ${name}(`)
  return sql.slice(i, sql.indexOf('$$;', i))
}

describe('🪑 운전석 실내 꾸미기', () => {
  it('종류·가격이 SQL(add_race_interior.sql)과 같다', () => {
    const kind = fnBody('race_interior_kind'), price = fnBody('race_interior_price'), draw = fnBody('race_interior_draw')
    for (const s of SLOTS) for (const v of s.variants) {
      expect(kind, `${s.key}:${v.key}`).toContain(`WHEN '${s.key}:${v.key}' THEN '${v.get}'`)
      if (v.get === 'shop') expect(price, `${s.key}:${v.key}`).toContain(`WHEN '${s.key}:${v.key}' THEN ${v.price}`)
      else expect(price).not.toContain(`'${s.key}:${v.key}'`)
      // 뽑기 후보 = 상점 + 뽑기 종류(무료 빼고)
      if (v.get === 'free') expect(draw).not.toContain(`('${s.key}','${v.key}')`)
      else expect(draw, `${s.key}:${v.key}`).toContain(`('${s.key}','${v.key}')`)
    }
    expect(draw).toContain(`price int := ${INTERIOR_DRAW_PRICE};`)
    for (const s of SLOTS) expect(fnBody('race_interior_set')).toContain(`'${s.key}'`)
    expect(TEAM_KEYS.length).toBe(11)
  })

  it('무료 종류는 모든 구단, 나머지는 가진 조합만 — 못 가진 장착은 무료로 돌아간다', () => {
    const row = { team: 'kt', interior_owned: [itemKey('wheel', 'race', 'kiwoom')], interior: { wheel: { v: 'race', team: 'kiwoom' }, dash: { v: 'carbon', team: 'ssg' }, screen: { v: 'basic', team: 'lg' } } }
    expect(ownsInterior(row, 'wheel', 'toy', 'nc')).toBe(true)
    expect(ownsInterior(row, 'wheel', 'race', 'kiwoom')).toBe(true)
    expect(ownsInterior(row, 'wheel', 'race', 'kt')).toBe(false)
    const eq = interiorOf(row)
    expect(eq.wheel).toEqual({ v: 'race', team: 'kiwoom' })
    expect(eq.dash).toEqual({ v: 'smooth', team: 'kt' }) // 카본 SSG는 없음 → 무료 + 선호 구단
    expect(eq.screen).toEqual({ v: 'basic', team: 'lg' }) // 무료 종류는 아무 구단이나
    expect(interiorOf(null)).toEqual(defaultEquip(null))
  })

  it('구단 색이 다 정해진다(포인트 색은 어두우면 밝은 색으로)', () => {
    for (const t of TEAM_KEYS) {
      const p = palOf(t)
      expect(p.main).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.dash).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
