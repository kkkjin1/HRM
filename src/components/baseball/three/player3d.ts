// 3D 선수 인형(three.js) — 장비(구단 × 아이템)를 입힌 사람 모형. React와 무관한 순수 모듈.
// 좌표: 미터, 발 가운데가 원점, y 위, 선수는 -z(투수 쪽)를 본다. 카메라를 +z에 두면 등이 보인다(포수 시점).
// 팔은 어깨 → 손(방망이 손잡이)을 두 마디 IK로 이어서, 스윙 자세는 손·방망이 끝 위치와 상체 회전(twist)만 주면 된다.
// 그림 전용 — 판정과 무관. 2D 그림(gear.tsx)과 같은 색 규칙(uniformTeam 등)을 쓴다.

import * as THREE from 'three'
import { logoUrl, teamOf, uniformTeam, type Equip, type KboTeam, type TeamKey } from '@/lib/baseballGear'

export type V3 = { x: number; y: number; z: number }
export type PlayerPose = { hands: V3; tip: V3; twist: number }
export type PlayerLook = { equip: Equip; name: string; number: number; build?: number; head?: number; batLen?: number; mirror?: boolean }

const SKIN = '#E9C29E'
const WOOD = '#A8713B'
const PLAIN_SHIRT = '#E5E7EB'
const PLAIN_PANTS = '#D7DCE1'
const FALLBACK_HELMET = '#1F4E8C'

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...o })
const inkOf = (t: KboTeam) => (t.primary === '#FFFFFF' ? t.secondary : t.primary)

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

// 상의 텍스처: 바탕색 + 무늬(핀스트라이프·위장·눈송이) + 등 이름·번호(가운데) + 가슴 글씨(가장자리 = 앞).
// 몸통 LatheGeometry를 y축으로 180° 돌려 u 0.5가 등(+z), u 0/1이 가슴(-z)이 되게 맞춘다.
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
    g.lineWidth = 4
    for (let x = 12; x < 1024; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke() }
    g.globalAlpha = 1
  }
  if (team?.pattern === 'camo') {
    const blobs = ['#4A5530', '#8F9C66', '#3D4626']
    for (let i = 0; i < 60; i++) {
      g.fillStyle = blobs[i % 3]
      g.globalAlpha = 0.8
      g.beginPath()
      g.ellipse((i * 173) % 1024, (i * 97) % 512, 40 + (i % 5) * 9, 18 + (i % 4) * 6, (i % 7) * 0.4, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }
  if (team?.pattern === 'snow') {
    g.fillStyle = '#FFFFFF'
    for (let i = 0; i < 90; i++) { g.beginPath(); g.arc((i * 211) % 1024, (i * 131) % 512, 5, 0, Math.PI * 2); g.fill() }
  }
  const ink = team ? team.primary : '#4B5563'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const text = (s: string, x: number, y: number, size: number, italic = false) => {
    g.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`
    if (team) { g.strokeStyle = team.secondary; g.lineWidth = size * 0.08; g.strokeText(s, x, y) }
    g.fillStyle = ink
    g.fillText(s, x, y)
  }
  text(name, 512, 150, 62)
  text(String(number), 512, 300, 200)
  if (team?.wordmark) for (const x of [0, 1024]) text(team.wordmark, x, 210, 86, true)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// 두 점을 잇는 원기둥(길이 1짜리를 늘려 쓴다) + 끝 관절 구
const UP = new THREE.Vector3(0, 1, 0)
function placeSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a)
  const len = Math.max(0.0001, d.length())
  mesh.position.copy(a).addScaledVector(d, 0.5)
  mesh.scale.set(1, len, 1)
  mesh.quaternion.setFromUnitVectors(UP, d.normalize())
}

// 두 마디 IK: 어깨 s → 손 h, 팔꿈치는 pole 쪽으로 굽힌다
function solveElbow(s: THREE.Vector3, h: THREE.Vector3, lu: number, ll: number, pole: THREE.Vector3) {
  const sh = new THREE.Vector3().subVectors(h, s)
  const d = Math.min(sh.length(), (lu + ll) * 0.999)
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
  private parts: Record<string, THREE.Mesh> = {}
  private upper = new THREE.Group() // 상체(허리 위) — twist로 돈다
  private headG = new THREE.Group()
  private build: number
  private mirror: number
  private batLen: number
  onTextureLoad: () => void = () => {}

  constructor(look: PlayerLook) {
    this.build = look.build ?? 1
    this.mirror = look.mirror ? -1 : 1
    this.batLen = look.batLen ?? 1
    this.make(look)
  }

  private m<T extends { dispose: () => void }>(x: T): T { this.disposables.push(x); return x }

  private make(look: PlayerLook) {
    const e = look.equip
    const uni = uniformTeam(e)
    const cap = teamOf(e.cap)
    const k = this.build
    const skinM = this.m(mat(SKIN, { roughness: 0.7 }))
    const pantsM = this.m(mat(uni?.jersey ?? PLAIN_PANTS, { roughness: 0.85 }))
    const stripeM = this.m(mat(uni ? uni.primary : '#9CA3AF'))
    const sockM = this.m(mat(uni ? inkOf(uni) : '#4B5563', { roughness: 0.8 }))
    const shoeM = this.m(mat('#16181C', { roughness: 0.35 }))
    const jerseyTex = this.m(jerseyTexture(uni, look.name, look.number))
    const jerseyM = this.m(mat('#FFFFFF', { map: jerseyTex, roughness: 0.75 }))
    const sleeveM = this.m(mat(uni?.jersey ?? PLAIN_SHIRT, { roughness: 0.75 }))
    const trimM = this.m(mat(uni ? inkOf(uni) : '#9CA3AF'))
    const beltM = this.m(mat(uni?.secondary ?? '#374151'))
    const darkM = this.m(mat('#0B0C0E', { roughness: 0.9 }))
    const cyl = this.m(new THREE.CylinderGeometry(1, 1, 1, 18))
    const ball = this.m(new THREE.SphereGeometry(1, 24, 16))
    const add = (mesh: THREE.Mesh, parent: THREE.Object3D = this.group) => { mesh.castShadow = true; parent.add(mesh); return mesh }
    const sphere = (r: number, mm: THREE.Material, parent?: THREE.Object3D) => { const s = add(new THREE.Mesh(ball, mm), parent); s.scale.setScalar(r); return s }

    // ── 하체(고정 타격 자세) ──
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * this.mirror, y, z)
    const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      [V(-0.11 * k, 0.94, 0), V(-0.22 * k, 0.52, -0.04), V(-0.27 * k, 0.1, 0)],
      [V(0.11 * k, 0.94, 0), V(0.22 * k, 0.52, 0.04), V(0.27 * k, 0.1, 0)],
    ]
    for (const [hip, knee, ank] of legs) {
      const thigh = add(new THREE.Mesh(cyl, pantsM)); placeSegment(thigh, hip, knee); thigh.scale.x = thigh.scale.z = 0.085 * Math.sqrt(k)
      const kneeJ = sphere(0.075, pantsM); kneeJ.position.copy(knee)
      const cuff = knee.clone().lerp(ank, 0.45)
      const shin = add(new THREE.Mesh(cyl, pantsM)); placeSegment(shin, knee, cuff); shin.scale.x = shin.scale.z = 0.07
      const sock = add(new THREE.Mesh(cyl, sockM)); placeSegment(sock, cuff, ank); sock.scale.x = sock.scale.z = 0.05
      const stripe = add(new THREE.Mesh(cyl, stripeM)); placeSegment(stripe, hip.clone().add(V(Math.sign(hip.x * this.mirror) * 0.075, 0, 0)), knee.clone().add(V(Math.sign(hip.x * this.mirror) * 0.068, 0, 0))); stripe.scale.x = stripe.scale.z = 0.012
      const shoe = sphere(1, shoeM); shoe.scale.set(0.06, 0.05, 0.13); shoe.position.set(ank.x, 0.05, ank.z - 0.04)
    }
    const pelvis = sphere(1, pantsM); pelvis.scale.set(0.19 * k, 0.13, 0.13); pelvis.position.set(0, 0.97, 0)
    const belt = add(new THREE.Mesh(cyl, beltM)); belt.scale.set(0.175 * k, 0.04, 0.12); belt.position.set(0, 1.07, 0)

    // ── 상체: 허리 기준으로 도는 그룹 ──
    this.upper.position.set(0, 1.05, 0)
    this.group.add(this.upper)
    const profile = [[0.15, 0], [0.165, 0.08], [0.185, 0.22], [0.2, 0.34], [0.19, 0.4], [0.13, 0.45], [0.06, 0.47]].map(([r, y]) => new THREE.Vector2(r, y))
    const torsoG = this.m(new THREE.LatheGeometry(profile, 40))
    const torso = add(new THREE.Mesh(torsoG, jerseyM), this.upper)
    torso.scale.set(1.35 * k, 1, 0.78)
    torso.rotation.y = Math.PI
    const collar = add(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.06, 0.012, 8, 24)), trimM), this.upper)
    collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.465, 0)
    // 어깨 관절(소매)
    const sh = (side: number) => new THREE.Vector3(side * 0.235 * k, 0.4, 0)
    for (const side of [-1, 1]) { const s = sphere(0.075, sleeveM, this.upper); s.position.copy(sh(side)); s.scale.set(0.085, 0.075, 0.075) }
    // 팔 마디(매 프레임 setPose가 자리를 잡는다): 위팔 앞쪽 절반은 소매, 나머지는 피부
    for (const side of ['L', 'R']) {
      this.parts[`sleeve${side}`] = add(new THREE.Mesh(cyl, sleeveM))
      this.parts[`sleeveTrim${side}`] = add(new THREE.Mesh(cyl, trimM))
      this.parts[`upper${side}`] = add(new THREE.Mesh(cyl, skinM))
      this.parts[`lower${side}`] = add(new THREE.Mesh(cyl, skinM))
      this.parts[`elbow${side}`] = sphere(0.045, skinM)
    }
    // 장갑(없으면 맨손)
    const acc = e.slots.acc
    const glovesTeam = teamOf(acc?.team)
    const gloveM = this.m(mat(acc?.part === 'goldglove' ? '#D4A017' : glovesTeam ? inkOf(glovesTeam) : SKIN, acc?.part === 'goldglove' ? { metalness: 0.7, roughness: 0.25 } : { roughness: 0.5 }))
    this.parts.handA = sphere(glovesTeam ? 0.058 : 0.048, gloveM)
    this.parts.handB = sphere(glovesTeam ? 0.058 : 0.048, gloveM)
    if (glovesTeam) {
      const bandM = this.m(mat(acc?.part === 'goldglove' ? inkOf(glovesTeam) : glovesTeam.secondary === inkOf(glovesTeam) ? '#FFFFFF' : glovesTeam.secondary))
      this.parts.band = add(new THREE.Mesh(this.m(new THREE.TorusGeometry(0.05, 0.016, 8, 20)), bandM))
    }

    // ── 방망이 / 응원봉 ──
    const hand = e.slots.hand
    const cheer = hand?.part === 'cheer' ? teamOf(hand.team) : null
    const batTeam = teamOf(e.bat)
    const batG = new THREE.Group()
    this.group.add(batG)
    this.parts.batAnchor = new THREE.Mesh() // 위치·방향만 쓰는 빈 노드
    batG.add(this.parts.batAnchor)
    const L = 0.86 * this.batLen
    if (cheer) {
      const glow = inkOf(cheer)
      const grip = add(new THREE.Mesh(cyl, this.m(mat('#1F2933'))), batG); grip.scale.set(0.02, 0.2, 0.02); grip.position.y = 0.1
      const tube = add(new THREE.Mesh(cyl, this.m(mat(glow, { emissive: glow, emissiveIntensity: 0.9, roughness: 0.3 }))), batG); tube.scale.set(0.03, 0.5, 0.03); tube.position.y = 0.45
      const halo = add(new THREE.Mesh(cyl, this.m(new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.18, depthWrite: false }))), batG); halo.scale.set(0.06, 0.55, 0.06); halo.position.y = 0.45
    } else {
      // 손잡이(가늘게) → 배럴(굵게): 반지름·높이 프로파일을 돌려 만든다
      const prof = [[0.0, -0.02], [0.022, -0.02], [0.016, 0.0], [0.014, 0.3], [0.022, 0.5], [0.033, 0.8], [0.033, 0.97], [0.0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y * L))
      const batM = this.m(mat(batTeam?.bat ?? WOOD, { roughness: 0.35, metalness: 0.05 }))
      add(new THREE.Mesh(this.m(new THREE.LatheGeometry(prof, 20)), batM), batG)
      if (batTeam) {
        const tape = add(new THREE.Mesh(cyl, this.m(mat(batTeam.primary))), batG); tape.scale.set(0.0175, 0.25 * L, 0.0175); tape.position.y = 0.14 * L
        const ring = add(new THREE.Mesh(cyl, this.m(mat(batTeam.secondary))), batG); ring.scale.set(0.0335, 0.05 * L, 0.0335); ring.position.y = 0.7 * L
      }
    }
    this.parts.bat = batG as unknown as THREE.Mesh

    // ── 목·머리 ──
    const neck = add(new THREE.Mesh(cyl, skinM), this.upper); neck.scale.set(0.055, 0.1, 0.055); neck.position.set(0, 0.5, 0)
    this.headG.position.set(0, 0.64, 0)
    this.headG.scale.setScalar(look.head ?? 1)
    this.upper.add(this.headG)
    const skull = sphere(1, skinM, this.headG); skull.scale.set(0.112, 0.128, 0.118)
    for (const s of [-1, 1]) { const ear = sphere(1, skinM, this.headG); ear.scale.set(0.014, 0.03, 0.022); ear.position.set(s * 0.112, -0.01, 0.005) }
    const nose = sphere(0.022, skinM, this.headG); nose.position.set(0, -0.02, -0.118)
    const face = e.slots.face
    const faceTeam = teamOf(face?.team)
    for (const s of [-1, 1]) {
      const eye = sphere(0.014, darkM, this.headG); eye.position.set(s * 0.042, 0.012, -0.108)
      if (face?.part === 'eyeblack') {
        const eb = add(new THREE.Mesh(this.m(new THREE.BoxGeometry(0.05, 0.02, 0.012)), darkM), this.headG)
        eb.position.set(s * 0.046, -0.025, -0.11); eb.rotation.y = -s * 0.38
      }
    }
    if (face?.part === 'shades' && faceTeam) {
      const glass = this.m(new THREE.MeshPhysicalMaterial({ color: '#0E1116', roughness: 0.05, metalness: 0.6, clearcoat: 1 }))
      const lens = add(new THREE.Mesh(this.m(new THREE.CylinderGeometry(0.124, 0.12, 0.06, 40, 1, true, Math.PI - 1.2, 2.4)), glass), this.headG)
      lens.position.set(0, 0.012, 0)
      const frameM = this.m(mat(inkOf(faceTeam), { roughness: 0.3, metalness: 0.2 }))
      for (const y of [0.043, -0.019]) {
        const f = add(new THREE.Mesh(this.m(new THREE.CylinderGeometry(0.126, 0.125, 0.009, 40, 1, true, Math.PI - 1.2, 2.4)), frameM), this.headG)
        f.position.set(0, y, 0)
      }
      for (const s of [-1, 1]) { const arm = add(new THREE.Mesh(cyl, frameM), this.headG); arm.scale.set(0.006, 0.12, 0.006); arm.rotation.x = Math.PI / 2; arm.position.set(s * 0.115, 0.03, 0.02) }
    }
    // 모자 / 헬멧
    const helmetTeam = cap
    const shellM = this.m(mat(helmetTeam?.cap ?? FALLBACK_HELMET, { roughness: e.slots.head?.part === 'cap' ? 0.75 : 0.2, metalness: e.slots.head?.part === 'cap' ? 0 : 0.3 }))
    const isCap = e.slots.head?.part === 'cap'
    const dome = add(new THREE.Mesh(this.m(new THREE.SphereGeometry(isCap ? 0.124 : 0.136, 40, 24, 0, Math.PI * 2, 0, Math.PI * (isCap ? 0.5 : 0.6))), shellM), this.headG)
    dome.position.set(0, isCap ? 0.03 : 0.012, 0); dome.rotation.x = isCap ? 0.12 : 0.3
    const brim = sphere(1, shellM, this.headG); brim.scale.set(isCap ? 0.1 : 0.088, 0.011, isCap ? 0.1 : 0.07); brim.position.set(0, isCap ? 0.035 : 0.05, isCap ? -0.135 : -0.12); brim.rotation.x = -0.15
    if (!isCap) {
      // 귀덮개: 플레이트 쪽 귀(오른손 타자 기준 +x, 좌타는 반대)
      const flap = sphere(1, shellM, this.headG); flap.scale.set(0.03, 0.06, 0.064); flap.position.set(0.122 * this.mirror, -0.03, -0.005)
    }
    if (helmetTeam) {
      const logoM = this.m(new THREE.MeshStandardMaterial({ map: logoTexture(helmetTeam.key, () => this.onTextureLoad()), transparent: true, roughness: 0.3 }))
      const front = add(new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.085, 0.07)), logoM), this.headG)
      front.position.set(0, 0.085, isCap ? -0.112 : -0.118); front.rotation.set(-0.45, Math.PI, 0)
      const back = add(new THREE.Mesh(this.m(new THREE.PlaneGeometry(0.075, 0.062)), logoM), this.headG)
      back.position.set(0, 0.07, isCap ? 0.118 : 0.132); back.rotation.set(-0.35, 0, 0)
    }
    this.setPose({ hands: { x: 0.42, y: 1.55, z: 0.1 }, tip: { x: 0.05, y: 2.25, z: 0.3 }, twist: 0.3 })
  }

  setPose(p: PlayerPose) {
    const M = this.mirror
    this.upper.rotation.y = p.twist * M
    this.upper.updateMatrix()
    // 상체 그룹 좌표(어깨) → 선수 그룹 좌표(팔 마디가 붙는 곳)
    const world = (v: THREE.Vector3) => v.clone().applyMatrix4(this.upper.matrix)
    const hands = new THREE.Vector3(p.hands.x * M, p.hands.y, p.hands.z)
    const tip = new THREE.Vector3(p.tip.x * M, p.tip.y, p.tip.z)
    const batDir = tip.clone().sub(hands).normalize()
    const handB = hands.clone().addScaledVector(batDir, 0.085) // 위쪽 손
    const k = this.build
    for (const [side, h] of [['L', hands], ['R', handB]] as const) {
      const sgn = side === 'L' ? -1 : 1
      const s = world(new THREE.Vector3(sgn * 0.235 * k * M, 0.4, 0))
      const pole = new THREE.Vector3(sgn * M * 0.8, -1, 0.35)
      const el = solveElbow(s, h, 0.3, 0.28, pole)
      const sl = s.clone().lerp(el, 0.5)
      placeSegment(this.parts[`sleeve${side}`], s, sl); this.parts[`sleeve${side}`].scale.x = this.parts[`sleeve${side}`].scale.z = 0.068
      const trimA = sl.clone().lerp(s, 0.12)
      placeSegment(this.parts[`sleeveTrim${side}`], trimA, sl); this.parts[`sleeveTrim${side}`].scale.x = this.parts[`sleeveTrim${side}`].scale.z = 0.07
      placeSegment(this.parts[`upper${side}`], sl, el); this.parts[`upper${side}`].scale.x = this.parts[`upper${side}`].scale.z = 0.05
      placeSegment(this.parts[`lower${side}`], el, h); this.parts[`lower${side}`].scale.x = this.parts[`lower${side}`].scale.z = 0.043
      this.parts[`elbow${side}`].position.copy(el)
    }
    this.parts.handA.position.copy(hands)
    this.parts.handB.position.copy(handB)
    if (this.parts.band) { this.parts.band.position.copy(hands).addScaledVector(batDir, -0.055); this.parts.band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), batDir) }
    const bat = this.parts.bat as unknown as THREE.Group
    bat.position.copy(hands).addScaledVector(batDir, -0.06)
    bat.quaternion.setFromUnitVectors(UP, batDir)
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }
}

// 장면 공통: 조명(하늘빛 + 해) — 그림자는 2D 땅 그림자(타원)로 대신한다
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#8A9A7A', 1.25))
  const sun = new THREE.DirectionalLight('#FFF4E0', 2.1)
  sun.position.set(-2.5, 4, 3)
  scene.add(sun)
  const rim = new THREE.DirectionalLight('#DDE8FF', 0.6)
  rim.position.set(3, 2, -3)
  scene.add(rim)
}
