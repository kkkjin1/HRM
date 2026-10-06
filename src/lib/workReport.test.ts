import { describe, expect, it } from 'vitest'
import { fieldText, fieldVersion, isVisibleOn, mergeCell, pickPrevious, sortReportItems } from './workReport'

describe('isVisibleOn', () => {
  const item = { start_date: '2026-10-12', closed_on: null as string | null }
  it('시작 회의 전에는 안 보인다', () => expect(isVisibleOn(item, '2026-10-07')).toBe(false))
  it('시작 회의부터 보인다', () => expect(isVisibleOn(item, '2026-10-12')).toBe(true))
  it('완료 전이면 계속 보인다', () => expect(isVisibleOn(item, '2026-12-01')).toBe(true))
  it('완료한 회의에는 남고 다음 회의부터 사라진다', () => {
    const closed = { ...item, closed_on: '2026-10-14' }
    expect(isVisibleOn(closed, '2026-10-14')).toBe(true)
    expect(isVisibleOn(closed, '2026-10-19')).toBe(false)
    expect(isVisibleOn(closed, '2026-10-12')).toBe(true)
  })
})

describe('pickPrevious', () => {
  const row = (item_id: string, meeting_date: string, update_text: string, feedback = '') => ({ item_id, meeting_date, update_text, feedback })
  it('이번 회의보다 앞선 것 중 가장 최근을 고른다', () => {
    const prev = pickPrevious([row('a', '2026-10-12', '첫'), row('a', '2026-10-14', '둘'), row('a', '2026-10-19', '이번')], '2026-10-19')
    expect(prev.a).toEqual({ meeting_date: '2026-10-14', update_text: '둘', feedback: '' })
  })
  it('같은 날짜·이후 회의는 지난 기록이 아니다', () => {
    expect(pickPrevious([row('a', '2026-10-19', 'x'), row('a', '2026-10-21', 'y')], '2026-10-19')).toEqual({})
  })
  it('빈 칸은 건너뛰고 그 전 기록을 보여준다', () => {
    const prev = pickPrevious([row('a', '2026-10-12', '내용'), row('a', '2026-10-14', '  ')], '2026-10-19')
    expect(prev.a.meeting_date).toBe('2026-10-12')
  })
  it('피드백만 있어도 기록으로 친다', () => {
    expect(pickPrevious([row('a', '2026-10-14', '', '확인')], '2026-10-19').a.feedback).toBe('확인')
  })
})

describe('mergeCell', () => {
  const cell = (uv: number, ut: string, fv: number, fb: string) => ({
    id: 'c', item_id: 'a', meeting_id: 'm', update_text: ut, update_version: uv, feedback: fb, feedback_version: fv, updated_at: null, updated_by: null,
  })
  it('필드별로 더 높은 version을 남긴다', () => {
    const out = mergeCell(cell(3, '최신 업데이트', 1, '옛 피드백'), cell(2, '옛 업데이트', 2, '새 피드백'))
    expect([out.update_text, out.update_version, out.feedback, out.feedback_version]).toEqual(['최신 업데이트', 3, '새 피드백', 2])
  })
  it('이전 값이 없으면 새 값 그대로', () => {
    expect(mergeCell(undefined, cell(1, 'x', 0, '')).update_text).toBe('x')
  })
})

describe('fieldText / fieldVersion', () => {
  it('칸이 없으면 빈 값과 version 0', () => {
    expect(fieldText(undefined, 'update')).toBe('')
    expect(fieldVersion(undefined, 'feedback')).toBe(0)
  })
})

describe('sortReportItems', () => {
  it('sort_order, 같으면 생성순', () => {
    const out = sortReportItems([
      { id: 'c', sort_order: 1, created_at: '2026-10-01T00:00:00Z' },
      { id: 'b', sort_order: 0, created_at: '2026-10-02T00:00:00Z' },
      { id: 'a', sort_order: 0, created_at: '2026-10-01T00:00:00Z' },
    ])
    expect(out.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })
})
