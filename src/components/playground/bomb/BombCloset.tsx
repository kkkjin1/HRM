'use client'

// 🧨 폭탄 놀이터 꾸미기 창 — 처음엔 캐릭터 고르기, 그다음부터는 꾸미기 · 🪙 상점 · 🎁 선물.
// 잠긴 부품도 눌러서 입어 볼 수 있고(미리보기), 저장은 가진 부품으로만 된다.
// row가 없으면(옷장 저장소 없음) 모든 부품을 쓸 수 있는 예전 방식으로 동작한다.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Critter, { BACKS, BODY_COLORS, CRITTER_CSS, FACES, HATS, OUTFITS, SPECIES, type CritterLook, type Species } from './Critter'
import { BOMB_REWARD_TEXT, PART_PRICE, partState, type ClosetRow, type PartState } from '@/lib/bombCloset'

type Tab = 'species' | 'hat' | 'face' | 'outfit' | 'back' | 'gift'
const SLOT_TABS: [Exclude<Tab, 'species' | 'gift'>, string][] = [['hat', '모자'], ['face', '얼굴'], ['outfit', '옷'], ['back', '등']]
const ALL_PARTS = [...HATS, ...FACES, ...OUTFITS, ...BACKS] as [string, string][]
const nameOf = (part: string) => ALL_PARTS.find(([k]) => k === part)?.[1] ?? part

export default function BombCloset(props: {
  initial: CritterLook | null
  row: ClosetRow | null
  members: { id: string; name: string }[] // 선물 받을 수 있는 동료(나 빼고)
  onSave: (look: CritterLook) => Promise<string | null>
  onBuy: (part: string) => Promise<string | null>
  onGift: (to: string, part: string, message: string) => Promise<string | null>
  onClose: () => void
}) {
  const { row } = props
  const first = !props.initial
  const [look, setLook] = useState<CritterLook>(() => props.initial ?? { species: 'cheeseCat' })
  const [tab, setTab] = useState<Tab>('species')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null)
  const set = (patch: Partial<CritterLook>) => { setLook(l => ({ ...l, ...patch })); setNote(null) }
  const sp = SPECIES.find(s => s.key === look.species)!
  const stateOf = (part: string): PartState => (row ? partState(row, part) : { kind: 'have' })
  const worn = ([look.hat, look.face, look.outfit, look.back] as (string | undefined)[]).filter((p): p is string => !!p && p !== 'none')
  const locked = worn.filter(p => stateOf(p).kind !== 'have')
  const parts = tab === 'hat' ? HATS : tab === 'face' ? FACES : tab === 'outfit' ? OUTFITS : tab === 'back' ? BACKS : null

  const run = async (fn: () => Promise<string | null>, okText: string) => {
    setBusy(true)
    const err = await fn()
    setBusy(false)
    setNote(err ? { text: err, ok: false } : { text: okText, ok: true })
    return !err
  }

  return createPortal(
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/55 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !first) props.onClose() }}>
      <style>{CRITTER_CSS}</style>
      <div className="flex max-h-[92vh] w-[800px] max-w-full flex-col overflow-hidden rounded-3xl bg-[#FFF8EF] shadow-2xl" style={{ color: '#3d2b2b' }}>
        <div className="flex items-center gap-3 px-5 pt-4">
          <p className="text-[17px] font-extrabold">{first ? '🧨 처음 만나는 친구를 골라요' : '🧨 내 캐릭터 꾸미기'}</p>
          {row && <span className="rounded-full bg-[#FFE9A8] px-2.5 py-0.5 text-[13px] font-extrabold text-[#8a5a00]">🪙 {row.coins}</span>}
          <div className="flex-1" />
          {!first && <button type="button" onClick={props.onClose} className="rounded-full px-2 text-[18px] text-[#8a7a70] hover:bg-black/5">✕</button>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-2 rounded-2xl bg-white p-4 sm:w-[230px]" style={{ boxShadow: '0 4px 14px rgba(120,90,60,.12)' }}>
            <div className="flex h-[210px] items-end justify-center rounded-2xl" style={{ background: 'radial-gradient(circle,#fff3e0 0,#fff 70%)' }}>
              <Critter look={look} size={180} />
            </div>
            <p className="text-[16px] font-extrabold">{sp.name}</p>
            {row && (
              <div className="w-full rounded-xl bg-[#FFF8EF] px-3 py-2 text-[11px] leading-relaxed text-[#7a6a60]">
                <p className="font-bold text-[#3d2b2b]">내 기록 · {row.games}판</p>
                <p>🏆 {row.wins}승 · 💖 구출 {row.rescues} · 💥 터뜨림 {row.pops} · 앗 {row.hits}</p>
              </div>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-white/80 p-1">
              {([['species', '캐릭터·색'], ...SLOT_TABS, ...(row && !first ? [['gift', '🎁 선물'] as [Tab, string]] : [])] as [Tab, string][]).map(([k, n]) => (
                <button key={k} type="button" onClick={() => { setTab(k); setNote(null) }}
                  className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] font-bold ${tab === k ? 'bg-[#FF8A5C] text-white' : 'text-[#7a6a60] hover:bg-black/5'}`}>{n}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1" style={{ maxHeight: 380 }}>
              {tab === 'species' && (
                <>
                  <div className="grid grid-cols-6 gap-2">
                    {SPECIES.map(s => (
                      <button key={s.key} type="button" onClick={() => set({ species: s.key as Species, color: undefined })}
                        className="flex flex-col items-center rounded-2xl bg-white px-1 pb-1.5 pt-2"
                        style={{ border: look.species === s.key ? '3px solid #FF8A5C' : '3px solid transparent', boxShadow: '0 2px 8px rgba(120,90,60,.1)' }}>
                        <Critter look={{ species: s.key }} size={56} animate={false} />
                        <span className="mt-0.5 whitespace-nowrap text-[10.5px] font-bold">{s.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mb-1.5 mt-3 text-[12px] font-bold opacity-60">몸 색 (모두 무료)</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => set({ color: undefined })} title="기본 색"
                      className="h-7 rounded-full bg-white px-2 text-[11px] font-bold" style={{ border: !look.color ? '3px solid #FF8A5C' : '2px solid #e5d9cf' }}>기본</button>
                    {BODY_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => set({ color: c })}
                        className="h-7 w-7 rounded-full" style={{ background: c, border: look.color === c ? '3px solid #FF8A5C' : '2px solid #e5d9cf' }} />
                    ))}
                  </div>
                </>
              )}
              {parts && tab !== 'species' && tab !== 'gift' && (
                <div className="grid grid-cols-4 gap-2">
                  {parts.map(([k, n]) => {
                    const preview: CritterLook = { ...look, [tab]: k }
                    const on = (look[tab] ?? 'none') === k
                    const st = stateOf(k)
                    return (
                      <button key={k} type="button" onClick={() => set({ [tab]: k } as Partial<CritterLook>)}
                        className="relative flex flex-col items-center rounded-2xl bg-white px-1 pb-1.5 pt-2"
                        style={{ border: on ? '3px solid #FF8A5C' : '3px solid transparent', boxShadow: '0 2px 8px rgba(120,90,60,.1)' }}>
                        <div style={{ opacity: st.kind === 'have' ? 1 : 0.55 }}><Critter look={preview} size={60} animate={false} /></div>
                        <span className="mt-0.5 text-[11px] font-bold">{n}</span>
                        <Badge st={st} />
                      </button>
                    )
                  })}
                </div>
              )}
              {tab === 'gift' && row && <GiftTab row={row} members={props.members} busy={busy} onGift={(to, part, msg) => run(() => props.onGift(to, part, msg), `🎁 ${props.members.find(m => m.id === to)?.name ?? ''}님에게 ${nameOf(part)}을(를) 보냈어요!`)} />}
            </div>
            {row && tab !== 'gift' && <p className="mt-2 text-[10.5px] leading-relaxed text-[#9a8a80]">{BOMB_REWARD_TEXT}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#f0e3d6] px-5 py-3">
          {note ? (
            <span className={`mr-auto text-[12px] font-bold ${note.ok ? 'text-[#2f9e5a]' : 'text-[#d9481c]'}`}>{note.text}</span>
          ) : locked.length > 0 ? (
            <span className="mr-auto text-[12px] text-[#d9481c]">🔒 {locked.map(nameOf).join(', ')} — 사거나 빼야 저장돼요</span>
          ) : first ? (
            <span className="mr-auto text-[12px] opacity-60">나중에 언제든 다시 꾸밀 수 있어요</span>
          ) : <span className="mr-auto" />}
          {locked.filter(p => stateOf(p).kind === 'shop').map(p => (
            <button key={p} type="button" disabled={busy || (row?.coins ?? 0) < (PART_PRICE[p] ?? 0)}
              onClick={() => void run(() => props.onBuy(p), `🎉 ${nameOf(p)}을(를) 샀어요!`)}
              className="rounded-full bg-[#FFE9A8] px-3 py-1.5 text-[12.5px] font-extrabold text-[#8a5a00] disabled:opacity-40">🪙 {PART_PRICE[p]} {nameOf(p)} 사기</button>
          ))}
          {!first && <button type="button" onClick={props.onClose} className="rounded-full border-2 border-[#eee2d8] bg-white px-4 py-1.5 text-[13px] font-bold">닫기</button>}
          <button type="button" disabled={busy || locked.length > 0}
            onClick={() => { void (async () => { setBusy(true); const err = await props.onSave(look); setBusy(false); if (err) setNote({ text: err, ok: false }) })() }}
            className="rounded-full bg-[#FF8A5C] px-5 py-1.5 text-[13px] font-extrabold text-white disabled:opacity-40">{first ? '이 친구로 할래요!' : '저장'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Badge({ st }: { st: PartState }) {
  if (st.kind === 'have') return null
  if (st.kind === 'shop')
    return <span className="absolute right-1 top-1 rounded-full bg-[#FFE9A8] px-1.5 text-[10px] font-extrabold text-[#8a5a00]">🪙{st.price}</span>
  return (
    <span className="absolute right-1 top-1 whitespace-nowrap rounded-full bg-[#EAF2FF] px-1.5 text-[9.5px] font-bold text-[#2f63c0]" title={`업적: ${st.label}`}>
      🔒 {st.short} {st.cur}/{st.need}
    </span>
  )
}

function GiftTab({ row, members, busy, onGift }: { row: ClosetRow; members: { id: string; name: string }[]; busy: boolean; onGift: (to: string, part: string, msg: string) => Promise<boolean> }) {
  const [to, setTo] = useState(members[0]?.id ?? '')
  const [part, setPart] = useState<string>('')
  const [msg, setMsg] = useState('')
  const shop = ALL_PARTS.filter(([k]) => (PART_PRICE[k] ?? 0) > 0)
  if (!members.length) return <p className="py-8 text-center text-[13px] opacity-60">선물할 동료가 없어요</p>
  return (
    <div className="flex flex-col gap-3 text-[12.5px]">
      <p className="text-[11.5px] text-[#7a6a60]">내 🪙로 상점 부품을 사서 동료에게 보내요. 받은 사람은 바로 입을 수 있어요. (이미 가진 부품은 못 보내요)</p>
      <div className="flex flex-wrap gap-1.5">
        {members.map(m => (
          <button key={m.id} type="button" onClick={() => setTo(m.id)}
            className="rounded-full bg-white px-3 py-1 font-bold" style={{ border: to === m.id ? '2.5px solid #FF8A5C' : '2px solid #eee2d8' }}>{m.name}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {shop.map(([k, n]) => (
          <button key={k} type="button" onClick={() => setPart(k)} disabled={row.coins < PART_PRICE[k]}
            className="flex items-center justify-between rounded-xl bg-white px-2 py-1.5 font-bold disabled:opacity-40" style={{ border: part === k ? '2.5px solid #FF8A5C' : '2px solid transparent' }}>
            <span>{n}</span><span className="text-[10.5px] text-[#8a5a00]">🪙{PART_PRICE[k]}</span>
          </button>
        ))}
      </div>
      <input value={msg} onChange={e => setMsg(e.target.value.slice(0, 60))} placeholder="한마디 (선택, 60자)" className="rounded-xl border-2 border-[#eee2d8] bg-white px-3 py-1.5 outline-none focus:border-[#FF8A5C]" />
      <button type="button" disabled={busy || !to || !part}
        onClick={() => { void onGift(to, part, msg).then(ok => { if (ok) { setPart(''); setMsg('') } }) }}
        className="self-end rounded-full bg-[#FF8A5C] px-5 py-1.5 font-extrabold text-white disabled:opacity-40">🎁 {part ? `🪙${PART_PRICE[part]} 보내기` : '부품을 골라요'}</button>
    </div>
  )
}
