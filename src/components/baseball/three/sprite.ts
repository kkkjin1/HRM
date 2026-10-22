// 3D 스프라이트 — 3D 피규어를 한 번 렌더해 PNG 그림(data URL)으로 만들어 재사용한다.
// 운동장·1:1 대결처럼 캐릭터가 여러 명 동시에 나오는 화면은 사람마다 WebGL 캔버스를 띄우면 브라우저 한도(약 16개)에 걸리므로,
// 렌더러 하나로 그림만 찍어 <img>/<image>로 쓴다. 걷기·점프·넘어짐 같은 움직임은 지금처럼 바깥(CSS·SVG transform)이 맡는다.
// 같은 모양(장비·이름·자세 종류)은 캐시. 로고 텍스처가 늦게 오면 다시 찍어 구독자에게 알린다.

import * as THREE from 'three'
import { Player3D, addLights, type PlayerLook, type PlayerPose } from '@/components/baseball/three/player3d'
import { markWebGLFailed } from '@/components/baseball/three/webgl'

export type SpriteKind = 'batter' | 'pitcher'
type Entry = { url: string | null; listeners: Set<(url: string) => void> }

const W = 160
const H = 200
const cache = new Map<string, Entry>()
let renderer: THREE.WebGLRenderer | null = null
let failed = false

// 서 있는 자세: 타자는 방망이를 어깨에 걸치고, 투수는 글러브 앞 + 공 든 손
const STAND: PlayerPose = { hands: { x: 0.3, y: 1.45, z: 0.05 }, tip: { x: 0.1, y: 2.2, z: 0.25 }, twist: 0.1 }

function getRenderer() {
  // 다른 3D 화면이 많아 브라우저가 이 렌더러의 연결을 끊었으면 새로 만든다
  if (renderer && renderer.getContext().isContextLost()) { renderer.dispose(); renderer = null }
  if (renderer || failed) return renderer
  try {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(W, H, false)
  } catch {
    failed = true
    markWebGLFailed()
  }
  return renderer
}

function shoot(look: PlayerLook, kind: SpriteKind, onTexture: () => void): string | null {
  const r = getRenderer()
  if (!r) return null
  const scene = new THREE.Scene()
  addLights(scene)
  const player = new Player3D({ ...look, role: kind === 'pitcher' ? 'pitcher' : 'batter' })
  player.onTextureLoad = onTexture
  if (kind === 'pitcher') {
    player.setPitchPose({
      hand: { x: -0.35, y: 1.55, z: -0.05 }, glove: { x: 0.25, y: 1.2, z: 0.25 }, hip: { x: 0, y: 0.95, z: 0 },
      kneeL: { x: -0.2, y: 0.48, z: 0 }, kneeR: { x: 0.2, y: 0.48, z: 0 }, footL: { x: -0.2, y: 0, z: 0 }, footR: { x: 0.2, y: 0, z: 0 },
      twist: 0, holding: true,
    })
  } else player.setPose(STAND)
  scene.add(player.group)
  // 정면에서 살짝 오른쪽 위 — 얼굴과 유니폼 글씨가 보이게(장비함 카드와 같은 각도)
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 30)
  cam.position.set(1.5, 1.7, -4.6)
  cam.lookAt(0, 1.05, 0)
  r.render(scene, cam)
  const url = r.domElement.toDataURL('image/png')
  player.dispose()
  return url
}

const keyOf = (l: PlayerLook, kind: SpriteKind) => JSON.stringify([kind, l.equip.slots, l.name, l.number, l.build, l.kind, l.height])

// 그림을 바로(캐시에 있으면) 돌려주고, 처음이면 찍어서 돌려준다. 로고가 나중에 오면 listener로 새 그림을 준다
export function spriteOf(look: PlayerLook, kind: SpriteKind, listener: (url: string) => void): string | null {
  const key = keyOf(look, kind)
  let e = cache.get(key)
  if (!e) {
    const entry: Entry = { url: null, listeners: new Set() }
    cache.set(key, entry)
    e = entry
    let pending = false
    const again = () => {
      if (pending) return
      pending = true
      // 텍스처 여러 장이 이어서 오므로 한 박자 모아서 다시 찍는다
      setTimeout(() => {
        pending = false
        const u = shoot(look, kind, again)
        if (u) { entry.url = u; entry.listeners.forEach(f => f(u)) }
      }, 60)
    }
    entry.url = shoot(look, kind, again)
  }
  e.listeners.add(listener)
  return e.url
}

export function unsubscribeSprite(look: PlayerLook, kind: SpriteKind, listener: (url: string) => void) {
  cache.get(keyOf(look, kind))?.listeners.delete(listener)
}
