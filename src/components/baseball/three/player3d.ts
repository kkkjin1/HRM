// 3D 선수 인형(three.js) — 팝마트 같은 비닐 피규어 느낌의 SD 캐릭터에 장비(구단 × 아이템)를 입힌다. React와 무관한 순수 모듈.
// 좌표: 미터, 발 가운데가 원점, y 위. 몸 기준(로컬)으로는 -z를 보고 서 있고, 그룹 전체를 yaw만큼 돌려 세운다
// (타석: 홈플레이트를 보고 옆으로 서서 앞어깨가 투수 쪽). 자세(손·방망이 끝)는 화면 기준(월드, 어른 비율) 좌표로 받아
// POSE_K 배율로 SD 몸에 맞춘다 — 2D 스윙 키(scene.tsx)를 그대로 쓰기 위해.
// 그림체: 외곽선 없이 광택 있는 비닐(clearcoat) + 뒤쪽 테두리 빛, 달걀형 몸통, 큰 반짝 눈.
// 타순마다 캐릭터가 다르다(build로 구분): 1번 컨택형 날렵·별눈·볼 반창고 / 2번 밸런스형 동글눈·ω입 / 3번 거포형 큰 체구·짙은 눈썹·씩 웃음.
// 표정: 기본 / 안타(웃음 + 반짝이) / 헛스윙·루킹(땀방울 + 물결 입). 판정과 무관한 그림 전용.

import * as THREE from 'three'
import { logoUrl, teamOf, uniformTeam, type Equip, type KboTeam, type TeamKey } from '@/lib/baseballGear'

export type V3 = { x: number; y: number; z: number }
export type Mood = 'normal' | 'happy' | 'oops'
// look: 고개를 돌려 바라볼 방향(월드). 없으면 몸 앞쪽
// follow: 스윙 진행(0 준비 → 1 팔로스루) — 고개가 스윙 방향(몸)을 따라 돈다
// stance: 타격폼 하체·상체 — drop 엉덩이를 낮춤(m, SD 기준) · spread 발 너비 배율 · lean 상체 숙임(라디안) · front 앞발을 투수 쪽 반대로 뺌(오픈 스탠스)
export type Stance = { drop: number; spread: number; lean: number; front: number }
export type PlayerPose = { hands: V3; tip: V3; twist: number; mood?: Mood; look?: V3; follow?: number; stance?: Stance }
// 투수 자세(화면 기준 어른 비율 미터): 던지는 손·글러브·엉덩이·무릎·발(z = 포수 쪽 +). holding: 공을 쥐고 있음
export type PitchPose = { hand: V3; glove: V3; hip: V3; kneeL: V3; kneeR: V3; footL: V3; footR: V3; twist: number; holding: boolean; mood?: Mood }
// build: 체형(2D 기준 컨택 0.84 · 밸런스 1 · 거포 1.24 — 캐릭터 종류도 이걸로 정한다) / batW: 방망이 굵기(5 = 보통)
// yaw: 몸 방향(라디안, 오른손 타자 기준 — mirror면 반대로). 0이면 -z(화면 안쪽)를 본다
// role: 타자(방망이) / 투수(글러브·공). kind: 캐릭터 종류(없으면 build로). height: 키 배율(투수 유형 — 잠수함 작게 · 파이어볼러 크게)
export type Kind = 'contact' | 'balance' | 'power'
// role catcher: 쪼그려 앉은 포수(마스크·보호대·미트) / umpire: 심판(남색 셔츠·회색 바지·마스크)
export type Role = 'batter' | 'pitcher' | 'catcher' | 'umpire'
export type PlayerLook = { equip: Equip; name: string; number: number; build?: number; head?: number; batLen?: number; batW?: number; mirror?: boolean; yaw?: number; role?: Role; kind?: Kind; height?: number }

const SKIN = '#FFD6B5'
const BLUSH = '#FF9EAA'
const WOOD = '#C88B4E'
const PLAIN_SHIRT = '#F2F4F7'
const PLAIN_PANTS = '#E3E7EC'
const FALLBACK_HELMET = '#3B7BE0'
const EYE = '#2A2230'
const HAIRS = ['#3A2B25', '#4B3427', '#2A2628', '#6B4A33', '#5A3C2E']
const WRIST: Record<Kind, string | null> = { contact: '#3B82F6', balance: null, power: '#EF4444' }
const UP = new THREE.Vector3(0, 1, 0)
const SCALE = 1.25 // SD 키(약 1.4m)를 경기 화면에서 어른 타자만큼 보이게
const POSE_K = { x: 0.62, y: 0.64, z: 0.62 } // 어른 비율 스윙 키 → SD 몸(로컬, SCALE 적용 전 단위)
const PITCH_K = { x: 0.8, y: 0.52, z: 0.8 } // 어른 비율 투구 자세(머리 1.72m) → SD 몸

const inkOf = (t: KboTeam) => (t.primary === '#FFFFFF' ? t.secondary : t.primary)
const underOf = (t: KboTeam | null) => (!t ? '#6B7480' : t.cap === '#FFFFFF' ? t.secondary : t.cap)
const hashOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h }

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

// 상의 텍스처(달걀형 몸통 = SphereGeometry UV): u 0.25 = 등(+z), u 0.75 = 가슴(-z). v는 위(0) → 아래(1)
function jerseyTexture(team: KboTeam | null, name: string, number: number) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = team?.jersey ?? PLAIN_SHIRT
  g.fillRect(0, 0, 1024, 512)
  if (team?.pinstripe) {
    g.strokeStyle = team.secondary
    g.globalAlpha = 0.4
    g.lineWidth = 6
    for (let x = 14; x < 1024; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke() }
    g.globalAlpha = 1
  }
  if (team?.pattern === 'camo') {
    const blobs = ['#4A5530', '#8F9C66', '#3D4626']
    for (let i = 0; i < 50; i++) {
      g.fillStyle = blobs[i % 3]
      g.beginPath()
      g.ellipse((i * 173) % 1024, (i * 97) % 512, 50 + (i % 5) * 10, 24 + (i % 4) * 7, (i % 7) * 0.4, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (team?.pattern === 'snow') {
    g.fillStyle = '#FFFFFF'
    for (let i = 0; i < 70; i++) { g.beginPath(); g.arc((i * 211) % 1024, (i * 131) % 512, 8, 0, Math.PI * 2); g.fill() }
  }
  // 목 칼라·밑단 띠
  if (team) {
    g.fillStyle = inkOf(team)
    g.fillRect(0, 60, 1024, 14)
    g.fillRect(0, 440, 1024, 12)
  }
  const ink = team ? team.primary : '#8A94A0'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const text = (s: string, x: number, y: number, size: number, italic = false) => {
    g.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`
    if (team) { g.strokeStyle = team.secondary; g.lineWidth = size * 0.12; g.strokeText(s, x, y) }
    g.fillStyle = ink
    g.fillText(s, x, y)
  }
  text(name, 256, 170, 46)
  text(String(number), 256, 290, 170)
  if (team?.wordmark) text(team.wordmark, 768, 250, 70, true)
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
  private body = new THREE.Group()
  private disposables: { dispose: () => void }[] = []
  private parts: Record<string, THREE.Object3D> = {}
  private upper = new THREE.Group()
  private headG = new THREE.Group()
  private faces: Record<Mood, THREE.Group> = { normal: new THREE.Group(), happy: new THREE.Group(), oops: new THREE.Group() }
  private kind: Kind
  private role: Role
  private legs: { name: string; shoe: THREE.Object3D; sole: THREE.Object3D; toe: THREE.Object3D }[] = []
  private pelvis: THREE.Object3D | null = null
  private ballInHand: THREE.Object3D | null = null
  private stanceKey = ''
  private build: number
  private arm: number
  private mirror: number
  private yaw: number
  private batLen: number
  private batW: number
  private cyl: THREE.CylinderGeometry
  private ball: THREE.SphereGeometry
  onTextureLoad: () => void = () => {}

  constructor(look: PlayerLook) {
    const b = look.build ?? 1
    this.kind = look.kind ?? (b < 0.95 ? 'contact' : b > 1.1 ? 'power' : 'balance')
    this.role = look.role ?? 'batter'
    this.build = 1 + (b - 1) * 1.5
    this.arm = Math.sqrt(this.build)
    this.mirror = look.mirror ? -1 : 1
    this.yaw = (look.yaw ?? 0) * this.mirror
    this.batLen = look.batLen ?? 1
    this.batW = (look.batW ?? 5) / 5
    this.cyl = this.m(new THREE.CylinderGeometry(1, 1, 1, 28))
    this.ball = this.m(new THREE.SphereGeometry(1, 40, 28))
    this.group.rotation.y = this.yaw
    this.body.scale.setScalar(SCALE * (look.height ?? 1))
    this.group.add(this.body)
    this.make(look)
  }

  private m<T extends { dispose: () => void }>(x: T): T { this.disposables.push(x); return x }
  // 비닐 피규어 재질: 살짝 광택(clearcoat) + 부드러운 음영
  private vinyl(color: string, o: THREE.MeshPhysicalMaterialParameters = {}) {
    return this.m(new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.2, ...o }))
  }
  private flat(color: string) { return this.m(new THREE.MeshBasicMaterial({ color })) }

  private sphere(r: [number, number, number] | number, mat: THREE.Material, parent: THREE.Object3D) {
    const s = new THREE.Mesh(this.ball, mat)
    parent.add(s)
    if (typeof r === 'number') s.scale.setScalar(r)
    else s.scale.set(...r)
    return s
  }
  // 둥근 끝 마디(캡슐 느낌): 원기둥 + 양끝 구
  private limb(mat: THREE.Material, name: string) {
    const seg = new THREE.Mesh(this.cyl, mat)
    this.body.add(seg)
    this.parts[name] = seg
    this.parts[`${name}A`] = this.sphere(1, mat, this.body)
    this.parts[`${name}B`] = this.sphere(1, mat, this.body)
  }
  private placeLimb(name: string, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    placeSegment(this.parts[name], a, b, r)
    this.parts[`${name}A`].position.copy(a); this.parts[`${name}A`].scale.setScalar(r)
    this.parts[`${name}B`].position.copy(b); this.parts[`${name}B`].scale.setScalar(r)
  }

  // 다리 두 개: [엉덩이, 무릎, 발목] (몸 로컬). 신발은 발목 아래, 앞코는 몸 앞(-z)
  private placeLegs(legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][]) {
    legs.forEach(([hip, knee, ank], i) => {
      this.placeLimb(`thigh${i}`, hip, knee, 0.085 * this.arm)
      const cuff = knee.clone().lerp(ank, 0.45)
      this.placeLimb(`shin${i}`, knee, cuff, 0.072 * this.arm)
      this.placeLimb(`sock${i}`, cuff, ank, 0.056)
      const l = this.legs[i]
      const y = Math.max(0, ank.y - 0.1) // 발을 들면 신발도 같이
      l.shoe.position.set(ank.x, 0.07 + y, ank.z - 0.035)
      l.sole.position.set(ank.x, 0.026 + y, ank.z - 0.035)
      l.toe.position.set(ank.x, 0.05 + y, ank.z - 0.13)
    })
  }

  private make(look: PlayerLook) {
    const e = look.equip
    const uni = uniformTeam(e)
    const cap = teamOf(e.cap)
    const k = this.build
    const M = this.mirror
    const kind = this.kind
    const seed = hashOf(look.name)
    const hair = HAIRS[seed % HAIRS.length]
    const skinM = this.vinyl(SKIN, { roughness: 0.5, clearcoat: 0.3, emissive: '#FFB48A', emissiveIntensity: 0.12 }) // 살짝 따뜻하게(회색빛 방지)
    const ump = this.role === 'umpire'
    const pantsM = this.vinyl(ump ? '#6B7480' : uni?.jersey ?? PLAIN_PANTS)
    const sockM = this.vinyl(uni ? inkOf(uni) : '#6B7480')
    const shoeM = this.vinyl(uni ? underOf(uni) : '#2E3440', { roughness: 0.3, clearcoat: 0.8 })
    const soleM = this.vinyl('#FFFFFF')
    const sleeveM = this.vinyl(ump ? '#1E2A44' : uni?.jersey ?? PLAIN_SHIRT)
    const trimM = this.vinyl(uni ? inkOf(uni) : '#B8C0C9')
    const underM = this.vinyl(ump ? '#1E2A44' : underOf(uni))
    const beltM = this.vinyl(uni?.secondary ?? '#3F4854')
    const jerseyM = ump ? this.vinyl('#1E2A44') : this.vinyl('#FFFFFF', { map: this.m(jerseyTexture(uni, look.name, look.number)) })

    // ── 다리: 짧고 동그랗게 + 통통한 운동화 ──
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * M, y, z)
    const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      [V(-0.09 * k, 0.44, 0.02), V(-0.15 * k, 0.26, -0.05), V(-0.18 * k, 0.1, -0.01)],
      [V(0.09 * k, 0.44, 0.02), V(0.15 * k, 0.26, -0.03), V(0.18 * k, 0.1, 0.01)],
    ]
    legs.forEach((_, i) => {
      this.limb(pantsM, `thigh${i}`)
      this.limb(pantsM, `shin${i}`)
      this.limb(sockM, `sock${i}`)
      // 운동화: 동글한 갑피 + 두꺼운 흰 밑창 + 앞코
      this.legs.push({ name: String(i), shoe: this.sphere([0.078, 0.06, 0.115], shoeM, this.body), sole: this.sphere([0.082, 0.028, 0.122], soleM, this.body), toe: this.sphere([0.05, 0.035, 0.04], soleM, this.body) })
    })
    this.placeLegs(legs)
    this.pelvis = this.sphere([0.16 * k * (this.role === 'pitcher' ? 0.86 : 1), 0.11, 0.13 * (this.role === 'pitcher' ? 0.88 : 1)], pantsM, this.body)
    this.pelvis.position.set(0, 0.48, 0.02)

    // ── 상체: 달걀형 몸통(상자처럼 잘려 보이지 않게) ──
    this.upper.position.set(0, 0.5, 0.02)
    this.upper.rotation.order = 'YXZ'
    this.upper.rotation.x = 0.06
    this.body.add(this.upper)
    // 투수는 몸통을 날씬하게(통통한 달걀형은 타자 캐릭터만)
    const slim = this.role === 'pitcher' ? 0.84 : 1
    const torso = this.sphere([0.165 * k * slim, 0.2 * (this.role === 'pitcher' ? 1.06 : 1), 0.14 * Math.sqrt(k) * slim], jerseyM, this.upper)
    torso.position.y = 0.15
    const belt = new THREE.Mesh(this.m(new THREE.TorusGeometry(1, 0.11, 10, 36)), beltM)
    belt.rotation.x = Math.PI / 2
    belt.scale.set(0.158 * k * slim, 0.13 * Math.sqrt(k) * slim, 0.2)
    belt.position.set(0, 0.0, 0)
    this.upper.add(belt)
    for (const side of [-1, 1]) this.sphere(0.07 * this.arm, sleeveM, this.upper).position.set(side * 0.16 * k, 0.26, 0)
    for (const side of ['L', 'R']) {
      this.limb(sleeveM, `sleeve${side}`)
      const trim = new THREE.Mesh(this.cyl, trimM)
      this.body.add(trim)
      this.parts[`trim${side}`] = trim
      this.limb(underM, `fore${side}`)
      if (uni) {
        const patch = new THREE.Mesh(this.m(new THREE.CircleGeometry(0.038, 28)), this.m(new THREE.MeshBasicMaterial({ map: logoTexture(uni.key, () => this.onTextureLoad()), transparent: true })))
        this.body.add(patch)
        this.parts[`patch${side}`] = patch
      }
    }
    // 손(동그란 벙어리장갑) + 손목밴드(1번 파랑 · 3번 빨강)
    const acc = e.slots.acc
    const glovesTeam = teamOf(acc?.team)
    const gold = acc?.part === 'goldglove'
    const gloveM = gold ? this.vinyl('#F2BE2E', { metalness: 0.5, roughness: 0.25, clearcoat: 1 }) : this.vinyl(glovesTeam ? inkOf(glovesTeam) : SKIN)
    this.parts.handA = this.sphere(0.062, gloveM, this.body)
    this.parts.handB = this.sphere(0.062, gloveM, this.body)
    const wrist = WRIST[kind]
    if (wrist) {
      const band = new THREE.Mesh(this.m(new THREE.TorusGeometry(0.05, 0.02, 10, 22)), this.vinyl(wrist))
      this.body.add(band)
      this.parts.band = band
    }

    // ── 방망이 / 응원봉(손잡이 끝이 원점, +y) ──
    const hand = e.slots.hand
    const cheer = hand?.part === 'cheer' ? teamOf(hand.team) : null
    const batTeam = teamOf(e.bat)
    const batG = new THREE.Group()
    this.body.add(batG)
    // 2D 길이 배율(0.78~1.35)을 그대로 쓰면 컨택형 방망이가 장난감처럼 짧다 — 차이를 줄여 0.91~1.14배
    const L = 0.74 * 1.1 * (0.6 + 0.4 * this.batLen)
    const W = 1.35 * this.batW
    if (this.role === 'catcher') {
      // 포수: 왼손에 크고 둥근 미트
      this.body.remove(this.parts.handB)
      const mitt = new THREE.Group()
      this.sphere([0.11, 0.11, 0.07], this.vinyl('#7A4A22', { roughness: 0.5 }), mitt)
      this.sphere([0.06, 0.06, 0.02], this.vinyl('#5A3416'), mitt).position.set(0, 0, -0.06)
      this.body.add(mitt)
      this.parts.handB = mitt
      if (this.parts.band) this.parts.band.visible = false
    } else if (this.role === 'umpire') {
      if (this.parts.band) this.parts.band.visible = false
    } else if (this.role === 'pitcher') {
      // 투수: 왼손(handB)에 큰 가죽 글러브(구단 색 끈), 오른손(handA)에 공
      this.body.remove(this.parts.handB)
      const mitt = new THREE.Group()
      this.sphere([0.085, 0.1, 0.055], this.vinyl('#A8662E', { roughness: 0.55 }), mitt)
      this.sphere([0.03, 0.06, 0.03], this.vinyl(uni ? inkOf(uni) : '#5C3A1E'), mitt).position.set(0.06, 0.03, 0)
      this.body.add(mitt)
      this.parts.handB = mitt
      this.ballInHand = this.sphere(0.038, this.vinyl('#FFFFFF', { roughness: 0.6 }), this.body)
      if (this.parts.band) this.parts.band.visible = false
    } else if (cheer) {
      const glow = inkOf(cheer)
      const grip = new THREE.Mesh(this.cyl, this.vinyl('#2E3440')); grip.scale.set(0.024 * W, 0.18, 0.024 * W); grip.position.y = 0.09; batG.add(grip)
      const tube = new THREE.Mesh(this.cyl, this.flat(glow)); tube.scale.set(0.036 * W, 0.46, 0.036 * W); tube.position.y = 0.41; batG.add(tube)
      this.sphere(0.036 * W, this.flat(glow), batG).position.y = 0.64
      const halo = new THREE.Mesh(this.cyl, this.m(new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.25, depthWrite: false })))
      halo.scale.set(0.075 * W, 0.52, 0.075 * W); halo.position.y = 0.42; batG.add(halo)
    } else {
      const prof = [[0.0, -0.02], [0.028, -0.02], [0.019, 0.0], [0.017, 0.3], [0.026, 0.5], [0.04, 0.8], [0.04, 0.96], [0.0, 1.0]].map(([r, y]) => new THREE.Vector2(r * W, y * L))
      batG.add(new THREE.Mesh(this.m(new THREE.LatheGeometry(prof, 28)), this.vinyl(batTeam?.bat ?? WOOD, { roughness: 0.3, clearcoat: 0.9 })))
      if (batTeam) {
        const band = (r: number, y: number, h: number, c: string) => { const b2 = new THREE.Mesh(this.cyl, this.vinyl(c)); b2.scale.set(r * W, h * L, r * W); b2.position.y = y * L; batG.add(b2) }
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

    // ── 머리(크게) — 귀·뒷머리 덩어리 없이(곰돌이처럼 보이지 않게) 헬멧 밑 앞머리만 ──
    this.headG.position.set(0, 0.52, -0.01)
    this.headG.scale.setScalar((look.head ?? 1) * (kind === 'power' ? 1.05 : 1))
    this.upper.add(this.headG)
    const H = 0.205
    // 얼굴형: 1번 갸름(세로로 길게) · 2번 동글 볼살 · 3번 각진 턱
    const headShape: Record<Kind, [number, number, number]> = { contact: [0.95, 1.0, 0.95], balance: [1.04, 0.93, 0.97], power: [1.03, 0.95, 0.98] }
    this.sphere(headShape[kind].map(v => v * H) as [number, number, number], skinM, this.headG)
    if (kind === 'power') this.sphere([H * 0.8, H * 0.5, H * 0.74], skinM, this.headG).position.set(0, -H * 0.42, -H * 0.08)
    if (kind === 'balance') for (const sx of [-1, 1]) this.sphere(H * 0.36, skinM, this.headG).position.set(sx * H * 0.44, -H * 0.36, -H * 0.36) // 볼살(살짝만 도톰하게)
    const hairM = this.vinyl(hair, { roughness: 0.35, clearcoat: 0.6 })
    const onHead = (x: number, y: number, k2 = 0.85) => new THREE.Vector3(x, y, -Math.sqrt(Math.max(0, H * H * k2 - x * x - y * y)))
    if (kind === 'contact') {
      // 1번: 삐죽삐죽 앞머리(아래로 향한 뿔 다섯 개)
      for (const x of [-0.1, -0.05, 0, 0.05, 0.1]) {
        const spike = new THREE.Mesh(this.m(new THREE.ConeGeometry(0.028, 0.07, 10)), hairM)
        spike.position.copy(onHead(x, 0.1))
        spike.rotation.set(Math.PI * 0.85, 0, x * 2.2)
        this.headG.add(spike)
      }
    } else if (kind === 'balance') {
      // 2번: 동글동글 바가지 앞머리
      for (const [x, y, rr] of [[-0.085, 0.1, 0.05], [-0.03, 0.115, 0.055], [0.03, 0.115, 0.055], [0.085, 0.1, 0.05]] as const) {
        const f = this.sphere([rr, rr * 0.72, rr * 0.6], hairM, this.headG)
        f.position.copy(onHead(x, y))
        faceOut(f)
      }
    } else {
      // 3번: 짧게 민 머리 — 앞머리 없이 구레나룻만 진하게
      for (const sx of [-1, 1]) this.sphere([0.018, 0.05, 0.03], hairM, this.headG).position.set(sx * H * 0.98, -0.01, -0.03)
    }
    const onFace = (x: number, y: number, lift = 0) => new THREE.Vector3(x, y, -Math.sqrt(Math.max(0, H * H * 0.9 - x * x - y * y)) - 0.003 - Math.abs(lift))
    const put = (obj: THREE.Object3D, x: number, y: number, lift: number, parent: THREE.Object3D) => { obj.position.copy(onFace(x, y, lift)); faceOut(obj); parent.add(obj); return obj }
    const face = e.slots.face
    const faceTeam = teamOf(face?.team)
    const eyeM = this.flat(EYE)
    const whiteM = this.flat('#FFFFFF')
    const EX = 0.072 // 눈 간격
    // 코: 1번 작게 · 2번 동그란 단추코 · 3번 크게
    const noseR: Record<Kind, number> = { contact: 0.013, balance: 0.019, power: 0.026 }
    put(this.sphere([noseR[kind], noseR[kind] * 0.85, noseR[kind] * 0.9], this.vinyl('#FFC7A4', { emissive: '#FFB48A', emissiveIntensity: 0.1 }), this.headG), 0, -0.035, 0.004, this.headG)
    // 3번: 턱수염 자국(작은 점)
    if (kind === 'power') for (const [x, y] of [[-0.03, -0.11], [0, -0.118], [0.03, -0.11], [-0.015, -0.125], [0.015, -0.125]] as const) put(this.sphere(0.004, this.m(new THREE.MeshBasicMaterial({ color: hair, transparent: true, opacity: 0.55 })), this.headG), x, y, 0.004, this.headG)
    // 볼터치(+ 1번은 볼 반창고)
    for (const s of [-1, 1]) put(this.sphere([0.04, 0.024, 0.008], this.m(new THREE.MeshBasicMaterial({ color: BLUSH, transparent: true, opacity: 0.75 })), this.headG), s * 0.112, -0.055, 0.002, this.headG)
    if (kind === 'contact') {
      const plaster = put(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.06, 0.022, 0.006)), this.flat('#F6D7A7')), 0.115 * M, -0.03, 0.006, this.headG)
      plaster.rotateZ(0.5)
      for (const d of [-1, 1]) put(this.sphere(0.0035, this.flat('#D6A86A'), this.headG), 0.115 * M + d * 0.008, -0.03 + d * 0.004, 0.01, this.headG)
    }
    // 눈썹: 3번은 짙고 각지게, 나머지는 가늘게
    for (const s of [-1, 1]) {
      const brow = put(new THREE.Mesh(this.m(new THREE.BoxGeometry(kind === 'power' ? 0.058 : 0.046, kind === 'power' ? 0.017 : 0.01, 0.008)), this.flat(hair)), s * EX, 0.068, 0.003, this.headG)
      brow.rotateZ(s * (kind === 'power' ? -0.32 : ((seed >> 3) % 3 - 1) * 0.12))
    }
    // ── 표정 ──
    for (const s of [-1, 1]) {
      // 기본 눈: 크고 세로로 긴 눈 + 하이라이트 두 개(1번은 별 모양 반짝)
      if (kind === 'power') {
        // 자신만만한 반쯤 감은 눈: 위 눈꺼풀 선 + 아래 반달
        const lid = put(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.05, 0.01, 0.008)), eyeM), s * EX, 0.024, 0.004, this.faces.normal)
        lid.rotateZ(s * -0.12)
        put(this.sphere([0.022, 0.018, 0.008], eyeM, this.faces.normal), s * EX, 0.006, 0.002, this.faces.normal)
        put(this.sphere(0.006, whiteM, this.faces.normal), s * EX - 0.007, 0.012, 0.01, this.faces.normal)
      } else {
        put(this.sphere([0.026, 0.036, 0.01], eyeM, this.faces.normal), s * EX, 0.008, 0.002, this.faces.normal)
        if (kind === 'contact') {
          // 별 반짝(+ 모양 빛줄기 + 가운데 점)
          for (const r of [0, Math.PI / 2]) put(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.026, 0.0045, 0.004)), whiteM), s * EX - 0.006, 0.02, 0.012, this.faces.normal).rotateZ(r)
          put(this.sphere(0.006, whiteM, this.faces.normal), s * EX - 0.006, 0.02, 0.014, this.faces.normal)
        } else put(this.sphere(0.01, whiteM, this.faces.normal), s * EX - 0.008, 0.022, 0.012, this.faces.normal)
        put(this.sphere(0.005, whiteM, this.faces.normal), s * EX + 0.009, -0.006, 0.012, this.faces.normal)
      }
      // 웃음: ^ 눈
      put(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.024, 0.007, 8, 18, Math.PI)), eyeM), s * EX, 0.0, 0.002, this.faces.happy)
      // 아쉬움: > < 눈
      for (const d of [-1, 1]) put(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.034, 0.009, 0.006)), eyeM), s * EX, 0.008 + d * 0.009, 0.002, this.faces.oops).rotateZ(-s * d * 0.5)
    }
    const mouthM = this.flat('#7A2E3A')
    // 기본 입: 2번 ω(작은 반원 두 개) · 1번 작은 미소 · 3번 이 보이는 씩 웃음(한쪽으로)
    if (kind === 'balance') {
      for (const d of [-1, 1]) put(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.013, 0.005, 6, 14, Math.PI)), mouthM), d * 0.013, -0.075, 0.003, this.faces.normal).rotateZ(Math.PI)
    } else if (kind === 'contact') {
      put(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.02, 0.006, 6, 14, Math.PI)), mouthM), 0, -0.072, 0.003, this.faces.normal).rotateZ(Math.PI)
    } else {
      const grin = put(this.sphere([0.032, 0.014, 0.006], mouthM, this.faces.normal), 0.008 * M, -0.074, 0.002, this.faces.normal)
      grin.rotateZ(0.12 * M)
      put(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.04, 0.008, 0.004)), whiteM), 0.008 * M, -0.07, 0.008, this.faces.normal).rotateZ(0.12 * M)
    }
    // 웃음 입(D) + 혀, 반짝이 두 개
    put(this.sphere([0.034, 0.024, 0.006], mouthM, this.faces.happy), 0, -0.075, 0.002, this.faces.happy)
    put(this.sphere([0.016, 0.01, 0.004], this.flat('#FF7A8A'), this.faces.happy), 0, -0.086, 0.008, this.faces.happy)
    for (const [x, y, sz] of [[0.2, 0.16, 0.05], [-0.22, 0.08, 0.035]] as const) {
      const sp = new THREE.Group()
      for (const r of [0, Math.PI / 2]) { const b2 = new THREE.Mesh(this.m(new THREE.BoxGeometry(sz, sz * 0.22, 0.004)), this.flat('#FFD43B')); b2.rotation.z = r; sp.add(b2) }
      sp.position.set(x, y, -0.16)
      this.faces.happy.add(sp)
    }
    // 아쉬움 입(물결) + 땀방울
    for (let i = 0; i < 3; i++) put(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.009, 0.0045, 6, 12, Math.PI)), mouthM), -0.018 + i * 0.018, -0.078, 0.003, this.faces.oops).rotateZ(i % 2 ? Math.PI : 0)
    const drop = this.sphere([0.022, 0.032, 0.018], this.m(new THREE.MeshPhysicalMaterial({ color: '#8FD3FF', roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.9 })), this.faces.oops)
    drop.position.set(-0.19 * M, 0.1, -0.08)
    for (const g of Object.values(this.faces)) this.headG.add(g)
    this.setMood('normal')
    // 얼굴 아이템
    if (face?.part === 'eyeblack') {
      for (const s of [-1, 1]) put(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.05, 0.015, 0.006)), eyeM), s * EX, -0.034, 0.003, this.headG)
    }
    if (face?.part === 'shades' && faceTeam) {
      // 동그란 스포츠 선글라스 — 렌즈가 눈(기본 눈만)을 가린다
      this.faces.normal.children.forEach(c => { if (c.position.y > -0.04) c.visible = false })
      const glass = this.vinyl('#1B2230', { roughness: 0.08, clearcoat: 1, metalness: 0.3 })
      const frameM = this.vinyl(inkOf(faceTeam), { roughness: 0.25, clearcoat: 1 })
      for (const s of [-1, 1]) {
        put(this.sphere([0.046, 0.038, 0.012], glass, this.headG), s * EX, 0.012, 0.014, this.headG)
        put(this.sphere([0.012, 0.007, 0.003], whiteM, this.headG), s * EX - 0.016, 0.027, 0.026, this.headG)
        put(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.045, 0.007, 8, 26)), frameM), s * EX, 0.012, 0.02, this.headG).scale.set(1, 0.84, 1)
      }
      const bridge = put(new THREE.Mesh(this.cyl, frameM), 0, 0.02, 0.02, this.headG)
      bridge.scale.set(0.006, 0.05, 0.006)
      bridge.rotateZ(Math.PI / 2)
    }
    if (this.role === 'catcher' || this.role === 'umpire') {
      // 마스크: 얼굴 앞 검은 테 + 가로 철망 세 줄, 턱 받침
      const maskM = this.vinyl('#1B1E24', { roughness: 0.35, metalness: 0.4 })
      const ring = new THREE.Mesh(this.m(new THREE.TorusGeometry(0.15, 0.014, 8, 32)), maskM)
      ring.scale.set(1, 1.15, 1); ring.position.set(0, -0.01, -H * 0.98); this.headG.add(ring)
      for (const y of [-0.08, -0.02, 0.04]) { const bar = new THREE.Mesh(this.cyl, maskM); bar.scale.set(0.007, 0.27, 0.007); bar.rotation.z = Math.PI / 2; bar.position.set(0, y, -H * 1.02); this.headG.add(bar) }
      const vbar = new THREE.Mesh(this.cyl, maskM); vbar.scale.set(0.007, 0.3, 0.007); vbar.position.set(0, -0.01, -H * 1.03); this.headG.add(vbar)
      this.sphere([0.06, 0.035, 0.04], maskM, this.headG).position.set(0, -0.17, -H * 0.85)
      // 가슴 보호대(포수 = 팀 진한 색, 심판 = 셔츠 안이라 검정)
      // 포수는 팀 주 색(검은 공처럼 보이지 않게 납작하게 몸에 붙인다), 심판은 셔츠 안이라 안 보이게 생략
      const padM = this.vinyl(this.role === 'catcher' ? (uni ? inkOf(uni) : '#3B4656') : '#151922', { roughness: 0.45 })
      if (this.role === 'catcher') {
        const pad = this.sphere([0.13 * k, 0.16, 0.035], padM, this.upper)
        pad.position.set(0, 0.17, -0.13 * Math.sqrt(k) * 0.84)
        for (const y of [0.1, 0.2]) { const line = new THREE.Mesh(this.cyl, this.vinyl('#1B1E24')); line.scale.set(0.006, 0.2 * k, 0.006); line.rotation.z = Math.PI / 2; line.position.set(0, y, -0.13 * Math.sqrt(k) * 0.84 - 0.03); this.upper.add(line) }
      }
      if (this.role === 'catcher') {
        this.parts.guard0 = new THREE.Mesh(this.cyl, padM); this.body.add(this.parts.guard0)
        this.parts.guard1 = new THREE.Mesh(this.cyl, padM); this.body.add(this.parts.guard1)
      }
    }
    // 모자 / 헬멧 — 머리를 크게 덮는 반짝이는 헬멧(귀덮개는 투수 쪽 귀), 옆면에 큰 로고
    const isCap = this.role === 'catcher' || this.role === 'umpire' || e.slots.head?.part === 'cap'
    const shellM = ump ? this.vinyl('#15181D', { roughness: 0.6 }) : isCap ? this.vinyl(cap?.cap ?? FALLBACK_HELMET, { roughness: 0.6, clearcoat: 0.2 }) : this.vinyl(cap?.cap ?? FALLBACK_HELMET, { roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 })
    const R = H * (isCap ? 1.04 : 1.1)
    const dome = new THREE.Mesh(this.m(new THREE.SphereGeometry(R, 48, 28, 0, Math.PI * 2, 0, Math.PI * (isCap ? 0.47 : 0.53))), shellM)
    dome.position.set(0, isCap ? 0.04 : 0.025, 0.012)
    dome.rotation.x = isCap ? 0.12 : 0.24
    this.headG.add(dome)
    const brim = this.sphere(isCap ? [R * 0.84, 0.016, R * 0.78] : [R * 0.68, 0.016, R * 0.48], shellM, this.headG)
    brim.position.set(0, isCap ? 0.058 : 0.078, -R * (isCap ? 0.95 : 0.88))
    brim.rotation.x = -0.16
    if (!isCap) this.sphere([0.045, 0.085, 0.09], shellM, this.headG).position.set(-R * 0.95 * M, -0.045, 0.0)
    if (ump || this.role === 'catcher') brim.visible = false // 마스크 위로는 챙 없는 모자(뒤로 돌려 쓴 느낌)
    if (cap && !ump) {
      const logoM = this.m(new THREE.MeshBasicMaterial({ map: logoTexture(cap.key, () => this.onTextureLoad()), transparent: true }))
      const front = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.12, 0.1)), logoM)
      front.position.set(0, 0.15, -R * 0.86); front.rotation.set(-0.55, Math.PI, 0); this.headG.add(front)
      const side = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.13, 0.108)), logoM)
      side.position.set(R * 0.99 * M, 0.1, 0.01); side.rotation.set(0, (Math.PI / 2) * M, 0.25 * M); this.headG.add(side)
      const back = new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.1, 0.083)), logoM)
      back.position.set(0, 0.12, R * 0.93); back.rotation.set(-0.45, 0, 0); this.headG.add(back)
    }
    this.setPose({ hands: { x: 0.3, y: 1.5, z: 0.1 }, tip: { x: 0.1, y: 2.2, z: 0.3 }, twist: 0 })
  }

  setMood(mood: Mood) {
    for (const [k, g] of Object.entries(this.faces)) g.visible = k === mood
  }

  // 타격폼이 바뀔 때만 다리·몸통 높이를 다시 놓는다
  private applyStance(st: Stance) {
    const key = `${st.drop},${st.spread},${st.lean},${st.front}`
    if (key === this.stanceKey) return
    this.stanceKey = key
    const k = this.build
    const M = this.mirror
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * M, y, z)
    const d = st.drop
    const w = st.spread
    this.placeLegs([
      [V(-0.09 * k, 0.44 - d, 0.02), V(-0.15 * k * w, 0.26 - d * 0.55, -0.05 - d * 0.6), V(-0.18 * k * w, 0.1, -0.01 + st.front)],
      [V(0.09 * k, 0.44 - d, 0.02), V(0.15 * k * w, 0.26 - d * 0.55, -0.03 - d * 0.6), V(0.18 * k * w, 0.1, 0.01)],
    ])
    if (this.pelvis) this.pelvis.position.set(0, 0.48 - d, 0.02 + d * 0.4)
    this.upper.position.set(0, 0.5 - d, 0.02 + d * 0.4)
    this.upper.rotation.x = 0.06 + st.lean
  }

  setPose(p: PlayerPose) {
    const M = this.mirror
    if (p.stance) this.applyStance(p.stance)
    const toLocal = (v: V3) => {
      const w = new THREE.Vector3(v.x * M, v.y, v.z).applyAxisAngle(UP, -this.yaw)
      return new THREE.Vector3(w.x * POSE_K.x, w.y * POSE_K.y, w.z * POSE_K.z)
    }
    this.upper.rotation.y = p.twist * M
    this.upper.updateMatrix()
    if (p.mood) this.setMood(p.mood)
    if (p.look) {
      const d = new THREE.Vector3(p.look.x * M, 0, p.look.z).applyAxisAngle(UP, -this.yaw - this.upper.rotation.y)
      const lookYaw = Math.atan2(-d.x, -d.z)
      // 준비 땐 포수 쪽으로 얼굴 3/4, 스윙하면서 몸과 같이 돌아 팔로스루에선 스윙 방향(살짝 더)을 본다
      const f = Math.min(1, Math.max(0, p.follow ?? 0))
      this.headG.rotation.y = lookYaw * (1 - f) + 0.25 * M * f
    } else this.headG.rotation.y = 0
    this.headG.rotation.x = -(p.stance?.lean ?? 0) * 0.75
    const hands = toLocal(p.hands)
    const tip = toLocal(p.tip)
    const batDir = tip.clone().sub(hands).normalize()
    const handB = hands.clone().addScaledVector(batDir, 0.08)
    const k = this.build
    for (const [side, h] of [['L', hands], ['R', handB]] as const) {
      const sgn = side === 'L' ? -1 : 1
      const s = new THREE.Vector3(sgn * 0.16 * k * M, 0.26, 0).applyMatrix4(this.upper.matrix)
      const el = solveElbow(s, h, 0.2, 0.19, new THREE.Vector3(sgn * M * 0.6, -1, 0.5))
      const sl = s.clone().lerp(el, 0.6)
      this.placeLimb(`sleeve${side}`, s, sl, 0.064 * this.arm)
      placeSegment(this.parts[`trim${side}`], sl.clone().lerp(s, 0.15), sl, 0.068 * this.arm)
      this.placeLimb(`fore${side}`, sl, h, 0.047 * this.arm)
      const patch = this.parts[`patch${side}`]
      if (patch) {
        const mid = s.clone().lerp(sl, 0.45)
        const axis = sl.clone().sub(s).normalize()
        const out = mid.clone().sub(new THREE.Vector3(0, mid.y, 0.02))
        out.sub(axis.clone().multiplyScalar(out.dot(axis))).normalize()
        patch.position.copy(mid).addScaledVector(out, 0.067 * this.arm)
        patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      }
    }
    this.parts.handA.position.copy(hands)
    this.parts.handB.position.copy(handB)
    if (this.parts.band) {
      this.parts.band.position.copy(hands).addScaledVector(batDir, -0.06)
      this.parts.band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), batDir)
    }
    this.parts.bat.position.copy(hands).addScaledVector(batDir, -0.06)
    this.parts.bat.quaternion.setFromUnitVectors(UP, batDir)
  }

  setPitchPose(p: PitchPose) {
    const M = this.mirror
    const toLocal = (v: V3) => {
      const w = new THREE.Vector3(v.x * M, v.y, v.z).applyAxisAngle(UP, -this.yaw)
      return new THREE.Vector3(w.x * PITCH_K.x, w.y * PITCH_K.y, w.z * PITCH_K.z)
    }
    if (p.mood) this.setMood(p.mood)
    // 엉덩이 높이를 따라 몸통·골반이 오르내린다(기본 엉덩이 0.95m → 로컬 0.48)
    const hip = toLocal(p.hip)
    const dy = hip.y - 0.95 * PITCH_K.y
    this.upper.position.set(hip.x, 0.5 + dy, 0.02 + hip.z)
    this.upper.rotation.y = p.twist * M
    this.upper.updateMatrix()
    if (this.pelvis) this.pelvis.position.set(hip.x, 0.48 + dy, 0.02 + hip.z)
    const k = this.build
    // 다리: 화면 오른쪽(+x) 발 = 오른손 투수의 왼발(내딛는 발) — toLocal이 좌우를 몸 기준으로 바꿔 준다
    const leg = (side: number, knee: V3, foot: V3): [THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
      const kn = toLocal(knee)
      const ft = toLocal(foot)
      return [new THREE.Vector3(hip.x + side * 0.09 * k, 0.44 + dy, hip.z + 0.02), new THREE.Vector3(kn.x, Math.max(0.12, kn.y * 0.55 / 0.52), kn.z), new THREE.Vector3(ft.x, Math.max(0.1, ft.y * 0.55 / 0.52 + 0.1), ft.z)]
    }
    this.placeLegs([leg(M, p.kneeR, p.footR), leg(-M, p.kneeL, p.footL)].map(l => l) as [THREE.Vector3, THREE.Vector3, THREE.Vector3][])
    const hand = toLocal(p.hand)
    const glove = toLocal(p.glove)
    for (const [side, h] of [['R', hand], ['L', glove]] as const) {
      const sgn = side === 'L' ? -1 : 1
      const s = new THREE.Vector3(sgn * 0.16 * k, 0.26, 0).applyMatrix4(this.upper.matrix)
      const el = solveElbow(s, h, 0.2, 0.19, new THREE.Vector3(sgn * 0.8, -1, 0.3))
      const sl = s.clone().lerp(el, 0.6)
      this.placeLimb(`sleeve${side}`, s, sl, 0.064 * this.arm)
      placeSegment(this.parts[`trim${side}`], sl.clone().lerp(s, 0.15), sl, 0.068 * this.arm)
      this.placeLimb(`fore${side}`, sl, h, 0.047 * this.arm)
      const patch = this.parts[`patch${side}`]
      if (patch) {
        const mid = s.clone().lerp(sl, 0.45)
        const out = mid.clone().sub(new THREE.Vector3(0, mid.y, 0.02)).normalize()
        patch.position.copy(mid).addScaledVector(out, 0.067 * this.arm)
        patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      }
    }
    this.parts.handA.position.copy(hand)
    this.parts.handB.position.copy(glove)
    this.parts.handB.lookAt(this.parts.handB.position.clone().add(new THREE.Vector3(0, 0, -1)).applyMatrix4(this.body.matrixWorld))
    if (this.ballInHand) {
      this.ballInHand.visible = p.holding
      this.ballInHand.position.copy(hand).add(new THREE.Vector3(0, 0.02, -0.04))
    }
    this.headG.rotation.y = 0
  }

  // 쪼그려 앉기(포수·심판): mitt = 미트(포수 왼손) 자리(어른 비율 화면 좌표, 몸 기준), 심판은 두 손을 무릎에
  setCrouchPose(mitt: V3 | null, lean = 0.3) {
    const M = this.mirror
    const k = this.build
    const toLocal = (v: V3) => {
      const w = new THREE.Vector3(v.x * M, v.y, v.z).applyAxisAngle(UP, -this.yaw)
      return new THREE.Vector3(w.x * PITCH_K.x, w.y * PITCH_K.y, w.z * PITCH_K.z)
    }
    const hipY = 0.27
    const dy = hipY - 0.48
    this.upper.position.set(0, 0.5 + dy, 0.06)
    this.upper.rotation.x = lean
    this.upper.rotation.y = 0
    this.upper.updateMatrix()
    if (this.pelvis) this.pelvis.position.set(0, 0.48 + dy, 0.08)
    // 무릎을 앞·옆으로 벌리고, 발은 어깨보다 넓게
    const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [-1, 1].map(sx => [
      new THREE.Vector3(sx * 0.09 * k, 0.24, 0.08), new THREE.Vector3(sx * 0.21 * k, 0.27, -0.12), new THREE.Vector3(sx * 0.23 * k, 0.1, 0.02),
    ] as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
    this.placeLegs(legs)
    // 정강이 보호대(포수): 무릎 → 발목
    legs.forEach(([, kn, an], i) => { const g = this.parts[`guard${i}`]; if (g) placeSegment(g, kn.clone().add(new THREE.Vector3(0, 0.01, -0.04)), an.clone().add(new THREE.Vector3(0, 0.04, -0.05)), 0.07) })
    const knee = (sx: number) => new THREE.Vector3(sx * 0.21 * k, 0.33, -0.16)
    const handR = mitt === null ? knee(1) : knee(1).add(new THREE.Vector3(0.02, 0.02, 0.05)) // 던지는 손은 오른 무릎 뒤
    const handL = mitt === null ? knee(-1) : toLocal(mitt)
    for (const [side, h] of [['R', handR], ['L', handL]] as const) {
      const sgn = side === 'L' ? -1 : 1
      const s = new THREE.Vector3(sgn * 0.16 * k, 0.26, 0).applyMatrix4(this.upper.matrix)
      const el = solveElbow(s, h, 0.2, 0.19, new THREE.Vector3(sgn * 0.8, -1, 0.3))
      const sl = s.clone().lerp(el, 0.6)
      this.placeLimb(`sleeve${side}`, s, sl, 0.064 * this.arm)
      placeSegment(this.parts[`trim${side}`], sl.clone().lerp(s, 0.15), sl, 0.068 * this.arm)
      this.placeLimb(`fore${side}`, sl, h, 0.047 * this.arm)
      const patch = this.parts[`patch${side}`]
      if (patch) patch.visible = false
    }
    this.parts.handA.position.copy(handR)
    this.parts.handB.position.copy(handL)
    this.headG.rotation.set(-lean * 0.8, 0, 0) // 숙여도 얼굴은 앞(투수)을 본다
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }
}

// 장면 공통 조명: 위 왼쪽 앞에서 해 + 하늘빛 + 뒤쪽 테두리 빛(외곽선 대신 윤곽이 살게)
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#C7D2BE', 1.5))
  const sun = new THREE.DirectionalLight('#FFF6EC', 2.3)
  sun.position.set(-2, 4, 3.5)
  scene.add(sun)
  const rim = new THREE.DirectionalLight('#FFFFFF', 1.6)
  rim.position.set(2.5, 2.5, -3)
  scene.add(rim)
}
