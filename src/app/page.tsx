'use client'

// team-log — 팀원들이 비밀번호로 접근하는 독립 앱. jin-dashboard와는 별도
// 저장소/배포이며, 공유하는 것은 같은 Supabase 프로젝트뿐 (테이블은 team_log_*로 격리).
// 상단 메뉴로 일상/업무/회의록/일정/목표 등 섹션을 오간다.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import GoalsPanel from '@/components/goals/GoalsPanel'
import RetroHub from '@/components/goals/RetroHub'
import DailyMessage from '@/components/DailyMessage'
import MenuRouletteTabs from '@/components/MenuRouletteTabs'
import DailyFortuneCard from '@/components/DailyFortuneCard'
import MemberNote, { type ProgressRow } from '@/components/MemberNote'
import TeamLottery from '@/components/TeamLottery'
import BaseballWidget from '@/components/BaseballWidget'
import DuelWatcher from '@/components/baseball/DuelWatcher'
import GiftBoxModal from '@/components/baseball/GiftBoxModal'
import DoodleBoard from '@/components/DoodleBoard'
import TeamTree from '@/components/TeamTree'
import TeamFate from '@/components/TeamFate'
import AnonChat from '@/components/AnonChat'
import SosPopup from '@/components/SosPopup'
import HistoryTimeline from '@/components/HistoryTimeline'
import HistoryCard from '@/components/HistoryCard'
import TeamPersona from '@/components/TeamPersona'
import RoutineCalendar from '@/components/RoutineCalendar'
import ArchivingPanel from '@/components/ArchivingPanel'
import ProfileButton from '@/components/ProfileButton'
import ClickableAvatar from '@/components/ClickableAvatar'
import NotificationBell from '@/components/NotificationBell'
import QuickLinks from '@/components/QuickLinks'
import ScheduleTagSelect, { prefetchScheduleTags } from '@/components/ScheduleTagSelect'
import ActionItemReminderModal from '@/components/ActionItemReminderModal'
import ActionItemReminderWidget from '@/components/ActionItemReminderWidget'
import QuizTurnBanner from '@/components/QuizTurnBanner'
import QuizStatusCard from '@/components/QuizStatusCard'
import CollabAgendaField, { type AgendaFieldSnapshot } from '@/components/CollabAgendaField'
import ReportTable, { ReportConflictDialog, DEFAULT_COL_WIDTHS, type ColWidths, type LinkedMeetingItem, type ReportLocks, type ReportSection } from '@/components/ReportTable'
import ResizableImage from '@/components/ResizableImage'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useMembersContext } from '@/lib/MembersProvider'
import { prefetchWorkReport, useWorkReport } from '@/lib/useWorkReport'
import { useFieldLocks, type FieldLock } from '@/lib/useFieldLocks'
import type { ReportItem } from '@/lib/workReport'
import type { NotificationMeta } from '@/lib/notifications'

type Subtask = {
  id: string
  item_id: string
  author: string
  entry_type: '업무기록' | '보고일정'
  entry_date: string
  title: string
  content: string
  sort_order: number
  created_at: string
}
type Item = { id: string; group_id: string; title: string; status: 'active' | 'hold' | 'done'; sort_order: number; subtasks: Subtask[] }
type Group = { id: string; name: string; color: string; sort_order: number; items: Item[] }
type SubForm = { type: '업무기록' | '보고일정'; date: string; title: string; content: string }
type Meeting = {
  id: string; title: string; meeting_date: string; meeting_time: string; attendees: string; agenda: string; created_at: string
  // 안건 optimistic concurrency control — agenda_version이 저장 시 기대 version, 나머지 둘은 충돌 화면 표시용
  agenda_version: number; agenda_updated_at: string | null; agenda_updated_by: string | null
}
type MeetingProgress = { id: string; meeting_id: string; member_id: string; content: string; updated_at: string | null; version: number; updated_by: string | null }
type MeetingFilter = '전체' | '내회의' | '이번주' | '이번달'
type MeetingListRow = { kind: 'single'; meeting: Meeting } | { kind: 'group'; title: string; meetings: Meeting[] }
type MeetingItem = {
  id: string; meeting_id: string; kind: 'decision' | 'action' | 'memo' | 'contract_leave'; content: string; owner: string; due_date: string | null
  done: boolean; sort_order: number; created_at: string
  image_url: string | null; image_width: number | null; image_height: number | null
  // 업무보고 행에서 등록한 결정사항/액션아이템이면 그 행 id
  report_item_id?: string | null
}
// 첨부(캡처화면) 확정 후 실제로 addMeetingItem에 넘기는 "업로드 완료" 모양.
type MemoImageDraft = { url: string; width: number; height: number }
// "+추가"를 누르기 전까지는 아직 아무 것도 업로드하지 않는다 — 로컬 File과 브라우저 objectURL
// 미리보기만 들고 있다가, 커밋(addMeetingItem) 시점에 비로소 Storage 업로드를 시도한다.
// uploadedUrl은 업로드가 한 번 성공한 뒤 저장 자체(=meeting_item insert)가 실패해서 재시도할 때
// 같은 파일을 또 업로드(=orphan 누적)하지 않기 위한 캐시.
type PendingMemoImage = { file: File; previewUrl: string; width: number; height: number; uploadedUrl?: string }
// 회의창 인력관리의 근태(memo) / 계약·휴직(contract_leave) 칸 — 칸마다 따로 쓰는 입력줄 상태.
type MemoKind = 'memo' | 'contract_leave'
type MemoComposer = { text: string; image: PendingMemoImage | null; uploading: boolean; submitting: boolean }
const EMPTY_MEMO_COMPOSER: MemoComposer = { text: '', image: null, uploading: false, submitting: false }
type EventStatus = 'done' | 'delayed' | 'cancelled'
type ScheduleEvent = {
  id: string; title: string; event_date: string; note: string; assignee: string; tag: string | null
  source_type: 'item' | 'subtask' | 'meeting' | null; source_id: string | null; status: EventStatus | null; created_at: string
}
type Member = { id: string; name: string; sort_order: number; color_key: number }
type EventDraft = { id: string | null; title: string; date: string; assignee: string; tag: string; note: string; status: EventStatus | null }
type FamilyDay = { id: string; date: string; note: string; created_at: string }
type Holiday = { id: string; date: string; name: string; created_at: string }
type Section = 'life' | 'work' | 'meetings' | 'schedule' | 'goals' | 'retro' | 'archiving' | 'team' | 'history' | 'quiz'
const SECTION_STORAGE_KEY = 'hrm_last_section'
const KEEP_ALIVE_SECTIONS: Section[] = ['life', 'history']
function isSection(v: string | null): v is Section {
  return v === 'life' || v === 'work' || v === 'meetings' || v === 'schedule' || v === 'goals' || v === 'retro' || v === 'archiving' || v === 'team' || v === 'history' || v === 'quiz'
}

const GROUP_COLORS = ['#4C7FE0', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#9CA3AF']
const STATUS_LABEL: Record<Item['status'], string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_NEXT: Record<Item['status'], Item['status']> = { active: 'hold', hold: 'done', done: 'active' }
const STATUS_STYLE: Record<Item['status'], string> = {
  active: 'bg-[#4C7FE0]/10 text-[#4C7FE0]',
  hold: 'bg-amber-100 text-amber-600',
  done: 'bg-gray-100 text-gray-400',
}
const EMPTY_SUB_FORM: SubForm = { type: '업무기록', date: '', title: '', content: '' }
const EVENT_STATUS_LABEL: Record<EventStatus, string> = { done: '완료', delayed: '지연', cancelled: '취소' }
const EVENT_STATUS_STYLE: Record<EventStatus, string> = {
  done: 'bg-[#ECFDF5] text-[#059669]',
  delayed: 'bg-[#FFF7ED] text-[#C2410C]',
  cancelled: 'bg-gray-100 text-gray-500',
}

// 일정 진행상태 배지 — 완료(연한 초록)/지연(연한 주황)/취소(연한 회색) 네모 텍스트 배지.
function EventStatusStamp({ status }: { status: EventStatus | null }) {
  if (!status) return null
  return (
    <span className={`flex-shrink-0 text-[10px] font-semibold rounded-[4px] px-1.5 py-0.5 leading-none ${EVENT_STATUS_STYLE[status]}`}>
      {EVENT_STATUS_LABEL[status]}
    </span>
  )
}
// 회의 상세의 "메모·캡처" — 상세 화면 칸(compact)과 창 전체를 쓰는 크게보기(large)
// 양쪽에서 똑같이 쓴다. 캡처화면은 큰 뷰에서 더 넓게 리사이즈할 수 있게 maxWidth만 다르게 준다.
function MeetingMemoSection({
  title, helperText, placeholder,
  items, newText, onNewTextChange, onPaste, uploading, newImage, onImageResizeEnd, onRemoveImage,
  onSubmit, submitting = false, onDeleteItem, onResizeItemImage, large = false, onExpand, onClose, labelFor, readOnly = false, twoColumns = false,
}: {
  title: string
  helperText: string
  placeholder: string
  items: MeetingItem[]
  newText: string
  onNewTextChange: (v: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  uploading: boolean
  newImage: PendingMemoImage | null
  onImageResizeEnd: (w: number, h: number) => void
  onRemoveImage: () => void
  onSubmit: () => void
  submitting?: boolean
  onDeleteItem: (item: MeetingItem) => void
  onResizeItemImage: (item: MeetingItem, w: number, h: number) => void
  large?: boolean
  onExpand?: () => void
  onClose?: () => void
  labelFor?: (item: MeetingItem) => string | null
  // readOnly: 새 메모 추가 칸 없이 이미 있는 메모만 보여준다(회의창 인력관리). twoColumns: 메모 카드를 한 줄에 2개씩.
  readOnly?: boolean
  twoColumns?: boolean
}) {
  const imageMaxWidth = large ? 1000 : 360
  // 미리보기 이미지를 감싼 칸은 inline-block이라 이미지 "현재" 크기에 딱 맞춰 줄어든다 — 그 칸 자체를
  // ResizableImage의 드래그 상한 기준(parentElement)으로 쓰면 항상 지금 크기가 상한이 돼버려 못 키운다.
  // 그래서 실제로 늘어날 수 있는 진짜 폭을 가진 이 바깥 상자를 기준으로 잡는다.
  const composerBoxRef = useRef<HTMLDivElement>(null)
  return (
    <div>
      {title && <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <label className="text-[12px] font-medium text-[#7A8491] flex-shrink-0">{title}</label>
          <span className="text-[11px] text-[#B0B8C1]">{helperText}</span>
        </div>
        {onExpand && (
          <button type="button" onClick={onExpand} title="크게 보기/편집" className="text-[12px] text-[#B0B8C1] hover:text-[#4C7FE0] flex-shrink-0">⤢</button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="text-[13px] font-medium text-[#7A8491] hover:text-[#1F2933] px-2.5 py-1.5 rounded-md hover:bg-black/[0.04] flex-shrink-0">닫기</button>
        )}
      </div>}
      {items.length > 0 && (
        <div className={twoColumns ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 items-start' : 'space-y-2 mb-2'}>
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-2 bg-[#FAFBFB] border border-[#EEF0F2] rounded-lg px-3 py-2 group">
              <div className="flex-1 min-w-0 space-y-2">
                {labelFor?.(item) && <span className="inline-block text-[10.5px] font-medium text-[#7A8491] bg-[#EEF0F2] rounded px-1.5 py-px">{labelFor(item)}</span>}
                {item.content && <p className={`${large ? 'text-[14px]' : 'text-[13px]'} text-[#3A4249] whitespace-pre-wrap break-words`}>{item.content}</p>}
                {item.image_url && (
                  <ResizableImage
                    key={item.id}
                    src={item.image_url}
                    width={item.image_width ?? (large ? 420 : 240)}
                    height={item.image_height ?? (large ? 280 : 160)}
                    maxWidth={imageMaxWidth}
                    onResizeEnd={(w, h) => onResizeItemImage(item, w, h)}
                  />
                )}
              </div>
              <button onClick={() => onDeleteItem(item)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
      {!readOnly && <div ref={composerBoxRef} className="border border-dashed border-[#D3D8DD] rounded-lg px-3 py-2 space-y-2">
        <textarea
          value={newText}
          onChange={e => onNewTextChange(e.target.value)}
          onPaste={onPaste}
          placeholder={placeholder}
          rows={large ? 4 : 2}
          className="w-full text-[13px] border-0 focus:outline-none resize-none bg-transparent"
        />
        {uploading && <p className="text-[11px] text-[#B0B8C1]">이미지 처리 중…</p>}
        {newImage && (
          <div>
            <div className="relative inline-block">
              <ResizableImage
                src={newImage.previewUrl} width={newImage.width} height={newImage.height} maxWidth={imageMaxWidth}
                containerRef={composerBoxRef}
                onResizeEnd={onImageResizeEnd}
              />
              <button
                onClick={onRemoveImage}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-[#E5E8EB] text-[10px] text-[#B0B8C1] hover:text-red-500 flex items-center justify-center leading-none"
              >✕</button>
            </div>
            <p className="text-[10.5px] text-amber-600 mt-1">저장되지 않은 첨부 — 추가 버튼을 눌러야 저장됩니다.</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] text-[#B0B8C1]">작성 후 추가 버튼을 눌러야 저장됩니다.</p>
          <button
            onClick={onSubmit}
            disabled={(!newText.trim() && !newImage) || submitting}
            className="flex-shrink-0 text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-3 py-1.5"
          >
            {submitting ? '저장 중…' : '+ 추가'}
          </button>
        </div>
      </div>}
    </div>
  )
}
// 캘린더 셀에서 다른 일정을 덮고 통째로 강조 표시되는 "휴가류" 태그 — 종일(휴가)
// 외에 반차/반반차도 같은 방식으로 강조하되, 셀 안 텍스트는 태그명 그대로 보여준다.
const LEAVE_TAGS = new Set(['휴가', '오전반차', '오후반차', '오전반반차', '오후반반차'])
const WEEKDAYS = ['월', '화', '수', '목', '금']
// 팀 달력 업무 칩 — 칩은 한 가지 아주 연한 블루그레이고, 앞의 원형 블릿만 담당 팀원 색(team_log_members.color_key 0~7).
const CAL_CHIP_BG = '#F1F4F9'
const CAL_MEMBER_COLORS = ['#E0A23B', '#2FA88A', '#D9608A', '#7B6FE0', '#4A8FD9', '#6FA640', '#8C8A80', '#E07A55']
function calMemberColor(colorKey: number | null | undefined) {
  return CAL_MEMBER_COLORS[(((colorKey ?? 0) % 8) + 8) % 8]
}
// 고정회의(요일 반복) 제목 — src/app/api/meetings/route.ts의 RECURRING_MEETINGS와 반드시 일치해야 한다.
// 회의록 목록에서 이 제목의 회의들을 하나의 접이식 그룹으로 묶는 데 쓴다.
const WEEKLY_MEETING_TITLE = '인사관리팀 위클리미팅'
// "+ 새 회의"는 누르는 즉시 이 제목으로 회의를 만들고 상세 화면에서 바로 고치게 한다. 아무것도 안 쓰고 다른 회의로
// 옮기면(서버에서도 비어 있음을 확인한 뒤) 자리표시 회의를 지운다.
const UNTITLED_MEETING = '제목 없음'

// 회의창 데이터(결정·액션/팀원 메모)를 회의별로 기억해 둔다 — 같은 회의를 다시 열거나 달력에서 마우스를 올려
// 미리 받아 둔 회의는 서버를 기다리지 않고 바로 그리고, 뒤에서 최신으로 맞춘다.
const meetingItemsCache = new Map<string, MeetingItem[]>()
const meetingProgressCache = new Map<string, MeetingProgress[]>()
const meetingPrefetched = new Set<string>()
function prefetchMeeting(m: { id: string; meeting_date: string }) {
  prefetchWorkReport(m.id, m.meeting_date)
  if (meetingPrefetched.has(m.id) || (meetingItemsCache.has(m.id) && meetingProgressCache.has(m.id))) return
  meetingPrefetched.add(m.id)
  void fetch(`/api/meeting-items?meeting_id=${m.id}`).then(r => r.json()).then(j => { if (j?.ok && !meetingItemsCache.has(m.id)) meetingItemsCache.set(m.id, j.items) }).catch(() => {})
  void fetch(`/api/meeting-progress?meeting_id=${m.id}`).then(r => r.json()).then(j => { if (j?.ok && !meetingProgressCache.has(m.id)) meetingProgressCache.set(m.id, j.progress) }).catch(() => {})
  // 오래 머문 탭에서 다시 받을 수 있게 잠시 뒤 표시를 푼다.
  setTimeout(() => meetingPrefetched.delete(m.id), 60_000)
}

function parseAttendees(s: string) {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}
function joinAttendees(arr: string[]) {
  return arr.join(', ')
}
function fmtMeetingDay(s: string) {
  try {
    const d = parseISO(s)
    if (isToday(d)) return '오늘'
    return format(d, 'M월 d일', { locale: ko })
  } catch { return s }
}
// 위클리미팅 회차 목록처럼 요일까지 명확히 구분해야 하는 자리에서 쓰는 전체 날짜 형식.
// 예: 2026-08-31(월)
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
function fmtMeetingDayFull(s: string) {
  try {
    const d = parseISO(s)
    return `${format(d, 'yyyy-MM-dd')}(${WEEKDAY_KO[d.getDay()]})`
  } catch { return s }
}
function startOfWeek(d: Date) {
  const dow = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - dow)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function dateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

// 제목/날짜 등 다른 필드 저장 응답(행 전체)으로 회의를 갱신할 때, 그 응답이 내 최신 안건 저장보다 늦게 도착했으면
// 안건 필드는 더 높은 version 쪽을 유지한다 — 낮은 version으로 되돌아가면 다음 안건 저장이 내 저장과 충돌로 오인된다.
function mergeMeetingRow(prev: Meeting, row: Meeting): Meeting {
  if ((prev.agenda_version ?? 0) <= (row.agenda_version ?? 0)) return row
  return { ...row, agenda: prev.agenda, agenda_version: prev.agenda_version, agenda_updated_at: prev.agenda_updated_at, agenda_updated_by: prev.agenda_updated_by }
}

// 저장 충돌 화면의 "OOO님이 HH:MM에 수정" — 오늘이면 시각만, 아니면 날짜도 붙인다.
function fmtConflictTime(iso: string) {
  try {
    const d = parseISO(iso)
    return format(d, isToday(d) ? 'HH:mm' : 'M.d HH:mm', { locale: ko })
  } catch {
    return null
  }
}

function fmtDay(s: string) {
  try {
    const d = parseISO(s)
    if (isToday(d)) return '오늘'
    if (isYesterday(d)) return '어제'
    return format(d, 'M.d (E)', { locale: ko })
  } catch { return s }
}

// "직전/지난 회의" 계열 기능(이전 회의 보기, 참고 패널)이 찾아볼 후보 풀.
// 예전엔 같은 제목(위클리미팅 등)으로만 좁혔었는데, 고정회의 요일이 바뀌거나(월/수 → 월/목)
// 그날 회의 제목이 정확히 일치하지 않으면(예: 저장 전 "제목 없음") 실제로 있는 회의를
// 못 찾는 문제가 있었다. 그래서 제목과 무관하게 전체 회의 목록에서 날짜로 찾는다.
// 회의 날짜 다음의 첫 월요일/수요일(위클리미팅 주기) — 'YYYY-MM-DD'.
function nextMonOrWed(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  for (let i = 1; i <= 7; i++) {
    const n = new Date(d.getTime() + i * 86_400_000)
    if (n.getUTCDay() === 1 || n.getUTCDay() === 3) return n.toISOString().slice(0, 10)
  }
  return date
}

// 업무보고 +액션 기한 기본값 = 다음 회의. 같은 제목으로 이미 잡힌 다음 회의가 있으면 그 날짜, 없으면 다음 월/수.
function nextMeetingDate(list: Meeting[], current: Meeting | undefined) {
  if (!current) return ''
  const next = list
    .filter(m => m.title === current.title && m.meeting_date > current.meeting_date)
    .map(m => m.meeting_date)
    .sort()[0]
  return next ?? nextMonOrWed(current.meeting_date)
}

function meetingSeriesPool(list: Meeting[]) {
  return list
}

export default function TeamLogPage() {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)

  const [section, setSection] = useState<Section>('life')
  // 한 번 연 탭은 언마운트하지 않고 숨겨서 유지(keep-alive) — 탭을 다시 누를 때마다 하위 컴포넌트가
  // 전부 새로 마운트되며 조회·실시간 채널을 처음부터 다시 여는 비용을 없앤다. 대상은 데이터가 전부
  // 실시간 구독으로 최신 유지되는 탭만(일상·연혁). 목표/아카이빙/팀은 구독이 없어 숨겨두면 다른 팀원의
  // 변경이 안 보이므로 기존처럼 탭 진입 때 새로 불러온다. 연상퀴즈(iframe)는 게임이 백그라운드에서
  // 계속 돌면 안 되므로 제외. (렌더 중 state 조정 패턴 — effect 없이 진입 즉시 반영)
  const [keptAlive, setKeptAlive] = useState<Section[]>([])
  if (KEEP_ALIVE_SECTIONS.includes(section) && !keptAlive.includes(section)) setKeptAlive([...keptAlive, section])
  const [baseballOpen, setBaseballOpen] = useState(false)
  const isMounted = (s: Section) => section === s || keptAlive.includes(s)
  // 로그인 이름은 MembersProvider가 앱 전체에서 한 번만 가져온 값을 쓴다(여기서 getUser 재호출 X).
  const { authName } = useMembersContext()
  const author = authName ?? ''
  const [loadError, setLoadError] = useState('')
  // 클라이언트 시계/타임존이 서버와 어긋나면(팀원마다 PC 설정이 다를 수 있음) "오늘"이 사람마다
  // 다르게 계산돼서, 같은 날 회의인데도 서로 다른 회의로 갈리거나 참고 패널에만 보이는 문제가
  // 생긴다. 그래서 "오늘"은 항상 서버 날짜(today_date() RPC, Asia/Seoul)를 기준으로 삼는다.
  const [serverToday, setServerToday] = useState<string | null>(null)
  function todayStr() {
    return serverToday ?? dateStr(new Date())
  }

  // ── 업무 ──────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<Group[]>([])
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  // 업무 허브 안에서 section 'work'가 맡는 서브탭 — R&R(tasks) / 루틴 캘린더(calendar).
  // 요약(팀 달력)·목표·아카이빙은 각자 section(schedule/goals/archiving)을 그대로 쓰고, 메뉴에서만 업무 아래로 묶는다.
  const [workTab, setWorkTab] = useState<'tasks' | 'calendar'>('tasks')
  const [newGroupName, setNewGroupName] = useState('')
  const [newItemTitle, setNewItemTitle] = useState<Record<string, string>>({})
  const [subForm, setSubForm] = useState<Record<string, SubForm>>({})
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemTitle, setEditItemTitle] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editSubForm, setEditSubForm] = useState<SubForm>(EMPTY_SUB_FORM)
  const [filterAuthor, setFilterAuthor] = useState('전체')
  const [filterType, setFilterType] = useState<'전체' | '업무기록' | '보고일정'>('전체')

  // ── 회의록 ────────────────────────────────────────────────────────────
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [meetingSearch, setMeetingSearch] = useState('')
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>('전체')
  const [meetingMenuOpen, setMeetingMenuOpen] = useState(false)
  const [weeklyGroupExpanded, setWeeklyGroupExpanded] = useState(false)
  // 같은 날짜에 회의가 2건 이상일 때 열리는 작은 popover의 대상 날짜.
  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null)
  // 팀 달력에서 업무가 3건 이상인 칸을 펼쳐 둔 대상("이름|날짜").
  const [expandedCalCell, setExpandedCalCell] = useState<string | null>(null)
  // 툴바의 "모두 펼치기" — 켜면 모든 칸의 업무를 다 보여준다.
  const [calExpandAll, setCalExpandAll] = useState(false)
  // 팀 달력 드래그앤드롭 — 끌고 있는 일정 id와, 지금 올라가 있는 칸("이름|날짜").
  const [calDragId, setCalDragId] = useState<string | null>(null)
  const [calDragOver, setCalDragOver] = useState<string | null>(null)
  // 팀 달력 이름 옆 색 점을 눌러 여는 색 고르기 대상 팀원 id.
  const [colorPickerMemberId, setColorPickerMemberId] = useState<string | null>(null)
  const mtNow = new Date()
  const [meetingYear, setMeetingYear] = useState(mtNow.getFullYear())
  const [meetingMonth, setMeetingMonth] = useState(mtNow.getMonth() + 1)
  const [meetingItems, setMeetingItems] = useState<MeetingItem[]>([])
  const [meetingProgress, setMeetingProgress] = useState<MeetingProgress[]>([])
  // 업무보고 표 — 팀원 칩 필터(null = 전체)와 접어 둔 팀원.
  const [reportMemberFilter, setReportMemberFilter] = useState<string | null>(null)
  const [collapsedReportMembers, setCollapsedReportMembers] = useState<Set<string>>(new Set())
  // 방금 "+ 새 회의"로 만든 회의 — 상세 화면 제목 칸에 바로 커서를 둔다.
  const [focusTitleMeetingId, setFocusTitleMeetingId] = useState<string | null>(null)
  // 표가 넓어서 회의 목록을 접고 상세를 넓게 볼 수 있게 한다(데스크톱).
  const [meetingListCollapsed, setMeetingListCollapsed] = useState(false)
  // 업무 > 팀 일정 캘린더에서 회의를 누르면 탭을 옮기지 않고 회의창(팝업)으로 연다 — 닫으면 보던 캘린더 그대로.
  const [meetingPopupOpen, setMeetingPopupOpen] = useState(false)
  // 고정 안건·오늘 안건 표의 열 너비 — 두 표가 같은 값을 써서 세로줄이 맞고, 이 브라우저에 기억해 둔다.
  const [agendaColWidths, setAgendaColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS)
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('hrm_agenda_col_widths') ?? 'null') as Partial<ColWidths> | null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다(SSR 불일치 방지)
      if (saved) setAgendaColWidths({ ...DEFAULT_COL_WIDTHS, ...saved })
    } catch {}
  }, [])
  function changeAgendaColWidths(next: ColWidths) {
    setAgendaColWidths(next)
    try { window.localStorage.setItem('hrm_agenda_col_widths', JSON.stringify(next)) } catch {}
  }
  // 업무보고 표 열 너비 — 안건 표와 따로, 마찬가지로 모든 회의에 같은 값을 쓰고 이 브라우저에 기억해 둔다.
  const [reportColWidths, setReportColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS)
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('hrm_report_col_widths') ?? 'null') as Partial<ColWidths> | null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다(SSR 불일치 방지)
      if (saved) setReportColWidths({ ...DEFAULT_COL_WIDTHS, ...saved })
    } catch {}
  }, [])
  function changeReportColWidths(next: ColWidths) {
    setReportColWidths(next)
    try { window.localStorage.setItem('hrm_report_col_widths', JSON.stringify(next)) } catch {}
  }
  // 회의 상세를 보고 있는 중인지(회의록 탭이든 회의창이든) — 표 데이터·칸 잠금·빈 회의 정리가 이 기준으로 움직인다.
  const meetingViewActive = section === 'meetings' || meetingPopupOpen
  const [showPrevMeeting, setShowPrevMeeting] = useState(false)
  const [prevMeetingItems, setPrevMeetingItems] = useState<MeetingItem[]>([])
  const [newDecisionText, setNewDecisionText] = useState('')
  const [newActionText, setNewActionText] = useState('')
  const [newActionOwners, setNewActionOwners] = useState<string[]>([])
  const [newActionDue, setNewActionDue] = useState('')
  const [memoComposers, setMemoComposers] = useState<Record<MemoKind, MemoComposer>>({ memo: EMPTY_MEMO_COMPOSER, contract_leave: EMPTY_MEMO_COMPOSER })
  const patchComposer = (kind: MemoKind, fn: (c: MemoComposer) => MemoComposer) => setMemoComposers(prev => ({ ...prev, [kind]: fn(prev[kind]) }))

  // ── 일정 ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  // 회의 참석자(team_log_members)와 프로필 카드(members)는 서로 다른 테이블이라 id가
  // 안 맞는다 — 이름으로만 매칭해서 아바타/프로필카드를 붙인다.
  const { members: profileMembers } = useMembers()
  // 이름이 안 맞으면(트림 안 된 공백, 아직 프로필이 안 만들어진 신규 참석자 등) 매칭이 실패해서
  // undefined가 넘어가고, Avatar는 이름도 못 얻어 사진 대신 물음표(?)를 그린다. 매칭 실패해도
  // 최소한 참석자 이름으로 이니셜 아바타는 뜨도록 항상 표시 가능한 값을 돌려준다.
  const profileMemberByName = (name: string) => {
    const found = profileMembers.find(pm => pm.name.trim() === name.trim())
    if (found) return found
    return { id: '', name, nickname: null, role: 'member' as const, color_key: name.charCodeAt(0) % 8, position: null, hired_at: null, birthday: null, gives: null, needs: null, avatar_url: null }
  }
  const { me: currentMember } = useCurrentMember()
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonthNum, setCalMonthNum] = useState(now.getMonth() + 1)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [showMemberManager, setShowMemberManager] = useState(false)
  const [familyDays, setFamilyDays] = useState<FamilyDay[]>([])
  const [showFamilyDayManager, setShowFamilyDayManager] = useState(false)
  const [showLeaveMenu, setShowLeaveMenu] = useState(false)
  const [familyDayInput, setFamilyDayInput] = useState('')
  const [familyDayError, setFamilyDayError] = useState('')
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [showHolidayManager, setShowHolidayManager] = useState(false)
  const [holidayDateInput, setHolidayDateInput] = useState('')
  const [holidayNameInput, setHolidayNameInput] = useState('')
  const [holidayError, setHolidayError] = useState('')

  // ── 업무/회의록 → 일정 연동 (호버 후 S 단축키, 또는 📅 버튼) ──────────
  // 호버 대상은 S 단축키에서만 읽고 화면엔 안 그리므로 state가 아니라 ref로 둔다 — state였을 땐
  // 항목 위로 마우스가 지나갈 때마다 이 3천 줄짜리 페이지 전체가 다시 렌더링됐다.
  const hoveredKeyRef = useRef<string | null>(null)
  const setHoveredKey = (key: string | null) => { hoveredKeyRef.current = key }
  const [flash, setFlash] = useState('')
  // 모달 위에서도 보여야 하는 토스트라 loadError 배너 대신 이걸 씀.
  // tone만 최소로 얹은 것 — 기존 flash 렌더/타이머 로직은 그대로 재사용.
  const [flashTone, setFlashTone] = useState<'success' | 'error'>('success')
  function showFlash(text: string, tone: 'success' | 'error' = 'success') {
    setFlashTone(tone)
    setFlash(text)
  }

  // ── 상단 전역 검색 (회의록 + 일정) ────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('')
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

  useEffect(() => {
    loadAll()
    prefetchScheduleTags() // 일정 창 태그 목록을 미리 받아 둔다(창을 열 때 기다림 없이)

    // 캘린더/회의록 월 초기값은 컴포넌트 로드 시점엔 클라이언트 시계로 일단 추측해뒀는데
    // (연/월 useState 초기화는 비동기 fetch를 기다릴 수 없어서), 서버 날짜가 도착하면 그 추측이
    // 맞는지 다시 확인해서 어긋나면 바로잡는다. PC 시계/타임존이 서버와 다른 팀원이 있어도
    // "오늘"이 다르게 잡히지 않도록 하기 위함.
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc('today_date')
      const today = data as string | null
      if (!today) return
      setServerToday(today)
      const [y, m] = today.split('-').map(Number)
      if (y && m) {
        setCalYear(y); setCalMonthNum(m)
        setMeetingYear(y); setMeetingMonth(m)
      }
    })()

    // 새로고침해도 보던 탭 그대로 — 없거나 잘못된 값이면 기본값(일상) 유지.
    try {
      const saved = window.localStorage.getItem(SECTION_STORAGE_KEY)
      if (isSection(saved)) { replaceHistoryRef.current = true; setSection(saved === 'meetings' ? 'schedule' : saved) }
    } catch {
      // localStorage 접근 불가(시크릿 모드 등)는 조용히 무시 — 매번 일상 탭으로 시작하는 정도의 불편함일 뿐.
    }
  }, [])

  // 업무용 팀원 목록(team_log_members)은 프로필 멤버 추가 시 DB가 자동으로 맞춰 준다(supabase/sync_members.sql).
  // 이 화면은 처음에 한 번만 불러오므로, 업무 탭·회의창에 들어갈 때 다시 받아 새 팀원이 새로고침 없이 보이게 한다.
  const workAreaActive = section === 'schedule' || section === 'work' || meetingPopupOpen
  useEffect(() => {
    if (!workAreaActive) return
    let active = true
    fetch('/api/members').then(r => r.json()).then(j => { if (active && j.ok) setMembers(j.members) }).catch(() => {})
    return () => { active = false }
  }, [workAreaActive])

  // ── 브라우저 뒤로가기 ── 탭(섹션) 이동을 브라우저 기록에 남겨, 뒤로가기/앞으로가기로 직전 탭을 오가게 한다.
  // 예전엔 기록이 없어 연상퀴즈 등에서 뒤로가기를 누르면 직전 탭이 아니라 앱 밖으로 나가거나 아무 일도 없었다.
  // Next 라우터가 쓰는 history.state 값은 그대로 두고 hrmSection만 덧붙인다(같은 주소라 페이지 이동은 없음).
  const replaceHistoryRef = useRef(false) // 새로고침 복원처럼 기록을 쌓지 않고 바꾸기만 할 때
  const fromPopRef = useRef(false) // 뒤로가기로 바뀐 탭이면 다시 쌓지 않는다
  const historySectionRef = useRef<Section | null>(null)
  useEffect(() => {
    const st = { ...(window.history.state ?? {}), hrmSection: section }
    if (fromPopRef.current) { fromPopRef.current = false }
    else if (historySectionRef.current === null || replaceHistoryRef.current) { replaceHistoryRef.current = false; window.history.replaceState(st, '') }
    else if (historySectionRef.current !== section) window.history.pushState(st, '')
    historySectionRef.current = section
  }, [section])
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const s = (e.state as { hrmSection?: string } | null)?.hrmSection ?? null
      if (!isSection(s)) return
      fromPopRef.current = true
      setMeetingPopupOpen(false)
      setSection(s)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SECTION_STORAGE_KEY, section)
    } catch {
      // 위와 동일한 이유로 무시.
    }
  }, [section])

  // meetings는 API에서 (날짜 desc, 생성 desc)로 정렬돼 오므로 바로 다음 원소가 직전 회의다.
  // 월 필터(filteredMeetings)가 아니라 전체 목록에서 찾기 때문에 달이 바뀌어도 이어진다.
  const previousMeetingPool = meetingSeriesPool(meetings)
  const selectedIdx = selectedMeetingId ? previousMeetingPool.findIndex(m => m.id === selectedMeetingId) : -1
  const previousMeeting = selectedIdx >= 0 ? previousMeetingPool[selectedIdx + 1] ?? null : null
  const previousMeetingId = previousMeeting?.id ?? null

  useEffect(() => {
    // 기억해 둔 데이터가 있으면 먼저 그린다 — 바로 아래 load가 최신으로 맞춘다.
    if (selectedMeetingId) {
      const ci = meetingItemsCache.get(selectedMeetingId)
      const cp = meetingProgressCache.get(selectedMeetingId)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 캐시를 즉시 그려 회의창이 바로 열리게 한다
      if (ci) setMeetingItems(ci)
      if (cp) setMeetingProgress(cp)
    }
    loadMeetingItems(selectedMeetingId)
    loadMeetingProgress(selectedMeetingId)
    if (!selectedMeetingId) return
    // 결정사항/액션아이템/팀원별 진행사항은 다른 사람이 같은 회의를 열어두고 있어도 새로고침 없이는
    // 안 보였다. 두 테이블 변경을 모두 구독해 그 자리에서 다시 불러온다.
    const supabase = createClient()
    const channel = supabase
      .channel(`meeting-items-changes-${selectedMeetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_meeting_items', filter: `meeting_id=eq.${selectedMeetingId}` }, () => loadMeetingItems(selectedMeetingId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_meeting_progress', filter: `meeting_id=eq.${selectedMeetingId}` }, () => loadMeetingProgress(selectedMeetingId))
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedMeetingId])

  useEffect(() => {
    loadPrevMeetingItems(showPrevMeeting ? previousMeetingId : null)
  }, [showPrevMeeting, previousMeetingId])


  // 안건 표·업무보고 표 — 회의록 탭에서 보고 있는 회의 기준(다른 탭에선 불러오지도, 실시간 구독하지도 않는다).
  // 행 표시가 회의 날짜 기준이라 저장된 날짜가 바뀌면 다시 불러온다.
  const reportMeetingId = meetingViewActive ? selectedMeetingId : null
  const workReport = useWorkReport(reportMeetingId, meetings.find(m => m.id === reportMeetingId)?.meeting_date ?? null, {
    onError: message => showFlash(message, 'error'),
    onUnauthorized: () => router.push('/login'),
    // 안건 담당자를 바꿔 미완료 액션·일정 담당자도 서버에서 옮겨졌다 — 이 화면의 액션/일정을 다시 맞춘다.
    onActionsMoved: count => {
      showFlash(`이 안건의 미완료 액션 ${count}건과 일정 담당자도 함께 바꿨습니다`)
      void loadMeetingItems(selectedMeetingIdRef.current)
      void reloadEvents()
    },
  })
  const selectedMeetingIdRef = useRef(selectedMeetingId)
  useEffect(() => { selectedMeetingIdRef.current = selectedMeetingId }, [selectedMeetingId])
  // 칸 잠금 콜백(onReleased/onLost)은 렌더 때가 아니라 나중에 불리므로 최신 훅 값을 ref로 읽는다.
  const workReportRef = useRef(workReport)
  useEffect(() => { workReportRef.current = workReport })
  // 업무보고/안건 행 → 이번 회의 결정사항/액션아이템. 액션 담당자는 표가 정해 준다(업무보고는 그 행의 팀원,
  // 안건은 입력줄에서 고른 사람). 일정 자동 연동은 addMeetingItem이 처리.
  function addLinkedMeetingItem(item: ReportItem, kind: 'decision' | 'action', content: string, dueDate: string, owner: string) {
    return addMeetingItem(kind, content, kind === 'action' ? owner : '', dueDate, null, item.id)
  }

  // 결정사항/액션 목록에서 업무보고 행에서 온 항목 옆에 그 업무명을 붙인다.
  const reportTitleById = (id: string | null | undefined) => (id ? workReport.items.find(i => i.id === id)?.title : undefined) || null
  const reportSourceById = (id: string | null | undefined) => (workReport.items.find(i => i.id === id)?.kind === 'agenda' ? '안건 표에서 등록' : '업무보고에서 등록')
  const linkedMeetingItems: LinkedMeetingItem[] = meetingItems
    .flatMap(i => (i.kind === 'decision' || i.kind === 'action') && i.report_item_id
      ? [{ id: i.id, kind: i.kind, content: i.content, owner: i.owner, due_date: i.due_date, done: i.done, report_item_id: i.report_item_id }]
      : [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2200)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (profileMembers.length === 0) return
    try { localStorage.setItem('hrm_dg_members', JSON.stringify(profileMembers.map(m => m.name))) } catch {}
  }, [profileMembers])

  useEffect(() => {
    if (!currentMember) return
    try { localStorage.setItem('hrm_dg_me', currentMember.name) } catch {}
  }, [currentMember])

  // 연상퀴즈(iframe, /drawing-game.html)가 Supabase에 팀원과 동일한 인증 세션으로
  // 접속해야 실시간 동기화(RLS: authenticated)가 가능해서, 세션 토큰을 localStorage로 넘겨준다.
  useEffect(() => {
    const supabase = createClient()
    function syncSession(session: { access_token: string; refresh_token: string } | null) {
      try {
        if (session) {
          localStorage.setItem('hrm_dg_session', JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }))
        } else {
          localStorage.removeItem('hrm_dg_session')
        }
      } catch {}
    }
    supabase.auth.getSession().then(({ data }) => syncSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => syncSession(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadAll() {
    try {
      const [treeRes, meetingsRes, scheduleRes, membersRes, familyDaysRes, holidaysRes] = await Promise.all([
        fetch('/api/tree'), fetch('/api/meetings'),
        fetch('/api/schedule'), fetch('/api/members'), fetch('/api/family-days'), fetch('/api/holidays'),
      ])
      if (treeRes.status === 401) { router.push('/login'); return }
      const [treeJson, meetingsJson, scheduleJson, membersJson, familyDaysJson, holidaysJson] = await Promise.all([
        treeRes.json(), meetingsRes.json(), scheduleRes.json(), membersRes.json(), familyDaysRes.json(), holidaysRes.json(),
      ])
      if (!treeJson.ok) { setLoadError(treeJson.error ?? '불러오기 실패'); setLoaded(true); return }
      setGroups(treeJson.groups)
      if (meetingsJson.ok) {
        setMeetings(meetingsJson.meetings)
      }
      if (scheduleJson.ok) setEvents(scheduleJson.events)
      if (membersJson.ok) setMembers(membersJson.members)
      if (familyDaysJson.ok) setFamilyDays(familyDaysJson.days)
      if (holidaysJson.ok) setHolidays(holidaysJson.holidays)
      setLoaded(true)
    } catch {
      setLoadError('네트워크 오류')
      setLoaded(true)
    }
  }

  function unauthorizedGuard(res: Response) {
    if (res.status === 401) { router.push('/login'); return true }
    return false
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleChangePassword() {
    const next = prompt('새 비밀번호를 입력하세요 (6자 이상)')
    if (!next) return
    if (next.length < 6) { alert('6자 이상으로 입력해주세요.'); return }
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: next })
    alert(error ? '변경 실패: ' + error.message : '비밀번호가 변경되었습니다.')
  }

  // ── 업무: 그룹 ────────────────────────────────────────────────────────
  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    const res = await fetch('/api/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGroupName.trim(), color }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setGroups(prev => [...prev, json.group]); setNewGroupName('') }
  }

  function startEditGroup(g: Group) { setEditingGroupId(g.id); setEditGroupName(g.name) }

  async function saveEditGroup(id: string) {
    const name = editGroupName.trim()
    setEditingGroupId(null)
    if (!name) return
    const res = await fetch('/api/groups', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => g.id === id ? { ...g, name: json.group.name } : g))
  }

  async function deleteGroup(g: Group) {
    if (!confirm(`"${g.name}" 그룹을 삭제할까요? 안의 항목/기록도 모두 삭제됩니다.`)) return
    const res = await fetch('/api/groups', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.filter(x => x.id !== g.id))
      if (activeGroupId === g.id) setActiveGroupId(null)
    }
  }

  // ── 업무: 항목 ────────────────────────────────────────────────────────
  async function handleAddItem(groupId: string, e: React.FormEvent) {
    e.preventDefault()
    const title = (newItemTitle[groupId] ?? '').trim()
    if (!title) return
    const res = await fetch('/api/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: groupId, title }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, items: [...g.items, json.item] } : g))
      setNewItemTitle(prev => ({ ...prev, [groupId]: '' }))
    }
  }

  async function cycleStatus(item: Item) {
    const prevStatus = item.status
    const next = STATUS_NEXT[prevStatus]
    // 낙관적 업데이트: 서버 응답 기다리지 않고 먼저 화면을 바꾸고, 실패하면 되돌린다.
    setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === item.id ? { ...i, status: next } : i) })))
    const res = await fetch('/api/items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status: next }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) {
      setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === item.id ? { ...i, status: prevStatus } : i) })))
    }
  }

  function startEditItem(item: Item, e: React.MouseEvent) { e.stopPropagation(); setEditingItemId(item.id); setEditItemTitle(item.title) }

  async function saveEditItem(id: string) {
    const title = editItemTitle.trim()
    setEditingItemId(null)
    if (!title) return
    const res = await fetch('/api/items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === id ? { ...i, title: json.item.title } : i) })))
  }

  async function deleteItem(item: Item, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`"${item.title}" 항목을 삭제할까요? 안의 기록도 모두 삭제됩니다.`)) return
    const res = await fetch('/api/items', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.filter(i => i.id !== item.id) })))
  }

  function toggleExpand(itemId: string) {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
      return next
    })
  }

  // ── 업무: 서브태스크(기록) ────────────────────────────────────────────
  async function handleAddSubtask(item: Item, e: React.FormEvent) {
    e.preventDefault()
    const form = subForm[item.id] ?? EMPTY_SUB_FORM
    if (!author.trim() || !form.title.trim()) return
    const res = await fetch('/api/subtasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 빠른 입력: 구분/날짜는 항상 업무기록/오늘로 기본값 처리. 필요하면 나중에 "수정"으로 바꾸면 됨.
      body: JSON.stringify({ item_id: item.id, author: author.trim(), entry_type: '업무기록', entry_date: todayStr(), title: form.title.trim(), content: form.content }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === item.id ? { ...i, subtasks: [...i.subtasks, json.subtask] } : i) })))
      setSubForm(prev => ({ ...prev, [item.id]: EMPTY_SUB_FORM }))
    }
  }

  function startEditSubtask(s: Subtask) {
    setEditingSubtaskId(s.id)
    setEditSubForm({ type: s.entry_type, date: s.entry_date, title: s.title, content: s.content })
  }

  async function saveEditSubtask(id: string) {
    if (!editSubForm.title.trim()) { setEditingSubtaskId(null); return }
    const res = await fetch('/api/subtasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, author, entry_type: editSubForm.type, entry_date: editSubForm.date, title: editSubForm.title.trim(), content: editSubForm.content }),
    })
    setEditingSubtaskId(null)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => ({ ...i, subtasks: i.subtasks.map(s => s.id === id ? json.subtask : s) })) })))
    }
  }

  async function deleteSubtask(s: Subtask) {
    if (!confirm('이 기록을 삭제할까요?')) return
    const res = await fetch('/api/subtasks', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => ({ ...i, subtasks: i.subtasks.filter(x => x.id !== s.id) })) })))
  }

  // ── 회의록 ────────────────────────────────────────────────────────────
  function prevMeetingMonth() { setMeetingMonth(m => { if (m === 1) { setMeetingYear(y => y - 1); return 12 } return m - 1 }) }
  function nextMeetingMonth() { setMeetingMonth(m => { if (m === 12) { setMeetingYear(y => y + 1); return 1 } return m + 1 }) }
  function gotoMeetingToday() { const [y, m] = todayStr().split('-').map(Number); setMeetingYear(y); setMeetingMonth(m) }

  function selectMeetingFilter(f: MeetingFilter) {
    setMeetingFilter(f)
    if (f === '이번달') {
      const [y, m] = todayStr().split('-').map(Number)
      setMeetingYear(y)
      setMeetingMonth(m)
    }
  }

  // ── 결정사항/액션아이템/메모(캡처화면) 입력 중인 내용("composer")을 회의 전환이
  // 조용히 날려버리지 않도록 지키는 가드. 안건 메모·표 칸은 blur 시 자동저장되는 별도 필드라 여기 대상이 아니다.
  function hasDirtyComposer() {
    return Boolean(
      Object.values(memoComposers).some(c => c.text.trim() || c.image) ||
      newDecisionText.trim() ||
      newActionText.trim() || newActionOwners.length > 0 || newActionDue
    )
  }
  function resetComposerState() {
    setNewDecisionText('')
    setNewActionText('')
    setNewActionOwners([])
    setNewActionDue('')
    Object.values(memoComposers).forEach(c => { if (c.image) URL.revokeObjectURL(c.image.previewUrl) })
    setMemoComposers({ memo: EMPTY_MEMO_COMPOSER, contract_leave: EMPTY_MEMO_COMPOSER })
  }
  // trigger: 'switch-meeting' | 'backdrop' | 'x' | 'esc' | 'cancel-button' 등 — 호출부에서 어떤 동작이
  // 이 가드를 거쳤는지 알아볼 수 있도록 남겨둔 라벨(현재는 로직에 관여하지 않음).
  function guardComposerAnd(trigger: string, action: () => void) {
    if (hasDirtyComposer()) {
      const proceed = confirm('저장되지 않은 내용이 있습니다. 내용을 버리고 이동할까요?')
      if (!proceed) return
      resetComposerState()
    }
    action()
  }

  // "+ 새 회의"(회의록 탭·일정 탭 캘린더 공통) — 바로 회의를 만들어 회의록 탭 상세 화면으로 연다. 제목은 자리표시(UNTITLED_MEETING)로
  // 만들고 상세 화면 제목 칸에 커서를 둔다. 아무것도 안 쓰고 다른 회의로 옮기면 아래 effect가 자리표시 회의를 지운다.
  // popup: 업무 > 팀 일정 캘린더에서 만들 땐 탭을 옮기지 않고 회의창으로 연다.
  function createMeeting(date: string = todayStr(), popup = false) {
    guardComposerAnd('switch-meeting', () => { void doCreateMeeting(date, popup) })
  }
  async function doCreateMeeting(date: string, popup: boolean) {
    const res = await fetch('/api/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: UNTITLED_MEETING, meeting_date: date, meeting_time: '', attendees: '', agenda: '' }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json().catch(() => null)
    if (!json?.ok) { showFlash(json?.error ?? '회의를 만들지 못했습니다.', 'error'); return }
    const m = json.meeting as Meeting
    setMeetings(prev => [m, ...prev].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)))
    if (popup) { setSelectedMeetingId(m.id); setMeetingPopupOpen(true) }
    else showMeeting(m)
    setFocusTitleMeetingId(m.id)
  }

  function openMeetingPopup(m: Meeting) {
    guardComposerAnd('switch-meeting', () => {
      setMeetingMenuOpen(false)
      setSelectedMeetingId(m.id)
      setMeetingPopupOpen(true)
    })
  }
  // 칸에 입력 중인 채로 닫으면(언마운트) blur 저장이 안 불린다 — 먼저 포커스를 빼 평소처럼 저장을 시작시킨 뒤 닫는다.
  function closeMeetingPopup() {
    guardComposerAnd('close-popup', () => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) el.blur()
      setTimeout(() => setMeetingPopupOpen(false), 0)
    })
  }

  // 회의록 탭을 메뉴에서 숨긴 뒤로는 리마인더·검색·새 회의 모두 회의창(팝업)으로 연다.
  function showMeeting(m: Meeting) {
    setMeetingMenuOpen(false)
    setSelectedMeetingId(m.id)
    setMeetingPopupOpen(true)
  }

  // ── 업무 허브 ── 요약(팀 달력, 회의 포함) · R&R · 루틴 · 목표·회고 · 아카이빙. 업무 메뉴를 누르면 요약부터.
  type HubTab = 'summary' | 'tasks' | 'routine' | 'goals' | 'retro' | 'archiving'
  const hubTab: HubTab | null = section === 'work'
    ? (workTab === 'calendar' ? 'routine' : 'tasks')
    : section === 'schedule' ? 'summary' : section === 'goals' || section === 'retro' || section === 'archiving' ? section : null
  function goHub(tab: HubTab) {
    if (tab === 'summary') { setSection('schedule'); return }
    if (tab === 'goals' || tab === 'retro' || tab === 'archiving') { setSection(tab); return }
    setSection('work')
    setWorkTab(tab === 'routine' ? 'calendar' : 'tasks')
  }

  // 미확정 회의를 지우기 직전, 화면 state가 놓쳤을 수 있는(다른 사람 입력·realtime 지연) 내용을 서버에서
  // 한 번 더 확인한다. 하나라도 조회에 실패하면 "비어있다"고 단정하지 않는다(= 지우지 않는다).
  async function isMeetingEmptyOnServer(meetingId: string): Promise<boolean> {
    try {
      const [mRes, iRes, pRes, rRes] = await Promise.all([
        fetch(`/api/meetings?id=${meetingId}`),
        fetch(`/api/meeting-items?meeting_id=${meetingId}`),
        fetch(`/api/meeting-progress?meeting_id=${meetingId}`),
        fetch(`/api/report-items?meeting_id=${meetingId}`),
      ])
      if (!mRes.ok || !iRes.ok || !pRes.ok || !rRes.ok) return false
      const [m, i, p, r] = await Promise.all([mRes.json(), iRes.json(), pRes.json(), rRes.json()])
      if (!m.ok || !i.ok || !p.ok || !r.ok) return false
      const agendaEmpty = !(m.meeting?.agenda ?? '').trim()
      const itemsEmpty = (i.items as MeetingItem[]).length === 0
      const progressEmpty = !(p.progress as MeetingProgress[]).some(row => row.content.trim())
      // 업무보고: 이 회의 칸에 쓴 내용, 또는 이 회의 날짜에 새로 만든 업무 행
      const reportEmpty = !(r.updates as { update_text: string; feedback: string }[]).some(u => u.update_text.trim() || u.feedback.trim())
        && !(r.items as { start_date: string }[]).some(it => it.start_date === r.date)
      return agendaEmpty && itemsEmpty && progressEmpty && reportEmpty
    } catch {
      return false
    }
  }

  // "+ 새 회의"로 만든 자리표시 회의(제목을 안 바꿈)를 아무것도 쓰지 않고 떠나면 지운다 — 안 지우면 빈 "제목 없음"
  // 회의가 목록에 계속 쌓인다. 화면 state가 아니라 서버에서 비어 있음을 확인한 뒤에만 지운다(다른 사람이 썼을 수 있음).
  // 다른 회의를 고르거나 회의록 탭을 떠날 때 확인한다.
  const viewingMeetingId = meetingViewActive ? selectedMeetingId : null
  const prevSelectedMeetingRef = useRef<string | null>(null)
  useEffect(() => {
    const prevId = prevSelectedMeetingRef.current
    prevSelectedMeetingRef.current = viewingMeetingId
    if (!prevId || prevId === viewingMeetingId) return
    const prev = meetingsRef.current.find(m => m.id === prevId)
    if (!prev || prev.title !== UNTITLED_MEETING) return
    void (async () => {
      if (!(await isMeetingEmptyOnServer(prevId))) return
      const res = await fetch('/api/meetings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: prevId }),
      })
      if (unauthorizedGuard(res)) return
      setMeetings(list => list.filter(m => m.id !== prevId))
      setSelectedMeetingId(cur => (cur === prevId ? null : cur))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 보고 있는 회의가 바뀔 때만 확인
  }, [viewingMeetingId])

  // 회의록 상세에서 각 항목을 그 자리에서 고칠 때 쓴다 (blur 시 저장). API가 부분 업데이트를
  // 지원하므로 바뀐 필드만 보낸다 — 다른 필드는 그 사이 딴 사람이 고쳤어도 건드리지 않는다.
  // 안건은 동시편집 충돌 감지가 필요해서 이 함수 대신 saveAgendaField를 쓴다.
  async function updateMeetingField(m: Meeting, patch: Partial<Pick<Meeting, 'title' | 'meeting_date' | 'meeting_time' | 'attendees'>>) {
    if ('title' in patch && !patch.title?.trim()) return
    if ('meeting_date' in patch && !patch.meeting_date) return
    const res = await fetch('/api/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, ...patch }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setMeetings(prev => prev.map(x => x.id === m.id ? mergeMeetingRow(x, json.meeting) : x).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)))
    } else {
      setLoadError(json.error ?? '회의록 저장에 실패했습니다.')
    }
  }

  // ── 회의록 동시편집: 저장 충돌(optimistic concurrency control) ─────────────
  // 안건 메모는 서버(DB 함수)가 "내가 편집을 시작할 때 본 version"과 현재 version을 원자적으로
  // 비교해, 그 사이 다른 사람이 저장했으면 409로 거절한다. 그때 아래 상태로 안내창을 띄운다 — 자동 덮어쓰기 없음.
  type SaveConflict = {
    meetingId: string
    baseValue: string // 내가 편집을 시작했을 때 값
    localValue: string // 내가 작성한 값
    serverValue: string // 현재 서버 최신값
    serverVersion: number
    updatedAt: string | null
    updatedBy: string | null
  }
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null)
  type AgendaBase = { text: string; version: number }
  type AgendaServerState = Pick<Meeting, 'agenda' | 'agenda_version' | 'agenda_updated_at' | 'agenda_updated_by'>

  // ── 회의상세 미저장 이탈 경고 ─────────────────────────────────────────
  // 제목/날짜/시간/참석자/안건 메모는 모두 blur 시점에만 저장되므로, blur 없이
  // (앱 전환, 탭 강제 종료 등) 창을 닫으면 입력 내용이 저장되지 않고 사라질 수 있다.
  // 필드별로 "편집 중(dirty)" 여부만 셋으로 추적해서, 하나라도 남아있으면 beforeunload로 경고한다.
  const dirtyMeetingFieldsRef = useRef<Set<string>>(new Set())
  const markMeetingFieldDirty = (key: string) => { dirtyMeetingFieldsRef.current.add(key) }
  const markMeetingFieldClean = (key: string) => { dirtyMeetingFieldsRef.current.delete(key) }

  // CollabAgendaField 내부 텍스트를 부모 값(initialText)으로 다시 seed할 때 올린다 — resetToken에 섞어 넘긴다.
  const [agendaResetNonce, setAgendaResetNonce] = useState(0)
  const bumpAgendaReset = () => setAgendaResetNonce(n => n + 1)
  // 안건 저장이 DB에 반영될 때마다 n을 올린다 → CollabAgendaField가 다른 사람에게 'saved' 신호를 보낸다.
  const [agendaSavedSignal, setAgendaSavedSignal] = useState<{ meetingId: string; n: number } | null>(null)
  // 비동기 흐름(서버 응답 이후)에서 회의 상세의 baseline(meetings[].agenda/agenda_version)을 최신으로 읽기 위한 미러.
  const meetingsRef = useRef<Meeting[]>([])
  useEffect(() => { meetingsRef.current = meetings }, [meetings])

  // 같은 탭에서 내가 방금 올린 version 이력(이전 → 새 version), 저장 대기열이 도는 동안만 유지한다.
  // 대기열의 다음 저장이 아직 옛 version을 기준으로 잡혀 있을 때, 그 사이 바뀐 게 "내 직전 저장"뿐이면
  // 이어서 쓴다(다른 사람의 저장은 절대 건너뛰지 않으므로 그 경우엔 그대로 409가 난다).
  const ownVersionHopsRef = useRef<Record<string, Record<number, number>>>({})
  function resolveOwnVersion(key: string, version: number) {
    const hops = ownVersionHopsRef.current[key]
    let v = version
    while (hops && hops[v] !== undefined) v = hops[v]
    return v
  }
  function recordOwnVersion(key: string, from: number, to: number) {
    ownVersionHopsRef.current[key] = { ...(ownVersionHopsRef.current[key] ?? {}), [from]: to }
  }

  // 같은 탭의 안건 저장은 한 줄로 세워 순서대로 처리한다 — 겹친 요청의 응답이 역전돼 오래된 결과가
  // 최신 state를 되돌리거나, 직전 내 저장 때문에 다음 저장이 충돌로 오인되는 걸 막는다.
  const agendaSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const agendaSaveSeqRef = useRef<Record<string, number>>({})
  const agendaSavingCountRef = useRef(0)
  const isLatestAgendaSave = (meetingId: string, seq: number) => agendaSaveSeqRef.current[meetingId] === seq

  function enqueueAgendaSave(meetingId: string, job: (seq: number) => Promise<void>) {
    const seq = (agendaSaveSeqRef.current[meetingId] ?? 0) + 1
    agendaSaveSeqRef.current[meetingId] = seq
    agendaSavingCountRef.current += 1
    const run = agendaSaveChainRef.current
      .then(() => job(seq))
      .catch(() => { setLoadError('안건 저장에 실패했습니다.') })
      .finally(() => {
        agendaSavingCountRef.current -= 1
        if (agendaSavingCountRef.current === 0) ownVersionHopsRef.current = {}
      })
    agendaSaveChainRef.current = run
    return run
  }

  // 회의 상세는 meetings 상태의 agenda/agenda_version이 그대로 "마지막으로 알고 있던 서버 값" 역할을 한다.
  function agendaBaseline(meetingId: string): AgendaBase {
    const m = meetingsRef.current.find(x => x.id === meetingId)
    return { text: m?.agenda ?? '', version: m?.agenda_version ?? 1 }
  }

  // 서버가 확인해 준 안건 상태를 반영한다. 더 낮은 version으로는 절대 되돌리지 않는다(늦게 도착한 응답 방어).
  function applyAgendaServerState(meetingId: string, s: AgendaServerState) {
    setMeetings(prev => prev.map(x => x.id === meetingId && s.agenda_version >= (x.agenda_version ?? 0) ? { ...x, ...s } : x))
  }

  async function putAgenda(meetingId: string, text: string, expectedVersion: number, baseValue: string) {
    const res = await fetch('/api/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: meetingId, agenda: text, expected_agenda_version: expectedVersion }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json().catch(() => null)
    if (res.status === 409 && json?.conflict) {
      const cur = json.current as AgendaServerState
      const c: SaveConflict = {
        meetingId, baseValue, localValue: text,
        serverValue: cur.agenda, serverVersion: cur.agenda_version, updatedAt: cur.agenda_updated_at, updatedBy: cur.agenda_updated_by,
      }
      applyConflictServer(c)
      setSaveConflict(c)
      return
    }
    if (!json?.ok) {
      setLoadError(json?.error ?? '안건 저장에 실패했습니다.')
      return
    }
    const saved = json.agenda as AgendaServerState
    recordOwnVersion(`agenda:${meetingId}`, expectedVersion, saved.agenda_version)
    setAgendaSavedSignal(s => ({ meetingId, n: (s?.n ?? 0) + 1 }))
    applyAgendaServerState(meetingId, saved)
  }

  // base = 내가 편집을 시작할 때 본 서버 안건/version. 충돌 판단은 서버가 원자적으로 한다(클라이언트 사전 조회 없음).
  // 저장이 끝나면 resolve된다 — 칸 잠금은 이 뒤에 푼다(풀린 걸 본 다른 사람이 최신값을 읽도록).
  function saveAgendaField(meetingId: string, myText: string, base: AgendaBase): Promise<void> {
    if (myText === base.text) return Promise.resolve() // 바뀐 게 없으면 저장하지 않는다
    return enqueueAgendaSave(meetingId, async seq => {
      // 이 사이 같은 안건의 더 최신 blur 저장이 들어왔으면 그쪽이 최신 전체 텍스트를 갖고 있으므로 보내지 않는다.
      if (!isLatestAgendaSave(meetingId, seq)) return
      await putAgenda(meetingId, myText, resolveOwnVersion(`agenda:${meetingId}`, base.version), base.text)
    })
  }

  // 편집 세션 시작 시, 그리고 다른 사람이 안건 저장을 마쳤다는 신호('saved')를 받았을 때 서버 최신 안건을 읽는다.
  // broadcast 내용이 아니라 DB 값을 기준으로 baseline을 갱신하며, 이 필드에 미저장 입력이 있으면 건드리지 않는다
  // (그 경우 저장 시 서버가 version 불일치로 409를 돌려 충돌 화면으로 처리된다).
  async function syncAgendaFromServer({ meetingId, getText }: AgendaFieldSnapshot) {
    if (agendaSavingCountRef.current > 0) return // 내 저장이 진행 중이면 그 결과가 baseline을 맞춘다
    const res = await fetch(`/api/meetings?id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json().catch(() => null)
    if (!json?.ok || !json.meeting) return
    if (agendaSavingCountRef.current > 0) return
    const server = json.meeting as Meeting
    const known = agendaBaseline(meetingId)
    if (server.agenda_version <= known.version) return
    const localText = getText()
    if (localText === null || localText !== known.text) return
    applyAgendaServerState(meetingId, server)
    bumpAgendaReset()
  }

  // 저장 충돌(칸 잠금이 있어 정상적으론 안 생김 — 순간 접속 끊김 등 예외 상황) 처리: 고르게 하지 않고 서버 최신값으로
  // 바로 바꾼 뒤, 내가 쓴 내용은 안내창에 남겨 필요하면 복사해 다시 붙여넣게 한다(saveConflict = 그 안내창 상태).
  function applyConflictServer(c: SaveConflict) {
    const st: AgendaServerState = { agenda: c.serverValue, agenda_version: c.serverVersion, agenda_updated_at: c.updatedAt, agenda_updated_by: c.updatedBy }
    applyAgendaServerState(c.meetingId, st)
    markMeetingFieldClean('agenda')
    bumpAgendaReset()
  }

  async function deleteMeeting(m: Meeting) {
    if (!confirm(`"${m.title}" 회의록을 삭제할까요?`)) return
    const res = await fetch('/api/meetings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      const remaining = meetings.filter(x => x.id !== m.id)
      setMeetings(remaining)
      setMeetingMenuOpen(false)
      if (selectedMeetingId === m.id) setSelectedMeetingId(remaining[0]?.id ?? null)
    }
  }

  // 노션 아카이빙용 — 안건 표/메모/업무보고/결정사항/액션아이템을 한 번에 마크다운으로 복사한다.
  // 표(안건·업무보고)는 지금 보고 있는 회의 기준으로 불러온 workReport에서 읽는다.
  async function copyMeetingMarkdown(m: Meeting) {
    const decisions = meetingItems.filter(i => i.kind === 'decision')
    const actions = meetingItems.filter(i => i.kind === 'action')
    const memos = meetingItems.filter(i => i.kind === 'memo' || i.kind === 'contract_leave')
    const tableReady = workReport.meetingId === m.id && workReport.loaded
    const rowLines = (item: ReportItem) => {
      const update = workReport.serverText(item.id, 'update').trim()
      const feedback = workReport.serverText(item.id, 'feedback').trim()
      const out = [`- ${item.pinned ? '[고정] ' : ''}${item.title}${workReport.isDoneHere(item) ? ' (완료)' : ''}`]
      if (update) out.push(...update.split('\n').map(l => `  ${l}`))
      if (feedback) out.push(`  ↳ 피드백: ${feedback.replace(/\n/g, ' ')}`)
      return out
    }
    const lines: string[] = []
    lines.push(`# ${m.title}`)
    lines.push(`${fmtMeetingDayFull(m.meeting_date)}${m.meeting_time ? ` · ${m.meeting_time}` : ''}${m.attendees ? ` · 참석자: ${m.attendees}` : ''}`)
    lines.push('')
    lines.push('## 안건')
    const agendaRows = tableReady ? workReport.items.filter(i => i.kind === 'agenda') : []
    if (agendaRows.length === 0) lines.push('_없음_')
    else [...agendaRows.filter(i => i.pinned), ...agendaRows.filter(i => !i.pinned)].forEach(i => {
      const owner = members.find(mem => mem.id === i.member_id)?.name
      const [first, ...rest] = rowLines(i)
      lines.push(owner ? `${first} — ${owner}` : first, ...rest)
    })
    lines.push('')
    if (m.agenda.trim() || memos.length > 0) {
      lines.push('## 메모')
      if (m.agenda.trim()) lines.push(m.agenda.trim())
      memos.forEach(i => { if (i.content) lines.push(`- ${i.content}`) })
      lines.push('')
    }
    lines.push('## 업무보고')
    members.forEach(mem => {
      const rows = tableReady ? workReport.items.filter(i => i.kind === 'report' && i.member_id === mem.id) : []
      const note = meetingProgress.find(p => p.meeting_id === m.id && p.member_id === mem.id)?.content.trim() ?? ''
      if (rows.length === 0 && !note) return
      lines.push(`### ${mem.name}`)
      if (note) lines.push(note, '')
      rows.forEach(i => lines.push(...rowLines(i)))
      lines.push('')
    })
    lines.push('## 결정사항')
    if (decisions.length === 0) lines.push('_없음_')
    else decisions.forEach(d => lines.push(`- ${d.content}`))
    lines.push('')
    lines.push('## 액션아이템')
    if (actions.length === 0) {
      lines.push('_없음_')
    } else {
      actions.forEach(a => {
        const owners = parseAttendees(a.owner)
        const meta = [owners.length > 0 ? `담당자: ${owners.join(', ')}` : null, a.due_date ? `기한: ${a.due_date}` : null].filter(Boolean).join(' · ')
        lines.push(`- [${a.done ? 'x' : ' '}] ${a.content}${meta ? ` (${meta})` : ''}`)
      })
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showFlash('회의 내용이 마크다운으로 복사되었습니다')
    } catch {
      setLoadError('클립보드 복사에 실패했습니다.')
    }
    setMeetingMenuOpen(false)
  }

  // ── 회의록: 결정사항/액션아이템 ─────────────────────────────────────────
  async function loadMeetingItems(meetingId: string | null) {
    if (!meetingId) { setMeetingItems([]); return }
    const res = await fetch(`/api/meeting-items?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { meetingItemsCache.set(meetingId, json.items); setMeetingItems(json.items) }
  }

  // ── 회의록: 팀원별 진행사항(예전 방식, 읽기 전용) ─────────────────────────
  // 업무보고 표로 바뀌기 전 회의에 써 둔 자유 텍스트. 그 회의를 열면 접어서 보여주기만 한다.
  async function loadMeetingProgress(meetingId: string | null) {
    if (!meetingId) { setMeetingProgress([]); return }
    const res = await fetch(`/api/meeting-progress?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { meetingProgressCache.set(meetingId, json.progress); setMeetingProgress(json.progress as MeetingProgress[]) }
  }

  // 직전 회의 참고용 — 읽기 전용이라 별도 state에 담는다.
  async function loadPrevMeetingItems(meetingId: string | null) {
    if (!meetingId) { setPrevMeetingItems([]); return }
    const res = await fetch(`/api/meeting-items?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setPrevMeetingItems(json.items)
  }

  // 성공 여부를 반환한다 — 호출부(결정사항/액션아이템/메모 입력창)가 이 결과를 보고 나서만
  // composer를 비운다. 예전엔 결과와 무관하게 호출 직후 바로 입력창을 비워서, 저장이 실패해도
  // 성공한 것처럼 보이고 입력했던 내용이 사라졌다.
  async function addMeetingItem(kind: 'decision' | 'action' | 'memo' | 'contract_leave', content: string, owner = '', dueDate = '', image: MemoImageDraft | null = null, reportItemId: string | null = null): Promise<boolean> {
    if (!content.trim() && !image) return false
    const meetingId = selectedMeetingId
    if (!meetingId) { showFlash('회의를 먼저 선택해주세요.', 'error'); return false }
    const res = await fetch('/api/meeting-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_id: meetingId, kind, content: content.trim(), owner, due_date: dueDate || null,
        image_url: image?.url ?? null, image_width: image?.width ?? null, image_height: image?.height ?? null,
        report_item_id: reportItemId,
      }),
    })
    if (unauthorizedGuard(res)) return false
    const json = await res.json()
    if (!json.ok) {
      showFlash(json.error ?? '저장에 실패했습니다.', 'error')
      return false
    }
    setMeetingItems(prev => [...prev, json.item])
    // 액션아이템은 곧 누군가의 할 일이므로, 따로 📅를 눌러야 하는 수동 연동 없이 바로 일정에 뜨게 한다.
    if (kind === 'action') addActionItemToSchedule(json.item)
    return true
  }

  // "+추가"가 실제 저장 트랜잭션의 시작점이다 — paste 시점엔 아무것도 서버에 보내지 않고
  // (handleMemoPaste 참고) 여기서 비로소 회의 레코드 확보 → 이미지 업로드 → item insert 순서로 진행한다.
  // 이미 한 번 업로드에 성공했는데 그 다음 insert만 실패해 재시도하는 경우, uploadedUrl 캐시 덕분에
  // 같은 파일을 다시 업로드하지 않는다(재시도할 때마다 Storage에 orphan이 쌓이는 걸 막기 위함).
  async function submitMeetingMemo(kind: MemoKind) {
    const c = memoComposers[kind]
    if ((!c.text.trim() && !c.image) || c.submitting) return
    patchComposer(kind, x => ({ ...x, submitting: true }))
    try {
      if (!selectedMeetingId) { showFlash('회의를 먼저 선택해주세요.', 'error'); return }

      let imagePayload: MemoImageDraft | null = null
      if (c.image) {
        if (c.image.uploadedUrl) {
          imagePayload = { url: c.image.uploadedUrl, width: c.image.width, height: c.image.height }
        } else {
          const form = new FormData()
          form.append('file', c.image.file)
          const res = await fetch('/api/meeting-memo-image', { method: 'POST', body: form })
          if (unauthorizedGuard(res)) return
          const json = await res.json()
          if (!json.ok) { showFlash(json.error ?? '이미지 업로드에 실패했습니다.', 'error'); return }
          imagePayload = { url: json.url, width: c.image.width, height: c.image.height }
          patchComposer(kind, x => ({ ...x, image: x.image && { ...x.image, uploadedUrl: json.url } }))
        }
      }

      const ok = await addMeetingItem(kind, c.text, '', '', imagePayload)
      if (ok) {
        if (c.image) URL.revokeObjectURL(c.image.previewUrl)
        patchComposer(kind, x => ({ ...x, text: '', image: null }))
      }
      // 실패하면(ok===false) addMeetingItem이 이미 에러 토스트를 띄웠다 — 입력은 그대로 남겨 재시도할 수 있게 한다.
    } finally {
      patchComposer(kind, x => ({ ...x, submitting: false }))
    }
  }

  // 입력줄에 캡처화면을 Ctrl+V로 붙여넣으면 로컬 미리보기만 만든다 — 실제 Storage 업로드는 "+추가"를 눌러야 시작된다
  // (안 누르고 떠나면 Storage에 회의와 연결 안 된 파일만 남는 걸 막으려고).
  function handleMemoPaste(kind: MemoKind, e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData?.items ?? []).find(it => it.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (!file) return

    patchComposer(kind, x => ({ ...x, uploading: true }))
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const displayWidth = Math.min(360, img.naturalWidth || 360)
      const displayHeight = img.naturalWidth ? Math.round(displayWidth * (img.naturalHeight / img.naturalWidth)) : displayWidth
      patchComposer(kind, x => {
        if (x.image) URL.revokeObjectURL(x.image.previewUrl) // 붙여넣기를 여러 번 하면 직전 미리보기 URL은 정리
        return { ...x, uploading: false, image: { file, previewUrl: objectUrl, width: displayWidth, height: displayHeight } }
      })
    }
    img.onerror = () => {
      patchComposer(kind, x => ({ ...x, uploading: false }))
      URL.revokeObjectURL(objectUrl)
      showFlash('이미지를 읽을 수 없습니다.', 'error')
    }
    img.src = objectUrl
  }

  function removeMemoImage(kind: MemoKind) {
    patchComposer(kind, x => {
      if (x.image) URL.revokeObjectURL(x.image.previewUrl)
      return { ...x, image: null }
    })
  }

  async function resizeMeetingMemoImage(item: MeetingItem, width: number, height: number) {
    setMeetingItems(prev => prev.map(i => i.id === item.id ? { ...i, image_width: width, image_height: height } : i))
    const res = await fetch('/api/meeting-items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, image_width: width, image_height: height }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) {
      // 크기만 바뀌는 거라 영향은 작지만, 그래도 실제 서버 상태로 다시 맞춘다.
      loadMeetingItems(item.meeting_id)
    }
  }

  async function toggleMeetingItemDone(item: MeetingItem) {
    setMeetingItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !item.done } : i))
    const res = await fetch('/api/meeting-items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, done: !item.done }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) {
      // realtime 재조회와 겹칠 수 있어 직전 snapshot으로 되돌리는 대신, 서버의 현재 상태를 다시 받아온다.
      showFlash(json.error ?? '완료 처리에 실패했습니다.', 'error')
      loadMeetingItems(item.meeting_id)
    }
  }

  async function deleteMeetingItem(item: MeetingItem) {
    setMeetingItems(prev => prev.filter(i => i.id !== item.id))
    const res = await fetch('/api/meeting-items', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) {
      showFlash(json.error ?? '삭제에 실패했습니다.', 'error')
      loadMeetingItems(item.meeting_id)
      return
    }
    // 액션을 지우면 서버가 그 액션이 만든 일정도 같이 지운다 — 캘린더 화면에서도 바로 뺀다.
    const removed: string[] = json.removed_event_ids ?? []
    if (removed.length > 0) {
      setEvents(prev => prev.filter(ev => !removed.includes(ev.id)))
      showFlash(`액션아이템과 연결된 일정 ${removed.length}건도 함께 삭제했습니다`)
    }
  }

  function addActionItemToSchedule(item: MeetingItem) {
    const owners = parseAttendees(item.owner)
    if (owners.length === 0) { addToSchedule(item.content, item.due_date ?? todayStr(), 'meeting', item.meeting_id, author.trim()); return }
    // 담당자가 여럿이면 각자의 일정에 각각 뜨도록 담당자 수만큼 나눠 추가한다.
    owners.forEach(name => addToSchedule(item.content, item.due_date ?? todayStr(), 'meeting', item.meeting_id, name))
  }

  // ── 일정 ──────────────────────────────────────────────────────────────
  async function addToSchedule(title: string, date: string, sourceType: 'item' | 'subtask' | 'meeting', sourceId: string, assignee?: string) {
    const res = await fetch('/api/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, event_date: date, assignee: assignee ?? author.trim(), source_type: sourceType, source_id: sourceId }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json().catch(() => null)
    if (json?.ok) {
      setEvents(prev => [...prev, json.event])
      showFlash(`"${title}" 일정에 추가됨`)
    } else {
      // 예전엔 실패해도 아무 표시가 없어 액션은 생겼는데 캘린더엔 없는 줄 몰랐다.
      showFlash(`"${title}" 일정 등록에 실패했습니다 — 일정 탭에서 직접 추가해주세요`, 'error')
    }
  }

  // 다른 곳(서버)에서 일정이 바뀐 뒤 캘린더를 다시 맞출 때.
  async function reloadEvents() {
    const res = await fetch('/api/schedule')
    if (unauthorizedGuard(res)) return
    const json = await res.json().catch(() => null)
    if (json?.ok) setEvents(json.events)
  }

  // 달력에서 일정을 다른 칸으로 끌어 놓으면 날짜(다른 팀원 행이면 담당자도)를 바꾼다. 화면은 먼저 옮기고 실패하면 되돌린다.
  async function moveEvent(id: string, date: string, assignee: string) {
    const ev = events.find(x => x.id === id)
    if (!ev || (ev.event_date === date && ev.assignee === assignee)) return
    setEvents(prev => prev.map(x => x.id === id ? { ...x, event_date: date, assignee } : x))
    const res = await fetch('/api/schedule', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: ev.title, event_date: date, assignee, tag: ev.tag, note: ev.note, status: ev.status }),
    }).catch(() => null)
    if (res && unauthorizedGuard(res)) return
    const json = res ? await res.json().catch(() => null) : null
    if (json?.ok) setEvents(prev => prev.map(x => x.id === id ? json.event : x))
    else { setEvents(prev => prev.map(x => x.id === id ? ev : x)); alert('일정을 옮기지 못했습니다. 다시 시도해 주세요.') }
  }

  async function setMemberColor(m: Member, colorKey: number) {
    setColorPickerMemberId(null)
    if (m.color_key === colorKey) return
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, color_key: colorKey } : x))
    const res = await fetch('/api/members', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, color_key: colorKey }),
    }).catch(() => null)
    if (res && unauthorizedGuard(res)) return
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) setMembers(prev => prev.map(x => x.id === m.id ? m : x))
  }

  async function saveDraft() {
    if (!draft || !draft.title.trim() || !draft.date || !draft.assignee) return
    const payload = { title: draft.title.trim(), event_date: draft.date, assignee: draft.assignee, tag: draft.tag.trim() || null, note: draft.note, status: draft.status }
    if (draft.id) {
      const res = await fetch('/api/schedule', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id, ...payload }),
      })
      if (unauthorizedGuard(res)) return
      const json = await res.json()
      if (json.ok) setEvents(prev => prev.map(ev => ev.id === draft.id ? json.event : ev))
    } else {
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (unauthorizedGuard(res)) return
      const json = await res.json()
      if (json.ok) setEvents(prev => [...prev, json.event])
    }
    setDraft(null)
  }

  async function deleteDraftEvent(id: string) {
    if (!confirm('이 일정을 삭제할까요?')) return
    const res = await fetch('/api/schedule', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setEvents(prev => prev.filter(x => x.id !== id)); setDraft(null) }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    if (!newMemberName.trim()) return
    const res = await fetch('/api/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newMemberName.trim() }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setMembers(prev => [...prev, json.member]); setNewMemberName('') }
  }

  async function removeMember(m: Member) {
    if (!confirm(`"${m.name}" 팀원을 목록에서 제거할까요? (기존 일정은 남아있습니다)`)) return
    const res = await fetch('/api/members', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMembers(prev => prev.filter(x => x.id !== m.id))
  }

  async function addFamilyDay(e: React.FormEvent) {
    e.preventDefault()
    if (!familyDayInput) return
    setFamilyDayError('')
    const res = await fetch('/api/family-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: familyDayInput }),
    })
    const json = await res.json()
    if (json.ok) {
      setFamilyDays(prev => {
        const filtered = prev.filter(f => f.date !== json.day.date)
        return [...filtered, json.day].sort((a, b) => a.date.localeCompare(b.date))
      })
      setFamilyDayInput('')
    } else {
      setFamilyDayError(json.error ?? '저장 실패')
    }
  }

  async function removeFamilyDay(id: string) {
    const res = await fetch('/api/family-days', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    const json = await res.json()
    if (json.ok) setFamilyDays(prev => prev.filter(f => f.id !== id))
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault()
    if (!holidayDateInput || !holidayNameInput.trim()) return
    setHolidayError('')
    const res = await fetch('/api/holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: holidayDateInput, name: holidayNameInput.trim() }),
    })
    const json = await res.json()
    if (json.ok) {
      setHolidays(prev => {
        const filtered = prev.filter(h => h.date !== json.holiday.date)
        return [...filtered, json.holiday].sort((a, b) => a.date.localeCompare(b.date))
      })
      setHolidayDateInput('')
      setHolidayNameInput('')
      showFlash(`"${json.holiday.name}" 공휴일이 저장되었습니다`)
    } else {
      setHolidayError(json.error ?? '저장 실패')
    }
  }

  async function removeHoliday(id: string) {
    const res = await fetch('/api/holidays', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    const json = await res.json()
    if (json.ok) {
      setHolidays(prev => prev.filter(h => h.id !== id))
      showFlash('공휴일이 삭제되었습니다')
    }
  }

  function handleNotificationNavigate(meta: NotificationMeta) {
    if (meta.section && isSection(meta.section)) {
      if (meta.section === 'work') goHub('tasks')
      else setSection(meta.section)
    }
    if (meta.date) {
      const [y, m] = meta.date.split('-').map(Number)
      if (y && m) { setCalYear(y); setCalMonthNum(m) }
    }
  }

  function prevMonth() { setCalMonthNum(m => { if (m === 1) { setCalYear(y => y - 1); return 12 } return m - 1 }) }
  function nextMonth() { setCalMonthNum(m => { if (m === 12) { setCalYear(y => y + 1); return 1 } return m + 1 }) }
  function gotoToday() { const [y, m] = todayStr().split('-').map(Number); setCalYear(y); setCalMonthNum(m) }

  // ── 파생 데이터 ───────────────────────────────────────────────────────
  const allSubtasks = useMemo(
    () => groups.flatMap(g => g.items.flatMap(i => i.subtasks.map(s => ({ ...s, groupName: g.name, itemTitle: i.title })))),
    [groups]
  )
  const authors = useMemo(() => ['전체', ...Array.from(new Set(allSubtasks.map(s => s.author)))], [allSubtasks])
  const upcomingReports = useMemo(() => {
    const today = todayStr()
    return allSubtasks
      .filter(s => s.entry_type === '보고일정' && s.entry_date >= today)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .slice(0, 5)
  }, [allSubtasks, serverToday])
  const visibleGroups = activeGroupId ? groups.filter(g => g.id === activeGroupId) : groups

  // 회의록/일정 전체를 대상으로 하는 상단 검색 — 별도 API 없이 이미 불러온 목록에서 찾는다.
  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase()
    if (!q) return { meetings: [] as Meeting[], events: [] as ScheduleEvent[] }
    return {
      meetings: meetings
        .filter(m => m.title.toLowerCase().includes(q) || m.agenda.toLowerCase().includes(q) || m.attendees.toLowerCase().includes(q))
        .slice(0, 8),
      events: events
        .filter(e => e.title.toLowerCase().includes(q) || e.note.toLowerCase().includes(q) || e.assignee.toLowerCase().includes(q) || (e.tag ?? '').toLowerCase().includes(q))
        .slice(0, 8),
    }
  }, [globalSearch, meetings, events])

  function goToSearchedMeeting(m: Meeting) {
    guardComposerAnd('switch-meeting', () => {
      showMeeting(m)
      setGlobalSearch('')
      setGlobalSearchOpen(false)
    })
  }

  function goToSearchedEvent(ev: ScheduleEvent) {
    setSection('schedule')
    const [y, mo] = ev.event_date.split('-').map(Number)
    if (y && mo) { setCalYear(y); setCalMonthNum(mo) }
    setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note, status: ev.status })
    setGlobalSearch('')
    setGlobalSearchOpen(false)
  }

  const monthWeeks = useMemo(() => {
    const first = new Date(calYear, calMonthNum - 1, 1)
    const last = new Date(calYear, calMonthNum, 0)
    const dow = (first.getDay() + 6) % 7 // 월=0
    const weekStart = new Date(first)
    weekStart.setDate(first.getDate() - dow)
    const weeks: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const monday = new Date(weekStart)
      monday.setDate(weekStart.getDate() + w * 7)
      if (monday > last) break
      const week: Date[] = []
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        week.push(d)
      }
      weeks.push(week)
    }
    return weeks
  }, [calYear, calMonthNum])


  const filteredEvents = useMemo(
    () => events,
    [events]
  )

  const familyDaySet = useMemo(() => new Set(familyDays.map(f => f.date)), [familyDays])
  const holidayMap = useMemo(() => new Map(holidays.map(h => [h.date, h.name])), [holidays])
  // 생일은 연도 무관 매년 반복이라 'MM-DD'만 비교한다.
  const birthdayMdByName = useMemo(() => {
    const map = new Map<string, string>()
    profileMembers.forEach(pm => { if (pm.birthday) map.set(pm.name, pm.birthday.slice(5)) })
    return map
  }, [profileMembers])
  // 입사기념일은 N주년 계산이 필요해서 원본 날짜(YYYY-MM-DD)를 그대로 들고 있는다.
  const hiredAtByName = useMemo(() => {
    const map = new Map<string, string>()
    profileMembers.forEach(pm => { if (pm.hired_at) map.set(pm.name, pm.hired_at) })
    return map
  }, [profileMembers])

  // 생일/입사기념일 칩 목록. 캘린더가 월~금만 보여줘서 주말에 걸리면 원래는 셀 자체가
  // 없어 안 보이므로, 그 주 금요일 칸에서 토/일도 함께 확인해 당겨서 보여준다(daySuffix로 표시).
  function dayEventChips(d: Date, daySuffix?: string) {
    const md = dateStr(d).slice(5)
    const chips: { key: string; text: string; color: string }[] = []
    visibleMembers.forEach(m => {
      if (birthdayMdByName.get(m.name) === md) {
        chips.push({ key: `b-${m.id}-${daySuffix ?? ''}`, text: `🎂 ${m.name}${daySuffix ?? ''}`, color: 'bg-pink-400' })
      }
      const hired = hiredAtByName.get(m.name)
      if (hired && hired.slice(5) === md) {
        const years = d.getFullYear() - Number(hired.slice(0, 4))
        if (years > 0) chips.push({ key: `a-${m.id}-${daySuffix ?? ''}`, text: `🎉 ${m.name} ${years}주년${daySuffix ?? ''}`, color: 'bg-sky-400' })
      }
    })
    return chips
  }

  const unassignedEvents = useMemo(
    () => filteredEvents.filter(ev => !members.some(m => m.name === ev.assignee)),
    [filteredEvents, members]
  )

  const visibleMembers = selectedMember ? members.filter(m => m.name === selectedMember) : members

  const filteredMeetings = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase()
    const today = parseISO(todayStr())
    const weekStart = dateStr(startOfWeek(today))
    const weekEnd = dateStr(new Date(startOfWeek(today).getTime() + 6 * 86400000))
    const browsedMonthPrefix = `${meetingYear}-${String(meetingMonth).padStart(2, '0')}`
    return meetings.filter(m => {
      if (q && !(m.title.toLowerCase().includes(q) || m.agenda.toLowerCase().includes(q) || m.attendees.toLowerCase().includes(q))) return false
      // '이번주'는 지금 보고 있는 월과 무관하게 실제 이번주만 본다 (월 네비게이션 무시)
      if (meetingFilter === '이번주') return m.meeting_date >= weekStart && m.meeting_date <= weekEnd
      // 그 외에는 항상 현재 탐색 중인 월을 기준으로 좁힌다
      if (!m.meeting_date.startsWith(browsedMonthPrefix)) return false
      if (meetingFilter === '내회의' && !m.attendees.includes(author)) return false
      return true
    })
  }, [meetings, meetingSearch, meetingFilter, meetingYear, meetingMonth, author, serverToday])

  // 위클리미팅(고정회의)은 목록에서 회차별로 늘어놓지 않고 하나의 접이식 그룹으로 묶는다.
  // meetings가 meeting_date desc로 오므로, 그룹은 가장 최근 회차의 자리에 놓이고 그 안의
  // 회차들도 이미 최신순 그대로다. 일반 회의는 지금처럼 개별 항목으로 남는다.
  const meetingListRows = useMemo(() => {
    const rows: MeetingListRow[] = []
    let weeklyGroup: Meeting[] | null = null
    for (const m of filteredMeetings) {
      if (m.title === WEEKLY_MEETING_TITLE) {
        if (!weeklyGroup) {
          weeklyGroup = []
          rows.push({ kind: 'group', title: WEEKLY_MEETING_TITLE, meetings: weeklyGroup })
        }
        weeklyGroup.push(m)
      } else {
        rows.push({ kind: 'single', meeting: m })
      }
    }
    return rows
  }, [filteredMeetings])

  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId) ?? null

  function matchesFilter(s: Subtask) {
    return (filterAuthor === '전체' || s.author === filterAuthor) && (filterType === '전체' || s.entry_type === filterType)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const hoveredKey = hoveredKeyRef.current
      if (e.key.toLowerCase() !== 's' || !hoveredKey) return
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      e.preventDefault()
      const [type, id] = hoveredKey.split(':')
      if (type === 'item') {
        const item = groups.flatMap(g => g.items).find(i => i.id === id)
        if (item) addToSchedule(item.title, todayStr(), 'item', item.id)
      } else if (type === 'subtask') {
        const s = allSubtasks.find(s => s.id === id)
        if (s) addToSchedule(s.title, s.entry_date, 'subtask', s.id, s.author)
      } else if (type === 'meeting') {
        const m = meetings.find(m => m.id === id)
        if (m) addToSchedule(m.title, m.meeting_date, 'meeting', m.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [groups, meetings, allSubtasks, serverToday, author])

  // ── 회의록 칸 잠금(안건 메모, 안건·업무보고 표 칸) ──────────────────────────
  // 누가 칸을 클릭하면 다른 사람에겐 그 칸이 읽기 전용(+실시간 미리보기)이 되고, 저장이 끝나야 풀린다(lib/useFieldLocks).
  // 잠금 대상 회의 = 회의록 탭이나 회의창에서 보고 있는 회의.
  const lockMeetingId = meetingViewActive ? selectedMeetingId : null
  // 안건 잠금이 풀리면 CollabAgendaField가 syncNonce를 보고 서버 최신값을 읽는다 — 그 재조회가 끝날 때 resolve.
  const [agendaSyncNonce, setAgendaSyncNonce] = useState(0)
  const agendaSyncWaitersRef = useRef<(() => void)[]>([])
  const flushAgendaSyncWaiters = () => {
    const waiters = agendaSyncWaitersRef.current
    agendaSyncWaitersRef.current = []
    waiters.forEach(w => w())
  }
  const fieldLocks = useFieldLocks(lockMeetingId, author || '팀원', {
    onReleased: field => {
      if (field === 'agenda') return new Promise<void>(resolve => { agendaSyncWaitersRef.current.push(resolve); setAgendaSyncNonce(n => n + 1) })
      if (field.startsWith('report:')) return workReportRef.current.reload()
    },
    onLost: (field, holderName) => {
      if (field === 'agenda') {
        markMeetingFieldClean('agenda')
        bumpAgendaReset()
      } else if (field.startsWith('report:')) {
        // report:{itemId}:{update|feedback}
        const [, itemId, f] = field.split(':')
        if (f === 'update' || f === 'feedback') workReportRef.current.discard(itemId, f)
      }
      showFlash(`${holderName}님이 먼저 수정을 시작해 방금 입력은 반영되지 않았습니다.`, 'error')
    },
    // 30초 동안 입력이 없으면 칸에서 커서를 빼 평소처럼 저장 → 해제되게 한다.
    onIdle: field => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) el.blur()
      else fieldLocks.release(field)
    },
  })
  const lockFor = (meetingId: string | null, field: string): FieldLock | null =>
    meetingId && meetingId === lockMeetingId ? fieldLocks.lockOf(field) : null
  const acquireFor = (meetingId: string | null, field: string) =>
    meetingId && meetingId === lockMeetingId ? fieldLocks.acquire(field) : true
  const releaseFor = (meetingId: string | null, field: string) => {
    if (meetingId && meetingId === lockMeetingId) fieldLocks.release(field)
  }
  const previewFor = (meetingId: string | null, field: string, text: string) => {
    if (meetingId && meetingId === lockMeetingId) fieldLocks.sendPreview(field, text)
  }
  // 업무보고/안건 표의 업데이트·피드백 칸 잠금 — 표가 열린 회의(= 보고 있는 회의) 기준.
  const reportLocks: ReportLocks = {
    lockOf: field => lockFor(workReport.meetingId, field),
    acquire: field => acquireFor(workReport.meetingId, field),
    release: field => releaseFor(workReport.meetingId, field),
    preview: (field, text) => previewFor(workReport.meetingId, field, text),
    previews: fieldLocks,
  }
  // ESC — 가장 위에 떠 있는 레이어 하나만 닫는다.
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (workReport.conflict) { e.preventDefault(); e.stopPropagation(); workReport.dismissConflict(); return }
      if (saveConflict) { e.preventDefault(); e.stopPropagation(); setSaveConflict(null); return }
      if (showLeaveMenu) { e.preventDefault(); e.stopPropagation(); setShowLeaveMenu(false); return }
      if (draft) { e.preventDefault(); e.stopPropagation(); setDraft(null); return }
      if (meetingPopupOpen) { e.preventDefault(); e.stopPropagation(); closeMeetingPopup(); return }
      if (baseballOpen) { e.preventDefault(); setBaseballOpen(false); return }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [saveConflict, draft, workReport, meetingPopupOpen, baseballOpen, showLeaveMenu])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyMeetingFieldsRef.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ── 회의 상세: 안건 표 / 업무보고 표 묶음 ─────────────────────────────────
  // 표 데이터는 지금 보고 있는 회의 기준으로 불러온 workReport에서 나온다(다른 회의 데이터면 아직 로딩 중).
  const reportReady = workReport.meetingId === selectedMeetingId && workReport.loaded
  const agendaRows = reportReady ? workReport.items.filter(i => i.kind === 'agenda') : []
  const pinnedAgendaRows = agendaRows.filter(i => i.pinned)
  // 고정 안건과 오늘 안건은 박스를 따로 둔다(각자 ReportTable 하나).
  const pinnedSections: ReportSection[] = [
    {
      key: 'pinned', items: pinnedAgendaRows, pinnedTone: true,
      addPlaceholder: '+ 고정 안건 추가 (Enter)',
      onAdd: title => workReport.addItem(null, title, 'agenda', true),
    },
  ]
  const todayAgendaSections: ReportSection[] = [
    {
      key: 'agenda', items: agendaRows.filter(i => !i.pinned),
      addPlaceholder: '+ 안건 추가 (Enter) — 완료 체크하면 다음 회의부터 사라집니다',
      onAdd: title => workReport.addItem(null, title, 'agenda'),
    },
  ]
  // 업무보고 표 — 팀원마다 한 묶음. 그 팀원이 담당인 (고정이 아닌) 안건도 같은 행으로 맨 위에 함께 보인다(어느 표에 써도 양쪽에 반영).
  const reportRowsOf = (memberId: string) => reportReady
    ? [...workReport.items.filter(i => i.kind === 'agenda' && !i.pinned && i.member_id === memberId), ...workReport.items.filter(i => i.kind === 'report' && i.member_id === memberId)]
    : []
  const openCountOf = (memberId: string) => reportRowsOf(memberId).filter(i => !workReport.isDoneHere(i)).length
  function toggleReportMember(memberId: string) {
    setCollapsedReportMembers(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId)
      return next
    })
  }
  // 팀장(프로필 역할 lead)은 업무보고 개인란을 두지 않는다 — 회의를 진행하는 쪽이라. 팀장 담당 안건은 안건 표에 그대로 있다.
  const reportMembers = members.filter(m => profileMemberByName(m.name).role !== 'lead')
  const reportSections: ReportSection[] = (reportMemberFilter ? reportMembers.filter(m => m.id === reportMemberFilter) : reportMembers).map(mem => {
    const collapsed = collapsedReportMembers.has(mem.id)
    return {
      key: mem.id,
      collapsed,
      items: reportRowsOf(mem.id),
      addPlaceholder: `+ ${mem.name} 업무 추가 (Enter)`,
      onAdd: title => workReport.addItem(mem.id, title),
      header: (
        <div className="space-y-1.5 py-0.5">
          <div className="flex items-center gap-2">
            <ClickableAvatar member={profileMemberByName(mem.name)} size={20} />
            <span className="text-[12.5px] font-semibold text-[#1F2933]">{mem.name}</span>
            <span className="text-[11px] text-[#9AA3AE]">진행 중 {openCountOf(mem.id)}</span>
            <button type="button" onClick={() => toggleReportMember(mem.id)} className="ml-auto text-[11.5px] text-[#9AA3AE] hover:text-[#4C7FE0] px-1.5 py-0.5 rounded hover:bg-black/[0.04]">
              {collapsed ? '펼치기 ▸' : '접기 ▾'}
            </button>
          </div>
          {/* 팀원별 자유 메모 — 예전 "팀원별 진행사항" 칸을 그대로 이어 쓴다(지난 회의 진행사항도 여기 보인다) */}
          {selectedMeeting && (
            <MemberNote
              key={`${selectedMeeting.id}:${mem.id}`}
              meetingId={selectedMeeting.id}
              memberId={mem.id}
              memberName={mem.name}
              row={meetingProgress.find(p => p.meeting_id === selectedMeeting.id && p.member_id === mem.id)}
              onSaved={saveProgressRow}
              onError={message => showFlash(message, 'error')}
              onUnauthorized={() => router.push('/login')}
            />
          )}
        </div>
      ),
    }
  })
  // 팀원 자유 메모 저장 응답 반영 — 더 낮은 version으로는 되돌리지 않는다(늦게 온 응답·realtime 재조회 방어).
  function saveProgressRow(row: ProgressRow) {
    setMeetingProgress(prev => {
      const cur = prev.find(p => p.meeting_id === row.meeting_id && p.member_id === row.member_id)
      if (cur && cur.version > row.version) return prev
      return [...prev.filter(p => p !== cur), row]
    })
  }
  const reportTableProps = {
    wr: workReport,
    locks: reportLocks,
    members,
    linked: linkedMeetingItems,
    onAddLinked: addLinkedMeetingItem,
    onToggleLinked: (l: LinkedMeetingItem) => { const it = meetingItems.find(i => i.id === l.id); if (it) void toggleMeetingItemDone(it) },
    onCompletePriorAction: (a: Parameters<typeof workReport.completeOpenAction>[0]) => { void workReport.completeOpenAction(a) },
    defaultDue: nextMeetingDate(meetings, selectedMeeting ?? undefined),
  }

  // 회의 상세 — 회의록 탭 오른쪽 칸과, 업무 > 팀 일정 캘린더에서 여는 회의창(팝업)이 같은 화면을 쓴다.
  // 데이터(결정/액션·표·잠금)는 모두 selectedMeetingId 기준이라 어느 쪽에서 열어도 같은 회의를 본다.
  const renderMeetingDetail = (mt: Meeting, inPopup: boolean) => (
      <div className="px-5 sm:px-8 py-6 sm:py-8">
        {!inPopup && <button onClick={() => guardComposerAnd('switch-meeting', () => setSelectedMeetingId(null))} className="sm:hidden text-[12.5px] text-[#7A8491] mb-3">‹ 목록</button>}
        <div className="flex items-start justify-between gap-3 mb-1">
          {!inPopup && <button
            type="button"
            onClick={() => setMeetingListCollapsed(v => !v)}
            title={meetingListCollapsed ? '회의 목록 펼치기' : '회의 목록 접고 넓게 보기'}
            className="hidden sm:flex flex-shrink-0 mt-2 w-7 h-7 items-center justify-center text-[13px] text-[#9AA3AE] hover:text-[#1F2933] rounded-md hover:bg-black/[0.04]"
          >{meetingListCollapsed ? '»' : '«'}</button>}
          <input
            key={`mt-title-${mt.id}-${mt.title}`}
            defaultValue={mt.title === UNTITLED_MEETING && focusTitleMeetingId === mt.id ? '' : mt.title}
            autoFocus={focusTitleMeetingId === mt.id}
            placeholder="회의 제목을 입력해 주세요"
            onChange={() => markMeetingFieldDirty('title')}
            onBlur={e => {
              markMeetingFieldClean('title')
              setFocusTitleMeetingId(null)
              const v = e.target.value.trim()
              if (v && v !== mt.title) updateMeetingField(mt, { title: v })
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur() }}
            className="flex-1 min-w-0 text-[26px] font-semibold text-[#1F2933] border border-transparent hover:border-[#E5E8EB] focus:border-[#4C7FE0] rounded-md px-2 py-1 -mx-1 focus:outline-none placeholder:text-[#C9CFD5]"
          />
          <div className="flex items-center gap-1 flex-shrink-0 relative">
            {previousMeeting && (
              <button
                onClick={() => setShowPrevMeeting(p => !p)}
                title={`직전 회의: ${previousMeeting.title}`}
                className={`text-[12.5px] px-2.5 py-1 rounded-md transition-colors ${showPrevMeeting ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-[#7A8491] hover:text-[#1F2933] hover:bg-black/[0.04]'}`}
              >
                {showPrevMeeting ? '이전 회의 닫기' : '이전 회의 보기'}
              </button>
            )}
            <button onClick={() => setMeetingMenuOpen(p => !p)} className="text-[14px] text-[#7A8491] hover:text-[#1F2933] px-2 py-1 rounded-md hover:bg-black/[0.04]">···</button>
            {meetingMenuOpen && (
              <div className="absolute right-0 top-9 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-44 z-30">
                <button onClick={() => copyMeetingMarkdown(mt)} className="w-full text-left text-[12.5px] text-[#3A4249] hover:bg-[#F7F8F8] px-3 py-1.5">마크다운으로 복사</button>
                <button onClick={() => deleteMeeting(mt)} className="w-full text-left text-[12.5px] text-red-500 hover:bg-[#F7F8F8] px-3 py-1.5">삭제</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-6">
          <input
            key={`mt-date-${mt.id}-${mt.meeting_date}`}
            type="date" defaultValue={mt.meeting_date}
            onChange={() => markMeetingFieldDirty('meeting_date')}
            onBlur={e => {
              markMeetingFieldClean('meeting_date')
              const v = e.target.value
              if (v && v !== mt.meeting_date) updateMeetingField(mt, { meeting_date: v })
            }}
            className="text-[12.5px] text-[#7A8491] border border-[#E5E8EB] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#4C7FE0]"
          />
          <input
            key={`mt-time-${mt.id}-${mt.meeting_time}`}
            type="time" defaultValue={mt.meeting_time}
            onChange={() => markMeetingFieldDirty('meeting_time')}
            onBlur={e => {
              markMeetingFieldClean('meeting_time')
              const v = e.target.value
              if (v !== mt.meeting_time) updateMeetingField(mt, { meeting_time: v })
            }}
            className="text-[12.5px] text-[#7A8491] border border-[#E5E8EB] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#4C7FE0]"
          />
          <input
            key={`mt-att-${mt.id}-${mt.attendees}`}
            defaultValue={mt.attendees}
            onChange={() => markMeetingFieldDirty('attendees')}
            onBlur={e => {
              markMeetingFieldClean('attendees')
              const v = e.target.value.trim()
              if (v !== mt.attendees) updateMeetingField(mt, { attendees: v })
            }}
            placeholder="참석자 (쉼표로 구분)"
            className="flex-1 min-w-[180px] text-[12.5px] text-[#7A8491] border border-[#E5E8EB] rounded-md px-2 py-1 focus:outline-none focus:border-[#4C7FE0]"
          />
        </div>

        {showPrevMeeting && previousMeeting && (
          <div className="mb-6 bg-[#FAFBFB] border border-[#EEF0F2] rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12.5px] font-semibold text-[#1F2933]">
                직전 회의 · {previousMeeting.title}
                <span className="ml-2 font-normal text-[#7A8491]">{fmtMeetingDay(previousMeeting.meeting_date)}</span>
              </p>
              <button
                onClick={() => guardComposerAnd('switch-meeting', () => { setSelectedMeetingId(previousMeeting.id); setShowPrevMeeting(false) })}
                className="text-[11.5px] text-[#7A8491] hover:text-[#4C7FE0] flex-shrink-0"
              >
                이 회의로 이동 →
              </button>
            </div>
            <p className="text-[11.5px] text-[#9AA3AE] mb-2">안건·업무보고의 지난 내용은 표의 &quot;지난 논의/지난 업데이트&quot; 열에서 바로 볼 수 있어요.</p>

            {prevMeetingItems.filter(i => i.kind === 'action' && !i.done).length > 0 && (
              <div className="mb-3">
                <p className="text-[11.5px] font-semibold text-[#4B1528] mb-1">미완료 액션아이템</p>
                <ul className="space-y-1">
                  {prevMeetingItems.filter(i => i.kind === 'action' && !i.done).map(item => (
                    <li key={item.id} className="flex items-center gap-2 text-[12.5px] text-[#3A4249]">
                      <span className="text-[#B0B8C1]">☐</span>
                      <span className="flex-1">{item.content}</span>
                      {parseAttendees(item.owner).map(name => (
                        <span key={name} className="text-[11px] text-[#7A8491] bg-[#F3F4F6] rounded-full px-1.5 py-0.5">{name}</span>
                      ))}
                      {item.due_date && <span className="text-[11px] text-[#7A8491]">{fmtDay(item.due_date)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {prevMeetingItems.filter(i => i.kind === 'decision').length > 0 && (
              <div className="mb-3">
                <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1">결정사항</p>
                <ul className="space-y-1">
                  {prevMeetingItems.filter(i => i.kind === 'decision').map(item => (
                    <li key={item.id} className="flex items-start gap-2 text-[12.5px] text-[#3A4249]">
                      <span className="text-[#4C7FE0]">•</span>
                      <span className="flex-1">{item.content}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {previousMeeting.agenda.trim() && (
              <details>
                <summary className="text-[11.5px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">메모 펼치기</summary>
                <p className="mt-2 text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto">
                  {previousMeeting.agenda}
                </p>
              </details>
            )}
          </div>
        )}

        {/* ① 고정 안건 — 고정 해제할 때까지 매 회의에 이어서 나온다 */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-[15px] font-semibold text-[#1F2933]">📌 고정 안건</h2>
            </div>
            {reportReady && <span className="text-[11.5px] text-[#9AA3AE]">{pinnedAgendaRows.length}개</span>}
          </div>
          {reportReady ? (
            <ReportTable agenda pinnedMode sections={pinnedSections} {...reportTableProps} colWidths={agendaColWidths} onColWidthsChange={changeAgendaColWidths} />
          ) : (
            <p className="text-[12.5px] text-[#B0B8C1] py-8 text-center border border-[#E5E8EB] rounded-lg">불러오는 중…</p>
          )}
        </section>

        {/* ② 오늘 안건 — 완료하면 다음 회의부터 사라지고, 안 끝나면 이어진다 */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-[15px] font-semibold text-[#1F2933]">🗂️ 오늘 안건</h2>
            </div>
            {reportReady && <span className="text-[11.5px] text-[#9AA3AE]">진행 중 {agendaRows.filter(i => !i.pinned && !workReport.isDoneHere(i)).length}</span>}
          </div>
          {reportReady ? (
            <ReportTable agenda sections={todayAgendaSections} {...reportTableProps} colWidths={agendaColWidths} onColWidthsChange={changeAgendaColWidths} />
          ) : (
            <p className="text-[12.5px] text-[#B0B8C1] py-8 text-center border border-[#E5E8EB] rounded-lg">불러오는 중…</p>
          )}

        </section>

        {/* 👥 인력관리 — 근태·입퇴사·휴직 등 자유 기록(맨 위 칸). 예전 근태/계약휴직 캡처 메모는 아래 2열로 보기만. */}
        <section className="mb-8">
          <div className="flex items-baseline gap-2.5 flex-wrap mb-2">
            <h2 className="text-[15px] font-semibold text-[#1F2933]">👥 인력관리</h2>
          </div>
          <div className="border border-[#E5E8EB] rounded-lg p-4 space-y-3">
            <CollabAgendaField
              meetingId={mt.id}
              initialText={mt.agenda}
              resetToken={`${mt.id}:${agendaResetNonce}`}
              savedSignal={agendaSavedSignal}
              onSyncRequest={snap => { void syncAgendaFromServer(snap).finally(flushAgendaSyncWaiters) }}
              lock={lockFor(mt.id, 'agenda')}
              onAcquire={() => acquireFor(mt.id, 'agenda')}
              onTyping={text => previewFor(mt.id, 'agenda', text)}
              syncNonce={agendaSyncNonce}
              previews={fieldLocks}
              onChange={() => markMeetingFieldDirty('agenda')}
              onBlur={text => {
                markMeetingFieldClean('agenda')
                const mid = mt.id
                void saveAgendaField(mid, text, { text: mt.agenda, version: mt.agenda_version }).finally(() => releaseFor(mid, 'agenda'))
              }}
              rows={4}
              placeholder="인력관리 메모 — 칸에서 벗어나면 자동 저장됩니다."
              className="w-full min-h-[96px] text-[14.5px] text-[#3A4249] leading-relaxed border border-[#E5E8EB] rounded-md px-3 py-2.5 focus:outline-none focus:border-[#4C7FE0] resize-y"
            />
            {/* 근태 · 계약/휴직 — 크기 고정 두 칸, 넘치면 칸 안에서 스크롤(캡처는 돋보기로 크게 본다) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([['memo', '🕘 근태'], ['contract_leave', '📄 계약/휴직']] as const).map(([kind, label]) => {
                const items = meetingItems.filter(i => i.kind === kind)
                const composer = memoComposers[kind]
                return (
                  <div key={kind} className="border border-[#EEF0F2] rounded-lg bg-[#FAFBFB] flex flex-col h-[420px]">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#EEF0F2] flex-shrink-0">
                      <span className="text-[12.5px] font-semibold text-[#1F2933]">{label}</span>
                      <span className="text-[11px] text-[#9AA3AE]">{items.length}건</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
                      {items.length === 0 ? (
                        <p className="text-[12px] text-[#B0B8C1] text-center py-6">기록이 없습니다.</p>
                      ) : (
                        <MeetingMemoSection
                          title="" helperText="" placeholder=""
                          items={items}
                          newText="" onNewTextChange={() => {}} onPaste={() => {}} uploading={false} newImage={null}
                          onImageResizeEnd={() => {}} onRemoveImage={() => {}} onSubmit={() => {}}
                          onDeleteItem={deleteMeetingItem}
                          onResizeItemImage={resizeMeetingMemoImage}
                          readOnly
                        />
                      )}
                    </div>
                    {/* 칸 아래 고정 입력줄 — 글이나 캡처(Ctrl+V)를 넣고 + 추가 → 카드로 쌓인다(여러 장 가능) */}
                    <div className="flex-shrink-0 max-h-[55%] overflow-y-auto border-t border-[#EEF0F2] p-2 bg-white rounded-b-lg">
                      <MeetingMemoSection
                        title="" helperText=""
                        placeholder={`+ ${label.slice(2).trim()} 메모 (캡처화면은 Ctrl+V)`}
                        items={[]}
                        newText={composer.text}
                        onNewTextChange={v => patchComposer(kind, x => ({ ...x, text: v }))}
                        onPaste={e => handleMemoPaste(kind, e)}
                        uploading={composer.uploading}
                        newImage={composer.image}
                        onImageResizeEnd={(w, h) => patchComposer(kind, x => ({ ...x, image: x.image && { ...x.image, width: w, height: h } }))}
                        onRemoveImage={() => removeMemoImage(kind)}
                        onSubmit={() => { void submitMeetingMemo(kind) }}
                        submitting={composer.submitting}
                        onDeleteItem={deleteMeetingItem}
                        onResizeItemImage={resizeMeetingMemoImage}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ③ 업무보고 — 팀원마다 자유 메모 + 업무 행 */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-[15px] font-semibold text-[#1F2933]">📋 업무보고</h2>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[{ id: null as string | null, name: '전체' }, ...reportMembers.map(m => ({ id: m.id as string | null, name: m.name }))].map(chip => {
                const on = reportMemberFilter === chip.id
                return (
                  <button
                    key={chip.id ?? 'all'}
                    type="button"
                    onClick={() => setReportMemberFilter(chip.id)}
                    className={`text-[12px] rounded-full px-2.5 py-1 ${on ? 'bg-[#4C7FE0] text-white' : 'bg-white text-[#7A8491] border border-[#E5E8EB] hover:border-[#4C7FE0]/50'}`}
                  >
                    {chip.name}{chip.id && reportReady ? <span className="ml-1 opacity-70">{openCountOf(chip.id)}</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
          {reportReady ? (
            <ReportTable agenda={false} sections={reportSections} {...reportTableProps} colWidths={reportColWidths} onColWidthsChange={changeReportColWidths} />
          ) : (
            <p className="text-[12.5px] text-[#B0B8C1] py-8 text-center border border-[#E5E8EB] rounded-lg">불러오는 중…</p>
          )}
          <p className="mt-2 text-[11px] text-[#9AA3AE]">방향키·Tab으로 칸 이동 · 담당자는 Space로 열고 Enter로 선택 · 완료는 Space · 칸에서 벗어나면 자동 저장 · +액션은 기한 날짜로 담당자 일정에 자동 등록</p>
        </section>

        {/* ③ 결정사항 / ④ 액션아이템 */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="border border-[#E5E8EB] rounded-lg p-4">
            <h2 className="text-[15px] font-semibold text-[#1F2933] mb-2">결정사항</h2>
            {meetingItems.filter(i => i.kind === 'decision').length === 0 && (
              <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 결정사항이 없습니다.</p>
            )}
            <ul className="space-y-1.5 mb-2">
              {meetingItems.filter(i => i.kind === 'decision').map(item => (
                <li key={item.id} className="flex items-start gap-2 text-[13.5px] text-[#3A4249] group">
                  <span className="text-[#4C7FE0] flex-shrink-0">•</span>
                  <span className="flex-1">{item.content}</span>
                  {reportTitleById(item.report_item_id) && <span title={reportSourceById(item.report_item_id)} className="text-[11px] text-[#4C7FE0] bg-[#4C7FE0]/[0.08] rounded-full px-1.5 py-0.5 flex-shrink-0 max-w-[160px] truncate">↗ {reportTitleById(item.report_item_id)}</span>}
                  <button onClick={() => deleteMeetingItem(item)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={async e => { e.preventDefault(); if (await addMeetingItem('decision', newDecisionText)) setNewDecisionText('') }}
              className="flex gap-1.5"
            >
              <input
                value={newDecisionText} onChange={e => setNewDecisionText(e.target.value)}
                placeholder="+ 결정사항 추가 (Enter)" className="flex-1 text-[13px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
              />
            </form>
          </div>

          <div className="border border-[#E5E8EB] rounded-lg p-4">
            <h2 className="text-[15px] font-semibold text-[#1F2933] mb-2">액션아이템</h2>
            {meetingItems.filter(i => i.kind === 'action').length === 0 && (
              <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 액션아이템이 없습니다.</p>
            )}
            <ul className="space-y-1.5 mb-2">
              {meetingItems.filter(i => i.kind === 'action').map(item => (
                <li key={item.id} className="flex items-center gap-2 text-[13.5px] group">
                  <input type="checkbox" checked={item.done} onChange={() => toggleMeetingItemDone(item)} className="flex-shrink-0" />
                  <span className={`flex-1 min-w-0 ${item.done ? 'line-through text-[#B0B8C1]' : 'text-[#3A4249]'}`}>{item.content}</span>
                  {parseAttendees(item.owner).map(name => (
                    <span key={name} className="text-[11px] text-[#7A8491] bg-[#F3F4F6] rounded-full px-1.5 py-0.5 flex-shrink-0">{name}</span>
                  ))}
                  {reportTitleById(item.report_item_id) && <span title={reportSourceById(item.report_item_id)} className="text-[11px] text-[#4C7FE0] bg-[#4C7FE0]/[0.08] rounded-full px-1.5 py-0.5 flex-shrink-0 max-w-[120px] truncate">↗ {reportTitleById(item.report_item_id)}</span>}
                  {item.due_date && <span className="text-[11px] text-[#7A8491] flex-shrink-0">{fmtDay(item.due_date)}</span>}
                  <button onClick={() => deleteMeetingItem(item)} title="삭제 — 연결된 일정도 함께 삭제됩니다" className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-1.5 flex-wrap items-center">
              <input
                value={newActionText} onChange={e => setNewActionText(e.target.value)}
                placeholder="+ 액션아이템" className="flex-1 min-w-[140px] text-[13px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
              />
              {newActionOwners.map(name => (
                <span key={name} className="inline-flex items-center gap-1 text-[12px] text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full pl-2 pr-1 py-1 flex-shrink-0">
                  {name}
                  <button type="button" onClick={() => setNewActionOwners(prev => prev.filter(n => n !== name))} className="hover:text-red-500">✕</button>
                </span>
              ))}
              {members.filter(m => !newActionOwners.includes(m.name)).length > 0 && (
                <select
                  value=""
                  onChange={e => { const v = e.target.value; if (v) setNewActionOwners(prev => [...prev, v]) }}
                  className="text-[13px] border border-[#E5E8EB] rounded-md px-2 py-1.5 bg-white"
                >
                  <option value="">+ 담당자</option>
                  {members.filter(m => !newActionOwners.includes(m.name)).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              )}
              <input type="date" value={newActionDue} onChange={e => setNewActionDue(e.target.value)} title="기한 — 담당자 일정 캘린더에 이 날짜로 올라갑니다" className="text-[13px] border border-[#E5E8EB] rounded-md px-2 py-1.5" />
              <button
                onClick={async () => { if (await addMeetingItem('action', newActionText, joinAttendees(newActionOwners), newActionDue)) { setNewActionText(''); setNewActionOwners([]); setNewActionDue('') } }}
                className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-3 py-1.5"
              >
                추가
              </button>
            </div>
          </div>
        </section>

      </div>
  )

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F7F8F8] text-sm text-gray-400">불러오는 중...</div>
  }

  const SECTION_LABEL: Record<Section, string> = { life: '일상', work: '업무', meetings: '회의록', schedule: '일정', goals: '목표', retro: '회고', archiving: '아카이빙', team: '팀', history: '연혁', quiz: '연상퀴즈' }
  // 메뉴마다 아주 은은한 색 포인트 하나씩 — 진한 원색 대신 태그/뱃지에도 이미 쓰는 수준의 muted 톤.
  const SECTION_ACCENT: Record<Section, string> = { life: '#4C7FE0', work: '#D97706', meetings: '#7C3AED', schedule: '#059669', goals: '#DB2777', retro: '#DB2777', archiving: '#6B7280', team: '#0891B2', history: '#B45309', quiz: '#7C3AED' }
  const SECTION_ICON: Record<Section, string> = { life: '🏠', work: '🗂️', meetings: '📝', schedule: '📅', goals: '🎯', retro: '🪞', archiving: '📁', team: '👥', history: '📖', quiz: '🎨' }
  // 상단 메뉴 — 팀 일정·목표·회고·아카이빙은 업무 허브의 서브탭으로 들어갔다.
  // 회의록 탭은 회의창(팝업)이 대신해서 메뉴에서 숨겼다(section 'meetings' 코드는 남겨 둠 — 다시 켜려면 여기에 추가).
  // 연혁·연상퀴즈도 메뉴에서 숨기고 일상(홈) 탭의 박스로 들어간다 — 그 화면에 있는 동안엔 일상을 켜 둔다.
  const SECTIONS: Section[] = ['life', 'work', 'team']
  const isNavActive = (s: Section) => section === s || (s === 'work' && hubTab !== null) || (s === 'life' && (section === 'history' || section === 'quiz'))
  const onNav = (s: Section) => { if (s === 'work') goHub('summary'); else setSection(s) }
  const HUB_TABS: { tab: HubTab; label: string }[] = [
    { tab: 'summary', label: '요약' }, { tab: 'tasks', label: 'R&R' }, { tab: 'routine', label: '루틴' }, { tab: 'goals', label: '목표' }, { tab: 'retro', label: '회고' }, { tab: 'archiving', label: '아카이빙' },
  ]

  return (
    <div className="h-screen overflow-hidden bg-[#F7F8F8] flex flex-col">
      <ActionItemReminderModal onNavigate={target => guardComposerAnd('switch-meeting', () => {
        const m = target.section === 'meetings' ? meetings.find(x => x.id === target.meetingId) : undefined
        if (m) showMeeting(m)
        else if (target.section === 'work') goHub('tasks')
        else if (target.section === 'meetings') goHub('summary') // 목록에 없는 회의면 팀 달력으로
        else setSection(target.section)
      })} />
      <ActionItemReminderWidget onGoToMeeting={id => guardComposerAnd('switch-meeting', () => {
        const m = meetings.find(x => x.id === id)
        if (m) showMeeting(m)
        else goHub('summary')
      })} />
      {/* ── 상단 메뉴바 ── */}
      <header className="hidden sm:flex items-center h-16 px-6 flex-shrink-0 bg-white border-b border-stone-100">
        <div className="w-full max-w-[80%] mx-auto grid grid-cols-[1fr_auto_1fr] items-center">
          <p className="font-semibold text-gray-900 text-sm justify-self-start whitespace-nowrap flex-shrink-0">인사관리팀</p>
          <nav className="flex items-center gap-1.5 justify-self-center">
            {SECTIONS.map(s => {
              const accent = SECTION_ACCENT[s]
              const active = isNavActive(s)
              return (
                <button
                  key={s}
                  onClick={() => onNav(s)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[14.5px] whitespace-nowrap flex-shrink-0 transition-colors ${active ? 'font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
                  style={active ? { backgroundColor: `${accent}1A`, color: accent } : undefined}
                >
                  <span aria-hidden className="text-[13px]" style={{ color: accent, opacity: active ? 1 : 0.55 }}>
                    {SECTION_ICON[s]}
                  </span>
                  {SECTION_LABEL[s]}
                </button>
              )
            })}
          </nav>
          <div className="flex items-center gap-3 justify-self-end">
            <div className="relative">
              <input
                value={globalSearch}
                onChange={e => { setGlobalSearch(e.target.value); setGlobalSearchOpen(true) }}
                onFocus={() => setGlobalSearchOpen(true)}
                onBlur={() => setTimeout(() => setGlobalSearchOpen(false), 150)}
                placeholder="🔍 회의록·일정 검색"
                className="text-[12px] border border-gray-200 rounded-full px-3 py-1.5 w-36 focus:w-60 transition-all bg-white focus:outline-none focus:border-[#4C7FE0]"
              />
              {globalSearchOpen && globalSearch.trim() && (
                <div className="absolute right-0 top-9 w-80 max-h-[70vh] overflow-y-auto bg-white border border-[#EEF0F2] rounded-lg shadow-lg z-30 py-2">
                  {globalSearchResults.meetings.length === 0 && globalSearchResults.events.length === 0 && (
                    <p className="text-[12px] text-gray-400 px-3 py-2">검색 결과가 없습니다.</p>
                  )}
                  {globalSearchResults.meetings.length > 0 && (
                    <div className="px-2 py-1">
                      <p className="text-[10.5px] font-semibold text-gray-400 px-1.5 mb-1">회의록</p>
                      {globalSearchResults.meetings.map(m => (
                        <button
                          key={m.id}
                          onMouseDown={() => goToSearchedMeeting(m)}
                          className="w-full text-left text-[12.5px] text-gray-700 hover:bg-gray-50 rounded-md px-1.5 py-1.5 truncate"
                        >
                          {m.title} <span className="text-gray-400">· {fmtMeetingDay(m.meeting_date)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {globalSearchResults.events.length > 0 && (
                    <div className="px-2 py-1">
                      <p className="text-[10.5px] font-semibold text-gray-400 px-1.5 mb-1">일정</p>
                      {globalSearchResults.events.map(ev => (
                        <button
                          key={ev.id}
                          onMouseDown={() => goToSearchedEvent(ev)}
                          className="w-full text-left text-[12.5px] text-gray-700 hover:bg-gray-50 rounded-md px-1.5 py-1.5 truncate"
                        >
                          {ev.title} <span className="text-gray-400">· {fmtDay(ev.event_date)} · {ev.assignee}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <QuickLinks />
            <NotificationBell onNavigate={handleNotificationNavigate} />
            <ProfileButton fallbackName={author} className="text-[11.5px] text-gray-500 max-w-[140px]" />
          </div>
        </div>
      </header>

      {/* ── 업무 허브 서브탭 ── macOS 세그먼트 컨트롤처럼 가운데 캡슐 안에 모으고, 고른 칸만 흰 알약으로 띄운다 */}
      {hubTab && (
        <div className="hidden sm:flex h-[72px] px-6 flex-shrink-0 items-center justify-center bg-gradient-to-b from-white to-[#FBFBFA] border-b border-stone-100">
          {/* 흰 캡슐 + 고른 칸은 그린(연한 초록 알약 · 초록 글자) */}
          <div role="tablist" className="flex items-center gap-0.5 p-1 rounded-full bg-white border border-[#E8E8E4] shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-x-auto">
            {HUB_TABS.map(({ tab, label }) => {
              const active = hubTab === tab
              return (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={active}
                  onClick={() => goHub(tab)}
                  className={`flex-shrink-0 min-w-[88px] flex items-center justify-center px-5 py-2.5 rounded-full text-[14.5px] transition-all duration-150 ${active
                    ? 'bg-[#F1F4F9] text-[#3A4E73] font-semibold'
                    : 'text-[#6B6B66] hover:text-[#1F1F1D] hover:bg-[#F7F7F5]'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-4 pt-4">
          {/* 모바일 상단 섹션 탭 */}
          <div className="sm:hidden mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => onNav(s)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full ${isNavActive(s) ? 'bg-[#4C7FE0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{SECTION_LABEL[s]}</button>
            ))}
          </div>
          {hubTab && (
            <div className="sm:hidden mb-2 flex gap-1 overflow-x-auto pb-1">
              {HUB_TABS.map(({ tab, label }) => (
                <button key={tab} onClick={() => goHub(tab)} className={`flex-shrink-0 text-[11.5px] px-2.5 py-1 rounded-md ${hubTab === tab ? 'bg-[#D97706]/10 text-[#B45309] font-medium' : 'text-gray-500'}`}>{label}</button>
              ))}
            </div>
          )}

          {loadError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{loadError}</p>}

          <div className="sm:hidden flex items-center gap-2 text-[11.5px] text-gray-500 mb-2">
            <QuickLinks />
            <NotificationBell onNavigate={handleNotificationNavigate} />
            <ProfileButton fallbackName={author} />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col w-full max-w-[80%] mx-auto">
        {section === 'meetings' && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-2 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-[23px] font-semibold text-[#1F2933]">회의록</h1>
                  <p className="text-[13.5px] text-[#7A8491] mt-1">회의 내용을 기록하고 결정사항과 후속 업무를 관리하세요.</p>
                </div>
                <button
                  onClick={() => createMeeting()}
                  className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-4 py-2.5 flex-shrink-0"
                >
                  + 새 회의
                </button>
              </div>
            </div>

            {/* Date Navigation */}
            <div className="flex-shrink-0 pb-3 flex items-center justify-center gap-1.5">
              <button onClick={prevMeetingMonth} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
              <p className="text-[15px] font-semibold text-[#1F2933] w-[104px] text-center">{meetingYear}년 {meetingMonth}월</p>
              <button onClick={nextMeetingMonth} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
              <button onClick={gotoMeetingToday} className="ml-1.5 text-[12px] text-[#7A8491] hover:text-[#4C7FE0] border border-[#E5E8EB] rounded-md px-2.5 py-1">오늘</button>
            </div>

            {/* Toolbar */}
            <div className="flex-shrink-0 px-6 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 border-b border-[#EEF0F2]">
              <div className="flex items-center gap-1 flex-wrap">
                {(['전체', '내회의', '이번주', '이번달'] as MeetingFilter[]).map(f => (
                  <button
                    key={f} onClick={() => selectMeetingFilter(f)}
                    className={`text-[12px] px-2.5 py-1 rounded-md transition-colors flex-shrink-0 ${meetingFilter === f ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                value={meetingSearch} onChange={e => setMeetingSearch(e.target.value)}
                placeholder="🔍 회의 검색"
                className="w-full sm:w-[260px] text-[13px] border border-[#E5E8EB] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#4C7FE0] bg-white"
              />
            </div>

            {/* Workspace */}
            <div className="flex-1 min-h-0 flex">
              {/* Meeting List */}
              <div className={`${selectedMeetingId ? (meetingListCollapsed ? 'hidden' : 'hidden sm:block') : 'block'} w-full sm:w-[300px] flex-shrink-0 border-r border-[#EEF0F2] overflow-y-auto`}>
                <p className="text-[13px] font-semibold text-[#1F2933] px-4 pt-4 pb-2">최근 회의</p>
                {filteredMeetings.length === 0 ? (
                  <p className="text-[12.5px] text-[#B0B8C1] px-4 py-6">{meetings.length === 0 ? '아직 회의가 없습니다.' : '검색 결과가 없습니다.'}</p>
                ) : (
                  <div>
                    {meetingListRows.map(row => row.kind === 'single' ? (
                      <div
                        key={row.meeting.id}
                        onClick={() => guardComposerAnd('switch-meeting', () => setSelectedMeetingId(row.meeting.id))}
                        onMouseEnter={() => setHoveredKey(`meeting:${row.meeting.id}`)}
                        onMouseLeave={() => setHoveredKey(null)}
                        className={`px-4 py-3 cursor-pointer border-b border-l-2 border-b-[#F2F3F5] transition-colors ${selectedMeetingId === row.meeting.id ? 'bg-[#4C7FE0]/[0.06] border-l-[#4C7FE0]' : 'border-l-transparent hover:bg-[#F7F8F8]'}`}
                      >
                        <p className="text-[14px] font-semibold text-[#1F2933] truncate">{row.meeting.title}</p>
                        <p className="text-[12px] text-[#7A8491] mt-1">
                          {fmtMeetingDay(row.meeting.meeting_date)}{row.meeting.meeting_time && ` · ${row.meeting.meeting_time}`}
                        </p>
                        {row.meeting.attendees && <p className="text-[12px] text-[#B0B8C1] mt-0.5 truncate">{row.meeting.attendees}</p>}
                        {row.meeting.agenda && <p className="text-[12px] text-[#B0B8C1] mt-1 truncate">{row.meeting.agenda}</p>}
                      </div>
                    ) : (
                      <div key={`group-${row.title}`}>
                        <div
                          onClick={() => setWeeklyGroupExpanded(p => !p)}
                          className="px-4 py-3 cursor-pointer flex items-center gap-2 border-b border-l-2 border-b-[#F2F3F5] border-l-transparent hover:bg-[#F7F8F8]"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-[#1F2933] truncate">{row.title}</p>
                            <p className="text-[12px] text-[#7A8491] mt-1">{row.meetings.length}회 · 최근 {fmtMeetingDay(row.meetings[0].meeting_date)}</p>
                          </div>
                          <span className="text-[10px] text-[#7A8491] leading-none w-3 flex-shrink-0 text-right">{weeklyGroupExpanded ? '▼' : '▸'}</span>
                        </div>
                        {weeklyGroupExpanded && [...row.meetings].reverse().map(m => (
                          <div
                            key={m.id}
                            onClick={() => guardComposerAnd('switch-meeting', () => setSelectedMeetingId(m.id))}
                            onMouseEnter={() => setHoveredKey(`meeting:${m.id}`)}
                            onMouseLeave={() => setHoveredKey(null)}
                            className={`pl-9 pr-4 py-2.5 cursor-pointer border-b border-l-2 border-b-[#F2F3F5] transition-colors ${selectedMeetingId === m.id ? 'bg-[#4C7FE0]/[0.06] border-l-[#4C7FE0]' : 'border-l-transparent hover:bg-[#F7F8F8]'}`}
                          >
                            <p className="text-[13px] font-medium text-[#3A4249] truncate">
                              {fmtMeetingDayFull(m.meeting_date)}{m.meeting_time && ` · ${m.meeting_time}`}
                            </p>
                            {m.attendees && <p className="text-[11.5px] text-[#B0B8C1] mt-0.5 truncate">{m.attendees}</p>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Meeting Detail */}
              <div className={`${selectedMeetingId ? 'block' : 'hidden sm:block'} flex-1 min-w-0 overflow-y-auto`}>
                {!selectedMeeting ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 px-6">
                    <p className="text-[13.5px] text-[#B0B8C1] text-center leading-relaxed">회의를 선택하면<br />회의 내용이 여기에 표시됩니다.</p>
                    <button onClick={() => createMeeting()} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2">+ 첫 회의 기록</button>
                  </div>
                ) : (
                  renderMeetingDetail(selectedMeeting, false)
                )}
              </div>
            </div>
          </div>
        )}
        {/* 회의록 탭일 때도 이 컨테이너는 숨기기만 한다 — 언마운트하면 keep-alive 탭까지 같이 사라진다. */}
        <div className={section === 'meetings' ? 'hidden' : (section === 'schedule' || section === 'quiz') ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'flex-1 min-h-0 overflow-y-auto px-4 pb-8'}>
        <div className={(section === 'schedule' || section === 'quiz') ? 'contents' : 'w-full space-y-5'}>
          {/* ══ 일상 (쉼터: 한마디·메뉴투표·룰렛·낙서) ══ */}
          {isMounted('life') && (
            <div className={section === 'life' ? 'space-y-5' : 'hidden'}>
              <QuizTurnBanner onGoToQuiz={() => setSection('quiz')} />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500">일상 · 쉼터</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setBaseballOpen(v => !v)} className={`text-[11.5px] ${baseballOpen ? 'text-[#4C7FE0] font-medium' : 'text-gray-400'} hover:text-[#4C7FE0]`}>⚾ 야구</button>
                  <Link href="/fun/settings/members" className="text-[11.5px] text-gray-400 hover:text-[#5B54C4]">⚙ 멤버 관리</Link>
                  <Link href="/fun/stats" className="text-[11.5px] text-gray-400 hover:text-[#5B54C4]">📊 기록</Link>
                </div>
              </div>
              {/* 1행(4칸): 오늘의 한마디 · 팀 운명 · 오늘의 팀 운세 · 오늘의 운세 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
                <div className="[&>div]:h-full"><DailyMessage /></div>
                <TeamFate compact />
                <TeamLottery />
                <DailyFortuneCard />
              </div>
              {/* 2행(4칸): 팀 나무 · 식사(오늘의 메뉴 위 / 룰렛 아래) · 연상퀴즈(메뉴 대신 이 박스로 들어간다) · 연혁(여기서 넘겨 보고, 전체 보기로 연혁 화면) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
                <div className="[&>div]:h-full"><TeamTree /></div>
                <MenuRouletteTabs />
                <div className="min-h-[200px]"><QuizStatusCard onGoToQuiz={() => setSection('quiz')} /></div>
                <HistoryCard onOpenAll={() => setSection('history')} />
              </div>
              {/* 3행: 낙서 보드 */}
              <DoodleBoard />
            </div>
          )}

          {/* ══ 업무 ══ */}
          {section === 'work' && workTab === 'calendar' && (
            <RoutineCalendar />
          )}
          {section === 'work' && workTab === 'tasks' && groups.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setActiveGroupId(null)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[12px] transition-colors ${activeGroupId === null ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-white'}`}
              >
                전체
              </button>
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupId(g.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-colors ${activeGroupId === g.id ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-white'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                  <span className="truncate">{g.name}</span>
                </button>
              ))}
            </div>
          )}
          {section === 'work' && workTab === 'tasks' && (
            // 오른쪽 "살려주세요" 칸은 익명채팅 SOS로 옮겨 R&R만 전체 폭으로 쓴다.
            <div className="grid grid-cols-1 gap-5 items-start">
            <div className="space-y-5 min-w-0">
              {upcomingReports.length > 0 && (
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">다가오는 보고일정</p>
                  <ul className="space-y-1.5">
                    {upcomingReports.map(s => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="text-[11px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5 flex-shrink-0">{fmtDay(s.entry_date)}</span>
                        <span className="text-gray-800 truncate">{s.title}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{s.author} · {s.itemTitle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                  {authors.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value as '전체' | '업무기록' | '보고일정')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                  <option value="전체">전체 유형</option>
                  <option value="업무기록">업무기록</option>
                  <option value="보고일정">보고일정</option>
                </select>
              </div>

              {/* 팀원(그룹) 카드를 한 줄에 모두 — 넓은 화면은 그룹 수만큼 열, 좁으면 2열·1열로 */}
              <div
                className="grid gap-4 items-start grid-cols-1 md:grid-cols-2 xl:[grid-template-columns:repeat(var(--rr-cols),minmax(0,1fr))]"
                style={{ '--rr-cols': Math.max(1, visibleGroups.length) } as React.CSSProperties}
              >
                {visibleGroups.map(g => (
                  <div key={g.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden min-w-0">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 group">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                      {editingGroupId === g.id ? (
                        <input
                          value={editGroupName} autoFocus
                          onChange={e => setEditGroupName(e.target.value)}
                          onBlur={() => saveEditGroup(g.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditGroup(g.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="text-sm font-semibold text-gray-800 border border-[#4C7FE0]/40 rounded px-1.5 py-0.5 flex-1"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-gray-800 flex-1">{g.name}</p>
                      )}
                      <button onClick={() => startEditGroup(g)} className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity px-1">수정</button>
                      <button onClick={() => deleteGroup(g)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity px-1">삭제</button>
                    </div>

                    <div className="divide-y divide-stone-100">
                      {g.items.map(item => {
                        const expanded = expandedItems.has(item.id)
                        const visibleSubtasks = item.subtasks.filter(matchesFilter)
                        const form = subForm[item.id] ?? EMPTY_SUB_FORM
                        return (
                          <div
                            key={item.id} className="px-4 py-2.5"
                            onMouseEnter={() => setHoveredKey(`item:${item.id}`)}
                            onMouseLeave={() => setHoveredKey(null)}
                          >
                            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => toggleExpand(item.id)}>
                              <span className={`text-gray-300 text-[10px] transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>▶</span>
                              <button onClick={e => { e.stopPropagation(); cycleStatus(item) }} className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[item.status]}`}>
                                {STATUS_LABEL[item.status]}
                              </button>
                              {editingItemId === item.id ? (
                                <input
                                  value={editItemTitle} autoFocus onClick={e => e.stopPropagation()}
                                  onChange={e => setEditItemTitle(e.target.value)}
                                  onBlur={() => saveEditItem(item.id)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEditItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                                  className="text-sm border border-[#4C7FE0]/40 rounded px-1.5 py-0.5 flex-1"
                                />
                              ) : (
                                <p className="text-sm text-gray-800 flex-1 truncate">{item.title}</p>
                              )}
                              <span className="text-[11px] text-gray-400 flex-shrink-0">{item.subtasks.length}건</span>
                              <button
                                onClick={e => { e.stopPropagation(); addToSchedule(item.title, todayStr(), 'item', item.id) }}
                                title="일정에 추가 (호버 후 S)"
                                className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              >📅</button>
                              <button onClick={e => startEditItem(item, e)} className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">수정</button>
                              <button onClick={e => deleteItem(item, e)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">삭제</button>
                            </div>

                            {expanded && (
                              <div className="mt-2.5 ml-1 space-y-2 border-l-2 border-stone-100 pl-3">
                                {visibleSubtasks.length === 0 && <p className="text-[11px] text-gray-400 py-1">기록이 없습니다.</p>}
                                {visibleSubtasks.map(s => (
                                  editingSubtaskId === s.id ? (
                                    <div key={s.id} className="bg-[#F9FAFB] rounded-lg p-2.5 space-y-1.5">
                                      <div className="flex gap-1.5">
                                        <select value={editSubForm.type} onChange={e => setEditSubForm(prev => ({ ...prev, type: e.target.value as '업무기록' | '보고일정' }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]">
                                          <option value="업무기록">업무기록</option>
                                          <option value="보고일정">보고일정</option>
                                        </select>
                                        <input type="date" value={editSubForm.date} onChange={e => setEditSubForm(prev => ({ ...prev, date: e.target.value }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]" />
                                      </div>
                                      <input value={editSubForm.title} onChange={e => setEditSubForm(prev => ({ ...prev, title: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px]" />
                                      <textarea value={editSubForm.content} rows={2} onChange={e => setEditSubForm(prev => ({ ...prev, content: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px] resize-none" />
                                      <div className="flex gap-1.5">
                                        <button onClick={() => saveEditSubtask(s.id)} className="text-[11px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">저장</button>
                                        <button onClick={() => setEditingSubtaskId(null)} className="text-[11px] font-medium text-gray-500 px-3 py-1.5">취소</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      key={s.id} className="bg-[#F9FAFB] rounded-lg p-2.5 group"
                                      onMouseEnter={() => setHoveredKey(`subtask:${s.id}`)}
                                      onMouseLeave={() => setHoveredKey(null)}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${s.entry_type === '보고일정' ? 'bg-[#4C7FE0]/10 text-[#4C7FE0]' : 'bg-gray-200 text-gray-500'}`}>{s.entry_type}</span>
                                        <span className="text-[10.5px] text-gray-400">{s.author}</span>
                                        <span className="text-[10.5px] text-gray-400">{fmtDay(s.entry_date)}</span>
                                        <button onClick={() => addToSchedule(s.title, s.entry_date, 'subtask', s.id, s.author)} title="일정에 추가 (호버 후 S)" className="text-[10.5px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity ml-auto">📅</button>
                                        <button onClick={() => startEditSubtask(s)} className="text-[10.5px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity">수정</button>
                                        <button onClick={() => deleteSubtask(s)} className="text-[10.5px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                                      </div>
                                      <p className="text-[13px] text-gray-800 font-medium">{s.title}</p>
                                      {s.content && <p className="text-[12px] text-gray-500 mt-0.5 whitespace-pre-wrap break-words">{s.content}</p>}
                                    </div>
                                  )
                                ))}

                                <form onSubmit={e => handleAddSubtask(item, e)} className="flex gap-1.5 pt-1">
                                  <input
                                    value={form.title}
                                    placeholder="+ 기록 추가 (Enter로 바로 추가)"
                                    onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, title: e.target.value } }))}
                                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-[12px]"
                                  />
                                  <button type="submit" className="text-[11px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5 flex-shrink-0">추가</button>
                                </form>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      <form onSubmit={e => handleAddItem(g.id, e)} className="flex gap-1.5 px-4 py-2.5">
                        <input value={newItemTitle[g.id] ?? ''} placeholder="+ 항목 추가" onChange={e => setNewItemTitle(prev => ({ ...prev, [g.id]: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px]" />
                        <button type="submit" className="text-[11.5px] font-medium text-[#4C7FE0] px-2">추가</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>

              {activeGroupId === null && (
                <form onSubmit={handleAddGroup} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex gap-2">
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="+ 그룹 추가 (예: 채용, 평가보상)" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <button type="submit" className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium">추가</button>
                </form>
              )}
            </div>
            </div>
          )}

          {/* ══ 일정 ══ */}
          {section === 'schedule' && (
            <>
              {/* 상단 고정 영역 */}
              <div className="flex-shrink-0 px-4 pt-2">
              {/* 한 줄 툴바 — 왼쪽: 월 이동 · 오늘 | 팀원 필터, 오른쪽: 공휴일 · 패밀리데이 · 휴가 · + 일정
                  (예전의 "일정" 제목/설명과 태그 필터 칩은 업무 > 요약 탭에선 중복이라 뺐다) */}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-3 border-b border-[#EEF0F2]">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <div className="flex items-center gap-0.5">
                    <button onClick={prevMonth} aria-label="이전 달" className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.04]">‹</button>
                    <p className="text-[15px] font-semibold text-[#1F2933] w-[100px] text-center">{calYear}년 {calMonthNum}월</p>
                    <button onClick={nextMonth} aria-label="다음 달" className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.04]">›</button>
                    <button onClick={gotoToday} className="ml-1 text-[12px] text-[#7A8491] hover:text-[#4C7FE0] border border-[#E5E8EB] rounded-md px-2.5 py-1">오늘</button>
                  </div>
                  <span className="w-px h-5 bg-[#E5E8EB]" aria-hidden />
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => setSelectedMember(null)}
                      className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${selectedMember === null ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
                    >
                      전체
                    </button>
                    {members.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMember(m.name)}
                        className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${selectedMember === m.name ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
                      >
                        {m.name}
                      </button>
                    ))}
                    <button onClick={() => setShowMemberManager(p => !p)} title="팀원 관리" aria-label="팀원 관리" className="text-[12px] text-[#B0B8C1] hover:text-[#4C7FE0] px-1.5">⚙</button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setCalExpandAll(p => !p); setExpandedCalCell(null) }}
                    title="업무가 3건 이상인 칸을 모두 펼치거나 접습니다"
                    className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 border transition-colors ${calExpandAll ? 'bg-[#1F2933] border-[#1F2933] text-white' : 'border-[#E5E8EB] text-[#5B6472] hover:bg-black/[0.04]'}`}
                  >
                    {calExpandAll ? '모두 접기' : '모두 펼치기'}
                  </button>
                  <button
                    onClick={() => setShowHolidayManager(p => !p)}
                    className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 transition-colors ${showHolidayManager ? 'bg-[#FFE4E6] text-[#BE123C]' : 'text-[#BE123C] hover:bg-[#FFF1F2]'}`}
                  >
                    🎊 공휴일
                  </button>
                  <button
                    onClick={() => setShowFamilyDayManager(p => !p)}
                    className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 transition-colors ${showFamilyDayManager ? 'bg-[#FEF3E2] text-[#B45309]' : 'text-[#B45309] hover:bg-[#FFF8EC]'}`}
                  >
                    🎉 패밀리데이
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowLeaveMenu(p => !p)}
                      className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 transition-colors ${showLeaveMenu ? 'bg-[#D1FAE5] text-[#065F46]' : 'text-[#065F46] hover:bg-[#ECFDF5]'}`}
                    >
                      🌴 휴가 ▾
                    </button>
                    {showLeaveMenu && (
                      <div className="absolute right-0 top-9 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-32 z-20">
                        {Array.from(LEAVE_TAGS).map(t => (
                          <button
                            key={t}
                            onClick={() => {
                              setDraft({ id: null, title: t, date: todayStr(), assignee: members[0]?.name ?? '', tag: t, note: '', status: null })
                              setShowLeaveMenu(false)
                            }}
                            className="w-full text-left text-[12.5px] text-[#3A4249] hover:bg-[#F7F8F8] px-3 py-1.5"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setDraft({ id: null, title: '', date: todayStr(), assignee: members[0]?.name ?? '', tag: '', note: '', status: null })}
                    className="ml-1 text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-3.5 py-1.5"
                  >
                    + 일정
                  </button>
                </div>
              </div>

              {showHolidayManager && (
                <div className="mb-4 bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#BE123C] mb-2.5">🎊 공휴일 관리</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {holidays.length === 0 && <span className="text-[11.5px] text-[#FB7185]">등록된 공휴일이 없습니다.</span>}
                    {holidays.map(h => (
                      <span key={h.id} className="flex items-center gap-1.5 text-[11.5px] text-[#BE123C] bg-white border border-[#FECDD3] rounded-lg px-2.5 py-1">
                        🎊 {h.date} {h.name}
                        <button onClick={() => removeHoliday(h.id)} className="text-[#FDA4AF] hover:text-red-500 leading-none">✕</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={addHoliday} className="flex items-center gap-2">
                    <input
                      type="date" value={holidayDateInput} onChange={e => setHolidayDateInput(e.target.value)}
                      className="text-[12px] border border-[#FECDD3] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#E11D48] bg-white"
                    />
                    <input
                      type="text" value={holidayNameInput} onChange={e => setHolidayNameInput(e.target.value)} placeholder="예: 광복절"
                      className="text-[12px] border border-[#FECDD3] rounded-lg px-2.5 py-1.5 w-28 focus:outline-none focus:border-[#E11D48] bg-white"
                    />
                    <button type="submit" className="text-[12px] font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] rounded-lg px-3 py-1.5">추가</button>
                  </form>
                  {holidayError && <p className="text-[11px] text-red-500 mt-1">{holidayError}</p>}
                </div>
              )}

              {showFamilyDayManager && (
                <div className="mb-4 bg-[#FFF8EC] border border-[#FCE3BF] rounded-xl px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#B45309] mb-2.5">🎉 패밀리데이 날짜 관리</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {familyDays.length === 0 && <span className="text-[11.5px] text-[#A78BFA]">등록된 패밀리데이가 없습니다.</span>}
                    {familyDays.map(f => (
                      <span key={f.id} className="flex items-center gap-1.5 text-[11.5px] text-[#B45309] bg-white border border-[#FCE3BF] rounded-lg px-2.5 py-1">
                        🎉 {f.date}
                        <button onClick={() => removeFamilyDay(f.id)} className="text-[#C4B5FD] hover:text-red-400 leading-none">✕</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={addFamilyDay} className="flex items-center gap-2">
                    <input
                      type="date" value={familyDayInput} onChange={e => setFamilyDayInput(e.target.value)}
                      className="text-[12px] border border-[#FCE3BF] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D97706] bg-white"
                    />
                    <button type="submit" className="text-[12px] font-medium text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg px-3 py-1.5">추가</button>
                  </form>
                  {familyDayError && <p className="text-[11px] text-red-500 mt-1">{familyDayError}</p>}
                </div>
              )}

              {showMemberManager && (
                <div className="flex items-center gap-1.5 flex-wrap mb-4 bg-[#FAFBFB] border border-[#EEF0F2] rounded-lg px-3 py-2.5">
                  {members.map(m => (
                    <span key={m.id} className="text-[11.5px] text-[#7A8491] bg-white border border-[#E5E8EB] rounded-md px-2 py-1 flex items-center gap-1.5">
                      {m.name}
                      <button onClick={() => removeMember(m)} className="text-[#C4CBD2] hover:text-red-500">✕</button>
                    </span>
                  ))}
                  <form onSubmit={addMember} className="flex items-center">
                    <input
                      value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="+ 팀원 추가"
                      className="text-[11.5px] border border-dashed border-[#D3D8DD] rounded-md px-2 py-1 w-24 focus:outline-none focus:border-[#4C7FE0] bg-white"
                    />
                  </form>
                </div>
              )}

              </div>{/* end 상단 고정 */}

              {/* 스크롤 영역 */}
              <div className="flex-1 min-h-0 overflow-auto px-4 pb-8">
              {/* Calendar Surface */}
              {members.length === 0 ? (
                <p className="text-[12.5px] text-[#B0B8C1] bg-white rounded-xl border border-[#EEF0F2] p-6 text-center">팀원을 먼저 추가하면 표가 만들어집니다.</p>
              ) : (
                <div className="min-w-[760px] bg-white rounded-xl border border-[#E3E7EC] [overflow:clip]">
                    {/* 팀 달력 "레인" 표현 — 행 = 사람 레인. 색은 업무 영역(태그)만, 진행상태는 모양(완료=외곽선/지연=→ 굵은 테두리/취소=취소선),
                        부재(휴가·반차·공휴일·패밀리데이)는 칸을 칠하지 않고 옅은 바탕 + 얇은 선 + 회색 글씨로만 남긴다. */}
                    <div className="grid" style={{ gridTemplateColumns: '112px repeat(5, minmax(0, 1fr))' }}>
                      {/* sticky 요일 헤더 */}
                      <div className="sticky top-0 z-10 h-10 border-b border-[#E3E7EC] bg-white" />
                      {WEEKDAYS.map((w, wIdx) => {
                        const headerIsToday = monthWeeks.some(week => week[wIdx] && dateStr(week[wIdx]) === todayStr())
                        return (
                          <div
                            key={w}
                            className={`sticky top-0 z-10 h-10 flex items-center justify-center text-[12px] font-semibold border-b border-l border-[#E3E7EC] bg-white ${headerIsToday ? 'text-[#4C7FE0]' : 'text-[#5B6472]'}`}
                          >
                            {w}
                          </div>
                        )
                      })}

                      {monthWeeks.map((week, wi) => {
                        const isOffDay = (ds: string) => familyDaySet.has(ds) || holidayMap.has(ds)
                        const fullLeaveOf = (name: string, ds: string) =>
                          !isOffDay(ds) && filteredEvents.some(ev => ev.assignee === name && ev.event_date === ds && ev.tag === '휴가')
                        return (
                        <Fragment key={wi}>

                          {/* ── 주 구분 — 선 대신 옅은 띠 ── */}
                          {wi > 0 && <div className="col-span-6 h-3 bg-[#F3F5F8]" />}

                          {/* ── 날짜 행: 날짜 숫자 + 생일/주년(회색 글씨) + 출근 인원(휴가 일정 기준) ── */}
                          <div className="flex items-start px-3 pt-2.5 text-[11px] font-semibold text-[#8A94A3] border-t border-[#EEF0F2]">{wi + 1}주</div>
                          {week.map((d, di) => {
                            const ds = dateStr(d)
                            const isToday = ds === todayStr()
                            let chips = dayEventChips(d)
                            // 캘린더가 월~금만 보여줘서 토/일에 걸린 생일·입사기념일은 셀이 없어 사라진다 —
                            // 그 주 금요일 칸에서 토/일도 같이 확인해 당겨서 보여준다.
                            if (di === 4) {
                              const sat = new Date(d); sat.setDate(d.getDate() + 1)
                              const sun = new Date(d); sun.setDate(d.getDate() + 2)
                              const satLabel = `(${sat.getMonth() + 1}/${sat.getDate()} 토)`
                              const sunLabel = `(${sun.getMonth() + 1}/${sun.getDate()} 일)`
                              chips = [...chips, ...dayEventChips(sat, satLabel), ...dayEventChips(sun, sunLabel)]
                            }
                            // 출근 인원 — 실제 근태가 아니라 달력에 올린 휴가 일정으로 센다. 종일 "휴가"면 부재, 반차류는 출근 + 반차로 따로 센다.
                            const off = isOffDay(ds)
                            const presence = visibleMembers.map(mem => {
                              if (off) return 'off'
                              const leave = filteredEvents.find(ev => ev.assignee === mem.name && ev.event_date === ds && ev.tag && LEAVE_TAGS.has(ev.tag))
                              return !leave ? 'in' : leave.tag === '휴가' ? 'off' : 'half'
                            })
                            const presentCount = presence.filter(p => p !== 'off').length
                            const halfCount = presence.filter(p => p === 'half').length
                            return (
                              <div
                                key={d.toISOString()}
                                className={`flex flex-col gap-1 px-2.5 py-2 border-l border-t border-[#EEF0F2] ${isToday ? 'bg-[#F8FAFF] shadow-[inset_0_3px_0_#4C7FE0]' : ''}`}
                              >
                                <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
                                  <span className={`text-[14px] font-bold tabular-nums ${isToday ? 'text-[#4C7FE0]' : 'text-[#1F2933]'}`}>{d.getDate()}</span>
                                  {chips.map(c => (
                                    <span key={c.key} className="text-[10.5px] text-[#5B6472] whitespace-nowrap">{c.text}</span>
                                  ))}
                                </div>
                                {visibleMembers.length > 0 && (
                                  <div
                                    className="flex items-center gap-1.5 text-[10px] text-[#5B6472] tabular-nums"
                                    title={off ? '팀 전체 휴무' : visibleMembers.filter((_, i) => presence[i] !== 'in').map(m => m.name).join(', ') || '전원 출근'}
                                  >
                                    <span className="flex gap-[2px]">
                                      {presence.map((p, i) => (
                                        <i
                                          key={i}
                                          className="block w-[7px] h-[7px] rounded-full"
                                          style={{ background: p === 'in' ? '#2F3A4F' : p === 'half' ? 'linear-gradient(90deg, #2F3A4F 50%, #CDD2D9 50%)' : '#CDD2D9' }}
                                        />
                                      ))}
                                    </span>
                                    출근 {presentCount}/{visibleMembers.length}{halfCount > 0 && ` · 반차 ${halfCount}`}
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* ── 인사관리팀 행 (짙은 남색 띠, 회의는 시간 블록) ── */}
                          <div className="min-h-[44px] flex items-center px-3 text-[12px] font-semibold text-white truncate bg-[#24324D]">인사관리팀</div>
                          {week.map(d => {
                            const ds = dateStr(d)
                            const isToday = ds === todayStr()
                            const isFamilyDay = familyDaySet.has(ds)
                            const holidayName = holidayMap.get(ds)
                            const meetingsForDay = meetings.filter(m => m.meeting_date === ds)
                            if (isFamilyDay || holidayName) {
                              return (
                                <div
                                  key={`team-${ds}`}
                                  style={{ gridRow: `span ${visibleMembers.length + 1}` }}
                                  className={`flex flex-col gap-0.5 p-2.5 border-l border-t border-[#EEF0F2] ${isFamilyDay ? 'bg-[#FFFAF0]' : 'bg-[#FFF8F9]'}`}
                                >
                                  <span className={`text-[12px] font-semibold ${isFamilyDay ? 'text-[#B7862F]' : 'text-[#D0607A]'}`}>{isFamilyDay ? '패밀리데이' : holidayName}</span>
                                  <span className={`text-[10.5px] ${isFamilyDay ? 'text-[#DDB778]' : 'text-[#EBA5B4]'}`}>팀 전체 휴무</span>
                                </div>
                              )
                            }
                            return (
                              <div
                                key={`team-${ds}`}
                                onMouseEnter={() => { if (meetingsForDay.length === 1) prefetchMeeting(meetingsForDay[0]) }}
                                onClick={() => {
                                  if (meetingsForDay.length === 0) createMeeting(ds, true)
                                  else if (meetingsForDay.length === 1) openMeetingPopup(meetingsForDay[0])
                                  else setDayPickerDate(ds)
                                }}
                                title={meetingsForDay.length === 0 ? '이 날짜로 회의록 작성' : meetingsForDay.length === 1 ? '회의록 열기' : `이 날짜의 회의 ${meetingsForDay.length}건`}
                                className={`group relative min-h-[44px] flex flex-col justify-center gap-[3px] p-1.5 border-l border-[#33426A] cursor-pointer ${isToday ? 'bg-[#2B3C60]' : 'bg-[#24324D]'} hover:bg-[#2E4066]`}
                              >
                                {meetingsForDay.length === 0 ? (
                                  <span className="text-[11px] text-[#9FB3DA] text-center opacity-0 group-hover:opacity-100 transition-opacity">+ 회의</span>
                                ) : (
                                  <>
                                    {meetingsForDay.slice(0, 2).map(m => (
                                      <span key={m.id} className="flex gap-1.5 min-w-0 text-[11px] text-[#E8ECF5] bg-white/10 rounded px-[7px] py-1">
                                        {m.meeting_time && <span className="flex-shrink-0 text-[#9FB3DA] tabular-nums">{m.meeting_time}</span>}
                                        <span className="truncate">{m.title}</span>
                                      </span>
                                    ))}
                                    {meetingsForDay.length > 2 && (
                                      <span className="text-[10px] text-[#9FB3DA] pl-1">+{meetingsForDay.length - 2}건 더보기</span>
                                    )}
                                  </>
                                )}

                                {dayPickerDate === ds && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setDayPickerDate(null) }} />
                                    <div onClick={e => e.stopPropagation()} className="absolute left-0 top-full mt-1 z-50 w-60 bg-white border border-[#E5E8EB] rounded-lg shadow-lg py-1 text-left cursor-default">
                                      <p className="px-3 py-1.5 text-[11px] font-semibold text-[#7A8491]">{fmtMeetingDayFull(ds)} · 회의 {meetingsForDay.length}건</p>
                                      {meetingsForDay.map(m => (
                                        <button
                                          key={m.id}
                                          onMouseEnter={() => prefetchMeeting(m)}
                                          onClick={() => { setDayPickerDate(null); openMeetingPopup(m) }}
                                          className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-[#F7F8F8]"
                                        >
                                          <span className="text-[11px] text-[#7A8491] flex-shrink-0">{m.meeting_time || '--:--'}</span>
                                          <span className="text-[12.5px] text-[#1F2933] truncate">{m.title}</span>
                                        </button>
                                      ))}
                                      <div className="border-t border-[#EEF0F2] mt-1 pt-1">
                                        <button
                                          onClick={() => { setDayPickerDate(null); createMeeting(ds, true) }}
                                          className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-[#4C7FE0] hover:bg-[#F7F8F8]"
                                        >+ 새 회의</button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })}

                          {/* ── 멤버별 행 (패밀리데이/공휴일 컬럼은 팀 행 spanning 셀이 덮음) ── */}
                          {visibleMembers.map(mem => (
                            <Fragment key={mem.id}>
                              <div className="relative min-h-[68px] flex items-start gap-1.5 px-3 pt-2.5 text-[13px] font-semibold text-[#1F2933] border-t border-[#E6E9ED]">
                                <button
                                  type="button"
                                  onClick={() => setColorPickerMemberId(p => p === mem.id ? null : mem.id)}
                                  title="팀원 색 바꾸기"
                                  aria-label={`${mem.name} 색 바꾸기`}
                                  className="mt-[5px] w-2.5 h-2.5 rounded-full flex-shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-[#D5DAE1]"
                                  style={{ background: calMemberColor(mem.color_key) }}
                                />
                                <span className="truncate">{mem.name}</span>
                                {colorPickerMemberId === mem.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setColorPickerMemberId(null)} />
                                    <div className="absolute left-2 top-8 z-50 grid grid-cols-4 gap-1.5 p-2 bg-white border border-[#E5E8EB] rounded-lg shadow-lg">
                                      {CAL_MEMBER_COLORS.map((c, k) => (
                                        <button
                                          key={c}
                                          type="button"
                                          onClick={() => setMemberColor(mem, k)}
                                          aria-label={`색 ${k + 1}`}
                                          className={`w-5 h-5 rounded-full ${((mem.color_key ?? 0) % 8) === k ? 'ring-2 ring-offset-1 ring-[#1F2933]' : ''}`}
                                          style={{ background: c }}
                                        />
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                              {week.map((d, di) => {
                                const ds = dateStr(d)
                                if (isOffDay(ds)) return null
                                const isToday = ds === todayStr()
                                const cellKey = `${mem.name}|${ds}`
                                const cellEvents = filteredEvents.filter(ev => ev.assignee === mem.name && ev.event_date === ds)
                                const vacationEv = cellEvents.find(ev => ev.tag && LEAVE_TAGS.has(ev.tag))
                                const otherEvents = cellEvents.filter(ev => !(ev.tag && LEAVE_TAGS.has(ev.tag)))
                                const isFullLeave = vacationEv?.tag === '휴가'
                                const isPmLeave = !!vacationEv?.tag?.startsWith('오후')
                                const openEvent = (ev: ScheduleEvent) => setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note, status: ev.status })
                                // 이어지는 종일 휴가는 칸 경계를 넘어 선을 잇고, 첫 칸에만 "휴가 · n일"을 쓴다.
                                const leaveJoinPrev = isFullLeave && di > 0 && fullLeaveOf(mem.name, dateStr(week[di - 1]))
                                const leaveJoinNext = isFullLeave && di < week.length - 1 && fullLeaveOf(mem.name, dateStr(week[di + 1]))
                                let leaveRun = 1
                                if (isFullLeave && !leaveJoinPrev) {
                                  for (let k = di + 1; k < week.length && fullLeaveOf(mem.name, dateStr(week[k])); k++) leaveRun++
                                }
                                const expanded = calExpandAll || expandedCalCell === cellKey
                                const shown = expanded ? otherEvents : otherEvents.slice(0, 2)
                                return (
                                  <div
                                    key={ds}
                                    onClick={() => setDraft({ id: null, title: '', date: ds, assignee: mem.name, tag: '', note: '', status: null })}
                                    onDragOver={e => { if (!calDragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (calDragOver !== cellKey) setCalDragOver(cellKey) }}
                                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCalDragOver(p => p === cellKey ? null : p) }}
                                    onDrop={e => {
                                      e.preventDefault()
                                      const id = e.dataTransfer.getData('text/plain') || calDragId
                                      setCalDragOver(null); setCalDragId(null)
                                      if (id) void moveEvent(id, ds, mem.name)
                                    }}
                                    className={`group min-h-[68px] cursor-pointer flex flex-col border-t border-[#E6E9ED] ${calDragOver === cellKey ? 'outline outline-2 -outline-offset-2 outline-[#4C7FE0] !bg-[#EEF3FD]' : ''} ${
                                      leaveJoinPrev ? 'border-l border-l-[#F4FBF7]' : 'border-l border-l-[#EEF0F2]'
                                    } ${isFullLeave ? 'bg-[#F4FBF7]' : isToday ? 'bg-[#F8FAFF] hover:bg-[#F1F4FB]' : 'bg-white hover:bg-[#F7F8FA]'}`}
                                  >
                                    {isFullLeave && vacationEv && (
                                      <div
                                        onClick={e => { e.stopPropagation(); openEvent(vacationEv) }}
                                        className="flex flex-col gap-[7px] pt-[9px] pb-1.5"
                                        title={vacationEv.title || '휴가'}
                                      >
                                        <span className="px-2.5 min-h-[14px] text-[11px] font-medium text-[#4A9474]">
                                          {leaveJoinPrev ? '' : `휴가${leaveRun > 1 ? ` · ${leaveRun}일` : ''}`}
                                        </span>
                                        <i className={`block h-[2px] bg-[#BCE3D0] ${leaveJoinPrev ? 'ml-0' : 'ml-2.5 rounded-l'} ${leaveJoinNext ? 'mr-0' : 'mr-2.5 rounded-r'}`} />
                                      </div>
                                    )}
                                    {vacationEv && !isFullLeave && (
                                      <div
                                        onClick={e => { e.stopPropagation(); openEvent(vacationEv) }}
                                        className={`h-5 flex-shrink-0 flex items-center gap-1.5 px-2 text-[10.5px] font-medium text-[#4A9474] bg-[#F4FBF7] ${isPmLeave ? 'order-2' : ''}`}
                                        title={vacationEv.title || vacationEv.tag || ''}
                                      >
                                        <i className="block w-3.5 h-[2px] rounded bg-[#BCE3D0]" />
                                        {vacationEv.tag}
                                      </div>
                                    )}
                                    <div className="flex-1 flex flex-col gap-[3px] p-1.5">
                                      {shown.map(ev => {
                                        const c = calMemberColor(mem.color_key)
                                        // 일정은 "이 날까지 확인할 마감일"로 쓴다 — 상태보다 날짜가 지났는지가 중요해서
                                        // 지난 날짜는 자동으로 흐리게, 완료는 ✓만, 지연은 따로 표시하지 않는다.
                                        const past = ds < todayStr()
                                        const done = ev.status === 'done'
                                        const cancelled = ev.status === 'cancelled'
                                        return (
                                          <div
                                            key={ev.id}
                                            onClick={e => { e.stopPropagation(); openEvent(ev) }}
                                            draggable
                                            onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', ev.id); e.dataTransfer.effectAllowed = 'move'; setCalDragId(ev.id) }}
                                            onDragEnd={() => { setCalDragId(null); setCalDragOver(null) }}
                                            title={`${ev.tag ? `[${ev.tag}] ` : ''}${ev.title}${ev.status ? ` · ${EVENT_STATUS_LABEL[ev.status]}` : ''} — 끌어서 다른 날짜로 옮길 수 있어요`}
                                            className={`flex items-center gap-[5px] text-[11.5px] font-medium rounded px-1.5 py-1 leading-tight cursor-grab active:cursor-grabbing ${
                                              cancelled ? 'opacity-50 line-through' : ''
                                            } ${past ? 'text-[#8A94A3]' : 'text-[#111827]'} ${calDragId === ev.id ? 'opacity-40' : ''}`}
                                            style={{ background: past ? '#F7F9FC' : CAL_CHIP_BG }}
                                          >
                                            <i className="block w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c, opacity: past ? 0.45 : 1 }} />
                                            <span className="min-w-0 truncate">{done && '✓ '}{ev.tag && <span className="text-[#8A94A3] font-normal">[{ev.tag}] </span>}{ev.title}</span>
                                          </div>
                                        )
                                      })}
                                      {otherEvents.length > 2 && !calExpandAll && (
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); setExpandedCalCell(expanded ? null : cellKey) }}
                                          className="self-start text-[11px] font-medium text-[#4C7FE0] hover:underline pl-1"
                                        >
                                          {expanded ? '접기' : `+${otherEvents.length - 2}건`}
                                        </button>
                                      )}
                                      {cellEvents.length === 0 && (
                                        <span className="m-auto text-[11px] text-[#9AA3AE] opacity-0 group-hover:opacity-100 transition-opacity">+</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                        )
                      })}
                    </div>
                  </div>
              )}

              {unassignedEvents.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] text-[#B0B8C1] mb-1.5">담당자 미배정 일정 {unassignedEvents.length}건 (클릭해서 담당자 지정)</p>
                  <div className="space-y-1.5">
                    {unassignedEvents.map(ev => (
                      <div
                        key={ev.id}
                        onClick={() => setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note, status: ev.status })}
                        className="flex items-center gap-2 bg-white rounded-lg border border-[#EEF0F2] px-3 py-2 text-[12px] text-[#7A8491] cursor-pointer hover:bg-[#F7F8F8]"
                      >
                        <span className="flex-1 min-w-0">{fmtDay(ev.event_date)} · {ev.title} {ev.assignee && <span className="text-[#B0B8C1]">({ev.assignee})</span>}</span>
                        <EventStatusStamp status={ev.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>{/* end 스크롤 영역 */}
            </>
          )}

          {/* ══ 목표 ══ */}
          {section === 'goals' && <GoalsPanel />}
          {section === 'retro' && <RetroHub />}

          {/* ══ 아카이빙 ══ */}
          {section === 'archiving' && <ArchivingPanel />}

          {/* ══ 팀 ══ */}
          {section === 'team' && <TeamPersona />}

          {/* ══ 연혁 ══ */}
          {isMounted('history') && (
            <div className={section === 'history' ? '' : 'hidden'}><HistoryTimeline /></div>
          )}

          {/* ══ 연상퀴즈 ══ */}
          {section === 'quiz' && (
            <iframe key="quiz-iframe" src="/drawing-game.html" className="w-full h-full border-0 flex-1 min-h-0" allow="clipboard-write" style={{ display: 'block' }} />
          )}
        </div>
        </div>
        </div>
      </main>
      <AnonChat />
      <SosPopup />
      {baseballOpen && <BaseballWidget onClose={() => setBaseballOpen(false)} />}
      <DuelWatcher widgetOpen={baseballOpen} onOpen={() => setBaseballOpen(true)} />
      <GiftBoxModal />

      {draft && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={() => setDraft(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-sm space-y-2.5">
            <p className="text-sm font-semibold text-gray-800">{draft.id ? '일정 수정' : '일정 추가'}</p>
            <input
              value={draft.title} onChange={e => setDraft(d => d && { ...d, title: e.target.value })}
              placeholder="제목" autoFocus className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input type="date" value={draft.date} onChange={e => setDraft(d => d && { ...d, date: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-2 text-sm" />
              <select value={draft.assignee} onChange={e => setDraft(d => d && { ...d, assignee: e.target.value })} className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm">
                {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                {!members.some(m => m.name === draft.assignee) && draft.assignee && <option value={draft.assignee}>{draft.assignee} (미등록)</option>}
              </select>
            </div>
            <ScheduleTagSelect value={draft.tag} onChange={tag => setDraft(d => d && { ...d, tag })} />
            <div>
              <p className="text-[11px] text-gray-400 mb-1">진행상태</p>
              <div className="flex gap-1.5">
                <button
                  type="button" onClick={() => setDraft(d => d && { ...d, status: null })}
                  className={`flex-1 text-[12px] py-1.5 rounded-lg border transition-colors ${draft.status === null ? 'border-[#4C7FE0] text-[#4C7FE0] bg-[#4C7FE0]/5 font-medium' : 'border-gray-200 text-gray-400'}`}
                >
                  없음
                </button>
                {(['done', 'delayed', 'cancelled'] as EventStatus[]).map(s => (
                  <button
                    key={s} type="button" onClick={() => setDraft(d => d && { ...d, status: s })}
                    className={`flex-1 flex items-center justify-center py-1.5 rounded-lg border transition-colors ${draft.status === s ? 'border-gray-300' : 'border-transparent opacity-50 hover:opacity-80'}`}
                  >
                    <EventStatusStamp status={s} />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={draft.note} onChange={e => setDraft(d => d && { ...d, note: e.target.value })}
              placeholder="메모 (선택)" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-1.5 pt-1">
              <button onClick={saveDraft} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">저장</button>
              {draft.id && <button onClick={() => deleteDraftEvent(draft.id!)} className="text-[12.5px] font-medium text-red-500 px-3 py-1.5">삭제</button>}
              <button onClick={() => setDraft(null)} className="text-[12.5px] font-medium text-gray-500 px-3 py-1.5">취소</button>
            </div>
          </div>
        </div>
      )}

      {meetingPopupOpen && selectedMeeting && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center p-4 sm:p-6" onClick={closeMeetingPopup}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] shadow-2xl w-full max-w-[1760px] h-full flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-2.5 border-b border-[#EEF0F2]">
              <p className="text-[12.5px] text-[#7A8491]">회의창 — 쓰는 내용은 바로 회의록에 저장됩니다</p>
              <div className="flex items-center gap-1">
                <button onClick={closeMeetingPopup} className="text-[13px] font-medium text-[#7A8491] hover:text-[#1F2933] px-2.5 py-1.5 rounded-md hover:bg-black/[0.04]">닫기</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {renderMeetingDetail(selectedMeeting, true)}
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className={`fixed bottom-5 right-5 text-white text-[12.5px] px-4 py-2.5 rounded-lg shadow-lg z-50 ${flashTone === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
          {flash}
        </div>
      )}

      <ReportConflictDialog wr={workReport} />

      {saveConflict && (() => {
        const c = saveConflict
        const who = '안건 메모'
        const when = c.updatedAt ? fmtConflictTime(c.updatedAt) : null
        return (
          <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center px-4" onClick={() => setSaveConflict(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[560px] max-h-[85vh] overflow-y-auto p-5">
              <p className="text-[15px] font-semibold text-[#1F2933] mb-1">{who}이 그 사이 먼저 저장돼 최신 내용으로 바꿨습니다</p>
              <p className="text-[12.5px] text-[#7A8491] mb-4">
                {c.updatedBy ? `${c.updatedBy}님` : '다른 분'}{when ? ` · ${when}` : ''}. 내가 쓴 내용은 아래에 남겨뒀어요 — 필요하면 복사해서 다시 붙여넣으세요.
              </p>
              <div className="border border-[#E5E8EB] rounded-lg p-3 mb-4">
                <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1.5">내가 쓴 내용 (저장 안 됨)</p>
                <p className="text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto">
                  {c.localValue || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { void navigator.clipboard.writeText(c.localValue).then(() => showFlash('내가 쓴 내용을 복사했습니다'), () => showFlash('복사에 실패했습니다', 'error')) }}
                  className="text-[12.5px] font-medium text-[#4C7FE0] border border-[#4C7FE0]/40 hover:bg-[#4C7FE0]/5 rounded-lg px-3.5 py-2"
                >내 내용 복사</button>
                <button onClick={() => setSaveConflict(null)} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2">확인</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
