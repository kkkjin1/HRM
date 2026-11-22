'use client'

// 터치 기기(휴대폰·태블릿)용 조작 버튼 — 화면 왼쪽 아래 조이스틱, 오른쪽 아래 큰 🅰(= Space)와 ↵(= Enter).
// (2026-11-19 ▲▼·Enter 추가 — 광장 위아래 이동, 축구·폭탄 상하 이동, 야구 투수 Enter)
// 키보드 이벤트를 그대로 흉내 내서 운동장·대결 화면의 기존 키 처리(화살표·Space·Enter)를 그대로 쓴다.
//   ◀ ▶ 누르고 있기 = 걷기 / 번갈아 탭 = 컬링 스위핑 / 방향 누른 채 🅰 = 돌진·막기·드롭샷 같은 조합 기술
// 위젯(운동장 창)은 화면 폭에 맞춰 축소되지만 이 버튼은 축소 밖(고정 위치)에 그려서 손가락 크기를 유지한다.

import { useEffect, useState } from 'react'
import { Joystick } from './GameArena'

const DIR = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const

const isTouch = () => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)
const isPortrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth

function fire(type: 'keydown' | 'keyup', key: string) {
  window.dispatchEvent(new KeyboardEvent(type, { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true }))
}

function PadButton({ k, label, size = 'md' }: { k: string; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const [down, setDown] = useState(false)
  const release = () => { if (!down) return; setDown(false); fire('keyup', k) }
  return (
    <button type="button" aria-label={label}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDown(true); fire('keydown', k) }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onContextMenu={e => e.preventDefault()}
      className={`flex touch-none select-none items-center justify-center rounded-full border-2 border-white/70 font-black text-white shadow-lg ${size === 'lg' ? 'h-20 w-20 text-[26px]' : size === 'sm' ? 'h-12 w-12 text-[20px]' : 'h-14 w-14 text-[22px]'} ${down ? 'bg-black/70 scale-95' : 'bg-black/40'}`}
      style={{ WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none' }}>
      {label}
    </button>
  )
}

export default function TouchPad() {
  const [touch] = useState(isTouch)
  const [portrait, setPortrait] = useState(isPortrait)
  useEffect(() => {
    const on = () => setPortrait(isPortrait())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on) }
  }, [])
  if (!touch) return null
  return (
    <>
      {portrait && (
        <div className="pointer-events-none fixed left-1/2 top-2 z-[70] -translate-x-1/2 rounded-full bg-[#1F2933]/85 px-3 py-1 text-[12px] font-semibold text-white shadow">
          📱 가로로 돌리면 더 크게 보여요
        </div>
      )}
      {/* 조이스틱(2026-11-22 십자 버튼 대신) — 끄는 방향의 화살표 키를 누른 것처럼 */}
      <div className="fixed bottom-3 left-3 z-[70]">
        <Joystick size={132} mode="eight" onDir={(d, v) => fire(v ? 'keydown' : 'keyup', DIR[d])} />
      </div>
      <div className="fixed bottom-4 right-4 z-[70] flex items-end gap-3">
        <PadButton k="Enter" label="↵" size="sm" />
        <PadButton k=" " label="A" size="lg" />
      </div>
    </>
  )
}
