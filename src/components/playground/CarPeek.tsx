'use client'

// 🚗 차고 미리보기(2026-11-24) — 차종 탭에서 차를 누르면 왼쪽에 그 차를 보여 준다. 안 산 차도 볼 수 있다.
//   위 = 3D 회전판(끌어서 돌리기) · 아래 = 그 차 운전석으로 달리는 모습(내 실내 꾸미기를 그 차 등급에 맞춰 적용)

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { H, W } from '@/lib/playground'
import { drawChase, type ChaseCam } from '@/components/playground/raceChase'
import { COCKPIT_CAM, drawCockpit } from '@/components/playground/raceCockpit'
import { useWebGL } from '@/components/baseball/three/lazy'
import { CARS } from '@/lib/raceCars'
import { V_BOOST } from '@/lib/race'
import type { CarLook } from '@/lib/raceGarage'
import type { CabinView } from '@/lib/raceInterior'
import { COURSES, roadOf, themeOf, trackOf } from '@/lib/raceCourses'

const CarTurntable = dynamic(() => import('@/components/playground/race3d/CarTurntable'), { ssr: false })
const COURSE = COURSES[3]
const road = roadOf(11, COURSE), track = trackOf(11, COURSE, 4), theme = themeOf(COURSE)

export default function CarPeek({ car, color, interior, width, height, onClose }: { car: CarLook; color: string; interior: CabinView; width: number; height: number; onClose: () => void }) {
  const gl = useWebGL()
  const info = CARS[car.body]
  const cockH = Math.round(width * (H / W))
  const turnH = height - cockH - 52
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0B1220]">
      <div className="flex items-center justify-between px-3 pt-2">
        <p className="text-[13px] font-black">👀 {info.emoji} {info.name} <span className="text-[11px] font-semibold text-white/50">🪙 {info.price}</span></p>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClose} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold hover:bg-white/20">내 차 보기</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {gl ? <CarTurntable car={car} color={color} width={width} height={turnH} /> : <span className="text-[56px]">{info.emoji}</span>}
      </div>
      <p className="px-3 pb-0.5 text-[10px] font-semibold text-white/50">🪑 운전석 — {info.feel}</p>
      <CockpitRun car={car} interior={interior} width={width} height={cockH} />
    </div>
  )
}

function CockpitRun({ car, interior, width, height }: { car: CarLook; interior: CabinView; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const key = JSON.stringify([car.body, interior])
  const live = useRef({ car, interior })
  useEffect(() => { live.current = { car, interior } })
  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = width * dpr; cv.height = height * dpr
    const { car: c, interior: n } = live.current
    const ride = CARS[c.body].ride, spec = CARS[c.body].spec
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      const wall = now - t0
      const x = 3000 + ((wall * spec.vMax) / 1000) % 12000
      const cam: ChaseCam = { ...COCKPIT_CAM, h: ride.camH, focal: ride.focal - ride.fovKick * 0.6 }
      ctx.setTransform((width / W) * dpr, 0, 0, (height / H) * dpr, 0, 0)
      drawChase(ctx, { w: W, h: H, me: { x, y: 150, v: spec.vMax, fx: '' }, cars: [], mails: [], bananas: [], wall, things: track, shake: 0, t: wall, theme, road, cam })
      const cyc = wall % 9000 // 미리보기: 부스터 → 추월 → 1등 연출을 돌아가며
      const react = { passAt: wall - (cyc - 3000), firstAt: wall - (cyc - 5000) }
      drawCockpit(ctx, n.eq, { me: { x, y: 150, v: cyc < 2000 ? V_BOOST : spec.vMax * 0.92, item: null }, steer: Math.sin(wall / 1400) * 0.3, others: [], rank: 1, total: 4, wall, react }, null, { ...ride, skin: n.skin })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [key, width, height])
  return <canvas ref={ref} style={{ width, height, display: 'block' }} />
}
