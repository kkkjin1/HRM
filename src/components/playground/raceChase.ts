// 🏎 퇴근 레이싱 — 차 바로 뒤에서 따라가는 3인칭(추격 시점) 그리기. canvas 2D, 순수 함수.
// 게임 좌표(x = 앞으로 간 거리, y = 도로 가로 위치)는 그대로 두고 원근 투영만 한다.
//   깊이 dz = x - 카메라 x,  배율 = FOCAL / dz,  화면 y = 지평선 + 카메라높이 × 배율
// 도로가 휘어 보이는 건 그림 효과일 뿐(모든 물체에 똑같이 적용) — 판정은 직선 도로 그대로다.

import { RACE_LEN, ROAD_BOT, ROAD_TOP, LANE_Y, type Banana, type Thing } from '@/lib/race'
import { logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import { slotTeam, type CarLook } from '@/lib/raceGarage'

export type ChaseCar = { id: string; x: number; y: number; fx: '' | 'spin' | 'stun' | 'slip' | 'boost'; fin: number | null; isMe: boolean; name: string; color: string; car: CarLook }
export type ChaseMail = { x: number; y: number; h: number }
export type ChaseScene = {
  w: number; h: number
  me: { x: number; y: number; v: number; fx: ChaseCar['fx'] }
  cars: ChaseCar[]
  things: Thing[] // 그릴 것만(먹은 상자 뺀 것)
  bananas: Banana[]
  mails: ChaseMail[]
  wall: number // 애니메이션용 시각(ms)
  shake: number // 0~1
}

const CENTER = (ROAD_TOP + ROAD_BOT) / 2
const HALF = (ROAD_BOT - ROAD_TOP) / 2
const CAM_BACK = 165 // 카메라가 내 차 뒤로 떨어진 거리(멀수록 원근이 완만 — 앞이 덜 작아진다)
const CAM_H = 70
const FOCAL = 410
const FAR = 2600
const SEG = 36

// 도로가 휘어 보이는 정도(카메라 위치에 따라 천천히 바뀜)
const curveAt = (z: number) => Math.sin(z / 1700) * 0.00009 + Math.sin(z / 610 + 1.3) * 0.00004

export function drawChase(ctx: CanvasRenderingContext2D, s: ChaseScene) {
  const { w, h } = s
  const horizon = Math.round(h * 0.34)
  const camZ = s.me.x - CAM_BACK
  const camLat = (s.me.y - CENTER) * 0.75 // 카메라가 내 차를 반쯤 따라 옆으로
  const k = curveAt(camZ)
  const shakeX = s.shake ? (Math.sin(s.wall / 23) * 6 * s.shake) : 0
  const proj = (z: number, lat: number, up = 0) => {
    const dz = Math.max(1, z - camZ)
    const sc = FOCAL / dz
    const bend = k * dz * dz
    return { sx: w / 2 + (lat - camLat + bend) * sc + shakeX, sy: horizon + (CAM_H - up) * sc, sc, dz }
  }

  // 하늘·먼 산·건물
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#F59E0B')
  sky.addColorStop(0.55, '#FDBA74')
  sky.addColorStop(1, '#FDE68A')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon + 1)
  const pan = (-k * 9e5 - camLat * 0.3) % w
  ctx.fillStyle = '#FB923C'
  ctx.beginPath(); ctx.arc(w * 0.72 + pan * 0.05, horizon - 18, 26, 0, Math.PI * 2); ctx.fill() // 퇴근길 노을 해
  ctx.fillStyle = '#9A6B4F'
  for (let i = -1; i < 9; i++) {
    const bx = ((i * 150 + pan * 0.6) % (w + 150) + w + 150) % (w + 150) - 75
    const bh = 22 + ((i * 37) % 30)
    ctx.fillRect(bx, horizon - bh, 46, bh)
    ctx.fillRect(bx + 54, horizon - bh * 0.6, 30, bh * 0.6)
  }
  ctx.fillStyle = '#FEF3C7'
  for (let i = -1; i < 9; i++) {
    const bx = ((i * 150 + pan * 0.6) % (w + 150) + w + 150) % (w + 150) - 75
    for (let r = 0; r < 3; r++) ctx.fillRect(bx + 8 + r * 12, horizon - 16, 5, 5)
  }

  // 땅·도로(먼 곳 → 가까운 곳)
  ctx.fillStyle = '#4D7C0F'
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
    quad(-HALF * 12, HALF * 12, band ? '#65A30D' : '#5B9A0C')
    quad(-HALF - 12, HALF + 12, band ? '#EF4444' : '#F9FAFB') // 연석
    quad(-HALF, HALF, band ? '#4B5563' : '#475569')
    // 차선(점선)
    if (band) for (let i = 0; i < 3; i++) {
      const lat = (LANE_Y[i] + LANE_Y[i + 1]) / 2 - CENTER
      quad(lat - 1.6, lat + 1.6, 'rgba(249,250,251,0.75)')
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
    void a; void b
  }

  // 바닥에 붙은 것(발판·기름)
  for (const th of s.things) {
    if (th.kind !== 'pad' && th.kind !== 'oil') continue
    const dz = th.x - camZ
    if (dz < 10 || dz > FAR) continue
    const lat = th.y - CENTER
    const near = proj(th.x - th.r, lat), far = proj(th.x + th.r, lat)
    const halfW = (th.kind === 'pad' ? 22 : 26) * near.sc
    if (th.kind === 'oil') {
      ctx.fillStyle = 'rgba(17,24,39,0.85)'
      ctx.beginPath(); ctx.ellipse((near.sx + far.sx) / 2, (near.sy + far.sy) / 2, halfW, Math.max(1, (near.sy - far.sy) / 2 + 1), 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(96,165,250,0.35)'
      ctx.beginPath(); ctx.ellipse((near.sx + far.sx) / 2 - halfW * 0.3, (near.sy + far.sy) / 2, halfW * 0.3, Math.max(1, (near.sy - far.sy) / 5), 0, 0, Math.PI * 2); ctx.fill()
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
    sprites.push({ z, draw: () => { ctx.font = `${px}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, p.sx, p.sy + px * 0.08) } })
  }
  for (const th of s.things) {
    if (th.kind === 'cone') emoji('🚧', th.x, th.y - CENTER, 30)
    else if (th.kind === 'box') {
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
  for (const b of s.bananas) emoji('🍌', b.x, b.y - CENTER, 24)
  for (const m of s.mails) emoji('📧', m.x, m.y - CENTER, 26, m.h)
  for (const c of s.cars) {
    const p = proj(c.x, c.y - CENTER)
    if (p.dz < 20 || p.dz > FAR) continue
    sprites.push({ z: c.x + (c.isMe ? 0.01 : 0), draw: () => drawKart(ctx, p.sx, p.sy, p.sc, c, s.wall) })
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

const BODY_SCALE = { kart: 1, sport: 1.14, super: 1.28 } as const

// 뒤에서 본 카트. car = 구단 도색 + 산 부품(엠블럼 휠·배기구·리어윙·깃발·차체). 구단을 안 골랐으면 팀원 색 기본 카트.
// 이름표는 남의 차만(내 차는 화면 아래 크게 보이니까). 차고 미리보기도 이 함수를 쓴다(withName = false).
export function drawKart(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, c: ChaseCar, wall: number, withName = true) {
  const car = c.car
  const team = teamOf(car.team) // 선호 구단(헬멧)
  const bodyT = teamOf(car.bodyTeam ?? car.team) // 차체 도색·엠블럼(선물 차체면 그 구단)
  const flagT = teamOf(slotTeam(car, car.flag)), wheelT = teamOf(slotTeam(car, car.wheels))
  const exhaustT = teamOf(slotTeam(car, car.exhaust)), wingT = teamOf(slotTeam(car, car.wing))
  const main = bodyT?.primary ?? c.color
  const accent = bodyT?.secondary ?? '#1F2937'
  const k = BODY_SCALE[car.body]
  const bw = 34 * sc * k, bh = 15 * sc * (car.body === 'kart' ? 1 : 0.92 * k)
  ctx.save()
  ctx.translate(x, y)
  if (c.fx === 'spin') ctx.rotate(Math.sin(wall / 50) * 0.9)
  else if (c.fx === 'slip') ctx.rotate(Math.sin(wall / 35) * 0.18)
  if (c.fx === 'stun') ctx.globalAlpha = 0.65
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.64, 4 * sc, 0, 0, Math.PI * 2); ctx.fill()
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
  const wW = bw * 0.22, wH = bh * 0.95
  for (const side of [-1, 1]) {
    const wx = side < 0 ? -bw * 0.64 : bw * 0.42
    ctx.fillStyle = '#111827'
    ctx.beginPath(); ctx.roundRect(wx, -wH, wW, wH, Math.min(wW, wH) * 0.25); ctx.fill()
    if (car.wheels) {
      ctx.strokeStyle = wheelT?.secondary ?? accent; ctx.lineWidth = Math.max(1, 1.6 * sc)
      ctx.strokeRect(wx + wW * 0.12, -wH * 0.88, wW * 0.76, wH * 0.76)
      if (wheelT) emblem(ctx, wheelT.key, wx + wW / 2, -wH / 2, Math.min(wW, wH) * 0.34, '#F9FAFB')
    }
  }
  // 몸통
  ctx.fillStyle = main
  ctx.strokeStyle = c.isMe ? '#E0A526' : '#FFFFFF'
  ctx.lineWidth = Math.max(1, 2 * sc)
  if (car.body === 'kart') {
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh * 1.05, bw, bh * 0.8, bh * 0.25); ctx.fill(); ctx.stroke()
    // 구단을 고르면 기본 카트에도 엠블럼(무료)
    if (bodyT) emblem(ctx, bodyT.key, 0, -bh * 0.65, bh * 0.3, '#FFFFFF')
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
  ctx.fillStyle = team?.cap ?? (c.isMe ? '#FDE68A' : '#F9FAFB')
  ctx.beginPath(); ctx.arc(0, -bh * (car.body === 'kart' ? 1.55 : 1.45), bh * 0.5, Math.PI, 0); ctx.fill()
  // 배기구
  if (car.exhaust) {
    ctx.fillStyle = '#D1D5DB'; ctx.strokeStyle = '#6B7280'; ctx.lineWidth = Math.max(1, sc)
    for (const ex of [-0.2, 0.2]) { ctx.beginPath(); ctx.arc(bw * ex, -bh * 0.28, bh * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  }
  // 뒷날개
  if (car.wing) {
    const ww = bw * 1.05, wy = -bh * 1.75
    ctx.fillStyle = '#1F2937'
    ctx.fillRect(-bw * 0.3, wy, bw * 0.06, bh * 0.6); ctx.fillRect(bw * 0.24, wy, bw * 0.06, bh * 0.6)
    ctx.fillStyle = wingT?.secondary ?? accent
    ctx.beginPath(); ctx.roundRect(-ww / 2, wy - bh * 0.32, ww, bh * 0.36, bh * 0.08); ctx.fill()
    if (wingT && sc > 0.4) {
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 ${Math.max(6, bh * 0.28)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(wingT.wordmark, 0, wy - bh * 0.14)
    }
  } else {
    ctx.fillStyle = '#1F2937'
    ctx.fillRect(-bw * 0.45, -bh * 1.45, bw * 0.9, bh * 0.22)
  }
  // 부스터 불꽃 — 배기구가 있으면 팀 색 불꽃
  if (c.fx === 'boost') {
    const fl = (0.7 + Math.sin(wall / 30) * 0.3) * bh
    const outer = car.exhaust ? exhaustT?.secondary ?? accent : '#F97316', inner = car.exhaust ? exhaustT?.primary ?? main : '#FDE047'
    for (const ex of [-0.2, 0.2]) {
      ctx.fillStyle = outer
      ctx.beginPath(); ctx.ellipse(bw * ex, -bh * 0.2 + fl * 0.3, bw * 0.08, fl * 0.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = inner
      ctx.beginPath(); ctx.ellipse(bw * ex, -bh * 0.2 + fl * 0.2, bw * 0.04, fl * 0.3, 0, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()
  if (!withName) return
  if (!c.isMe && sc > 0.25) {
    const fs = Math.max(9, Math.min(13, 11 * sc))
    const label = `${c.fx === 'stun' ? '📧 ' : c.fx === 'spin' ? '💫 ' : ''}${c.name}${c.fin !== null ? ' 🏁' : ''}`
    ctx.font = `600 ${fs}px sans-serif`
    const tw = ctx.measureText(label).width + 10
    const ty = y - bh * (car.wing || car.flag ? 3.3 : 2.3) - fs
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
  if (inside(RACE_LEN)) { ctx.fillStyle = '#F9FAFB'; ctx.fillRect(x0, py(RACE_LEN) - 1.5, w, 3) }
  for (const th of s.things) {
    if (!inside(th.x)) continue
    const cx = px(th.y), cy = py(th.x)
    ctx.fillStyle = th.kind === 'cone' ? '#F97316' : th.kind === 'oil' ? '#0B0F19' : th.kind === 'pad' ? '#FACC15' : '#38BDF8'
    if (th.kind === 'oil') { ctx.beginPath(); ctx.ellipse(cx, cy, 5, 3, 0, 0, Math.PI * 2); ctx.fill() }
    else if (th.kind === 'cone') { ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3.5, cy + 3); ctx.lineTo(cx - 3.5, cy + 3); ctx.fill() }
    else ctx.fillRect(cx - 3, cy - 3, 6, 6)
  }
  for (const b of s.bananas) if (inside(b.x)) { ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(px(b.y), py(b.x), 3, 0, Math.PI * 2); ctx.fill() }
  for (const c of s.cars) {
    if (!inside(c.x)) continue
    ctx.fillStyle = c.isMe ? '#E0A526' : teamOf(c.car.bodyTeam ?? c.car.team)?.primary ?? c.color
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = c.isMe ? 1.5 : 1
    ctx.beginPath(); ctx.roundRect(px(c.y) - 3.5, py(c.x) - 5, 7, 10, 2); ctx.fill(); ctx.stroke()
  }
}
