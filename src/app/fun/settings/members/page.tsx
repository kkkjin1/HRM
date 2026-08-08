'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { ROLE_LABEL, type MemberRole } from '@/lib/data'
import { buildWheel, totalWeight, type RouletteMember } from '@/lib/roulette'
import type { Member } from '@/lib/members'

const ROLES: MemberRole[] = ['lead', 'part_lead', 'member']

function toRouletteMembers(members: Member[]): RouletteMember[] {
  return members.map(m => ({ id: m.id, name: m.name, role: m.role }))
}

function percentTable(members: Member[]) {
  const wheel = buildWheel('meal', toRouletteMembers(members))
  const total = totalWeight(wheel) || 1
  return new Map(wheel.map(s => [s.memberId ?? 'corp', (s.weight / total) * 100]))
}

export default function MembersSettingsPage() {
  const { members, loaded, reload } = useMembers()
  const [pendingRole, setPendingRole] = useState<Record<string, MemberRole>>({})
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null)
  const [leadDeleteAck, setLeadDeleteAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<MemberRole>('member')

  const leadCount = members.filter(m => m.role === 'lead').length

  async function addMember() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('members').insert({ name, role: newRole, color_key: Math.floor(Math.random() * 8) })
    setNewName('')
    setNewRole('member')
    await reload()
    setBusy(false)
  }

  function selectRole(id: string, role: MemberRole) {
    setPendingRole(prev => ({ ...prev, [id]: role }))
  }

  function cancelRoleChange(id: string) {
    setPendingRole(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function saveRoleChange(id: string) {
    const role = pendingRole[id]
    if (!role || busy) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('members').update({ role }).eq('id', id)
    cancelRoleChange(id)
    await reload()
    setBusy(false)
  }

  function openDeleteConfirm(m: Member) {
    setConfirmTarget(m)
    setLeadDeleteAck(false)
  }

  async function performDelete() {
    if (!confirmTarget || busy) return
    if (confirmTarget.role === 'lead' && leadCount === 1 && !leadDeleteAck) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('members').delete().eq('id', confirmTarget.id)
    setConfirmTarget(null)
    await reload()
    setBusy(false)
  }

  const beforePercents = useMemo(() => percentTable(members), [members])

  if (!loaded) {
    return <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>
  }

  return (
    <div className="max-w-[720px] mx-auto p-8 space-y-6 bg-[#F7F7F5] min-h-screen">
      <Link href="/" className="text-[12px] text-[#9C9C96] hover:text-[#5B54C4]">‹ 일상으로 돌아가기</Link>
      <div>
        <h1 className="text-[20px] font-semibold text-[#1F1F1D]">멤버 관리</h1>
        <p className="text-[13px] text-[#6B6B66] mt-1">멤버 구성이 바뀌면 룰렛 확률도 즉시 재계산됩니다.</p>
      </div>

      {members.length < 2 && (
        <div className="bg-[#FBEAF0] border border-[#4B1528]/10 rounded-xl px-4 py-3 text-[13px] text-[#4B1528]">
          멤버가 2명 미만이면 &ldquo;오늘의 한마디&rdquo; 기능이 동작하지 않습니다.
        </div>
      )}

      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4 flex items-center gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="새 멤버 이름"
          className="flex-1 text-[13px] border border-[#E8E8E4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B54C4]"
        />
        <select
          value={newRole}
          onChange={e => setNewRole(e.target.value as MemberRole)}
          className="text-[13px] border border-[#E8E8E4] rounded-lg px-2 py-2 bg-white"
        >
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button
          onClick={addMember}
          disabled={busy || !newName.trim()}
          className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-4 py-2"
        >
          + 추가
        </button>
      </div>

      <div className="bg-white border border-[#E8E8E4] rounded-2xl divide-y divide-[#E8E8E4]">
        {members.length === 0 && (
          <p className="text-[13px] text-[#9C9C96] px-4 py-6">아직 멤버가 없습니다.</p>
        )}
        {members.map(m => {
          const pending = pendingRole[m.id]
          const preview = pending
            ? percentTable(members.map(x => (x.id === m.id ? { ...x, role: pending } : x)))
            : null
          return (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <p className="text-[14px] text-[#1F1F1D] flex-1">{m.name}</p>
                <select
                  value={pending ?? m.role}
                  onChange={e => selectRole(m.id, e.target.value as MemberRole)}
                  className="text-[13px] border border-[#E8E8E4] rounded-lg px-2 py-1.5 bg-white"
                >
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button
                  onClick={() => openDeleteConfirm(m)}
                  className="text-[12.5px] text-[#9C9C96] hover:text-red-500 px-2 py-1"
                >
                  삭제
                </button>
              </div>

              {pending && preview && (
                <div className="mt-3 bg-[#F7F7F5] rounded-xl p-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-[#9C9C96] mb-1.5">변경 전 (밥값 기준)</p>
                    {members.map(x => (
                      <div key={x.id} className="flex justify-between text-[12px] text-[#6B6B66]">
                        <span>{x.name}</span>
                        <span>{(beforePercents.get(x.id) ?? 0).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] text-[#5B54C4] mb-1.5">변경 후</p>
                    {members.map(x => (
                      <div key={x.id} className="flex justify-between text-[12px] text-[#1F1F1D]">
                        <span>{x.name}</span>
                        <span>{(preview.get(x.id) ?? 0).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="col-span-2 flex justify-end gap-2 pt-1">
                    <button onClick={() => cancelRoleChange(m.id)} className="text-[12px] text-[#6B6B66] px-3 py-1.5">취소</button>
                    <button
                      onClick={() => saveRoleChange(m.id)}
                      disabled={busy}
                      className="text-[12px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] rounded-lg px-3 py-1.5"
                    >
                      저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={() => setConfirmTarget(null)}>
          <div className="bg-white rounded-2xl border border-[#E8E8E4] p-5 w-[360px]" onClick={e => e.stopPropagation()}>
            <p className="text-[14px] text-[#1F1F1D] font-medium mb-2">{confirmTarget.name}님을 삭제할까요?</p>
            <p className="text-[13px] text-[#6B6B66] leading-relaxed">
              삭제하면 이 멤버의 낙서·한마디·룰렛 기록이 함께 삭제됩니다.
            </p>

            {confirmTarget.role === 'lead' && leadCount === 1 && (
              <label className="flex items-center gap-2 mt-3 text-[12.5px] text-[#4B1528] bg-[#FBEAF0] rounded-lg px-3 py-2">
                <input type="checkbox" checked={leadDeleteAck} onChange={e => setLeadDeleteAck(e.target.checked)} />
                마지막 팀장(lead)을 삭제합니다. 룰렛 지분이 전원에게 재분배됩니다.
              </label>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmTarget(null)} className="text-[13px] text-[#6B6B66] px-3 py-2">취소</button>
              <button
                onClick={performDelete}
                disabled={busy || (confirmTarget.role === 'lead' && leadCount === 1 && !leadDeleteAck)}
                className="text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 rounded-lg px-4 py-2"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
