import type { MemberRole } from '@/lib/data'

export type RouletteMenu = 'meal' | 'coffee' | 'snack'

export type RouletteMember = {
  id: string
  name: string
  role: MemberRole
}

export type WheelSegment = {
  label: string
  memberId: string | null // null = 법인카드
  weight: number
}

// 역할별 지분 풀. 이 상수와 supabase/fun_schema.sql의 roulette_weights()는
// 반드시 동일해야 한다 — 여기는 휠 표시용(클라이언트), 그쪽은 실제 추첨(서버)이다.
const ROLE_POOLS: Record<RouletteMenu, { lead: number; part_lead: number; member: number; corp: number }> = {
  meal: { lead: 40, part_lead: 20, member: 20, corp: 20 },
  coffee: { lead: 30, part_lead: 20, member: 30, corp: 20 },
  snack: { lead: 0, part_lead: 0, member: 100, corp: 0 },
}

export function buildWheel(menu: RouletteMenu, members: RouletteMember[]): WheelSegment[] {
  const pool = ROLE_POOLS[menu]
  const n = members.length
  if (n === 0) return []

  if (menu === 'snack') {
    const weight = pool.member / n
    return members.map(m => ({ label: m.name, memberId: m.id, weight }))
  }

  const roles: MemberRole[] = ['lead', 'part_lead', 'member']
  const byRole: Record<MemberRole, RouletteMember[]> = { lead: [], part_lead: [], member: [] }
  for (const m of members) byRole[m.role].push(m)

  let vacantPool = 0
  const baseWeight = new Map<string, number>()
  for (const role of roles) {
    const group = byRole[role]
    const roleTotal = pool[role]
    if (group.length === 0) {
      vacantPool += roleTotal
    } else {
      const share = roleTotal / group.length
      for (const m of group) baseWeight.set(m.id, share)
    }
  }

  const extra = vacantPool / n
  const segments: WheelSegment[] = members.map(m => ({
    label: m.name,
    memberId: m.id,
    weight: (baseWeight.get(m.id) ?? 0) + extra,
  }))

  if (pool.corp > 0) segments.push({ label: '법인카드', memberId: null, weight: pool.corp })

  return segments
}

export function totalWeight(segments: WheelSegment[]) {
  return segments.reduce((sum, s) => sum + s.weight, 0)
}
