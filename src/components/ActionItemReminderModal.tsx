'use client'

// 대시보드 접속 시 "지났는데 완료 안 된 것"과 "이번 주 할 일"을 나눠 보여주는 확인 모달.
// - 항목마다 [확인]을 누르면 그 항목은 다시 안내하지 않는다(기한이 바뀌면 새 항목으로 보고 다시 안내).
// - [확인](하단)은 지금 보이는 항목 전부를 확인 처리, [오늘은 그만 보기]는 오늘 하루만 닫는다.
// - 확인 안 한 항목이 0건이면 아예 뜨지 않는다.
// 확인 기록은 팀원별로 이 브라우저(localStorage)에 남는다. 닫은 뒤에도 기한 지난/오늘마감 액션아이템은
// ActionItemReminderWidget(우측하단 상시노출)에 계속 남는다.

import { useCallback, useMemo, useState } from 'react'
import { todayStr, useMyActionReminders } from '@/lib/useMyActionReminders'
import { useMyWeekOutlook } from '@/lib/useMyWeekOutlook'
import { useCurrentMember } from '@/lib/useCurrentMember'

const SNOOZE_KEY = 'hrm_action_reminder_dismissed_date'
const ACK_KEY_PREFIX = 'hrm_reminder_ack:'
const ACK_LIMIT = 500
const OUTLOOK_KIND_LABEL: Record<'schedule' | 'report', string> = { schedule: '일정', report: '보고일정' }

type NavigateTarget = { section: 'meetings'; meetingId: string } | { section: 'schedule' } | { section: 'work' }

type Entry = {
  key: string // 확인 기록 키 — 종류:id:날짜 (날짜가 바뀌면 다시 안내)
  title: string
  date: string
  meta: string
  target: NavigateTarget
}

function readAcks(memberId: string): string[] {
  try {
    const raw = window.localStorage.getItem(ACK_KEY_PREFIX + memberId)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

function writeAcks(memberId: string, acks: string[]) {
  try { window.localStorage.setItem(ACK_KEY_PREFIX + memberId, JSON.stringify(acks.slice(-ACK_LIMIT))) } catch {}
}

export default function ActionItemReminderModal({ onNavigate, onPrefetchMeeting }: {
  onNavigate?: (target: NavigateTarget) => void
  // 회의로 가는 항목에 마우스를 올리거나 포커스하면 그 회의를 미리 받아 둔다(달력과 같은 미리받기).
  onPrefetchMeeting?: (meetingId: string) => void
}) {
  const { me } = useCurrentMember()
  const actionItems = useMyActionReminders()
  const weekOutlook = useMyWeekOutlook()
  // me는 클라이언트에서 멤버·인증 로드 후에만 생기므로 렌더 중 localStorage를 읽어도 SSR과 어긋나지 않는다.
  const [ackState, setAckState] = useState<{ memberId: string; acks: string[] } | null>(null)
  const [snoozedNow, setSnoozedNow] = useState(false)
  const acks = !me ? null : ackState?.memberId === me.id ? ackState.acks : readAcks(me.id)
  let snoozed = snoozedNow
  if (me && !snoozed) {
    try { snoozed = window.localStorage.getItem(SNOOZE_KEY) === todayStr() } catch {}
  }

  const { overdue, thisWeek } = useMemo(() => {
    const today = todayStr()
    const overdue: Entry[] = []
    const thisWeek: Entry[] = []
    for (const a of actionItems) {
      const entry: Entry = {
        key: `a:${a.id}:${a.dueDate}`,
        title: a.content,
        date: a.dueDate,
        meta: `액션아이템 · ${a.meetingTitle}`,
        target: { section: 'meetings', meetingId: a.meetingId },
      }
      ;(a.overdue ? overdue : thisWeek).push(entry)
    }
    for (const o of weekOutlook) {
      const past = o.date < today
      // 보고일정은 완료 상태가 없어서 날짜가 지나면 "미완료"로 볼 근거가 없다 — 지난 건 빼고 오늘 이후만.
      if (past && o.kind === 'report') continue
      const entry: Entry = {
        key: `${o.kind === 'schedule' ? 's' : 'r'}:${o.id}:${o.date}`,
        title: o.title,
        date: o.date,
        meta: `${OUTLOOK_KIND_LABEL[o.kind]} · ${o.context}`,
        target: { section: o.kind === 'schedule' ? 'schedule' : 'work' },
      }
      ;(past ? overdue : thisWeek).push(entry)
    }
    const ackSet = new Set(acks ?? [])
    const byDate = (x: Entry, y: Entry) => x.date.localeCompare(y.date)
    return {
      overdue: overdue.filter(e => !ackSet.has(e.key)).sort(byDate),
      thisWeek: thisWeek.filter(e => !ackSet.has(e.key)).sort(byDate),
    }
  }, [actionItems, weekOutlook, acks])

  const ack = useCallback((keys: string[]) => {
    if (!me || keys.length === 0) return
    const next = [...(acks ?? []).filter(k => !keys.includes(k)), ...keys]
    writeAcks(me.id, next)
    setAckState({ memberId: me.id, acks: next })
  }, [me, acks])

  const totalCount = overdue.length + thisWeek.length
  if (!me || acks === null || snoozed || totalCount === 0) return null

  function snoozeToday() {
    try { window.localStorage.setItem(SNOOZE_KEY, todayStr()) } catch {}
    setSnoozedNow(true)
  }

  function ackAll() {
    ack([...overdue, ...thisWeek].map(e => e.key))
  }

  function goTo(target: NavigateTarget) {
    snoozeToday()
    onNavigate?.(target)
  }

  function prefetchTarget(target: NavigateTarget) {
    if (target.section === 'meetings') onPrefetchMeeting?.(target.meetingId)
  }

  function renderSection(title: string, entries: Entry[], tone: 'overdue' | 'week') {
    return (
      <div>
        <div className="px-5 pt-3 pb-1 flex items-center justify-between">
          <p className="text-[11.5px] font-semibold text-gray-500">{title} <span className={tone === 'overdue' ? 'text-red-500' : 'text-[#4C7FE0]'}>{entries.length}</span></p>
          {entries.length > 1 && (
            <button onClick={() => ack(entries.map(e => e.key))} className="text-[11px] text-gray-400 hover:text-gray-700">이 묶음 확인</button>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-4 text-[12px] text-gray-400">해당 없음</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map(e => (
              <div key={e.key} className="flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50">
                <button
                  onClick={() => goTo(e.target)}
                  onPointerEnter={() => prefetchTarget(e.target)}
                  onFocus={() => prefetchTarget(e.target)}
                  className="flex-1 min-w-0 text-left flex flex-col gap-1"
                >
                  <p className="text-[13px] text-gray-800 leading-snug">{e.title}</p>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={tone === 'overdue' ? 'text-red-500 font-medium' : 'text-[#4C7FE0] font-medium'}>
                      {tone === 'overdue' ? `${e.date} 지남` : e.date === todayStr() ? `오늘 (${e.date})` : e.date}
                    </span>
                    <span className="text-gray-400 truncate">· {e.meta}</span>
                  </div>
                </button>
                <button
                  onClick={() => ack([e.key])}
                  title="확인 — 이 항목은 다시 안내하지 않아요"
                  className="flex-shrink-0 text-[11.5px] text-gray-500 border border-gray-200 rounded-md px-2 py-1 hover:bg-white hover:text-gray-800"
                >
                  확인
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[760px] max-h-[80vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <p className="text-[15px] font-semibold text-gray-800">📋 확인할 게 있어요</p>
          <p className="text-[12px] text-gray-400 mt-1">[확인]을 누른 항목은 다시 안내하지 않아요</p>
        </div>

        <div className="overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {renderSection('⏰ 지났는데 완료 안 된 것', overdue, 'overdue')}
          {renderSection('📅 이번 주 할 일', thisWeek, 'week')}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={snoozeToday} className="text-[13px] text-gray-500 rounded-lg px-4 py-2 hover:bg-gray-100">
            오늘은 그만 보기
          </button>
          <button
            onClick={ackAll}
            className="text-[13px] font-medium text-white bg-[#4C7FE0] rounded-lg px-4 py-2 hover:bg-[#3d6bcc]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
