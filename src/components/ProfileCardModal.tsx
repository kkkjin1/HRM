'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { DOODLE_PALETTE, ROLE_LABEL } from '@/lib/data'
import Avatar from '@/components/Avatar'

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

// 프로필 카드 "확대" 팝업. 헤더의 내 프로필 버튼과 팀 탭 상단 미니 아바타 줄이 둘 다 이걸 연다 —
// 필요한 데이터(멤버/동료노트)를 이 컴포넌트가 직접 불러와서 어디서 열든 동작이 같다.
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

  function nameOf(id: string) {
    return members.find(m => m.id === id)?.name ?? '알 수 없음'
  }
  function colorOf(id: string) {
    const m = members.find(x => x.id === id)
    return DOODLE_PALETTE[(m?.color_key ?? 0) % 8]
  }

  async function saveField(field: 'gives' | 'needs', value: string) {
    const supabase = createClient()
    await supabase.from('members').update({ [field]: value.trim() || null }).eq('id', memberId)
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
    if (data) {
      setNotes(prev => [data as PeerNote, ...prev])
      setToast(NOTE_KIND_TOAST[noteKind])
    }
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

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/30 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-[380px] max-h-[85vh] overflow-y-auto bg-white rounded-3xl shadow-xl transition-all duration-200 ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
      >
        {/* ── 상단: 장식 배경 + 원형 사진 ── */}
        <div className="relative pt-9 pb-5 px-6 text-center overflow-hidden" style={{ background: `linear-gradient(180deg, ${palette.bg} 0%, #ffffff 100%)` }}>
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-[#7A8491] hover:bg-black/[0.06] text-[15px]">✕</button>

          <div className="relative inline-block">
            <Avatar member={member} size={104} ring className="mx-auto shadow-md" />
            {isMe && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="프로필 사진 바꾸기"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white shadow-md border border-[#EEF0F2] flex items-center justify-center text-[13px] hover:bg-[#F7F8F8]"
              >
                {uploading ? '⏳' : '📷'}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarPick} />
          </div>
          {uploadError && <p className="text-[11px] text-red-500 mt-2">{uploadError}</p>}

          <p className="text-[18px] font-semibold text-[#1F2933] mt-3">
            {member.name}
            {isMe && <span className="ml-1.5 text-[12px] font-normal text-[#4C7FE0]">나</span>}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
            {member.position && (
              <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#3A4249] border border-[#EEF0F2]">{member.position}</span>
            )}
            <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#3A4249] border border-[#EEF0F2]">{ROLE_LABEL[member.role]}</span>
            {member.hired_at && (
              <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#3A4249] border border-[#EEF0F2]">{yearsSince(member.hired_at)}년차</span>
            )}
          </div>
        </div>

        {/* ── 본문 ── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[11.5px] font-semibold text-[#059669] mb-1">팀에 보태는 것</p>
            {isMe ? (
              <textarea
                key={`gives-${member.id}-${member.gives ?? ''}`}
                defaultValue={member.gives ?? ''}
                onBlur={e => { if (e.target.value !== (member.gives ?? '')) saveField('gives', e.target.value) }}
                rows={2}
                placeholder="내가 있어서 팀이 덜 걱정하는 부분"
                className="w-full text-[13px] text-[#3A4249] leading-relaxed border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0] resize-none"
              />
            ) : (
              <p className="text-[13px] text-[#3A4249] leading-relaxed whitespace-pre-wrap">
                {member.gives || <span className="text-[#C4CBD2]">아직 작성 전</span>}
              </p>
            )}
          </div>

          <div>
            <p className="text-[11.5px] font-semibold text-[#B45309] mb-1">팀에 기대는 것</p>
            {isMe ? (
              <textarea
                key={`needs-${member.id}-${member.needs ?? ''}`}
                defaultValue={member.needs ?? ''}
                onBlur={e => { if (e.target.value !== (member.needs ?? '')) saveField('needs', e.target.value) }}
                rows={2}
                placeholder="혼자 하면 느려지는, 누군가 채워주면 좋은 부분"
                className="w-full text-[13px] text-[#3A4249] leading-relaxed border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0] resize-none"
              />
            ) : (
              <p className="text-[13px] text-[#3A4249] leading-relaxed whitespace-pre-wrap">
                {member.needs || <span className="text-[#C4CBD2]">아직 작성 전</span>}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-[#EEF0F2] relative">
            <p className="text-[11.5px] font-semibold text-[#1F2933] mb-2">동료가 본 {member.name}</p>
            {notes.length === 0 && <p className="text-[12px] text-[#C4CBD2] mb-2">아직 없습니다.</p>}
            <ul className="space-y-1.5 mb-2">
              {notes.map(n => {
                const c = colorOf(n.author_id)
                const kind = n.kind ?? 'note'
                const wrapClass =
                  kind === 'praise' ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg px-2.5 py-2' :
                  kind === 'warning' ? 'bg-red-50 border-2 border-dashed border-red-300 rounded-lg px-2.5 py-2 relative' :
                  ''
                return (
                  <li key={n.id} className={`flex items-start gap-2 text-[12.5px] group ${wrapClass}`}>
                    {kind === 'warning' && (
                      <span className="absolute -top-2 -right-2 rotate-12 text-[9px] font-bold text-white bg-red-500 rounded px-1.5 py-0.5 shadow-sm">경고장</span>
                    )}
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] font-semibold flex-shrink-0 mt-0.5"
                      style={{ background: c.bg, color: c.fg }}
                      title={nameOf(n.author_id)}
                    >
                      {nameOf(n.author_id).slice(-2, -1) || nameOf(n.author_id).slice(0, 1)}
                    </span>
                    <span className="flex-1 text-[#3A4249] leading-relaxed">
                      {kind === 'praise' && '👏 '}
                      {kind === 'warning' && '🚨 '}
                      {n.content}
                      <span className="text-[11px] text-[#B0B8C1] ml-1.5">— {nameOf(n.author_id)}</span>
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
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setNoteKind(opt.key)}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                        noteKind === opt.key ? 'bg-[#4C7FE0]/10 border-[#4C7FE0] text-[#4C7FE0] font-medium' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={e => { e.preventDefault(); addNote() }} className="flex gap-1.5">
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    placeholder={
                      noteKind === 'praise' ? `${member.name}님 칭찬 한마디` :
                      noteKind === 'warning' ? `${member.name}님한테 (장난) 경고장 발부` :
                      `${member.name} 덕분에 가능했던 것 한 줄`
                    }
                    className="flex-1 text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                  />
                  <button type="submit" disabled={busy || !noteDraft.trim()} className="text-[12.5px] font-medium text-[#4C7FE0] disabled:opacity-40 px-2">남기기</button>
                </form>
              </div>
            ) : null}

            {toast && (
              <span className="absolute -top-3 right-0 text-[11.5px] font-medium text-white bg-[#1F2933] rounded-full px-3 py-1 shadow-md animate-bounce">
                {toast}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
