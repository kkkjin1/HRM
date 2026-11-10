import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACH_PARTS, FREE_PARTS, PART_PRICE, partState, type ClosetRow } from './bombCloset'
import { BACKS, FACES, HATS, OUTFITS, SPECIES, BODY_COLORS } from '@/components/playground/bomb/Critter'

const sql = readFileSync('supabase/add_bomb_closet.sql', 'utf8')
const row = (o: Partial<ClosetRow> = {}): ClosetRow => ({ member_id: 'm', look: null, coins: 0, owned: [], games: 0, wins: 0, rescues: 0, pops: 0, hits: 0, ...o })

describe('가격·목록이 SQL과 같다', () => {
  it('상점 가격', () => {
    const fromSql = Object.fromEntries([...sql.matchAll(/WHEN '(\w+)' THEN (\d+)/g)].map(m => [m[1], Number(m[2])]))
    expect(fromSql).toEqual(PART_PRICE)
  })
  it('무료 부품·업적 조건', () => {
    for (const p of FREE_PARTS.filter(p => p !== 'none')) expect(sql).toContain(`'${p}'`)
    for (const [k, a] of Object.entries(ACH_PARTS)) expect(sql).toContain(`WHEN p_part = '${k}' THEN c.${a.stat} >= ${a.need}`)
  })
  it('모든 부품이 가격·무료·업적 중 하나', () => {
    for (const [k] of [...HATS, ...FACES, ...OUTFITS, ...BACKS]) {
      const kinds = [PART_PRICE[k] ? 1 : 0, FREE_PARTS.includes(k) ? 1 : 0, ACH_PARTS[k] ? 1 : 0].reduce((a, b) => a + b)
      expect(kinds, k).toBe(1)
      expect(sql, k).toContain(`'${k}'`)
    }
  })
  it('캐릭터·색 목록', () => {
    for (const s of SPECIES) expect(sql).toContain(`'${s.key}'`)
    for (const c of BODY_COLORS) expect(sql).toContain(`'${c}'`)
  })
})

describe('부품 상태', () => {
  it('무료·상점·업적', () => {
    expect(partState(row(), 'scarf').kind).toBe('have')
    expect(partState(row(), 'cap')).toEqual({ kind: 'shop', price: 15 })
    expect(partState(row({ owned: ['cap'] }), 'cap').kind).toBe('have')
    expect(partState(row({ rescues: 7 }), 'wings')).toMatchObject({ kind: 'ach', cur: 7, need: 20 })
    expect(partState(row({ rescues: 20 }), 'wings').kind).toBe('have')
  })
})
