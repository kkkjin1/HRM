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
export function subscribeWebGL(f: () => void) {
  webglListeners.add(f)
  return () => { webglListeners.delete(f) }
}

// 서버·하이드레이션 땐 false, 브라우저에선 실제 값(만들다 실패하면 false로 바뀐다)
export function useWebGL() {
  return useSyncExternalStore(subscribeWebGL, canUseWebGL, () => false)
}
