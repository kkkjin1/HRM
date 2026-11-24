// 🏎 퇴근 레이싱 — 차 바로 뒤에서 따라가는 3인칭(추격 시점) 그리기. canvas 2D, 순수 함수.
// 게임 좌표(x = 앞으로 간 거리, y = 도로 가로 위치)는 그대로 두고 원근 투영만 한다.
//   깊이 dz = x - 카메라 x,  배율 = FOCAL / dz,  화면 y = 지평선 + 카메라높이 × 배율
// 도로가 휘어 보이는 건 그림 효과일 뿐(모든 물체에 똑같이 적용) — 판정은 직선 도로 그대로다.

import { HAZ, HURDLE_HALF, MEDIAN_HALF, MEDIAN_Y, lenOf, ROAD_BOT, ROAD_TOP, LANE_Y, curvAt, forkAt, thingY, type Banana, type HazardKind, type Road, type Thing } from '@/lib/race'
import { THEMES, type Theme } from '@/lib/raceCourses'
import { logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import { slotTeam, type CarLook } from '@/lib/raceGarage'

export type ChaseCar = { id: string; x: number; y: number; fx: '' | 'spin' | 'stun' | 'slip' | 'boost' | 'shield'; fin: number | null; isMe: boolean; name: string; color: string; car: CarLook }
export type ChaseMail = { x: number; y: number; h: number; e?: string } // e = 📧 메일 / 📢 전체 공지
export type ChaseScene = {
  w: number; h: number
  me: { x: number; y: number; v: number; fx: ChaseCar['fx'] }
  cars: ChaseCar[]
  things: Thing[] // 그릴 것만(먹은 상자 뺀 것)
  bananas: Banana[]
  mails: ChaseMail[]
  wall: number // 애니메이션용 시각(ms)
  shake: number // 0~1
  t?: number // 레이스 시각(ms) — 움직이는 장애물 위치
  theme?: Theme // 코스 배경(없으면 예전 퇴근길 노을)
  road?: Road // 커브·갈림길(없으면 예전처럼 살짝 휘어 보이기만)
  cam?: ChaseCam // 카메라(없으면 추격 시점)
}
// 카메라 — back = 내 차 뒤로 떨어진 거리(음수면 차 안·앞), h = 높이, follow = 옆으로 내 차를 따라가는 비율, horizon = 지평선(화면 높이 비율), hideMe = 내 차 안 그림(운전석 시점)
export type ChaseCam = { back: number; h: number; follow: number; horizon: number; focal?: number; hideMe?: boolean; carMaxSc?: number } // carMaxSc = 가까운 차를 이 배율보다 크게 안 그림(1인칭에서 바로 앞 차가 화면을 덮지 않게)
export const CHASE_CAM: ChaseCam = { back: 165, h: 70, follow: 0.75, horizon: 0.34 }

const CENTER = (ROAD_TOP + ROAD_BOT) / 2
const HALF = (ROAD_BOT - ROAD_TOP) / 2
const FOCAL_DEFAULT = 410
const FAR = 2600
const SEG = 36

// 도로가 휘어 보이는 정도(카메라 위치에 따라 천천히 바뀜)
const curveAt = (z: number) => Math.sin(z / 1700) * 0.00009 + Math.sin(z / 610 + 1.3) * 0.00004
const CURVE_K = 0.00028 // 코스 커브(curv = 1)가 화면에서 휘는 정도

export function drawChase(ctx: CanvasRenderingContext2D, s: ChaseScene) {
  const { w, h } = s
  const cam = s.cam ?? CHASE_CAM
  const CAM_H = cam.h, FOCAL = cam.focal ?? FOCAL_DEFAULT
  const horizon = Math.round(h * cam.horizon)
  const camZ = s.me.x - cam.back // back이 멀수록 원근이 완만 — 앞이 덜 작아진다
  const camLat = (s.me.y - CENTER) * cam.follow // 추격 시점은 내 차를 반쯤 따라 옆으로
  const road = s.road
  const RACE_LEN = lenOf(road)
  const kAt = (z: number) => (road ? curvAt(road, z) * CURVE_K : curveAt(z))
  const k = kAt(camZ)
  const shakeX = s.shake ? (Math.sin(s.wall / 23) * 6 * s.shake) : 0
  const proj = (z: number, lat: number, up = 0) => {
    const dz = Math.max(1, z - camZ)
    const sc = FOCAL / dz
    // 앞쪽 굽은 정도를 반영(카메라 자리 + 그 지점 평균) — 커브가 다가오는 게 보인다
    const bend = (road ? (k + kAt(z)) * 0.5 : k) * dz * dz
    return { sx: w / 2 + (lat - camLat + bend) * sc + shakeX, sy: horizon + (CAM_H - up) * sc, sc, dz }
  }

  const tm = s.theme ?? THEMES.sunset
  const raceT = s.t ?? 0
  // 하늘·해(달)·먼 풍경
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, tm.sky[0])
  sky.addColorStop(0.55, tm.sky[1])
  sky.addColorStop(1, tm.sky[2])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon + 1)
  const pan = (-k * 9e5 - camLat * 0.3) % w
  if (tm.weather === 'stars' || tm.weather === 'neon') drawStars(ctx, w, horizon, s.wall)
  if (tm.orb) {
    const ox = w * tm.orb.x + pan * 0.05, oy = horizon - 18 - tm.orb.r * 0.6
    ctx.fillStyle = tm.orb.color
    ctx.beginPath(); ctx.arc(ox, oy, tm.orb.r, 0, Math.PI * 2); ctx.fill()
    if (tm.orb.moon) { ctx.fillStyle = tm.sky[0]; ctx.beginPath(); ctx.arc(ox + tm.orb.r * 0.45, oy - tm.orb.r * 0.25, tm.orb.r * 0.85, 0, Math.PI * 2); ctx.fill() }
  }
  drawSkyline(ctx, tm, w, horizon, pan, s.wall)

  // 땅·도로(먼 곳 → 가까운 곳)
  ctx.fillStyle = tm.ground[1]
  ctx.fillRect(0, horizon, w, h - horizon)
  const startZ = Math.floor((camZ + 8) / SEG) * SEG
  const segs: number[] = []
  for (let z = startZ + Math.ceil(FAR / SEG) * SEG; z >= startZ; z -= SEG) segs.push(z)
  for (const z0 of segs) {
    const z1 = z0 + SEG + 2 // 조금 겹쳐 그려서 칸 사이 실금이 안 보이게
    const a = proj(z0 + 0.0001, 0), b = proj(z1, 0)
    if (a.sy < horizon - 1) continue
    const band = Math.floor(z0 / (SEG * 3)) % 2 === 0
    const quad = (latL: number, latR: number, color: string) => {
      const p0 = proj(z0, latL), p1 = proj(z0, latR), p2 = proj(z1, latR), p3 = proj(z1, latL)
      ctx.fillStyle = color
      ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.closePath(); ctx.fill()
    }
    quad(-HALF * 12, HALF * 12, band ? tm.ground[0] : tm.ground[1])
    quad(-HALF - 12, HALF + 12, band ? tm.curb[0] : tm.curb[1]) // 연석
    quad(-HALF, HALF, band ? tm.road[0] : tm.road[1])
    // 차선(점선)
    if (band) for (let i = 0; i < 3; i++) {
      const lat = (LANE_Y[i] + LANE_Y[i + 1]) / 2 - CENTER
      quad(lat - 1.6, lat + 1.6, tm.lane)
    }
    // 출발선·결승선
    if (z0 <= 150 && z1 > 150) quad(-HALF, HALF, '#F9FAFB')
    if (z0 <= RACE_LEN && z1 > RACE_LEN) {
      for (let i = 0; i < 10; i++) {
        const l0 = -HALF + (i * 2 * HALF) / 10, l1 = l0 + (2 * HALF) / 10
        const p0 = proj(RACE_LEN, l0), p1 = proj(RACE_LEN, l1), p2 = proj(RACE_LEN + 14, l1), p3 = proj(RACE_LEN + 14, l0)
        ctx.fillStyle = i % 2 ? '#111827' : '#F9FAFB'
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.fill()
      }
    }
    // 갈림길: 가운데 화단(넘을 수 없음) + 연석
    const fk = road ? forkAt(road, z0 + SEG / 2) : null
    if (fk) {
      const mid = MEDIAN_Y - CENTER
      // ⚡ 지름길 쪽은 흙길(좁고 거친 길처럼) + 노란 가운데 줄
      if (fk.short) {
        const [l0, l1] = fk.risky === 0 ? [-HALF, mid - MEDIAN_HALF] : [mid + MEDIAN_HALF, HALF]
        quad(l0, l1, band ? '#9A7650' : '#8C6A46')
        if (band) quad((l0 + l1) / 2 - 1.4, (l0 + l1) / 2 + 1.4, 'rgba(253,224,71,0.8)')
      }
      quad(mid - MEDIAN_HALF - 3, mid + MEDIAN_HALF + 3, band ? '#F9FAFB' : '#EF4444')
      quad(mid - MEDIAN_HALF, mid + MEDIAN_HALF, band ? tm.ground[0] : tm.ground[1])
    }
    void a; void b
  }

  // 바닥에 붙은 것(발판·기름·웅덩이·빙판·모래·과속방지턱 등)
  for (const th of s.things) {
    if (th.kind === 'box' || !HAZ[th.kind].floor) continue
    const dz = th.x - camZ
    if (dz < 10 || dz > FAR) continue
    const lat = th.y - CENTER
    const near = proj(th.x - th.r, lat), far = proj(th.x + th.r, lat)
    const halfW = (th.kind === 'pad' ? 22 : th.r + 6) * near.sc
    if (th.kind !== 'pad') {
      const cx = (near.sx + far.sx) / 2, cy = (near.sy + far.sy) / 2, ry = Math.max(1, (near.sy - far.sy) / 2 + 1)
      drawFloor(ctx, th.kind, cx, cy, halfW, ry, near, far, s.wall)
    } else {
      const fw = 22 * far.sc
      ctx.fillStyle = '#FACC15'
      ctx.beginPath(); ctx.moveTo(near.sx - halfW, near.sy); ctx.lineTo(near.sx + halfW, near.sy); ctx.lineTo(far.sx + fw, far.sy); ctx.lineTo(far.sx - fw, far.sy); ctx.fill()
      ctx.strokeStyle = '#B45309'; ctx.lineWidth = Math.max(1, 2.5 * near.sc)
      for (let c = 0; c < 2; c++) {
        const t0 = 0.15 + c * 0.4, t1 = t0 + 0.25
        const yA = near.sy + (far.sy - near.sy) * t0, yB = near.sy + (far.sy - near.sy) * t1
        const xA = near.sx + (far.sx - near.sx) * t0, xB = near.sx + (far.sx - near.sx) * t1
        const wA = halfW + (fw - halfW) * t0
        ctx.beginPath(); ctx.moveTo(xA - wA * 0.6, yA); ctx.lineTo(xB, yB); ctx.lineTo(xA + wA * 0.6, yA); ctx.stroke()
      }
    }
  }

  // 서 있는 것(고깔·상자·바나나·차·메일) — 먼 것부터
  type Sprite = { z: number; draw: () => void }
  const sprites: Sprite[] = []
  const emoji = (txt: string, z: number, lat: number, size: number, up = 0) => {
    const p = proj(z, lat, up)
    if (p.dz < 12 || p.dz > FAR) return
    const px = size * p.sc
    if (px < 3) return
    sprites.push({ z, draw: () => drawEmoji(ctx, txt, p.sx, p.sy + px * 0.08, px) })
  }
  // 길가 장식(코스 테마) — 양옆에 번갈아, 위치는 거리로 정해져 모두에게 같다
  if (tm.side.length) {
    const STEP = 230
    for (let z = Math.ceil((camZ + 40) / STEP) * STEP; z < camZ + FAR; z += STEP) {
      const n = Math.floor(z / STEP)
      const side = n % 2 ? 1 : -1
      const pick = tm.side[((n * 7919) >>> 0) % tm.side.length]
      emoji(pick, z, side * (HALF + 46 + ((n * 37) % 40)), 34)
    }
  }
  // 갈림길 입구 표지판
  if (road) for (const fk of road.forks) {
    emoji('🔀', fk.x0 - 10, MEDIAN_Y - CENTER, 40, 18)
    if (fk.short) {
      const lat = (fk.risky === 0 ? (LANE_Y[0] + LANE_Y[1]) / 2 : (LANE_Y[2] + LANE_Y[3]) / 2) - CENTER
      emoji('⚡', fk.x0 - 160, lat, 34, 26)
      emoji('⚡', fk.x0 - 20, lat, 30, 22)
    }
    emoji('🌳', fk.x0 + 400, MEDIAN_Y - CENTER, 30)
    emoji('🌳', fk.x0 + 1100, MEDIAN_Y - CENTER, 30)
  }
  for (const th of s.things) {
    if (th.kind !== 'box' && !HAZ[th.kind].floor) {
      const y = thingY(th, raceT)
      const size = th.kind === 'barrier' ? 36 : th.kind === 'crowd' ? 30 : 28
      if (th.kind === 'crowd') { emoji('🧍', th.x, y - CENTER - 9, size); emoji('🧍‍♀️', th.x + 4, y - CENTER + 9, size) }
      else if (th.kind === 'pigeon') { emoji('🕊️', th.x, y - CENTER - 7, 22, 4); emoji('🕊️', th.x + 6, y - CENTER + 7, 22, 2) }
      else if (th.kind === 'barrier') { emoji('🚧', th.x, y - CENTER - 8, size); emoji('🚧', th.x, y - CENTER + 8, size) }
      else emoji(HAZ[th.kind].emoji, th.x, y - CENTER, size)
      continue
    }
    if (th.kind === 'box') {
      const p = proj(th.x, th.y - CENTER, 6)
      if (p.dz < 12 || p.dz > FAR) continue
      const sz = 24 * p.sc
      const bob = Math.sin(s.wall / 180 + th.id) * 3 * p.sc
      sprites.push({ z: th.x, draw: () => {
        const g = ctx.createLinearGradient(p.sx - sz / 2, p.sy - sz, p.sx + sz / 2, p.sy)
        g.addColorStop(0, '#38BDF8'); g.addColorStop(1, '#F472B6')
        ctx.fillStyle = g
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, 2 * p.sc)
        ctx.beginPath(); ctx.roundRect(p.sx - sz / 2, p.sy - sz - bob, sz, sz, sz * 0.18); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 ${sz * 0.7}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('?', p.sx, p.sy - sz / 2 - bob)
      } })
    }
  }
  for (const b of s.bananas) {
    if (b.kind !== 'hurdle') { emoji('🍌', b.x, b.y - CENTER, 24); continue }
    // 🏃 허들 — 다리 둘 + 파랑·노랑 줄무늬 가로 막대(바나나보다 넓게). 맵 장애물 🚧 바리케이드(주황·흰)와 헷갈리지 않게 색을 달리 했다
    const lat = b.y - CENTER
    const l0 = proj(b.x, lat - HURDLE_HALF), r0 = proj(b.x, lat + HURDLE_HALF)
    if (l0.dz < 12 || l0.dz > FAR) continue
    const lt = proj(b.x, lat - HURDLE_HALF, 16), rt = proj(b.x, lat + HURDLE_HALF, 16), lm = proj(b.x, lat - HURDLE_HALF, 7), rm = proj(b.x, lat + HURDLE_HALF, 7)
    sprites.push({ z: b.x, draw: () => {
      const sc = l0.sc
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.beginPath(); ctx.ellipse((l0.sx + r0.sx) / 2, l0.sy, (r0.sx - l0.sx) / 2 + 3 * sc, Math.max(1, 2.5 * sc), 0, 0, Math.PI * 2); ctx.fill()
      // 다리(도로 색에 안 묻히게 밝은 색 + 진한 테) + 바닥 받침
      ctx.lineCap = 'round'
      for (const [w0, col] of [[3.6, '#1E293B'], [2.2, '#F1F5F9']] as const) {
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w0 * sc)
        ctx.beginPath(); ctx.moveTo(l0.sx, l0.sy); ctx.lineTo(lt.sx, lt.sy); ctx.moveTo(r0.sx, r0.sy); ctx.lineTo(rt.sx, rt.sy)
        ctx.moveTo(l0.sx - 3 * sc, l0.sy); ctx.lineTo(l0.sx + 3 * sc, l0.sy); ctx.moveTo(r0.sx - 3 * sc, r0.sy); ctx.lineTo(r0.sx + 3 * sc, r0.sy)
        ctx.stroke()
      }
      // 아래 가로대
      ctx.strokeStyle = '#F1F5F9'; ctx.lineWidth = Math.max(1, 1.4 * sc); ctx.beginPath(); ctx.moveTo(lm.sx, lm.sy); ctx.lineTo(rm.sx, rm.sy); ctx.stroke()
      // 위 판(줄무늬)
      const bh = Math.max(2, 7 * sc), w = rt.sx - lt.sx, n = 5
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? '#FACC15' : '#2563EB'
        ctx.fillRect(lt.sx + (w * i) / n, lt.sy - bh, w / n + 0.5, bh)
      }
      ctx.strokeStyle = 'rgba(15,23,42,0.6)'; ctx.lineWidth = Math.max(0.6, 0.8 * sc); ctx.strokeRect(lt.sx, lt.sy - bh, w, bh)
    } })
  }
  for (const m of s.mails) emoji(m.e ?? '📧', m.x, m.y - CENTER, m.e === '📢' ? 34 : 26, m.h)
  for (const c of s.cars) {
    if (c.isMe && cam.hideMe) continue
    const p = proj(c.x, c.y - CENTER)
    if (p.dz < 20 || p.dz > FAR) continue
    sprites.push({ z: c.x + (c.isMe ? 0.01 : 0), draw: () => drawKart(ctx, p.sx, p.sy, Math.min(p.sc, cam.carMaxSc ?? Infinity), c, s.wall) })
  }
  sprites.sort((a, b) => b.z - a.z)
  for (const sp of sprites) sp.draw()

  // 부스터 속도선
  if (s.me.fx === 'boost') {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + (s.wall / 40) % 1
      const r0 = 120 + ((s.wall / 3 + i * 53) % 80), r1 = r0 + 60
      ctx.beginPath()
      ctx.moveTo(w / 2 + Math.cos(ang) * r0 * 1.6, horizon + 40 + Math.sin(ang) * r0 * 0.7)
      ctx.lineTo(w / 2 + Math.cos(ang) * r1 * 1.6, horizon + 40 + Math.sin(ang) * r1 * 0.7)
      ctx.stroke()
    }
  }
  drawWeather(ctx, tm, w, h, horizon, s.wall)
}

// ── 이모지 그림 캐시 ──
// 이모지를 매 프레임 fillText로 그리면 레이스 그리기 시간의 80%를 먹는다(2026-11-05 측정, 프레임당 17ms → 3ms).
// 이모지마다 한 번만 큰 그림으로 찍어 두고 drawImage로 크기만 바꿔 그린다. (sx, baseY) = 가운데 아래(글자 기준선) 자리.
const EMOJI_PX = 128
const EMOJI_PAD = Math.round(EMOJI_PX * 0.12)
const emojiCache = new Map<string, HTMLCanvasElement | null>()
function emojiImage(txt: string): HTMLCanvasElement | null {
  if (emojiCache.has(txt)) return emojiCache.get(txt)!
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas')
  cv.width = Math.round(EMOJI_PX * 1.3); cv.height = EMOJI_PX + EMOJI_PAD * 2
  const g = cv.getContext('2d')
  if (!g) { emojiCache.set(txt, null); return null }
  g.font = `${EMOJI_PX}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  g.textAlign = 'center'; g.textBaseline = 'bottom'
  g.fillText(txt, cv.width / 2, cv.height - EMOJI_PAD)
  emojiCache.set(txt, cv)
  return cv
}
function drawEmoji(ctx: CanvasRenderingContext2D, txt: string, sx: number, baseY: number, px: number) {
  const img = emojiImage(txt)
  if (!img) {
    ctx.font = `${px}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(txt, sx, baseY)
    return
  }
  const k = px / EMOJI_PX
  ctx.drawImage(img, sx - (img.width * k) / 2, baseY - (img.height - EMOJI_PAD) * k, img.width * k, img.height * k)
}

// ── 코스 테마 그리기 ──
const wrapX = (base: number, w: number, span: number) => ((base % (w + span)) + w + span) % (w + span) - span / 2
const hash = (i: number) => ((Math.imul(i + 11, 2654435761) >>> 0) % 1000) / 1000

function drawStars(ctx: CanvasRenderingContext2D, w: number, horizon: number, wall: number) {
  for (let i = 0; i < 46; i++) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(wall / 700 + i))
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.5 * hash(i)) * tw})`
    ctx.fillRect(hash(i * 3) * w, hash(i * 5) * (horizon - 20), 1.6, 1.6)
  }
}

function drawSkyline(ctx: CanvasRenderingContext2D, th: Theme, w: number, horizon: number, pan: number, wall: number) {
  const p = pan * 0.6
  ctx.fillStyle = th.far
  switch (th.skyline) {
    case 'city':
    case 'tower': {
      const tall = th.skyline === 'tower'
      for (let i = -1; i < 10; i++) {
        const bx = wrapX(i * 140 + p, w, 140)
        const bh = (tall ? 50 : 22) + hash(i + 40) * (tall ? 60 : 30)
        const bw = 40 + hash(i + 7) * 20
        ctx.fillStyle = th.far
        ctx.fillRect(bx, horizon - bh, bw, bh)
        ctx.fillRect(bx + bw + 8, horizon - bh * 0.6, 26, bh * 0.6)
        ctx.fillStyle = th.far2 ?? '#FEF3C7'
        for (let r = 0; r < (tall ? 6 : 2); r++) for (let c = 0; c < 3; c++) if (hash(i * 31 + r * 7 + c) > 0.35) ctx.fillRect(bx + 6 + c * 12, horizon - bh + 8 + r * 12, 5, 5)
      }
      break
    }
    case 'brick': {
      // 성수동: 붉은 벽돌 공장(톱니 지붕) + 굴뚝 + 카페 차양
      for (let i = -1; i < 9; i++) {
        const bx = wrapX(i * 160 + p, w, 160)
        const bh = 26 + hash(i + 3) * 18, bw = 90
        ctx.fillStyle = th.far
        ctx.fillRect(bx, horizon - bh, bw, bh)
        ctx.beginPath()
        for (let t = 0; t < 4; t++) { ctx.moveTo(bx + t * 22, horizon - bh); ctx.lineTo(bx + t * 22 + 22, horizon - bh - 12); ctx.lineTo(bx + t * 22 + 22, horizon - bh) }
        ctx.fill()
        if (hash(i + 9) > 0.4) { ctx.fillRect(bx + bw - 14, horizon - bh - 34, 9, 34) } // 굴뚝
        ctx.fillStyle = th.far2 ?? '#3F2A1E'
        for (let c = 0; c < 4; c++) ctx.fillRect(bx + 8 + c * 21, horizon - bh + 8, 12, 9) // 창
        ctx.fillStyle = hash(i + 21) > 0.5 ? '#166534' : '#1E3A8A'
        ctx.fillRect(bx + 4, horizon - 12, bw - 8, 5) // 차양
      }
      break
    }
    case 'tech': {
      for (let i = -1; i < 9; i++) {
        const bx = wrapX(i * 150 + p, w, 150)
        const bh = 55 + hash(i + 5) * 45, bw = 46 + hash(i) * 22
        const g = ctx.createLinearGradient(bx, horizon - bh, bx + bw, horizon)
        g.addColorStop(0, th.far2 ?? '#DBEAFE'); g.addColorStop(1, th.far)
        ctx.fillStyle = g
        ctx.fillRect(bx, horizon - bh, bw, bh)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        for (let r = 0; r < bh / 9; r++) ctx.fillRect(bx, horizon - bh + r * 9, bw, 1)
      }
      break
    }
    case 'hanok': {
      for (let i = -1; i < 9; i++) {
        const bx = wrapX(i * 130 + p, w, 130)
        ctx.fillStyle = th.far2 ?? '#A16207'
        ctx.fillRect(bx + 10, horizon - 18, 70, 18) // 몸채
        ctx.fillStyle = th.far
        ctx.beginPath() // 처마가 들린 기와지붕
        ctx.moveTo(bx - 6, horizon - 16); ctx.quadraticCurveTo(bx + 45, horizon - 26, bx + 96, horizon - 16)
        ctx.lineTo(bx + 82, horizon - 32); ctx.quadraticCurveTo(bx + 45, horizon - 38, bx + 8, horizon - 32); ctx.closePath(); ctx.fill()
      }
      break
    }
    case 'mountain': {
      for (let layer = 0; layer < 2; layer++) {
        const lp = p * (layer ? 0.6 : 0.35)
        for (let i = -1; i < 7; i++) {
          const bx = wrapX(i * 220 + lp + layer * 90, w, 220)
          const mh = (layer ? 46 : 66) + hash(i + layer * 13) * 30
          ctx.fillStyle = layer ? th.far : shade(th.far, -0.15)
          ctx.beginPath(); ctx.moveTo(bx - 120, horizon); ctx.lineTo(bx, horizon - mh); ctx.lineTo(bx + 120, horizon); ctx.fill()
          if (th.far2 && !layer) { ctx.fillStyle = th.far2; ctx.beginPath(); ctx.moveTo(bx - 22, horizon - mh + 18); ctx.lineTo(bx, horizon - mh); ctx.lineTo(bx + 22, horizon - mh + 18); ctx.fill() }
        }
      }
      break
    }
    case 'sea': {
      ctx.fillStyle = th.far
      ctx.fillRect(0, horizon - 22, w, 22)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      for (let i = 0; i < 18; i++) ctx.fillRect(wrapX(i * 70 + p * 0.4 + Math.sin(wall / 500 + i) * 6, w, 70), horizon - 18 + (i % 4) * 4, 18, 1.5)
      ctx.fillStyle = th.far2 ?? '#4D7C0F' // 먼 섬
      ctx.beginPath(); ctx.ellipse(wrapX(w * 0.65 + p * 0.2, w, 300), horizon - 22, 90, 16, 0, Math.PI, 0); ctx.fill()
      break
    }
    case 'dunes': {
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? th.far : th.far2 ?? th.far
        ctx.beginPath(); ctx.moveTo(0, horizon)
        for (let x = 0; x <= w; x += 12) ctx.lineTo(x, horizon - (layer ? 14 : 26) - Math.sin((x + p * (layer ? 0.8 : 0.4)) / (layer ? 60 : 110)) * (layer ? 8 : 14))
        ctx.lineTo(w, horizon); ctx.fill()
      }
      break
    }
    case 'trees': {
      for (let i = -1; i < 16; i++) {
        const bx = wrapX(i * 70 + p, w, 70)
        const r = 16 + hash(i + 2) * 10
        ctx.fillStyle = '#6B4F3A'; ctx.fillRect(bx - 2, horizon - 12, 4, 12)
        ctx.fillStyle = hash(i + 4) > 0.5 ? th.far : th.far2 ?? th.far
        ctx.beginPath(); ctx.arc(bx, horizon - 12 - r * 0.6, r, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'stadium': {
      const sx = wrapX(w * 0.55 + p * 0.3, w, 500)
      ctx.fillStyle = th.far
      ctx.beginPath(); ctx.ellipse(sx, horizon, 150, 42, 0, Math.PI, 0); ctx.fill()
      ctx.fillStyle = shade(th.far, 0.2)
      ctx.fillRect(sx - 150, horizon - 10, 300, 10)
      for (const dx of [-130, 130]) { // 조명탑
        ctx.fillStyle = '#334155'; ctx.fillRect(sx + dx - 2, horizon - 78, 4, 60)
        ctx.fillStyle = th.far2 ?? '#FEF9C3'; ctx.fillRect(sx + dx - 12, horizon - 86, 24, 10)
      }
      break
    }
    case 'bridge': {
      // 한강: 강물 + 아치 다리 + 강 건너 불빛
      ctx.fillStyle = '#1E3A5F'
      ctx.fillRect(0, horizon - 16, w, 16)
      ctx.fillStyle = th.far
      for (let i = -1; i < 8; i++) { const bx = wrapX(i * 120 + p * 0.5, w, 120); ctx.fillRect(bx, horizon - 52 - hash(i) * 20, 30, 40) }
      ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2
      const bx = wrapX(p * 0.8, w, w)
      for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.arc(bx + a * 160, horizon - 6, 80, Math.PI, 0); ctx.stroke() }
      ctx.fillStyle = th.far2 ?? '#FDE68A'
      for (let i = 0; i < 40; i++) ctx.fillRect(wrapX(i * 31 + p * 0.5, w, 31), horizon - 44 + (i % 5) * 7, 2, 2)
      ctx.fillStyle = 'rgba(253,230,138,0.35)'
      for (let i = 0; i < 20; i++) ctx.fillRect(wrapX(i * 60 + p * 0.5, w, 60), horizon - 14 + (i % 3) * 4, 14, 1.5) // 물에 비친 불빛
      break
    }
    case 'alley': {
      // 을지로: 낮은 상가 + 붉은 간판 + 전깃줄
      for (let i = -1; i < 10; i++) {
        const bx = wrapX(i * 110 + p, w, 110)
        const bh = 30 + hash(i + 8) * 22
        ctx.fillStyle = th.far; ctx.fillRect(bx, horizon - bh, 92, bh)
        ctx.fillStyle = hash(i) > 0.5 ? '#DC2626' : '#1D4ED8'; ctx.fillRect(bx + 8, horizon - bh + 6, 56, 9)
        ctx.fillStyle = th.far2 ?? '#FBBF24'; ctx.fillRect(bx + 12, horizon - 14, 18, 10)
      }
      ctx.strokeStyle = 'rgba(17,24,39,0.6)'; ctx.lineWidth = 1
      for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(0, horizon - 70 + l * 8); ctx.quadraticCurveTo(w / 2, horizon - 50 + l * 8, w, horizon - 70 + l * 8); ctx.stroke() }
      break
    }
    case 'space': {
      const px = wrapX(w * 0.7 + p * 0.1, w, 600)
      ctx.fillStyle = th.far; ctx.beginPath(); ctx.arc(px, horizon - 50, 34, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = th.far2 ?? '#F59E0B'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.ellipse(px, horizon - 50, 56, 12, -0.3, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#94A3B8'; ctx.beginPath(); ctx.arc(wrapX(w * 0.2 + p * 0.05, w, 600), horizon - 80, 12, 0, Math.PI * 2); ctx.fill()
      break
    }
  }
}

// 바닥 장애물 — 종류마다 모양·색이 다르다(타원 웅덩이, 과속방지턱 줄무늬 등)
function drawFloor(ctx: CanvasRenderingContext2D, kind: HazardKind, cx: number, cy: number, rx: number, ry: number,
  near: { sx: number; sy: number }, far: { sx: number; sy: number }, wall: number) {
  const blob = (color: string, sx = 1, sy = 1, dx = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(cx + dx * rx, cy, rx * sx, Math.max(1, ry * sy), 0, 0, Math.PI * 2); ctx.fill() }
  switch (kind) {
    case 'oil': {
      // 검은 기름 + 무지갯빛 테두리·광택 — 어두운 도로(밤·네온·우주)에서도 보이게(2026-11-05)
      blob('rgba(10,12,18,0.92)')
      const g = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy)
      g.addColorStop(0, '#22D3EE'); g.addColorStop(0.35, '#FDE047'); g.addColorStop(0.7, '#F472B6'); g.addColorStop(1, '#22D3EE')
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.5, ry * 0.35)
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.96, Math.max(1, ry * 0.92), 0, 0, Math.PI * 2); ctx.stroke()
      blob('rgba(34,211,238,0.55)', 0.32, 0.35, -0.3)
      blob('rgba(253,224,71,0.45)', 0.2, 0.25, 0.25)
      break
    }
    case 'ice': blob('rgba(186,230,253,0.9)'); blob('rgba(255,255,255,0.8)', 0.4, 0.35, -0.25); break
    case 'coffee': blob('rgba(146,94,58,0.9)'); blob('rgba(253,230,200,0.6)', 0.35, 0.4, 0.2); break
    case 'leaves': blob('rgba(234,88,12,0.85)'); blob('rgba(250,204,21,0.8)', 0.5, 0.5, -0.25); blob('rgba(185,28,28,0.75)', 0.35, 0.4, 0.3); break
    case 'puddle': {
      blob('rgba(59,130,246,0.75)')
      const rip = (wall / 600) % 1
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - rip)})`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * (0.3 + rip * 0.6), Math.max(1, ry * (0.3 + rip * 0.6)), 0, 0, Math.PI * 2); ctx.stroke()
      break
    }
    case 'sand': blob('rgba(251,191,36,0.9)'); blob('rgba(217,119,6,0.5)', 0.6, 0.5, 0.15); break
    case 'mud': blob('rgba(120,72,30,0.92)'); blob('rgba(80,45,20,0.7)', 0.5, 0.5, -0.2); break
    case 'pothole': blob('rgba(31,41,55,0.95)', 0.8, 0.9); ctx.strokeStyle = 'rgba(226,232,240,0.85)'; ctx.lineWidth = Math.max(1.2, ry * 0.25); ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.8, Math.max(1, ry * 0.9), 0, 0, Math.PI * 2); ctx.stroke(); break
    case 'bump': {
      // 노랑·검정 줄무늬 띠(차선 하나 폭)
      const n = 6
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? '#111827' : '#FACC15'
        const x0 = near.sx - rx + (2 * rx * i) / n, x1 = x0 + (2 * rx) / n
        ctx.beginPath(); ctx.moveTo(x0, near.sy); ctx.lineTo(x1, near.sy); ctx.lineTo(x1 + (far.sx - near.sx), far.sy); ctx.lineTo(x0 + (far.sx - near.sx), far.sy); ctx.fill()
      }
      break
    }
    default: blob('rgba(17,24,39,0.6)')
  }
}

function drawWeather(ctx: CanvasRenderingContext2D, th: Theme, w: number, h: number, horizon: number, wall: number) {
  switch (th.weather) {
    case 'rain': {
      ctx.strokeStyle = 'rgba(203,213,225,0.55)'; ctx.lineWidth = 1
      for (let i = 0; i < 70; i++) {
        const x = (hash(i) * w + wall * 0.15) % w, y = (hash(i + 99) * h + wall * 0.9) % h
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke()
      }
      ctx.fillStyle = 'rgba(30,41,59,0.12)'; ctx.fillRect(0, 0, w, h)
      break
    }
    case 'snow': {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (let i = 0; i < 60; i++) {
        const x = (hash(i) * w + Math.sin(wall / 900 + i) * 18 + w) % w, y = (hash(i + 50) * h + wall * 0.06 * (0.6 + hash(i + 7))) % h
        ctx.beginPath(); ctx.arc(x, y, 1.2 + hash(i + 3) * 1.6, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'petals':
    case 'leaves': {
      const cols = th.weather === 'petals' ? ['#F9A8D4', '#FBCFE8', '#FFFFFF'] : ['#EA580C', '#F59E0B', '#B91C1C']
      for (let i = 0; i < 34; i++) {
        const x = (hash(i) * w - wall * 0.05 * (0.5 + hash(i + 4)) + Math.sin(wall / 700 + i) * 20 + w * 4) % w
        const y = (hash(i + 30) * h + wall * 0.045 * (0.6 + hash(i + 9))) % h
        ctx.fillStyle = cols[i % 3]
        ctx.beginPath(); ctx.ellipse(x, y, 3, 1.8, wall / 400 + i, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'dust': {
      ctx.fillStyle = 'rgba(251,191,36,0.12)'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(217,119,6,0.35)'
      for (let i = 0; i < 40; i++) ctx.fillRect((hash(i) * w + wall * 0.3) % w, horizon + hash(i + 5) * (h - horizon), 2, 1)
      break
    }
    case 'neon': {
      ctx.fillStyle = 'rgba(236,72,153,0.07)'; ctx.fillRect(0, horizon, w, h - horizon)
      break
    }
    case 'fog': {
      const g = ctx.createLinearGradient(0, horizon - 20, 0, horizon + 80)
      g.addColorStop(0, 'rgba(241,245,249,0.7)'); g.addColorStop(1, 'rgba(241,245,249,0)')
      ctx.fillStyle = g; ctx.fillRect(0, horizon - 20, w, 100)
      break
    }
  }
}

// 색을 밝게(+)/어둡게(-) — '#RRGGBB'만
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))))
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(c => c.toString(16).padStart(2, '0')).join('')
}

// 구단 엠블럼 그림(public/kbo/*.png) — 처음 쓸 때 한 번 불러 둔다
const logos = new Map<string, HTMLImageElement>()
function logo(team: TeamKey): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  let img = logos.get(team)
  if (!img) { img = new Image(); img.src = logoUrl(team); logos.set(team, img) }
  return img.complete && img.naturalWidth > 0 ? img : null
}
function emblem(ctx: CanvasRenderingContext2D, team: TeamKey, cx: number, cy: number, r: number, bg: string) {
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  const img = logo(team)
  if (img && r > 2) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(img, cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72)
    ctx.restore()
  }
}

const BODY_SCALE = { kart: 1, mini: 0.9, compact: 1.05, sedan: 1.12, suv: 1.2, grand: 1.18, coupe: 1.14, lux: 1.22, sport: 1.24, super: 1.32 } as const
// 지붕 높이(bh 배수) — 뒷날개·헬멧 위치. 지붕 있는 차(CLOSED)는 헬멧이 뒷유리 안에 보인다
const ROOF = { kart: 1.55, mini: 2.0, compact: 1.52, sedan: 1.62, suv: 1.98, grand: 1.6, coupe: 1.42, lux: 1.62, sport: 1.4, super: 1.86 } as const
// 지붕 있는 차 뒷모습(2026-11-24 차 10종) — lowTop/lowBot = 몸통 위·아래선, cabW = 지붕 반폭, baseW = 몸통 반폭(bw 배수),
// tail = 후미등(bar2 가로 두 개 · vert 세로 · dot 동그라미 · full 가로 한 줄), chrome = 크롬 띠(고급차), round = 둥근 지붕(쿠페)
// roofC = 2톤 지붕 색, lip = 트렁크 끝 작은 립 스포일러, quad = 4구 배기, gold = 금장(크롬 대신)
// 2026-11-24 2차: 모닝빵(둥근 빵·크림 지붕) ↔ 아방이(각진 트렁크·립) 구분 / 스무디 크롬·검정 지붕·LED / 고르쉐 4도어 스포츠 세단 / 아르기닌 슈퍼 SUV·금장
type Closed = { lowTop: number; lowBot: number; cabW: number; baseW: number; tail: 'bar2' | 'vert' | 'dot' | 'full' | 'y'; chrome: boolean; round: boolean; roofC?: string; lip?: boolean; quad?: boolean; gold?: boolean }
const CLOSED_LOOK: Partial<Record<keyof typeof ROOF, Closed>> = {
  mini: { lowTop: 1.06, lowBot: 0.34, cabW: 0.42, baseW: 0.47, tail: 'dot', chrome: false, round: true, roofC: '#F3D9A4' },
  compact: { lowTop: 0.92, lowBot: 0.22, cabW: 0.36, baseW: 0.54, tail: 'bar2', chrome: false, round: false, lip: true },
  sedan: { lowTop: 0.98, lowBot: 0.22, cabW: 0.42, baseW: 0.54, tail: 'bar2', chrome: false, round: false },
  suv: { lowTop: 1.18, lowBot: 0.42, cabW: 0.5, baseW: 0.56, tail: 'vert', chrome: false, round: false },
  grand: { lowTop: 0.95, lowBot: 0.22, cabW: 0.43, baseW: 0.56, tail: 'full', chrome: true, round: false },
  coupe: { lowTop: 0.88, lowBot: 0.22, cabW: 0.36, baseW: 0.55, tail: 'full', chrome: true, round: true, roofC: '#0B0F17' },
  lux: { lowTop: 0.95, lowBot: 0.22, cabW: 0.44, baseW: 0.57, tail: 'full', chrome: true, round: false },
  sport: { lowTop: 0.84, lowBot: 0.2, cabW: 0.36, baseW: 0.58, tail: 'full', chrome: true, round: true, quad: true },
  super: { lowTop: 1.14, lowBot: 0.42, cabW: 0.46, baseW: 0.6, tail: 'y', chrome: true, round: false, roofC: '#0B0F17', quad: true, gold: true },
}
const CLOSED = (b: string) => b in CLOSED_LOOK

// 뒤에서 본 카트. car = 구단 도색 + 산 부품(엠블럼 휠·배기구·리어윙·깃발·차체). 구단을 안 골랐으면 팀원 색 기본 카트.
// 이름표는 남의 차만(내 차는 화면 아래 크게 보이니까). 차고 미리보기도 이 함수를 쓴다(withName = false).
// 💡 LED 후미등(부품) — 뒤 전체 LED 띠, 빛이 가운데서 양옆으로 흐른다(부스터 땐 빠른 무지개)
function ledTail(ctx: CanvasRenderingContext2D, half: number, y: number, th: number, color: string, boost: boolean, wall: number) {
  const n = 9, seg = (half * 2) / (n * 2 + 1)
  ctx.save()
  const halo = ctx.createRadialGradient(0, y, 0, 0, y, half * 1.1) // 띠 둘레 빛 번짐
  halo.addColorStop(0, boost ? 'rgba(255,255,255,0.45)' : color); halo.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = 0.35 + Math.sin(wall / 300) * 0.1; ctx.fillStyle = halo; ctx.fillRect(-half * 1.1, y - th * 1.6, half * 2.2, th * 3.2); ctx.globalAlpha = 1
  ctx.fillStyle = '#0B0F17'; ctx.fillRect(-half, y - th / 2, half * 2, th)
  ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = Math.max(0.6, th * 0.08); ctx.strokeRect(-half, y - th / 2, half * 2, th) // 크롬 테
  ctx.shadowColor = color; ctx.shadowBlur = th * 2.2
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i <= n; i++) {
    const ph = (wall / (boost ? 300 : 900)) % 1, d = Math.abs(i / n - ph)
    const hot = Math.max(0, 1 - d * 3.5)
    const sx = side * (seg / 2 + i * seg) - seg * 0.42
    ctx.globalAlpha = 0.45 + 0.55 * hot
    ctx.fillStyle = boost ? `hsl(${(wall / 3 + i * 40) % 360} 100% 60%)` : color
    ctx.fillRect(sx, y - th * 0.38, seg * 0.84, th * 0.76)
    if (hot > 0.3) { ctx.globalAlpha = hot; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(sx + seg * 0.15, y - th * 0.18, seg * 0.54, th * 0.36) } // 빛이 지나가는 칸은 하얗게 달아오름
  }
  ctx.restore()
}

// ⛑️ 헬멧 — 기본 = 구단 모자 색 반구 / 골드 레이서 헬멧(부품) = 금 크롬 + 구단 색 모히칸 볏 + 반짝 바이저
function drawHelmet(ctx: CanvasRenderingContext2D, hy: number, r: number, cap: string, gold: ReturnType<typeof teamOf> | 'own' | null, wall: number) {
  if (!gold) {
    ctx.fillStyle = cap
    ctx.beginPath(); ctx.arc(0, hy, r, Math.PI, 0); ctx.fill()
    return
  }
  const R = r * 1.12
  const crest = gold === 'own' ? '#EF4444' : gold.primary === '#000000' ? gold.secondary : gold.primary
  // 모히칸 볏(뒤에서 보면 가운데 세로 지느러미)
  ctx.fillStyle = crest
  ctx.beginPath(); ctx.moveTo(-R * 0.16, hy - R * 0.6); ctx.lineTo(0, hy - R * 1.42); ctx.lineTo(R * 0.16, hy - R * 0.6); ctx.closePath(); ctx.fill()
  // 금 크롬 돔
  const g = ctx.createLinearGradient(-R, hy - R, R, hy)
  g.addColorStop(0, '#FEF3C7'); g.addColorStop(0.35, '#FACC15'); g.addColorStop(0.65, '#B45309'); g.addColorStop(1, '#FDE68A')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, hy, R, Math.PI, 0); ctx.fill()
  // 가운데 구단 색 띠 + 아래 검정 테
  ctx.fillStyle = crest; ctx.fillRect(-R * 0.14, hy - R * 0.98, R * 0.28, R * 0.98)
  ctx.fillStyle = '#111827'; ctx.fillRect(-R, hy - R * 0.14, R * 2, R * 0.14)
  // 지나가는 반짝
  const u = ((wall / 1400) % 1) * 2.4 - 1.2
  if (Math.abs(u) < 1) {
    ctx.save(); ctx.beginPath(); ctx.arc(0, hy, R, Math.PI, 0); ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.beginPath(); ctx.moveTo(R * u - R * 0.12, hy); ctx.lineTo(R * u + R * 0.3, hy - R); ctx.lineTo(R * u + R * 0.46, hy - R); ctx.lineTo(R * u + R * 0.04, hy); ctx.closePath(); ctx.fill()
    ctx.restore()
  }
}

export function drawKart(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, c: ChaseCar, wall: number, withName = true) {
  const car = c.car
  const team = teamOf(car.team) // 선호 구단(헬멧)
  const bodyT = teamOf(car.bodyTeam ?? car.team) // 차체 도색·엠블럼(선물 차체면 그 구단)
  const flagT = teamOf(slotTeam(car, car.flag)), wheelT = teamOf(slotTeam(car, car.wheels))
  const exhaustT = teamOf(slotTeam(car, car.exhaust)), wingT = teamOf(slotTeam(car, car.wing))
  const helmetGold = car.helmet ? teamOf(slotTeam(car, car.helmet)) ?? 'own' : null
  const tailT = teamOf(slotTeam(car, car.tail))
  const tailC = tailT ? (tailT.primary === '#000000' ? tailT.secondary : tailT.primary) : '#EF4444'
  const capC = team?.cap ?? (c.isMe ? '#FDE68A' : '#F9FAFB')
  const main = bodyT?.primary ?? c.color
  const accent = bodyT?.secondary ?? '#1F2937'
  const k = BODY_SCALE[car.body]
  const bw = 34 * sc * k, bh = 15 * sc * (car.body === 'kart' ? 1 : 0.92 * k)
  ctx.save()
  ctx.translate(x, y)
  if (c.fx === 'spin') ctx.rotate(Math.sin(wall / 50) * 0.9)
  else if (c.fx === 'slip') ctx.rotate(Math.sin(wall / 35) * 0.18)
  if (c.fx === 'stun') ctx.globalAlpha = 0.65
  if (car.aura) { // ✨ 황금 오라(부품) — 차 둘레가 숨 쉬듯 빛나고, 빛줄기가 돌고, 반짝이가 피어오른다
    const cy = -bh * 1.1, R = bw * 1.05, br = 1 + Math.sin(wall / 420) * 0.06
    const ga = ctx.createRadialGradient(0, cy, R * 0.15, 0, cy, R * br)
    ga.addColorStop(0, 'rgba(255,247,214,0.55)'); ga.addColorStop(0.45, 'rgba(250,204,21,0.3)'); ga.addColorStop(1, 'rgba(250,204,21,0)')
    ctx.fillStyle = ga; ctx.beginPath(); ctx.ellipse(0, cy, R * br, R * 0.8 * br, 0, 0, Math.PI * 2); ctx.fill()
    ctx.save(); ctx.translate(0, cy); ctx.rotate(wall / 2600)
    for (let i = 0; i < 10; i++) { // 빛줄기
      ctx.rotate((Math.PI * 2) / 10)
      const rg = ctx.createLinearGradient(0, 0, R * 1.2, 0)
      rg.addColorStop(0, 'rgba(253,230,138,0.35)'); rg.addColorStop(1, 'rgba(253,230,138,0)')
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 1.2, -R * 0.07); ctx.lineTo(R * 1.2, R * 0.07); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
    for (let i = 0; i < 9; i++) { // 반짝이(아래에서 위로)
      const ph = (wall / 1800 + i * 0.137) % 1
      const sx = Math.sin(i * 2.3) * bw * 0.75, sy = -bh * 0.2 - ph * bh * 3.2, a = Math.sin(ph * Math.PI), sz = (1.5 + (i % 3)) * sc * a
      ctx.fillStyle = `rgba(255,251,235,${a})`
      ctx.beginPath(); ctx.moveTo(sx, sy - sz * 2); ctx.lineTo(sx + sz * 0.5, sy); ctx.lineTo(sx, sy + sz * 2); ctx.lineTo(sx - sz * 0.5, sy); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(sx - sz * 2, sy); ctx.lineTo(sx, sy + sz * 0.5); ctx.lineTo(sx + sz * 2, sy); ctx.lineTo(sx, sy - sz * 0.5); ctx.closePath(); ctx.fill()
    }
  }
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.64, 4 * sc, 0, 0, Math.PI * 2); ctx.fill()
  if (car.neon) { // 🌈 무지개 네온(부품) — 구단과 상관없이 무지개가 차 밑을 빙글빙글
    const h0 = (wall / 8) % 360
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, bw * 1.05)
    gl.addColorStop(0, `hsla(${h0},100%,65%,0.8)`); gl.addColorStop(0.55, `hsla(${(h0 + 120) % 360},100%,60%,0.4)`); gl.addColorStop(1, `hsla(${(h0 + 240) % 360},100%,60%,0)`)
    ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(0, 0, bw * 1.05, 13 * sc, 0, 0, Math.PI * 2); ctx.fill()
    const n = 24
    for (let i = 0; i < n; i++) { // 바닥 LED 띠(색이 돌아간다)
      const a = (i / n) * Math.PI * 2
      ctx.fillStyle = `hsl(${(h0 + (i / n) * 360) % 360},100%,62%)`
      ctx.beginPath(); ctx.arc(Math.cos(a) * bw * 0.68, Math.sin(a) * 5 * sc, Math.max(1, 1.5 * sc), 0, Math.PI * 2); ctx.fill()
    }
  } else if (car.body === 'super' || car.body === 'sport') { // 바닥 조명(아르기닌 금빛 · 고르쉐 빨강)
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, bw * 0.8)
    const col = car.body === 'super' ? '251,191,36' : '239,68,68'
    gl.addColorStop(0, `rgba(${col},${car.body === 'super' ? 0.6 : 0.4})`); gl.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.8, 9 * sc, 0, 0, Math.PI * 2); ctx.fill()
  }
  // 깃발(안테나) — 몸통 뒤에 그려야 자연스럽다
  if (car.flag) {
    const ax = bw * 0.38, top = -bh * 3.1
    ctx.strokeStyle = '#374151'; ctx.lineWidth = Math.max(1, 1.2 * sc)
    ctx.beginPath(); ctx.moveTo(ax, -bh * 0.9); ctx.lineTo(ax, top); ctx.stroke()
    const wave = Math.sin(wall / 120) * 2 * sc
    const fw = 15 * sc, fh = 10 * sc
    ctx.fillStyle = flagT?.primary ?? main
    ctx.beginPath(); ctx.moveTo(ax, top); ctx.lineTo(ax + fw, top + wave); ctx.lineTo(ax + fw, top + fh + wave); ctx.lineTo(ax, top + fh); ctx.fill()
    if (flagT) emblem(ctx, flagT.key, ax + fw / 2, top + fh / 2 + wave / 2, fh * 0.36, '#FFFFFF')
  }
  // 바퀴
  const wW = bw * (car.body === 'suv' ? 0.24 : 0.22), wH = bh * (car.body === 'suv' ? 1.2 : 0.95)
  for (const side of [-1, 1]) {
    const wx = side < 0 ? -bw * 0.64 : bw * 0.42
    ctx.fillStyle = '#111827'
    ctx.beginPath(); ctx.roundRect(wx, -wH, wW, wH, Math.min(wW, wH) * 0.25); ctx.fill()
    if (car.wheels) {
      ctx.strokeStyle = wheelT?.secondary ?? accent; ctx.lineWidth = Math.max(1, 1.6 * sc)
      ctx.strokeRect(wx + wW * 0.12, -wH * 0.88, wW * 0.76, wH * 0.76)
      if (wheelT) emblem(ctx, wheelT.key, wx + wW / 2, -wH / 2, Math.min(wW, wH) * 0.34, '#F9FAFB')
    } else if (car.body === 'super' || car.body === 'sport') { // 9·10: 굵은 금(크롬) 림 + 색 캘리퍼 + 스포크
      const rc = car.body === 'super' ? '#FACC15' : '#F1F5F9'
      ctx.fillStyle = car.body === 'super' ? '#FACC15' : '#DC2626'; ctx.fillRect(wx + wW * 0.2, -wH * 0.62, wW * 0.6, wH * 0.18) // 캘리퍼
      ctx.strokeStyle = rc; ctx.lineWidth = Math.max(1.2, 2.2 * sc)
      ctx.strokeRect(wx + wW * 0.12, -wH * 0.9, wW * 0.76, wH * 0.8)
      ctx.lineWidth = Math.max(0.8, 1 * sc)
      for (let k2 = 1; k2 < 4; k2++) { const yy = -wH * 0.9 + (wH * 0.8 * k2) / 4; ctx.beginPath(); ctx.moveTo(wx + wW * 0.12, yy); ctx.lineTo(wx + wW * 0.88, yy); ctx.stroke() }
    } else if (car.body === 'lux' || car.body === 'coupe') { // 고급 휠(크롬)
      ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = Math.max(1, 1.4 * sc)
      ctx.strokeRect(wx + wW * 0.15, -wH * 0.85, wW * 0.7, wH * 0.7)
    }
  }
  // 몸통
  ctx.fillStyle = main
  ctx.strokeStyle = c.isMe ? '#E0A526' : '#FFFFFF'
  ctx.lineWidth = Math.max(1, 2 * sc)
  if (car.body === 'kart') {
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh * 1.05, bw, bh * 0.8, bh * 0.25); ctx.fill(); ctx.stroke()
    if (car.tail) ledTail(ctx, bw * 0.46, -bh * 0.31, bh * 0.2, tailC, c.fx === 'boost', wall)
    // 구단을 고르면 기본 카트에도 엠블럼(무료)
    if (bodyT) emblem(ctx, bodyT.key, 0, -bh * 0.65, bh * 0.3, '#FFFFFF')
  } else if (CLOSED(car.body)) {
    // ── 세단·SUV·쿠페: 뒤에서 본 지붕 있는 차 — 아래 몸통 + 위 유리 실내(헬멧이 비쳐 보임) ──
    const look = CLOSED_LOOK[car.body]!
    const suv = car.body === 'suv', coupe = look.round
    const { lowTop, lowBot, cabW, baseW } = look
    const roof = ROOF[car.body]
    // 몸통
    ctx.beginPath(); ctx.roundRect(-bw * baseW, -bh * lowTop, bw * baseW * 2, bh * (lowTop - lowBot), bh * (coupe ? 0.32 : 0.2)); ctx.fill(); ctx.stroke()
    // 실내(유리 + 기둥) — 2톤이면 지붕 색으로
    if (look.roofC) ctx.fillStyle = look.roofC
    ctx.beginPath()
    ctx.moveTo(-bw * (baseW - 0.04), -bh * lowTop); ctx.lineTo(bw * (baseW - 0.04), -bh * lowTop)
    if (coupe) { ctx.quadraticCurveTo(bw * cabW, -bh * roof, 0, -bh * roof); ctx.quadraticCurveTo(-bw * cabW, -bh * roof, -bw * (baseW - 0.04), -bh * lowTop) }
    else { ctx.lineTo(bw * cabW, -bh * roof); ctx.lineTo(-bw * cabW, -bh * roof) }
    ctx.closePath(); ctx.fill(); ctx.stroke()
    // 헬멧 — 유리 안
    drawHelmet(ctx, -bh * (lowTop + (roof - lowTop) * 0.28), bh * 0.36, capC, helmetGold, wall)
    // 뒷유리
    ctx.fillStyle = 'rgba(147,197,253,0.55)'
    const gi = 0.1 // 유리 안쪽 여백
    ctx.beginPath()
    ctx.moveTo(-bw * (baseW - 0.04 - gi), -bh * (lowTop + 0.06)); ctx.lineTo(bw * (baseW - 0.04 - gi), -bh * (lowTop + 0.06))
    if (coupe) { ctx.quadraticCurveTo(bw * (cabW - gi), -bh * (roof - 0.1), 0, -bh * (roof - 0.1)); ctx.quadraticCurveTo(-bw * (cabW - gi), -bh * (roof - 0.1), -bw * (baseW - 0.04 - gi), -bh * (lowTop + 0.06)) }
    else { ctx.lineTo(bw * (cabW - gi * 0.6), -bh * (roof - 0.1)); ctx.lineTo(-bw * (cabW - gi * 0.6), -bh * (roof - 0.1)) }
    ctx.closePath(); ctx.fill()
    if (car.cabin && (car.cabin.amb || car.cabin.glow || car.cabin.doll || car.cabin.charm)) { // 🪑 뒷유리로 보이는 실내 — 실내 옵션을 채울수록 단계별로 예뻐진다(lib/raceInterior.ts rearOf)
      const cb = car.cabin
      const glowC = cb.amb === 'rainbow' ? `hsl(${(wall / 40) % 360} 90% 62%)` : cb.amb ?? cb.glow ?? 'rgba(0,0,0,0)'
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(-bw * (baseW - 0.04 - gi), -bh * (lowTop + 0.06)); ctx.lineTo(bw * (baseW - 0.04 - gi), -bh * (lowTop + 0.06))
      if (coupe) { ctx.quadraticCurveTo(bw * (cabW - gi), -bh * (roof - 0.1), 0, -bh * (roof - 0.1)); ctx.quadraticCurveTo(-bw * (cabW - gi), -bh * (roof - 0.1), -bw * (baseW - 0.04 - gi), -bh * (lowTop + 0.06)) }
      else { ctx.lineTo(bw * (cabW - gi * 0.6), -bh * (roof - 0.1)); ctx.lineTo(-bw * (cabW - gi * 0.6), -bh * (roof - 0.1)) }
      ctx.closePath(); ctx.clip()
      const gg = ctx.createLinearGradient(0, -bh * lowTop, 0, -bh * roof)
      gg.addColorStop(0, glowC); gg.addColorStop(1, 'rgba(0,0,0,0)')
      const sco = cb.score ?? 0
      ctx.globalAlpha = Math.min(0.95, (cb.amb ? 0.45 : 0.3) + sco * 0.1 + Math.sin(wall / 500) * 0.1)
      ctx.fillStyle = gg; ctx.fillRect(-bw, -bh * roof, bw * 2, bh * (roof - lowTop + 0.1))
      ctx.globalAlpha = 1
      const gTop = -bh * (roof - 0.1), gL = -bw * (cabW - gi), gR = bw * (cabW - gi)
      if (sco >= 2) { // 2단계: 유리 윗단 빛 테
        ctx.strokeStyle = sco >= 5 ? `hsl(${(wall / 12) % 360} 100% 65%)` : glowC; ctx.lineWidth = Math.max(1, bh * (sco >= 4 ? 0.09 : 0.06))
        ctx.shadowColor = glowC; ctx.shadowBlur = bh * 0.5
        ctx.beginPath(); ctx.moveTo(gL, gTop + bh * 0.05); ctx.lineTo(gR, gTop + bh * 0.05); ctx.stroke(); ctx.shadowBlur = 0
      }
      if (sco >= 3 && sc > 0.3) { // 3단계: 꼬마전구 줄(번갈아 반짝)
        const n = 9
        for (let i = 0; i < n; i++) {
          const fx0 = gL + ((gR - gL) * (i + 0.5)) / n, fy = gTop + bh * (0.14 + Math.sin((i / (n - 1)) * Math.PI) * 0.1)
          const on = (Math.floor(wall / 350) + i) % 2 === 0
          ctx.fillStyle = sco >= 5 ? `hsl(${(i * 40 + wall / 10) % 360} 100% 70%)` : i % 2 ? '#FDE68A' : glowC
          ctx.globalAlpha = on ? 1 : 0.35
          ctx.beginPath(); ctx.arc(fx0, fy, Math.max(0.8, bh * 0.045), 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      if (sco >= 5 && sc > 0.3) for (let i = 0; i < 6; i++) { // 5단계: 유리 안 반짝이
        const ph = (wall / 1300 + i * 0.17) % 1, a = Math.sin(ph * Math.PI)
        const px = gL + (gR - gL) * ((i * 0.37 + 0.1) % 1), py = -bh * (lowTop + 0.1) - ph * bh * (roof - lowTop - 0.2), r = bh * 0.07 * a
        ctx.fillStyle = `rgba(255,251,235,${a})`
        ctx.beginPath(); ctx.moveTo(px, py - r * 2); ctx.lineTo(px + r * 0.5, py); ctx.lineTo(px, py + r * 2); ctx.lineTo(px - r * 0.5, py); ctx.closePath(); ctx.fill()
      }
      if (cb.charm && sc > 0.35) { // 지붕 장식 — 유리 위쪽에 매달려 흔들
        const cs = Math.max(6, bh * 0.36)
        ctx.save(); ctx.translate(bw * 0.12, gTop); ctx.rotate(Math.sin(wall / 260) * 0.3)
        ctx.strokeStyle = 'rgba(229,231,235,0.8)'; ctx.lineWidth = Math.max(0.6, bh * 0.02); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, bh * 0.22); ctx.stroke()
        ctx.font = `${cs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(cb.charm, 0, bh * 0.2); ctx.restore()
      }
      if (cb.doll && sc > 0.35) {
        const ds = Math.max(7, bh * 0.5)
        ctx.font = `${ds}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.save(); ctx.translate(-bw * (cabW - gi - 0.08), -bh * (lowTop + 0.06)); ctx.rotate(Math.sin(wall / 160) * 0.18)
        ctx.fillText(cb.doll, 0, 0); ctx.restore()
      }
      ctx.restore()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-bw * 0.18, -bh * (roof - 0.16), bw * 0.08, bh * 0.08) // 유리 반짝
    // SUV 지붕 가로대
    if (suv) { ctx.fillStyle = '#374151'; ctx.fillRect(-bw * cabW, -bh * (roof + 0.12), bw * cabW * 2, bh * 0.1) }
    // 후미등(세단 = 가로 막대, SUV = 세로, 쿠페 = 동그라미)
    ctx.fillStyle = c.fx === 'spin' || c.fx === 'stun' ? '#FCA5A5' : '#EF4444'
    const tl = -bh * (lowTop - 0.22)
    if (look.tail === 'dot') for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * bw * 0.4, tl, bh * 0.1, 0, Math.PI * 2); ctx.fill() }
    else if (look.tail === 'vert') for (const sx of [-1, 1]) ctx.fillRect(sx > 0 ? bw * (baseW - 0.12) : -bw * (baseW - 0.04), -bh * lowTop + bh * 0.08, bw * 0.08, bh * 0.42)
    else if (look.tail === 'full') ctx.fillRect(-bw * (baseW - 0.04), tl - bh * 0.05, bw * (baseW - 0.04) * 2, bh * 0.1)
    else if (look.tail === 'y') for (const sx of [-1, 1]) { // 아르기닌: 각진 Y자 후미등
      const x0 = sx * bw * (baseW - 0.04), x1 = sx * bw * (baseW - 0.2)
      ctx.beginPath(); ctx.moveTo(x0, tl - bh * 0.16); ctx.lineTo(x1, tl - bh * 0.02); ctx.lineTo(x0, tl + bh * 0.12); ctx.lineTo(x0, tl + bh * 0.04); ctx.lineTo(x1 + sx * bw * 0.06, tl - bh * 0.02); ctx.lineTo(x0, tl - bh * 0.08); ctx.closePath(); ctx.fill()
    }
    else { ctx.fillRect(-bw * 0.5, tl - bh * 0.06, bw * 0.22, bh * 0.13); ctx.fillRect(bw * 0.28, tl - bh * 0.06, bw * 0.22, bh * 0.13) }
    if (car.tail) ledTail(ctx, bw * (baseW - 0.06), -bh * (lowTop - 0.12), bh * 0.24, tailC, c.fx === 'boost', wall) // 트렁크 윗단(엠블럼 위)
    // 번호판(흰 판) + 엠블럼
    ctx.fillStyle = '#F8FAFC'; ctx.fillRect(-bw * 0.13, -bh * (lowBot + 0.3), bw * 0.26, bh * 0.2)
    ctx.fillStyle = accent; ctx.fillRect(-bw * 0.13, -bh * (lowBot + 0.3), bw * 0.26, bh * 0.04)
    if (look.lip) { ctx.fillStyle = '#111827'; ctx.fillRect(-bw * (baseW - 0.08), -bh * (lowTop + 0.04), bw * (baseW - 0.08) * 2, Math.max(1, bh * 0.07)) }
    if (look.chrome) { // 고급차: 트렁크 크롬(금) 띠 + 범퍼 크롬
      ctx.fillStyle = look.gold ? '#D4A017' : '#E5E7EB'
      ctx.fillRect(-bw * (baseW - 0.1), -bh * (lowTop - 0.08), bw * (baseW - 0.1) * 2, Math.max(1, bh * 0.05))
      ctx.fillRect(-bw * (baseW - 0.06), -bh * (lowBot + 0.06), bw * (baseW - 0.06) * 2, Math.max(1, bh * 0.04))
    }
    if (bodyT) emblem(ctx, bodyT.key, 0, -bh * (lowTop - 0.26), bh * 0.22, '#FFFFFF')
  } else {
    // 스포츠·슈퍼: 아래가 넓은 낮은 차체
    ctx.beginPath()
    ctx.moveTo(-bw * 0.56, -bh * 0.25); ctx.lineTo(bw * 0.56, -bh * 0.25)
    ctx.lineTo(bw * 0.44, -bh * 1.15); ctx.lineTo(-bw * 0.44, -bh * 1.15); ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 레이싱 줄무늬(가운데 엠블럼 양옆)
    ctx.fillStyle = accent
    ctx.fillRect(-bw * 0.3, -bh * 1.15, bw * 0.07, bh * 0.9)
    ctx.fillRect(bw * 0.23, -bh * 1.15, bw * 0.07, bh * 0.9)
    if (car.body === 'super') {
      // 후미등
      ctx.fillStyle = c.fx === 'spin' || c.fx === 'stun' ? '#FCA5A5' : '#EF4444'
      ctx.fillRect(-bw * 0.5, -bh * 0.75, bw * 0.15, bh * 0.18)
      ctx.fillRect(bw * 0.35, -bh * 0.75, bw * 0.15, bh * 0.18)
    }
    // 엠블럼(슈퍼카는 더 크게, 금테)
    if (bodyT) {
      if (car.body === 'super') { ctx.fillStyle = '#FACC15'; ctx.beginPath(); ctx.arc(0, -bh * 0.66, bh * 0.4, 0, Math.PI * 2); ctx.fill() }
      emblem(ctx, bodyT.key, 0, -bh * 0.66, bh * (car.body === 'super' ? 0.34 : 0.3), '#FFFFFF')
    }
  }
  // 헬멧(구단 모자 색) — 뒷날개보다 먼저(뒤에서 보면 날개가 더 가까움)
  if (!CLOSED(car.body)) drawHelmet(ctx, -bh * ROOF[car.body], bh * 0.5, capC, helmetGold, wall)
  if (car.body === 'kart' && car.cabin?.doll && sc > 0.35) { // 카트: 엔진통 위 인형
    ctx.font = `${Math.max(7, bh * 0.55)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.save(); ctx.translate(bw * 0.3, -bh * 1.05); ctx.rotate(Math.sin(wall / 160) * 0.18); ctx.fillText(car.cabin.doll, 0, 0); ctx.restore()
  }
  // 💨 듀얼 배기구(부품) — 굵은 크롬 머플러 + 구단 색 테 + 늘 일렁이는 파란 불꽃(가끔 '펑' 불똥). 없으면 아무것도 없다
  const exY = CLOSED(car.body) ? -bh * (CLOSED_LOOK[car.body]!.lowBot + 0.06) : -bh * 0.3
  if (car.exhaust) {
    const pr = bh * 0.19
    for (const ex of [-0.24, 0.24]) {
      const ex0 = bw * ex
      const fl = (0.95 + Math.sin(wall / 45 + ex * 9) * 0.3 + Math.sin(wall / 17) * 0.12) * bh
      const bf = ctx.createLinearGradient(0, exY, 0, exY + fl)
      bf.addColorStop(0, 'rgba(147,197,253,0.95)'); bf.addColorStop(0.5, 'rgba(99,102,241,0.6)'); bf.addColorStop(1, 'rgba(99,102,241,0)')
      ctx.fillStyle = bf; ctx.beginPath(); ctx.ellipse(ex0, exY + fl * 0.45, pr * 0.75, fl * 0.55, 0, 0, Math.PI * 2); ctx.fill()
      const mg = ctx.createRadialGradient(ex0 - pr * 0.3, exY - pr * 0.3, 0, ex0, exY, pr)
      mg.addColorStop(0, '#FFFFFF'); mg.addColorStop(0.5, '#CBD5E1'); mg.addColorStop(1, '#475569')
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(ex0, exY, pr, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = exhaustT?.secondary ?? accent; ctx.lineWidth = Math.max(1, pr * 0.28); ctx.stroke()
      ctx.fillStyle = '#0B0F17'; ctx.beginPath(); ctx.arc(ex0, exY, pr * 0.55, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(147,197,253,0.9)'; ctx.beginPath(); ctx.arc(ex0, exY, pr * 0.3, 0, Math.PI * 2); ctx.fill()
      const pop = (wall / 900 + (ex > 0 ? 0.5 : 0)) % 1 // 펑!
      if (pop < 0.18) for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + i * 0.17), d = pr * (1 + pop * 14)
        ctx.fillStyle = `rgba(253,224,71,${1 - pop / 0.18})`
        ctx.beginPath(); ctx.arc(ex0 + Math.cos(a) * d * 0.6, exY + Math.sin(a) * d, Math.max(0.8, pr * 0.16), 0, Math.PI * 2); ctx.fill()
      }
    }
  }
  // 뒷날개
  if (car.wing) {
    const ww = bw * 1.05, wy = -bh * Math.max(1.75, ROOF[car.body] + 0.3)
    ctx.fillStyle = '#1F2937'
    const legH = Math.min(bh * 0.6, -wy - bh * (CLOSED(car.body) ? ROOF[car.body] : 1.15))
    ctx.fillRect(-bw * 0.3, wy, bw * 0.06, legH); ctx.fillRect(bw * 0.24, wy, bw * 0.06, legH)
    ctx.fillStyle = wingT?.secondary ?? accent
    ctx.beginPath(); ctx.roundRect(-ww / 2, wy - bh * 0.32, ww, bh * 0.36, bh * 0.08); ctx.fill()
    if (wingT && sc > 0.4) {
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 ${Math.max(6, bh * 0.28)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(wingT.wordmark, 0, wy - bh * 0.14)
    }
  } else if (!CLOSED(car.body)) {
    ctx.fillStyle = '#1F2937'
    ctx.fillRect(-bw * 0.45, -bh * 1.45, bw * 0.9, bh * 0.22)
  }
  // 부스터 불꽃 — 배기구가 있으면 팀 색 불꽃
  if (c.fx === 'boost') {
    const fl = (0.7 + Math.sin(wall / 30) * 0.3) * bh
    const outer = car.exhaust ? exhaustT?.secondary ?? accent : '#F97316', inner = car.exhaust ? exhaustT?.primary ?? main : '#FDE047'
    const big = car.exhaust ? 1.8 : 1 // 배기구가 있으면 팀 색 불기둥
    const fw = car.exhaust ? 1.3 : 1
    for (const ex of car.exhaust ? [-0.24, 0.24] : [-0.2, 0.2]) {
      ctx.fillStyle = outer
      ctx.beginPath(); ctx.ellipse(bw * ex, exY + bh * 0.08 + fl * 0.3 * big, bw * 0.08 * fw, fl * 0.5 * big, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = inner
      ctx.beginPath(); ctx.ellipse(bw * ex, exY + bh * 0.08 + fl * 0.2 * big, bw * 0.04 * fw, fl * 0.3 * big, 0, 0, Math.PI * 2); ctx.fill()
    }
  }
  // 🛡️ 결재 도장 — 차를 감싼 하늘색 방울
  if (c.fx === 'shield') {
    const pulse = 1 + Math.sin(wall / 120) * 0.04
    ctx.fillStyle = 'rgba(56,189,248,0.18)'; ctx.strokeStyle = 'rgba(125,211,252,0.9)'; ctx.lineWidth = Math.max(1, 2 * sc)
    ctx.beginPath(); ctx.ellipse(0, -bh * 0.95, bw * 0.82 * pulse, bh * 1.7 * pulse, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
  if (!withName) return
  if (!c.isMe && sc > 0.25) {
    const fs = Math.max(9, Math.min(13, 11 * sc))
    const label = `${c.fx === 'stun' ? '📧 ' : c.fx === 'spin' ? '💫 ' : ''}${c.name}${c.fin !== null ? ' 🏁' : ''}`
    ctx.font = `600 ${fs}px sans-serif`
    const tw = ctx.measureText(label).width + 10
    const ty = y - bh * (car.wing || car.flag || car.aura ? 3.3 : 2.3) - fs
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath(); ctx.roundRect(x - tw / 2, ty - 2, tw, fs + 5, (fs + 5) / 2); ctx.fill()
    ctx.fillStyle = '#1F2933'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(label, x, ty)
  } else if (c.isMe && c.fx === 'stun') {
    ctx.font = `${22 * Math.min(1.4, sc)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('📧💫', x, y - bh * 2.2)
  }
}

// ── 레이더: 앞쪽을 위에서 본 작은 세로 띠(차 뒤 시점에서 피할 판단 돕기). 아래 = 뒤, 위 = 앞 ──
export const RADAR_AHEAD = 900
export const RADAR_BEHIND = 160
export function drawRadar(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, s: ChaseScene) {
  const span = RADAR_AHEAD + RADAR_BEHIND
  const px = (lat: number) => x0 + ((lat - ROAD_TOP) / (ROAD_BOT - ROAD_TOP)) * w
  const py = (z: number) => y0 + h - ((z - (s.me.x - RADAR_BEHIND)) / span) * h
  ctx.fillStyle = 'rgba(17,24,39,0.6)'
  ctx.beginPath(); ctx.roundRect(x0 - 4, y0 - 4, w + 8, h + 8, 6); ctx.fill()
  ctx.fillStyle = 'rgba(75,85,99,0.85)'
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = 'rgba(249,250,251,0.25)'; ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) { const lx = px((LANE_Y[i] + LANE_Y[i + 1]) / 2); ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, y0 + h); ctx.stroke() }
  const inside = (z: number) => z >= s.me.x - RADAR_BEHIND && z <= s.me.x + RADAR_AHEAD
  const RACE_LEN = lenOf(s.road)
  if (inside(RACE_LEN)) { ctx.fillStyle = '#F9FAFB'; ctx.fillRect(x0, py(RACE_LEN) - 1.5, w, 3) }
  // 갈림길 화단(초록 띠)
  if (s.road) for (const fk of s.road.forks) {
    const a = Math.max(fk.x0, s.me.x - RADAR_BEHIND), b = Math.min(fk.x1, s.me.x + RADAR_AHEAD)
    if (a >= b) continue
    ctx.fillStyle = '#22C55E'
    ctx.fillRect(px(MEDIAN_Y) - 2.5, py(b), 5, py(a) - py(b))
    if (fk.short) { // 지름길 쪽 노랑 테두리
      ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 1.5
      const xa = fk.risky === 0 ? x0 : px(MEDIAN_Y) + 3, xb = fk.risky === 0 ? px(MEDIAN_Y) - 3 : x0 + w
      ctx.strokeRect(xa + 1, py(b) + 1, xb - xa - 2, py(a) - py(b) - 2)
    }
  }
  // 레이더 표시는 효과별로: 빙글 = 주황 세모, 미끄덩 = 검정 타원, 감속 = 파랑 타원, 발판 = 노랑, 상자 = 하늘색
  for (const th of s.things) {
    if (!inside(th.x)) continue
    const cx = px(thingY(th, s.t ?? 0)), cy = py(th.x)
    const fx = th.kind === 'box' ? 'box' : HAZ[th.kind].fx
    ctx.fillStyle = fx === 'spin' ? '#F97316' : fx === 'slip' ? '#0B0F19' : fx === 'slow' ? '#3B82F6' : fx === 'boost' ? '#FACC15' : '#38BDF8'
    if (fx === 'slip' || fx === 'slow') { ctx.beginPath(); ctx.ellipse(cx, cy, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); if (fx === 'slip') { ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 1; ctx.stroke() } }
    else if (fx === 'spin') { ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3.5, cy + 3); ctx.lineTo(cx - 3.5, cy + 3); ctx.fill() }
    else ctx.fillRect(cx - 3, cy - 3, 6, 6)
  }
  for (const b of s.bananas) if (inside(b.x)) {
    if (b.kind === 'hurdle') { ctx.fillStyle = '#3B82F6'; ctx.fillRect(px(b.y) - 5, py(b.x) - 1.5, 10, 3); continue } // 🏃 허들 = 파란 가로 막대
    ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(px(b.y), py(b.x), 3, 0, Math.PI * 2); ctx.fill()
  }
  for (const c of s.cars) {
    if (!inside(c.x)) continue
    ctx.fillStyle = c.isMe ? '#E0A526' : teamOf(c.car.bodyTeam ?? c.car.team)?.primary ?? c.color
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = c.isMe ? 1.5 : 1
    ctx.beginPath(); ctx.roundRect(px(c.y) - 3.5, py(c.x) - 5, 7, 10, 2); ctx.fill(); ctx.stroke()
  }
}
