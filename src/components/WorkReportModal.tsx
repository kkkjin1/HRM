'use client'

// 회의수정 서랍 → 팀원 카드의 [업무보고] — 그 팀원의 업무 행을 표로 크게 띄운다.
// 행은 회의마다 복사하지 않고 "아직 완료 안 한 업무"가 그대로 이어서 보인다(lib/workReport).
// 간편함이 1원칙: 칸에서 벗어나면 자동 저장, 업무명에서 Enter → 맨 아래 새 업무 입력으로 이동.

import { Fragment, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import Avatar from '@/components/Avatar'
import ClickableAvatar from '@/components/ClickableAvatar'
import type { Member } from '@/lib/members'
import type { WorkReportState } from '@/lib/useWorkReport'
import { REPORT_TEXT_MAX, REPORT_TITLE_MAX, type OpenAction, type ReportField, type ReportItem } from '@/lib/workReport'

// 이번 회의의 결정사항/액션아이템 중 업무보고 행에서 등록한 것(page의 meetingItems에서 report_item_id로 거름).
export type LinkedMeetingItem = {
  id: string; kind: 'decision' | 'action'; content: string; owner: string; due_date: string | null; done: boolean; report_item_id: string
}

type AvatarMember = Parameters<typeof ClickableAvatar>[0]['member']

type Props = {
  wr: WorkReportState
  members: Pick<Member, 'id' | 'name'>[]
  memberId: string
  onMemberChange: (memberId: string) => void
  avatarFor: (name: string) => AvatarMember
  onClose: () => void
  linked: LinkedMeetingItem[]
  // 행에서 이번 회의 결정사항/액션아이템으로 등록 — 기존 결정사항/액션 추가 로직(액션은 일정 자동 연동 포함)을 그대로 탄다.
  onAddLinked: (item: ReportItem, kind: 'decision' | 'action', content: string, dueDate: string) => Promise<boolean>
  onToggleLinked: (action: LinkedMeetingItem) => void
  onCompletePriorAction: (action: OpenAction) => void
}

type Composer = { itemId: string; kind: 'decision' | 'action'; text: string; due: string }

// 내용 길이에 맞춰 높이가 늘어나는 textarea — 표 행 높이가 글 양에 따라 자연스럽게 맞춰진다.
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

const fmtShort = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export default function WorkReportModal({ wr, members, memberId, onMemberChange, avatarFor, onClose, linked, onAddLinked, onToggleLinked, onCompletePriorAction }: Props) {
  const [composer, setComposer] = useState<Composer | null>(null)
  const [composerSaving, setComposerSaving] = useState(false)

  async function submitComposer(item: ReportItem) {
    if (!composer || composerSaving || !composer.text.trim()) return
    setComposerSaving(true)
    const ok = await onAddLinked(item, composer.kind, composer.text, composer.due)
    setComposerSaving(false)
    if (ok) setComposer(null)
  }
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [newTitle, setNewTitle] = useState('')
  const newInputRef = useRef<HTMLInputElement>(null)

  const member = members.find(m => m.id === memberId)
  const rows = wr.items.filter(i => i.member_id === memberId)
  const countFor = (id: string) => wr.items.filter(i => i.member_id === id && !wr.isDoneHere(i)).length

  // 앞 행 저장 응답을 기다리지 않는다 — 연달아 Enter로 여러 업무를 빠르게 적을 수 있게(순서는 생성 시각으로 맞춰짐).
  async function submitNew() {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const item = await wr.addItem(memberId, title)
    if (!item) setNewTitle(cur => cur || title) // 실패하면 (새로 입력 중이 아닐 때) 입력값을 되돌려 다시 시도할 수 있게 한다
  }

  async function commitTitle(item: ReportItem) {
    const draft = titleDrafts[item.id]
    if (draft === undefined) return
    if (!draft.trim()) { setTitleDrafts(p => { const n = { ...p }; delete n[item.id]; return n }); return } // 빈 업무명은 저장하지 않고 원래 이름으로
    await wr.renameItem(item, draft.slice(0, REPORT_TITLE_MAX))
    setTitleDrafts(p => { const n = { ...p }; delete n[item.id]; return n })
  }

  function cell(item: ReportItem, field: ReportField, placeholder: string) {
    const failed = wr.failures[wr.failureKey(item.id, field)]
    return (
      <div className={failed ? 'bg-red-50' : ''}>
        <AutoTextarea
          value={wr.value(item.id, field)}
          onChange={e => wr.change(item.id, field, e.target.value.slice(0, REPORT_TEXT_MAX))}
          onBlur={() => wr.blur(item.id, field)}
          placeholder={placeholder}
          className="block w-full min-h-[36px] text-[13px] text-[#3A4249] leading-relaxed px-2.5 py-2 bg-transparent border-0 focus:outline-none focus:bg-[#F5F8FE] resize-none overflow-hidden"
        />
        {failed && (
          <div className="flex items-center gap-2 px-2.5 pb-1.5">
            <span className="text-[11px] text-red-500">저장 실패</span>
            <button type="button" onClick={() => wr.retry(item.id, field)} className="text-[11px] font-medium text-red-600 hover:underline">다시 시도</button>
          </div>
        )}
      </div>
    )
  }

  const c = wr.conflict
  const conflictItem = c ? wr.items.find(i => i.id === c.itemId) : undefined

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[1280px] h-[88vh] flex flex-col overflow-hidden">
        {/* 상단: 팀원 탭 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#EEF0F2] flex-shrink-0">
          <p className="text-[15px] font-semibold text-[#1F2933] flex-shrink-0">업무보고</p>
          {wr.date && <span className="text-[12px] text-[#9AA3AE] flex-shrink-0">{fmtShort(wr.date)} 회의</span>}
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => onMemberChange(m.id)}
                className={`inline-flex items-center gap-1.5 text-[12.5px] rounded-full pl-1 pr-2.5 py-1 flex-shrink-0 ${m.id === memberId ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
              >
                <Avatar member={avatarFor(m.name)} size={18} />
                {m.name}
                <span className="text-[11px] opacity-70">{countFor(m.id)}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-[13px] font-medium text-[#7A8491] hover:text-[#1F2933] px-2.5 py-1.5 rounded-md hover:bg-black/[0.04] flex-shrink-0">닫기</button>
        </div>

        {/* 표 */}
        <div className="flex-1 overflow-auto">
          {!wr.loaded ? (
            <p className="text-[12.5px] text-[#B0B8C1] py-10 text-center">불러오는 중…</p>
          ) : (
            <table className="w-full min-w-[1180px] border-collapse table-fixed">
              <colgroup>
                <col style={{ width: 190 }} />
                <col style={{ width: 260 }} />
                <col />
                <col style={{ width: 220 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#FAFBFB]">
                <tr className="text-left text-[11.5px] font-semibold text-[#7A8491] border-b border-[#EEF0F2]">
                  <th className="px-3 py-2">업무명</th>
                  <th className="px-3 py-2">지난 업데이트</th>
                  <th className="px-3 py-2 text-[#1F2933]">이번 업데이트</th>
                  <th className="px-3 py-2">피드백</th>
                  <th className="px-3 py-2">결정·액션</th>
                  <th className="px-1 py-2 text-center">완료</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(item => {
                  const done = wr.isDoneHere(item)
                  const prev = wr.previous[item.id]
                  const mine = linked.filter(l => l.report_item_id === item.id)
                  const prior = wr.openActions.filter(a => a.report_item_id === item.id)
                  const composing = composer?.itemId === item.id ? composer : null
                  return (
                    <Fragment key={item.id}>
                    <tr className={`align-top border-b border-[#F2F3F5] group ${done ? 'bg-[#FAFBFB]' : ''}`}>
                      <td className="border-r border-[#F2F3F5]">
                        <input
                          value={titleDrafts[item.id] ?? item.title}
                          onChange={e => setTitleDrafts(p => ({ ...p, [item.id]: e.target.value }))}
                          onBlur={() => { void commitTitle(item) }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); newInputRef.current?.focus() } }}
                          placeholder="업무명"
                          className={`w-full text-[13px] font-medium px-3 py-2 bg-transparent border-0 focus:outline-none focus:bg-[#F5F8FE] ${done ? 'line-through text-[#B0B8C1]' : 'text-[#1F2933]'}`}
                        />
                      </td>
                      <td className="border-r border-[#F2F3F5] bg-[#FAFBFB] px-3 py-2">
                        {prev ? (
                          <>
                            <p className="text-[10.5px] text-[#9AA3AE] mb-0.5">{fmtShort(prev.meeting_date)}</p>
                            {prev.update_text && <p className="text-[12.5px] text-[#5B6570] leading-relaxed whitespace-pre-wrap break-words">{prev.update_text}</p>}
                            {prev.feedback && <p className="text-[12px] text-[#4C7FE0] leading-relaxed whitespace-pre-wrap break-words mt-1">↳ {prev.feedback}</p>}
                          </>
                        ) : (
                          <p className="text-[12px] text-[#C9CFD5]">—</p>
                        )}
                      </td>
                      <td className="border-r border-[#F2F3F5]">{cell(item, 'update', '이번 업데이트')}</td>
                      <td className="border-r border-[#F2F3F5]">{cell(item, 'feedback', '피드백')}</td>
                      <td className="border-r border-[#F2F3F5] px-2.5 py-2">
                        <ul className="space-y-1">
                          {mine.map(l => (
                            <li key={l.id} className="flex items-start gap-1.5 text-[12px] leading-snug">
                              {l.kind === 'decision' ? (
                                <span className="flex-shrink-0 text-[10.5px] font-semibold text-[#7A5AF8] bg-[#7A5AF8]/10 rounded px-1 py-px">결정</span>
                              ) : (
                                <input type="checkbox" checked={l.done} onChange={() => onToggleLinked(l)} className="flex-shrink-0 mt-0.5" title="액션 완료" />
                              )}
                              <span className={`flex-1 break-words ${l.done ? 'line-through text-[#B0B8C1]' : 'text-[#3A4249]'}`}>
                                {l.content}{l.due_date && <span className="text-[#9AA3AE]"> · {fmtShort(l.due_date)}</span>}
                              </span>
                            </li>
                          ))}
                          {prior.map(a => (
                            <li key={a.id} className="flex items-start gap-1.5 text-[12px] leading-snug" title={`${fmtShort(a.meeting_date)} 회의에서 등록한 액션`}>
                              <input type="checkbox" checked={false} onChange={() => onCompletePriorAction(a)} className="flex-shrink-0 mt-0.5" title="액션 완료" />
                              <span className="flex-1 break-words text-[#5B6570]">
                                {a.content}
                                <span className="text-[#9AA3AE]"> · {a.due_date ? fmtShort(a.due_date) : `${fmtShort(a.meeting_date)} 등록`}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className={`flex gap-1 ${mine.length + prior.length > 0 ? 'mt-1.5' : ''} ${composing ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                          {(['decision', 'action'] as const).map(kind => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setComposer(composing?.kind === kind ? null : { itemId: item.id, kind, text: item.title, due: '' })}
                              className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${composing?.kind === kind ? 'bg-[#4C7FE0] text-white' : 'text-[#4C7FE0] bg-[#4C7FE0]/[0.08] hover:bg-[#4C7FE0]/15'}`}
                            >+ {kind === 'decision' ? '결정' : '액션'}</button>
                          ))}
                        </div>
                      </td>
                      <td className="text-center pt-2.5">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => { void wr.setDone(item, !done) }}
                          title={done ? '완료 취소' : '이 회의에서 완료 — 다음 회의부터 안 보입니다'}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="text-center pt-2">
                        <button
                          onClick={() => { if (confirm(`"${item.title || '업무'}"를 삭제할까요? 모든 회차의 업데이트·피드백이 함께 지워집니다.\n끝난 업무라면 삭제 대신 완료를 체크하세요.`)) void wr.deleteItem(item) }}
                          title="삭제"
                          className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100"
                        >✕</button>
                      </td>
                    </tr>
                    {composing && (
                      <tr className="bg-[#F5F8FE] border-b border-[#E3EAF8]">
                        <td colSpan={7} className="px-3 py-2">
                          <form onSubmit={e => { e.preventDefault(); void submitComposer(item) }} className="flex items-center gap-2">
                            <span className="text-[11.5px] font-semibold text-[#4C7FE0] flex-shrink-0">
                              {composing.kind === 'decision' ? '이번 회의 결정사항으로 등록' : `${member?.name ?? ''}님 액션아이템으로 등록`}
                            </span>
                            <input
                              autoFocus
                              value={composing.text}
                              onChange={e => setComposer(c => c && { ...c, text: e.target.value.slice(0, 500) })}
                              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setComposer(null) } }}
                              className="flex-1 min-w-0 text-[13px] border border-[#D3DCEC] rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#4C7FE0]"
                            />
                            {composing.kind === 'action' && (
                              <input
                                type="date"
                                value={composing.due}
                                onChange={e => setComposer(c => c && { ...c, due: e.target.value })}
                                title="기한 (선택)"
                                className="w-[130px] flex-shrink-0 text-[13px] border border-[#D3DCEC] rounded-md px-2 py-1.5 bg-white"
                              />
                            )}
                            <button type="submit" disabled={composerSaving || !composing.text.trim()} className="flex-shrink-0 text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-50 rounded-md px-3 py-1.5">등록</button>
                            <button type="button" onClick={() => setComposer(null)} className="flex-shrink-0 text-[12.5px] text-[#7A8491] hover:text-[#1F2933] px-2 py-1.5">취소</button>
                          </form>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
                <tr>
                  <td colSpan={7} className="px-3 py-2">
                    <input
                      ref={newInputRef}
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value.slice(0, REPORT_TITLE_MAX))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submitNew() } }}
                      onBlur={() => { void submitNew() }}
                      autoFocus={rows.length === 0}
                      placeholder={`+ ${member?.name ?? ''} 업무 추가 (Enter)`}
                      className="w-full text-[13px] text-[#3A4249] px-0 py-1 bg-transparent border-0 focus:outline-none placeholder:text-[#B0B8C1]"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <p className="flex-shrink-0 px-5 py-2 border-t border-[#EEF0F2] text-[11px] text-[#9AA3AE]">
          칸에서 벗어나면 자동 저장됩니다 · 완료한 업무는 이번 회의에만 남고 다음 회의부터 사라집니다 · 완료 안 한 업무는 다음 회의에 그대로 이어집니다
        </p>
      </div>

      {c && (
        <div className="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center px-4" onClick={e => { e.stopPropagation(); wr.dismissConflict() }}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[560px] max-h-[80vh] overflow-y-auto p-5">
            <p className="text-[15px] font-semibold text-[#1F2933] mb-1">
              &quot;{conflictItem?.title || '업무'}&quot; {c.field === 'update' ? '업데이트' : '피드백'}가 그 사이 먼저 저장돼 최신 내용으로 바꿨습니다
            </p>
            <p className="text-[12.5px] text-[#7A8491] mb-4">{c.updatedBy ? `${c.updatedBy}님이 저장했습니다.` : '다른 분이 저장했습니다.'} 내가 쓴 내용은 아래에 남겨뒀어요 — 필요하면 복사해서 다시 붙여넣으세요.</p>
            <div className="border border-[#E5E8EB] rounded-lg p-3 mb-4">
              <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1.5">내가 쓴 내용 (저장 안 됨)</p>
              <p className="text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto">
                {c.localText || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { void navigator.clipboard.writeText(c.localText).catch(() => {}) }} className="text-[12.5px] font-medium text-[#4C7FE0] border border-[#4C7FE0]/40 hover:bg-[#4C7FE0]/5 rounded-lg px-3.5 py-2">내 내용 복사</button>
              <button onClick={() => wr.dismissConflict()} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
