// 🏎 레이스 차 그림 = 차고 3D 모델(buildKart3D)을 미리 찍어 둔 사진(2026-11-26)
// 바깥(추격) 시점에서 2D 평면 그림은 차 10종이 다 비슷한 빨간 상자로 보여, 산 차·부품이 잘 안 보였다.
// 차 모습(CarLook)마다 쓰는 각도만 그때그때 한 번 찍어 캐시하고, 레이스 중엔 붙이기만 한다.
//  · 각도 = 카메라에서 본 실제 방향(바깥 시점은 중계 카메라가 왼쪽 뒤라 옆면이 보임). 운전석 시점은 SPRITE_OTHER_YAWS 3개만
//  · 다시 찍지 않는다 — 같은 모습이면 캐시(야구 3D 끊김 = 스프라이트 무한 재촬영이었다, 2026-10-24)
//  · 한 프레임에 한 장씩만 찍는다(레이스 시작 직후 끊김 방지). 다 찍히기 전엔 null → 2D 그림으로 대신
//  · 구단 로고 이미지를 먼저 받아 두고 찍는다(안 그러면 엠블럼이 빈 채로 찍힌다)
//  · 움직이는 효과(오라·무지개 네온·부스터 불꽃·도장 방울·이름표)는 찍지 않고 2D로 사진 위·아래에 그린다
//  · WebGL이 안 되면 영영 null(2D 그대로)

import * as THREE from 'three'
import { buildKart3D } from './kart3d'
import { logoUrl, type TeamKey } from '@/lib/baseballGear'
import { slotTeam, type CarLook } from '@/lib/raceGarage'

const YAW_STEP = 0.15 // 각도는 이 간격으로 묶어 찍는다(라디안, + = 왼옆이 보임, ±π/2 = 옆모습)
const yawIdx = (y: number) => Math.round(y / YAW_STEP)
export const SPRITE_OTHER_YAWS = [-0.21, 0, 0.21] // 남의 차 — 크게 틀면 출발선에서 차들이 대각선으로 서 보인다(2026-11-26)
const IW = 448, IH = 352 // 사진 크기(px)
const FRUSTUM_W = 4.4 // 사진 가로에 담기는 폭(m) — 직교 카메라라 거리와 상관없이 같은 배율
export const SPRITE_PPM = IW / FRUSTUM_W // 사진 1m = 몇 px

type Pt = { x: number; y: number }
// ax·ay = 바닥 가운데(차 그림자 자리)가 사진에서 놓인 곳(px). 나머지 = 2D로 움직이는 효과를 덧그릴 자리(사진 px)
export type KartSprite = { img: HTMLCanvasElement; ax: number; ay: number; exhaust: Pt[]; rear: Pt; flagTop: Pt | null; tail: [Pt, Pt] | null; helmet: Pt | null; lamps: Pt[] }

let renderer: THREE.WebGLRenderer | null = null
let dead = false
let scene: THREE.Scene | null = null
let cam: THREE.PerspectiveCamera | null = null
const cache = new Map<string, Map<number, KartSprite | null>>() // 모습 → 각도 칸별 사진(찍기 전 null)
const queue: { key: string; car: CarLook; color: string; i: number }[] = []
const queued = new Set<string>() // `${모습}|${각도}` 찍으려고 줄 선 것
const ready = new Map<string, Promise<void>>() // 모습 → 로고 받기 끝
let pumping = false
const logos = new Map<TeamKey, Promise<void>>()

function setup(): boolean {
  if (dead) return false
  if (renderer) return true
  try {
    const canvas = document.createElement('canvas')
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
  } catch { dead = true; return false }
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setPixelRatio(1)
  renderer.setSize(IW, IH, false)
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#F8FAFC', '#334155', 1.6))
  const sun = new THREE.DirectionalLight('#FFFFFF', 2.2); sun.position.set(3, 8, 6); scene.add(sun)
  const rim = new THREE.DirectionalLight('#93C5FD', 0.8); rim.position.set(-5, 3, -4); scene.add(rim)
  // 레이스 추격 카메라와 같은 자리·높이의 원근 카메라(차 뒤 165·높이 70 게임 단위 = 28단위/m) — 직교로 찍으면 도로선은 소실점으로 모이는데
  // 차 옆면만 평행하게 서 있어 '앞이 들린 상자'처럼 보였다(2026-11-26). 카메라는 앞을 수평으로 보고, 차가 있는 아래쪽만 잘라 찍는다(view offset)
  const D = 165 / 28, HC = 70 / 28, t = Math.tan((60 * Math.PI) / 360)
  const Hf = 2 * SPRITE_PPM * D * t, Wf = Hf * 2 // 차 자리에서 1m = SPRITE_PPM px가 되는 전체 화면
  cam = new THREE.PerspectiveCamera(60, Wf / Hf, 0.1, 100)
  cam.position.set(0, HC, D); cam.lookAt(0, HC, 0)
  const gy = Hf / 2 + (HC / D / t) * (Hf / 2) // 차 바닥 가운데가 전체 화면에서 놓이는 y
  cam.setViewOffset(Wf, Hf, Wf / 2 - IW / 2, gy - IH * 0.72, IW, IH) // 바닥이 사진 위에서 72% 자리에 오게
  cam.updateMatrixWorld() // 첫 사진부터 부품 자리(project)가 맞게 — 안 하면 첫 render 전엔 카메라 행렬이 비어 있다
  return true
}

function loadLogo(t: TeamKey): Promise<void> {
  let p = logos.get(t)
  if (!p) {
    p = new Promise<void>(res => { const i = new Image(); i.onload = () => res(); i.onerror = () => res(); i.src = logoUrl(t) })
    logos.set(t, p)
  }
  return p
}
const teamsOf = (car: CarLook): TeamKey[] => {
  const s = new Set<TeamKey>()
  for (const v of [car.team, car.bodyTeam, slotTeam(car, car.flag), slotTeam(car, car.wheels), slotTeam(car, car.exhaust), slotTeam(car, car.wing), slotTeam(car, car.helmet), slotTeam(car, car.tail)]) if (v) s.add(v)
  return [...s]
}

function shoot(car: CarLook, color: string, yaw: number): KartSprite | null {
  if (!renderer || !scene || !cam) return null
  const cm = cam
  // 움직이는 효과는 2D가 그린다 — 오라·무지개 네온은 빼고 찍는다
  const k = buildKart3D({ ...car, aura: false, neon: false }, color)
  // 모델 앞 = -z라 뒤가 카메라(+z) 쪽. yaw = atan(카메라 기준 옆 거리 / 앞 거리) — 오른쪽에 있는 차는 왼옆이 보이게 돌린다
  k.group.rotation.y = yaw
  k.update(0.6)
  for (const o of k.anim) o.visible = false // 배기 불꽃·깃발 천은 2D로 움직이게 그린다
  if (car.body !== 'kart' && Math.abs(yaw) < 0.7) for (const o of k.frontWheels) o.visible = false // 뒤에서 보면 앞바퀴는 차체에 가려 안 보이는 게 맞다(실제 차처럼)
  // 차 바닥 전체 그림자(앞뒤 길이만큼) — 2D 작은 타원 그림자는 차 가운데 한 점이라, 뒤에서 보면 차 뒤쪽이 그림자 아래로 내려가 '앞이 들린 차'처럼 보였다(2026-11-26)
  const bb = new THREE.Box3().setFromObject(k.group)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.38, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2; shadow.position.set((bb.min.x + bb.max.x) / 2, 0.01, (bb.min.z + bb.max.z) / 2)
  shadow.scale.set((bb.max.x - bb.min.x) * 0.58, (bb.max.z - bb.min.z) * 0.56, 1); shadow.renderOrder = -1
  k.group.add(shadow)
  scene.add(k.group)
  k.group.updateMatrixWorld(true)
  const at = (v: THREE.Vector3): Pt => { const q = v.clone().applyMatrix4(k.group.matrixWorld).project(cm); return { x: (q.x + 1) / 2 * IW, y: (1 - q.y) / 2 * IH } }
  const m = k.marks
  const marks = { exhaust: m.exhaust.map(at), rear: at(m.rear), flagTop: m.flagTop ? at(m.flagTop) : null, helmet: m.helmet ? at(m.helmet) : null, lamps: m.lamps.map(at), tail: m.tail ? [at(m.tail[0]), at(m.tail[1])] as [Pt, Pt] : null }
  renderer.render(scene, cam)
  scene.remove(k.group)
  shadow.geometry.dispose(); (shadow.material as THREE.Material).dispose()
  k.dispose()
  const img = document.createElement('canvas'); img.width = IW; img.height = IH
  img.getContext('2d')!.drawImage(renderer.domElement, 0, 0)
  const o = new THREE.Vector3(0, 0, 0).project(cam)
  return { img, ax: (o.x + 1) / 2 * IW, ay: (1 - o.y) / 2 * IH, ...marks }
}

function pump() {
  if (pumping) return
  pumping = true
  const step = () => {
    const job = queue.shift()
    if (!job) { pumping = false; return }
    const list = cache.get(job.key)
    if (list && !list.get(job.i)) {
      try { list.set(job.i, shoot(job.car, job.color, job.i * YAW_STEP)) } catch { dead = true; queue.length = 0; pumping = false; return }
    }
    requestAnimationFrame(step) // 한 프레임에 한 장
  }
  requestAnimationFrame(step)
}

const keyOf = (car: CarLook, color: string) => JSON.stringify([car.body, car.team, car.bodyTeam, car.flag, car.wheels, car.exhaust, car.wing, car.helmet, car.tail, color])

// 레이스 시작 전에 미리 찍어 두기(참가자 차 전부)
export function warmKartSprites(cars: { car: CarLook; color: string }[]) {
  for (const c of cars) request(c.car, c.color)
}

function request(car: CarLook, color: string, i = 0) {
  const key = keyOf(car, color)
  if (typeof document === 'undefined' || !setup()) return
  if (!cache.has(key)) { cache.set(key, new Map()); ready.set(key, Promise.all(teamsOf(car).map(loadLogo)).then(() => undefined)) }
  const q = `${key}|${i}`
  if (queued.has(q)) return
  queued.add(q)
  void ready.get(key)!.then(() => { queue.push({ key, car, color, i }); pump() })
}

// 각도(라디안)에 가장 가까운 사진 — 아직 없으면 null(그 사이엔 2D 그림)
export function kartSprite(car: CarLook, color: string, yaw: number): KartSprite | null {
  if (dead) return null
  const list = cache.get(keyOf(car, color))
  const best = yawIdx(yaw)
  const hit = list?.get(best)
  if (hit) return hit
  request(car, color, best) // 처음 쓰는 각도 = 그때 한 번 찍는다
  if (!list) return null
  // 아직 안 찍혔으면 찍힌 것 중 가장 가까운 각도로
  let alt: KartSprite | null = null, ad = Infinity
  list.forEach((sp, i) => { if (sp && Math.abs(i - best) < ad) { ad = Math.abs(i - best); alt = sp } })
  return alt
}
