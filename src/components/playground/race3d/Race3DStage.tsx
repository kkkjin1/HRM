'use client'

// 🏎 퇴근 레이싱 3D 무대 — 모집 중 쇼룸(출발선 차들 주위를 카메라가 한 바퀴)과 시상식(단상 3개 주위를 돌고 1등 차는 회전판 위에서 돈다).
// RaceArena 캔버스(2D) 위에 덮는다. 레이스 중엔 안 쓴다(2D 운전석). next/dynamic으로 불러서 three.js는 이 화면을 열 때만 받는다.
// 캔버스는 마운트마다 새로 만들고 정리할 때 WebGL 연결을 끊는다(Player3DView와 같은 방식). 만들다 실패하면 markWebGLFailed → 2D 그림으로 돌아간다.
// 이름표는 HTML — 매 프레임 3D 위치를 화면 좌표로 바꿔 옮긴다(React 렌더 없이 style만).

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildKart3D, type Kart3D } from '@/components/playground/race3d/kart3d'
import { markWebGLFailed } from '@/components/baseball/three/webgl'
import type { CarLook } from '@/lib/raceGarage'
import type { Theme } from '@/lib/raceCourses'

export type StageCar = { id: string; car: CarLook; color: string; label: string; sub?: string; me: boolean }
type Props = {
  mode: 'showroom' | 'podium'
  cars: StageCar[] // 쇼룸 = 출발 자리 순서, 시상식 = 1·2·3등 순서
  theme: Theme
  width: number
  height: number
  endAt?: number // 쇼룸: 이 시각(Date.now 기준)에 카메라가 차들 바로 뒤에 오도록 돈다 → 2D 카운트다운 화면과 이어진다
}

const LANE_GAP = 2.0, ROW_GAP = 3.4
const PODIUM = [ // 0 = 1등
  { x: 0, h: 1.1, color: '#FACC15' },
  { x: -2.7, h: 0.75, color: '#E2E8F0' },
  { x: 2.7, h: 0.5, color: '#F59E0B' },
]
const ORBIT_MS = 14000 // 한 바퀴

function skyTexture(th: Theme) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256
  const g = cv.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.55, th.sky[1]); gr.addColorStop(1, th.sky[2])
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
}

export default function Race3DStage({ mode, cars, theme, width, height, endAt }: Props) {
  const host = useRef<HTMLDivElement | null>(null)
  const tags = useRef<(HTMLDivElement | null)[]>([])
  const key = JSON.stringify([mode, cars.map(c => [c.id, c.car, c.color])]) // 차·순서가 바뀔 때만 다시 짓는다
  const endRef = useRef(endAt)
  useEffect(() => { endRef.current = endAt }, [endAt])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const canvas = document.createElement('canvas')
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' })
    el.appendChild(canvas)
    let r: THREE.WebGLRenderer
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    } catch {
      canvas.remove(); markWebGLFailed(); return
    }
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    r.setSize(width, height, false)
    const scene = new THREE.Scene()
    const sky = skyTexture(theme)
    scene.background = sky
    const cam = new THREE.PerspectiveCamera(mode === 'showroom' ? 34 : 30, width / height, 0.1, 120)
    scene.add(new THREE.HemisphereLight('#F8FAFC', theme.ground[0], 1.2))
    const sun = new THREE.DirectionalLight('#FFFFFF', 2.0)
    sun.position.set(5, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 })
    scene.add(sun)

    const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [], texs: THREE.Texture[] = []
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { geos.push(g); mats.push(m); const x = new THREE.Mesh(g, m); x.receiveShadow = true; scene.add(x); return x }
    const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o })
    // 땅
    const ground = mesh(new THREE.PlaneGeometry(200, 200), std(theme.ground[0]))
    ground.rotation.x = -Math.PI / 2

    const karts: Kart3D[] = []
    const anchors: THREE.Object3D[] = [] // 이름표 붙일 자리
    let spinner: THREE.Object3D | null = null
    let focus = new THREE.Vector3()
    let confetti: THREE.InstancedMesh | null = null
    const conf: { x: number; y: number; z: number; v: number; r: number; s: number }[] = []

    if (mode === 'showroom') {
      // 도로 + 차선 + 출발선
      const rows = Math.ceil(cars.length / 4)
      const road = mesh(new THREE.PlaneGeometry(LANE_GAP * 4 + 1.2, 120), std(theme.road[0], { roughness: 0.9 }))
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -40)
      for (const s of [-1, 1]) {
        const curb = mesh(new THREE.PlaneGeometry(0.5, 120), std(theme.curb[0]))
        curb.rotation.x = -Math.PI / 2; curb.position.set(s * (LANE_GAP * 2 + 0.85), 0.012, -40)
      }
      for (let i = 1; i < 4; i++) for (let z = -100; z < 20; z += 3) {
        const d = mesh(new THREE.PlaneGeometry(0.1, 1.4), std(theme.lane))
        d.rotation.x = -Math.PI / 2; d.position.set((i - 2) * LANE_GAP, 0.015, z)
      }
      const line = mesh(new THREE.PlaneGeometry(LANE_GAP * 4 + 1.2, 0.5), std('#F9FAFB'))
      line.rotation.x = -Math.PI / 2; line.position.set(0, 0.016, -1.6)
      cars.forEach((c, i) => {
        const k = buildKart3D(c.car, c.color)
        const lane = i % 4, row = Math.floor(i / 4)
        k.group.position.set((lane - 1.5) * LANE_GAP, 0, row * ROW_GAP)
        k.group.traverse(o => { o.castShadow = true })
        scene.add(k.group); karts.push(k)
        const a = new THREE.Object3D(); a.position.set(0, 2.1, 0); k.group.add(a); anchors.push(a)
        if (c.me) {
          const spot = new THREE.SpotLight('#FDE68A', 40, 14, 0.42, 0.5)
          spot.position.set(k.group.position.x, 7, k.group.position.z + 1); spot.target = k.group
          scene.add(spot)
          const ring = mesh(new THREE.RingGeometry(1.15, 1.3, 48), new THREE.MeshBasicMaterial({ color: '#FACC15', transparent: true, opacity: 0.85 }))
          ring.rotation.x = -Math.PI / 2; ring.position.set(k.group.position.x, 0.02, k.group.position.z)
        }
      })
      focus = new THREE.Vector3(0, 0.9, ((rows - 1) * ROW_GAP) / 2)
    } else {
      // 레드카펫 + 단상
      const carpet = mesh(new THREE.PlaneGeometry(9.5, 30), std('#B91C1C'))
      carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.01, 6)
      PODIUM.forEach((p, i) => {
        const b = mesh(new THREE.BoxGeometry(2.3, p.h, 2.3), std(p.color, { roughness: 0.35, metalness: 0.3 }))
        b.position.set(p.x, p.h / 2, 0); b.castShadow = true
        // 앞면 숫자
        const cv = document.createElement('canvas'); cv.width = cv.height = 128
        const g = cv.getContext('2d')!; g.fillStyle = 'rgba(0,0,0,0.35)'; g.font = '900 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), 64, 70)
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; texs.push(tex)
        const ng = new THREE.PlaneGeometry(Math.min(0.9, p.h * 0.9), Math.min(0.9, p.h * 0.9)), nm = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        geos.push(ng); mats.push(nm)
        for (const face of [-1, 1]) { const n = new THREE.Mesh(ng, nm); n.position.set(p.x, p.h / 2, face * 1.16); n.rotation.y = face < 0 ? Math.PI : 0; scene.add(n) } // 앞·뒤 면
        const c = cars[i]
        if (!c) return
        const k = buildKart3D(c.car, c.color)
        k.group.traverse(o => { o.castShadow = true })
        const holder = new THREE.Group(); holder.position.set(p.x, p.h, 0); holder.add(k.group); scene.add(holder)
        karts.push(k)
        const a = new THREE.Object3D(); a.position.set(0, 1.9, 0); holder.add(a); anchors.push(a)
        if (i === 0) {
          spinner = k.group
          const spot = new THREE.SpotLight('#FFF7D6', 60, 18, 0.35, 0.5); spot.position.set(0, 9, 2); spot.target = holder; scene.add(spot)
        }
      })
      focus = new THREE.Vector3(0, 1.8, 0) // 단상을 화면 아래쪽에 두어 이름표 자리를 남긴다
      // 꽃가루
      const N = 220
      const cg = new THREE.PlaneGeometry(0.09, 0.05); geos.push(cg)
      const cm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); mats.push(cm)
      confetti = new THREE.InstancedMesh(cg, cm, N)
      const cols = ['#F87171', '#FACC15', '#34D399', '#60A5FA', '#FB923C', '#F9FAFB'].map(c => new THREE.Color(c))
      for (let i = 0; i < N; i++) {
        conf.push({ x: (Math.random() - 0.5) * 14, y: Math.random() * 8, z: (Math.random() - 0.5) * 10, v: 0.6 + Math.random() * 0.8, r: Math.random() * 6, s: Math.random() * 4 + 1 })
        confetti.setColorAt(i, cols[i % cols.length])
      }
      scene.add(confetti)
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), tmp = new THREE.Vector3()
    const t0 = performance.now()
    let raf = 0, last = t0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const t = (now - t0) / 1000
      // 카메라 각도 — 쇼룸은 endAt에 정확히 뒤(각도 0)로 오게 남은 시간으로 정한다
      let ang: number
      if (mode === 'showroom' && endRef.current) ang = (-(endRef.current - Date.now()) / ORBIT_MS) * Math.PI * 2
      else ang = (t * 1000 / ORBIT_MS) * Math.PI * 2 + 0.5
      if (mode === 'showroom') {
        const R = 9 + Math.max(0, cars.length - 4) * 0.5
        cam.position.set(focus.x + Math.sin(ang) * R, 2.9 + Math.cos(ang * 2) * 0.5, focus.z + Math.cos(ang) * R)
      } else {
        // 좌우로 넓은 타원 — 옆에서 볼 땐 멀어져서 단상 셋이 겹쳐도 덜 답답하다
        cam.position.set(Math.sin(ang) * 15, 3.8 + Math.sin(ang * 1.5) * 0.5, Math.cos(ang) * 10.5)
      }
      cam.lookAt(focus)
      if (spinner) spinner.rotation.y = t * 0.9
      for (const k of karts) k.update(t)
      if (confetti) {
        for (let i = 0; i < conf.length; i++) {
          const c = conf[i]
          c.y -= c.v * dt; c.r += c.s * dt
          if (c.y < 0) { c.y = 7 + Math.random() * 2; c.x = (Math.random() - 0.5) * 14 }
          e.set(c.r, c.r * 0.7, 0); q.setFromEuler(e)
          m4.compose(tmp.set(c.x + Math.sin(t + i) * 0.2, c.y, c.z), q, one)
          confetti.setMatrixAt(i, m4)
        }
        confetti.instanceMatrix.needsUpdate = true
      }
      r.render(scene, cam)
      // 이름표 위치 — 시상식에서 옆으로 볼 땐(단상이 일렬로 겹침) 1등만 남긴다
      const side = mode === 'podium' ? Math.abs(Math.sin(ang)) : 0
      anchors.forEach((a, i) => {
        const tag = tags.current[i]
        if (!tag) return
        a.getWorldPosition(pv); pv.project(cam)
        const behind = pv.z > 1
        tag.style.transform = `translate(${((pv.x + 1) / 2) * width}px, ${((1 - pv.y) / 2) * height}px) translate(-50%, -100%)`
        tag.style.opacity = behind ? '0' : i === 0 ? '1' : String(Math.max(0, Math.min(1, (0.85 - side) / 0.2)))
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      for (const k of karts) k.dispose()
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      for (const x of texs) x.dispose()
      confetti?.dispose()
      sky.dispose()
      r.dispose(); r.forceContextLoss(); canvas.remove()
    }
    // key가 같으면(같은 차·같은 순서) 다시 짓지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, theme, width, height])

  return (
    <div className="pointer-events-none absolute inset-0" style={{ width, height }}>
      <div ref={host} className="absolute inset-0" />
      {cars.map((c, i) => (
        <div key={c.id} ref={el => { tags.current[i] = el }} className="absolute left-0 top-0 flex flex-col items-center whitespace-nowrap" style={{ transform: 'translate(-999px,-999px)' }}>
          <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-black shadow ${c.me ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/90 text-[#1F2933]'}`}>{c.label}</span>
          {c.sub && <span className="mt-0.5 rounded bg-black/45 px-1.5 text-[11px] font-bold text-white">{c.sub}</span>}
        </div>
      ))}
    </div>
  )
}
