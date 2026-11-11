// 🏎 퇴근 레이싱 — 3D 카트(three.js). 차고 꾸미기(CarLook)로 조립한다. 쇼룸(모집)·시상식에서 카메라가 돌며 보여 주는 용도.
// 레이스 중 2D 카트(raceChase.ts drawKart)와 같은 규칙으로 색·부품을 고른다:
//   차체 도색·엠블럼 = bodyTeam ?? team, 헬멧 = team.cap, 부품(깃발·휠·배기구·날개) = slotTeam(own이면 선호 구단, 선물이면 그 구단).
// 단위: 1 = 대략 1m. 앞 = -z, 뒤 = +z, 위 = +y. 바닥은 y = 0.
// 2026-11-05 목업(/mock/car-3d)에서 시작.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import { slotTeam, type CarLook } from '@/lib/raceGarage'

export const BODY_SCALE_3D = { kart: 1, sedan: 1.1, suv: 1.16, coupe: 1.08, sport: 1.12, super: 1.22 } as const
// 지붕 있는 차의 옆모습(z = 차 길이 L 배수 — 앞 = -, y = 높이 m). P = 몸통, C = 유리 실내, h = 허리선
type Profile = { h: number; P: [number, number][]; C: [number, number][]; stripes: boolean }
function profileOf(body: Exclude<CarLook['body'], 'kart'>): Profile {
  switch (body) {
    case 'super': { const h = 0.5; return { h, stripes: true, P: [[-0.52, 0.16], [-0.52, 0.3], [-0.2, h - 0.05], [0.38, h], [0.5, h + 0.04], [0.52, 0.2]], C: [[-0.12, h - 0.02], [0.08, h + 0.3], [0.28, h + 0.28], [0.42, h]] } }
    case 'sport': { const h = 0.56; return { h, stripes: true, P: [[-0.5, 0.16], [-0.5, 0.36], [-0.22, h], [0.42, h], [0.5, h - 0.04], [0.5, 0.16]], C: [[-0.14, h - 0.01], [0.02, h + 0.36], [0.26, h + 0.36], [0.38, h]] } }
    case 'sedan': { const h = 0.62; return { h, stripes: false, P: [[-0.5, 0.18], [-0.5, 0.42], [-0.3, h], [0.47, h], [0.5, h - 0.05], [0.5, 0.18]], C: [[-0.2, h - 0.01], [-0.04, h + 0.4], [0.24, h + 0.4], [0.37, h]] } }
    case 'suv': { const h = 0.8; return { h, stripes: false, P: [[-0.5, 0.3], [-0.5, 0.6], [-0.36, h], [0.5, h], [0.5, 0.3]], C: [[-0.24, h - 0.01], [-0.13, h + 0.46], [0.47, h + 0.46], [0.49, h]] } }
    case 'coupe': { const h = 0.54; return { h, stripes: false, P: [[-0.51, 0.16], [-0.51, 0.33], [-0.24, h - 0.03], [0.42, h], [0.5, h - 0.02], [0.5, 0.18]], C: [[-0.13, h - 0.01], [0.02, h + 0.33], [0.16, h + 0.32], [0.45, h]] } }
  }
}

export type Kart3D = { group: THREE.Group; update: (t: number) => void; dispose: () => void }

// ── 텍스처(구단 로고 배지·글자) ──
const logoImgs = new Map<TeamKey, HTMLImageElement>()
function logoImg(team: TeamKey, onLoad: () => void) {
  let i = logoImgs.get(team)
  if (!i) { i = new Image(); i.src = logoUrl(team); logoImgs.set(team, i) }
  if (!(i.complete && i.naturalWidth > 0)) i.addEventListener('load', onLoad, { once: true })
  return i
}
// 흰 원 배지 + 로고(ring = 테두리 색)
function badgeTexture(team: TeamKey, ring: string | null, bag: Bag) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const tex = bag.add(new THREE.CanvasTexture(cv))
  tex.colorSpace = THREE.SRGBColorSpace
  const paint = () => {
    const g = cv.getContext('2d')!
    g.clearRect(0, 0, 256, 256)
    if (ring) { g.fillStyle = ring; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill() }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(128, 128, ring ? 108 : 126, 0, Math.PI * 2); g.fill()
    const img = logoImg(team, () => { paint(); tex.needsUpdate = true })
    if (img.complete && img.naturalWidth > 0) {
      g.save(); g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.clip()
      g.drawImage(img, 28, 28, 200, 200); g.restore()
    }
    tex.needsUpdate = true
  }
  paint()
  return tex
}
// 날개 뒷면 글자(구단 영문)
function wordTexture(text: string, bg: string, bag: Bag) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96
  const g = cv.getContext('2d')!
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96)
  g.fillStyle = '#FFFFFF'; g.font = '900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, 256, 52)
  const tex = bag.add(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
// 깃발(구단 색 + 가운데 로고)
function flagTexture(team: TeamKey | null, color: string, bag: Bag) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 170
  const tex = bag.add(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace
  const paint = () => {
    const g = cv.getContext('2d')!
    g.fillStyle = color; g.fillRect(0, 0, 256, 170)
    if (team) {
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(128, 85, 58, 0, Math.PI * 2); g.fill()
      const img = logoImg(team, () => { paint(); tex.needsUpdate = true })
      if (img.complete && img.naturalWidth > 0) { g.save(); g.beginPath(); g.arc(128, 85, 52, 0, Math.PI * 2); g.clip(); g.drawImage(img, 76, 33, 104, 104); g.restore() }
    }
    tex.needsUpdate = true
  }
  paint()
  return tex
}

// 만든 geometry·material·texture를 모아 두었다가 한 번에 정리
class Bag {
  items: { dispose: () => void }[] = []
  add<T extends { dispose: () => void }>(x: T): T { this.items.push(x); return x }
  dispose() { for (const x of this.items) x.dispose(); this.items = [] }
}

export function buildKart3D(car: CarLook, fallbackColor: string): Kart3D {
  const bag = new Bag()
  const group = new THREE.Group()
  const team = teamOf(car.team)
  const bodyT = teamOf(car.bodyTeam ?? car.team)
  const flagT = teamOf(slotTeam(car, car.flag)), wheelT = teamOf(slotTeam(car, car.wheels))
  const exhaustT = teamOf(slotTeam(car, car.exhaust)), wingT = teamOf(slotTeam(car, car.wing))
  void exhaustT
  const main = bodyT?.primary === '#000000' ? '#1A1A1A' : bodyT?.primary ?? fallbackColor
  const accent = bodyT?.secondary ?? '#1F2937'
  const k = BODY_SCALE_3D[car.body]
  const closed = car.body !== 'kart'

  const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    bag.add(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, ...o }))
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(bag.add(geo), m)
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true
    parent.add(mesh); return mesh
  }
  const paint = mat(main, { roughness: 0.32, metalness: 0.25 })
  const accentM = mat(accent, { roughness: 0.4 })
  const dark = mat('#1F2937', { roughness: 0.7 })
  const black = mat('#0B0F17', { roughness: 0.85 })
  const chrome = mat('#D1D5DB', { metalness: 1, roughness: 0.22 })
  const badge = (tm: TeamKey, r: number, ring: string | null = null) =>
    bag.add(new THREE.MeshStandardMaterial({ map: badgeTexture(tm, ring, bag), transparent: true, roughness: 0.5 }))
  const circle = (r: number) => new THREE.CircleGeometry(r, 40)

  // 차 크기(바퀴 위치 기준)
  const W = (closed ? 1.25 : 1.15) * k, L = (closed ? 2.3 : 2.0) * k
  const wheelR = (car.body === 'suv' ? 0.37 : closed ? 0.3 : 0.27) * k, wheelW = (car.body === 'suv' ? 0.28 : closed ? 0.24 : 0.28) * k
  const axleX = W / 2 + (closed ? -0.02 : 0.1) * k, axleZ = L * 0.34
  let rearZ = 0, topY = 0 // 뒷면 위치·윗면 높이(부품 붙이기용)

  if (!closed) {
    // ── 기본 카트: 바닥판 + 옆 포드 + 앞 코 + 뒤 엔진통 ──
    add(new RoundedBoxGeometry(W * 0.8, 0.1, L * 0.92, 3, 0.04), dark, 0, 0.2, 0)
    add(new RoundedBoxGeometry(W * 0.62, 0.26, L * 0.32, 4, 0.1), paint, 0, 0.34, -L * 0.33) // 앞 코
    for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.22 * k, 0.24, L * 0.42, 4, 0.08), paint, s * W * 0.36, 0.33, 0.02)
    add(new RoundedBoxGeometry(W * 0.86, 0.12, 0.16, 3, 0.05), accentM, 0, 0.26, -L * 0.5) // 앞 범퍼
    const eng = add(new RoundedBoxGeometry(W * 0.62, 0.32, L * 0.24, 4, 0.1), paint, 0, 0.4, L * 0.36) // 뒤 엔진통
    rearZ = eng.position.z + L * 0.12; topY = 0.56
    add(new RoundedBoxGeometry(W * 0.4, 0.34, 0.12, 3, 0.05), dark, 0, 0.5, L * 0.12) // 등받이
    if (bodyT) { const e = add(circle(0.12 * k), badge(bodyT.key, 0.12), 0, 0.4, rearZ + 0.005); e.castShadow = false } // 뒷면 엠블럼
    if (bodyT) { const e = add(circle(0.1 * k), badge(bodyT.key, 0.1), 0, 0.475, -L * 0.33); e.rotation.x = -Math.PI / 2; e.castShadow = false } // 코 위
  } else {
    // ── 지붕 있는 차(세단·SUV·쿠페·스포츠·슈퍼): 옆 모양(z-y)을 가로로 밀어 만든 차체 + 유리 지붕 ──
    const sup = car.body === 'super'
    const prof = profileOf(car.body as Exclude<CarLook['body'], 'kart'>)
    const h = prof.h
    const body = new THREE.Shape()
    const P: [number, number][] = prof.P.map(([z, y]) => [L * z, y])
    body.moveTo(P[0][0], P[0][1]); for (const [z, y] of P.slice(1)) body.lineTo(z, y); body.closePath()
    const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: W * 0.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 })
    bodyGeo.translate(0, 0, -W * 0.4); bodyGeo.rotateY(-Math.PI / 2) // 모양의 x(=차 길이)를 z로(앞 = -z)
    add(bodyGeo, paint)
    // 유리 지붕(살짝 비쳐서 헬멧이 보이게)
    const cab = new THREE.Shape()
    const C: [number, number][] = prof.C.map(([z, y]) => [L * z, y])
    cab.moveTo(C[0][0], C[0][1]); for (const [z, y] of C.slice(1)) cab.lineTo(z, y); cab.closePath()
    const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: W * 0.66, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 })
    cabGeo.translate(0, 0, -W * 0.33); cabGeo.rotateY(-Math.PI / 2)
    const glass = add(cabGeo, mat('#BAE6FD', { transparent: true, opacity: 0.42, roughness: 0.05, metalness: 0.3, depthWrite: false }))
    glass.castShadow = false
    // 레이싱 줄무늬(보닛·지붕·트렁크를 따라)
    if (prof.stripes) for (const s of [-1, 1]) {
      const pts = sup ? [P[1], P[2], [L * 0.08, h + 0.31], [L * 0.28, h + 0.29], P[4]] : [P[1], P[2], [L * 0.02, h + 0.37], [L * 0.26, h + 0.37], P[4]]
      for (let i = 0; i < pts.length - 1; i++) {
        const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]
        const len = Math.hypot(z1 - z0, y1 - y0)
        const m = add(new THREE.BoxGeometry(0.1 * k, 0.012, len), accentM, s * 0.17 * k, (y0 + y1) / 2 + 0.065, (z0 + z1) / 2)
        m.rotation.x = Math.atan2(y1 - y0, z1 - z0) * -1
        m.castShadow = false
      }
    }
    rearZ = P[P.length - 1][0] + 0.065; topY = car.body === 'suv' ? h + 0.48 : h + 0.05 // SUV는 지붕이 뒤끝까지 — 날개·깃발을 지붕 위에
    if (!prof.stripes) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2 * k, car.body === 'suv' ? 0.16 : 0.07, 0.03), mat('#EF4444', { emissive: '#DC2626', emissiveIntensity: 1.1 }), s * W * 0.32, car.body === 'suv' ? h - 0.12 : h - 0.1, rearZ)
    if (car.body === 'suv') for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.04, L * 0.6), dark, s * W * 0.3, h + 0.5, L * 0.17) // 지붕 가로대
    if (sup) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.28 * k, 0.07, 0.03), mat('#EF4444', { emissive: '#DC2626', emissiveIntensity: 1.2 }), s * W * 0.3, 0.38, rearZ)
    if (bodyT) {
      const e = add(circle((sup ? 0.13 : 0.11) * k), badge(bodyT.key, 0.12, sup ? '#FACC15' : null), 0, 0.32, rearZ + 0.006); e.castShadow = false
      const f = add(circle(0.11 * k), badge(bodyT.key, 0.11, sup ? '#FACC15' : null), 0, (P[1][1] + P[2][1]) / 2 + 0.07, (P[1][0] + P[2][0]) / 2)
      f.rotation.x = -Math.PI / 2 - Math.atan2(P[2][1] - P[1][1], P[2][0] - P[1][0]); f.castShadow = false
    }
    // 앞 범퍼·헤드램프
    add(new RoundedBoxGeometry(W * 0.96, 0.1, 0.12, 3, 0.04), dark, 0, 0.2, P[0][0] - 0.02)
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.22 * k, 0.06, 0.03), mat('#FEF9C3', { emissive: '#FDE68A', emissiveIntensity: 0.8 }), s * W * 0.3, 0.33, P[0][0] - 0.06)
  }

  // ── 운전자(헬멧 = 선호 구단 모자 색) ──
  const seatZ = closed ? L * 0.1 : L * 0.08
  const seatY = car.body === 'suv' ? 0.5 : car.body === 'sedan' ? 0.4 : closed ? 0.35 : 0.42
  add(new THREE.CapsuleGeometry(0.15 * k, 0.18, 4, 12), mat(team?.secondary ?? '#334155'), 0, seatY + 0.2, seatZ)
  const helmet = add(new THREE.SphereGeometry(0.17 * k, 24, 16), mat(team?.cap ?? '#F9FAFB', { roughness: 0.25, metalness: 0.2 }), 0, seatY + 0.5, seatZ)
  const visor = add(new THREE.SphereGeometry(0.172 * k, 24, 12, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 0.35, Math.PI * 0.3), mat('#111827', { roughness: 0.1, metalness: 0.7 }), 0, 0, 0, helmet)
  visor.castShadow = false

  // ── 바퀴(엠블럼 휠이면 바깥 면에 로고 + 테) ──
  const tireGeo = bag.add(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 28))
  tireGeo.rotateZ(Math.PI / 2)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(tireGeo, black); w.castShadow = true
    w.position.set(sx * axleX, wheelR, sz * axleZ); group.add(w)
    const face = sx * (wheelW / 2 + 0.004)
    if (car.wheels) {
      const ring = add(new THREE.TorusGeometry(wheelR * 0.74, 0.025 * k, 8, 28), mat(wheelT?.secondary ?? accent, { metalness: 0.5, roughness: 0.3 }), face, 0, 0, w)
      ring.rotation.y = Math.PI / 2
      const disc = add(circle(wheelR * 0.62), wheelT ? badge(wheelT.key, 0.1) : chrome, face + sx * 0.002, 0, 0, w)
      disc.rotation.y = sx * Math.PI / 2; disc.castShadow = false
    } else {
      const hub = add(circle(wheelR * 0.45), mat('#6B7280', { metalness: 0.6, roughness: 0.4 }), face, 0, 0, w)
      hub.rotation.y = sx * Math.PI / 2; hub.castShadow = false
    }
  }

  // ── 배기구(크롬 두 개) ──
  if (car.exhaust) for (const s of [-0.22, 0.22]) {
    const p = add(new THREE.CylinderGeometry(0.06 * k, 0.07 * k, 0.26, 16, 1, true), chrome, s * W, 0.3, rearZ + 0.06)
    p.rotation.x = Math.PI / 2
    const hole = add(circle(0.055 * k), black, s * W, 0.3, rearZ + 0.19); hole.castShadow = false
  }

  // ── 뒷날개(날개 색 + 구단 글자) / 없으면 작은 검은 스포일러 ──
  if (car.wing) {
    const wy = topY + 0.42, wz = rearZ - 0.12
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.42, 0.12), dark, s * W * 0.28, topY + 0.21, wz)
    const wingC = wingT?.secondary ?? accent
    add(new RoundedBoxGeometry(W * 1.08, 0.06, 0.34, 3, 0.025), mat(wingC), 0, wy, wz)
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.22, 0.4), paint, s * W * 0.55, wy - 0.02, wz)
    if (wingT) {
      const plate = add(new THREE.PlaneGeometry(W * 0.8, 0.12), bag.add(new THREE.MeshStandardMaterial({ map: wordTexture(wingT.wordmark, wingC, bag), roughness: 0.5 })), 0, wy - 0.075, wz + 0.175)
      plate.castShadow = false
      add(new THREE.BoxGeometry(W * 1.08, 0.13, 0.02), mat(wingC), 0, wy - 0.07, wz + 0.16)
    }
  } else {
    add(new RoundedBoxGeometry(W * 0.84, 0.05, 0.16, 2, 0.02), dark, 0, topY + 0.05, rearZ - 0.12)
  }

  // ── 깃발(안테나 + 펄럭이는 천) ──
  let flagGeo: THREE.PlaneGeometry | null = null
  let flagBase: Float32Array | null = null
  if (car.flag) {
    const ax = W * 0.36, top = topY + 1.15
    add(new THREE.CylinderGeometry(0.012, 0.012, top - topY + 0.05, 6), dark, ax, (top + topY) / 2, rearZ - 0.2)
    flagGeo = bag.add(new THREE.PlaneGeometry(0.5, 0.33, 12, 1))
    flagGeo.translate(0.25, -0.165, 0)
    flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
    const fm = bag.add(new THREE.MeshStandardMaterial({ map: flagTexture(flagT?.key ?? null, flagT?.primary ?? main, bag), side: THREE.DoubleSide, roughness: 0.7 }))
    const flag = new THREE.Mesh(flagGeo, fm); flag.castShadow = true
    flag.position.set(ax, top, rearZ - 0.2); flag.rotation.y = -Math.PI / 2 // 뒤(+z)로 날리게
    group.add(flag)
  }

  const update = (t: number) => {
    if (flagGeo && flagBase) {
      const pos = flagGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = flagBase[i * 3]
        pos.setZ(i, Math.sin(t * 6 - x * 9) * 0.05 * (x / 0.5))
      }
      pos.needsUpdate = true
      flagGeo.computeVertexNormals()
    }
  }
  return { group, update, dispose: () => bag.dispose() }
}
