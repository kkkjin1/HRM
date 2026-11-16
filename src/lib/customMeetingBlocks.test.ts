import { describe, expect, it } from 'vitest'
import { columnBlockId, customBlockIdOf, customBlockKey, insertBlockAfter, isCustomBlockVisible, nextDay, normalizeBlockOrder, parseCustomBlocks } from './customMeetingBlocks'

const box = { id: 'abc', icon: '📝', label: '휴직/기타', created_on: '2026-11-17', removed_on: null as string | null, capture: true, columns: [{ label: '' }] }

describe('isCustomBlockVisible', () => {
  it('만든 회의 전에는 안 보인다', () => expect(isCustomBlockVisible(box, '2026-11-13', false)).toBe(false))
  it('만든 회의부터 계속 보인다', () => {
    expect(isCustomBlockVisible(box, '2026-11-17', false)).toBe(true)
    expect(isCustomBlockVisible(box, '2027-03-02', false)).toBe(true)
  })
  it('삭제한 회의부터 안 보이고 그 전 회의엔 남는다', () => {
    const removed = { ...box, removed_on: '2026-12-01' }
    expect(isCustomBlockVisible(removed, '2026-11-24', false)).toBe(true)
    expect(isCustomBlockVisible(removed, '2026-12-01', false)).toBe(false)
    expect(isCustomBlockVisible(removed, '2026-12-08', false)).toBe(false)
  })
  it('그 회의에 카드가 있으면 삭제 뒤에도 보인다', () => {
    expect(isCustomBlockVisible({ ...box, removed_on: '2026-12-01' }, '2026-12-01', true)).toBe(true)
  })
})

describe('normalizeBlockOrder', () => {
  const customs = [box]
  it('저장값이 없으면 기본 박스 뒤에 내가 만든 박스', () => {
    expect(normalizeBlockOrder(null, customs)).toEqual(['pinned', 'today', 'staff', 'report', 'decisions', 'c:abc'])
  })
  it('저장 순서를 지키고 모르는 키·중복은 버린다', () => {
    expect(normalizeBlockOrder(['today', 'c:abc', 'c:zzz', 'today', 'pinned'], customs))
      .toEqual(['today', 'c:abc', 'pinned', 'staff', 'report', 'decisions'])
  })
})

describe('insertBlockAfter', () => {
  it('지정한 박스 바로 아래', () => expect(insertBlockAfter(['a', 'b', 'c'], 'n', 'a')).toEqual(['a', 'n', 'b', 'c']))
  it('모르는 키면 맨 뒤', () => expect(insertBlockAfter(['a', 'b'], 'n', 'x')).toEqual(['a', 'b', 'n']))
})

describe('parseCustomBlocks', () => {
  it('깨진 항목·중복 id는 버린다', () => {
    expect(parseCustomBlocks([box, { ...box }, { id: 'x' }, null, { id: 'd', label: ' 근태2 ', created_on: '2026-11-17', removed_on: 'bad' }]))
      .toEqual([box, { id: 'd', icon: '📝', label: '근태2', created_on: '2026-11-17', removed_on: null, capture: true, columns: [{ label: '' }] }])
  })
  it('목록에 없는 아이콘은 기본 아이콘', () => {
    expect(parseCustomBlocks([{ ...box, icon: '🏖️' }, { ...box, id: 'e', icon: 'x' }]).map(b => b.icon)).toEqual(['🏖️', '📝'])
  })
  it('키 변환', () => {
    expect(customBlockIdOf(customBlockKey('abc'))).toBe('abc')
    expect(customBlockIdOf('today')).toBe(null)
  })
})

describe('nextDay', () => {
  it('월말·연말 넘김', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01')
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
  })
})

describe('캡처·칸 설정', () => {
  it('예전 저장값은 캡처 켬·1칸', () => {
    expect(parseCustomBlocks([{ id: 'o', label: '옛 박스', created_on: '2026-11-16' }])[0]).toMatchObject({ capture: true, columns: [{ label: '' }] })
  })
  it('캡처 끔·2칸, 3칸 이상은 2칸까지만', () => {
    const b = parseCustomBlocks([{ ...box, capture: false, columns: [{ label: ' 휴직 ' }, { label: '기타' }, { label: '버림' }] }])[0]
    expect(b.capture).toBe(false)
    expect(b.columns).toEqual([{ label: '휴직' }, { label: '기타' }])
  })
  it('칸별 block_id', () => {
    expect(columnBlockId('abc', 0)).toBe('abc')
    expect(columnBlockId('abc', 1)).toBe('abc-2')
  })
})
