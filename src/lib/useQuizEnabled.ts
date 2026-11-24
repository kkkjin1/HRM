'use client'

// 연상퀴즈 켜기/끄기(팀 공용, 팀장만 바꿈) — team_log_settings 'quiz_enabled'. 값이 없으면 켜짐(예전 그대로).
// 꺼지면 홈 퀴즈 박스·배너·상단 "내 차례" 버튼·평일 10시 자동 시작·퀴즈 화면을 숨긴다. 퀴즈 기록은 그대로 둔다.
// 받기 전에는 꺼진 것으로 본다(켜진 화면이 잠깐 번쩍이지 않게).
import { useEffect, useSyncExternalStore } from 'react'

let enabled = false
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

function load() {
  if (loading) return loading
  loading = fetch('/api/team-settings?key=quiz_enabled')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((j: { ok?: boolean; value?: unknown } | null) => {
      if (j?.ok) { enabled = j.value !== false; loaded = true }
      else loading = null // 실패하면 다음에 다시 받는다(그동안은 꺼진 채)
      emit()
    })
  return loading
}

export async function setQuizEnabled(next: boolean): Promise<boolean> {
  const res = await fetch('/api/team-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'quiz_enabled', value: next }) }).catch(() => null)
  if (!res?.ok) return false
  enabled = next
  loaded = true
  emit()
  return true
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useQuizEnabled(): { enabled: boolean; loaded: boolean } {
  useEffect(() => { void load() }, [])
  const e = useSyncExternalStore(subscribe, () => enabled, () => false)
  const l = useSyncExternalStore(subscribe, () => loaded, () => false)
  return { enabled: e, loaded: l }
}
