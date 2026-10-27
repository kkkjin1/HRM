import { describe, expect, it } from 'vitest'
import { dashToBullet } from './dashBullet'

// textarea 대신 쓰는 작은 가짜 — 값과 커서만 흉내 낸다.
function fake(value: string, caret = value.length) {
  const el = { value, selectionStart: caret, selectionEnd: caret, setSelectionRange: (a: number, b: number) => { el.selectionStart = a; el.selectionEnd = b } }
  return el as unknown as HTMLTextAreaElement
}

describe('줄 맨 앞 "- " → "• "', () => {
  it('첫 줄 맨 앞', () => expect(dashToBullet(fake('- '))).toBe('• '))
  it('둘째 줄 맨 앞', () => expect(dashToBullet(fake('안건\n- '))).toBe('안건\n• '))
  it('줄 중간의 "- "는 그대로', () => expect(dashToBullet(fake('a - '))).toBe('a - '))
  it('커서 뒤 글은 유지', () => {
    const el = fake('- 뒤', 2)
    expect(dashToBullet(el)).toBe('• 뒤')
    expect(el.selectionStart).toBe(2)
  })
})
