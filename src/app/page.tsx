'use client'

// team-log — 팀원들이 비밀번호로 접근하는 독립 앱. jin-dashboard와는 별도
// 저장소/배포이며, 공유하는 것은 같은 Supabase 프로젝트뿐 (테이블은 team_log_*로 격리).
// 좌측 메뉴로 일상(자유메모)/업무(그룹→항목→서브태스크)/회의록/일정 4개 섹션을 오간다.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import GoalsPanel from '@/components/goals/GoalsPanel'
import DailyMessage from '@/components/DailyMessage'
import MenuVote from '@/components/MenuVote'
import Roulette from '@/components/Roulette'
import DoodleBoard from '@/components/DoodleBoard'

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
type Meeting = { id: string; title: string; meeting_date: string; meeting_time: string; attendees: string; content: string; created_at: string }
type MeetingDraft = { id: string | null; title: string; date: string; time: string; attendeeNames: string[]; content: string; confirmed: boolean }
type MeetingFilter = '전체' | '내회의' | '이번주' | '이번달'
type MeetingItem = { id: string; meeting_id: string; kind: 'decision' | 'action'; content: string; owner: string; due_date: string | null; done: boolean; sort_order: number; created_at: string }
type ScheduleEvent = {
  id: string; title: string; event_date: string; note: string; assignee: string; tag: string | null
  source_type: 'item' | 'subtask' | 'meeting' | null; source_id: string | null; created_at: string
}
type Member = { id: string; name: string; sort_order: number }
type EventDraft = { id: string | null; title: string; date: string; assignee: string; tag: string; note: string }
type FamilyDay = { id: string; date: string; note: string; created_at: string }
type Section = 'life' | 'work' | 'meetings' | 'schedule' | 'goals'

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

function todayStr() {
  return dateStr(new Date())
}

function fmtDay(s: string) {
  try {
    const d = parseISO(s)
    if (isToday(d)) return '오늘'
    if (isYesterday(d)) return '어제'
    return format(d, 'M.d (E)', { locale: ko })
  } catch { return s }
}

export default function TeamLogPage() {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [section, setSection] = useState<Section>('life')
  const [author, setAuthor] = useState('')
  const [loadError, setLoadError] = useState('')

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
  const mtNow = new Date()
  const [meetingYear, setMeetingYear] = useState(mtNow.getFullYear())
  const [meetingMonth, setMeetingMonth] = useState(mtNow.getMonth() + 1)
  const [meetingItems, setMeetingItems] = useState<MeetingItem[]>([])
  const [newDecisionText, setNewDecisionText] = useState('')
  const [newActionText, setNewActionText] = useState('')
  const [newActionOwner, setNewActionOwner] = useState('')
  const [newActionDue, setNewActionDue] = useState('')

  // ── 일정 ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [newMemberName, setNewMemberName] = useState('')
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
    setSidebarCollapsed(localStorage.getItem('hrmSidebarCollapsed') === '1')
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('hrmSidebarCollapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    loadMeetingItems(selectedMeetingId)
  }, [selectedMeetingId])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2200)
    return () => clearTimeout(t)
  }, [flash])

  async function loadAll() {
    try {
      const [treeRes, meetingsRes, scheduleRes, membersRes, familyDaysRes] = await Promise.all([
        fetch('/api/tree'), fetch('/api/meetings'),
        fetch('/api/schedule'), fetch('/api/members'), fetch('/api/family-days'),
      ])
      if (treeRes.status === 401) { router.push('/login'); return }
      const [treeJson, meetingsJson, scheduleJson, membersJson, familyDaysJson] = await Promise.all([
        treeRes.json(), meetingsRes.json(), scheduleRes.json(), membersRes.json(), familyDaysRes.json(),
      ])
      if (!treeJson.ok) { setLoadError(treeJson.error ?? '불러오기 실패'); setLoaded(true); return }
      setGroups(treeJson.groups)
      if (meetingsJson.ok) {
        setMeetings(meetingsJson.meetings)
        if (meetingsJson.meetings.length > 0) setSelectedMeetingId(meetingsJson.meetings[0].id)
      }
      if (scheduleJson.ok) setEvents(scheduleJson.events)
      if (membersJson.ok) setMembers(membersJson.members)
      if (familyDaysJson.ok) setFamilyDays(familyDaysJson.days)
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
    const form = subForm[item.id] ?? { ...EMPTY_SUB_FORM, date: todayStr() }
    if (!author.trim() || !form.title.trim()) return
    const res = await fetch('/api/subtasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, author: author.trim(), entry_type: form.type, entry_date: form.date, title: form.title.trim(), content: form.content }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === item.id ? { ...i, subtasks: [...i.subtasks, json.subtask] } : i) })))
      setSubForm(prev => ({ ...prev, [item.id]: { ...EMPTY_SUB_FORM, date: todayStr() } }))
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
  function gotoMeetingToday() { const d = new Date(); setMeetingYear(d.getFullYear()); setMeetingMonth(d.getMonth() + 1) }

  function selectMeetingFilter(f: MeetingFilter) {
    setMeetingFilter(f)
    if (f === '이번달') {
      const d = new Date()
      setMeetingYear(d.getFullYear())
      setMeetingMonth(d.getMonth() + 1)
    }
  }

  // 팝업을 열자마자 임시 회의 레코드를 바로 만들어서, "회의록 저장"을 누르기 전에도
  // 결정사항/액션아이템을 즉시 추가할 수 있게 한다. confirmed=false인 동안 취소하면
  // 이 임시 레코드를 지운다 — 제목도 안 채운 빈 회의가 목록에 계속 남지 않도록.
  async function openNewMeetingDrawer(date: string = todayStr()) {
    const res = await fetch('/api/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '제목 없음', meeting_date: date, meeting_time: '', attendees: '', content: buildDefaultMeetingContent() }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) return
    setSelectedMeetingId(json.meeting.id)
    setMeetingDraft({ id: json.meeting.id, title: '', date, time: '', attendeeNames: [], content: json.meeting.content, confirmed: false })
  }

  function openEditMeetingDrawer(m: Meeting) {
    setMeetingMenuOpen(false)
    setMeetingDraft({ id: m.id, title: m.title, date: m.meeting_date, time: m.meeting_time, attendeeNames: parseAttendees(m.attendees), content: m.content, confirmed: true })
  }

  async function saveMeetingDraft() {
    if (!meetingDraft || !meetingDraft.id || !meetingDraft.title.trim() || !meetingDraft.date) return
    const payload = {
      id: meetingDraft.id,
      title: meetingDraft.title.trim(), meeting_date: meetingDraft.date, meeting_time: meetingDraft.time,
      attendees: joinAttendees(meetingDraft.attendeeNames), content: meetingDraft.content,
    }
    // 저장한 회의의 날짜가 지금 보고 있는 월과 다르면, 목록에서 바로 보이도록 그 월로 이동한다
    const savedDate = new Date(meetingDraft.date)
    setMeetingYear(savedDate.getFullYear())
    setMeetingMonth(savedDate.getMonth() + 1)

    const res = await fetch('/api/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (!json.ok) return

    setMeetings(prev => {
      const next = prev.some(m => m.id === json.meeting.id) ? prev.map(m => m.id === json.meeting.id ? json.meeting : m) : [json.meeting, ...prev]
      return next.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
    })

    if (meetingDraft.confirmed) {
      setMeetingDraft(null)
    } else {
      // 첫 확정 저장 — 팝업은 계속 열어둬서 결정사항/액션아이템을 이어서 넣을 수 있게 한다.
      setMeetingDraft(d => d && { ...d, confirmed: true })
    }
  }

  async function cancelMeetingDraft() {
    if (meetingDraft && meetingDraft.id && !meetingDraft.confirmed) {
      const res = await fetch('/api/meetings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: meetingDraft.id }),
      })
      if (!unauthorizedGuard(res)) {
        if (selectedMeetingId === meetingDraft.id) setSelectedMeetingId(null)
      }
    }
    setMeetingDraft(null)
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

  async function addMeetingItem(kind: 'decision' | 'action', content: string, owner = '', dueDate = '') {
    if (!selectedMeetingId || !content.trim()) return
    const res = await fetch('/api/meeting-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: selectedMeetingId, kind, content: content.trim(), owner, due_date: dueDate || null }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetingItems(prev => [...prev, json.item])
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

  // ── 회의록: 기본 템플릿 ──────────────────────────────────────────────────
  // 구조를 바꾸고 싶으면 이 함수만 고치면 된다 (팀원 목록은 항상 런타임에 읽어서
  // 개별안건 섹션을 만들기 때문에, 멤버가 추가/삭제돼도 코드를 다시 손댈 필요가 없다).
  function buildDefaultMeetingContent() {
    const individualSections = members.map(m => `### ${m.name}\n`).join('\n')
    return [
      '## 공통안건',
      '- ',
      '',
      '## 개별안건',
      individualSections,
      '## 회의정리',
      '### 의사결정한 사항',
      '- ',
      '',
      '### 향후 논의 필요한 사항',
      '- ',
      '',
    ].join('\n')
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
    }
  }

  async function removeFamilyDay(id: string) {
    const res = await fetch('/api/family-days', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    const json = await res.json()
    if (json.ok) setFamilyDays(prev => prev.filter(f => f.id !== id))
  }

  function prevMonth() { setCalMonthNum(m => { if (m === 1) { setCalYear(y => y - 1); return 12 } return m - 1 }) }
  function nextMonth() { setCalMonthNum(m => { if (m === 12) { setCalYear(y => y + 1); return 1 } return m + 1 }) }
  function gotoToday() { const d = new Date(); setCalYear(d.getFullYear()); setCalMonthNum(d.getMonth() + 1) }
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
  }, [allSubtasks])
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

  const unassignedEvents = useMemo(
    () => filteredEvents.filter(ev => !members.some(m => m.name === ev.assignee)),
    [filteredEvents, members]
  )

  const visibleMembers = selectedMember ? members.filter(m => m.name === selectedMember) : members

  const filteredMeetings = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase()
    const today = new Date()
    const weekStart = dateStr(startOfWeek(today))
    const weekEnd = dateStr(new Date(startOfWeek(today).getTime() + 6 * 86400000))
    const browsedMonthPrefix = `${meetingYear}-${String(meetingMonth).padStart(2, '0')}`
    return meetings.filter(m => {
      if (q && !(m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.attendees.toLowerCase().includes(q))) return false
      // '이번주'는 지금 보고 있는 월과 무관하게 실제 이번주만 본다 (월 네비게이션 무시)
      if (meetingFilter === '이번주') return m.meeting_date >= weekStart && m.meeting_date <= weekEnd
      // 그 외에는 항상 현재 탐색 중인 월을 기준으로 좁힌다
      if (!m.meeting_date.startsWith(browsedMonthPrefix)) return false
      if (meetingFilter === '내회의' && !m.attendees.includes(author)) return false
      return true
    })
  }, [meetings, meetingSearch, meetingFilter, meetingYear, meetingMonth, author])

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
  }, [hoveredKey, groups, meetings, allSubtasks])

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F7F8F8] text-sm text-gray-400">불러오는 중...</div>
  }

  const SECTION_LABEL: Record<Section, string> = { life: '일상', work: '업무', meetings: '회의록', schedule: '일정', goals: '목표' }
  const SECTIONS: Section[] = ['life', 'work', 'meetings', 'schedule', 'goals']

  return (
    <div className="h-screen overflow-hidden bg-[#F7F8F8] flex">
      {/* ── 좌측 메뉴 ── */}
      {sidebarCollapsed ? (
        <button
          onClick={toggleSidebar}
          title="메뉴 열기"
          className="hidden sm:flex fixed top-4 left-4 z-50 w-8 h-8 items-center justify-center rounded-lg bg-white border border-stone-200 text-gray-400 hover:text-[#4C7FE0] hover:border-[#4C7FE0]/40 shadow-sm"
        >
          ☰
        </button>
      ) : (
      <aside className="hidden sm:flex flex-col w-[190px] flex-shrink-0 bg-white border-r border-stone-100 h-screen p-4">
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="font-semibold text-gray-900 text-sm">인사관리팀</p>
          <button onClick={toggleSidebar} title="메뉴 접기" className="text-gray-300 hover:text-gray-500 text-xs px-1">‹</button>
        </div>
        <nav className="space-y-0.5 flex-1">
          {SECTIONS.map(s => (
            <div key={s}>
              <button
                onClick={() => setSection(s)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors ${section === s ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {SECTION_LABEL[s]}
              </button>
              {s === 'work' && section === 'work' && (
                <div className="ml-2 mt-0.5 mb-1 space-y-0.5 border-l border-stone-100 pl-2">
                  <button
                    onClick={() => setActiveGroupId(null)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] transition-colors ${activeGroupId === null ? 'text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    전체
                  </button>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setActiveGroupId(g.id)}
                      className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-[12.5px] transition-colors ${activeGroupId === g.id ? 'text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                      <span className="truncate">{g.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-stone-100 pt-3 px-1">
          <p className="text-[11.5px] text-gray-500 truncate mb-1.5">{author}</p>
          <div className="flex items-center gap-2">
            <button onClick={handleChangePassword} className="text-[11.5px] text-gray-400 hover:text-[#4C7FE0]">비밀번호 변경</button>
            <button onClick={handleLogout} className="text-[11.5px] text-gray-400 hover:text-red-500">로그아웃</button>
          </div>
        </div>
      </aside>
      )}

      <main className="flex-1 min-w-0 h-screen overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-4 pt-4">
          {/* 모바일 상단 섹션 탭 */}
          <div className="sm:hidden mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSection(s)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full ${section === s ? 'bg-[#4C7FE0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{SECTION_LABEL[s]}</button>
            ))}
          </div>

          {loadError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{loadError}</p>}

          <div className="sm:hidden flex items-center gap-2 text-[11.5px] text-gray-500 mb-2">
            <span>{author}</span>
            <button onClick={handleChangePassword} className="text-gray-400 hover:text-[#4C7FE0]">비밀번호 변경</button>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">로그아웃</button>
          </div>
        </div>

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
                    {filteredMeetings.map(m => (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMeetingId(m.id)}
                        onMouseEnter={() => setHoveredKey(`meeting:${m.id}`)}
                        onMouseLeave={() => setHoveredKey(null)}
                        className={`px-4 py-3 cursor-pointer border-l-2 transition-colors ${selectedMeetingId === m.id ? 'bg-[#4C7FE0]/[0.06] border-l-[#4C7FE0]' : 'border-l-transparent hover:bg-[#F7F8F8]'}`}
                      >
                        <p className="text-[14px] font-semibold text-[#1F2933] truncate">{m.title}</p>
                        <p className="text-[12px] text-[#7A8491] mt-1">
                          {fmtMeetingDay(m.meeting_date)}{m.meeting_time && ` · ${m.meeting_time}`}
                        </p>
                        {m.attendees && <p className="text-[12px] text-[#B0B8C1] mt-0.5 truncate">{m.attendees}</p>}
                        {m.content && <p className="text-[12px] text-[#B0B8C1] mt-1 truncate">{m.content}</p>}
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
                  <div className="max-w-[720px] px-5 sm:px-8 py-6 sm:py-8">
                    <button onClick={() => setSelectedMeetingId(null)} className="sm:hidden text-[12.5px] text-[#7A8491] mb-3">‹ 목록</button>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h2 className="text-[26px] font-semibold text-[#1F2933]">{selectedMeeting.title}</h2>
                      <div className="flex items-center gap-1 flex-shrink-0 relative">
                        <button onClick={() => openEditMeetingDrawer(selectedMeeting)} className="text-[12.5px] text-[#7A8491] hover:text-[#1F2933] px-2 py-1 rounded-md hover:bg-black/[0.04]">편집</button>
                        <button onClick={() => setMeetingMenuOpen(p => !p)} className="text-[14px] text-[#7A8491] hover:text-[#1F2933] px-2 py-1 rounded-md hover:bg-black/[0.04]">···</button>
                        {meetingMenuOpen && (
                          <div className="absolute right-0 top-9 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-28 z-10">
                            <button onClick={() => deleteMeeting(selectedMeeting)} className="w-full text-left text-[12.5px] text-red-500 hover:bg-[#F7F8F8] px-3 py-1.5">삭제</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] text-[#7A8491] mb-6">
                      {fmtMeetingDay(selectedMeeting.meeting_date)}{selectedMeeting.meeting_time && ` ${selectedMeeting.meeting_time}`}
                      {selectedMeeting.attendees && <> · {selectedMeeting.attendees}</>}
                    </p>

                    <p className="text-[13px] font-semibold text-[#1F2933] mb-2">회의 내용</p>
                    <p className="text-[14.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap">
                      {selectedMeeting.content || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                    </p>

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
        <div className={section === 'schedule' ? 'contents' : section === 'goals' ? 'w-full max-w-[1900px] space-y-5' : section === 'life' ? 'w-full max-w-[1100px] space-y-5' : 'mx-auto max-w-2xl space-y-5'}>
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <MenuVote />
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
                        const form = subForm[item.id] ?? { ...EMPTY_SUB_FORM, date: todayStr() }
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

                                <form onSubmit={e => handleAddSubtask(item, e)} className="space-y-1.5 pt-1">
                                  <div className="flex gap-1.5">
                                    <select value={form.type} onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, type: e.target.value as '업무기록' | '보고일정' } }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]">
                                      <option value="업무기록">업무기록</option>
                                      <option value="보고일정">보고일정</option>
                                    </select>
                                    <input type="date" value={form.date} onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, date: e.target.value } }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]" />
                                  </div>
                                  <input value={form.title} placeholder="제목" onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, title: e.target.value } }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px]" />
                                  <textarea value={form.content} placeholder="내용 (선택)" rows={2} onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, content: e.target.value } }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px] resize-none" />
                                  <button type="submit" className="text-[11px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">기록 추가</button>
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
                      <div className="sticky top-0 z-10 h-11 border-b border-[#EEF0F2] bg-white" />
                      {WEEKDAYS.map(w => (
                        <div key={w} className="sticky top-0 z-10 h-11 flex items-center justify-center text-[12px] font-medium text-[#7A8491] border-b border-l border-[#EEF0F2] bg-white">{w}</div>
                      ))}

                      {monthWeeks.map((week, wi) => (
                        <Fragment key={wi}>
                          <div className="h-7 flex items-center px-3 text-[10px] text-[#C4CBD2] bg-[#FAFBFB] border-b border-[#EEF0F2]">{wi + 1}주</div>
                          {week.map(d => {
                            const ds = dateStr(d)
                            const inMonth = d.getMonth() + 1 === calMonthNum
                            const isToday = ds === todayStr()
                            const isFamilyDay = familyDaySet.has(ds)
                            if (isFamilyDay) {
                              return (
                                <div
                                  key={d.toISOString()}
                                  className="h-7 flex items-center justify-center gap-1 border-b border-l border-[#DDD6FE] bg-gradient-to-r from-[#7C3AED] to-[#C084FC] overflow-hidden"
                                >
                                  <span className="text-[10px] font-bold text-white tracking-tight whitespace-nowrap">🎉 패밀리데이</span>
                                </div>
                              )
                            }
                            return (
                              <div
                                key={d.toISOString()}
                                className={`h-7 flex items-center justify-center text-[11px] border-b border-l border-[#EEF0F2] bg-[#FAFBFB] ${isToday ? 'font-semibold text-[#4C7FE0]' : inMonth ? 'text-[#7A8491]' : 'text-[#D3D8DD]'}`}
                              >
                                {d.getDate()}
                              </div>
                            )
                          })}

                          <div className="min-h-[52px] flex items-center px-3 text-[12.5px] font-semibold text-[#1F2933] border-b border-[#EEF0F2] truncate bg-[#F7F8FA]">🏢 인사관리팀</div>
                          {week.map(d => {
                            const ds = dateStr(d)
                            const isToday = ds === todayStr()
                            const isFamilyDay = familyDaySet.has(ds)
                            const meetingForDay = meetings.find(m => m.meeting_date === ds)
                            return (
                              <div
                                key={`team-${ds}`}
                                onClick={() => !isFamilyDay && (meetingForDay ? openEditMeetingDrawer(meetingForDay) : openNewMeetingDrawer(ds))}
                                title={isFamilyDay ? '패밀리데이' : meetingForDay ? '회의록 열기' : '이 날짜로 회의록 작성'}
                                className={`min-h-[52px] px-1.5 py-1.5 border-b border-l border-[#EEF0F2] flex items-center justify-center ${isFamilyDay ? 'bg-[#F5F3FF] border-[#DDD6FE]' : `cursor-pointer hover:bg-[#EEF1FE] bg-[#F7F8FA] ${isToday ? 'bg-[#4C7FE0]/[0.05]' : ''}`}`}
                              >
                                {isFamilyDay ? (
                                  <span className="text-[11px] text-[#7C3AED] font-medium">🎉 쉬는날</span>
                                ) : meetingForDay ? (
                                  <span className="text-[11px] bg-[#4C7FE0]/10 text-[#4C7FE0] rounded-full px-2 py-1 truncate max-w-full">✓ {meetingForDay.title}</span>
                                ) : (
                                  <span className="text-[11px] text-[#D3D8DD]">+ 회의</span>
                                )}
                              </div>
                            )
                          })}

                          {visibleMembers.map(mem => (
                            <Fragment key={mem.id}>
                              <div className="min-h-[62px] flex items-center px-3 text-[12.5px] text-[#3A4249] border-b border-[#EEF0F2] truncate">{mem.name}</div>
                              {week.map(d => {
                                const ds = dateStr(d)
                                const isToday = ds === todayStr()
                                const isFamilyDay = familyDaySet.has(ds)
                                const cellEvents = filteredEvents.filter(ev => ev.assignee === mem.name && ev.event_date === ds)
                                return (
                                  <div
                                    key={ds}
                                    onClick={() => setDraft({ id: null, title: isFamilyDay ? '휴가' : '', date: ds, assignee: mem.name, tag: isFamilyDay ? '휴가' : '', note: '' })}
                                    className={`min-h-[62px] px-1.5 py-1.5 border-b border-l cursor-pointer space-y-1 ${isFamilyDay ? 'border-[#DDD6FE] bg-[#FAF8FF] hover:bg-[#F5F3FF]' : `border-[#EEF0F2] hover:bg-[#F7F8F8] ${isToday ? 'bg-[#4C7FE0]/[0.03]' : ''}`}`}
                                  >
                                    {cellEvents.map(ev => (
                                      <div
                                        key={ev.id}
                                        onClick={e => { e.stopPropagation(); setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note }) }}
                                        className={`text-[11px] rounded-[6px] px-1.5 py-1 truncate leading-tight ${ev.tag === '휴가' ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#EEF1FE] text-[#3A5BC7]'}`}
                                      >
                                        {ev.tag && <span className="font-semibold">[{ev.tag}] </span>}{ev.title}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
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
        </div>
        </div>
        )}
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
          <div onClick={e => e.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-white shadow-lg rounded-l-2xl flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-[#EEF0F2]">
              <p className="text-[15px] font-semibold text-[#1F2933]">{meetingDraft.id ? '회의 수정' : '새 회의'}</p>
              <button onClick={cancelMeetingDraft} className="text-[#B0B8C1] hover:text-[#1F2933] text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
                <label className="block text-[12px] text-[#7A8491] mb-1.5">회의 내용</label>
                <textarea
                  value={meetingDraft.content} onChange={e => setMeetingDraft(d => d && { ...d, content: e.target.value })}
                  rows={10} className="w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0] resize-none"
                />
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
    </div>
  )
}
