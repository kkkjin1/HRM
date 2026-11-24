// 🏎 퇴근 레이싱 — 3D 카트(three.js). 차고 꾸미기(CarLook)로 조립한다. 쇼룸(모집)·시상식에서 카메라가 돌며 보여 주는 용도.
// 레이스 중 2D 카트(raceChase.ts drawKart)와 같은 규칙으로 색·부품을 고른다:
//   차체 도색·엠블럼 = bodyTeam ?? team, 헬멧 = team.cap, 부품(깃발·휠·배기구·날개) = slotTeam(own이면 선호 구단, 선물이면 그 구단).
// 단위: 1 = 대략 1m. 앞 = -z, 뒤 = +z, 위 = +y. 바닥은 y = 0.
// 2026-11-05 목업(/mock/car-3d)에서 시작.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import { slotTeam, type CarLook } from '@/lib/raceGarage'

// 2026-11-24 차 10종: 아래 등급은 작고 각지게, 위로 갈수록 길고 낮고 크롬·불빛이 많게
export const BODY_SCALE_3D = { kart: 1, mini: 0.86, compact: 1.02, sedan: 1.1, suv: 1.16, grand: 1.2, coupe: 1.14, lux: 1.26, sport: 1.26, super: 1.3 } as const
// 2026-11-24 2차: 모닝빵 = 빵처럼 둥글고 키 큰 2톤 경차 / 스무디 = 크롬·검정 지붕·LED / 고르쉐 = 최고급 4도어 스포츠 세단 / 아르기닌 = 최고급 슈퍼 SUV(금장)
const CHROME_BODY = new Set(['grand', 'lux', 'coupe', 'sport', 'super']) // 창 아래 크롬(아르기닌은 금) 줄 · 가로 한 줄 후미등
const GRILLE: Partial<Record<string, { w: number; h: number; y: number; slats: boolean }>> = {
  grand: { w: 0.5, h: 0.12, y: 0.3, slats: false }, lux: { w: 0.42, h: 0.2, y: 0.34, slats: true },
  coupe: { w: 0.36, h: 0.1, y: 0.28, slats: false }, sport: { w: 0.3, h: 0.07, y: 0.26, slats: false }, super: { w: 0.62, h: 0.16, y: 0.42, slats: true },
}
const ROOF_PLATE: Partial<Record<string, string>> = { mini: '#F3D9A4', coupe: '#0B0F17', super: '#0B0F17' } // 지붕 색(2톤)
// 지붕 있는 차의 옆모습(z = 차 길이 L 배수 — 앞 = -, y = 높이 m). P = 몸통, C = 유리 실내, h = 허리선
type Profile = { h: number; P: [number, number][]; C: [number, number][]; stripes: boolean }
function profileOf(body: Exclude<CarLook['body'], 'kart'>): Profile {
  switch (body) {
    case 'super': { const h = 0.78; return { h, stripes: false, P: [[-0.52, 0.3], [-0.52, 0.56], [-0.34, h], [0.48, h], [0.52, h - 0.05], [0.52, 0.3]], C: [[-0.22, h - 0.01], [-0.08, h + 0.4], [0.26, h + 0.38], [0.47, h + 0.02]] } } // 슈퍼 SUV(뒤가 비스듬히 내려가는 쿠페형)
    case 'sport': { const h = 0.52; return { h, stripes: false, P: [[-0.52, 0.16], [-0.52, 0.32], [-0.24, h], [0.44, h], [0.52, h - 0.02], [0.52, 0.18]], C: [[-0.16, h - 0.01], [0.0, h + 0.34], [0.18, h + 0.34], [0.48, h + 0.02]] } } // 4도어 패스트백
    case 'mini': { const h = 0.62; return { h, stripes: false, P: [[-0.5, 0.2], [-0.5, 0.5], [-0.42, h], [0.46, h], [0.5, h - 0.12], [0.5, 0.2]], C: [[-0.38, h - 0.01], [-0.22, h + 0.52], [0.36, h + 0.52], [0.46, h]] } }
    case 'compact': { const h = 0.6; return { h, stripes: false, P: [[-0.5, 0.18], [-0.5, 0.42], [-0.3, h], [0.46, h], [0.5, h - 0.05], [0.5, 0.18]], C: [[-0.22, h - 0.01], [-0.06, h + 0.38], [0.2, h + 0.38], [0.36, h]] } }
    case 'grand': { const h = 0.6; return { h, stripes: false, P: [[-0.5, 0.18], [-0.5, 0.4], [-0.32, h], [0.48, h], [0.5, h - 0.04], [0.5, 0.18]], C: [[-0.2, h - 0.01], [-0.02, h + 0.38], [0.28, h + 0.38], [0.42, h]] } }
    case 'lux': { const h = 0.62; return { h, stripes: false, P: [[-0.5, 0.18], [-0.5, 0.42], [-0.34, h], [0.48, h], [0.5, h - 0.03], [0.5, 0.18]], C: [[-0.18, h - 0.01], [0.0, h + 0.4], [0.3, h + 0.39], [0.44, h]] } }
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
  const helmetT = teamOf(slotTeam(car, car.helmet))
  const crestC = helmetT ? (helmetT.primary === '#000000' ? helmetT.secondary : helmetT.primary) : '#EF4444'
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
  // 고급 차일수록 유광(벤또·고르쉐·아르기닌은 거울처럼 반짝)
  const premium = car.body === 'lux' || car.body === 'sport' || car.body === 'super'
  const paint = mat(main, premium ? { roughness: 0.12, metalness: 0.55 } : car.body === 'kart' || car.body === 'mini' ? { roughness: 0.55, metalness: 0.05 } : { roughness: 0.32, metalness: 0.25 })
  const accentM = mat(accent, { roughness: 0.4 })
  const dark = mat('#1F2937', { roughness: 0.7 })
  const black = mat('#0B0F17', { roughness: 0.85 })
  const chrome = mat('#D1D5DB', { metalness: 1, roughness: 0.22 })
  const badge = (tm: TeamKey, r: number, ring: string | null = null) =>
    bag.add(new THREE.MeshStandardMaterial({ map: badgeTexture(tm, ring, bag), transparent: true, roughness: 0.5 }))
  const circle = (r: number) => new THREE.CircleGeometry(r, 40)

  // 차 크기(바퀴 위치 기준)
  const W = (closed ? 1.25 : 1.15) * k, L = (closed ? 2.3 : 2.0) * k
  const wheelR = (car.body === 'suv' ? 0.37 : car.body === 'super' ? 0.38 : car.body === 'mini' ? 0.25 : closed ? 0.3 : 0.27) * k, wheelW = (car.body === 'suv' ? 0.28 : closed ? 0.24 : 0.28) * k
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
      const stripeM = accentM
      for (let i = 0; i < pts.length - 1; i++) {
        const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]
        const len = Math.hypot(z1 - z0, y1 - y0)
        const m = add(new THREE.BoxGeometry(0.1 * k, 0.012, len), stripeM, s * 0.17 * k, (y0 + y1) / 2 + 0.065, (z0 + z1) / 2)
        m.rotation.x = Math.atan2(y1 - y0, z1 - z0) * -1
        m.castShadow = false
      }
    }
    rearZ = P[P.length - 1][0] + 0.065; topY = car.body === 'suv' ? h + 0.48 : h + 0.05 // SUV는 지붕이 뒤끝까지 — 날개·깃발을 지붕 위에
    const chromeBody = CHROME_BODY.has(car.body)
    const gold = car.body === 'super'
    const trimM = gold ? mat('#D4A017', { metalness: 1, roughness: 0.25 }) : chrome
    if (chromeBody) {
      // 창 아래 크롬(금) 줄(옆) + 가로 한 줄 LED 후미등 + 그릴
      for (const s of [-1, 1]) { const m = add(new THREE.BoxGeometry(0.02, 0.025, L * 0.62), trimM, s * (W * 0.4 + 0.065), h + 0.02, L * 0.11); m.castShadow = false }
      add(new THREE.BoxGeometry(W * 0.82, car.body === 'sport' ? 0.035 : 0.05, 0.03), mat('#EF4444', { emissive: '#DC2626', emissiveIntensity: 1.4 }), 0, h - 0.1, rearZ)
      const gr = GRILLE[car.body]
      if (gr) {
        const grille = add(new RoundedBoxGeometry(W * gr.w, gr.h, 0.04, 2, 0.015), gold ? black : chrome, 0, gr.y, P[0][0] - 0.07)
        grille.castShadow = false
        if (gr.slats) for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.012, gr.h * 0.8, 0.02), gold ? trimM : dark, i * W * gr.w * 0.17, gr.y, P[0][0] - 0.09)
      }
      if (gold) for (const s of [-1, 1]) { // 아르기닌: Y자 금빛 헤드램프 + 옆 금 몰딩
        const a = add(new THREE.BoxGeometry(0.24 * k, 0.03, 0.03), mat('#FEF3C7', { emissive: '#FDE68A', emissiveIntensity: 1.2 }), s * W * 0.3, 0.52, P[0][0] - 0.05); a.rotation.z = s * 0.35
        const b = add(new THREE.BoxGeometry(0.03, 0.12, 0.03), mat('#FEF3C7', { emissive: '#FDE68A', emissiveIntensity: 1.2 }), s * W * 0.36, 0.44, P[0][0] - 0.05); b.castShadow = false
        add(new THREE.BoxGeometry(0.02, 0.04, L * 0.7), trimM, s * (W * 0.4 + 0.07), 0.36, 0)
      }
    }
    const roofC = ROOF_PLATE[car.body]
    if (roofC) { // 2톤 지붕(빵 껍질색 / 검정 유광)
      const top = prof.C.reduce((m, [, y]) => Math.max(m, y), 0)
      const zs = prof.C.filter(([, y]) => y >= top - 0.03).map(([z]) => z * L)
      const zl = Math.min(...zs), zr = Math.max(...zs)
      add(new RoundedBoxGeometry(W * 0.7, 0.05, Math.max(0.2, zr - zl + 0.12), 2, 0.02), mat(roofC, { roughness: 0.3, metalness: roofC === '#0B0F17' ? 0.5 : 0.1 }), 0, top + 0.05, (zl + zr) / 2)
    }
    if (car.body === 'mini') for (const s of [-1, 1]) { // 모닝빵: 동그란 눈(헤드램프)
      const e = add(circle(0.09), mat('#FEF9C3', { emissive: '#FDE68A', emissiveIntensity: 0.9 }), s * W * 0.28, 0.4, P[0][0] - 0.07); e.rotation.y = Math.PI; e.castShadow = false
    }
    if (!prof.stripes && !chromeBody) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2 * k, car.body === 'suv' ? 0.16 : 0.07, 0.03), mat('#EF4444', { emissive: '#DC2626', emissiveIntensity: 1.1 }), s * W * 0.32, car.body === 'suv' ? h - 0.12 : h - 0.1, rearZ)
    if (car.body === 'suv') for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.04, L * 0.6), dark, s * W * 0.3, h + 0.5, L * 0.17) // 지붕 가로대
    if (bodyT) {
      const e = add(circle((sup ? 0.13 : 0.11) * k), badge(bodyT.key, 0.12, sup ? '#FACC15' : null), 0, 0.32, rearZ + 0.006); e.castShadow = false
      const f = add(circle(0.11 * k), badge(bodyT.key, 0.11, sup ? '#FACC15' : null), 0, (P[1][1] + P[2][1]) / 2 + 0.07, (P[1][0] + P[2][0]) / 2)
      f.rotation.x = -Math.PI / 2 - Math.atan2(P[2][1] - P[1][1], P[2][0] - P[1][0]); f.castShadow = false
    }
    // 앞 범퍼·헤드램프
    add(new RoundedBoxGeometry(W * 0.96, 0.1, 0.12, 3, 0.04), dark, 0, 0.2, P[0][0] - 0.02)
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.22 * k, 0.06, 0.03), mat('#FEF9C3', { emissive: '#FDE68A', emissiveIntensity: 0.8 }), s * W * 0.3, 0.33, P[0][0] - 0.06)
  }

  // ── 바닥 조명(고르쉐 = 빨강, 아르기닌 = 금빛 — 차 밑으로 번지는 빛) ──
  // 🌈 무지개 네온(부품)이면 색이 계속 돌고, 바닥에 LED 띠가 돈다
  let neonGlow: THREE.MeshBasicMaterial | null = null
  const neonLeds: THREE.MeshBasicMaterial[] = []
  if (car.neon || car.body === 'sport' || car.body === 'super') {
    const glowM = bag.add(new THREE.MeshBasicMaterial({ color: car.neon ? '#FF3B3B' : car.body === 'super' ? '#FBBF24' : '#EF4444', transparent: true, opacity: car.neon ? 0.7 : car.body === 'super' ? 0.55 : 0.35, depthWrite: false }))
    if (car.neon) {
      neonGlow = glowM
      const ledGeo = bag.add(new THREE.SphereGeometry(0.035 * k, 8, 6))
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2
        const lm = bag.add(new THREE.MeshBasicMaterial({ color: '#FFFFFF' }))
        const led = new THREE.Mesh(ledGeo, lm); led.position.set(Math.cos(a) * W * 0.55, 0.05, Math.sin(a) * L * 0.47)
        group.add(led); neonLeds.push(lm)
      }
    }
    const glow = new THREE.Mesh(bag.add(new THREE.CircleGeometry(1, 40)), glowM)
    glow.rotation.x = -Math.PI / 2; glow.scale.set(W * 0.75, L * 0.62, 1); glow.position.y = 0.015
    group.add(glow)
  }

  // ── 운전자(헬멧 = 선호 구단 모자 색) ──
  const seatZ = closed ? L * 0.1 : L * 0.08
  const seatY = car.body === 'suv' || car.body === 'super' ? 0.5 : car.body === 'mini' ? 0.44 : car.body === 'sedan' || car.body === 'compact' || CHROME_BODY.has(car.body) ? 0.4 : closed ? 0.35 : 0.42
  add(new THREE.CapsuleGeometry(0.15 * k, 0.18, 4, 12), mat(team?.secondary ?? '#334155'), 0, seatY + 0.2, seatZ)
  // ⛑️ 골드 레이서 헬멧(부품) = 금 크롬 + 구단 색 모히칸 볏 + 빛나는 바이저
  const goldHelmet = !!car.helmet
  const helmet = add(new THREE.SphereGeometry((goldHelmet ? 0.19 : 0.17) * k, 24, 16),
    goldHelmet ? mat('#FACC15', { metalness: 1, roughness: 0.15, emissive: '#78350F', emissiveIntensity: 0.25 }) : mat(team?.cap ?? '#F9FAFB', { roughness: 0.25, metalness: 0.2 }), 0, seatY + 0.5, seatZ)
  const visor = add(new THREE.SphereGeometry((goldHelmet ? 0.192 : 0.172) * k, 24, 12, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 0.35, Math.PI * 0.3),
    goldHelmet ? mat('#22D3EE', { roughness: 0.05, metalness: 0.6, emissive: '#06B6D4', emissiveIntensity: 0.8 }) : mat('#111827', { roughness: 0.1, metalness: 0.7 }), 0, 0, 0, helmet)
  visor.castShadow = false
  if (goldHelmet) {
    const crest = add(new THREE.BoxGeometry(0.05 * k, 0.1 * k, 0.3 * k), mat(crestC, { roughness: 0.35 }), 0, 0.2 * k, 0.02, helmet)
    crest.castShadow = false
    const band = add(new THREE.TorusGeometry(0.19 * k, 0.012 * k, 6, 32), mat(crestC), 0, 0, 0, helmet)
    band.rotation.y = Math.PI / 2
  }

  // ── ✨ 황금 오라(부품) — 차를 감싸는 금빛 후광(늘 카메라를 보는 스프라이트) + 피어오르는 반짝이 ──
  let aura: THREE.Sprite | null = null
  const sparks: THREE.Mesh[] = []
  if (car.aura) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const g = cv.getContext('2d')!
    const rg = g.createRadialGradient(64, 64, 8, 64, 64, 64)
    rg.addColorStop(0, 'rgba(255,247,214,0.9)'); rg.addColorStop(0.45, 'rgba(250,204,21,0.45)'); rg.addColorStop(1, 'rgba(250,204,21,0)')
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128)
    const tex = bag.add(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace
    aura = new THREE.Sprite(bag.add(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    aura.position.set(0, 0.7, 0); aura.scale.set(L * 1.5, L * 1.1, 1)
    group.add(aura)
    const sg = bag.add(new THREE.OctahedronGeometry(0.04 * k))
    const sm = bag.add(new THREE.MeshBasicMaterial({ color: '#FFF7D6', transparent: true, depthWrite: false }))
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(sg, sm); group.add(m); sparks.push(m) }
  }

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
      const hubC = car.body === 'super' ? '#D4A017' : premium || car.body === 'coupe' ? '#E5E7EB' : '#6B7280' // 아르기닌 금 휠 · 고급 차 크롬 휠
      const hub = add(circle(wheelR * (premium || car.body === 'coupe' ? 0.7 : 0.45)), mat(hubC, { metalness: 0.9, roughness: 0.2 }), face, 0, 0, w)
      hub.rotation.y = sx * Math.PI / 2; hub.castShadow = false
      if (car.body === 'sport' || car.body === 'super') { // 큰 멀티스포크 휠 + 색 캘리퍼(고르쉐 빨강 · 아르기닌 금 휠에 노랑)
        const spokeM = mat(car.body === 'super' ? '#FDE68A' : '#F8FAFC', { metalness: 1, roughness: 0.15 })
        for (let si = 0; si < 10; si++) {
          const a = (si / 10) * Math.PI * 2
          const sp = add(new THREE.BoxGeometry(0.012, wheelR * 0.62, 0.035), spokeM, face + sx * 0.006, Math.cos(a) * wheelR * 0.36, Math.sin(a) * wheelR * 0.36, w)
          sp.rotation.x = -a; sp.castShadow = false
        }
        const ring = add(new THREE.TorusGeometry(wheelR * 0.72, 0.022 * k, 8, 32), spokeM, face + sx * 0.004, 0, 0, w); ring.rotation.y = Math.PI / 2
        const cal = add(new THREE.BoxGeometry(0.03, wheelR * 0.5, wheelR * 0.28), mat(car.body === 'super' ? '#FACC15' : '#DC2626', { emissive: car.body === 'super' ? '#CA8A04' : '#991B1B', emissiveIntensity: 0.5 }), face - sx * 0.02, wheelR * 0.32, -wheelR * 0.3, w)
        cal.castShadow = false
      }
    }
  }

  // ── 💨 듀얼 배기구(부품) — 굵은 크롬 머플러 + 구단 색 테 + 늘 일렁이는 파란 불꽃. 없으면 아무것도 없다 ──
  const flames: THREE.Mesh[] = []
  if (car.exhaust) {
    const ringM = mat(exhaustT?.secondary ?? accent, { metalness: 0.6, roughness: 0.25 })
    const flameM = bag.add(new THREE.MeshBasicMaterial({ color: '#60A5FA', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))
    const coreM = bag.add(new THREE.MeshBasicMaterial({ color: '#E0F2FE', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }))
    for (const s of [-0.24, 0.24]) {
      const p = add(new THREE.CylinderGeometry(0.085 * k, 0.095 * k, 0.32, 20, 1, true), chrome, s * W, 0.3, rearZ + 0.08)
      p.rotation.x = Math.PI / 2
      const ring = add(new THREE.TorusGeometry(0.088 * k, 0.018 * k, 8, 24), ringM, s * W, 0.3, rearZ + 0.24); ring.castShadow = false
      const hole = add(circle(0.07 * k), black, s * W, 0.3, rearZ + 0.23); hole.castShadow = false
      for (const [m, r, len] of [[flameM, 0.075, 0.42], [coreM, 0.04, 0.24]] as [THREE.Material, number, number][]) {
        const f = new THREE.Mesh(bag.add(new THREE.ConeGeometry(r * k, len, 12, 1, true)), m)
        f.geometry.translate(0, len / 2, 0) // 넓은 밑동 = 머플러 입구, 뾰족한 끝 = 뒤로
        f.rotation.x = Math.PI / 2; f.position.set(s * W, 0.3, rearZ + 0.24)
        group.add(f); flames.push(f)
      }
    }
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
    if (neonGlow) {
      neonGlow.color.setHSL((t * 0.25) % 1, 1, 0.55)
      neonLeds.forEach((m, i) => m.color.setHSL((t * 0.25 + i / neonLeds.length) % 1, 1, 0.6))
    }
    if (aura) { const b = 1 + Math.sin(t * 2.4) * 0.07; aura.scale.set(L * 1.5 * b, L * 1.1 * b, 1) }
    sparks.forEach((m, i) => {
      const ph = (t * 0.45 + i * 0.083) % 1
      const a = i * 2.4
      m.position.set(Math.cos(a) * W * 0.75, 0.15 + ph * 1.6, Math.sin(a) * L * 0.5)
      m.rotation.y = t * 3 + i; m.scale.setScalar(Math.sin(ph * Math.PI))
    })
    flames.forEach((f, i) => { f.scale.y = 0.75 + Math.sin(t * 38 + i * 1.7) * 0.2 + Math.sin(t * 91 + i) * 0.1 })
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
