'use client'

// 개인업무 탭 "자유노트"(PersonalNotesBoard) 디자인을 로그인 없이 바로 보고 다듬기 위한 미리보기.
// 서버 저장 없이 메모리에서만 동작한다 — /mock 접두사는 proxy.ts가 로그인 없이 통과시킨다.
import { useState } from 'react'
import PersonalNotesBoard, { type PersonalNote } from '@/components/PersonalNotesBoard'

let seq = 4
const now = new Date().toISOString()
const INITIAL: PersonalNote[] = [
  { id: '1', title: '이번 주 집중', content: '<div>- 신규 입사자 온보딩 자료 정리</div><div>- <b>1:1 면담</b> 일정 잡기</div>', sort_order: 0, created_at: now, updated_at: now },
  { id: '4', title: '평가 보상 개편 메모', content: '<h1>배경</h1><p>올해 평가는 <mark data-color="#FEF08A" style="background-color: #FEF08A; color: inherit">등급 분포</mark>가 상위로 몰렸다.</p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><div><p>작년 분포 정리</p></div></li><li data-checked="false" data-type="taskItem"><div><p>경영진 보고 초안</p></div></li></ul><blockquote><p>상대평가 전환은 신중하게</p></blockquote><table><tbody><tr><th><p>등급</p></th><th><p>비율</p></th></tr><tr><td><p>S</p></td><td><p>10%</p></td></tr></tbody></table>', sort_order: 3, created_at: now, updated_at: now },
  { id: '2', title: '아이디어', content: '<div><mark style="background-color:#FEF08A">점심 랜덤 매칭</mark> 월 1회 해보면 어떨지</div>', sort_order: 1, created_at: now, updated_at: now },
  { id: '3', title: '', content: '', sort_order: 2, created_at: now, updated_at: now },
]

export default function PersonalNotesMockPage() {
  const [notes, setNotes] = useState<PersonalNote[]>(INITIAL)

  async function onAdd(): Promise<PersonalNote | null> {
    const note: PersonalNote = { id: String(++seq), title: '', content: '', sort_order: notes.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    setNotes(prev => [...prev, note])
    return note
  }
  async function onSave(id: string, title: string, content: string) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title, content, updated_at: new Date().toISOString() } : n))
  }
  async function onDelete(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
  }
  function onReorder(orderedIds: string[]) {
    setNotes(prev => orderedIds.map(id => prev.find(n => n.id === id)).filter((n): n is PersonalNote => !!n))
  }

  return (
    <div className="min-h-screen bg-[#F7F8F8] px-6 py-10">
      <div className="max-w-[1240px] mx-auto">
        <PersonalNotesBoard notes={notes} onAdd={onAdd} onSave={onSave} onDelete={onDelete} onReorder={onReorder} />
      </div>
    </div>
  )
}
