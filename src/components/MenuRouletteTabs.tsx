'use client'

// 홈 2행의 한 칸 "식사" — 오늘의 메뉴(LunchLadder)와 룰렛을 카드 하나에 위아래 2단으로 함께 보여준다.
// 안쪽 두 컴포넌트의 자체 카드 테두리·여백은 지워 바깥 카드 하나로 보이게 한다.

import LunchLadder from '@/components/LunchLadder'
import Roulette from '@/components/Roulette'

// 안쪽 컴포넌트의 루트 카드(bg-white border rounded-2xl p-5)를 바깥 카드에 녹인다.
const UNWRAP = '[&>div]:border-0 [&>div]:bg-transparent [&>div]:rounded-none [&>div]:p-0'

export default function MenuRouletteTabs() {
  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col">
      <p className="text-[14px] font-semibold text-[#1F1F1D] mb-3 flex-shrink-0">🍚 식사</p>
      <div>
        <section>
          <div className={UNWRAP}><LunchLadder title={<span className="text-[12px] font-semibold text-[#6B6B66]">🍽️ 오늘의 메뉴</span>} /></div>
        </section>
        {/* 메뉴 투표가 룰렛으로 스크롤할 때 찾는 앵커 */}
        <section id="fun-roulette" className="mt-4 pt-4 border-t border-[#F0F0EC]">
          <p className="text-[12px] font-semibold text-[#6B6B66] mb-2">🎯 룰렛</p>
          <div className={UNWRAP}><Roulette /></div>
        </section>
      </div>
    </div>
  )
}
