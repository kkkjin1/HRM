'use client'

// 3D 조각 지연 로딩 — three.js(수백 KB)는 야구 화면·장비함을 실제로 열 때만 받는다(첫 화면 번들에서 빼기)
import dynamic from 'next/dynamic'

export const Batter3D = dynamic(() => import('@/components/baseball/three/Player3DView').then(m => m.Batter3D), { ssr: false })
export const Player3DCard = dynamic(() => import('@/components/baseball/three/Player3DView').then(m => m.Player3DCard), { ssr: false })
export { useWebGL } from '@/components/baseball/three/webgl'

// 야구 위젯을 열 때 미리 받아 두면 첫 타석에서 타자가 늦게 뜨지 않는다
export const preload3D = () => { void import('@/components/baseball/three/Player3DView') }
export const Ceremony3D = dynamic(() => import('@/components/baseball/three/Player3DView').then(m => m.Ceremony3D), { ssr: false })
