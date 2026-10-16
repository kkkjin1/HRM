'use client'

// 홈 2행의 한 칸 "식사" — 오늘의 메뉴(LunchLadder)와 룰렛을 카드 하나에 탭으로 넣는다.
// 예전엔 위아래 2단으로 쌓아 이 칸 때문에 2행 전체가 길어졌다(노트북에서 특히) — 한 번에 하나만 보이게 한다.
// 두 컴포넌트는 탭을 바꿔도 상태(사다리 진행·룰렛 결과)가 유지되도록 숨기기만 한다.
// 안쪽 두 컴포넌트의 자체 카드 테두리·여백은 지워 바깥 카드 하나로 보이게 한다.

import { useEffect, useState } from 'react'
import LunchLadder from '@/components/LunchLadder'
import Roulette from '@/components/Roulette'

// 안쪽 컴포넌트의 루트 카드(bg-white border rounded-2xl p-5)를 바깥 카드에 녹인다.
const UNWRAP = '[&>div]:border-0 [&>div]:bg-transparent [&>div]:rounded-none [&>div]:p-0'
const TAB_KEY = 'hrm_meal_tab'

type Tab = 'menu' | 'roulette'

export default function MenuRouletteTabs() {
  const [tab, setTab] = useState<Tab>('menu')
  // 마지막에 보던 탭 — 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다
      if (window.localStorage.getItem(TAB_KEY) === 'roulette') setTab('roulette')
    } catch {}
  }, [])
  function pick(t: Tab) {
    setTab(t)
    try { window.localStorage.setItem(TAB_KEY, t) } catch {}
  }
  const tabCls = (t: Tab) => `text-[12px] px-2.5 py-1 rounded-full transition-colors ${tab === t ? 'bg-[#EEF1FE] text-[#5B54C4] font-semibold' : 'text-[#9C9C96] hover:text-[#5B54C4]'}`

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 flex-shrink-0">
        <p className="text-[14px] font-semibold text-[#1F1F1D]">🍚 식사</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => pick('menu')} className={tabCls('menu')}>🍽️ 오늘의 메뉴</button>
          <button type="button" onClick={() => pick('roulette')} className={tabCls('roulette')}>🎯 룰렛</button>
        </div>
      </div>
      <section className={tab === 'menu' ? '' : 'hidden'}>
        <div className={UNWRAP}><LunchLadder title={<span />} /></div>
      </section>
      {/* 메뉴 투표가 룰렛으로 스크롤할 때 찾는 앵커 */}
      <section id="fun-roulette" className={tab === 'roulette' ? '' : 'hidden'}>
        <div className={UNWRAP}><Roulette /></div>
      </section>
    </div>
  )
}
