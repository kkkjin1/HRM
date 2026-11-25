'use client'

// 🪙 호떡 상점 — 팀 나무에 물 준 만큼(1번 = 10코인) 내 코인이 쌓이고, 그걸로 호떡에게 집·장난감을 사 준다.
// 물건은 팀에 하나씩(먼저 산 사람 이름이 남음). 판정은 DB pet_act('buy')가 한다.
import { useEffect, useState } from 'react'
import { COIN_PER_WATER, SHOP, petAct, type PetState } from '@/lib/pet'

export default function PetShop({ state: s, nameOf, onClose }: { state: PetState; nameOf: (id: string) => string; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const buyer = new Map(s.items.map(i => [i.item, i.member_id]))
  const name = s.pet?.name ?? '호떡'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const buy = async (key: string, label: string) => {
    if (busy) return
    setBusy(key)
    const r = await petAct('buy', key)
    setBusy(null)
    setMsg(r.ok ? `${label} 선물 완료! ${name}이(가) 꼬리를 흔들어요 🐾` : r.error)
  }

  const row = (house: boolean) => SHOP.filter(x => !!x.house === house).map(x => {
    const by = buyer.get(x.key)
    const can = !by && s.coins >= x.price
    return (
      <button key={x.key} onClick={() => can && buy(x.key, x.label)} disabled={!can || !!busy}
        className={`rounded-xl border p-2 text-center transition-colors ${by ? 'border-[#CFE6C4] bg-[#F3FAEF]' : 'border-[#EEEEEA] hover:bg-[#FFF8EC]'} disabled:cursor-default`}>
        <div className={`text-[28px] leading-none ${!by && !can ? 'opacity-40' : ''}`}>{x.icon}</div>
        <p className="mt-1 text-[12px] font-semibold">{x.label}</p>
        <p className="text-[11px] text-[#8A6A1C]">{by ? <span className="text-[#4E7A3E]">{nameOf(by)} 선물</span> : `🪙 ${x.price}`}</p>
      </button>
    )
  })

  return (
    <div className="fixed inset-0 z-[75] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] max-h-[88vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[16px] font-bold">🪙 {name} 상점</p>
            <p className="text-[12px] text-[#6B6B66] mt-0.5">팀 나무에 물 주면 🪙{COIN_PER_WATER} · 내 코인 <b className="text-[#8A6A1C]">{s.coins}</b></p>
          </div>
          <button onClick={onClose} className="text-[#9C9C96] hover:text-[#1F1F1D] text-[20px] leading-none" aria-label="닫기">×</button>
        </div>
        <p className="mt-4 mb-1.5 text-[12.5px] font-semibold text-[#6B6B66]">🏠 집 <span className="font-normal text-[#9C9C96]">· 제일 좋은 집 하나가 마당에 놓여요</span></p>
        <div className="grid grid-cols-3 gap-2">{row(true)}</div>
        <p className="mt-4 mb-1.5 text-[12.5px] font-semibold text-[#6B6B66]">🎾 장난감</p>
        <div className="grid grid-cols-4 gap-2">{row(false)}</div>
        {msg && <p className="mt-3 text-[12px] text-[#8A6A3A]">{msg}</p>}
        <p className="mt-3 text-[11px] text-[#9C9C96]">물건은 팀에 하나씩 — 먼저 사 준 사람 이름이 남아요</p>
      </div>
    </div>
  )
}
