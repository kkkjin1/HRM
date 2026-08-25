'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { DOODLE_PALETTE, ROLE_LABEL } from '@/lib/data'
import { displayName, displayNameFull } from '@/lib/members'
import Avatar from '@/components/Avatar'
import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS, labelOf, type WorkStyle } from '@/lib/workStyle'

type NoteKind = 'note' | 'praise' | 'warning'
type PeerNote = { id: string; about_id: string; author_id: string; content: string; created_at: string; kind: NoteKind }

const NOTE_KIND_OPTIONS: { key: NoteKind; label: string }[] = [
  { key: 'note', label: '💬 한마디' },
  { key: 'praise', label: '👏 칭찬' },
  { key: 'warning', label: '🚨 경고장' },
]
const NOTE_KIND_TOAST: Record<NoteKind, string> = {
  note: '전달했습니다',
  praise: '🎉 칭찬 발사 완료!',
  warning: '🚨 경고장 발부 완료!',
}

type Props = {
  memberId: string
  onClose: () => void
}

function yearsSince(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  const anniversaryPassed = now.getMonth() > d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate())
  if (!anniversaryPassed) years -= 1
  return Math.max(years, 0)
}

function TagToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-full border transition-colors ${
        active ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'
      }`}
    >
      {label}
    </button>
  )
}

export default function ProfileCardModal({ memberId, onClose }: Props) {
  const { members } = useMembers()
  const { me } = useCurrentMember()
  const [notes, setNotes] = useState<PeerNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [noteKind, setNoteKind] = useState<NoteKind>('note')
  const [busy, setBusy] = useState(false)
  const [entered, setEntered] = useState(false)
  const [toast, setToast] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [workStyle, setWorkStyle] = useState<WorkStyle | null>(null)

  const member = members.find(m => m.id === memberId) ?? null
  const isMe = me?.id === memberId

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.from('peer_notes').select('*').eq('about_id', memberId).order('created_at', { ascending: false })
      .then(({ data }) => { if (active && data) setNotes(data as PeerNote[]) })
    return () => { active = false }
  }, [memberId])

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.from('work_styles').select('*').eq('member_id', memberId).single()
      .then(({ data }) => { if (active && data) setWorkStyle(data as WorkStyle) })
    return () => { active = false }
  }, [memberId])

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  // 아바타 이니셜 글자를 뽑을 때 쓰는 짧은 이름 — displayNameFull은 "닉네임(실명)"이라
  // 글자를 자르면 괄호가 걸릴 수 있어서 이니셜 용도는 항상 이걸로 분리한다.
  function nameOf(id: string) {
    return displayName(members.find(m => m.id === id)) || '알 수 없음'
  }
  function fullNameOf(id: string) {
    return displayNameFull(members.find(m => m.id === id)) || '알 수 없음'
  }
  function colorOf(id: string) {
    const m = members.find(x => x.id === id)
    return DOODLE_PALETTE[(m?.color_key ?? 0) % 8]
  }

  async function saveField(field: 'nickname', value: string) {
    const supabase = createClient()
    await supabase.from('members').update({ [field]: value.trim() || null }).eq('id', memberId)
  }

  // 내 work_style 태그 토글 저장 (즉시 upsert)
  async function toggleGivesTag(tag: string) {
    if (!me || !isMe) return
    const current = workStyle?.gives_tags ?? []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    await saveWorkStylePatch({ gives_tags: next })
  }

  async function toggleNeedsTag(tag: string) {
    if (!me || !isMe) return
    const current = workStyle?.needs_tags ?? []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    await saveWorkStylePatch({ needs_tags: next })
  }

  async function saveWorkStylePatch(patch: Partial<WorkStyle>) {
    if (!me) return
    const supabase = createClient()
    const base = workStyle ?? { member_id: me.id, gives_tags: [], needs_tags: [], when_stuck: null, feedback_pref: null, focus_time: null, meeting_pref: null, growth_edge: null, team_request: null, updated_at: '' }
    const next = { ...base, ...patch, member_id: me.id, updated_at: new Date().toISOString() }
    const { data } = await supabase.from('work_styles').upsert(next).select().single()
    if (data) setWorkStyle(data as WorkStyle)
  }

  async function addNote() {
    const content = noteDraft.trim()
    if (!content || !me || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('peer_notes')
      .insert({ about_id: memberId, author_id: me.id, content, kind: noteKind })
      .select().single()
    if (data) { setNotes(prev => [data as PeerNote, ...prev]); setToast(NOTE_KIND_TOAST[noteKind]) }
    if (!error) { setNoteDraft(''); setNoteKind('note') }
    setBusy(false)
  }

  async function deleteNote(n: PeerNote) {
    setNotes(prev => prev.filter(x => x.id !== n.id))
    const supabase = createClient()
    await supabase.from('peer_notes').delete().eq('id', n.id)
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError('')
    const body = new FormData()
    body.append('file', file)
    body.append('member_id', memberId)
    const res = await fetch('/api/avatar', { method: 'POST', body })
    const json = await res.json().catch(() => ({ ok: false, error: '업로드 실패' }))
    setUploading(false)
    if (!json.ok) setUploadError(json.error ?? '업로드 실패')
  }

  if (!member) return null
  const palette = DOODLE_PALETTE[member.color_key % 8]
  const givesTags = workStyle?.gives_tags ?? []
  const needsTags = workStyle?.needs_tags ?? []

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/30 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-[400px] max-h-[88vh] overflow-y-auto bg-white rounded-3xl shadow-xl transition-all duration-200 ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
      >
        {/* 상단 헤더 */}
        <div className="relative pt-9 pb-5 px-6 text-center overflow-hidden" style={{ background: `linear-gradient(180deg, ${palette.bg} 0%, #ffffff 100%)` }}>
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-[#7A8491] hover:bg-black/[0.06] text-[15px]">✕</button>

          <div className="relative inline-block">
            <Avatar member={member} size={104} ring className="mx-auto shadow-md" />
            {isMe && (
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="프로필 사진 바꾸기"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white shadow-md border border-[#EEF0F2] flex items-center justify-center text-[13px] hover:bg-[#F7F8F8]">
                {uploading ? '⏳' : '📷'}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarPick} />
          </div>
          {uploadError && <p className="text-[11px] text-red-500 mt-2">{uploadError}</p>}

          <p className="text-[18px] font-semibold text-[#1F2933] mt-3">
            {displayNameFull(member)}
            {isMe && <span className="ml-1.5 text-[12px] font-normal text-[#4C7FE0]">나</span>}
          </p>
          {isMe && (
            <input
              key={`nickname-${member.id}-${member.nickname ?? ''}`}
              defaultValue={member.nickname ?? ''}
              onBlur={e => { if (e.target.value !== (member.nickname ?? '')) saveField('nickname', e.target.value) }}
              placeholder="닉네임 설정하기"
              maxLength={20}
              className="mt-2 text-center text-[13px] text-[#3A4249] border border-[#E5E8EB] rounded-full px-3 py-1 focus:outline-none focus:border-[#4C7FE0] bg-white/70 w-[160px]"
            />
          )}
          <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
            {member.position && (
              <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#3A4249] border border-[#EEF0F2]">{member.position}</span>
            )}
            <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#3A4249] border border-[#EEF0F2]">{ROLE_LABEL[member.role]}</span>
            {member.hired_at && <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#3A4249] border border-[#EEF0F2]">{yearsSince(member.hired_at)}년차</span>}
          </div>

          {/* 협업 방식 칩 미리보기 */}
          {WORK_STYLE_QUESTIONS.some(q => workStyle?.[q.key]) && (
            <div className="flex flex-wrap justify-center gap-1 mt-2">
              {WORK_STYLE_QUESTIONS.map(q => {
                const label = labelOf(q.key, workStyle?.[q.key] ?? null)
                if (!label) return null
                return (
                  <span key={q.key} className="inline-flex items-center gap-0.5 text-[10.5px] px-2 py-0.5 rounded-full bg-white/80 text-[#3A4249] border border-[#EEF0F2]">
                    {q.icon} {label}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 space-y-5">

          {/* 보태는 것 */}
          <div>
            <p className="text-[11.5px] font-semibold text-[#059669] mb-1.5">보태는 것</p>
            {isMe ? (
              <div className="flex flex-wrap gap-1.5">
                {GIVES_TAGS.map(t => (
                  <TagToggle key={t} label={t} active={givesTags.includes(t)} onClick={() => toggleGivesTag(t)} />
                ))}
              </div>
            ) : givesTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {givesTags.map(t => <span key={t} className="text-[12px] px-2.5 py-1 rounded-full bg-[#F0F9F4] text-[#059669] border border-[#A7F3D0]">{t}</span>)}
              </div>
            ) : (
              <p className="text-[13px] text-[#C4CBD2]">아직 작성 전</p>
            )}
          </div>

          {/* 기대하는 것 */}
          <div>
            <p className="text-[11.5px] font-semibold text-[#B45309] mb-1.5">기대하는 것</p>
            {isMe ? (
              <div className="flex flex-wrap gap-1.5">
                {NEEDS_TAGS.map(t => (
                  <TagToggle key={t} label={t} active={needsTags.includes(t)} onClick={() => toggleNeedsTag(t)} />
                ))}
              </div>
            ) : needsTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {needsTags.map(t => <span key={t} className="text-[12px] px-2.5 py-1 rounded-full bg-[#FFF9EC] text-[#B45309] border border-[#FDE68A]">{t}</span>)}
              </div>
            ) : (
              <p className="text-[13px] text-[#C4CBD2]">아직 작성 전</p>
            )}
          </div>

          {/* 못하는 것 + 팀에 부탁 */}
          {(workStyle?.growth_edge || workStyle?.team_request || isMe) && (
            <div className="space-y-2">
              {isMe ? (
                <>
                  <div>
                    <p className="text-[11px] font-semibold text-[#7A8491] mb-1">잘 못하는 것</p>
                    <input
                      key={`growth-edge-${member.id}-${workStyle?.growth_edge ?? ''}`}
                      defaultValue={workStyle?.growth_edge ?? ''}
                      onBlur={e => { if (e.target.value !== (workStyle?.growth_edge ?? '')) saveWorkStylePatch({ growth_edge: e.target.value || null }) }}
                      placeholder="예: 마감 직전 우선순위 재조정"
                      className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-[#7A8491] mb-1">팀에 부탁</p>
                    <input
                      key={`team-request-${member.id}-${workStyle?.team_request ?? ''}`}
                      defaultValue={workStyle?.team_request ?? ''}
                      onBlur={e => { if (e.target.value !== (workStyle?.team_request ?? '')) saveWorkStylePatch({ team_request: e.target.value || null }) }}
                      placeholder="예: 막혔을 때 먼저 말 걸어줘도 돼"
                      className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                    />
                  </div>
                </>
              ) : (
                <>
                  {workStyle?.growth_edge && (
                    <p className="text-[12px] text-[#7A8491]"><span className="text-[#B0B8C1]">잘 못하는 것 · </span>{workStyle.growth_edge}</p>
                  )}
                  {workStyle?.team_request && (
                    <p className="text-[12px] text-[#7A8491]"><span className="text-[#B0B8C1]">팀에 부탁 · </span>{workStyle.team_request}</p>
                  )}
                </>
              )}
            </div>
          )}

          {isMe && (
            <p className="text-[11px] text-[#B0B8C1]">협업 방식(막혔을 때, 회의 등)은 팀 탭 → 나와 일하는 법에서 설정할 수 있습니다.</p>
          )}

          {/* 동료가 본 나 */}
          <div className="pt-3 border-t border-[#EEF0F2] relative">
            <p className="text-[11.5px] font-semibold text-[#1F2933] mb-2">동료가 본 {displayNameFull(member)}</p>
            {notes.length === 0 && <p className="text-[12px] text-[#C4CBD2] mb-2">아직 없습니다.</p>}
            <ul className="space-y-1.5 mb-2">
              {notes.map(n => {
                const c = colorOf(n.author_id)
                const kind = n.kind ?? 'note'
                const wrapClass =
                  kind === 'praise' ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg px-2.5 py-2' :
                  kind === 'warning' ? 'bg-red-50 border-2 border-dashed border-red-300 rounded-lg px-2.5 py-2 relative' : ''
                return (
                  <li key={n.id} className={`flex items-start gap-2 text-[12.5px] group ${wrapClass}`}>
                    {kind === 'warning' && <span className="absolute -top-2 -right-2 rotate-12 text-[9px] font-bold text-white bg-red-500 rounded px-1.5 py-0.5 shadow-sm">경고장</span>}
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] font-semibold flex-shrink-0 mt-0.5" style={{ background: c.bg, color: c.fg }} title={fullNameOf(n.author_id)}>
                      {nameOf(n.author_id).slice(-2, -1) || nameOf(n.author_id).slice(0, 1)}
                    </span>
                    <span className="flex-1 text-[#3A4249] leading-relaxed">
                      {kind === 'praise' && '👏 '}{kind === 'warning' && '🚨 '}
                      {n.content}
                      <span className="text-[11px] text-[#B0B8C1] ml-1.5">— {fullNameOf(n.author_id)}</span>
                    </span>
                    {me?.id === n.author_id && (
                      <button onClick={() => deleteNote(n)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                    )}
                  </li>
                )
              })}
            </ul>

            {isMe ? (
              <p className="text-[11.5px] text-[#B0B8C1]">내 카드에는 직접 쓸 수 없습니다. 동료들이 채워줍니다.</p>
            ) : me ? (
              <div>
                <div className="flex gap-1 mb-1.5">
                  {NOTE_KIND_OPTIONS.map(opt => (
                    <button key={opt.key} type="button" onClick={() => setNoteKind(opt.key)}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${noteKind === opt.key ? 'bg-[#4C7FE0]/10 border-[#4C7FE0] text-[#4C7FE0] font-medium' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={e => { e.preventDefault(); addNote() }} className="flex gap-1.5">
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    placeholder={
                      noteKind === 'praise' ? `${displayNameFull(member)}님 칭찬 한마디` :
                      noteKind === 'warning' ? `${displayNameFull(member)}님한테 (장난) 경고장 발부` :
                      `${displayNameFull(member)} 덕분에 가능했던 것 한 줄`
                    }
                    className="flex-1 text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                  />
                  <button type="submit" disabled={busy || !noteDraft.trim()} className="text-[12.5px] font-medium text-[#4C7FE0] disabled:opacity-40 px-2">남기기</button>
                </form>
              </div>
            ) : null}

            {toast && (
              <span className="absolute -top-3 right-0 text-[11.5px] font-medium text-white bg-[#1F2933] rounded-full px-3 py-1 shadow-md animate-bounce">{toast}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
