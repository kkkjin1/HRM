'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAllMembers } from '@/lib/useMembers'
import AdminGiftPanel from '@/components/baseball/AdminGiftPanel'
import { BASEBALL_ADMIN_EMAIL } from '@/lib/baseball'
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

// 팀원 관리 쓰기는 모두 서버(/api/members-admin)가 권한을 다시 확인한 뒤 처리한다.
async function adminRequest(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  const res = await fetch('/api/members-admin', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({ ok: false }))
  return json.ok ? null : (json.error as string | undefined) ?? '저장하지 못했습니다'
}

type Account = { id: string; name: string; email: string }

// 접근 가능 여부는 서버가 정한다(로그인 계정 id로 연결된 팀원의 팀원 관리 권한). 같은 응답으로 계정 연결 목록도 받는다.
// email은 야구 관리자 패널 표시에만 쓴다(그 패널의 권한은 DB 정책이 따로 확인).
function useAccessCheck() {
  const [email, setEmail] = useState<string | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [links, setLinks] = useState<Record<string, string | null>>({})

  const fetchAdmin = () => fetch('/api/members-admin').then(r => r.json()).catch(() => null)

  const reloadLinks = useCallback(async () => {
    const json = await fetchAdmin()
    if (json?.ok) { setAccounts(json.accounts ?? []); setLinks(json.links ?? {}) }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([createClient().auth.getUser(), fetchAdmin()]).then(([{ data }, json]) => {
      if (!active) return
      setEmail(data.user?.email ?? null)
      if (json?.ok) { setAccounts(json.accounts ?? []); setLinks(json.links ?? {}) }
      setAllowed(!!json?.ok)
      setChecked(true)
    })
    return () => { active = false }
  }, [])

  return { allowed, checked, email, accounts, links, reloadLinks }
}

export default function MembersSettingsPage() {
  const { allowed, checked, email, accounts, links, reloadLinks } = useAccessCheck()
  const { members, loaded, reload } = useAllMembers()
  const [pendingRole, setPendingRole] = useState<Record<string, MemberRole>>({})
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null)
  const [leadDeleteAck, setLeadDeleteAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<MemberRole>('member')
  const [newPosition, setNewPosition] = useState('')
  const [newHiredAt, setNewHiredAt] = useState('')
  const [newBirthday, setNewBirthday] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const leadCount = members.filter(m => m.role === 'lead').length

  async function addMember() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    const err = await adminRequest('POST', {
      name,
      role: newRole,
      position: newPosition.trim() || null,
      hired_at: newHiredAt || null,
      birthday: newBirthday || null,
    })
    setErrorMsg(err ?? '')
    if (err) { setBusy(false); return }
    setNewName('')
    setNewRole('member')
    setNewPosition('')
    setNewHiredAt('')
    setNewBirthday('')
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
    const err = await adminRequest('PATCH', { id, role })
    setErrorMsg(err ?? '')
    cancelRoleChange(id)
    await reload()
    setBusy(false)
  }

  async function saveField(id: string, field: 'name' | 'nickname' | 'position' | 'hired_at' | 'birthday', value: string | null) {
    setErrorMsg(await adminRequest('PATCH', { id, field, value }) ?? '')
    await reload()
  }

  async function saveLink(id: string, authUserId: string | null) {
    setErrorMsg(await adminRequest('PATCH', { id, auth_user_id: authUserId }) ?? '')
    await reloadLinks()
  }

  function openDeleteConfirm(m: Member) {
    setConfirmTarget(m)
    setLeadDeleteAck(false)
  }

  // 삭제 대신 퇴사 처리 — 행을 지우면 CASCADE로 기록이 사라져서, 퇴사일만 남기고 앱 명단에서 뺀다.
  async function performDelete() {
    if (!confirmTarget || busy) return
    if (confirmTarget.role === 'lead' && leadCount === 1 && !leadDeleteAck) return
    setBusy(true)
    setErrorMsg(await adminRequest('PATCH', { id: confirmTarget.id, leave: true }) ?? '')
    setConfirmTarget(null)
    await reload()
    setBusy(false)
  }

  const beforePercents = useMemo(() => percentTable(members), [members])

  if (!checked) {
    return <p className="text-[13px] text-[#9C9C96] p-8">불러오는 중...</p>
  }

  if (!allowed) {
    return (
      <div className="max-w-[480px] mx-auto p-8 space-y-4 bg-[#F7F7F5] min-h-screen">
        <Link href="/" className="text-[12px] text-[#9C9C96] hover:text-[#5B54C4]">‹ 일상으로 돌아가기</Link>
        <div className="bg-white border border-[#E8E8E4] rounded-2xl p-6">
          <p className="text-[14px] text-[#1F1F1D] font-medium mb-1">접근 권한이 없습니다</p>
          <p className="text-[13px] text-[#6B6B66]">멤버 관리는 팀장/파트장 계정만 사용할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  if (!loaded) {
    return <p className="text-[13px] text-[#9C9C96] p-8">불러오는 중...</p>
  }

  return (
    <div className="max-w-[720px] mx-auto p-8 space-y-6 bg-[#F7F7F5] min-h-screen">
      <Link href="/" className="text-[12px] text-[#9C9C96] hover:text-[#5B54C4]">‹ 일상으로 돌아가기</Link>
      <div>
        <h1 className="text-[20px] font-semibold text-[#1F1F1D]">멤버 관리</h1>
        <p className="text-[13px] text-[#6B6B66] mt-1">멤버 구성이 바뀌면 룰렛 확률도 즉시 재계산됩니다.</p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-600">{errorMsg}</div>
      )}

      {members.length < 2 && (
        <div className="bg-[#FBEAF0] border border-[#4B1528]/10 rounded-xl px-4 py-3 text-[13px] text-[#4B1528]">
          멤버가 2명 미만이면 &ldquo;오늘의 한마디&rdquo; 기능이 동작하지 않습니다.
        </div>
      )}

      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2">
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
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newPosition}
            onChange={e => setNewPosition(e.target.value)}
            placeholder="직책 (예: 매니저, 사원)"
            className="flex-1 text-[13px] border border-[#E8E8E4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B54C4]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[#9C9C96] px-0.5">입사일</span>
            <input
              type="date"
              value={newHiredAt}
              onChange={e => setNewHiredAt(e.target.value)}
              className="text-[13px] border border-[#E8E8E4] rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[#9C9C96] px-0.5">🎂 생일</span>
            <input
              type="date"
              value={newBirthday}
              onChange={e => setNewBirthday(e.target.value)}
              className="text-[13px] border border-[#E8E8E4] rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <button
            onClick={addMember}
            disabled={busy || !newName.trim()}
            className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-4 py-2 flex-shrink-0"
          >
            + 추가
          </button>
        </div>
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
                <input
                  key={`name-${m.id}-${m.name}`}
                  defaultValue={m.name}
                  onBlur={e => {
                    const v = e.target.value.trim()
                    if (v && v !== m.name) saveField(m.id, 'name', v)
                  }}
                  className="flex-1 text-[14px] text-[#1F1F1D] border border-transparent hover:border-[#E8E8E4] focus:border-[#5B54C4] rounded-lg px-2 py-1 -mx-2 focus:outline-none"
                />
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
                  퇴사 처리
                </button>
              </div>

              {/* 로그인 계정 연결 — 연결 안 된 사람은 본인 정보 저장·팀원 권한이 모두 거부된다 */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-[#9C9C96] flex-shrink-0">로그인 계정</span>
                <select
                  value={links[m.id] ?? ''}
                  onChange={e => saveLink(m.id, e.target.value || null)}
                  className={`flex-1 text-[12.5px] border rounded-lg px-2 py-1.5 bg-white ${links[m.id] ? 'border-[#E8E8E4]' : 'border-amber-300 text-amber-700'}`}
                >
                  <option value="">연결 안 됨 — 이 사람은 본인 정보를 저장할 수 없습니다</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} disabled={Object.entries(links).some(([mid, uid]) => uid === a.id && mid !== m.id)}>
                      {a.name || '(이름 없음)'} · {a.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  key={`nickname-${m.id}-${m.nickname ?? ''}`}
                  defaultValue={m.nickname ?? ''}
                  onBlur={e => {
                    const v = e.target.value.trim() || null
                    if (v !== m.nickname) saveField(m.id, 'nickname', v)
                  }}
                  placeholder="닉네임 (앱 전체에 표시)"
                  className="flex-1 text-[12.5px] border border-[#E8E8E4] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5B54C4]"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  key={`pos-${m.id}-${m.position ?? ''}`}
                  defaultValue={m.position ?? ''}
                  onBlur={e => {
                    const v = e.target.value.trim() || null
                    if (v !== m.position) saveField(m.id, 'position', v)
                  }}
                  placeholder="직책"
                  className="flex-1 text-[12.5px] border border-[#E8E8E4] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5B54C4]"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9.5px] text-[#B0B0AA] px-0.5">입사일</span>
                  <input
                    key={`hire-${m.id}-${m.hired_at ?? ''}`}
                    type="date"
                    defaultValue={m.hired_at ?? ''}
                    onBlur={e => {
                      const v = e.target.value || null
                      if (v !== m.hired_at) saveField(m.id, 'hired_at', v)
                    }}
                    className="text-[12.5px] border border-[#E8E8E4] rounded-lg px-2.5 py-1.5 bg-white"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9.5px] text-[#B0B0AA] px-0.5">🎂 생일</span>
                  <input
                    key={`bday-${m.id}-${m.birthday ?? ''}`}
                    type="date"
                    defaultValue={m.birthday ?? ''}
                    onBlur={e => {
                      const v = e.target.value || null
                      if (v !== m.birthday) saveField(m.id, 'birthday', v)
                    }}
                    className="text-[12.5px] border border-[#E8E8E4] rounded-lg px-2.5 py-1.5 bg-white"
                  />
                </div>
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

      {email === BASEBALL_ADMIN_EMAIL && <AdminGiftPanel />}

      {confirmTarget && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={() => setConfirmTarget(null)}>
          <div className="bg-white rounded-2xl border border-[#E8E8E4] p-5 w-[360px]" onClick={e => e.stopPropagation()}>
            <p className="text-[14px] text-[#1F1F1D] font-medium mb-2">{confirmTarget.name}님을 퇴사 처리할까요?</p>
            <p className="text-[13px] text-[#6B6B66] leading-relaxed">
              오늘 날짜로 퇴사 처리되어 앱 명단과 룰렛에서 빠집니다. 지금까지의 기록은 지우지 않고 보존합니다.
            </p>

            {confirmTarget.role === 'lead' && leadCount === 1 && (
              <label className="flex items-center gap-2 mt-3 text-[12.5px] text-[#4B1528] bg-[#FBEAF0] rounded-lg px-3 py-2">
                <input type="checkbox" checked={leadDeleteAck} onChange={e => setLeadDeleteAck(e.target.checked)} />
                마지막 팀장(lead)을 퇴사 처리합니다. 룰렛 지분이 전원에게 재분배됩니다.
              </label>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmTarget(null)} className="text-[13px] text-[#6B6B66] px-3 py-2">취소</button>
              <button
                onClick={performDelete}
                disabled={busy || (confirmTarget.role === 'lead' && leadCount === 1 && !leadDeleteAck)}
                className="text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 rounded-lg px-4 py-2"
              >
                퇴사 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
