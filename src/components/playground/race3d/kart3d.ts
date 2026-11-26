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
export const BODY_SCALE_3D = { kart: 1, mini: 0.8, compact: 0.94, sedan: 1.04, suv: 1.14, grand: 1.18, coupe: 1.16, lux: 1.27, sport: 1.3, super: 1.42 } as const // 2026-11-26 가격 사다리를 더 벌림(1.5→1.8배)
// 2026-11-24 2차: 모닝빵 = 빵처럼 둥글고 키 큰 2톤 경차 / 스무디 = 크롬·검정 지붕·LED / 고르쉐 = 최고급 4도어 스포츠 세단 / 아르기닌 = 최고급 슈퍼 SUV(금장)
const CHROME_BODY = new Set(['grand', 'lux', 'coupe', 'sport', 'super']) // 창 아래 크롬(아르기닌은 금) 줄 · 가로 한 줄 후미등
const GRILLE: Partial<Record<string, { w: number; h: number; y: number; slats: boolean }>> = {
  grand: { w: 0.5, h: 0.12, y: 0.3, slats: false }, lux: { w: 0.42, h: 0.2, y: 0.34, slats: true },
  coupe: { w: 0.36, h: 0.1, y: 0.28, slats: false }, sport: { w: 0.3, h: 0.07, y: 0.26, slats: false }, super: { w: 0.62, h: 0.16, y: 0.42, slats: true },
}
const ROOF_PLATE: Partial<Record<string, string>> = { mini: '#F3D9A4', super: '#0B0F17' } // 지붕 색(2톤). 'team' = 구단 색
// 🎨 바탕색(2026-11-26): 차 전체를 구단 색으로 칠하면 10종이 같은 색 덩어리로 보여서, 바탕은 흰색·검정(싼 차 밝게 → 비싼 차 묵직하게),
// 구단 색은 차마다 정한 자리에만(LIVERY). 흰·검이 가격 순으로 섞여 바로 위·아래 등급끼리도 갈린다
const BASE: Record<CarLook['body'], 'white' | 'black'> = { kart: 'white', mini: 'white', compact: 'white', sedan: 'white', suv: 'black', grand: 'black', coupe: 'white', lux: 'black', sport: 'white', super: 'black' }
const TIER: Record<CarLook['body'], number> = { kart: 0, mini: 1, compact: 2, sedan: 3, suv: 4, grand: 5, coupe: 6, lux: 7, sport: 8, super: 9 }
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

// marks = 레이스 사진(kartSprites)에서 2D로 움직이는 효과를 덧그릴 자리(차 좌표). anim = 사진 찍을 땐 숨기는 움직이는 부분(불꽃·깃발 천)
export type KartMarks = { exhaust: THREE.Vector3[]; rear: THREE.Vector3; flagTop: THREE.Vector3 | null; tail: [THREE.Vector3, THREE.Vector3] | null; helmet: THREE.Vector3 | null; lamps: THREE.Vector3[] }
export type Kart3D = { group: THREE.Group; update: (t: number) => void; dispose: () => void; marks: KartMarks; anim: THREE.Object3D[]; frontWheels: THREE.Object3D[] }

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
// 번호판·스티커 글자판
function labelTexture(text: string, bg: string, fg: string, bag: Bag, border: string | null = null) {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128
  const g = cv.getContext('2d')!
  g.fillStyle = bg; g.fillRect(0, 0, 384, 128)
  if (border) { g.strokeStyle = border; g.lineWidth = 14; g.strokeRect(7, 7, 370, 114) }
  g.fillStyle = fg; g.font = '900 70px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, 192, 68)
  const tex = bag.add(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
// 🚗 뒷면 디자인(2026-11-26) — 레이스는 뒤에서 보니 뒷모습만으로 차종이 구분되게.
// 단면 = 위로 좁아짐(taper)·아래 펜더 넓음(flare)·유리 지붕 좁아짐(cab). 뒷면 장식은 아래 switch(차마다 다른 얼굴)
const SHAPE: Record<Exclude<CarLook['body'], 'kart'>, { flare: number; taper: number; cab: number; pow: number }> = {
  mini: { flare: -0.04, taper: 0.34, cab: 0.4, pow: 1.4 }, // 빵처럼 둥근 어깨(아래도 살짝 오므림)
  compact: { flare: 0, taper: 0.02, cab: 0.03, pow: 2 }, // 각진 상자 해치백
  sedan: { flare: 0.05, taper: 0.1, cab: 0.26, pow: 2 },
  suv: { flare: 0.1, taper: 0, cab: 0, pow: 2 }, // 높은 각진 박스 + 펜더
  grand: { flare: 0.06, taper: 0.12, cab: 0.28, pow: 2 },
  coupe: { flare: 0.22, taper: 0.26, cab: 0.5, pow: 1.6 }, // 낮고 넓은 엉덩이 + 좁은 지붕
  lux: { flare: 0.05, taper: 0.1, cab: 0.2, pow: 2 },
  sport: { flare: 0.26, taper: 0.3, cab: 0.55, pow: 1.5 }, // 가장 넓고 낮은 펜더
  super: { flare: 0.24, taper: 0.1, cab: 0.3, pow: 2 }, // 넓은 어깨
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
  const tailT = teamOf(slotTeam(car, car.tail))
  const tailC = tailT ? (tailT.primary === '#000000' ? tailT.secondary : tailT.primary) : '#EF4444'
  const tailLeds: THREE.MeshStandardMaterial[] = []
  const frontWheels: THREE.Object3D[] = [] // 앞바퀴 — 레이스 사진(뒤에서 봄)에선 숨긴다: 바퀴가 차체보다 커서 어깨 위로 삐져나와 '앞바퀴 들린 차'로 보였다
  const flowLamps: { m: THREE.MeshStandardMaterial; u: number }[] = [] // LED 부품: 차 고유 후미등 칸(u = 가운데 0 ~ 바깥 1)
  const lampAt: THREE.Vector3[] = [] // 후미등 자리(레이스 사진 위 2D 효과용)
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
  // 광택 사다리: 싼 차 무광 → 비싼 차 유광(레이스 화면에선 2D 반짝임이 더해진다)
  const gloss = car.body === 'kart' || car.body === 'mini' ? { roughness: 0.6, metalness: 0.05 } : premium ? { roughness: 0.1, metalness: 0.55 } : TIER[car.body] >= 5 ? { roughness: 0.2, metalness: 0.4 } : { roughness: 0.34, metalness: 0.2 }
  const white = BASE[car.body] === 'white'
  // 흰색은 금속감(metalness)이 있으면 회색으로 보여서 0에 가깝게 + 살짝 자체 발광(2026-11-26 '흰색이 회색' 피드백)
  const paint = mat(white ? '#FFFFFF' : '#15171C', white ? { roughness: Math.max(0.18, gloss.roughness), metalness: 0.02, emissive: '#FFFFFF', emissiveIntensity: 0.12 } : gloss) // 바탕색
  // 검정 바탕 차는 진한 구단 색(키움 버건디·두산 남색 등)이 묻혀서 밝기를 올린다(2026-11-26)
  const teamC = (() => { if (white) return main; const c = new THREE.Color(main), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); if (hsl.l < 0.5) c.setHSL(hsl.h, Math.min(1, hsl.s * 1.1), 0.5); return '#' + c.getHexString() })()
  const teamPaint = mat(teamC, gloss) // 구단 색(정해진 자리에만)
  // 차체 위에 겹쳐 칠하는 구단 색 판 — 차체와 같은 면이라 polygonOffset으로 앞에 그린다(후미등·번호판은 따로 앞에 붙어 그대로 보임)
  const teamCoat = mat(teamC, { ...gloss, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const accentM = mat(accent, { roughness: 0.4 })
  const dark = mat('#1F2937', { roughness: 0.7 })
  const black = mat('#0B0F17', { roughness: 0.85 })
  const chrome = mat('#D1D5DB', { metalness: 1, roughness: 0.22 })
  const badge = (tm: TeamKey, r: number, ring: string | null = null) =>
    bag.add(new THREE.MeshStandardMaterial({ map: badgeTexture(tm, ring, bag), transparent: true, roughness: 0.5 }))
  const circle = (r: number) => new THREE.CircleGeometry(r, 40)

  // 차 크기(바퀴 위치 기준)
  const W = (closed ? 1.25 : 1.15) * k, L = (closed ? 2.3 : 2.0) * k
  // 🛞 휠(부품) = 바퀴가 크고 넓어지고 고무가 구단 색(2026-11-26) — 뒤에서 보는 레이스 화면에서도 산 게 보이게(옆면 로고만으론 안 보였다)
  const bigWheel = car.wheels ? 1.18 : 1, wideWheel = car.wheels ? 1.35 : 1
  const wheelR = (car.body === 'suv' ? 0.37 : car.body === 'super' ? 0.38 : car.body === 'mini' ? 0.25 : closed ? 0.3 : 0.27) * k * bigWheel, wheelW = (car.body === 'suv' ? 0.28 : closed ? 0.24 : 0.28) * k * wideWheel
  // 지붕 있는 차는 바퀴를 차체 밑으로 넣어 뒤에서 차체 실루엣이 보이게(펜더가 덮음). 🛞 휠 부품이면 바깥으로 넓게 빠진 와이드 스탠스
  const axleX = closed
    ? (W * 0.4 + 0.06) * (1 + SHAPE[car.body as Exclude<CarLook['body'], 'kart'>].flare) - wheelW * (car.wheels ? -0.1 : 0.2) // 바퀴 바깥면이 펜더보다 조금 나오게(안 그러면 고르쉐처럼 넓은 차는 바퀴가 묻힘)
    : W / 2 + 0.1 * k + (car.wheels ? wheelW * 0.15 : 0)
  const axleZ = L * 0.34
  let rearZ = 0, topY = 0, tailY = 0.42 // 뒷면 위치·윗면 높이·후미등 높이(부품 붙이기용)

  if (!closed) {
    // ── 기본 카트: 바닥판 + 옆 포드 + 앞 코 + 뒤 엔진통 ──
    add(new RoundedBoxGeometry(W * 0.8, 0.1, L * 0.92, 3, 0.04), dark, 0, 0.2, 0)
    add(new RoundedBoxGeometry(W * 0.62, 0.26, L * 0.32, 4, 0.1), teamPaint, 0, 0.34, -L * 0.33) // 앞 코(구단 색)
    for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.22 * k, 0.24, L * 0.42, 4, 0.08), teamPaint, s * W * 0.36, 0.33, 0.02) // 옆 포드(구단 색)
    add(new RoundedBoxGeometry(W * 0.86, 0.12, 0.16, 3, 0.05), accentM, 0, 0.26, -L * 0.5) // 앞 범퍼
    const eng = add(new RoundedBoxGeometry(W * 0.62, 0.32, L * 0.24, 4, 0.1), paint, 0, 0.4, L * 0.36) // 뒤 엔진통
    rearZ = eng.position.z + L * 0.12; topY = 0.56
    add(new RoundedBoxGeometry(W * 0.4, 0.34, 0.12, 3, 0.05), dark, 0, 0.5, L * 0.12) // 등받이
    if (bodyT) { const e = add(circle(0.12 * k), badge(bodyT.key, 0.12), 0, 0.4, rearZ + 0.005); e.castShadow = false } // 뒷면 엠블럼
    for (const s of [-1, 1]) { const t = add(circle(0.05), mat('#EF4444', { emissive: '#DC2626', emissiveIntensity: 1.4 }), s * W * 0.22, 0.42, rearZ + 0.006); t.castShadow = false; lampAt.push(new THREE.Vector3(s * W * 0.22, 0.42, rearZ + 0.02)) } // 카트: 작은 동그란 후미등
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
    const sh = SHAPE[car.body as Exclude<CarLook['body'], 'kart'>]
    const widthAt = (y: number) => { const t = Math.min(1, Math.max(0, (y - 0.15) / (h - 0.15))); return (1 + sh.flare * (1 - t)) * (1 - sh.taper * Math.pow(t, sh.pow)) }
    { const pos = bodyGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * widthAt(pos.getY(i))); bodyGeo.computeVertexNormals() }
    add(bodyGeo, paint)
    // 🎨 구단 색 자리(차 면적의 50% 전후, 2026-11-26) — 옆 모양(P)을 높이 [y0, y1]로 자르고 가로 [x0, x1] 띠로 밀어 차체 위에 덮어 칠한다
    const coat = (y0: number, y1: number, x0 = -0.4, x1 = 0.4) => {
      let poly = P.slice()
      for (const [lim, keepBelow] of [[y1, true], [y0, false]] as [number, boolean][]) {
        const out: [number, number][] = []
        for (let i = 0; i < poly.length; i++) {
          const a0 = poly[i], b0 = poly[(i + 1) % poly.length]
          const ina = keepBelow ? a0[1] <= lim : a0[1] >= lim, inb = keepBelow ? b0[1] <= lim : b0[1] >= lim
          if (ina) out.push(a0)
          if (ina !== inb) { const t = (lim - a0[1]) / (b0[1] - a0[1]); out.push([a0[0] + (b0[0] - a0[0]) * t, lim]) }
        }
        poly = out
      }
      if (poly.length < 3) return
      const sh0 = new THREE.Shape(); sh0.moveTo(poly[0][0], poly[0][1]); for (const [z, y] of poly.slice(1)) sh0.lineTo(z, y); sh0.closePath()
      const g = new THREE.ExtrudeGeometry(sh0, { depth: W * (x1 - x0), bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 })
      g.translate(0, 0, W * x0); g.rotateY(-Math.PI / 2)
      const pos = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * widthAt(pos.getY(i))) // 차체와 같은 단면 좁힘
      g.computeVertexNormals()
      add(g, teamCoat).castShadow = false
    }
    switch (car.body) {
      case 'mini': coat(0, 0.44); break // 아래 절반(투톤 빵)
      case 'compact': coat(0, 0.34); break // 아래 띠 + (지붕은 아래 roofC)
      case 'sedan': coat(0.4, 9); break // 위 절반(트렁크·허리 위)
      case 'suv': coat(0, 0.56); break // 아래 절반(오프로드 투톤)
      case 'grand': coat(0, 9, -0.2, 0.2); break // 가운데 넓은 띠(앞~지붕~뒤)
      case 'coupe': coat(0, 9, -0.28, -0.06); coat(0, 9, 0.06, 0.28); break // 넓은 레이싱 줄 2줄
      case 'lux': coat(0, 0.4); break // 아래 절반(위 검정 · 아래 구단 색 리무진)
      case 'sport': coat(0, 9, -0.4, -0.2); coat(0, 9, 0.2, 0.4); break // 양옆 띠(가운데 흰색)
      case 'super': coat(0, 0.5); break // 아래 절반 + 검정 위·금장
    }
    // 유리 지붕(살짝 비쳐서 헬멧이 보이게)
    const cab = new THREE.Shape()
    const C: [number, number][] = prof.C.map(([z, y]) => [L * z, y])
    cab.moveTo(C[0][0], C[0][1]); for (const [z, y] of C.slice(1)) cab.lineTo(z, y); cab.closePath()
    const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: W * 0.66, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 })
    cabGeo.translate(0, 0, -W * 0.33); cabGeo.rotateY(-Math.PI / 2)
    {
      const top = prof.C.reduce((m, [, y]) => Math.max(m, y), h) + 0.05, pos = cabGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, (pos.getY(i) - h) / (top - h))); pos.setX(i, pos.getX(i) * widthAt(h) * (1 - sh.cab * t)) }
      cabGeo.computeVertexNormals()
    }
    const glass = add(cabGeo, mat('#334155', { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.4, depthWrite: false })) // 진한 틴팅 — 뒷유리 모양이 차체와 구분되게(헬멧은 비쳐 보임)
    glass.castShadow = false
    // 레이싱 줄무늬(보닛·지붕·트렁크를 따라)
    if (prof.stripes) for (const s of [-1, 1]) {
      const pts = sup ? [P[1], P[2], [L * 0.08, h + 0.31], [L * 0.28, h + 0.29], P[4]] : car.body === 'coupe' ? [P[1], P[2], [L * 0.02, h + 0.33], [L * 0.16, h + 0.32], [L * 0.45, h], P[4]] : [P[1], P[2], [L * 0.02, h + 0.37], [L * 0.26, h + 0.37], P[4]]
      const stripeM = car.body === 'coupe' ? teamPaint : accentM // 스무디 = 구단 색 레이싱 줄 2줄
      for (let i = 0; i < pts.length - 1; i++) {
        const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]
        const len = Math.hypot(z1 - z0, y1 - y0)
        const m = add(new THREE.BoxGeometry(0.1 * k, 0.012, len), stripeM, s * (car.body === 'coupe' ? 0.09 : 0.17) * k, (y0 + y1) / 2 + 0.065, (z0 + z1) / 2)
        m.rotation.x = Math.atan2(y1 - y0, z1 - z0) * -1
        m.castShadow = false
      }
    }
    rearZ = P[P.length - 1][0] + 0.065; tailY = h - 0.1; topY = car.body === 'suv' ? h + 0.48 : h + 0.05 // SUV는 지붕이 뒤끝까지 — 날개·깃발을 지붕 위에
    const chromeBody = CHROME_BODY.has(car.body)
    const gold = car.body === 'super'
    const trimM = gold ? mat('#D4A017', { metalness: 1, roughness: 0.25 }) : chrome
    if (chromeBody) {
      // 창 아래 크롬(금) 줄(옆) + 가로 한 줄 LED 후미등 + 그릴
      for (const s of [-1, 1]) { const m = add(new THREE.BoxGeometry(0.02, 0.025, L * 0.62), trimM, s * (W * 0.4 + 0.065), h + 0.02, L * 0.11); m.castShadow = false }
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
    const roofC = car.body === 'compact' ? 'team' : ROOF_PLATE[car.body] // 아방이 = 구단 색 투톤 지붕
    if (roofC) { // 2톤 지붕(빵 껍질색 / 검정 유광)
      const top = prof.C.reduce((m, [, y]) => Math.max(m, y), 0)
      const zs = prof.C.filter(([, y]) => y >= top - 0.03).map(([z]) => z * L)
      const zl = Math.min(...zs), zr = Math.max(...zs)
      add(new RoundedBoxGeometry(W * 0.7 * widthAt(h) * (1 - sh.cab) + 0.08, 0.05, Math.max(0.2, zr - zl + 0.12), 2, 0.02), roofC === 'team' ? teamPaint : mat(roofC, { roughness: 0.3, metalness: roofC === '#0B0F17' ? 0.5 : 0.1 }), 0, top + 0.05, (zl + zr) / 2)
    }
    if (car.body === 'mini') for (const s of [-1, 1]) { // 모닝빵: 동그란 눈(헤드램프)
      const e = add(circle(0.09), mat('#FEF9C3', { emissive: '#FDE68A', emissiveIntensity: 0.9 }), s * W * 0.28, 0.4, P[0][0] - 0.07); e.rotation.y = Math.PI; e.castShadow = false
    }
    // ── 뒷면(후미등·범퍼·번호판·장식) — 차마다 다른 얼굴 ──
    const hw = (y: number) => (W * 0.4 + 0.06) * widthAt(y) // 그 높이의 뒷면 반폭
    const RZ = rearZ + 0.004
    // 💡 LED 후미등(부품)이면 이 차 고유 후미등이 구단 색으로 바뀌고 가운데서 양옆으로 빛이 흐른다(따로 띠를 덧대지 않음)
    const lampC = car.tail ? tailC : '#EF4444'
    const lamp = mat(lampC, { emissive: car.tail ? tailC : '#DC2626', emissiveIntensity: car.tail ? 1.4 : 0.7 + TIER[car.body] * 0.17 }) // 싼 차 흐린 전구 → 비싼 차 밝은 LED
    const lampHot = car.tail ? lamp : mat('#FCA5A5', { emissive: '#EF4444', emissiveIntensity: 2.2 })
    const isLamp = (m: THREE.Material) => m === lamp || m === lampHot
    const big = (m: THREE.Material) => (isLamp(m) ? 1.35 : 1) // 후미등은 레이스 크기에서도 모양이 읽히게 크게
    const lit = (o: THREE.Mesh, x: number, y: number, w0: number) => { // 후미등 자리 기록(레이스 사진 위 2D 빛) + LED면 칸마다 따로 빛나게
      const n = Math.max(1, Math.round(w0 / 0.07))
      for (let i = 0; i < n; i++) lampAt.push(new THREE.Vector3(x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * w0 * 0.9), y, RZ + 0.03))
      if (car.tail) { const m = lamp.clone(); bag.add(m); o.material = m; flowLamps.push({ m, u: Math.min(1, Math.abs(x) / (W * 0.55)) }) }
    }
    const box = (w0: number, h0: number, x: number, y: number, m: THREE.Material, d = 0.03, z = RZ) => { const o = add(new THREE.BoxGeometry(w0 * big(m), h0 * big(m), d), m, x, y, z); o.castShadow = false; if (isLamp(m) && m === lamp) lit(o, x, y, w0 * big(m)); return o }
    const disc = (r: number, x: number, y: number, m: THREE.Material, z = RZ + 0.012) => { const o = add(circle(r * big(m)), m, x, y, z); o.castShadow = false; if (isLamp(m) && m === lamp) lit(o, x, y, r * 2); return o }
    const plate = (y: number, frame: string | null = null) => { const o = add(new THREE.PlaneGeometry(0.27 * k, 0.09 * k), bag.add(new THREE.MeshStandardMaterial({ map: labelTexture('12가 3456', '#F8FAFC', '#111827', bag, frame), roughness: 0.6 })), 0, y, RZ + 0.018); o.castShadow = false }
    const bumperY = car.body === 'suv' || sup ? 0.32 : 0.2
    const cheap = car.body === 'mini' || car.body === 'compact'
    box(hw(bumperY) * 2, 0.09, 0, bumperY, cheap ? black : car.body === 'suv' ? dark : paint, 0.1, rearZ - 0.02) // 뒤 범퍼(싼 차는 맨 플라스틱)
    let emblemY: number | null = 0.42
    // 구단 색 자리(차마다)
    if (car.body === 'sport') { // 구단 색 뒤 스포일러
      add(new RoundedBoxGeometry(W * 0.9, 0.035, 0.16, 2, 0.012), teamPaint, 0, h + 0.07, rearZ - 0.1)
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.07, 0.06), dark, s * W * 0.3, h + 0.03, rearZ - 0.1)
    }
    switch (car.body) {
      case 'mini': { // 동그란 눈 2개 + 노란 '초보운전' 스티커
        for (const s of [-1, 1]) { disc(0.07, s * hw(0.42) * 0.68, 0.42, lamp); disc(0.035, s * hw(0.42) * 0.68, 0.42, lampHot, RZ + 0.016) }
        const st = add(new THREE.PlaneGeometry(0.24 * k, 0.09 * k), bag.add(new THREE.MeshStandardMaterial({ map: labelTexture('초보운전', '#FACC15', '#111827', bag), roughness: 0.6 })), 0, 0.44, RZ + 0.018); st.castShadow = false
        plate(0.29); emblemY = null; break
      }
      case 'compact': { // 모서리 세로 후미등 + 지붕 끝 검은 스포일러
        for (const s of [-1, 1]) { box(0.07, 0.22, s * hw(0.42) * 0.86, 0.42, lamp); box(0.03, 0.18, s * hw(0.42) * 0.86, 0.42, lampHot, 0.03, RZ + 0.006) }
        box(W * 0.62, 0.035, 0, h + 0.02, black, 0.12, rearZ - 0.06)
        plate(0.3); emblemY = 0.47; break
      }
      case 'sedan': { // 가로 후미등 2개 + 가운데 크롬 줄로 이어짐
        for (const s of [-1, 1]) box(0.22, 0.065, s * hw(0.5) * 0.66, 0.5, lamp)
        box(hw(0.5) * 0.7, 0.018, 0, 0.5, chrome)
        plate(0.3); emblemY = 0.41; break
      }
      case 'suv': { // 세로 기둥 후미등 + 뒤에 매단 스페어타이어(구단 로고) + 은색 하부 보호판
        for (const s of [-1, 1]) { box(0.07, 0.34, s * hw(0.62) * 0.9, 0.62, lamp); box(0.03, 0.28, s * hw(0.62) * 0.9, 0.62, lampHot, 0.03, RZ + 0.006) }
        const tire = add(new THREE.CylinderGeometry(0.2 * k, 0.2 * k, 0.13, 28), teamPaint, 0, 0.58, rearZ + 0.07); tire.rotation.x = Math.PI / 2 // 구단 색 스페어타이어 커버
        const rim = add(new THREE.TorusGeometry(0.15 * k, 0.018 * k, 6, 28), chrome, 0, 0.58, rearZ + 0.14); rim.castShadow = false
        if (bodyT) disc(0.12 * k, 0, 0.58, badge(bodyT.key, 0.12), rearZ + 0.137)
        box(W * 0.55, 0.05, 0, 0.27, chrome, 0.06)
        emblemY = null; break
      }
      case 'grand': { // 꽉 찬 가로 한 줄 + 아래 크롬 줄 + 크롬 번호판 테
        box(hw(0.5) * 1.6, 0.035, 0, 0.5, lamp); box(hw(0.5) * 1.5, 0.012, 0, 0.5, lampHot, 0.03, RZ + 0.006)
        box(hw(0.44) * 1.4, 0.02, 0, 0.44, chrome)
        plate(0.29, '#D1D5DB'); emblemY = 0.37; break
      }
      case 'coupe': { // 동그란 후미등 4개 + 오리꼬리 스포일러 + 검은 디퓨저
        for (const s of [-1, 1]) for (const f of [0.36, 0.7]) { disc(0.055, s * hw(0.42) * f, 0.42, lamp); disc(0.026, s * hw(0.42) * f, 0.42, lampHot, RZ + 0.016) }
        const dt = add(new RoundedBoxGeometry(W * 0.74, 0.04, 0.14, 2, 0.015), paint, 0, h + 0.015, rearZ - 0.05); dt.rotation.x = -0.25
        box(hw(0.2) * 1.5, 0.06, 0, 0.17, black, 0.06)
        plate(0.3); emblemY = 0.42; break
      }
      case 'lux': { // ㄱ자 후미등 + 크롬 막대 + 크롬 테 번호판 + 크롬 엠블럼 테
        for (const s of [-1, 1]) { box(0.17, 0.04, s * hw(0.52) * 0.7, 0.52, lamp); box(0.04, 0.13, s * hw(0.47) * 0.88, 0.47, lamp) }
        box(hw(0.52) * 0.8, 0.02, 0, 0.52, chrome)
        plate(0.29, '#D1D5DB'); emblemY = 0.42; break
      }
      case 'sport': { // 꽉 찬 빛 막대 + 'GORSCHE' 글자 + 카본 디퓨저 날개
        box(hw(0.46) * 1.7, 0.026, 0, 0.46, lampHot)
        const wd = add(new THREE.PlaneGeometry(W * 0.5, 0.06), bag.add(new THREE.MeshStandardMaterial({ map: labelTexture('GORSCHE', '#0B0F17', '#F8FAFC', bag), roughness: 0.4 })), 0, 0.395, RZ + 0.018); wd.castShadow = false
        box(hw(0.2) * 1.6, 0.07, 0, 0.17, mat('#111827', { roughness: 0.3, metalness: 0.4 }), 0.08)
        for (let i = -2; i <= 2; i++) box(0.012, 0.08, i * W * 0.12, 0.14, dark, 0.12)
        plate(0.29); emblemY = null; break
      }
      case 'super': { // 금테 X자 후미등 + 금 디퓨저 + 큰 금 엠블럼
        for (const s of [-1, 1]) for (const r of [0.55, -0.55]) { const b = box(0.24, 0.035, s * hw(0.62) * 0.66, 0.62, lamp); b.rotation.z = r }
        for (const s of [-1, 1]) disc(0.03, s * hw(0.62) * 0.66, 0.62, mat('#FDE68A', { emissive: '#FBBF24', emissiveIntensity: 1.4 }), RZ + 0.03)
        box(hw(0.3) * 1.5, 0.07, 0, 0.27, trimM, 0.08)
        plate(0.41); emblemY = 0.57; break
      }
    }
    if (car.body === 'suv') for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.04, L * 0.6), dark, s * W * 0.3, h + 0.5, L * 0.17) // 지붕 가로대
    if (bodyT) {
      if (emblemY !== null) { const e = add(circle((sup ? 0.12 : 0.085) * k), badge(bodyT.key, 0.12, sup ? '#FACC15' : car.body === 'lux' ? '#D1D5DB' : null), 0, emblemY, rearZ + 0.02); e.castShadow = false }
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
  if (car.neon || car.body === 'lux' || car.body === 'sport' || car.body === 'super') {
    const glowM = bag.add(new THREE.MeshBasicMaterial({ color: car.neon ? '#FF3B3B' : car.body === 'super' ? '#FBBF24' : car.body === 'lux' ? '#93C5FD' : '#EF4444', transparent: true, opacity: car.neon ? 0.7 : car.body === 'super' ? 0.6 : car.body === 'lux' ? 0.3 : 0.42, depthWrite: false })) // 벤또 은은한 하늘빛 → 고르쉐 빨강 → 아르기닌 금빛
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
  const helmetAt = goldHelmet ? new THREE.Vector3(0, seatY + 0.5 + 0.12 * k, seatZ) : null
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
  const tireC = wheelT ? (wheelT.primary === '#000000' ? wheelT.secondary : wheelT.primary) : '#0B0F17'
  const tireM = car.wheels ? mat(tireC, { roughness: 0.55 }) : black
  const stripeM = car.wheels ? mat(wheelT?.secondary === tireC ? '#F8FAFC' : wheelT?.secondary ?? '#F8FAFC', { roughness: 0.4 }) : null
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(tireGeo, tireM); w.castShadow = true
    if (stripeM) for (const off of [-0.28, 0.28]) { // 고무 둘레 띠 2줄(뒤에서도 보인다)
      const st = add(new THREE.TorusGeometry(wheelR * 1.003, 0.016 * k, 6, 40), stripeM, off * wheelW, 0, 0, w); st.rotation.y = Math.PI / 2; st.castShadow = false
    }
    // 앞바퀴(sz -1)는 차체 안쪽으로 더 넣는다 — 뒤에서 보면 먼 앞바퀴가 화면 위쪽에 그려져, 좁아지는 어깨 옆으로 삐져나오면 '앞바퀴 들린 차'처럼 보였다(2026-11-26)
    const ax = axleX
    w.position.set(sx * ax, wheelR, sz * axleZ); group.add(w)
    if (sz < 0) frontWheels.push(w)
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
        const cal = add(new THREE.BoxGeometry(0.03, wheelR * 0.5, wheelR * 0.28), mat(main, { emissive: main, emissiveIntensity: 0.4 }), face - sx * 0.02, wheelR * 0.32, -wheelR * 0.3, w) // 구단 색 캘리퍼
        cal.castShadow = false
      }
    }
  }

  // ── 💡 LED 후미등(부품) — 뒤 전체 LED 띠, 빛이 가운데서 양옆으로 흐른다 ──
  if (car.tail && !closed) { // 카트만 LED 띠(지붕 있는 차는 고유 후미등이 LED로 바뀜)
    const y = tailY
    const half = closed ? W * 0.42 : W * 0.3
    add(new THREE.BoxGeometry(half * 2 + 0.04, 0.09, 0.02), black, 0, y, rearZ + 0.012).castShadow = false
    const n = 9, seg = half / (n + 0.5)
    const g = bag.add(new THREE.BoxGeometry(seg * 0.8, 0.06, 0.02))
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i <= n; i++) {
      const m = bag.add(new THREE.MeshStandardMaterial({ color: tailC, emissive: tailC, emissiveIntensity: 0.4 }))
      const led = new THREE.Mesh(g, m); led.position.set(side * (seg / 2 + i * seg), y, rearZ + 0.024)
      led.userData.i = i / n; group.add(led); tailLeds.push(m)
    }
  }

  // ── 💨 듀얼 배기구(부품) — 굵은 크롬 머플러 + 구단 색 테 + 늘 일렁이는 파란 불꽃. 없으면 아무것도 없다 ──
  if (!car.exhaust && closed && TIER[car.body] >= 5) { // 기본 크롬 머플러 팁(비싼 차일수록 많이)
    const tips = TIER[car.body] >= 8 ? [-0.34, -0.22, 0.22, 0.34] : [-0.28, 0.28]
    for (const t of tips) { const m = add(new THREE.CylinderGeometry(0.045 * k, 0.05 * k, 0.12, 16, 1, true), chrome, t * W, 0.2, rearZ + 0.03); m.rotation.x = Math.PI / 2; m.castShadow = false
      const hole = add(circle(0.035 * k), black, t * W, 0.2, rearZ + 0.09); hole.castShadow = false }
  }
  const flames: THREE.Mesh[] = []
  const exhaustAt: THREE.Vector3[] = []
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
      exhaustAt.push(new THREE.Vector3(s * W, 0.3, rearZ + 0.24))
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
  let flagMesh: THREE.Mesh | null = null, flagTop: THREE.Vector3 | null = null
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
    flagMesh = flag; flagTop = new THREE.Vector3(ax, top, rearZ - 0.2)
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
    if (flowLamps.length) { const ph = (t / 0.9) % 1; for (const f of flowLamps) f.m.emissiveIntensity = 0.5 + 2.4 * Math.max(0, 1 - Math.abs(f.u - ph) * 3) }
    if (tailLeds.length) {
      const ph = (t / 0.9) % 1, half = tailLeds.length / 2
      tailLeds.forEach((m, k) => { const d = Math.abs((k % half) / (half - 1) - ph); m.emissiveIntensity = 0.3 + 2.2 * Math.max(0, 1 - d * 3.5) })
    }
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
  const tailHalf = closed ? W * 0.42 : W * 0.3
  const marks: KartMarks = {
    exhaust: exhaustAt, rear: new THREE.Vector3(0, 0.3, rearZ), flagTop, helmet: helmetAt,
    tail: car.tail && !closed ? [new THREE.Vector3(-tailHalf, tailY, rearZ + 0.03), new THREE.Vector3(tailHalf, tailY, rearZ + 0.03)] : null, lamps: lampAt,
  }
  return { group, update, dispose: () => bag.dispose(), marks, anim: [...flames, ...(flagMesh ? [flagMesh] : [])], frontWheels }
}
