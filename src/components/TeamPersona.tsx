'use client'

// 팀 페이지 — "누가 뭘 담당하는가"(R&R)가 아니라 "혼자서는 안 됐을 일이 왜 이 팀이면 되는가"를 담는다.
// 그래서 구성이 개인 단위가 아니라 관계 단위다: 팀의 약속(개인 위) → 주고받음(맞물림) → 동료가 본 나(타인의 시선).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { DOODLE_PALETTE, ROLE_LABEL } from '@/lib/data'
import BelbinPanel from '@/components/BelbinPanel'
import JohariPanel from '@/components/JohariPanel'

type Principle = { id: string; content: string; sort_order: number; created_at: string }
type PeerNote = { id: string; about_id: string; author_id: string; content: string; created_at: string }

export default function TeamPersona() {
  const { members, loaded: membersLoaded, reload } = useMembers()
  const { me } = useCurrentMember()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [notes, setNotes] = useState<PeerNote[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newPrinciple, setNewPrinciple] = useState('')
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const [pRes, nRes] = await Promise.all([
        supabase.from('team_principles').select('*').order('sort_order'),
        supabase.from('peer_notes').select('*').order('created_at', { ascending: false }),
      ])
      if (!active) return
      if (pRes.data) setPrinciples(pRes.data as Principle[])
      if (nRes.data) setNotes(nRes.data as PeerNote[])
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  function nameOf(id: string) {
    return members.find(m => m.id === id)?.name ?? '알 수 없음'
  }
  function colorOf(id: string) {
    const m = members.find(x => x.id === id)
    return DOODLE_PALETTE[(m?.color_key ?? 0) % 8]
  }

  async function addPrinciple() {
    const content = newPrinciple.trim()
    if (!content || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('team_principles')
      .insert({ content, sort_order: principles.length })
      .select().single()
    if (data) setPrinciples(prev => [...prev, data as Principle])
    setNewPrinciple('')
    setBusy(false)
  }

  async function deletePrinciple(p: Principle) {
    setPrinciples(prev => prev.filter(x => x.id !== p.id))
    const supabase = createClient()
    await supabase.from('team_principles').delete().eq('id', p.id)
  }

  async function saveMemberField(id: string, field: 'gives' | 'needs', value: string) {
    const supabase = createClient()
    await supabase.from('members').update({ [field]: value.trim() || null }).eq('id', id)
    await reload()
  }

  async function addNote(aboutId: string) {
    const content = (noteDraft[aboutId] ?? '').trim()
    if (!content || !me || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('peer_notes')
      .insert({ about_id: aboutId, author_id: me.id, content })
      .select().single()
    if (data) setNotes(prev => [data as PeerNote, ...prev])
    setNoteDraft(prev => ({ ...prev, [aboutId]: '' }))
    setBusy(false)
  }

  async function deleteNote(n: PeerNote) {
    setNotes(prev => prev.filter(x => x.id !== n.id))
    const supabase = createClient()
    await supabase.from('peer_notes').delete().eq('id', n.id)
  }

  if (!loaded || !membersLoaded) {
    return <p className="text-[13px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] font-semibold text-[#1F2933]">팀</h1>
        <p className="text-[12.5px] text-[#7A8491] mt-0.5">각자 무엇을 보태고 무엇을 기대는지, 서로를 어떻게 보고 있는지.</p>
      </div>

      {/* ── 우리 팀의 약속 ── */}
      <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
        <p className="text-[13px] font-semibold text-[#1F2933] mb-1">우리 팀의 약속</p>
        <p className="text-[11.5px] text-[#B0B8C1] mb-3">개인 위에 있는 공통 기준입니다. 새로 온 사람이 가장 먼저 읽습니다.</p>

        {principles.length === 0 && (
          <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 약속이 없습니다. 첫 문장을 적어보세요.</p>
        )}
        <ul className="space-y-1.5 mb-3">
          {principles.map((p, i) => (
            <li key={p.id} className="flex items-start gap-2.5 text-[14px] text-[#3A4249] group">
              <span className="text-[12px] font-semibold text-[#4C7FE0] mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 leading-relaxed">{p.content}</span>
              <button onClick={() => deletePrinciple(p)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
            </li>
          ))}
        </ul>
        <form onSubmit={e => { e.preventDefault(); addPrinciple() }} className="flex gap-1.5">
          <input
            value={newPrinciple}
            onChange={e => setNewPrinciple(e.target.value)}
            placeholder="예: 막히면 혼자 3일 이상 끌지 않는다"
            className="flex-1 text-[13px] border border-[#E5E8EB] rounded-md px-3 py-2 focus:outline-none focus:border-[#4C7FE0]"
          />
          <button type="submit" disabled={busy || !newPrinciple.trim()} className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-md px-4 py-2">추가</button>
        </form>
      </div>

      {/* ── 팀 역할 균형 (Belbin 약식) ── */}
      <BelbinPanel />

      {/* ── 조하리 창 (자기인식 vs 타인인식) ── */}
      <JohariPanel />

      {/* ── 멤버 카드 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {members.map(m => {
          const palette = DOODLE_PALETTE[m.color_key % 8]
          const isMe = me?.id === m.id
          const aboutNotes = notes.filter(n => n.about_id === m.id)
          return (
            <div key={m.id} className="bg-white rounded-xl border border-[#EEF0F2] p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-semibold flex-shrink-0"
                  style={{ background: palette.bg, color: palette.fg }}
                >
                  {m.name.slice(-2, -1) || m.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#1F2933] truncate">
                    {m.name}
                    {isMe && <span className="ml-1.5 text-[11px] font-normal text-[#4C7FE0]">나</span>}
                  </p>
                  <p className="text-[11.5px] text-[#7A8491]">
                    {[m.position, ROLE_LABEL[m.role]].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <p className="text-[11.5px] font-semibold text-[#059669] mb-1">팀에 보태는 것</p>
                  {isMe ? (
                    <textarea
                      key={`gives-${m.id}-${m.gives ?? ''}`}
                      defaultValue={m.gives ?? ''}
                      onBlur={e => { if (e.target.value !== (m.gives ?? '')) saveMemberField(m.id, 'gives', e.target.value) }}
                      rows={2}
                      placeholder="내가 있어서 팀이 덜 걱정하는 부분"
                      className="w-full text-[13px] text-[#3A4249] leading-relaxed border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0] resize-none"
                    />
                  ) : (
                    <p className="text-[13px] text-[#3A4249] leading-relaxed whitespace-pre-wrap">
                      {m.gives || <span className="text-[#C4CBD2]">아직 작성 전</span>}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[11.5px] font-semibold text-[#B45309] mb-1">팀에 기대는 것</p>
                  {isMe ? (
                    <textarea
                      key={`needs-${m.id}-${m.needs ?? ''}`}
                      defaultValue={m.needs ?? ''}
                      onBlur={e => { if (e.target.value !== (m.needs ?? '')) saveMemberField(m.id, 'needs', e.target.value) }}
                      rows={2}
                      placeholder="혼자 하면 느려지는, 누군가 채워주면 좋은 부분"
                      className="w-full text-[13px] text-[#3A4249] leading-relaxed border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0] resize-none"
                    />
                  ) : (
                    <p className="text-[13px] text-[#3A4249] leading-relaxed whitespace-pre-wrap">
                      {m.needs || <span className="text-[#C4CBD2]">아직 작성 전</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[#EEF0F2]">
                <p className="text-[11.5px] font-semibold text-[#1F2933] mb-2">동료가 본 {m.name}</p>
                {aboutNotes.length === 0 && (
                  <p className="text-[12px] text-[#C4CBD2] mb-2">아직 없습니다.</p>
                )}
                <ul className="space-y-1.5 mb-2">
                  {aboutNotes.map(n => {
                    const c = colorOf(n.author_id)
                    return (
                      <li key={n.id} className="flex items-start gap-2 text-[12.5px] group">
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] font-semibold flex-shrink-0 mt-0.5"
                          style={{ background: c.bg, color: c.fg }}
                          title={nameOf(n.author_id)}
                        >
                          {nameOf(n.author_id).slice(-2, -1) || nameOf(n.author_id).slice(0, 1)}
                        </span>
                        <span className="flex-1 text-[#3A4249] leading-relaxed">
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
                  <form onSubmit={e => { e.preventDefault(); addNote(m.id) }} className="flex gap-1.5">
                    <input
                      value={noteDraft[m.id] ?? ''}
                      onChange={e => setNoteDraft(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder={`${m.name} 덕분에 가능했던 것 한 줄`}
                      className="flex-1 text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]"
                    />
                    <button type="submit" disabled={busy || !(noteDraft[m.id] ?? '').trim()} className="text-[12.5px] font-medium text-[#4C7FE0] disabled:opacity-40 px-2">남기기</button>
                  </form>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
