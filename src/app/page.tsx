'use client'

// team-log — 팀원들이 비밀번호로 접근하는 독립 앱. jin-dashboard와는 별도
// 저장소/배포이며, 공유하는 것은 같은 Supabase 프로젝트뿐 (테이블은 team_log_*로 격리).
// 좌측 메뉴로 일상(자유메모)/업무(그룹→항목→서브태스크)/회의록/일정 4개 섹션을 오간다.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'

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
type Note = { id: string; author: string; content: string; sort_order: number; created_at: string }
type Meeting = { id: string; title: string; meeting_date: string; attendees: string; content: string; created_at: string }
type MeetingForm = { title: string; date: string; attendees: string; content: string }
type ScheduleEvent = {
  id: string; title: string; event_date: string; note: string; assignee: string; tag: string | null
  source_type: 'item' | 'subtask' | 'meeting' | null; source_id: string | null; created_at: string
}
type Member = { id: string; name: string; sort_order: number }
type EventDraft = { id: string | null; title: string; date: string; assignee: string; tag: string; note: string }
type Section = 'life' | 'work' | 'meetings' | 'schedule'

const GROUP_COLORS = ['#4C7FE0', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#9CA3AF']
const STATUS_LABEL: Record<Item['status'], string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_NEXT: Record<Item['status'], Item['status']> = { active: 'hold', hold: 'done', done: 'active' }
const STATUS_STYLE: Record<Item['status'], string> = {
  active: 'bg-[#4C7FE0]/10 text-[#4C7FE0]',
  hold: 'bg-amber-100 text-amber-600',
  done: 'bg-gray-100 text-gray-400',
}
const EMPTY_SUB_FORM: SubForm = { type: '업무기록', date: '', title: '', content: '' }
const EMPTY_MEETING_FORM: MeetingForm = { title: '', date: '', attendees: '', content: '' }
const BASE_TAGS = ['중간보고', '최종보고']
const WEEKDAYS = ['월', '화', '수', '목', '금']

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

  // ── 일상 ──────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([])
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteContent, setEditNoteContent] = useState('')

  // ── 회의록 ────────────────────────────────────────────────────────────
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [meetingForm, setMeetingForm] = useState<MeetingForm>({ ...EMPTY_MEETING_FORM, date: todayStr() })
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null)
  const [editMeetingForm, setEditMeetingForm] = useState<MeetingForm>(EMPTY_MEETING_FORM)

  // ── 일정 ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonthNum, setCalMonthNum] = useState(now.getMonth() + 1)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<EventDraft | null>(null)

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
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2200)
    return () => clearTimeout(t)
  }, [flash])

  async function loadAll() {
    try {
      const [treeRes, notesRes, meetingsRes, scheduleRes, membersRes] = await Promise.all([
        fetch('/api/tree'), fetch('/api/notes'), fetch('/api/meetings'),
        fetch('/api/schedule'), fetch('/api/members'),
      ])
      if (treeRes.status === 401) { router.push('/login'); return }
      const [treeJson, notesJson, meetingsJson, scheduleJson, membersJson] = await Promise.all([
        treeRes.json(), notesRes.json(), meetingsRes.json(), scheduleRes.json(), membersRes.json(),
      ])
      if (!treeJson.ok) { setLoadError(treeJson.error ?? '불러오기 실패'); setLoaded(true); return }
      setGroups(treeJson.groups)
      if (notesJson.ok) setNotes(notesJson.notes)
      if (meetingsJson.ok) setMeetings(meetingsJson.meetings)
      if (scheduleJson.ok) setEvents(scheduleJson.events)
      if (membersJson.ok) setMembers(membersJson.members)
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

  // ── 일상: 자유 메모 ───────────────────────────────────────────────────
  async function addNote() {
    const res = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author.trim(), content: '' }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setNotes(prev => [...prev, json.note]); setEditingNoteId(json.note.id); setEditNoteContent('') }
  }

  async function saveNote(id: string) {
    setEditingNoteId(null)
    const res = await fetch('/api/notes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, author: author.trim(), content: editNoteContent }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setNotes(prev => prev.map(n => n.id === id ? json.note : n))
  }

  async function deleteNote(n: Note) {
    if (!confirm('이 메모를 삭제할까요?')) return
    const res = await fetch('/api/notes', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setNotes(prev => prev.filter(x => x.id !== n.id))
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
  async function handleAddMeeting(e: React.FormEvent) {
    e.preventDefault()
    if (!meetingForm.title.trim() || !meetingForm.date) return
    const res = await fetch('/api/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: meetingForm.title.trim(), meeting_date: meetingForm.date, attendees: meetingForm.attendees, content: meetingForm.content }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setMeetings(prev => [json.meeting, ...prev]); setMeetingForm({ ...EMPTY_MEETING_FORM, date: todayStr() }) }
  }

  function startEditMeeting(m: Meeting) {
    setEditingMeetingId(m.id)
    setEditMeetingForm({ title: m.title, date: m.meeting_date, attendees: m.attendees, content: m.content })
  }

  async function saveEditMeeting(id: string) {
    if (!editMeetingForm.title.trim() || !editMeetingForm.date) { setEditingMeetingId(null); return }
    const res = await fetch('/api/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: editMeetingForm.title.trim(), meeting_date: editMeetingForm.date, attendees: editMeetingForm.attendees, content: editMeetingForm.content }),
    })
    setEditingMeetingId(null)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetings(prev => prev.map(m => m.id === id ? json.meeting : m).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)))
  }

  async function deleteMeeting(m: Meeting) {
    if (!confirm(`"${m.title}" 회의록을 삭제할까요?`)) return
    const res = await fetch('/api/meetings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetings(prev => prev.filter(x => x.id !== m.id))
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

  const unassignedEvents = useMemo(
    () => filteredEvents.filter(ev => !members.some(m => m.name === ev.assignee)),
    [filteredEvents, members]
  )

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
    return <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5] text-sm text-gray-400">불러오는 중...</div>
  }

  const SECTION_LABEL: Record<Section, string> = { life: '일상', work: '업무', meetings: '회의록', schedule: '일정' }
  const SECTIONS: Section[] = ['life', 'work', 'meetings', 'schedule']

  return (
    <div className="min-h-screen bg-[#F4F7F5] flex">
      {/* ── 좌측 메뉴 ── */}
      <aside className="hidden sm:flex flex-col w-56 flex-shrink-0 bg-white border-r border-stone-100 min-h-screen p-4">
        <p className="font-semibold text-gray-900 text-sm mb-4 px-1">인사관리팀</p>
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

      <main className="flex-1 min-w-0 px-4 py-8">
        <div className={`mx-auto space-y-5 ${section === 'schedule' ? 'max-w-4xl' : 'max-w-2xl'}`}>
          {/* 모바일 상단 섹션 탭 */}
          <div className="sm:hidden -mt-2 mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSection(s)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full ${section === s ? 'bg-[#4C7FE0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{SECTION_LABEL[s]}</button>
            ))}
          </div>

          {loadError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{loadError}</p>}

          <div className="sm:hidden flex items-center gap-2 text-[11.5px] text-gray-500">
            <span>{author}</span>
            <button onClick={handleChangePassword} className="text-gray-400 hover:text-[#4C7FE0]">비밀번호 변경</button>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">로그아웃</button>
          </div>

          {/* ══ 일상 ══ */}
          {section === 'life' && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">일상 · 자유 메모</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {notes.map(n => (
                  <div key={n.id} className="group relative bg-white rounded-xl border border-stone-100 shadow-sm aspect-square p-2 flex flex-col">
                    <button onClick={() => deleteNote(n)} className="absolute top-1 right-1 text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    {editingNoteId === n.id ? (
                      <textarea
                        autoFocus value={editNoteContent}
                        onChange={e => setEditNoteContent(e.target.value)}
                        onBlur={() => saveNote(n.id)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingNoteId(null) }}
                        className="flex-1 w-full text-[11px] resize-none outline-none"
                        placeholder="메모..."
                      />
                    ) : (
                      <div
                        onClick={() => { setEditingNoteId(n.id); setEditNoteContent(n.content) }}
                        className="flex-1 text-[11px] text-gray-700 whitespace-pre-wrap overflow-hidden cursor-text"
                      >
                        {n.content || <span className="text-gray-300">클릭해서 입력</span>}
                      </div>
                    )}
                    {n.author && <p className="text-[9px] text-gray-300 mt-1 truncate">{n.author}</p>}
                  </div>
                ))}
                <button onClick={addNote} className="bg-white rounded-xl border border-dashed border-stone-200 aspect-square flex items-center justify-center text-gray-300 hover:text-[#4C7FE0] hover:border-[#4C7FE0]/40 transition-colors text-xl">
                  +
                </button>
              </div>
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

          {/* ══ 회의록 ══ */}
          {section === 'meetings' && (
            <>
              <form onSubmit={handleAddMeeting} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-2">
                <div className="flex gap-2">
                  <input value={meetingForm.title} onChange={e => setMeetingForm(prev => ({ ...prev, title: e.target.value }))} placeholder="회의 제목" required className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <input type="date" value={meetingForm.date} onChange={e => setMeetingForm(prev => ({ ...prev, date: e.target.value }))} required className="border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </div>
                <input value={meetingForm.attendees} onChange={e => setMeetingForm(prev => ({ ...prev, attendees: e.target.value }))} placeholder="참석자 (예: 김진일, 홍길동)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <textarea value={meetingForm.content} onChange={e => setMeetingForm(prev => ({ ...prev, content: e.target.value }))} placeholder="회의 내용" rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                <button type="submit" className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium">회의록 추가</button>
              </form>

              <div className="space-y-2.5">
                {meetings.length === 0 && <p className="text-xs text-gray-400 text-center py-8">아직 회의록이 없습니다.</p>}
                {meetings.map(m => (
                  editingMeetingId === m.id ? (
                    <div key={m.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-2">
                      <div className="flex gap-2">
                        <input value={editMeetingForm.title} onChange={e => setEditMeetingForm(prev => ({ ...prev, title: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                        <input type="date" value={editMeetingForm.date} onChange={e => setEditMeetingForm(prev => ({ ...prev, date: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                      </div>
                      <input value={editMeetingForm.attendees} onChange={e => setEditMeetingForm(prev => ({ ...prev, attendees: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      <textarea value={editMeetingForm.content} onChange={e => setEditMeetingForm(prev => ({ ...prev, content: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                      <div className="flex gap-1.5">
                        <button onClick={() => saveEditMeeting(m.id)} className="text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">저장</button>
                        <button onClick={() => setEditingMeetingId(null)} className="text-[12px] font-medium text-gray-500 px-3 py-1.5">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={m.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 group"
                      onMouseEnter={() => setHoveredKey(`meeting:${m.id}`)}
                      onMouseLeave={() => setHoveredKey(null)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5">{fmtDay(m.meeting_date)}</span>
                        {m.attendees && <span className="text-[11px] text-gray-400">{m.attendees}</span>}
                        <button onClick={() => addToSchedule(m.title, m.meeting_date, 'meeting', m.id)} title="일정에 추가 (호버 후 S)" className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity ml-auto">📅</button>
                        <button onClick={() => startEditMeeting(m)} className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity">수정</button>
                        <button onClick={() => deleteMeeting(m)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                      </div>
                      <p className="text-sm text-gray-800 font-medium">{m.title}</p>
                      {m.content && <p className="text-[12.5px] text-gray-500 mt-1 whitespace-pre-wrap">{m.content}</p>}
                    </div>
                  )
                ))}
              </div>
            </>
          )}

          {/* ══ 일정 ══ */}
          {section === 'schedule' && (
            <div className="max-w-none">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button onClick={prevMonth} className="text-gray-400 hover:text-gray-600 px-1.5">◀</button>
                  <p className="text-sm font-semibold text-gray-800 w-24 text-center">{calYear}년 {calMonthNum}월</p>
                  <button onClick={nextMonth} className="text-gray-400 hover:text-gray-600 px-1.5">▶</button>
                  <button onClick={gotoToday} className="text-[11px] text-gray-400 hover:text-[#4C7FE0] ml-1">오늘</button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {allTags.map(tag => (
                  <button
                    key={tag} onClick={() => toggleTag(tag)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${activeTags.has(tag) ? 'bg-[#4C7FE0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                  >
                    {tag}
                  </button>
                ))}
                {activeTags.size > 0 && (
                  <button onClick={() => setActiveTags(new Set())} className="text-[11px] text-gray-400 hover:text-gray-600 px-1">전체보기</button>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                {members.map(m => (
                  <span key={m.id} className="text-[11px] text-gray-600 bg-white border border-gray-200 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                    {m.name}
                    <button onClick={() => removeMember(m)} className="text-gray-300 hover:text-red-500">✕</button>
                  </span>
                ))}
                <form onSubmit={addMember} className="flex items-center">
                  <input
                    value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="+ 팀원 추가"
                    className="text-[11px] border border-dashed border-gray-300 rounded-full px-2.5 py-1 w-24 focus:outline-none focus:border-[#4C7FE0]"
                  />
                </form>
              </div>

              {members.length === 0 ? (
                <p className="text-xs text-gray-400 bg-white rounded-xl border border-stone-100 p-4 text-center">팀원을 먼저 추가하면 주차별 표가 만들어집니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[560px] space-y-3">
                    {monthWeeks.map((week, wi) => (
                      <div key={wi} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                        <div className="grid" style={{ gridTemplateColumns: '72px repeat(5, 1fr)' }}>
                          <div className="px-2 py-1.5 text-[10px] text-gray-300 border-b border-r border-stone-100 flex items-center">{wi + 1}주차</div>
                          {week.map(d => {
                            const inMonth = d.getMonth() + 1 === calMonthNum
                            return (
                              <div key={d.toISOString()} className={`px-2 py-1.5 text-center text-[11px] font-medium border-b border-r border-stone-100 last:border-r-0 ${inMonth ? 'text-gray-600' : 'text-gray-300'}`}>
                                {WEEKDAYS[(d.getDay() + 6) % 7]} {d.getDate()}
                              </div>
                            )
                          })}

                          {members.map(mem => (
                            <Fragment key={mem.id}>
                              <div className="px-2 py-1.5 text-[11.5px] font-medium text-gray-600 border-r border-stone-50 flex items-center truncate">{mem.name}</div>
                              {week.map(d => {
                                const ds = dateStr(d)
                                const cellEvents = filteredEvents.filter(ev => ev.assignee === mem.name && ev.event_date === ds)
                                return (
                                  <div
                                    key={ds}
                                    onClick={() => setDraft({ id: null, title: '', date: ds, assignee: mem.name, tag: '', note: '' })}
                                    className="min-h-[44px] px-1 py-1 border-r border-b border-stone-50 last:border-r-0 cursor-pointer hover:bg-gray-50 space-y-0.5"
                                  >
                                    {cellEvents.map(ev => (
                                      <div
                                        key={ev.id}
                                        onClick={e => { e.stopPropagation(); setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note }) }}
                                        className="text-[10px] bg-[#4C7FE0]/10 text-[#4C7FE0] rounded px-1 py-0.5 truncate"
                                      >
                                        {ev.tag && <span className="font-semibold">[{ev.tag}] </span>}{ev.title}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {unassignedEvents.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] text-gray-400 mb-1.5">담당자 미배정 일정 {unassignedEvents.length}건 (클릭해서 담당자 지정)</p>
                  <div className="space-y-1.5">
                    {unassignedEvents.map(ev => (
                      <div
                        key={ev.id}
                        onClick={() => setDraft({ id: ev.id, title: ev.title, date: ev.event_date, assignee: ev.assignee, tag: ev.tag ?? '', note: ev.note })}
                        className="bg-white rounded-lg border border-stone-100 shadow-sm px-3 py-2 text-[12px] text-gray-600 cursor-pointer hover:bg-gray-50"
                      >
                        {fmtDay(ev.event_date)} · {ev.title} {ev.assignee && <span className="text-gray-400">({ev.assignee})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

      {flash && (
        <div className="fixed bottom-5 right-5 bg-gray-900 text-white text-[12.5px] px-4 py-2.5 rounded-lg shadow-lg z-50">
          {flash}
        </div>
      )}
    </div>
  )
}
