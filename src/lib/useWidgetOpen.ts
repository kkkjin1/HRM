'use client'

// 화면 구석에 떠 있는 위젯(익명 채팅·내 액션아이템)의 펼침/접힘 상태.
// 노트북(100% 배율)에서는 위젯이 홈 카드 위를 덮어서, 넓은 화면이 아니면 기본으로 접어 작은 버튼만 둔다.
// 사용자가 직접 펼치거나 접으면 그 선택을 기억한다(위젯별).
import { useEffect, useState } from 'react'

const WIDE_MIN_WIDTH = 1600

export function useWidgetOpen(key: string): [boolean, (open: boolean) => void] {
  const storageKey = `hrm_widget_open:${key}`
  const [open, setOpenState] = useState(false)

  // 서버 렌더와 어긋나지 않게 마운트 뒤에 정한다.
  useEffect(() => {
    let saved: string | null = null
    try { saved = window.localStorage.getItem(storageKey) } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 폭·저장값은 마운트 뒤에만 읽을 수 있다
    setOpenState(saved === null ? window.innerWidth >= WIDE_MIN_WIDTH : saved === '1')
  }, [storageKey])

  function setOpen(next: boolean) {
    setOpenState(next)
    try { window.localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
  }

  return [open, setOpen]
}
