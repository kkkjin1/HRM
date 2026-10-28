'use client'

// 개인업무 탭 "자유노트"(PersonalNotesBoard) 디자인을 로그인 없이 바로 보고 다듬기 위한 미리보기.
// 서버 저장 없이 메모리에서만 동작한다 — /mock 접두사는 proxy.ts가 로그인 없이 통과시킨다.
import { useState } from 'react'
import PersonalNotesBoard, { type PersonalNote } from '@/components/PersonalNotesBoard'
import PanZoomPane from '@/components/PanZoomPane'

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
  const [side, setSide] = useState(false)

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
  // 미리보기 전용: 서버 대신 브라우저 임시 주소로 바로 보여준다(저장 값에서는 sanitize가 지운다 — 다시 열면 사라짐).
  async function onUploadImage(file: File) {
    await new Promise(r => setTimeout(r, 600))
    return URL.createObjectURL(file)
  }
  function onReorder(orderedIds: string[]) {
    setNotes(prev => orderedIds.map(id => prev.find(n => n.id === id)).filter((n): n is PersonalNote => !!n))
  }

  return (
    <div className="min-h-screen bg-[#F7F8F8] px-6 py-10">
      <div className={`${side ? 'max-w-[1880px]' : 'max-w-[1240px]'} mx-auto`}>
        <button type="button" onClick={() => setSide(v => !v)} className="mb-3 text-[12px] text-[#2457C5] underline">옆 회의창 미리보기 {side ? '닫기' : '열기'}</button>
        <div className={side ? 'flex flex-col xl:flex-row gap-4 items-start' : ''}>
          <div className="w-full min-w-0 xl:flex-1">
            <PersonalNotesBoard notes={notes} onAdd={onAdd} onSave={onSave} onDelete={onDelete} onReorder={onReorder} onUploadImage={onUploadImage} />
          </div>
          {side && (
            <aside className="w-full xl:w-[50%] bg-white border border-[#E5E8EB] rounded-xl overflow-hidden h-[calc(100vh-150px)] min-h-[560px]">
              <PanZoomPane storageKey="hrm_mock_meeting_side" contentWidth={1400} toolbarLeft={<p className="text-[12px] text-[#7A8491] truncate">👥 팀 미팅 · 미리보기</p>}>
                {/* 실제 회의창처럼 칸보다 넓은 가짜 내용 */}
                <div className="p-8">
                  <input placeholder="회의 제목" className="border rounded px-2 py-1 mb-4" />
                  <table className="w-full border-collapse text-[13px]">
                    <tbody>
                      {Array.from({ length: 30 }, (_, r) => (
                        <tr key={r}>{Array.from({ length: 8 }, (_, c) => <td key={c} className="border px-2 py-2">{r + 1}행 {c + 1}열 내용</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 text-right">← 오른쪽 끝</p>
                </div>
              </PanZoomPane>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
