// 3D 선수 인형(three.js) — 장비(구단 × 아이템)를 입힌 사람 모형. React와 무관한 순수 모듈.
// 좌표: 미터, 발 가운데가 원점, y 위. 몸 기준(로컬)으로는 -z를 보고 서 있고, 그룹 전체를 yaw만큼 돌려 세운다
// (타석: 홈플레이트를 보고 옆으로 서서 앞어깨가 투수 쪽). 자세(손·방망이 끝)는 화면 기준(월드) 좌표로 받는다.
// 그림체: 셀 셰이딩(3단 명암) + 검은 외곽선 — 위젯의 2D 그림들과 어울리게. 판정과 무관한 그림 전용.

import * as THREE from 'three'
import { logoUrl, teamOf, uniformTeam, type Equip, type KboTeam, type TeamKey } from '@/lib/baseballGear'

export type V3 = { x: number; y: number; z: number }
export type PlayerPose = { hands: V3; tip: V3; twist: number }
// yaw: 몸 방향(라디안, 오른손 타자 기준 — mirror면 반대로). 0이면 -z(화면 안쪽)를 본다
// build: 체형(컨택 0.84 홀쭉 · 밸런스 1 · 거포 1.24 떡대 — 3D에선 더 과장) / batW: 방망이 굵기(2D 기준 5 = 보통)
export type PlayerLook = { equip: Equip; name: string; number: number; build?: number; head?: number; batLen?: number; batW?: number; mirror?: boolean; yaw?: number }

const SKIN = '#EDC3A0'
const WOOD = '#B47A42'
const PLAIN_SHIRT = '#E9ECEF'
const PLAIN_PANTS = '#DADFE4'
const FALLBACK_HELMET = '#1F4E8C'
const OUTLINE = '#1B1F24'
const UP = new THREE.Vector3(0, 1, 0)

const inkOf = (t: KboTeam) => (t.primary === '#FFFFFF' ? t.secondary : t.primary)
// 언더셔츠(긴소매) 색: 구단 진한 색
const underOf = (t: KboTeam | null) => (!t ? '#4B5563' : t.cap === '#FFFFFF' ? t.secondary : t.cap)

// 셀 셰이딩 3단 명암 텍스처(공용)
let toonRamp: THREE.DataTexture | null = null
function ramp() {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
    toonRamp.minFilter = THREE.NearestFilter
    toonRamp.magFilter = THREE.NearestFilter
    toonRamp.needsUpdate = true
  }
  return toonRamp
}

// 구단 로고 텍스처(같은 로고는 한 번만 불러온다)
const logoCache = new Map<TeamKey, THREE.Texture>()
function logoTexture(key: TeamKey, onLoad: () => void) {
  let t = logoCache.get(key)
  if (!t) {
    t = new THREE.TextureLoader().load(logoUrl(key), onLoad)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    logoCache.set(key, t)
  } else if (t.image) queueMicrotask(onLoad)
  return t
}

// 상의 텍스처: 바탕 + 무늬(핀스트라이프·위장·눈송이) + 등 이름·번호(u 0.5 = 등) + 가슴 글씨(u 0/1 = 가슴)
function jerseyTexture(team: KboTeam | null, name: string, number: number) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = team?.jersey ?? PLAIN_SHIRT
  g.fillRect(0, 0, 1024, 512)
  if (team?.pinstripe) {
    g.strokeStyle = team.secondary
    g.globalAlpha = 0.5
    g.lineWidth = 5
    for (let x = 12; x < 1024; x += 38) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke() }
    g.globalAlpha = 1
  }
  if (team?.pattern === 'camo') {
    const blobs = ['#4A5530', '#8F9C66', '#3D4626']
    for (let i = 0; i < 60; i++) {
      g.fillStyle = blobs[i % 3]
      g.beginPath()
      g.ellipse((i * 173) % 1024, (i * 97) % 512, 44 + (i % 5) * 9, 20 + (i % 4) * 6, (i % 7) * 0.4, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (team?.pattern === 'snow') {
    g.fillStyle = '#FFFFFF'
    for (let i = 0; i < 90; i++) { g.beginPath(); g.arc((i * 211) % 1024, (i * 131) % 512, 6, 0, Math.PI * 2); g.fill() }
  }
  if (team) { // 단추선(가슴 가운데 = 가장자리)
    g.fillStyle = team.secondary
    g.globalAlpha = 0.6
    g.fillRect(0, 0, 5, 512)
    g.fillRect(1019, 0, 5, 512)
    g.globalAlpha = 1
  }
  const ink = team ? team.primary : '#6B7280'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const text = (s: string, x: number, y: number, size: number, italic = false) => {
    g.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`
    if (team) { g.strokeStyle = team.secondary; g.lineWidth = size * 0.1; g.strokeText(s, x, y) }
    g.fillStyle = ink
    g.fillText(s, x, y)
  }
  text(name, 512, 140, 58)
  text(String(number), 512, 290, 190)
  if (team?.wordmark) for (const x of [0, 1024]) text(team.wordmark, x, 200, 80, true)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// 길이 1·반지름 1 원기둥을 두 점 사이에 굵기 r로
function placeSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const d = new THREE.Vector3().subVectors(b, a)
  const len = Math.max(0.0001, d.length())
  obj.position.copy(a).addScaledVector(d, 0.5)
  obj.scale.set(r, len, r)
  obj.quaternion.setFromUnitVectors(UP, d.normalize())
}

// 두 마디 IK: 어깨 s → 손 h, 팔꿈치는 pole 쪽으로 굽힌다
function solveElbow(s: THREE.Vector3, h: THREE.Vector3, lu: number, ll: number, pole: THREE.Vector3) {
  const sh = new THREE.Vector3().subVectors(h, s)
  const d = Math.min(Math.max(sh.length(), 0.05), (lu + ll) * 0.999)
  const dir = sh.clone().normalize()
  const a = (lu * lu - ll * ll + d * d) / (2 * d)
  const hgt = Math.sqrt(Math.max(0, lu * lu - a * a))
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)))
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0)
  perp.normalize()
  return s.clone().addScaledVector(dir, a).addScaledVector(perp, hgt)
}

export class Player3D {
  readonly group = new THREE.Group()
  private disposables: { dispose: () => void }[] = []
  private parts: Record<string, THREE.Object3D> = {}
  private upper = new THREE.Group() // 허리 위 — twist로 돈다
  private build: number
  private mirror: number
  private yaw: number
  private batLen: number
  private batW: number
  private arm: number // 팔 굵기 배율(체형)
  private outlineM: THREE.MeshBasicMaterial
  private cyl: THREE.CylinderGeometry
  private ball: THREE.SphereGeometry
  onTextureLoad: () => void = () => {}

  constructor(look: PlayerLook) {
    // 2D 배율(0.84~1.24)을 3D에선 1.6배 과장 — 작은 화면에서도 홀쭉이·떡대가 한눈에
    this.build = 1 + ((look.build ?? 1) - 1) * 1.6
    this.arm = Math.sqrt(this.build)
    this.batW = (look.batW ?? 5) / 5
    this.mirror = look.mirror ? -1 : 1
    this.yaw = (look.yaw ?? 0) * this.mirror
    this.batLen = look.batLen ?? 1
    this.outlineM = this.m(new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide }))
    this.cyl = this.m(new THREE.CylinderGeometry(1, 1, 1, 20))
    this.ball = this.m(new THREE.SphereGeometry(1, 28, 18))
    this.group.rotation.y = this.yaw
    this.make(look)
  }

  private m<T extends { dispose: () => void }>(x: T): T { this.disposables.push(x); return x }
  private toon(color: string, o: THREE.MeshToonMaterialParameters = {}) { return this.m(new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...o })) }

  // 메시 + 외곽선(뒷면을 살짝 키워 검게 — 만화 같은 테두리). outline 0이면 외곽선 없음
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, outline = 0.045) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(geo, mat))
    if (outline > 0) {
      const o = new THREE.Mesh(geo, this.outlineM)
      o.scale.setScalar(1 + outline)
      g.add(o)
    }
    parent.add(g)
    return g
  }
  private sphere(r: [number, number, number] | number, mat: THREE.Material, parent: THREE.Object3D, outline = 0.06) {
    const g = this.mesh(this.ball, mat, parent, outline)
    if (typeof r === 'number') g.scale.setScalar(r)
    else g.scale.set(...r)
    return g
  }
  // 원기둥 마디(placeSegment로 자리) — 외곽선은 굵기 방향으로만 키운다
  private segment(mat: THREE.Material, parent: THREE.Object3D, name?: string) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(this.cyl, mat))
    const o = new THREE.Mesh(this.cyl, this.outlineM)
    o.scale.set(1.12, 1.02, 1.12)
    g.add(o)
    parent.add(g)
    if (name) this.parts[name] = g
    return g
  }

  private make(look: PlayerLook) {
    const e = look.equip
    const uni = uniformTeam(e)
    const cap = teamOf(e.cap)
    const k = this.build
    const M = this.mirror
    const skinM = this.toon(SKIN)
    const pantsM = this.toon(uni?.jersey ?? PLAIN_PANTS)
    const stripeM = this.toon(uni ? inkOf(uni) : '#9CA3AF')
    const sockM = this.toon(uni ? inkOf(uni) : '#4B5563')
    const shoeM = this.toon('#1B1E23')
    const soleM = this.toon('#F3F4F6')
    const sleeveM = this.toon(uni?.jersey ?? PLAIN_SHIRT)
    const trimM = this.toon(uni ? inkOf(uni) : '#9CA3AF')
    const underM = this.toon(underOf(uni))
    const beltM = this.toon(uni?.secondary ?? '#374151')
    const darkM = this.toon('#111317')
    const jerseyM = this.toon('#FFFFFF', { map: this.m(jerseyTexture(uni, look.name, look.number)) })

    // ── 하체: 무릎을 굽히고 엉덩이를 뒤로 뺀 타격 자세, 발은 어깨보다 넓게 ──
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * M, y, z)
    const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      [V(-0.12 * k, 0.9, 0.05), V(-0.25 * k, 0.5, -0.1), V(-0.31 * k, 0.09, -0.02)],
      [V(0.12 * k, 0.9, 0.05), V(0.25 * k, 0.5, -0.08), V(0.31 * k, 0.09, 0.02)],
    ]
    for (const [hip, knee, ank] of legs) {
      placeSegment(this.segment(pantsM, this.group), hip, knee, 0.1 * this.arm)
      this.sphere(0.092 * this.arm, pantsM, this.group, 0).position.copy(knee)
      const cuff = knee.clone().lerp(ank, 0.32)
      placeSegment(this.segment(pantsM, this.group), knee, cuff, 0.085 * this.arm)
      placeSegment(this.segment(sockM, this.group), cuff, ank, 0.058)
      // 바지 옆줄
      const out = Math.sign(hip.x) * 0.098 * Math.sqrt(k)
      const stripe = new THREE.Mesh(this.cyl, stripeM)
      placeSegment(stripe, hip.clone().add(new THREE.Vector3(out, -0.02, 0)), knee.clone().add(new THREE.Vector3(out * 0.88, 0, 0)), 0.014)
      this.group.add(stripe)
      // 신발: 앞코가 몸 앞(-z)으로 긴 낮은 타원 + 흰 밑창
      this.sphere([0.068, 0.05, 0.14], shoeM, this.group).position.set(ank.x, 0.05, ank.z - 0.05)
      this.sphere([0.07, 0.012, 0.145], soleM, this.group, 0).position.set(ank.x, 0.012, ank.z - 0.05)
    }
    this.sphere([0.2 * k, 0.15, 0.15], pantsM, this.group).position.set(0, 0.95, 0.05)
    const belt = this.mesh(this.cyl, beltM, this.group, 0.03)
    belt.scale.set(0.2 * k, 0.045, 0.15)
    belt.position.set(0, 1.06, 0.03)

    // ── 상체(허리 위): twist로 도는 그룹 ──
    this.upper.position.set(0, 1.04, 0.02)
    this.upper.rotation.order = 'YXZ'
    this.upper.rotation.x = 0.12 // 살짝 앞으로 숙임
    this.group.add(this.upper)
    const profile = [[0.17, 0], [0.175, 0.08], [0.19, 0.2], [0.205, 0.3], [0.2, 0.37], [0.15, 0.43], [0.07, 0.46]].map(([r, y]) => new THREE.Vector2(r, y))
    const torso = this.mesh(this.m(new THREE.LatheGeometry(profile, 48)), jerseyM, this.upper, 0.035)
    torso.scale.set(1.3 * k, 1, 0.72 * Math.sqrt(k))
    torso.rotation.y = Math.PI
    for (const side of [-1, 1]) this.sphere([0.085 * this.arm, 0.08 * this.arm, 0.08 * this.arm], sleeveM, this.upper).position.set(side * 0.245 * k, 0.385, 0)
    // 팔 마디 — 반소매(상의 색) + 소매 끝 트림 + 긴소매 언더셔츠(구단 진한 색)
    for (const side of ['L', 'R']) {
      this.segment(sleeveM, this.group, `sleeve${side}`)
      const trim = new THREE.Mesh(this.cyl, trimM)
      this.group.add(trim)
      this.parts[`trim${side}`] = trim
      this.segment(underM, this.group, `upper${side}`)
      this.segment(underM, this.group, `lower${side}`)
      this.parts[`elbow${side}`] = this.sphere(0.052 * this.arm, underM, this.group, 0)
      // 소매 로고 패치(구단 로고) — 어깨 바깥쪽에 붙는다(setPose가 자리)
      if (uni) {
        const patch = new THREE.Mesh(this.m(new THREE.CircleGeometry(0.042, 28)), this.m(new THREE.MeshBasicMaterial({ map: logoTexture(uni.key, () => this.onTextureLoad()), transparent: true })))
        this.group.add(patch)
        this.parts[`patch${side}`] = patch
      }
    }
    // 손(장갑 또는 맨손)
    const acc = e.slots.acc
    const glovesTeam = teamOf(acc?.team)
    const gold = acc?.part === 'goldglove'
    const gloveM = gold ? this.toon('#E2AE1C', { emissive: '#5A3E00', emissiveIntensity: 0.25 }) : this.toon(glovesTeam ? inkOf(glovesTeam) : SKIN)
    this.parts.handA = this.sphere(0.062, gloveM, this.group)
    this.parts.handB = this.sphere(0.062, gloveM, this.group)
    if (glovesTeam) {
      const band = new THREE.Mesh(this.m(new THREE.TorusGeometry(0.055, 0.018, 8, 20)), this.toon(gold ? inkOf(glovesTeam) : glovesTeam.secondary === inkOf(glovesTeam) ? '#FFFFFF' : glovesTeam.secondary))
      this.group.add(band)
      this.parts.band = band
    }

    // ── 방망이 / 응원봉: 손잡이 끝이 원점, +y로 뻗는다 ──
    const hand = e.slots.hand
    const cheer = hand?.part === 'cheer' ? teamOf(hand.team) : null
    const batTeam = teamOf(e.bat)
    const batG = new THREE.Group()
    this.group.add(batG)
    const L = 0.86 * this.batLen
    if (cheer) {
      const glow = inkOf(cheer)
      const grip = this.mesh(this.cyl, this.toon('#1F2933'), batG, 0.08); grip.scale.set(0.022, 0.2, 0.022); grip.position.y = 0.1
      const tube = this.mesh(this.cyl, this.m(new THREE.MeshBasicMaterial({ color: glow })), batG, 0.1); tube.scale.set(0.032, 0.5, 0.032); tube.position.y = 0.45
      const halo = new THREE.Mesh(this.cyl, this.m(new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.22, depthWrite: false })))
      halo.scale.set(0.07, 0.56, 0.07); halo.position.y = 0.45; batG.add(halo)
    } else {
      // 기본보다 1.3배 굵게 + 타자 유형 굵기(컨택 가늘게 · 거포 굵게)
      const W = 1.3 * this.batW
      const prof = [[0.0, -0.02], [0.026, -0.02], [0.018, 0.0], [0.016, 0.3], [0.025, 0.5], [0.037, 0.8], [0.037, 0.97], [0.0, 1.0]].map(([r, y]) => new THREE.Vector2(r * W, y * L))
      this.mesh(this.m(new THREE.LatheGeometry(prof, 24)), this.toon(batTeam?.bat ?? WOOD), batG, 0.1)
      if (batTeam) {
        // 구단 방망이: 손잡이 테이프(주 색) · 배럴 띠 두 줄(보조·주 색) · 끝마개(주 색) · 배럴 양면 로고 스티커
        const band = (r: number, y: number, h: number, c: string) => { const b = new THREE.Mesh(this.cyl, this.toon(c)); b.scale.set(r * W, h * L, r * W); b.position.y = y * L; batG.add(b) }
        band(0.0195, 0.14, 0.26, batTeam.primary)
        band(0.0385, 0.62, 0.05, batTeam.secondary)
        band(0.0385, 0.68, 0.025, batTeam.primary)
        band(0.0375, 0.985, 0.03, batTeam.primary)
        const stickerM = this.m(new THREE.MeshBasicMaterial({ map: logoTexture(batTeam.key, () => this.onTextureLoad()), transparent: true, side: THREE.DoubleSide }))
        for (const sgn of [-1, 1]) {
          const st = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.06 * W, 0.12)), stickerM)
          st.position.set(sgn * 0.0385 * W, 0.83 * L, 0)
          st.rotation.y = sgn * Math.PI / 2
          batG.add(st)
        }
      }
    }
    this.parts.bat = batG

    // ── 목·머리(머리를 크게 — 캐릭터 비율) ──
    const neck = this.mesh(this.cyl, skinM, this.upper, 0.06)
    neck.scale.set(0.065, 0.12, 0.065)
    neck.position.set(0, 0.5, 0)
    const headG = new THREE.Group()
    headG.position.set(0, 0.66, -0.01)
    headG.scale.setScalar((look.head ?? 1) * 1.12)
    this.upper.add(headG)
    this.sphere([0.112, 0.125, 0.118], skinM, headG, 0.05)
    for (const s of [-1, 1]) this.sphere([0.016, 0.032, 0.024], skinM, headG, 0.08).position.set(s * 0.112, -0.012, 0.008)
    this.sphere(0.022, skinM, headG, 0.08).position.set(0, -0.025, -0.118)
    const face = e.slots.face
    const faceTeam = teamOf(face?.team)
    for (const s of [-1, 1]) {
      if (face?.part !== 'shades') this.sphere(0.015, darkM, headG, 0).position.set(s * 0.042, 0.008, -0.108)
      if (face?.part === 'eyeblack') {
        const eb = new THREE.Mesh(this.m(new THREE.BoxGeometry(0.052, 0.022, 0.014)), darkM)
        eb.position.set(s * 0.046, -0.03, -0.11)
        eb.rotation.y = -s * 0.4
        headG.add(eb)
      }
    }
    if (face?.part === 'shades' && faceTeam) {
      const glass = this.m(new THREE.MeshPhongMaterial({ color: '#0D1015', specular: '#8CA4C8', shininess: 120 }))
      const lens = new THREE.Mesh(this.m(new THREE.CylinderGeometry(0.124, 0.12, 0.062, 40, 1, true, Math.PI - 1.15, 2.3)), glass)
      lens.position.set(0, 0.008, 0)
      headG.add(lens)
      const frameM = this.toon(inkOf(faceTeam))
      for (const y of [0.04, -0.023]) {
        const f = new THREE.Mesh(this.m(new THREE.CylinderGeometry(0.127, 0.126, 0.012, 40, 1, true, Math.PI - 1.2, 2.4)), frameM)
        f.position.set(0, y, 0)
        headG.add(f)
      }
    }
    // 모자 / 헬멧(헬멧은 머리를 깊게 덮고 광택 + 플레이트 쪽 귀덮개)
    const isCap = e.slots.head?.part === 'cap'
    const shellM = isCap ? this.toon(cap?.cap ?? FALLBACK_HELMET) : this.m(new THREE.MeshPhongMaterial({ color: cap?.cap ?? FALLBACK_HELMET, specular: '#FFFFFF', shininess: 90 }))
    const dome = this.mesh(this.m(new THREE.SphereGeometry(isCap ? 0.123 : 0.14, 44, 26, 0, Math.PI * 2, 0, Math.PI * (isCap ? 0.5 : 0.58))), shellM, headG, 0.04)
    dome.position.set(0, isCap ? 0.028 : 0.01, 0.004)
    dome.rotation.x = isCap ? 0.1 : 0.32
    const brim = this.sphere(isCap ? [0.105, 0.012, 0.105] : [0.095, 0.012, 0.075], shellM, headG, 0.12)
    brim.position.set(0, isCap ? 0.035 : 0.045, isCap ? -0.135 : -0.125)
    brim.rotation.x = -0.12
    // 귀덮개: 투수 쪽 귀(우타의 왼쪽 = 로컬 -x). 포수 시점에선 반대쪽 옆면(로고)이 보인다
    if (!isCap) this.sphere([0.034, 0.068, 0.07], shellM, headG, 0.08).position.set(-0.124 * M, -0.035, 0)
    if (cap) {
      const logoM = this.m(new THREE.MeshBasicMaterial({ map: logoTexture(cap.key, () => this.onTextureLoad()), transparent: true }))
      const front = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.09, 0.075)), logoM)
      front.position.set(0, 0.088, isCap ? -0.11 : -0.12)
      front.rotation.set(-0.42, Math.PI, 0)
      headG.add(front)
      // 옆면 로고(포수 시점에서 보이는 +x 면) — 모자·헬멧 모두. 타자 화면에서 구단이 잘 보이게 크게
      const side = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.1, 0.083)), logoM)
      side.position.set((isCap ? 0.124 : 0.141) * M, isCap ? 0.07 : 0.055, 0.0)
      side.rotation.set(0, (Math.PI / 2) * M, isCap ? 0 : 0.15 * M)
      headG.add(side)
      const back = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.075, 0.062)), logoM)
      back.position.set(0, 0.07, isCap ? 0.116 : 0.135)
      back.rotation.set(-0.3, 0, 0)
      headG.add(back)
    }
    this.setPose({ hands: { x: 0.2, y: 1.5, z: 0.2 }, tip: { x: 0.05, y: 2.2, z: 0.35 }, twist: -0.3 })
  }

  // 손·방망이 끝은 화면 기준(월드, 오른손 타자 기준 — mirror면 x를 뒤집는다). twist: 상체 회전(+ = 앞어깨가 투수 쪽으로 열림)
  setPose(p: PlayerPose) {
    const M = this.mirror
    const toLocal = (v: V3) => new THREE.Vector3(v.x * M, v.y, v.z).applyAxisAngle(UP, -this.yaw)
    this.upper.rotation.y = p.twist * M
    this.upper.updateMatrix()
    const hands = toLocal(p.hands)
    const tip = toLocal(p.tip)
    const batDir = tip.clone().sub(hands).normalize()
    const handB = hands.clone().addScaledVector(batDir, 0.09) // 위쪽 손
    const k = this.build
    for (const [side, h] of [['L', hands], ['R', handB]] as const) {
      const sgn = side === 'L' ? -1 : 1
      const s = new THREE.Vector3(sgn * 0.245 * k * M, 0.385, 0).applyMatrix4(this.upper.matrix)
      const pole = new THREE.Vector3(sgn * M * 0.6, -1, 0.5)
      const el = solveElbow(s, h, 0.29, 0.27, pole)
      const sl = s.clone().lerp(el, 0.55)
      placeSegment(this.parts[`sleeve${side}`], s, sl, 0.078 * this.arm)
      placeSegment(this.parts[`trim${side}`], sl.clone().lerp(s, 0.12), sl, 0.081 * this.arm)
      placeSegment(this.parts[`upper${side}`], sl, el, 0.056 * this.arm)
      placeSegment(this.parts[`lower${side}`], el, h, 0.05 * this.arm)
      const patch = this.parts[`patch${side}`]
      if (patch) {
        // 소매 바깥면: 어깨→팔꿈치 축에서 몸 중심 반대쪽으로 소매 반지름만큼
        const mid = s.clone().lerp(sl, 0.5)
        const axis = sl.clone().sub(s).normalize()
        const center = new THREE.Vector3(0, mid.y, 0.02)
        const out = mid.clone().sub(center)
        out.sub(axis.clone().multiplyScalar(out.dot(axis))).normalize()
        patch.position.copy(mid).addScaledVector(out, 0.08 * this.arm)
        patch.lookAt(patch.position.clone().add(out))
      }
      this.parts[`elbow${side}`].position.copy(el)
    }
    this.parts.handA.position.copy(hands)
    this.parts.handB.position.copy(handB)
    if (this.parts.band) {
      this.parts.band.position.copy(hands).addScaledVector(batDir, -0.06)
      this.parts.band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), batDir)
    }
    this.parts.bat.position.copy(hands).addScaledVector(batDir, -0.07)
    this.parts.bat.quaternion.setFromUnitVectors(UP, batDir)
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }
}

// 장면 공통 조명: 위 왼쪽에서 해(셀 셰이딩 명암 방향) + 하늘빛
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#9AA88C', 1.1))
  const sun = new THREE.DirectionalLight('#FFF6E8', 2.4)
  sun.position.set(-2, 4, 3.5)
  scene.add(sun)
}
