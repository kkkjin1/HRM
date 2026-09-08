'use client'

import { useRef, useState } from 'react'

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
        className="w-full h-full object-contain rounded-md border border-[#E5E8EB] bg-[#FAFBFB]"
      />
      <div
        onPointerDown={onHandlePointerDown}
        title="드래그해서 크기 조절"
        className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-white border border-[#4C7FE0] cursor-nwse-resize opacity-0 group-hover/resize:opacity-100"
      />
    </div>
  )
}
