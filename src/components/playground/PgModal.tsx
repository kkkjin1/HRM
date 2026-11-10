'use client'

// 운동장 공통 모달 — 게임 고르기 로비·대기실을 모두 같은 틀로 보여준다(2026-11-10).
// 예전엔 높이 320px 게임판 안에 떠서 아래(시작 버튼)가 잘리거나 스크롤해야 했고, 게임마다 버튼 위치도 달랐다.
//  · 화면 가운데, 게임판 밖(document.body)에 띄운다
//  · 왼쪽 = 설정·꾸미기·자리 / 오른쪽 열 = 설명 + 시작·참가 버튼 (모든 게임 동일)
//  · 스크롤 없음 — 화면이 낮으면 창 전체를 비율대로 줄인다

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  icon: string
  iconBg: string
  title: ReactNode
  sub?: ReactNode
  onClose?: () => void // 없으면 ✕ 안 보임(대기실은 '나가기'로 닫는다)
  left: ReactNode
  right: ReactNode
  width?: number
  rightWidth?: number
}

export default function PgModal({ icon, iconBg, title, sub, onClose, left, right, width = 760, rightWidth = 260 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ h: 0, scale: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // offsetHeight는 transform(scale) 영향을 안 받는 원래 높이
    const fit = () => {
      const h = el.offsetHeight
      setBox({ h, scale: Math.min(1, (window.innerWidth - 32) / width, (window.innerHeight - 32) / h) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [width])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0F172A]/30">
      <div style={{ width: width * box.scale, height: box.h ? box.h * box.scale : undefined }}>
        <div ref={ref} className="select-none rounded-2xl bg-white p-5 text-[12px] shadow-[0_24px_60px_-18px_rgba(15,23,42,0.55)] ring-1 ring-black/5"
          style={{ width, transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[16px]" style={{ background: iconBg }}>{icon}</span>
              <div className="min-w-0 leading-tight">
                <p className="text-[14px] font-extrabold text-[#0F172A]">{title}</p>
                {sub && <p className="mt-0.5 text-[11px] font-semibold text-[#64748B]">{sub}</p>}
              </div>
            </div>
            {onClose && (
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClose} aria-label="닫기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[14px] text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155]">✕</button>
            )}
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `minmax(0,1fr) ${rightWidth}px` }}>
            <div className="flex min-w-0 flex-col gap-2">{left}</div>
            <div className="flex min-w-0 flex-col gap-1.5 border-l border-[#EEF2F6] pl-4">{right}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
