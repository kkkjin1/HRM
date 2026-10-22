// 3D 선수 인형(three.js) — SD(치비) 비율 캐릭터에 장비(구단 × 아이템)를 입힌다. React와 무관한 순수 모듈.
// 좌표: 미터, 발 가운데가 원점, y 위. 몸 기준(로컬)으로는 -z를 보고 서 있고, 그룹 전체를 yaw만큼 돌려 세운다
// (타석: 홈플레이트를 보고 옆으로 서서 앞어깨가 투수 쪽). 자세(손·방망이 끝)는 화면 기준(월드, 어른 비율) 좌표로 받아
// POSE_K 배율로 치비 몸에 맞춘다 — 2D 스윙 키(scene.tsx)를 그대로 쓰기 위해.
// 그림체: 셀 셰이딩 + 외곽선, 큰 머리·반짝이는 눈·볼터치·표정(기본 / 웃음 ^^ / 아쉬움 ><). 판정과 무관한 그림 전용.

import * as THREE from 'three'
import { logoUrl, teamOf, uniformTeam, type Equip, type KboTeam, type TeamKey } from '@/lib/baseballGear'

export type V3 = { x: number; y: number; z: number }
export type Mood = 'normal' | 'happy' | 'oops'
// look: 고개를 돌려 바라볼 방향(월드). 없으면 몸 앞쪽
export type PlayerPose = { hands: V3; tip: V3; twist: number; mood?: Mood; look?: V3 }
// build: 체형(컨택 0.84 홀쭉 · 밸런스 1 · 거포 1.24 떡대 — 3D에선 더 과장) / batW: 방망이 굵기(2D 기준 5 = 보통)
// yaw: 몸 방향(라디안, 오른손 타자 기준 — mirror면 반대로). 0이면 -z(화면 안쪽)를 본다
export type PlayerLook = { equip: Equip; name: string; number: number; build?: number; head?: number; batLen?: number; batW?: number; mirror?: boolean; yaw?: number }

const SKIN = '#F6CFAE'
const BLUSH = '#F49A9A'
const WOOD = '#C08548'
const PLAIN_SHIRT = '#EEF1F4'
const PLAIN_PANTS = '#DDE2E7'
const FALLBACK_HELMET = '#2F6BC4'
const OUTLINE = '#22262C'
const EYE = '#1E2329'
const HAIRS = ['#2A211B', '#3A2A1F', '#1B1B1D', '#5B3D26', '#4A3426']
const UP = new THREE.Vector3(0, 1, 0)
const SCALE = 1.25 // 치비 키(약 1.4m)를 경기 화면에서 어른 타자만큼 보이게
const POSE_K = { x: 0.62, y: 0.64, z: 0.62 } // 어른 비율 스윙 키 → 치비 몸(로컬, SCALE 적용 전 단위)

const inkOf = (t: KboTeam) => (t.primary === '#FFFFFF' ? t.secondary : t.primary)
const underOf = (t: KboTeam | null) => (!t ? '#5B6472' : t.cap === '#FFFFFF' ? t.secondary : t.cap)
const hashOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h }

// 셀 셰이딩 명암(2단 + 하이라이트) — 부드럽고 귀엽게
let toonRamp: THREE.DataTexture | null = null
function ramp() {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 225, 225, 225, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
    toonRamp.minFilter = THREE.NearestFilter
    toonRamp.magFilter = THREE.NearestFilter
    toonRamp.needsUpdate = true
  }
  return toonRamp
}

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

// 상의 텍스처: 바탕 + 무늬 + 등 이름·번호(u 0.5 = 등) + 가슴 글씨(u 0/1 = 가슴)
function jerseyTexture(team: KboTeam | null, name: string, number: number) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = team?.jersey ?? PLAIN_SHIRT
  g.fillRect(0, 0, 1024, 512)
  if (team?.pinstripe) {
    g.strokeStyle = team.secondary
    g.globalAlpha = 0.45
    g.lineWidth = 6
    for (let x = 14; x < 1024; x += 44) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke() }
    g.globalAlpha = 1
  }
  if (team?.pattern === 'camo') {
    const blobs = ['#4A5530', '#8F9C66', '#3D4626']
    for (let i = 0; i < 50; i++) {
      g.fillStyle = blobs[i % 3]
      g.beginPath()
      g.ellipse((i * 173) % 1024, (i * 97) % 512, 54 + (i % 5) * 10, 26 + (i % 4) * 7, (i % 7) * 0.4, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (team?.pattern === 'snow') {
    g.fillStyle = '#FFFFFF'
    for (let i = 0; i < 70; i++) { g.beginPath(); g.arc((i * 211) % 1024, (i * 131) % 512, 8, 0, Math.PI * 2); g.fill() }
  }
  const ink = team ? team.primary : '#7A8491'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const text = (s: string, x: number, y: number, size: number, italic = false) => {
    g.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`
    if (team) { g.strokeStyle = team.secondary; g.lineWidth = size * 0.12; g.strokeText(s, x, y) }
    g.fillStyle = ink
    g.fillText(s, x, y)
  }
  text(name, 512, 120, 66)
  text(String(number), 512, 300, 230)
  if (team?.wordmark) for (const x of [0, 1024]) text(team.wordmark, x, 230, 96, true)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// 머리에 붙은 얼굴 부품을 바깥(머리 중심 → 부품 방향)으로 향하게 — lookAt은 월드 좌표라 머리 안에선 못 쓴다.
// 얼굴은 -z 쪽이라 기준축도 -z(작은 회전만 생겨 부품이 옆으로 돌지 않는다)
const Z = new THREE.Vector3(0, 0, -1)
function faceOut(obj: THREE.Object3D) {
  obj.quaternion.setFromUnitVectors(Z, obj.position.clone().normalize())
}

function placeSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const d = new THREE.Vector3().subVectors(b, a)
  const len = Math.max(0.0001, d.length())
  obj.position.copy(a).addScaledVector(d, 0.5)
  obj.scale.set(r, len, r)
  obj.quaternion.setFromUnitVectors(UP, d.normalize())
}

function solveElbow(s: THREE.Vector3, h: THREE.Vector3, lu: number, ll: number, pole: THREE.Vector3) {
  const sh = new THREE.Vector3().subVectors(h, s)
  const d = Math.min(Math.max(sh.length(), 0.04), (lu + ll) * 0.999)
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
  private body = new THREE.Group() // 치비 몸(SCALE 배) — group(yaw) 안
  private disposables: { dispose: () => void }[] = []
  private parts: Record<string, THREE.Object3D> = {}
  private upper = new THREE.Group()
  private headG = new THREE.Group()
  private faces: Record<Mood, THREE.Group> = { normal: new THREE.Group(), happy: new THREE.Group(), oops: new THREE.Group() }
  private build: number
  private arm: number
  private mirror: number
  private yaw: number
  private batLen: number
  private batW: number
  private outlineM: THREE.MeshBasicMaterial
  private cyl: THREE.CylinderGeometry
  private ball: THREE.SphereGeometry
  onTextureLoad: () => void = () => {}

  constructor(look: PlayerLook) {
    this.build = 1 + ((look.build ?? 1) - 1) * 1.6
    this.arm = Math.sqrt(this.build)
    this.mirror = look.mirror ? -1 : 1
    this.yaw = (look.yaw ?? 0) * this.mirror
    this.batLen = look.batLen ?? 1
    this.batW = (look.batW ?? 5) / 5
    this.outlineM = this.m(new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide }))
    this.cyl = this.m(new THREE.CylinderGeometry(1, 1, 1, 24))
    this.ball = this.m(new THREE.SphereGeometry(1, 32, 22))
    this.group.rotation.y = this.yaw
    this.body.scale.setScalar(SCALE)
    this.group.add(this.body)
    this.make(look)
  }

  private m<T extends { dispose: () => void }>(x: T): T { this.disposables.push(x); return x }
  private toon(color: string, o: THREE.MeshToonMaterialParameters = {}) { return this.m(new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...o })) }
  private flat(color: string) { return this.m(new THREE.MeshBasicMaterial({ color })) }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, outline = 0.04) {
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
  private segment(mat: THREE.Material, parent: THREE.Object3D, name?: string, outline = 1.14) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(this.cyl, mat))
    const o = new THREE.Mesh(this.cyl, this.outlineM)
    o.scale.set(outline, 1.0, outline)
    g.add(o)
    parent.add(g)
    if (name) this.parts[name] = g
    return g
  }
  // 둥근 끝을 가진 마디(캡슐 느낌): 원기둥 + 양끝 구
  private limb(mat: THREE.Material, name: string) {
    this.segment(mat, this.body, name)
    this.parts[`${name}A`] = this.sphere(1, mat, this.body, 0.1)
    this.parts[`${name}B`] = this.sphere(1, mat, this.body, 0.1)
  }
  private placeLimb(name: string, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    placeSegment(this.parts[name], a, b, r)
    this.parts[`${name}A`].position.copy(a); this.parts[`${name}A`].scale.setScalar(r)
    this.parts[`${name}B`].position.copy(b); this.parts[`${name}B`].scale.setScalar(r)
  }

  private make(look: PlayerLook) {
    const e = look.equip
    const uni = uniformTeam(e)
    const cap = teamOf(e.cap)
    const k = this.build
    const M = this.mirror
    const seed = hashOf(look.name)
    const hair = HAIRS[seed % HAIRS.length]
    const skinM = this.toon(SKIN)
    const pantsM = this.toon(uni?.jersey ?? PLAIN_PANTS)
    const sockM = this.toon(uni ? inkOf(uni) : '#5B6472')
    const shoeM = this.toon('#262A31')
    const soleM = this.toon('#FFFFFF')
    const sleeveM = this.toon(uni?.jersey ?? PLAIN_SHIRT)
    const trimM = this.toon(uni ? inkOf(uni) : '#AEB6BF')
    const underM = this.toon(underOf(uni))
    const beltM = this.toon(uni?.secondary ?? '#3F4854')
    const jerseyM = this.toon('#FFFFFF', { map: this.m(jerseyTexture(uni, look.name, look.number)) })

    // ── 다리: 짧고 통통하게, 무릎 살짝 굽힘 ──
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * M, y, z)
    const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      [V(-0.1 * k, 0.5, 0.03), V(-0.17 * k, 0.29, -0.06), V(-0.2 * k, 0.09, -0.01)],
      [V(0.1 * k, 0.5, 0.03), V(0.17 * k, 0.29, -0.04), V(0.2 * k, 0.09, 0.01)],
    ]
    legs.forEach(([hip, knee, ank], i) => {
      this.limb(pantsM, `thigh${i}`); this.placeLimb(`thigh${i}`, hip, knee, 0.088 * this.arm)
      const cuff = knee.clone().lerp(ank, 0.4)
      this.limb(pantsM, `shin${i}`); this.placeLimb(`shin${i}`, knee, cuff, 0.078 * this.arm)
      this.limb(sockM, `sock${i}`); this.placeLimb(`sock${i}`, cuff, ank, 0.058)
      // 신발: 동글동글 + 흰 밑창
      this.sphere([0.075, 0.06, 0.12], shoeM, this.body).position.set(ank.x, 0.06, ank.z - 0.04)
      this.sphere([0.078, 0.02, 0.124], soleM, this.body, 0.05).position.set(ank.x, 0.018, ank.z - 0.04)
    })
    this.sphere([0.18 * k, 0.12, 0.14], pantsM, this.body).position.set(0, 0.56, 0.03)
    const belt = this.mesh(this.cyl, beltM, this.body, 0.03)
    belt.scale.set(0.175 * k, 0.04, 0.135)
    belt.position.set(0, 0.64, 0.02)

    // ── 상체: 동그란 몸통 ──
    this.upper.position.set(0, 0.62, 0.02)
    this.upper.rotation.order = 'YXZ'
    this.upper.rotation.x = 0.08
    this.body.add(this.upper)
    const profile = [[0.16, 0], [0.175, 0.07], [0.185, 0.16], [0.178, 0.24], [0.15, 0.3], [0.08, 0.335], [0.03, 0.34]].map(([r, y]) => new THREE.Vector2(r, y))
    const torso = this.mesh(this.m(new THREE.LatheGeometry(profile, 48)), jerseyM, this.upper, 0.03)
    torso.scale.set(1.12 * k, 1, 0.82 * Math.sqrt(k))
    torso.rotation.y = Math.PI
    for (const side of [-1, 1]) this.sphere(0.075 * this.arm, sleeveM, this.upper).position.set(side * 0.19 * k, 0.27, 0)
    for (const side of ['L', 'R']) {
      this.limb(sleeveM, `sleeve${side}`)
      const trim = new THREE.Mesh(this.cyl, trimM)
      this.body.add(trim)
      this.parts[`trim${side}`] = trim
      this.limb(underM, `fore${side}`)
      if (uni) {
        const patch = new THREE.Mesh(this.m(new THREE.CircleGeometry(0.04, 28)), this.m(new THREE.MeshBasicMaterial({ map: logoTexture(uni.key, () => this.onTextureLoad()), transparent: true })))
        this.body.add(patch)
        this.parts[`patch${side}`] = patch
      }
    }
    // 손: 동그란 벙어리장갑 느낌(장갑이 있으면 구단 색)
    const acc = e.slots.acc
    const glovesTeam = teamOf(acc?.team)
    const gold = acc?.part === 'goldglove'
    const gloveM = gold ? this.toon('#F0B92A', { emissive: '#6B4A00', emissiveIntensity: 0.3 }) : this.toon(glovesTeam ? inkOf(glovesTeam) : SKIN)
    this.parts.handA = this.sphere(0.062, gloveM, this.body, 0.1)
    this.parts.handB = this.sphere(0.062, gloveM, this.body, 0.1)

    // ── 방망이 / 응원봉(손잡이 끝이 원점, +y) — 치비라 몸에 비해 크게 ──
    const hand = e.slots.hand
    const cheer = hand?.part === 'cheer' ? teamOf(hand.team) : null
    const batTeam = teamOf(e.bat)
    const batG = new THREE.Group()
    this.body.add(batG)
    const L = 0.74 * this.batLen
    const W = 1.35 * this.batW
    if (cheer) {
      const glow = inkOf(cheer)
      const grip = this.mesh(this.cyl, this.toon('#262A31'), batG, 0.1); grip.scale.set(0.024 * W, 0.18, 0.024 * W); grip.position.y = 0.09
      const tube = this.mesh(this.cyl, this.flat(glow), batG, 0.1); tube.scale.set(0.036 * W, 0.46, 0.036 * W); tube.position.y = 0.41
      this.sphere(0.036 * W, this.flat(glow), batG, 0.1).position.y = 0.64
      const halo = new THREE.Mesh(this.cyl, this.m(new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.25, depthWrite: false })))
      halo.scale.set(0.075 * W, 0.52, 0.075 * W); halo.position.y = 0.42; batG.add(halo)
    } else {
      const prof = [[0.0, -0.02], [0.028, -0.02], [0.019, 0.0], [0.017, 0.3], [0.026, 0.5], [0.04, 0.8], [0.04, 0.96], [0.0, 1.0]].map(([r, y]) => new THREE.Vector2(r * W, y * L))
      this.mesh(this.m(new THREE.LatheGeometry(prof, 28)), this.toon(batTeam?.bat ?? WOOD), batG, 0.09)
      if (batTeam) {
        const band = (r: number, y: number, h: number, c: string) => { const b = new THREE.Mesh(this.cyl, this.toon(c)); b.scale.set(r * W, h * L, r * W); b.position.y = y * L; batG.add(b) }
        band(0.0205, 0.14, 0.26, batTeam.primary)
        band(0.0415, 0.62, 0.05, batTeam.secondary)
        band(0.0415, 0.68, 0.025, batTeam.primary)
        band(0.0405, 0.975, 0.035, batTeam.primary)
        const stickerM = this.m(new THREE.MeshBasicMaterial({ map: logoTexture(batTeam.key, () => this.onTextureLoad()), transparent: true, side: THREE.DoubleSide }))
        for (const sgn of [-1, 1]) {
          const st = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.07 * W, 0.12)), stickerM)
          st.position.set(sgn * 0.0415 * W, 0.83 * L, 0)
          st.rotation.y = sgn * Math.PI / 2
          batG.add(st)
        }
      }
    }
    this.parts.bat = batG

    // ── 머리(크게!) ──
    this.headG.position.set(0, 0.5, -0.01)
    this.headG.scale.setScalar(look.head ?? 1)
    this.upper.add(this.headG)
    const H = 0.2 // 머리 반지름
    this.sphere([H, H * 0.95, H * 0.96], skinM, this.headG, 0.035)
    for (const s of [-1, 1]) this.sphere([0.03, 0.045, 0.035], skinM, this.headG, 0.1).position.set(s * H * 0.98, -0.02, 0.01)
    // 머리카락: 헬멧 아래 뒤통수·구레나룻
    const hairM = this.toon(hair)
    // 헬멧 밑으로 살짝 보이는 뒷머리(목덜미)와 짧은 구레나룻
    this.sphere([H * 0.8, H * 0.38, H * 0.6], hairM, this.headG, 0.04).position.set(0, -0.06, H * 0.48)
    for (const s of [-1, 1]) this.sphere([0.014, 0.034, 0.022], hairM, this.headG, 0.1).position.set(s * H * 0.95, -0.005, -0.055)
    // 얼굴 표면 위 점(로컬 x, y → 앞쪽 z)
    // lift: 얼굴 표면에서 바깥으로 띄우는 거리(겹침·묻힘 방지)
    const onFace = (x: number, y: number, lift = 0) => new THREE.Vector3(x, y, -Math.sqrt(Math.max(0, H * H * 0.92 - x * x - y * y)) - 0.003 - Math.abs(lift))
    const face = e.slots.face
    const faceTeam = teamOf(face?.team)
    const eyeM = this.flat(EYE)
    const whiteM = this.flat('#FFFFFF')
    // 볼터치(선글라스여도 보인다)
    for (const s of [-1, 1]) {
      const b = this.sphere([0.032, 0.02, 0.012], this.flat(BLUSH), this.headG, 0)
      b.position.copy(onFace(s * 0.105, -0.06, -0.004))
      faceOut(b)
    }
    // 눈썹(사람마다 조금 다르게 — 각도)
    const browTilt = ((seed >> 3) % 3 - 1) * 0.18
    for (const s of [-1, 1]) {
      const brow = new THREE.Mesh(this.m(new THREE.BoxGeometry(0.05, 0.012, 0.01)), this.flat(hair))
      brow.position.copy(onFace(s * 0.07, 0.065, 0.002))
      brow.rotation.z = s * browTilt
      this.headG.add(brow)
    }
    // 표정 세 가지 — mood로 하나만 보인다
    for (const s of [-1, 1]) {
      // 기본: 세로로 긴 눈 + 반짝 하이라이트 2개
      const eye = this.sphere([0.024, 0.034, 0.012], eyeM, this.faces.normal, 0)
      eye.position.copy(onFace(s * 0.07, 0.01, -0.002))
      faceOut(eye)
      const hi = this.sphere(0.009, whiteM, this.faces.normal, 0); hi.position.copy(onFace(s * 0.07 - 0.008, 0.024, 0.012))
      const hi2 = this.sphere(0.005, whiteM, this.faces.normal, 0); hi2.position.copy(onFace(s * 0.07 + 0.009, -0.004, 0.012))
      // 웃음: ^ 모양 눈
      const arc = new THREE.Mesh(this.m(new THREE.TorusGeometry(0.024, 0.007, 6, 16, Math.PI)), eyeM)
      arc.position.copy(onFace(s * 0.07, 0.0, 0.0)); faceOut(arc); arc.rotateZ(0)
      this.faces.happy.add(arc)
      // 아쉬움: > < 눈
      for (const d of [-1, 1]) {
        const bar = new THREE.Mesh(this.m(new THREE.BoxGeometry(0.036, 0.009, 0.008)), eyeM)
        bar.position.copy(onFace(s * 0.07, 0.01 + d * 0.009, 0.0)); faceOut(bar); bar.rotateZ(-s * d * 0.5)
        this.faces.oops.add(bar)
      }
    }
    // 입: 기본 작은 미소 / 웃음 크게 / 아쉬움 동그란 입
    const mouthM = this.flat('#8A3A3A')
    const smile = new THREE.Mesh(this.m(new THREE.TorusGeometry(0.02, 0.006, 6, 14, Math.PI)), mouthM)
    smile.position.copy(onFace(0, -0.075)); faceOut(smile); smile.rotateZ(Math.PI)
    this.faces.normal.add(smile)
    const grin = this.sphere([0.03, 0.022, 0.01], mouthM, this.faces.happy, 0); grin.position.copy(onFace(0, -0.075, -0.002)); faceOut(grin)
    const ooh = this.sphere([0.014, 0.017, 0.008], mouthM, this.faces.oops, 0); ooh.position.copy(onFace(0, -0.08, -0.002)); faceOut(ooh)
    for (const g of Object.values(this.faces)) this.headG.add(g)
    this.setMood('normal')
    // 얼굴 아이템
    if (face?.part === 'eyeblack') {
      for (const s of [-1, 1]) {
        const eb = new THREE.Mesh(this.m(new THREE.BoxGeometry(0.05, 0.016, 0.01)), eyeM)
        eb.position.copy(onFace(s * 0.07, -0.032, -0.002)); faceOut(eb)
        this.headG.add(eb)
      }
    }
    if (face?.part === 'shades' && faceTeam) {
      // 눈 위에 쓰는 동그란 스포츠 선글라스(렌즈 2개 + 구단 색 테) — 눈은 가린다
      for (const g of [this.faces.normal, this.faces.happy, this.faces.oops]) g.children.forEach(c => { if (c.position.y > -0.04) c.visible = false })
      const glass = this.toon('#1A2230')
      const frameM = this.toon(inkOf(faceTeam))
      for (const s of [-1, 1]) {
        const lens = this.sphere([0.045, 0.036, 0.014], glass, this.headG, 0.18)
        lens.position.copy(onFace(s * 0.07, 0.012, 0.014)); faceOut(lens)
        const shine = this.sphere([0.012, 0.007, 0.004], whiteM, this.headG, 0) // 렌즈 반사광
        shine.position.copy(onFace(s * 0.07 - 0.015, 0.026, 0.024)); faceOut(shine)
        const rim = new THREE.Mesh(this.m(new THREE.TorusGeometry(0.044, 0.007, 8, 24)), frameM)
        rim.position.copy(onFace(s * 0.07, 0.012, 0.02)); faceOut(rim); rim.scale.set(1, 0.82, 1)
        this.headG.add(rim)
      }
      const bridge = new THREE.Mesh(this.cyl, frameM); bridge.scale.set(0.006, 0.05, 0.006); bridge.rotation.z = Math.PI / 2; bridge.position.copy(onFace(0, 0.02, 0.02)); this.headG.add(bridge)
    }
    // 모자 / 헬멧 — 머리를 크게 덮는 반짝이는 헬멧(귀덮개는 투수 쪽 귀), 옆면에 큰 로고
    const isCap = e.slots.head?.part === 'cap'
    const shellM = isCap ? this.toon(cap?.cap ?? FALLBACK_HELMET) : this.m(new THREE.MeshPhongMaterial({ color: cap?.cap ?? FALLBACK_HELMET, specular: '#FFFFFF', shininess: 110 }))
    const R = H * (isCap ? 1.03 : 1.1)
    const dome = this.mesh(this.m(new THREE.SphereGeometry(R, 48, 28, 0, Math.PI * 2, 0, Math.PI * (isCap ? 0.47 : 0.53))), shellM, this.headG, 0.035)
    dome.position.set(0, isCap ? 0.035 : 0.02, 0.01)
    dome.rotation.x = isCap ? 0.1 : 0.22
    const brim = this.sphere(isCap ? [R * 0.86, 0.014, R * 0.8] : [R * 0.7, 0.014, R * 0.5], shellM, this.headG, 0.12)
    brim.position.set(0, isCap ? 0.05 : 0.07, -R * (isCap ? 0.95 : 0.88))
    brim.rotation.x = -0.15
    if (!isCap) this.sphere([0.045, 0.085, 0.09], shellM, this.headG, 0.08).position.set(-R * 0.95 * M, -0.045, 0.0)
    if (cap) {
      const logoM = this.m(new THREE.MeshBasicMaterial({ map: logoTexture(cap.key, () => this.onTextureLoad()), transparent: true }))
      const front = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.12, 0.1)), logoM)
      front.position.set(0, 0.14, -R * 0.86); front.rotation.set(-0.55, Math.PI, 0); this.headG.add(front)
      const side = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.13, 0.108)), logoM)
      side.position.set(R * 0.99 * M, 0.09, 0.01); side.rotation.set(0, (Math.PI / 2) * M, 0.25 * M); this.headG.add(side)
      const back = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.1, 0.083)), logoM)
      back.position.set(0, 0.11, R * 0.93); back.rotation.set(-0.45, 0, 0); this.headG.add(back)
    }
    this.setPose({ hands: { x: 0.3, y: 1.5, z: 0.1 }, tip: { x: 0.1, y: 2.2, z: 0.3 }, twist: 0 })
  }

  setMood(mood: Mood) {
    for (const [k, g] of Object.entries(this.faces)) g.visible = k === mood
  }

  setPose(p: PlayerPose) {
    const M = this.mirror
    // 월드(어른 비율) → 치비 몸 로컬: yaw 되돌리고, 몸 배율로 나누고, 치비 비율로 줄인다
    const toLocal = (v: V3) => {
      const w = new THREE.Vector3(v.x * M, v.y, v.z).applyAxisAngle(UP, -this.yaw)
      return new THREE.Vector3(w.x * POSE_K.x, w.y * POSE_K.y, w.z * POSE_K.z)
    }
    this.upper.rotation.y = p.twist * M
    this.upper.updateMatrix()
    if (p.mood) this.setMood(p.mood)
    // 고개: 바라볼 방향(월드) → 상체 기준 각도
    if (p.look) {
      const d = new THREE.Vector3(p.look.x * M, 0, p.look.z).applyAxisAngle(UP, -this.yaw - this.upper.rotation.y)
      this.headG.rotation.y = Math.atan2(-d.x, -d.z)
    } else this.headG.rotation.y = 0
    const hands = toLocal(p.hands)
    const tip = toLocal(p.tip)
    const batDir = tip.clone().sub(hands).normalize()
    const handB = hands.clone().addScaledVector(batDir, 0.08)
    const k = this.build
    for (const [side, h] of [['L', hands], ['R', handB]] as const) {
      const sgn = side === 'L' ? -1 : 1
      const s = new THREE.Vector3(sgn * 0.19 * k * M, 0.27, 0).applyMatrix4(this.upper.matrix)
      const el = solveElbow(s, h, 0.19, 0.18, new THREE.Vector3(sgn * M * 0.6, -1, 0.5))
      const sl = s.clone().lerp(el, 0.6)
      this.placeLimb(`sleeve${side}`, s, sl, 0.066 * this.arm)
      placeSegment(this.parts[`trim${side}`], sl.clone().lerp(s, 0.15), sl, 0.07 * this.arm)
      this.placeLimb(`fore${side}`, sl, h, 0.048 * this.arm)
      const patch = this.parts[`patch${side}`]
      if (patch) {
        const mid = s.clone().lerp(sl, 0.45)
        const axis = sl.clone().sub(s).normalize()
        const out = mid.clone().sub(new THREE.Vector3(0, mid.y, 0.02))
        out.sub(axis.clone().multiplyScalar(out.dot(axis))).normalize()
        patch.position.copy(mid).addScaledVector(out, 0.069 * this.arm)
        patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      }
    }
    this.parts.handA.position.copy(hands)
    this.parts.handB.position.copy(handB)
    this.parts.bat.position.copy(hands).addScaledVector(batDir, -0.06)
    this.parts.bat.quaternion.setFromUnitVectors(UP, batDir)
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }
}

// 장면 공통 조명: 위 왼쪽 앞에서 해 + 하늘빛(밝고 부드럽게)
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#B9C4AE', 1.35))
  const sun = new THREE.DirectionalLight('#FFF6E8', 2.2)
  sun.position.set(-2, 4, 3.5)
  scene.add(sun)
}
