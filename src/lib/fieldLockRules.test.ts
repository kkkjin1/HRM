import { describe, expect, it } from 'vitest'
import { resolveHolders } from './fieldLockRules'

describe('resolveHolders', () => {
  it('아무도 안 잡은 칸은 없다', () => {
    expect(resolveHolders({ a: [{ name: 'A', fields: {} }] })).toEqual({})
  })
  it('먼저 잡은 쪽이 주인', () => {
    const out = resolveHolders({
      s1: [{ name: '김다슬', fields: { agenda: 200 } }],
      s2: [{ name: '박주현', fields: { agenda: 100 } }],
    })
    expect(out.agenda).toEqual({ session: 's2', name: '박주현' })
  })
  it('같은 시각이면 세션 키 순', () => {
    const out = resolveHolders({
      sB: [{ name: 'B', fields: { agenda: 100 } }],
      sA: [{ name: 'A', fields: { agenda: 100 } }],
    })
    expect(out.agenda.session).toBe('sA')
  })
  it('한 세션이 여러 칸을 동시에 잡을 수 있다(앞 칸 저장 중 다음 칸 편집)', () => {
    const out = resolveHolders({ s1: [{ name: 'A', fields: { agenda: 1, 'progress:m1': 2 } }] })
    expect(Object.keys(out).sort()).toEqual(['agenda', 'progress:m1'])
  })
  it('칸마다 따로 판정', () => {
    const out = resolveHolders({
      s1: [{ name: 'A', fields: { agenda: 5, 'progress:m1': 1 } }],
      s2: [{ name: 'B', fields: { agenda: 3 } }],
    })
    expect(out.agenda.name).toBe('B')
    expect(out['progress:m1'].name).toBe('A')
  })
})
