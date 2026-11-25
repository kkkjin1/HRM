'use client'

// 🪙 호떡 상점 — 팀 나무에 물 준 만큼(11월부터 1번 = 1코인) 내 코인이 쌓이고, 여럿이 나눠 보태서 집·장난감을 사 준다.
// 물건마다 가격이 다 차면 팀 소유(마당에 놓임). 보탠 사람·금액이 남는다. 판정은 DB pet_fund 가 한다.
import { useEffect, useState } from 'react'
import { COIN_PER_WATER, SHOP, petFund, type PetState, type ShopKey } from '@/lib/pet'

export default function PetShop({ state: s, nameOf, onClose }: { state: PetState; nameOf: (id: string) => string; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const owned = new Set(s.items.map(i => i.item))
  const name = s.pet?.name ?? '호떡'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const give = async (key: ShopKey, label: string, amount: number) => {
    if (busy || amount < 1) return
    setBusy(key)
    const r = await petFund(key, amount)
    setBusy(null)
    if (!r.ok) { setMsg(r.error); return }
    setMsg(r.done ? `🎉 ${label} 완성! 다 같이 사 줬어요 — ${name} 신났어요 🐾` : `${label}에 🪙${r.put} 보탰어요 (${r.funded}/${r.price})`)
  }

  const card = (x: (typeof SHOP)[number]) => {
    const funds = (s.funds ?? []).filter(f => f.item === x.key)
    const funded = funds.reduce((a, f) => a + f.amount, 0)
    const done = owned.has(x.key)
    const left = Math.max(0, x.price - funded)
    const mine = funds.find(f => f.member_id === s.me)?.amount ?? 0
    const pct = done ? 100 : Math.min(100, (funded / x.price) * 100)
    const can = !done && s.coins > 0 && !busy
    return (
      <div key={x.key} className={`rounded-xl border p-2.5 ${done ? 'border-[#CFE6C4] bg-[#F3FAEF]' : 'border-[#EEEEEA]'}`}>
        <div className="flex items-center gap-2">
          <span className="text-[26px] leading-none">{x.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold truncate">{x.label} {done && <span className="text-[#4E7A3E] font-normal">· 팀 소유 ✅</span>}</p>
            <p className="text-[11px] text-[#8A6A1C]">🪙 {done ? x.price : funded} / {x.price}{mine > 0 && <span className="text-[#9C9C96]"> · 내가 {mine}</span>}</p>
          </div>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-[#F1F1ED] overflow-hidden"><div className={`h-full rounded-full ${done ? 'bg-[#7FB46A]' : 'bg-[#F0B43A]'} transition-[width] duration-500`} style={{ width: `${pct}%` }} /></div>
        {funds.length > 0 && <p className="mt-1 text-[10.5px] text-[#9C9C96] truncate">{funds.map(f => `${nameOf(f.member_id)} ${f.amount}`).join(' · ')}</p>}
        {!done && (
          <div className="mt-1.5 flex gap-1">
            {[1, 5].map(n => (
              <button key={n} onClick={() => give(x.key, x.label, n)} disabled={!can || s.coins < Math.min(n, left)}
                className="flex-1 text-[11px] rounded-md border border-[#EAD9A0] bg-[#FFFBEA] hover:bg-[#FFF3C4] py-0.5 disabled:opacity-35">+{n}</button>
            ))}
            <button onClick={() => give(x.key, x.label, Math.min(left, s.coins))} disabled={!can}
              className="flex-1 text-[11px] rounded-md bg-[#F0A24A] text-white py-0.5 disabled:opacity-35" title="남은 금액만큼(내 코인 한도)">
              {s.coins >= left ? '채우기' : '전부'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[75] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[520px] max-h-[88vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[16px] font-bold">🪙 {name} 상점</p>
            <p className="text-[12px] text-[#6B6B66] mt-0.5">팀 나무에 물 주면 🪙{COIN_PER_WATER} · 내 코인 <b className="text-[#8A6A1C]">{s.coins}</b> · 같이 보태서 사요</p>
          </div>
          <button onClick={onClose} className="text-[#9C9C96] hover:text-[#1F1F1D] text-[20px] leading-none" aria-label="닫기">×</button>
        </div>
        <p className="mt-4 mb-1.5 text-[12.5px] font-semibold text-[#6B6B66]">🏠 집 <span className="font-normal text-[#9C9C96]">· 제일 좋은 집 하나가 마당에 놓여요</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{SHOP.filter(x => x.house).map(card)}</div>
        <p className="mt-4 mb-1.5 text-[12.5px] font-semibold text-[#6B6B66]">🎾 장난감 <span className="font-normal text-[#9C9C96]">· 🧸 버튼으로 하루 1번 같이 놀아요</span></p>
        <div className="grid grid-cols-2 gap-2">{SHOP.filter(x => !x.house && !x.deco).map(card)}</div>
        <p className="mt-4 mb-1.5 text-[12.5px] font-semibold text-[#6B6B66]">🌳 마당 꾸미기</p>
        <div className="grid grid-cols-2 gap-2">{SHOP.filter(x => x.deco).map(card)}</div>
        {msg && <p className="mt-3 text-[12px] text-[#8A6A3A]">{msg}</p>}
        <p className="mt-3 text-[11px] text-[#9C9C96]">가격이 다 차면 팀 물건이 돼요 · 보탠 코인은 돌려받을 수 없어요</p>
      </div>
    </div>
  )
}
