'use client'

// 운동장 공통 모달 — 게임 고르기 로비·대기실을 모두 같은 틀로 보여준다(2026-11-10).
// 예전엔 높이 320px 게임판 안에 떠서 아래(시작 버튼)가 잘리거나 스크롤해야 했고, 게임마다 버튼 위치도 달랐다.
//  · 화면 가운데, 게임판 밖(document.body)에 띄운다
//  · 왼쪽 = 설정·꾸미기·자리 / 오른쪽 열 = 설명 + 시작·참가 버튼 (모든 게임 동일)
//  · 스크롤 없음 — 화면이 낮으면 창 전체를 비율대로 줄인다

import { AR } from './GameArena'
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

const NARROW = 640 // 이보다 좁으면 한 줄 배치(세로 폰)
const MIN_SCALE = 0.8 // 이보다 작게는 줄이지 않고 스크롤

export default function PgModal({ icon, iconBg, title, sub, onClose, left, right, width = 760, rightWidth = 260 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // 2026-11-21 STEP C 휴대폰: 줄이기만 하면 세로 폰(390px)에선 0.5배로 글씨가 안 보였다.
  //  · 폭이 좁으면(NARROW 미만) 한 줄 배치(설정 → 버튼)로 바꾸고 원래 글자 크기 그대로 세로 스크롤
  //  · 넓지만 낮으면(가로 폰) 0.8배 밑으로는 줄이지 않고 세로 스크롤
  const [box, setBox] = useState({ h: 0, scale: 1, narrow: false, scroll: false, w: width })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // offsetHeight는 transform(scale) 영향을 안 받는 원래 높이
    const fit = () => {
      const h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight
      // 좁은 폰이거나, 0.8배로도 폭이 안 들어가는 넓은 창(포격전 로비 1000px 등)이면 한 줄 배치
      if (vw < NARROW || (vw - 32) / width < MIN_SCALE) { setBox({ h, scale: 1, narrow: true, scroll: true, w: vw }); return } // 좁으면 화면 전체 한 장(세로 스크롤)
      const sw = Math.min(1, (vw - 32) / width), sh = (vh - 32) / h
      if (Math.min(sw, sh) >= MIN_SCALE) setBox({ h, scale: Math.min(sw, sh), narrow: false, scroll: false, w: width })
      else setBox({ h, scale: sw, narrow: false, scroll: true, w: width }) // 폭은 맞추고 높이만 스크롤
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [width])

  if (typeof document === 'undefined') return null
  // 2026-11-22 게임 화면(GameArena)과 같은 틀: 남색 위 줄(아이콘 · 제목 · 닫기) + 흰 본문. 좁은 폰은 화면 전체 한 장
  const n = box.narrow
  return createPortal(
    <div className={`fixed inset-0 z-[320] flex justify-center ${n ? 'bg-white' : 'bg-[#0E1726]/70'} ${box.scroll ? `items-start overflow-y-auto overscroll-contain ${n ? '' : 'py-2'}` : 'items-center'}`}
      style={{ height: '100dvh' }}>
      <div className="shrink-0" style={{ width: box.w * box.scale, height: box.h ? box.h * box.scale : undefined }}>
        <div ref={ref} className={`select-none overflow-hidden bg-white text-[12px] ${n ? 'min-h-[100dvh]' : 'rounded-2xl shadow-[0_24px_60px_-18px_rgba(0,0,0,0.6)] ring-1 ring-black/10'}`}
          style={{ width: box.w, transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
          <div className={`flex items-center justify-between gap-3 px-4 ${n ? 'sticky top-0 z-10 h-14' : 'h-14 px-5'}`}
            style={{ background: AR.bg, color: AR.text, paddingTop: n ? 'env(safe-area-inset-top)' : undefined, boxSizing: 'content-box' }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[16px]" style={{ background: iconBg }}>{icon}</span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-extrabold">{title}</p>
                {sub && <p className="mt-0.5 truncate text-[11.5px] font-semibold" style={{ color: AR.muted }}>{sub}</p>}
              </div>
            </div>
            {onClose && (
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClose} aria-label="닫기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[16px] transition-colors hover:bg-white/10" style={{ color: AR.sub }}>✕</button>
            )}
          </div>
          <div className={`grid gap-4 ${n ? 'p-4' : 'p-5'}`} style={{ gridTemplateColumns: n ? 'minmax(0,1fr)' : `minmax(0,1fr) ${rightWidth}px`, paddingBottom: n ? 'max(16px, env(safe-area-inset-bottom))' : undefined }}>
            <div className="flex min-w-0 flex-col gap-2">{left}</div>
            <div className={`flex min-w-0 flex-col gap-1.5 border-[#EEF2F6] ${n ? 'border-t pt-3' : 'border-l pl-4'}`}>{right}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
