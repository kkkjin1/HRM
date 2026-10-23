'use client'

// WebGL 사용 가능 여부 — three.js를 불러오지 않는 가벼운 모듈(첫 화면 번들에 three가 섞이지 않게 따로 둔다).
import { useSyncExternalStore } from 'react'

// WebGL을 쓸 수 있는지(한 번만 확인). 안 되거나 렌더러를 만들다 실패하면 false — 2D 그림으로 둔다.
let webglOk: boolean | null = null
const webglListeners = new Set<() => void>()
export function canUseWebGL() {
  if (webglOk !== null) return webglOk
  try {
    const c = document.createElement('canvas')
    webglOk = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webglOk = false
  }
  return webglOk
}
export function markWebGLFailed() {
  webglOk = false
  webglListeners.forEach(f => f())
}
// 사용자가 3D를 끈 경우(가벼운 모드, 이 브라우저에만 저장) — 2D 그림으로 둔다
const OFF_KEY = 'bb3d-off'
let userOff = (() => { try { return typeof window !== 'undefined' && localStorage.getItem(OFF_KEY) === '1' } catch { return false } })()
export function is3DOff() { return userOff }
export function set3DOff(off: boolean) {
  userOff = off
  try { if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY) } catch { /* 저장 못 해도 이번 화면엔 반영 */ }
  webglListeners.forEach(f => f())
}
// 화질 낮춤(진단·저사양용, 이 브라우저에만 저장): 안티앨리어싱 끔 + 1배 해상도
const LO_KEY = 'bb3d-lo'
let lowQ = (() => { try { return typeof window !== 'undefined' && localStorage.getItem(LO_KEY) === '1' } catch { return false } })()
export function is3DLow() { return lowQ }
export function set3DLow(lo: boolean) {
  lowQ = lo
  try { if (lo) localStorage.setItem(LO_KEY, '1'); else localStorage.removeItem(LO_KEY) } catch { /* 이번 화면엔 반영 */ }
  webglListeners.forEach(f => f())
}
export function use3DLow() {
  return useSyncExternalStore(subscribeWebGL, () => lowQ, () => false)
}
export function subscribeWebGL(f: () => void) {
  webglListeners.add(f)
  return () => { webglListeners.delete(f) }
}

// 서버·하이드레이션 땐 false, 브라우저에선 실제 값(만들다 실패하면 false로 바뀐다)
export function useWebGL() {
  return useSyncExternalStore(subscribeWebGL, () => !userOff && canUseWebGL(), () => false)
}
