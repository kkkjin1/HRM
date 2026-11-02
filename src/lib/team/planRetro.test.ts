import { describe, expect, it } from 'vitest'
import { actionTitle, answerId, missingRequired, normalizeRetroQuestions, type PlanRetroQuestion } from './planRetro'

// 팀빌딩 회고 질문 — 저장값 정리, 필수 미답변 계산

describe('normalizeRetroQuestions', () => {
  it('배열이 아니면 빈 목록, key·text 없는 항목과 중복 key는 버린다', () => {
    expect(normalizeRetroQuestions(null)).toEqual([])
    expect(normalizeRetroQuestions({ key: 'q1' })).toEqual([])
    expect(normalizeRetroQuestions([
      { key: 'q1', text: ' 질문 ', required: true },
      { key: 'q1', text: '중복' },
      { key: '', text: '키 없음' },
      { key: 'q2', text: '' },
      { key: 'q3', text: '선택', required: 'yes' },
      'x',
    ])).toEqual([{ key: 'q1', text: '질문', required: true }, { key: 'q3', text: '선택', required: false }])
  })
})

describe('missingRequired', () => {
  const qs: PlanRetroQuestion[] = [
    { action_id: 'c', category: 'explore', focus: '체감', key: 'q1', text: '1', required: true },
    { action_id: 'c', category: 'explore', focus: '체감', key: 'q2', text: '2', required: true },
    { action_id: 'c', category: 'explore', focus: '체감', key: 'q3', text: '3', required: false },
  ]
  it('필수만 세고, 공백 답은 안 한 것으로 본다', () => {
    const answers = new Map([[answerId('c', 'm1', 'q1'), '답'], [answerId('c', 'm1', 'q2'), '  '], [answerId('c', 'm2', 'q1'), '답']])
    expect(missingRequired(qs, answers, 'm1')).toBe(1)
    expect(missingRequired(qs, answers, 'm2')).toBe(1)
    expect(missingRequired(qs, answers, 'm3')).toBe(2)
    expect(missingRequired([], answers, 'm3')).toBe(0)
  })
  it('액션 제목', () => {
    expect(actionTitle(qs[0])).toBe('C. 미확인 탐색 — 체감')
  })
})
