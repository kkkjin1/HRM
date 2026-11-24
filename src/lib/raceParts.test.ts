import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BASIC_CAR, RACE_PARTS, SLOT_PARTS, carOf, equipPayload } from '@/lib/raceGarage'

const sql = readFileSync(join(process.cwd(), 'supabase/race_parts_v2.sql'), 'utf8')

describe('🛒 외관 부품(2026-11-24 초기화 + 헬멧·네온·오라)', () => {
  it('가격·장착 부위가 SQL(race_parts_v2.sql)과 같다', () => {
    for (const p of RACE_PARTS) expect(sql, p.key).toContain(`WHEN '${p.key}' THEN ${p.price}`)
    const loop = sql.slice(sql.indexOf('FOREACH k IN ARRAY'), sql.indexOf('LOOP', sql.indexOf('FOREACH k IN ARRAY')))
    for (const s of SLOT_PARTS) expect(loop, s).toContain(`'${s}'`)
  })

  it('새 부품도 가진 것만 장착으로 읽고, 저장할 때 같이 보낸다', () => {
    const row = { member_id: 'a', team: 'kia', coins: 0, owned: ['neon'], equipped: { neon: 'own', aura: 'own', body: 'kart' } }
    const car = carOf(row)
    expect(car.neon).toBe('own')
    expect(car.aura).toBe(false) // 안 산 오라는 빠짐
    expect(equipPayload(car)).toEqual({ body: 'kart', neon: 'own' })
    expect(equipPayload(BASIC_CAR)).toEqual({ body: 'kart' })
  })
})
