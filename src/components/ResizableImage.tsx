'use client'

import { useEffect, useRef, useState } from 'react'

// 붙여넣은 캡처화면을 모서리 드래그로 확대/축소하는 이미지 박스.
// width/height가 바뀌면(다른 메모로 전환 등) 부모가 key를 바꿔 리마운트시키는 방식으로 동기화한다 —
// 다른 uncontrolled 필드들(진행사항 textarea 등)과 동일한 패턴.
export default function ResizableImage({
  src,
  width,
  height,
  onResizeEnd,
  minWidth = 80,
  maxWidth = 640,
  containerRef,
}: {
  src: string
  width: number
  height: number
  onResizeEnd: (width: number, height: number) => void
  minWidth?: number
  maxWidth?: number
  // 담고 있는 칸이 inline-block처럼 이미지 "현재" 크기에 맞춰 줄어드는 경우, 바로 위 부모(parentElement)를
  // 기준으로 삼으면 항상 지금 크기가 상한이 돼버려 못 키운다 — 그럴 땐 실제로 늘어날 수 있는 진짜 폭을
  // 가진 바깥 컨테이너를 직접 넘겨받아 그걸 기준으로 쓴다. 안 넘기면 parentElement로 대체한다.
  containerRef?: React.RefObject<HTMLElement | null>
}) {
  const [size, setSize] = useState({ width, height })
  const ratio = width > 0 ? height / width : 1
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startWidth: number; effectiveMax: number } | null>(null)
  // 드래그 중 최신 크기를 여기 같이 기록해뒀다가 놓는 순간 그대로 쓴다 — setSize 업데이터 함수 안에서
  // onResizeEnd(부모 setState)를 부르면 "렌더링 중에 다른 컴포넌트를 갱신했다" 경고와 함께 무한 렌더
  // 루프로 멈춰버린다(React가 업데이터 함수를 렌더 단계에서도 다시 호출할 수 있기 때문). 그래서 부모
  // setState는 항상 이벤트 핸들러 본문에서 "그냥 호출"만 한다.
  const latestSizeRef = useRef(size)
  // 서랍/크게보기 칸에 맞춰 축소된 썸네일만으로는 전체페이지 캡처처럼 정보가 빽빽한 이미지를 읽기 어렵다 —
  // 더블클릭(또는 🔍 버튼)으로 원본 해상도 그대로(리사이즈 제약 없이) 크게 보는 라이트박스를 띄운다.
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!lightboxOpen) return
    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // 회의수정 서랍도 자기 나름의 ESC 핸들러(window에 별도로 붙어 있음)로 취소/삭제까지 하므로,
      // capture 단계에서 먼저 가로채 멈추지 않으면 라이트박스만 닫으려던 ESC가 서랍까지 닫아버린다.
      e.stopImmediatePropagation()
      setLightboxOpen(false)
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [lightboxOpen])

  function onHandlePointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    // 담고 있는 칸(서랍 안 좁은 칸이든 크게보기 모달이든) 밖으로 삐져나가지 않도록,
    // 드래그를 시작하는 순간의 실제 부모 폭을 상한으로 같이 잡는다 — maxWidth prop은 그 위의 절대 상한선.
    const containerWidth = containerRef?.current?.clientWidth ?? rootRef.current?.parentElement?.clientWidth
    const effectiveMax = containerWidth ? Math.min(maxWidth, containerWidth) : maxWidth
    dragRef.current = { startX: e.clientX, startWidth: size.width, effectiveMax }

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const delta = ev.clientX - dragRef.current.startX
      const nextWidth = Math.min(dragRef.current.effectiveMax, Math.max(minWidth, dragRef.current.startWidth + delta))
      const next = { width: nextWidth, height: Math.round(nextWidth * ratio) }
      latestSizeRef.current = next
      setSize(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onResizeEnd(latestSizeRef.current.width, latestSizeRef.current.height)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={rootRef} className="relative inline-block max-w-full group/resize" style={{ width: size.width, height: size.height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="첨부 이미지"
        draggable={false}
        onDoubleClick={() => setLightboxOpen(true)}
        title="더블클릭하면 원본 크기로 볼 수 있어요"
        className="w-full h-full object-contain rounded-md border border-[#E5E8EB] bg-[#FAFBFB] cursor-zoom-in"
      />
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        title="원본 크기로 크게 보기"
        className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center rounded bg-black/45 text-white text-[11px] leading-none opacity-0 group-hover/resize:opacity-100"
      >🔍</button>
      <div
        onPointerDown={onHandlePointerDown}
        title="드래그해서 크기 조절"
        className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-white border border-[#4C7FE0] cursor-nwse-resize opacity-0 group-hover/resize:opacity-100"
      />

      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[80] overflow-auto"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="min-h-full min-w-full flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="첨부 이미지 원본"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 'none', width: 'auto', height: 'auto' }}
              className="rounded-lg shadow-2xl"
            />
          </div>
          <button
            onClick={() => setLightboxOpen(false)}
            className="fixed top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white text-xl leading-none hover:bg-white/20"
          >×</button>
        </div>
      )}
    </div>
  )
}
