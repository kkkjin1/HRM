'use client'

// 팀 나무 계절 도감 → 상단 메뉴줄 "계절 풍경".
// 팀 나무 카드(TeamTree)가 "지금 채우고 있는 계절(가장 최근 이벤트가 들어간 계절)"의 도감 상태를 여기에 알리고,
// 상단 메뉴줄(SeasonHeaderBand)과 글자색 전환(useSeasonHeaderDark)이 그걸 그린다.
// 둘이 page.tsx 안에서 멀리 떨어져 있어서 props로 끌고 다니지 않고 작은 공용 저장소로 잇는다.
// 테마 끄기는 사람마다 다르게 원할 수 있어 내 브라우저(localStorage)에만 저장한다.

import { useSyncExternalStore } from 'react'

export type SeasonThemeState = {
  season: number // 0 봄 · 1 여름 · 2 가을 · 3 겨울 — 지금 채우고 있는 계절
  got: number // 그 계절 도감에서 모은 칸 수 (0~6)
  total: number // 그 계절 도감 칸 수 (6)
  order: string[] // 그 계절에서 모은 아이템 이모지, 모은 순서대로
}

const OFF_KEY = 'hrm.seasonTheme.off'

let state: SeasonThemeState | null = null
let off = false
let offLoaded = false

const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

function readOff() {
  if (!offLoaded) {
    offLoaded = true
    try { off = window.localStorage.getItem(OFF_KEY) === '1' } catch {}
  }
  return off
}

export function publishSeasonTheme(next: SeasonThemeState | null) {
  const key = (s: SeasonThemeState | null) => (s ? `${s.season}:${s.got}/${s.total}:${s.order.join('')}` : '')
  if (key(state) === key(next)) return
  state = next
  emit()
}

export function setSeasonThemeOff(v: boolean) {
  off = v
  offLoaded = true
  try {
    if (v) window.localStorage.setItem(OFF_KEY, '1')
    else window.localStorage.removeItem(OFF_KEY)
  } catch {}
  emit()
}

export function useSeasonTheme(): SeasonThemeState | null {
  return useSyncExternalStore(subscribe, () => state, () => null)
}

export function useSeasonThemeOff(): boolean {
  return useSyncExternalStore(subscribe, readOff, () => false)
}

// 끄지 않았고 1칸 이상 모았을 때만 테마가 켜진다.
export function useActiveSeasonTheme(): (SeasonThemeState & { complete: boolean }) | null {
  const s = useSeasonTheme()
  const isOff = useSeasonThemeOff()
  if (!s || isOff || s.got === 0) return null
  return { ...s, complete: s.got >= s.total }
}
