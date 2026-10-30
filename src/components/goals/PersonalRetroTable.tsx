'use client'

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { displayName, displayNameFull, type Member } from '@/lib/members'
import RetroTextarea from './RetroTextarea'

type QAMap = Record<string, Record<string, { question: string; answer: string }>> // asker_id -> target_id -> {question, answer}

const GRID_COLS = 'grid-cols-[160px_minmax(0,1fr)_76px_76px_84px]'

// 미리보기 칸용: 저장 형식(**볼드**, *기울임*, "- " 목록)을 걷어내고 첫 줄만 남긴다.
function previewOf(text: string) {
  const line = text.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  return line.replace(/^- /, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
}

// 개인 회고 표: 팀원 한 명이 한 행이고, 행을 누르면 바로 아래에 고정 높이 칸이 펼쳐진다.
// 펼친 칸은 왼쪽 회고 본문(넓게) / 오른쪽 질문·답변(대화형)이며, 화면 높이에 맞춰 늘어나고 길어지면 각 칸 안에서만 스크롤된다.
// 부모가 월마다 다른 key를 줘서 월이 바뀌면 펼침 상태가 초기화된다.
export default function PersonalRetroTable({
  year, month, members, entries, qas, meId, onSave, onSaveQA,
}: {
  year: number
  month: number
  members: Member[]
  entries: Record<string, string>
  qas: QAMap
  meId: string | null
  onSave: (memberId: string, content: string) => Promise<void>
  onSaveQA: (askerId: string, targetId: string, field: 'question' | 'answer', content: string) => Promise<void>
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  // 펼칠 때 한 번 정한 질문 순서(답변 대기 먼저). 답변을 쓰는 도중 저장되며 순서가 바뀌면
  // 입력칸이 새로 그려져 포커스를 잃기 때문에, 펼쳐 있는 동안에는 순서를 고정한다.
  const [qaOrder, setQaOrder] = useState<string[]>([])
  const [askingFor, setAskingFor] = useState<string | null>(null)

  const pairOf = (askerId: string, targetId: string) => qas[askerId]?.[targetId] ?? { question: '', answer: '' }
  const askersOf = (targetId: string) => members.filter(a => a.id !== targetId && pairOf(a.id, targetId).question.trim())

  function toggle(targetId: string) {
    if (openId === targetId) { setOpenId(null); return }
    const askers = askersOf(targetId).filter(a => a.id !== meId || meId === targetId)
    const waiting = askers.filter(a => !pairOf(a.id, targetId).answer.trim())
    const answered = askers.filter(a => pairOf(a.id, targetId).answer.trim())
    setQaOrder([...waiting, ...answered].map(a => a.id))
    setAskingFor(null)
    setOpenId(targetId)
    // 펼친 행을 화면 위쪽으로 올려, 아래 본문 칸이 한 화면에 다 보이게 한다.
    requestAnimationFrame(() => document.getElementById(`retro-row-${targetId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  return (
    <div className="border border-[#E5E8EB] rounded-[22px] bg-white overflow-x-auto">
      <div className="min-w-[760px]">
        <div className={`grid ${GRID_COLS} gap-3 items-center px-4 py-4 bg-[#EEF2F7] text-[13px] font-bold text-[#1F2933] border-b border-[#D5DCE5] shadow-[inset_0_-1px_0_#D5DCE5]`}>
          <span>팀원</span><span>회고 미리보기</span><span>받은 질문</span><span>답변 대기</span><span>상태</span>
        </div>
        {members.map(member => {
          const body = entries[member.id] ?? ''
          const written = !!body.trim()
          const askers = askersOf(member.id)
          const waitingCount = askers.filter(a => !pairOf(a.id, member.id).answer.trim()).length
          const open = openId === member.id
          return (
            <div key={member.id} id={`retro-row-${member.id}`} className="border-b border-[#EEF0F2] last:border-b-0 scroll-mt-3">
              <button
                type="button"
                onClick={() => toggle(member.id)}
                aria-expanded={open}
                className={`w-full grid ${GRID_COLS} gap-3 items-center px-4 py-3 text-left text-[13.5px] text-[#1F2933] transition-colors ${open ? 'bg-[#F2F6FD]' : 'hover:bg-black/[0.02]'}`}
              >
                <span className="flex items-center gap-2 font-semibold min-w-0">
                  <Avatar member={member} size={24} />
                  <span className="truncate">{displayNameFull(member)}</span>
                </span>
                <span className={`truncate ${written ? 'text-[#3E4A56]' : 'text-[#B0B8C1]'}`}>{written ? previewOf(body) : '아직 작성하지 않았습니다.'}</span>
                <span>{askers.length}</span>
                <span className={waitingCount > 0 ? 'font-bold text-[#9A4A12]' : 'text-[#7A8491]'}>{waitingCount}</span>
                <span className={`justify-self-start text-[11.5px] font-semibold px-2 py-0.5 rounded-md ${written ? 'bg-[#E8F5EE] text-[#1E6B45]' : 'bg-[#F1F3F5] text-[#5F6B78]'}`}>
                  {written ? '작성 완료' : '미작성'}
                </span>
              </button>

              {open && (
                <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 px-4 pt-2 pb-4 bg-[#FBFCFD] h-[max(440px,calc(100vh-190px))]">
                  <div className="flex flex-col min-h-0">
                    <p className="text-[12px] font-semibold text-[#5F6B78] mb-1.5">회고 본문</p>
                    <div className="flex-1 min-h-0 overflow-y-auto bg-white border border-[#E5E8EB] rounded-2xl p-1.5">
                      <RetroTextarea
                        key={`member-${member.id}-${year}-${month}`}
                        value={body}
                        placeholder={`${displayName(member)}님의 ${month}월을 돌아보며 자유롭게 기록해보세요.`}
                        rows={6}
                        heightVh={100}
                        toolbar={false}
                        onSave={content => onSave(member.id, content)}
                      />
                    </div>
                  </div>

                  <QAColumn
                    month={month}
                    target={member}
                    members={members}
                    meId={meId}
                    order={qaOrder}
                    pairOf={pairOf}
                    asking={askingFor === member.id}
                    onAsk={() => setAskingFor(member.id)}
                    onSaveQA={onSaveQA}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QAColumn({
  month, target, members, meId, order, pairOf, asking, onAsk, onSaveQA,
}: {
  month: number
  target: Member
  members: Member[]
  meId: string | null
  order: string[]
  pairOf: (askerId: string, targetId: string) => { question: string; answer: string }
  asking: boolean
  onAsk: () => void
  onSaveQA: (askerId: string, targetId: string, field: 'question' | 'answer', content: string) => Promise<void>
}) {
  const byId = new Map(members.map(m => [m.id, m]))
  const eligible = members.filter(m => m.id !== target.id)
  const notAsked = eligible.filter(m => !pairOf(m.id, target.id).question.trim())
  const askedCount = eligible.length - notAsked.length
  const isTarget = meId === target.id
  const me = meId ? byId.get(meId) : undefined
  // 내 질문은 순서 목록과 별도로 맨 위 고정 칸에서 쓰고 본다(입력 중 칸이 옮겨 다니지 않도록).
  const myPair = me && !isTarget ? pairOf(me.id, target.id) : null
  const showMySlot = !!myPair && (asking || !!myPair.question.trim())

  return (
    <div className="flex flex-col min-h-0">
      <div className="mb-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-[#5F6B78]">
            질문과 답변 · {askedCount} <span className="font-normal">(답변 대기 먼저)</span>
          </p>
          {/* 펼치자마자 보이도록 질문하기 버튼은 제목 줄에 둔다(아래 목록이 길어 스크롤돼도 가려지지 않음) */}
          {myPair && !showMySlot && (
            <button
              type="button"
              onClick={onAsk}
              className="flex-shrink-0 min-h-[32px] px-3 rounded-xl border border-[#B9CBEF] bg-[#F2F6FD] text-[12px] font-semibold text-[#2F5FBF] hover:bg-[#E6EEFC]"
            >
              + 질문하기
            </button>
          )}
        </div>
        <p className="text-[11.5px] text-[#7A8491] mt-0.5">
          질문 참여 {askedCount}/{eligible.length}
          {notAsked.length > 0
            ? ` · 아직 안 한 팀원: ${notAsked.map(m => displayName(m)).join(', ')}`
            : ' · 모두 질문했어요'}
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {showMySlot && me && myPair && (
          <div className="pb-3 border-b border-dashed border-[#DDE2E8]">
            <p className="text-[11px] font-semibold text-[#2F5FBF] mb-1">내 질문</p>
            <QAThreadItem
              key={`qa-mine-${month}-${me.id}-${target.id}`}
              month={month}
              asker={me}
              target={target}
              pair={myPair}
              meId={meId}
              onSaveQA={onSaveQA}
            />
          </div>
        )}
        {order.length === 0 && !showMySlot && (
          <p className="text-[12.5px] text-[#B0B8C1] py-3">아직 질문이 없습니다.</p>
        )}
        {order.map(askerId => {
          const asker = byId.get(askerId)
          if (!asker) return null
          return (
            <QAThreadItem
              key={`qa-${month}-${askerId}-${target.id}`}
              month={month}
              asker={asker}
              target={target}
              pair={pairOf(askerId, target.id)}
              meId={meId}
              onSaveQA={onSaveQA}
            />
          )
        })}
      </div>
    </div>
  )
}

function QAThreadItem({
  month, asker, target, pair, meId, onSaveQA,
}: {
  month: number
  asker: Member
  target: Member
  pair: { question: string; answer: string }
  meId: string | null
  onSaveQA: (askerId: string, targetId: string, field: 'question' | 'answer', content: string) => Promise<void>
}) {
  const canAsk = meId === asker.id
  const canAnswer = meId === target.id
  const hasQuestion = !!pair.question.trim()
  const hasAnswer = !!pair.answer.trim()

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-start">
        <Avatar member={asker} size={24} />
        <div className="flex-1 min-w-0 bg-[#F1F3F5] rounded-[4px_12px_12px_12px] px-1.5 py-1">
          <p className="text-[11px] font-semibold text-[#5F6B78] px-1">{displayName(asker)}의 질문</p>
          <RetroTextarea
            key={`q-${month}-${asker.id}-${target.id}`}
            value={pair.question}
            placeholder={canAsk ? `${displayName(target)}님에게 궁금한 점을 질문해보세요.` : '아직 질문이 없습니다.'}
            rows={1}
            compact
            readOnly={!canAsk}
            onSave={content => onSaveQA(asker.id, target.id, 'question', content)}
          />
        </div>
      </div>
      {hasQuestion && (
        <div className="flex justify-end pl-8">
          {canAnswer || hasAnswer ? (
            <div className="flex-1 min-w-0 bg-[#E6EEFC] rounded-[12px_4px_12px_12px] px-1.5 py-1">
              <p className="text-[11px] font-semibold text-[#2F5FBF] px-1">{displayName(target)}의 답변</p>
              <RetroTextarea
                key={`a-${month}-${asker.id}-${target.id}`}
                value={pair.answer}
                placeholder="답변을 입력해보세요."
                rows={1}
                compact
                readOnly={!canAnswer}
                onSave={content => onSaveQA(asker.id, target.id, 'answer', content)}
              />
            </div>
          ) : (
            <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-[#FDF0E6] text-[#9A4A12]">답변 대기 중</span>
          )}
        </div>
      )}
    </div>
  )
}
