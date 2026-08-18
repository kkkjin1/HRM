'use client'

// team-log — 팀원들이 비밀번호로 접근하는 독립 앱. jin-dashboard와는 별도
// 저장소/배포이며, 공유하는 것은 같은 Supabase 프로젝트뿐 (테이블은 team_log_*로 격리).
// 좌측 메뉴로 일상(자유메모)/업무(그룹→항목→서브태스크)/회의록/일정 4개 섹션을 오간다.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import GoalsPanel from '@/components/goals/GoalsPanel'
import DailyMessage from '@/components/DailyMessage'
import LunchLadder from '@/components/LunchLadder'
import Roulette from '@/components/Roulette'
import TeamLottery from '@/components/TeamLottery'
import DoodleBoard from '@/components/DoodleBoard'
import TeamTree from '@/components/TeamTree'
import TeamPersona from '@/components/TeamPersona'
import ProfileButton from '@/components/ProfileButton'
import ClickableAvatar from '@/components/ClickableAvatar'
import NotificationBell from '@/components/NotificationBell'
import { useMembers } from '@/lib/useMembers'
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
type Meeting = { id: string; title: string; meeting_date: string; meeting_time: string; attendees: string; agenda: string; created_at: string }
type MeetingDraft = { id: string | null; title: string; date: string; time: string; attendeeNames: string[]; agenda: string; confirmed: boolean }
type MeetingProgress = { id: string; meeting_id: string; member_id: string; content: string; updated_at: string }
type MeetingFilter = '전체' | '내회의' | '이번주' | '이번달'
type MeetingListRow = { kind: 'single'; meeting: Meeting } | { kind: 'group'; title: string; meetings: Meeting[] }
type MeetingItem = { id: string; meeting_id: string; kind: 'decision' | 'action'; content: string; owner: string; due_date: string | null; done: boolean; sort_order: number; created_at: string }
type ScheduleEvent = {
  id: string; title: string; event_date: string; note: string; assignee: string; tag: string | null
  source_type: 'item' | 'subtask' | 'meeting' | null; source_id: string | null; created_at: string
}
type Member = { id: string; name: string; sort_order: number }
type EventDraft = { id: string | null; title: string; date: string; assignee: string; tag: string; note: string }
type FamilyDay = { id: string; date: string; note: string; created_at: string }
type Holiday = { id: string; date: string; name: string; created_at: string }
type Section = 'life' | 'work' | 'meetings' | 'schedule' | 'goals' | 'team'
const SECTION_STORAGE_KEY = 'hrm_last_section'
function isSection(v: string | null): v is Section {
  return v === 'life' || v === 'work' || v === 'meetings' || v === 'schedule' || v === 'goals' || v === 'team'
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
const BASE_TAGS = ['중간보고', '최종보고', '휴가']
const WEEKDAYS = ['월', '화', '수', '목', '금']
// 고정회의(요일 반복) 제목 — src/app/api/meetings/route.ts의 RECURRING_MEETINGS와 반드시 일치해야 한다.
// 회의록 목록에서 이 제목의 회의들을 하나의 접이식 그룹으로 묶는 데 쓴다.
const WEEKLY_MEETING_TITLE = '인사관리팀 위클리미팅'

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

function fmtDay(s: string) {
  try {
    const d = parseISO(s)
    if (isToday(d)) return '오늘'
    if (isYesterday(d)) return '어제'
    return format(d, 'M.d (E)', { locale: ko })
  } catch { return s }
}

// 같은 제목을 가진 다른 회의(위클리미팅 등 고정회의)가 있으면 그 시리즈로만 좁히고,
// 1회성 회의처럼 제목이 겹치는 회의가 없으면 전체 회의 목록에서 찾는다.
function meetingSeriesPool(list: Meeting[], title: string, selfId: string | null) {
  if (!title) return list
  const series = list.filter(m => m.title === title)
  const hasOtherInSeries = series.some(m => m.id !== selfId)
  return hasOtherInSeries ? series : list
}

export default function TeamLogPage() {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)

  const [section, setSection] = useState<Section>('life')
  const [author, setAuthor] = useState('')
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
  const [meetingDraft, setMeetingDraft] = useState<MeetingDraft | null>(null)
  const [meetingMenuOpen, setMeetingMenuOpen] = useState(false)
  const [weeklyGroupExpanded, setWeeklyGroupExpanded] = useState(false)
  const mtNow = new Date()
  const [meetingYear, setMeetingYear] = useState(mtNow.getFullYear())
  const [meetingMonth, setMeetingMonth] = useState(mtNow.getMonth() + 1)
  const [meetingItems, setMeetingItems] = useState<MeetingItem[]>([])
  const [meetingProgress, setMeetingProgress] = useState<MeetingProgress[]>([])
  const [showPrevMeeting, setShowPrevMeeting] = useState(false)
  const [prevMeetingItems, setPrevMeetingItems] = useState<MeetingItem[]>([])
  // 작성 서랍 오른쪽 "참고" 패널 — 기본값은 직전 회의, 날짜 네비게이션으로 다른 날 회의도 본다.
  const [refMeetingId, setRefMeetingId] = useState<string | null>(null)
  const [refMissingDate, setRefMissingDate] = useState('')
  const [refItems, setRefItems] = useState<MeetingItem[]>([])
  const [refProgress, setRefProgress] = useState<MeetingProgress[]>([])
  const [newDecisionText, setNewDecisionText] = useState('')
  const [newActionText, setNewActionText] = useState('')
  const [newActionOwner, setNewActionOwner] = useState('')
  const [newActionDue, setNewActionDue] = useState('')

  // ── 일정 ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  // 회의 참석자(team_log_members)와 프로필 카드(members)는 서로 다른 테이블이라 id가
  // 안 맞는다 — 이름으로만 매칭해서 아바타/프로필카드를 붙인다.
  const { members: profileMembers } = useMembers()
  const profileMemberByName = (name: string) => profileMembers.find(pm => pm.name === name)
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonthNum, setCalMonthNum] = useState(now.getMonth() + 1)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [showMemberManager, setShowMemberManager] = useState(false)
  const [familyDays, setFamilyDays] = useState<FamilyDay[]>([])
  const [showFamilyDayManager, setShowFamilyDayManager] = useState(false)
  const [familyDayInput, setFamilyDayInput] = useState('')
  const [familyDayError, setFamilyDayError] = useState('')
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [showHolidayManager, setShowHolidayManager] = useState(false)
  const [holidayDateInput, setHolidayDateInput] = useState('')
  const [holidayNameInput, setHolidayNameInput] = useState('')
  const [holidayError, setHolidayError] = useState('')

  // ── 업무/회의록 → 일정 연동 (호버 후 S 단축키, 또는 📅 버튼) ──────────
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setAuthor(user.user_metadata?.name ?? user.email ?? '')
    })()
    loadAll()

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
      if (isSection(saved)) setSection(saved)
    } catch {
      // localStorage 접근 불가(시크릿 모드 등)는 조용히 무시 — 매번 일상 탭으로 시작하는 정도의 불편함일 뿐.
    }
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
  // 위클리미팅처럼 같은 제목의 고정회의는 그 시리즈끼리만 직전/이전이 연결된다.
  const selectedMeetingForSeries = selectedMeetingId ? meetings.find(m => m.id === selectedMeetingId) ?? null : null
  const previousMeetingPool = meetingSeriesPool(meetings, selectedMeetingForSeries?.title ?? '', selectedMeetingId)
  const selectedIdx = selectedMeetingId ? previousMeetingPool.findIndex(m => m.id === selectedMeetingId) : -1
  const previousMeeting = selectedIdx >= 0 ? previousMeetingPool[selectedIdx + 1] ?? null : null
  const previousMeetingId = previousMeeting?.id ?? null

  useEffect(() => {
    loadMeetingItems(selectedMeetingId)
    loadMeetingProgress(selectedMeetingId)
  }, [selectedMeetingId])

  useEffect(() => {
    loadPrevMeetingItems(showPrevMeeting ? previousMeetingId : null)
  }, [showPrevMeeting, previousMeetingId])

  // 서랍 상태를 원시값으로 뽑아둔다 — meetingDraft 객체는 타이핑마다 새로 만들어져서
  // 그대로 의존성에 쓰면 참고 패널 선택이 매 입력마다 초기화된다.
  const draftOpen = meetingDraft !== null
  const draftMeetingId = meetingDraft?.id ?? null
  const draftDate = meetingDraft?.date ?? ''
  const draftTitle = meetingDraft?.title ?? ''
  const refMeeting = refMeetingId ? meetings.find(m => m.id === refMeetingId) ?? null : null

  // 서랍이 "새로" 열렸을 때만 참고 패널의 기본값을 "작성 중인 날짜 이전의 가장 최근 회의"로 맞춘다.
  // 위클리미팅처럼 같은 제목의 고정회의를 작성 중이면 그 시리즈 안에서만 직전 회의를 찾는다.
  // 새 세션 판정: 서랍이 닫혀 있다가 열렸을 때, 또는 저장된 다른 회의로 직접 전환했을 때만이다.
  // 새 초안은 처음엔 id가 없다가 결정사항/진행사항을 처음 추가하는 순간 저장되며 null→실제 id로
  // 채워지는데, 이건 "같은 세션"이라 여기서 제외하지 않으면 왼쪽에 뭔가 입력할 때마다(제목 등)
  // 참고 패널이 원래 기본값으로 되돌아가 버린다 — 그 과정에서 refMeeting이 잠깐 바뀌면서
  // 안건 <details> 토글도 리마운트되어 같이 풀린다.
  const draftSessionIdRef = useRef<string | null>(null)
  const prevDraftOpenRef = useRef(false)
  useEffect(() => {
    const justOpened = draftOpen && !prevDraftOpenRef.current
    prevDraftOpenRef.current = draftOpen

    if (!draftOpen) {
      draftSessionIdRef.current = null
      setRefMeetingId(null)
      setRefMissingDate('')
      return
    }

    const prevId = draftSessionIdRef.current
    const switchedToAnotherSavedMeeting = prevId !== null && draftMeetingId !== null && prevId !== draftMeetingId
    draftSessionIdRef.current = draftMeetingId
    if (!justOpened && !switchedToAnotherSavedMeeting) return

    const others = meetingSeriesPool(meetings, draftTitle, draftMeetingId).filter(m => m.id !== draftMeetingId)
    const onOrBefore = draftDate ? others.filter(m => m.meeting_date <= draftDate) : others
    setRefMeetingId((onOrBefore[0] ?? others[0])?.id ?? null)
    setRefMissingDate('')
  }, [draftOpen, draftMeetingId, draftDate, draftTitle, meetings])

  useEffect(() => {
    loadRefItems(refMeetingId)
    loadRefProgress(refMeetingId)
  }, [refMeetingId])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2200)
    return () => clearTimeout(t)
  }, [flash])

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

  // 팝업은 네트워크를 기다리지 않고 항상 즉시 연다. DB 레코드는 실제로 필요해질 때
  // (저장 누르거나, 결정사항/액션아이템을 처음 추가할 때) ensureMeetingRecord()가 만든다.
  function openNewMeetingDrawer(date: string = todayStr()) {
    // 결정사항/액션아이템 목록(meetingItems)은 selectedMeetingId를 기준으로 불러오므로,
    // 여기서 초기화하지 않으면 직전에 보던 회의의 항목이 새 draft에 그대로 남아 보인다.
    setSelectedMeetingId(null)
    setMeetingDraft({ id: null, title: '', date, time: '', attendeeNames: [], agenda: '', confirmed: false })
    drawerAgendaBaselineRef.current = ''
  }

  function openEditMeetingDrawer(m: Meeting) {
    setMeetingMenuOpen(false)
    setSelectedMeetingId(m.id)
    setMeetingDraft({ id: m.id, title: m.title, date: m.meeting_date, time: m.meeting_time, attendeeNames: parseAttendees(m.attendees), agenda: m.agenda, confirmed: true })
    drawerAgendaBaselineRef.current = m.agenda
  }

  // 아직 저장 안 된 draft면 회의 레코드를 만들어 id를 돌려준다 (이미 있으면 그대로).
  // 결정사항/액션아이템은 meeting_id가 있어야 붙일 수 있어서, 그 시점에 이걸 먼저 부른다.
  async function ensureMeetingRecord(draft: MeetingDraft): Promise<string | null> {
    if (draft.id) return draft.id
    const res = await fetch('/api/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title.trim() || '제목 없음', meeting_date: draft.date, meeting_time: draft.time,
        attendees: joinAttendees(draft.attendeeNames), agenda: draft.agenda,
      }),
    })
    if (unauthorizedGuard(res)) return null
    const json = await res.json()
    if (!json.ok) { setLoadError(json.error ?? '회의록 저장에 실패했습니다.'); return null }
    setMeetings(prev => [json.meeting, ...prev].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)))
    setSelectedMeetingId(json.meeting.id)
    setMeetingDraft(d => d && { ...d, id: json.meeting.id })
    drawerAgendaBaselineRef.current = json.meeting.agenda
    return json.meeting.id as string
  }

  async function saveMeetingDraft() {
    if (!meetingDraft || !meetingDraft.title.trim() || !meetingDraft.date) return

    // 저장한 회의의 날짜가 지금 보고 있는 월과 다르면, 목록에서 바로 보이도록 그 월로 이동한다
    const savedDate = new Date(meetingDraft.date)
    setMeetingYear(savedDate.getFullYear())
    setMeetingMonth(savedDate.getMonth() + 1)

    const id = await ensureMeetingRecord(meetingDraft)
    if (!id) return

    // 안건은 여기서 같이 보내지 않는다 — 자체 blur 저장(saveAgendaField)이 동시편집 충돌을
    // 감지해서 따로 처리하므로, 여기서 같이 보내면 그 감지를 우회해 덮어쓸 수 있다.
    const res = await fetch('/api/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        title: meetingDraft.title.trim(), meeting_date: meetingDraft.date, meeting_time: meetingDraft.time,
        attendees: joinAttendees(meetingDraft.attendeeNames),
      }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) { setLoadError(json.error ?? '회의록 저장에 실패했습니다.'); return }

    setMeetings(prev => {
      const next = prev.some(m => m.id === json.meeting.id) ? prev.map(m => m.id === json.meeting.id ? json.meeting : m) : [json.meeting, ...prev]
      return next.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
    })
    setMeetingDraft(null)
    setFlash('회의록이 저장되었습니다')
  }

  async function cancelMeetingDraft() {
    // 결정사항 등을 넣느라 레코드는 만들어졌지만 아직 저장(제목 확정)을 안 한 경우엔
    // 목록에 "제목 없음" 회의가 남지 않도록 지운다.
    if (meetingDraft && meetingDraft.id && !meetingDraft.confirmed) {
      const res = await fetch('/api/meetings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: meetingDraft.id }),
      })
      if (!unauthorizedGuard(res)) {
        const removedId = meetingDraft.id
        setMeetings(prev => prev.filter(m => m.id !== removedId))
        if (selectedMeetingId === removedId) setSelectedMeetingId(null)
      }
    }
    setMeetingDraft(null)
  }

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
      setMeetings(prev => prev.map(x => x.id === m.id ? json.meeting : x).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)))
    } else {
      setLoadError(json.error ?? '회의록 저장에 실패했습니다.')
    }
  }

  // ── 안건 동시편집 충돌 감지 ───────────────────────────────────────────
  // 저장 직전에 서버의 현재 안건을 다시 확인해서, 내가 마지막으로 알고 있던 내용(knownAgenda)과
  // 다르면(그 사이 다른 사람이 저장함) 조용히 덮어쓰지 않고 사용자에게 물어본다.
  type AgendaConflict = { meetingId: string; myText: string; serverText: string; target: 'drawer' | 'detail' }
  const [agendaConflict, setAgendaConflict] = useState<AgendaConflict | null>(null)
  // 서랍(드로어)의 안건 입력은 controlled라 타이핑하는 순간 meetingDraft.agenda 자체가 최신 텍스트로
  // 바뀌어버려서 "편집 시작 전 값"을 별도로 들고 있어야 한다. 회의 상세 쪽은 uncontrolled라
  // meetings 상태의 agenda가 그대로 "마지막으로 알고 있던 값" 역할을 하므로 별도 ref가 필요 없다.
  const drawerAgendaBaselineRef = useRef('')

  async function saveAgendaField(meetingId: string, myText: string, knownAgenda: string, target: 'drawer' | 'detail') {
    if (myText === knownAgenda) return // 바뀐 게 없으면 조회/저장 둘 다 스킵
    const checkRes = await fetch(`/api/meetings?id=${meetingId}`)
    if (unauthorizedGuard(checkRes)) return
    const checkJson = await checkRes.json()
    if (!checkJson.ok || !checkJson.meeting) return
    const serverAgenda = checkJson.meeting.agenda as string

    if (serverAgenda !== knownAgenda) {
      setAgendaConflict({ meetingId, myText, serverText: serverAgenda, target })
      return
    }

    const res = await fetch('/api/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: meetingId, agenda: myText }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) { setLoadError(json.error ?? '안건 저장에 실패했습니다.'); return }
    setMeetings(prev => prev.map(x => x.id === meetingId ? json.meeting : x))
    if (target === 'drawer') drawerAgendaBaselineRef.current = myText
  }

  // 충돌 팝업에서 "최신 내용 불러오기"를 고르면 서버 값을 채택하고, "그래도 내 내용으로 저장"을
  // 고르면 그제서야 (사용자가 명시적으로 동의한 뒤) 덮어쓴다.
  function resolveAgendaConflict(choice: 'useServer' | 'overwrite') {
    if (!agendaConflict) return
    const { meetingId, myText, serverText, target } = agendaConflict
    setAgendaConflict(null)
    if (choice === 'useServer') {
      setMeetings(prev => prev.map(x => x.id === meetingId ? { ...x, agenda: serverText } : x))
      if (target === 'drawer') {
        drawerAgendaBaselineRef.current = serverText
        setMeetingDraft(d => d && { ...d, agenda: serverText })
      }
      return
    }
    ;(async () => {
      const res = await fetch('/api/meetings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: meetingId, agenda: myText }),
      })
      if (unauthorizedGuard(res)) return
      const json = await res.json()
      if (!json.ok) { setLoadError(json.error ?? '안건 저장에 실패했습니다.'); return }
      setMeetings(prev => prev.map(x => x.id === meetingId ? json.meeting : x))
      if (target === 'drawer') drawerAgendaBaselineRef.current = myText
    })()
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

  // ── 회의록: 결정사항/액션아이템 ─────────────────────────────────────────
  async function loadMeetingItems(meetingId: string | null) {
    if (!meetingId) { setMeetingItems([]); return }
    const res = await fetch(`/api/meeting-items?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetingItems(json.items)
  }

  // ── 회의록: 팀원별 진행사항 ──────────────────────────────────────────────
  async function loadMeetingProgress(meetingId: string | null) {
    if (!meetingId) { setMeetingProgress([]); return }
    const res = await fetch(`/api/meeting-progress?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetingProgress(json.progress)
  }

  async function saveMemberProgress(meetingId: string, memberId: string, content: string) {
    const current = meetingProgress.find(p => p.meeting_id === meetingId && p.member_id === memberId)
    if ((current?.content ?? '') === content) return
    const res = await fetch('/api/meeting-progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meetingId, member_id: memberId, content }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setMeetingProgress(prev => [...prev.filter(p => !(p.meeting_id === meetingId && p.member_id === memberId)), json.progress])
    }
  }

  // 작성 서랍(일정 탭에서 회의 클릭 시 포함)에서 부른 경우 아직 저장 전 draft일 수 있으므로
  // 그때 레코드를 먼저 만든다 — addMeetingItem과 동일한 패턴.
  async function saveDraftMemberProgress(memberId: string, content: string) {
    const meetingId = meetingDraft ? await ensureMeetingRecord(meetingDraft) : selectedMeetingId
    if (!meetingId) return
    await saveMemberProgress(meetingId, memberId, content)
  }

  // 직전 회의 참고용 — 읽기 전용이라 별도 state에 담는다.
  async function loadPrevMeetingItems(meetingId: string | null) {
    if (!meetingId) { setPrevMeetingItems([]); return }
    const res = await fetch(`/api/meeting-items?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setPrevMeetingItems(json.items)
  }

  async function loadRefItems(meetingId: string | null) {
    if (!meetingId) { setRefItems([]); return }
    const res = await fetch(`/api/meeting-items?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setRefItems(json.items)
  }

  // 참고 패널의 팀원별 진행사항 — 읽기 전용이라 별도 state에 담는다.
  async function loadRefProgress(meetingId: string | null) {
    if (!meetingId) { setRefProgress([]); return }
    const res = await fetch(`/api/meeting-progress?meeting_id=${meetingId}`)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setRefProgress(json.progress)
  }

  async function addMeetingItem(kind: 'decision' | 'action', content: string, owner = '', dueDate = '') {
    if (!content.trim()) return
    // 작성 팝업에서 부른 경우엔 아직 저장 전일 수 있으므로 그때 레코드를 만든다.
    const meetingId = meetingDraft ? await ensureMeetingRecord(meetingDraft) : selectedMeetingId
    if (!meetingId) return
    const res = await fetch('/api/meeting-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meetingId, kind, content: content.trim(), owner, due_date: dueDate || null }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setMeetingItems(prev => [...prev, json.item])
      // 액션아이템은 곧 누군가의 할 일이므로, 따로 📅를 눌러야 하는 수동 연동 없이 바로 일정에 뜨게 한다.
      if (kind === 'action') addActionItemToSchedule(json.item)
    }
  }

  async function toggleMeetingItemDone(item: MeetingItem) {
    setMeetingItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !item.done } : i))
    const res = await fetch('/api/meeting-items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, done: !item.done }),
    })
    if (unauthorizedGuard(res)) return
  }

  async function deleteMeetingItem(item: MeetingItem) {
    setMeetingItems(prev => prev.filter(i => i.id !== item.id))
    const res = await fetch('/api/meeting-items', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    })
    if (unauthorizedGuard(res)) return
  }

  function addActionItemToSchedule(item: MeetingItem) {
    addToSchedule(item.content, item.due_date ?? todayStr(), 'meeting', item.meeting_id, item.owner || author.trim())
  }

  // ── 일정 ──────────────────────────────────────────────────────────────
  async function addToSchedule(title: string, date: string, sourceType: 'item' | 'subtask' | 'meeting', sourceId: string, assignee?: string) {
    const res = await fetch('/api/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, event_date: date, assignee: assignee ?? author.trim(), source_type: sourceType, source_id: sourceId }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setEvents(prev => [...prev, json.event])
      setFlash(`"${title}" 일정에 추가됨`)
    }
  }

  async function saveDraft() {
    if (!draft || !draft.title.trim() || !draft.date || !draft.assignee) return
    const payload = { title: draft.title.trim(), event_date: draft.date, assignee: draft.assignee, tag: draft.tag.trim() || null, note: draft.note }
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
      setFlash(`"${json.holiday.name}" 공휴일이 저장되었습니다`)
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
      setFlash('공휴일이 삭제되었습니다')
    }
  }

  function handleNotificationNavigate(meta: NotificationMeta) {
    if (meta.section && isSection(meta.section)) setSection(meta.section)
    if (meta.date) {
      const [y, m] = meta.date.split('-').map(Number)
      if (y && m) { setCalYear(y); setCalMonthNum(m) }
    }
  }

  function prevMonth() { setCalMonthNum(m => { if (m === 1) { setCalYear(y => y - 1); return 12 } return m - 1 }) }
  function nextMonth() { setCalMonthNum(m => { if (m === 12) { setCalYear(y => y + 1); return 1 } return m + 1 }) }
  function gotoToday() { const [y, m] = todayStr().split('-').map(Number); setCalYear(y); setCalMonthNum(m) }
  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag); else next.add(tag)
      return next
    })
  }

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

  const allTags = useMemo(() => {
    const found = events.map(ev => ev.tag).filter((t): t is string => !!t)
    return Array.from(new Set([...BASE_TAGS, ...found]))
  }, [events])

  const filteredEvents = useMemo(
    () => activeTags.size === 0 ? events : events.filter(ev => ev.tag && activeTags.has(ev.tag)),
    [events, activeTags]
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
  }, [hoveredKey, groups, meetings, allSubtasks, serverToday])

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F7F8F8] text-sm text-gray-400">불러오는 중...</div>
  }

  const SECTION_LABEL: Record<Section, string> = { life: '일상', work: '업무', meetings: '회의록', schedule: '일정', goals: '목표', team: '팀' }
  // 메뉴마다 아주 은은한 색 포인트 하나씩 — 진한 원색 대신 태그/뱃지에도 이미 쓰는 수준의 muted 톤.
  const SECTION_ACCENT: Record<Section, string> = { life: '#4C7FE0', work: '#D97706', meetings: '#7C3AED', schedule: '#059669', goals: '#DB2777', team: '#0891B2' }
  const SECTION_ICON: Record<Section, string> = { life: '🏠', work: '🗂️', meetings: '📝', schedule: '📅', goals: '🎯', team: '👥' }
  const SECTIONS: Section[] = ['life', 'work', 'meetings', 'schedule', 'goals', 'team']

  return (
    <div className="h-screen overflow-hidden bg-[#F7F8F8] flex flex-col">
      {/* ── 상단 메뉴바 ── */}
      <header className="hidden sm:flex items-center h-16 px-6 flex-shrink-0 bg-white border-b border-stone-100">
        <div className="w-full max-w-[80%] mx-auto grid grid-cols-[1fr_auto_1fr] items-center">
          <p className="font-semibold text-gray-900 text-sm justify-self-start">인사관리팀</p>
          <nav className="flex items-center gap-1.5 justify-self-center">
            {SECTIONS.map(s => {
              const accent = SECTION_ACCENT[s]
              const active = section === s
              return (
                <button
                  key={s}
                  onClick={() => setSection(s)}
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
            <NotificationBell onNavigate={handleNotificationNavigate} />
            <ProfileButton fallbackName={author} className="text-[11.5px] text-gray-500 max-w-[140px]" />
            <button onClick={handleChangePassword} className="text-[11.5px] text-gray-400 hover:text-[#4C7FE0]">비밀번호 변경</button>
            <button onClick={handleLogout} className="text-[11.5px] text-gray-400 hover:text-red-500">로그아웃</button>
          </div>
        </div>
      </header>

      {/* ── 업무 그룹 필터 (2단 서브탭) ── */}
      {section === 'work' && (
        <div className="hidden sm:flex h-10 px-6 flex-shrink-0 bg-white border-b border-stone-100">
          <div className="w-full max-w-[80%] mx-auto flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveGroupId(null)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors ${activeGroupId === null ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
            >
              전체
            </button>
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors ${activeGroupId === g.id ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-4 pt-4">
          {/* 모바일 상단 섹션 탭 */}
          <div className="sm:hidden mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSection(s)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full ${section === s ? 'bg-[#4C7FE0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{SECTION_LABEL[s]}</button>
            ))}
          </div>

          {loadError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{loadError}</p>}

          <div className="sm:hidden flex items-center gap-2 text-[11.5px] text-gray-500 mb-2">
            <NotificationBell onNavigate={handleNotificationNavigate} />
            <ProfileButton fallbackName={author} />
            <button onClick={handleChangePassword} className="text-gray-400 hover:text-[#4C7FE0]">비밀번호 변경</button>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">로그아웃</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col w-full max-w-[80%] mx-auto">
        {section === 'meetings' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-2 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-[23px] font-semibold text-[#1F2933]">회의록</h1>
                  <p className="text-[13.5px] text-[#7A8491] mt-1">회의 내용을 기록하고 결정사항과 후속 업무를 관리하세요.</p>
                </div>
                <button
                  onClick={() => openNewMeetingDrawer()}
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
              <div className={`${selectedMeetingId ? 'hidden sm:block' : 'block'} w-full sm:w-[340px] flex-shrink-0 border-r border-[#EEF0F2] overflow-y-auto`}>
                <p className="text-[13px] font-semibold text-[#1F2933] px-4 pt-4 pb-2">최근 회의</p>
                {filteredMeetings.length === 0 ? (
                  <p className="text-[12.5px] text-[#B0B8C1] px-4 py-6">{meetings.length === 0 ? '아직 회의가 없습니다.' : '검색 결과가 없습니다.'}</p>
                ) : (
                  <div>
                    {meetingListRows.map(row => row.kind === 'single' ? (
                      <div
                        key={row.meeting.id}
                        onClick={() => setSelectedMeetingId(row.meeting.id)}
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
                            onClick={() => setSelectedMeetingId(m.id)}
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
                    <button onClick={() => openNewMeetingDrawer()} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2">+ 첫 회의 기록</button>
                  </div>
                ) : (
                  <div className="max-w-[900px] px-5 sm:px-8 py-6 sm:py-8">
                    <button onClick={() => setSelectedMeetingId(null)} className="sm:hidden text-[12.5px] text-[#7A8491] mb-3">‹ 목록</button>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <input
                        key={`mt-title-${selectedMeeting.id}-${selectedMeeting.title}`}
                        defaultValue={selectedMeeting.title}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v && v !== selectedMeeting.title) updateMeetingField(selectedMeeting, { title: v })
                        }}
                        className="flex-1 text-[26px] font-semibold text-[#1F2933] border border-transparent hover:border-[#E5E8EB] focus:border-[#4C7FE0] rounded-md px-2 py-1 -mx-2 focus:outline-none"
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
                          <div className="absolute right-0 top-9 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-28 z-10">
                            <button onClick={() => deleteMeeting(selectedMeeting)} className="w-full text-left text-[12.5px] text-red-500 hover:bg-[#F7F8F8] px-3 py-1.5">삭제</button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-5">
                      <input
                        key={`mt-date-${selectedMeeting.id}-${selectedMeeting.meeting_date}`}
                        type="date" defaultValue={selectedMeeting.meeting_date}
                        onBlur={e => {
                          const v = e.target.value
                          if (v && v !== selectedMeeting.meeting_date) updateMeetingField(selectedMeeting, { meeting_date: v })
                        }}
                        className="text-[12.5px] text-[#7A8491] border border-[#E5E8EB] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#4C7FE0]"
                      />
                      <input
                        key={`mt-time-${selectedMeeting.id}-${selectedMeeting.meeting_time}`}
                        type="time" defaultValue={selectedMeeting.meeting_time}
                        onBlur={e => {
                          const v = e.target.value
                          if (v !== selectedMeeting.meeting_time) updateMeetingField(selectedMeeting, { meeting_time: v })
                        }}
                        className="text-[12.5px] text-[#7A8491] border border-[#E5E8EB] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#4C7FE0]"
                      />
                      <input
                        key={`mt-att-${selectedMeeting.id}-${selectedMeeting.attendees}`}
                        defaultValue={selectedMeeting.attendees}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== selectedMeeting.attendees) updateMeetingField(selectedMeeting, { attendees: v })
                        }}
                        placeholder="참석자 (쉼표로 구분)"
                        className="flex-1 min-w-[180px] text-[12.5px] text-[#7A8491] border border-[#E5E8EB] rounded-md px-2 py-1 focus:outline-none focus:border-[#4C7FE0]"
                      />
                    </div>

                    {showPrevMeeting && previousMeeting && (
                      <div className="mb-5 bg-[#FAFBFB] border border-[#EEF0F2] rounded-xl p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[12.5px] font-semibold text-[#1F2933]">
                            직전 회의 · {previousMeeting.title}
                            <span className="ml-2 font-normal text-[#7A8491]">{fmtMeetingDay(previousMeeting.meeting_date)}</span>
                          </p>
                          <button
                            onClick={() => { setSelectedMeetingId(previousMeeting.id); setShowPrevMeeting(false) }}
                            className="text-[11.5px] text-[#7A8491] hover:text-[#4C7FE0] flex-shrink-0"
                          >
                            이 회의로 이동 →
                          </button>
                        </div>

                        {prevMeetingItems.filter(i => i.kind === 'action' && !i.done).length > 0 && (
                          <div className="mb-3">
                            <p className="text-[11.5px] font-semibold text-[#4B1528] mb-1">미완료 액션아이템</p>
                            <ul className="space-y-1">
                              {prevMeetingItems.filter(i => i.kind === 'action' && !i.done).map(item => (
                                <li key={item.id} className="flex items-center gap-2 text-[12.5px] text-[#3A4249]">
                                  <span className="text-[#B0B8C1]">☐</span>
                                  <span className="flex-1">{item.content}</span>
                                  {item.owner && <span className="text-[11px] text-[#7A8491]">{item.owner}</span>}
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

                        <details>
                          <summary className="text-[11.5px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">안건 펼치기</summary>
                          <p className="mt-2 text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap max-h-[280px] overflow-y-auto">
                            {previousMeeting.agenda || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                          </p>
                        </details>
                      </div>
                    )}

                    <p className="text-[13px] font-semibold text-[#1F2933] mb-2">회의 내용</p>

                    <p className="text-[12px] font-medium text-[#7A8491] mb-1.5">안건</p>
                    <textarea
                      key={`mt-agenda-${selectedMeeting.id}-${selectedMeeting.agenda}`}
                      defaultValue={selectedMeeting.agenda}
                      onBlur={e => {
                        const v = e.target.value
                        if (v !== selectedMeeting.agenda) saveAgendaField(selectedMeeting.id, v, selectedMeeting.agenda, 'detail')
                      }}
                      rows={11}
                      placeholder="이번 회의에서 논의할 안건을 작성해주세요."
                      style={{ minHeight: 260 }}
                      className="w-full text-[14.5px] text-[#3A4249] leading-relaxed border border-[#E5E8EB] rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#4C7FE0] resize-y"
                    />

                    <div className="mt-7">
                      <p className="text-[12px] font-medium text-[#7A8491] mb-2">팀원별 진행사항</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {members.map(mem => {
                          const progress = meetingProgress.find(p => p.member_id === mem.id)
                          return (
                            <div key={mem.id} className="border border-[#E5E8EB] rounded-lg overflow-hidden">
                              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#EEF0F2] bg-[#FAFBFB]">
                                <ClickableAvatar member={profileMemberByName(mem.name)} size={18} />
                                <span className="text-[12.5px] font-medium text-[#1F2933] truncate">{mem.name}</span>
                              </div>
                              <textarea
                                key={`mt-progress-${selectedMeeting.id}-${mem.id}`}
                                defaultValue={progress?.content ?? ''}
                                onBlur={e => saveMemberProgress(selectedMeeting.id, mem.id, e.target.value)}
                                rows={5}
                                style={{ minHeight: 120 }}
                                placeholder="진행사항을 작성해주세요."
                                className="w-full text-[13.5px] text-[#3A4249] leading-relaxed px-3 py-2.5 border-0 focus:outline-none resize-y"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-[#EEF0F2]">
                      <p className="text-[13px] font-semibold text-[#1F2933] mb-2">결정사항</p>
                      {meetingItems.filter(i => i.kind === 'decision').length === 0 && (
                        <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 결정사항이 없습니다.</p>
                      )}
                      <ul className="space-y-1.5 mb-2">
                        {meetingItems.filter(i => i.kind === 'decision').map(item => (
                          <li key={item.id} className="flex items-start gap-2 text-[13.5px] text-[#3A4249] group">
                            <span className="text-[#4C7FE0] flex-shrink-0">•</span>
                            <span className="flex-1">{item.content}</span>
                            <button onClick={() => deleteMeetingItem(item)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                          </li>
                        ))}
                      </ul>
                      <form
                        onSubmit={e => { e.preventDefault(); addMeetingItem('decision', newDecisionText); setNewDecisionText('') }}
                        className="flex gap-1.5"
                      >
                        <input
                          value={newDecisionText} onChange={e => setNewDecisionText(e.target.value)}
                          placeholder="+ 결정사항 추가" className="flex-1 text-[13px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                        />
                      </form>
                    </div>

                    <div className="mt-5">
                      <p className="text-[13px] font-semibold text-[#1F2933] mb-2">액션아이템</p>
                      {meetingItems.filter(i => i.kind === 'action').length === 0 && (
                        <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 액션아이템이 없습니다.</p>
                      )}
                      <ul className="space-y-1.5 mb-2">
                        {meetingItems.filter(i => i.kind === 'action').map(item => (
                          <li key={item.id} className="flex items-center gap-2 text-[13.5px] group">
                            <input type="checkbox" checked={item.done} onChange={() => toggleMeetingItemDone(item)} className="flex-shrink-0" />
                            <span className={`flex-1 ${item.done ? 'line-through text-[#B0B8C1]' : 'text-[#3A4249]'}`}>{item.content}</span>
                            {item.owner && <span className="text-[11px] text-[#7A8491] flex-shrink-0">{item.owner}</span>}
                            {item.due_date && <span className="text-[11px] text-[#7A8491] flex-shrink-0">{fmtDay(item.due_date)}</span>}
                            <button onClick={() => addActionItemToSchedule(item)} title="일정에 추가" className="text-[11px] text-[#B0B8C1] hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 flex-shrink-0">📅</button>
                            <button onClick={() => deleteMeetingItem(item)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-1.5 flex-wrap">
                        <input
                          value={newActionText} onChange={e => setNewActionText(e.target.value)}
                          placeholder="+ 액션아이템" className="flex-1 min-w-[140px] text-[13px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                        />
                        <select value={newActionOwner} onChange={e => setNewActionOwner(e.target.value)} className="text-[13px] border border-[#E5E8EB] rounded-md px-2 py-1.5 bg-white">
                          <option value="">담당자</option>
                          {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                        <input type="date" value={newActionDue} onChange={e => setNewActionDue(e.target.value)} className="text-[13px] border border-[#E5E8EB] rounded-md px-2 py-1.5" />
                        <button
                          onClick={() => { addMeetingItem('action', newActionText, newActionOwner, newActionDue); setNewActionText(''); setNewActionOwner(''); setNewActionDue('') }}
                          className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-3 py-1.5"
                        >
                          추가
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
        <div className={section === 'schedule' ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'flex-1 min-h-0 overflow-y-auto px-4 pb-8'}>
        <div className={section === 'schedule' ? 'contents' : 'w-full space-y-5'}>
          {/* ══ 일상 (쉼터: 한마디·메뉴투표·룰렛·낙서) ══ */}
          {section === 'life' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500">일상 · 쉼터</p>
                <div className="flex items-center gap-2">
                  <Link href="/fun/settings/members" className="text-[11.5px] text-gray-400 hover:text-[#5B54C4]">⚙ 멤버 관리</Link>
                  <Link href="/fun/stats" className="text-[11.5px] text-gray-400 hover:text-[#5B54C4]">📊 기록</Link>
                </div>
              </div>
              <DailyMessage />
              <TeamTree />
              <TeamLottery />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <LunchLadder />
                <div id="fun-roulette">
                  <Roulette />
                </div>
              </div>
              <DoodleBoard />
            </div>
          )}

          {/* ══ 업무 ══ */}
          {section === 'work' && (
            <>
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

              <div className="space-y-4">
                {visibleGroups.map(g => (
                  <div key={g.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
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
                                      {s.content && <p className="text-[12px] text-gray-500 mt-0.5 whitespace-pre-wrap">{s.content}</p>}
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
            </>
          )}

          {/* ══ 일정 ══ */}
          {section === 'schedule' && (
            <>
              {/* 상단 고정 영역 */}
              <div className="flex-shrink-0 px-4 pt-2">
              {/* Page Header */}
              <div className="mb-4">
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-[17px] font-semibold text-[#1F2933]">일정</h1>
                    <p className="text-[12.5px] text-[#7A8491] mt-0.5">팀의 일정을 한눈에 확인하고 관리하세요.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowHolidayManager(p => !p)}
                      className="text-[12.5px] font-medium text-[#BE123C] bg-[#FFE4E6] hover:bg-[#FECDD3] rounded-lg px-3.5 py-2 flex-shrink-0"
                    >
                      🎊 공휴일
                    </button>
                    <button
                      onClick={() => setShowFamilyDayManager(p => !p)}
                      className="text-[12.5px] font-medium text-[#6D28D9] bg-[#EDE9FE] hover:bg-[#DDD6FE] rounded-lg px-3.5 py-2 flex-shrink-0"
                    >
                      🎉 패밀리데이
                    </button>
                    <button
                      onClick={() => setDraft({ id: null, title: '휴가', date: todayStr(), assignee: members[0]?.name ?? '', tag: '휴가', note: '' })}
                      className="text-[12.5px] font-medium text-[#065F46] bg-[#D1FAE5] hover:bg-[#A7F3D0] rounded-lg px-3.5 py-2 flex-shrink-0"
                    >
                      🌴 휴가
                    </button>
                    <button
                      onClick={() => setDraft({ id: null, title: '', date: todayStr(), assignee: members[0]?.name ?? '', tag: '', note: '' })}
                      className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
                    >
                      + 일정
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-1">
                    <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
                    <p className="text-[14px] font-medium text-[#1F2933] w-[104px] text-center">{calYear}년 {calMonthNum}월</p>
                    <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
                  </div>
                  <button onClick={gotoToday} className="text-[12px] text-[#7A8491] hover:text-[#4C7FE0] border border-[#E5E8EB] rounded-md px-2.5 py-1">오늘</button>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-3 border-b border-[#EEF0F2]">
                <div className="flex items-center gap-1.5 flex-wrap">
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
                  <button onClick={() => setShowMemberManager(p => !p)} className="text-[12px] text-[#B0B8C1] hover:text-[#4C7FE0] px-1.5">팀원 관리</button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {allTags.map(tag => (
                    <button
                      key={tag} onClick={() => toggleTag(tag)}
                      className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                        activeTags.has(tag)
                          ? tag === '휴가' ? 'bg-[#D1FAE5] text-[#065F46] font-medium' : 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium'
                          : 'text-[#B0B8C1] hover:bg-black/[0.04]'
                      }`}
                    >
                      {tag === '휴가' ? '🌴 휴가' : tag}
                    </button>
                  ))}
                  {activeTags.size > 0 && (
                    <button onClick={() => setActiveTags(new Set())} className="text-[11px] text-[#B0B8C1] hover:text-[#7A8491]">전체보기</button>
                  )}
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
                <div className="mb-4 bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#6D28D9] mb-2.5">🎉 패밀리데이 날짜 관리</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {familyDays.length === 0 && <span className="text-[11.5px] text-[#A78BFA]">등록된 패밀리데이가 없습니다.</span>}
                    {familyDays.map(f => (
                      <span key={f.id} className="flex items-center gap-1.5 text-[11.5px] text-[#6D28D9] bg-white border border-[#DDD6FE] rounded-lg px-2.5 py-1">
                        🎉 {f.date}
                        <button onClick={() => removeFamilyDay(f.id)} className="text-[#C4B5FD] hover:text-red-400 leading-none">✕</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={addFamilyDay} className="flex items-center gap-2">
                    <input
                      type="date" value={familyDayInput} onChange={e => setFamilyDayInput(e.target.value)}
                      className="text-[12px] border border-[#DDD6FE] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#7C3AED] bg-white"
                    />
                    <button type="submit" className="text-[12px] font-medium text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-lg px-3 py-1.5">추가</button>
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
                <div className="min-w-[720px] bg-white rounded-xl border border-[#EEF0F2] [overflow:clip]">
                    <div className="grid" style={{ gridTemplateColumns: '112px repeat(5, 1fr)' }}>
                      {/* sticky 요일 헤더 — 구조 분리선만 남김 */}
                      <div className="sticky top-0 z-10 h-11 border-b-2 border-[#DCE1E7] bg-[#EEF2FB]" />
                      {WEEKDAYS.map((w, wIdx) => {
                        const headerIsToday = monthWeeks.some(week => week[wIdx] && dateStr(week[wIdx]) === todayStr())
                        return (
                          <div
                            key={w}
                            className={`sticky top-0 z-10 h-11 flex items-center justify-center text-[12.5px] font-semibold border-b-2 border-l border-[#DCE1E7] bg-[#EEF2FB] ${headerIsToday ? 'text-[#4C7FE0]' : 'text-[#3A4249]'}`}
                          >
                            {w}
                          </div>
                        )
                      })}

                      {monthWeeks.map((week, wi) => {
                        const hasCompanyEvent = week.some(d => familyDaySet.has(dateStr(d)) || holidayMap.has(dateStr(d)))
                        return (
                        <Fragment key={wi}>

                          {/* ── 주 구분선 (모든 칸 경계와 무관하게 항상 균일한 1px, 주 시작을 명확히) ── */}
                          {wi > 0 && <div className="col-span-6 h-[2px] bg-[#D8DDE3]" />}

                          {/* ── 날짜 숫자 행 (기본 h-7, 생일/입사기념일 칩 있으면 늘어남, 패밀리데이 표기는 없음) ── */}
                          <div className="min-h-[28px] flex items-center px-3 text-[11px] font-semibold text-[#5B6472] bg-[#EEF2FB] border-t border-[#E2E6EB]">{wi + 1}주</div>
                          {week.map((d, di) => {
                            const isToday = dateStr(d) === todayStr()
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
                            return (
                              <div
                                key={d.toISOString()}
                                className={`min-h-[28px] flex flex-col items-center justify-center gap-1 py-1 text-[12.5px] font-medium text-[#3A4249] border-l border-t border-[#E2E6EB] ${
                                  isToday ? 'bg-[#4C7FE0]/[0.06]' : 'bg-[#EEF2FB]'
                                }`}
                              >
                                {isToday ? (
                                  <span className="inline-flex items-center justify-center min-w-[21px] h-[21px] px-1 rounded-full bg-[#4C7FE0] text-white text-[11px] font-semibold">
                                    {d.getDate()}
                                  </span>
                                ) : d.getDate()}
                                {chips.map(c => (
                                  <span key={c.key} className={`flex items-center gap-0.5 text-[9px] font-medium text-white ${c.color} rounded-full px-1.5 py-[1px] leading-none whitespace-nowrap`}>
                                    {c.text}
                                  </span>
                                ))}
                              </div>
                            )
                          })}

                          {/* ── 인사관리팀 행 ── */}
                          <div className="min-h-[52px] flex items-center px-3 text-[12.5px] font-semibold text-[#1F2933] truncate bg-[#F3FAEA] border-t border-[#E2E6EB]">🏢 인사관리팀</div>
                          {week.map(d => {
                            const ds = dateStr(d)
                            const isToday = ds === todayStr()
                            const isFamilyDay = familyDaySet.has(ds)
                            const holidayName = holidayMap.get(ds)
                            const meetingForDay = meetings.find(m => m.meeting_date === ds)
                            if (isFamilyDay || holidayName) {
                              return (
                                <div
                                  key={`team-${ds}`}
                                  style={{ gridRow: `span ${visibleMembers.length + 1}` }}
                                  className={`border-l border-t border-[#E2E6EB] flex flex-col items-center justify-center gap-2 ${
                                    isFamilyDay ? 'bg-gradient-to-b from-indigo-50 via-indigo-50/40 to-white' : 'bg-gradient-to-b from-rose-50 via-rose-50/40 to-white'
                                  }`}
                                >
                                  <span className="text-[28px] leading-none">{isFamilyDay ? '🎉' : '🎊'}</span>
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-[11px] font-semibold ${isFamilyDay ? 'text-indigo-500' : 'text-rose-500'}`}>{isFamilyDay ? '패밀리데이' : holidayName}</span>
                                    <span className={`text-[8px] tracking-widest font-medium uppercase ${isFamilyDay ? 'text-indigo-300' : 'text-rose-300'}`}>day off</span>
                                  </div>
                                </div>
                              )
                            }
                            return (
                              <div
                                key={`team-${ds}`}
                                onClick={() => meetingForDay ? openEditMeetingDrawer(meetingForDay) : openNewMeetingDrawer(ds)}
                                title={meetingForDay ? '회의록 열기' : '이 날짜로 회의록 작성'}
                                className={`min-h-[52px] flex items-center justify-center px-1.5 py-1.5 border-l border-t border-[#E2E6EB] cursor-pointer hover:bg-[#E9F5D9] ${isToday ? 'bg-[#4C7FE0]/[0.08]' : 'bg-[#F3FAEA]'}`}
                              >
                                {meetingForDay ? (
                                  <span className="text-[11px] font-medium bg-[#E5F3D3] text-[#5C8A38] rounded-full px-2.5 py-1.5 truncate max-w-full">✓ {meetingForDay.title}</span>
                                ) : (
                                  <span className="text-[11px] font-medium text-[#7C8595] hover:text-[#4C7FE0]">+ 회의</span>
                                )}
                              </div>
                            )
                          })}

                          {/* ── 멤버별 행 (패밀리데이 제외, 짝홀 배경 교체) ── */}
                          {visibleMembers.map((mem, memIdx) => {
                            const rowBg = memIdx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFB]'
                            return (
                            <Fragment key={mem.id}>
                              <div className={`min-h-[62px] flex items-center px-3 text-[12.5px] font-medium text-[#3A4249] truncate border-t border-[#EEF0F2] ${rowBg}`}>{mem.name}</div>
                              {week.map(d => {
                                const ds = dateStr(d)
                                const isToday = ds === todayStr()
                                const isFamilyDay = familyDaySet.has(ds)
                                const isHoliday = holidayMap.has(ds)
                                const isBirthday = birthdayMdByName.get(mem.name) === ds.slice(5)
                                const cellEvents = filteredEvents.filter(ev => ev.assignee === mem.name && ev.event_date === ds)
                                const vacationEv = cellEvents.find(ev => ev.tag === '휴가')
                                const otherEvents = cellEvents.filter(ev => ev.tag !== '휴가')
                                // 패밀리데이/공휴일 컬럼은 팀 행의 spanning 셀이 커버 — 렌더 스킵
                                if (isFamilyDay || isHoliday) return null
                                return (
                                  <div
                                    key={ds}
                                    onClick={() => setDraft({ id: null, title: '', date: ds, assignee: mem.name, tag: '', note: '' })}
                                    className={`min-h-[62px] cursor-pointer relative px-1.5 py-1.5 space-y-1 border-l border-t border-[#EEF0F2] ${
                                      vacationEv
                                        ? 'bg-[#ECFDF5] hover:bg-[#D1FAE5]'
                                        : isToday
                                          ? 'bg-[#4C7FE0]/[0.04] hover:bg-[#F0F2FF]'
                                          : `${rowBg} hover:bg-[#F0F2FF]`
                                    }`}
                                  >
                                    {isBirthday && (
                                      <span className="absolute top-0.5 right-0.5 text-[13px] leading-none" title={`${mem.name}님 생일`}>🎂</span>
                                    )}
                                    {vacationEv ? (
                                      <div
                                        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
                                        onClick={e => { e.stopPropagation(); setDraft({ id: vacationEv.id, title: vacationEv.title, date: vacationEv.event_date, assignee: vacationEv.assignee, tag: vacationEv.tag ?? '', note: vacationEv.note }) }}
                                      >
                                        <span className="text-[18px] leading-none">🌴</span>
                                        <span className="text-[10px] font-semibold text-[#059669] mt-0.5">휴가</span>
                                      </div>
                                    ) : (
                                      otherEvents.map(ev => (
                                        <div
                                          key={ev.id}
                                          onClick={e => { e.stopPropagation(); setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note }) }}
                                          className="text-[11px] font-medium rounded-md px-2 py-1.5 truncate leading-tight bg-[#EEF1FE] text-[#33499E] border border-[#4C7FE0]/[0.08]"
                                        >
                                          {ev.tag && <span className="font-semibold">[{ev.tag}] </span>}{ev.title}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )
                              })}
                            </Fragment>
                            )
                          })}
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
                        onClick={() => setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note })}
                        className="bg-white rounded-lg border border-[#EEF0F2] px-3 py-2 text-[12px] text-[#7A8491] cursor-pointer hover:bg-[#F7F8F8]"
                      >
                        {fmtDay(ev.event_date)} · {ev.title} {ev.assignee && <span className="text-[#B0B8C1]">({ev.assignee})</span>}
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

          {/* ══ 팀 ══ */}
          {section === 'team' && <TeamPersona />}
        </div>
        </div>
        )}
        </div>
      </main>

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
            <input
              value={draft.tag} onChange={e => setDraft(d => d && { ...d, tag: e.target.value })} list="tag-suggestions"
              placeholder="태그 (예: 중간보고)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <datalist id="tag-suggestions">{allTags.map(t => <option key={t} value={t} />)}</datalist>
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

      {meetingDraft && (
        <div className="fixed inset-0 bg-black/10 z-50" onClick={cancelMeetingDraft}>
          <div onClick={e => e.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-[1280px] bg-white shadow-lg rounded-l-2xl flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-[#EEF0F2]">
              <p className="text-[15px] font-semibold text-[#1F2933]">{meetingDraft.id ? '회의 수정' : '새 회의'}</p>
              <button onClick={cancelMeetingDraft} className="text-[#B0B8C1] hover:text-[#1F2933] text-lg leading-none">×</button>
            </div>

            <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4 border-r border-[#EEF0F2]">
              <div>
                <label className="block text-[12px] text-[#7A8491] mb-1.5">회의 제목</label>
                <input
                  value={meetingDraft.title} onChange={e => setMeetingDraft(d => d && { ...d, title: e.target.value })}
                  autoFocus className="w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0]"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[12px] text-[#7A8491] mb-1.5">날짜</label>
                  <input
                    type="date" value={meetingDraft.date} onChange={e => setMeetingDraft(d => d && { ...d, date: e.target.value })}
                    className="w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[12px] text-[#7A8491] mb-1.5">시간</label>
                  <input
                    type="time" value={meetingDraft.time} onChange={e => setMeetingDraft(d => d && { ...d, time: e.target.value })}
                    className="w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] text-[#7A8491] mb-1.5">참석자</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {meetingDraft.attendeeNames.map(name => (
                    <span key={name} className="text-[12px] text-[#3A4249] bg-[#F0F1F3] rounded-md px-2 py-1 flex items-center gap-1">
                      {name}
                      <button onClick={() => setMeetingDraft(d => d && { ...d, attendeeNames: d.attendeeNames.filter(n => n !== name) })} className="text-[#B0B8C1] hover:text-red-500">✕</button>
                    </span>
                  ))}
                  {members.filter(m => !meetingDraft.attendeeNames.includes(m.name)).length > 0 && (
                    <select
                      value=""
                      onChange={e => { const v = e.target.value; if (v) setMeetingDraft(d => d && { ...d, attendeeNames: [...d.attendeeNames, v] }) }}
                      className="text-[12px] border border-dashed border-[#D3D8DD] rounded-md px-2 py-1 bg-white text-[#7A8491]"
                    >
                      <option value="">+ 추가</option>
                      {members.filter(m => !meetingDraft.attendeeNames.includes(m.name)).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[12px] text-[#7A8491] mb-1.5">안건</label>
                <textarea
                  value={meetingDraft.agenda} onChange={e => setMeetingDraft(d => d && { ...d, agenda: e.target.value })}
                  onBlur={e => {
                    if (!meetingDraft.id) return // 아직 저장 전 새 초안이면 비교할 서버 값이 없다 — "저장" 시 같이 생성된다
                    const v = e.target.value
                    if (v !== drawerAgendaBaselineRef.current) saveAgendaField(meetingDraft.id, v, drawerAgendaBaselineRef.current, 'drawer')
                  }}
                  rows={10} className="w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0] resize-none"
                />
              </div>

              <div>
                <label className="block text-[12px] text-[#7A8491] mb-2">팀원별 진행사항</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {members.map(mem => {
                    const progress = meetingProgress.find(p => p.member_id === mem.id)
                    return (
                      <div key={mem.id} className="border border-[#E5E8EB] rounded-lg overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#EEF0F2] bg-[#FAFBFB]">
                          <ClickableAvatar member={profileMemberByName(mem.name)} size={18} />
                          <span className="text-[12.5px] font-medium text-[#1F2933] truncate">{mem.name}</span>
                        </div>
                        <textarea
                          key={`draft-progress-${meetingDraft.id ?? 'new'}-${mem.id}`}
                          defaultValue={progress?.content ?? ''}
                          onBlur={e => saveDraftMemberProgress(mem.id, e.target.value)}
                          rows={4}
                          style={{ minHeight: 96 }}
                          placeholder="진행사항을 작성해주세요."
                          className="w-full text-[13px] text-[#3A4249] leading-relaxed px-3 py-2 border-0 focus:outline-none resize-y"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[#EEF0F2]">
                    <p className="text-[12px] font-semibold text-[#1F2933] mb-2">결정사항</p>
                    <ul className="space-y-1.5 mb-2">
                      {meetingItems.filter(i => i.kind === 'decision').map(item => (
                        <li key={item.id} className="flex items-start gap-2 text-[13.5px] text-[#3A4249] group">
                          <span className="text-[#4C7FE0] flex-shrink-0">•</span>
                          <span className="flex-1">{item.content}</span>
                          <button onClick={() => deleteMeetingItem(item)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                        </li>
                      ))}
                    </ul>
                    <form
                      onSubmit={e => { e.preventDefault(); addMeetingItem('decision', newDecisionText); setNewDecisionText('') }}
                      className="flex gap-1.5"
                    >
                      <input
                        value={newDecisionText} onChange={e => setNewDecisionText(e.target.value)}
                        placeholder="+ 결정사항 추가" className="flex-1 text-[13px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                      />
                    </form>
                  </div>

                  <div>
                    <p className="text-[12px] font-semibold text-[#1F2933] mb-2">액션아이템</p>
                    <ul className="space-y-1.5 mb-2">
                      {meetingItems.filter(i => i.kind === 'action').map(item => (
                        <li key={item.id} className="flex items-center gap-2 text-[13.5px] group">
                          <input type="checkbox" checked={item.done} onChange={() => toggleMeetingItemDone(item)} className="flex-shrink-0" />
                          <span className={`flex-1 ${item.done ? 'line-through text-[#B0B8C1]' : 'text-[#3A4249]'}`}>{item.content}</span>
                          {item.owner && <span className="text-[11px] text-[#7A8491] flex-shrink-0">{item.owner}</span>}
                          {item.due_date && <span className="text-[11px] text-[#7A8491] flex-shrink-0">{fmtDay(item.due_date)}</span>}
                          <button onClick={() => addActionItemToSchedule(item)} title="일정에 추가" className="text-[11px] text-[#B0B8C1] hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 flex-shrink-0">📅</button>
                          <button onClick={() => deleteMeetingItem(item)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-1.5 flex-wrap">
                      <input
                        value={newActionText} onChange={e => setNewActionText(e.target.value)}
                        placeholder="+ 액션아이템" className="flex-1 min-w-[100px] text-[13px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                      />
                      <select value={newActionOwner} onChange={e => setNewActionOwner(e.target.value)} className="text-[13px] border border-[#E5E8EB] rounded-md px-2 py-1.5 bg-white">
                        <option value="">담당자</option>
                        {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                      <input type="date" value={newActionDue} onChange={e => setNewActionDue(e.target.value)} className="text-[13px] border border-[#E5E8EB] rounded-md px-2 py-1.5" />
                      <button
                        onClick={() => { addMeetingItem('action', newActionText, newActionOwner, newActionDue); setNewActionText(''); setNewActionOwner(''); setNewActionDue('') }}
                        className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-3 py-1.5"
                      >
                        추가
                      </button>
                    </div>
              </div>
            </div>

            {/* ── 오른쪽: 참고 패널 (기본 직전 회의, 날짜로 이동 가능) ── */}
            <aside className="hidden lg:flex w-[420px] flex-shrink-0 flex-col bg-[#FAFBFB]">
              <div className="flex-shrink-0 px-4 py-3 border-b border-[#EEF0F2]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[12.5px] font-semibold text-[#1F2933]">참고 · 지난 회의</p>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        const others = meetingSeriesPool(meetings, draftTitle, draftMeetingId).filter(m => m.id !== draftMeetingId)
                        const i = others.findIndex(m => m.id === refMeetingId)
                        const next = i === -1 ? others[0] : others[i + 1]
                        if (next) { setRefMeetingId(next.id); setRefMissingDate('') }
                      }}
                      title="더 이전 회의"
                      className="w-6 h-6 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded hover:bg-black/[0.04]"
                    >‹</button>
                    <button
                      onClick={() => {
                        const others = meetingSeriesPool(meetings, draftTitle, draftMeetingId).filter(m => m.id !== draftMeetingId)
                        const i = others.findIndex(m => m.id === refMeetingId)
                        const next = i <= 0 ? null : others[i - 1]
                        if (next) { setRefMeetingId(next.id); setRefMissingDate('') }
                      }}
                      title="더 최근 회의"
                      className="w-6 h-6 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded hover:bg-black/[0.04]"
                    >›</button>
                  </div>
                </div>
                <input
                  type="date"
                  value={refMissingDate || refMeeting?.meeting_date || ''}
                  onChange={e => {
                    const v = e.target.value
                    const found = meetingSeriesPool(meetings, draftTitle, draftMeetingId).find(m => m.meeting_date === v && m.id !== draftMeetingId)
                    if (found) { setRefMeetingId(found.id); setRefMissingDate('') }
                    else { setRefMeetingId(null); setRefMissingDate(v) }
                  }}
                  className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-[#4C7FE0]"
                />
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {!refMeeting ? (
                  <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center">
                    {refMissingDate ? `${refMissingDate}에는 회의가 없습니다.` : '참고할 지난 회의가 없습니다.'}
                  </p>
                ) : (
                  <>
                    <p className="text-[13.5px] font-semibold text-[#1F2933]">{refMeeting.title}</p>
                    <p className="text-[11.5px] text-[#7A8491] mt-0.5 mb-3">
                      {fmtMeetingDay(refMeeting.meeting_date)}{refMeeting.meeting_time && ` · ${refMeeting.meeting_time}`}
                      {refMeeting.attendees && ` · ${refMeeting.attendees}`}
                    </p>

                    <p className="text-[11.5px] font-semibold text-[#1F2933] mb-2">팀원별 진행사항</p>
                    <div className="space-y-2.5 mb-4">
                      {members.map(mem => {
                        const progress = refProgress.find(p => p.member_id === mem.id)
                        return (
                          <div key={mem.id} className="border border-[#E5E8EB] rounded-lg overflow-hidden">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[#EEF0F2] bg-[#FAFBFB]">
                              <ClickableAvatar member={profileMemberByName(mem.name)} size={16} />
                              <span className="text-[12px] font-medium text-[#1F2933] truncate">{mem.name}</span>
                            </div>
                            <p className="text-[12px] text-[#3A4249] leading-relaxed whitespace-pre-wrap px-2.5 py-2">
                              {progress?.content || <span className="text-[#B0B8C1]">작성 없음</span>}
                            </p>
                          </div>
                        )
                      })}
                    </div>

                    <details className="mb-4">
                      <summary className="text-[11.5px] font-semibold text-[#1F2933] cursor-pointer">안건</summary>
                      <p className="text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap mt-2">
                        {refMeeting.agenda || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                      </p>
                    </details>

                    {refItems.filter(i => i.kind === 'action' && !i.done).length > 0 && (
                      <div className="mb-3">
                        <p className="text-[11.5px] font-semibold text-[#4B1528] mb-1">미완료 액션아이템</p>
                        <ul className="space-y-1">
                          {refItems.filter(i => i.kind === 'action' && !i.done).map(item => (
                            <li key={item.id} className="flex items-start gap-1.5 text-[12.5px] text-[#3A4249]">
                              <span className="text-[#B0B8C1] flex-shrink-0">☐</span>
                              <span className="flex-1">{item.content}</span>
                              {item.owner && <span className="text-[11px] text-[#7A8491] flex-shrink-0">{item.owner}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {refItems.filter(i => i.kind === 'decision').length > 0 && (
                      <div className="mb-3">
                        <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1">결정사항</p>
                        <ul className="space-y-1">
                          {refItems.filter(i => i.kind === 'decision').map(item => (
                            <li key={item.id} className="flex items-start gap-1.5 text-[12.5px] text-[#3A4249]">
                              <span className="text-[#4C7FE0] flex-shrink-0">•</span>
                              <span className="flex-1">{item.content}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
            </div>

            <div className="flex-shrink-0 flex items-center gap-2 px-5 py-4 border-t border-[#EEF0F2]">
              <button onClick={saveMeetingDraft} className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-4 py-2">회의록 저장</button>
              <button onClick={cancelMeetingDraft} className="text-[13px] font-medium text-[#7A8491] px-4 py-2">취소</button>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className="fixed bottom-5 right-5 bg-gray-900 text-white text-[12.5px] px-4 py-2.5 rounded-lg shadow-lg z-50">
          {flash}
        </div>
      )}

      {agendaConflict && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center px-4" onClick={() => setAgendaConflict(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[560px] max-h-[85vh] overflow-y-auto p-5">
            <p className="text-[15px] font-semibold text-[#1F2933] mb-1">안건이 그 사이 다른 분에 의해 저장됐습니다</p>
            <p className="text-[12.5px] text-[#7A8491] mb-4">누구 내용으로 저장할지 골라주세요. 그냥 두면 아무것도 저장되지 않습니다.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="border border-[#E5E8EB] rounded-lg p-3">
                <p className="text-[11.5px] font-semibold text-[#4C7FE0] mb-1.5">최신(서버) 내용</p>
                <p className="text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap max-h-[240px] overflow-y-auto">
                  {agendaConflict.serverText || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                </p>
              </div>
              <div className="border border-[#E5E8EB] rounded-lg p-3">
                <p className="text-[11.5px] font-semibold text-[#7A8491] mb-1.5">내가 쓰던 내용</p>
                <p className="text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap max-h-[240px] overflow-y-auto">
                  {agendaConflict.myText || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => resolveAgendaConflict('useServer')} className="text-[12.5px] font-medium text-[#7A8491] hover:text-[#1F2933] px-3.5 py-2 rounded-lg hover:bg-black/[0.04]">
                최신 내용 불러오기
              </button>
              <button onClick={() => resolveAgendaConflict('overwrite')} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2">
                그래도 내 내용으로 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
