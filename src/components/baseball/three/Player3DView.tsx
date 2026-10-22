'use client'

// 3D 선수(player3d.ts)를 화면에 붙이는 React 조각.
// - Batter3D: 경기 화면(SVG) 안 <foreignObject>에 넣는 타자. 직교 카메라라 1m가 SVG의 같은 길이로 맞는다 → 2D 공·자막과 자리가 맞는다.
// - Player3DCard: 장비함 캐릭터 카드. 천천히 돌고, 끌면 돌려볼 수 있다.
// 캔버스는 마운트마다 새로 만들어 붙인다 — 정리할 때 WebGL 연결을 끊으므로(forceContextLoss) 같은 캔버스를 다시 쓰면 실패한다
// (개발 모드 StrictMode는 effect를 두 번 돌린다). WebGL을 못 쓰거나 만들다 실패하면 useWebGL()이 false가 돼 2D 그림으로 돌아간다.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Player3D, addLights, type PitchPose, type PlayerLook, type PlayerPose, type V3 } from '@/components/baseball/three/player3d'
import { markWebGLFailed } from '@/components/baseball/three/webgl'

// 장비·이름 등 모양을 바꾸는 값이 같으면 인형을 다시 만들지 않는다
const lookKey = (l: PlayerLook) => JSON.stringify([l.equip.slots, l.name, l.number, l.build, l.head, l.batLen, l.batW, l.mirror, l.yaw])

// 새 캔버스 + 렌더러. 실패하면 null(2D로 전환)
function mount(host: HTMLElement, style: Partial<CSSStyleDeclaration>) {
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', ...style })
  host.appendChild(canvas)
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.setClearColor(0x000000, 0)
    return { canvas, r }
  } catch {
    canvas.remove()
    markWebGLFailed()
    return null
  }
}
function unmount(m: { canvas: HTMLCanvasElement; r: THREE.WebGLRenderer }) {
  m.r.dispose()
  m.r.forceContextLoss()
  m.canvas.remove()
}

// 캔버스 실제 픽셀 크기에 맞춘다(위젯 배율·화면 배율 반영, 과하면 2배까지만)
function fitRenderer(r: THREE.WebGLRenderer, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (r.domElement.width !== w || r.domElement.height !== h) r.setSize(w, h, false)
}

type BatterState = { canvas: HTMLCanvasElement; r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.OrthographicCamera; player: Player3D | null; key: string }

// 타자(pose) · 투수(pitch) · 쪼그려 앉은 포수·심판(crouch) 중 하나를 준다. scale: 원근(투수가 내딛으며 커지는 배율)
export function Batter3D(props: {
  look: PlayerLook
  pose?: PlayerPose
  pitch?: PitchPose
  crouch?: { mitt: V3 | null; lean?: number }
  scale?: number
  // 화면에 보이는 범위(미터): 가로 -halfW ~ +halfW, 세로 bottom ~ top
  halfW: number
  bottom: number
  top: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const st = useRef<BatterState | null>(null)
  const { look, pose, pitch, crouch, halfW, bottom, top } = props
  const scale = props.scale ?? 1
  const key = lookKey(look)
  const latest = useRef({ look, pose, pitch, crouch, scale })
  useEffect(() => { latest.current = { look, pose, pitch, crouch, scale } })

  const draw = () => {
    const s = st.current
    if (!s) return
    if (s.key !== lookKey(latest.current.look)) {
      if (s.player) { s.scene.remove(s.player.group); s.player.dispose() }
      s.player = new Player3D(latest.current.look)
      s.player.onTextureLoad = draw
      s.scene.add(s.player.group)
      s.key = lookKey(latest.current.look)
    }
    const cur = latest.current
    if (s.player) {
      s.player.group.scale.setScalar(cur.scale)
      if (cur.crouch) s.player.setCrouchPose(cur.crouch.mitt, cur.crouch.lean)
      else if (cur.pitch) s.player.setPitchPose(cur.pitch)
      else if (cur.pose) s.player.setPose(cur.pose)
    }
    fitRenderer(s.r, s.canvas)
    s.r.render(s.scene, s.cam)
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const m = mount(host, {})
    if (!m) return
    const scene = new THREE.Scene()
    addLights(scene)
    const cam = new THREE.OrthographicCamera(-halfW, halfW, top, bottom, 0.1, 30)
    cam.position.set(0, 0, 10) // 포수 쪽(+z)에서 똑바로 — 등이 보인다
    cam.lookAt(0, 0, 0)
    st.current = { ...m, scene, cam, player: null, key: '' }
    draw()
    const ro = new ResizeObserver(() => draw())
    ro.observe(m.canvas)
    return () => {
      ro.disconnect()
      st.current?.player?.dispose()
      unmount(m)
      st.current = null
    }
    // 카메라 범위는 타석마다 같다 — 처음 한 번만 만든다. 자세·장비는 아래 effect가 매 렌더 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 매 렌더(애니메이션 프레임마다 부모가 다시 그림) 자세 반영, 장비가 바뀌면 인형 다시 만들기
  const sig = pose ? [pose.hands.x, pose.hands.y, pose.hands.z, pose.tip.x, pose.tip.y, pose.tip.z, pose.twist, pose.mood, pose.follow, pose.stance?.drop, pose.stance?.lean, pose.stance?.front].join(',')
    : pitch ? [pitch.hand.x, pitch.hand.y, pitch.hand.z, pitch.glove.x, pitch.glove.y, pitch.footR.x, pitch.footR.y, pitch.footL.y, pitch.hip.y, pitch.twist, pitch.holding].join(',')
    : crouch ? [crouch.mitt?.x, crouch.mitt?.y, crouch.mitt?.z, crouch.lean].join(',') : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { draw() }, [key, sig, scale])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} data-batter-3d />
}

// 장비함 카드: 정면 3/4에서 천천히 돈다. 끌면 직접 돌린다.
const CARD_POSE: PlayerPose = { hands: { x: 0.3, y: 1.5, z: 0.05 }, tip: { x: 0.1, y: 2.25, z: 0.25 }, twist: 0.15 }

export function Player3DCard({ look, width, height }: { look: PlayerLook; width: number; height: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const key = lookKey(look)
  const lookRef = useRef(look)
  // 인형은 key(모양)가 바뀔 때만 다시 만든다 — 그때 쓸 최신 look을 아래 effect보다 먼저 담아 둔다
  useEffect(() => { lookRef.current = look })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const m = mount(host, { cursor: 'grab', touchAction: 'none' })
    if (!m) return
    const { canvas, r } = m
    const scene = new THREE.Scene()
    addLights(scene)
    const cam = new THREE.PerspectiveCamera(26, width / height, 0.1, 30)
    const player = new Player3D(lookRef.current)
    player.setPose(CARD_POSE)
    const turn = new THREE.Group()
    turn.add(player.group)
    scene.add(turn)
    // 바닥 그림자(동그란 반투명 판)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: '#1F2933', transparent: true, opacity: 0.16, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.002
    scene.add(shadow)
    // 정면(-z)에서 살짝 오른쪽 위 — 얼굴 아이템이 보이게
    cam.position.set(1.7, 1.75, -4.4)
    cam.lookAt(0, 1.08, 0)
    let angle = -0.35
    let drag: { x: number; a: number } | null = null
    let idleSince = performance.now()
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(64, t - last)
      last = t
      if (!drag && t - idleSince > 1200) angle += dt * 0.0005
      turn.rotation.y = angle
      fitRenderer(r, canvas)
      r.render(scene, cam)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const down = (e: PointerEvent) => { drag = { x: e.clientX, a: angle }; canvas.setPointerCapture(e.pointerId); e.stopPropagation() }
    const move = (e: PointerEvent) => { if (drag) angle = drag.a + (e.clientX - drag.x) * 0.012 }
    const up = () => { drag = null; idleSince = performance.now() }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      cancelAnimationFrame(raf)
      player.dispose()
      shadow.geometry.dispose()
      ;(shadow.material as THREE.Material).dispose()
      unmount(m)
    }
  }, [key, width, height])

  return <div ref={hostRef} title="끌어서 돌려보기" style={{ width, height }} />
}

// 세리머니 컷인(홈런·장타): 타자(정면) + 홈런이면 옆에 무릎 짚은 투수. k = 컷인 진행(0→1)로 한 프레임씩 그린다
export type CeremonyKind = 'homer' | 'extra'
export function Ceremony3D({ batter, pitcher, kind, k, width, height }: { batter: PlayerLook; pitcher?: PlayerLook | null; kind: CeremonyKind; k: number; width: number; height: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const st = useRef<{ r: THREE.WebGLRenderer; canvas: HTMLCanvasElement; scene: THREE.Scene; cam: THREE.PerspectiveCamera; b: Player3D; p: Player3D | null } | null>(null)
  const bKey = lookKey(batter)
  const pKey = pitcher ? lookKey(pitcher) : ''
  const looks = useRef({ batter, pitcher })
  const kRef = useRef(k)
  useEffect(() => { looks.current = { batter, pitcher } })

  const draw = (kk: number) => {
    const s0 = st.current
    if (!s0) return
    poseCeremony(s0.b, s0.p, kind, kk)
    fitRenderer(s0.r, s0.canvas)
    s0.r.render(s0.scene, s0.cam)
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const m = mount(host, {})
    if (!m) return
    const scene = new THREE.Scene()
    addLights(scene)
    const cam = new THREE.PerspectiveCamera(28, width / height, 0.1, 30)
    cam.position.set(0.5, 1.3, 4.6) // 정면(+z)에서 — 타자는 카메라를 본다
    cam.lookAt(0.25, 0.95, 0)
    const b = new Player3D({ ...looks.current.batter, yaw: Math.PI, role: 'batter' })
    b.group.position.set(-0.1, 0, 0)
    scene.add(b.group)
    let pl: Player3D | null = null
    if (looks.current.pitcher) {
      pl = new Player3D({ ...looks.current.pitcher, yaw: Math.PI + 0.5, role: 'pitcher' })
      pl.group.position.set(1.05, 0, -0.8)
      pl.group.scale.setScalar(0.85)
      scene.add(pl.group)
    }
    st.current = { r: m.r, canvas: m.canvas, scene, cam, b, p: pl }
    b.onTextureLoad = () => draw(kRef.current)
    if (pl) pl.onTextureLoad = () => draw(kRef.current)
    draw(kRef.current)
    return () => { b.dispose(); pl?.dispose(); unmount(m); st.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bKey, pKey, kind, width, height])

  useEffect(() => { kRef.current = k; draw(k) })

  return <div ref={hostRef} style={{ width, height }} />
}

// 세리머니 자세(몸 로컬 SD 단위). homer: 배트 플립(손에서 빙글 날아감) → 두 팔 번쩍 + 콩콩 / extra: 주먹 불끈
function poseCeremony(b: Player3D, p: Player3D | null, kind: CeremonyKind, k: number) {
  const V = (x: number, y: number, z: number) => ({ x, y, z })
  if (kind === 'homer') {
    const flip = Math.min(1, k / 0.25)
    const cheer = Math.min(1, Math.max(0, (k - 0.15) / 0.3)) // 빨리 만세까지 올리고 오래 유지
    const wave = Math.sin(k * Math.PI * 10) * 0.05
    const up = (x: number) => V(x * 1.55, 1.16 + wave * Math.sign(x), 0.02) // 머리 양옆 위로 번쩍(V자) — SD라 팔이 짧아 이 높이가 한계
    const hold = V(0.2, 0.62, -0.18)
    const lerp3 = (a: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }, t: number) => V(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, a.z + (c.z - a.z) * t)
    const e = cheer < 1 ? 1 - (1 - cheer) ** 3 : 1
    // 방망이: 손에서 떠나 위로 빙글 돌며 날아간다(배트 플립)
    const spin = flip * Math.PI * 3
    const bat = flip < 1 ? { pos: V(0.2 + flip * 0.55, 0.62 + Math.sin(flip * Math.PI) * 0.55, -0.18 - flip * 0.2), dir: V(Math.sin(spin), Math.cos(spin), 0.2) } : null
    b.setCelebratePose({ handL: lerp3(hold, up(-0.22), e), handR: lerp3(V(0.24, 0.6, -0.16), up(0.22), e), bat, jump: cheer > 0 ? Math.abs(Math.sin(k * Math.PI * 6)) * 0.07 : 0, twist: 0, mood: 'happy' })
    // 투수: 무릎 짚고 고개 숙임 + 땀방울
    if (p) { p.setCrouchPose(null, 0.6, 0.4); p.setMood('oops') }
  } else {
    // 주먹 불끈: 오른손이 턱 아래 → 위로 두 번, 왼손은 허리
    const pump = Math.abs(Math.sin(k * Math.PI * 3))
    b.setCelebratePose({ handL: V(-0.2, 0.42, -0.1), handR: V(0.2, 0.62 + pump * 0.32, -0.16), bat: null, jump: pump * 0.03, twist: 0.15, mood: 'happy' })
  }
}
