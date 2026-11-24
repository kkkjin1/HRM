'use client'

// 🚗 내 차 회전판 — 운동장 PC 광장 왼쪽 차고 칸(2026-11-24). 레이스와 같은 3D 차(buildKart3D)가 제자리에서 천천히 360도 돈다.
// 바탕은 투명(칸 색이 비친다). 캐릭터 카드처럼 끌면 직접 돌린다. 만들다 실패하면 markWebGLFailed → 부모가 그림 글자로 대신한다.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildKart3D } from '@/components/playground/race3d/kart3d'
import { markWebGLFailed } from '@/components/baseball/three/webgl'
import type { CarLook } from '@/lib/raceGarage'

export default function CarTurntable({ car, color, width, height }: { car: CarLook; color: string; width: number; height: number }) {
  const host = useRef<HTMLDivElement | null>(null)
  const key = JSON.stringify([car, color])
  const carRef = useRef({ car, color })
  useEffect(() => { carRef.current = { car, color } })

  useEffect(() => {
    const el = host.current
    if (!el) return
    const canvas = document.createElement('canvas')
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' })
    el.appendChild(canvas)
    let r: THREE.WebGLRenderer
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      canvas.remove(); markWebGLFailed(); return
    }
    r.setClearColor(0x000000, 0)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    r.setSize(width, height, false)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#F8FAFC', '#334155', 1.5))
    const sun = new THREE.DirectionalLight('#FFFFFF', 2.2)
    sun.position.set(4, 8, 5)
    scene.add(sun)
    const rim = new THREE.DirectionalLight('#93C5FD', 1.0)
    rim.position.set(-5, 3, -4)
    scene.add(rim)

    // 회전판(어두운 원판 + 밝은 테)
    const discG = new THREE.CylinderGeometry(1.9, 1.9, 0.08, 48), discM = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.5, metalness: 0.4 })
    const disc = new THREE.Mesh(discG, discM); disc.position.y = -0.04; scene.add(disc)
    const ringG = new THREE.TorusGeometry(1.9, 0.03, 8, 64), ringM = new THREE.MeshBasicMaterial({ color: '#60A5FA' })
    const ring = new THREE.Mesh(ringG, ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; scene.add(ring)

    const kart = buildKart3D(carRef.current.car, carRef.current.color)
    const turn = new THREE.Group()
    turn.add(kart.group)
    scene.add(turn)

    const cam = new THREE.PerspectiveCamera(30, width / height, 0.1, 50)
    cam.position.set(0, 2.6, 6.2)
    cam.lookAt(0, 0.55, 0)

    let angle = 0.6
    let drag: { x: number; a: number } | null = null
    let idleSince = 0
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(64, t - last)
      last = t
      if (!drag && t - idleSince > 1200) angle += dt * 0.0009
      turn.rotation.y = angle
      disc.rotation.y = angle
      kart.update(t / 1000) // 초 단위(깃발·불꽃·오라 애니메이션)
      r.render(scene, cam)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    let moved = false // 끌어서 돌렸으면 그 뒤 click은 버린다(차고로 들어가지 않게)
    const down = (e: PointerEvent) => { drag = { x: e.clientX, a: angle }; moved = false; canvas.setPointerCapture(e.pointerId); e.stopPropagation() }
    const move = (e: PointerEvent) => { if (drag) { angle = drag.a + (e.clientX - drag.x) * 0.012; if (Math.abs(e.clientX - drag.x) > 4) moved = true } }
    const click = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault() } moved = false }
    const up = () => { drag = null; idleSince = performance.now() }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('click', click)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('click', click)
      kart.dispose()
      discG.dispose(); discM.dispose(); ringG.dispose(); ringM.dispose()
      r.dispose()
      r.forceContextLoss()
      canvas.remove()
    }
  }, [key, width, height])

  return <div ref={host} title="끌어서 돌려보기" style={{ width, height }} />
}
