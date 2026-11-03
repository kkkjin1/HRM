// 🏎 퇴근 레이싱 — 차 바로 뒤에서 따라가는 3인칭(추격 시점) 그리기. canvas 2D, 순수 함수.
// 게임 좌표(x = 앞으로 간 거리, y = 도로 가로 위치)는 그대로 두고 원근 투영만 한다.
//   깊이 dz = x - 카메라 x,  배율 = FOCAL / dz,  화면 y = 지평선 + 카메라높이 × 배율
// 도로가 휘어 보이는 건 그림 효과일 뿐(모든 물체에 똑같이 적용) — 판정은 직선 도로 그대로다.

import { RACE_LEN, ROAD_BOT, ROAD_TOP, LANE_Y, type Banana, type Thing } from '@/lib/race'

export type ChaseCar = { id: string; x: number; y: number; fx: '' | 'spin' | 'stun' | 'slip' | 'boost'; fin: number | null; isMe: boolean; name: string; color: string }
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

// 뒤에서 본 카트: 바퀴 4개 + 몸통(팀원 색) + 헬멧 + 이름표
function drawKart(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, c: ChaseCar, wall: number) {
  const bw = 34 * sc, bh = 15 * sc
  ctx.save()
  ctx.translate(x, y)
  if (c.fx === 'spin') ctx.rotate(Math.sin(wall / 50) * 0.9)
  else if (c.fx === 'slip') ctx.rotate(Math.sin(wall / 35) * 0.18)
  if (c.fx === 'stun') ctx.globalAlpha = 0.65
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.62, 4 * sc, 0, 0, Math.PI * 2); ctx.fill()
  // 바퀴
  ctx.fillStyle = '#111827'
  ctx.fillRect(-bw * 0.62, -bh * 0.95, bw * 0.22, bh * 0.95)
  ctx.fillRect(bw * 0.4, -bh * 0.95, bw * 0.22, bh * 0.95)
  // 몸통
  ctx.fillStyle = c.color
  ctx.strokeStyle = c.isMe ? '#E0A526' : '#FFFFFF'
  ctx.lineWidth = Math.max(1, 2 * sc)
  ctx.beginPath(); ctx.roundRect(-bw / 2, -bh * 1.05, bw, bh * 0.8, bh * 0.25); ctx.fill(); ctx.stroke()
  // 뒷날개
  ctx.fillStyle = '#1F2937'
  ctx.fillRect(-bw * 0.45, -bh * 1.45, bw * 0.9, bh * 0.22)
  // 헬멧
  ctx.fillStyle = c.isMe ? '#FDE68A' : '#F9FAFB'
  ctx.beginPath(); ctx.arc(0, -bh * 1.55, bh * 0.5, Math.PI, 0); ctx.fill()
  // 배기·부스터 불꽃
  if (c.fx === 'boost') {
    const fl = (0.7 + Math.sin(wall / 30) * 0.3) * bh
    ctx.fillStyle = '#F97316'
    ctx.beginPath(); ctx.ellipse(-bw * 0.18, -bh * 0.2 + fl * 0.3, bw * 0.08, fl * 0.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(bw * 0.18, -bh * 0.2 + fl * 0.3, bw * 0.08, fl * 0.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FDE047'
    ctx.beginPath(); ctx.ellipse(-bw * 0.18, -bh * 0.2 + fl * 0.2, bw * 0.04, fl * 0.3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(bw * 0.18, -bh * 0.2 + fl * 0.2, bw * 0.04, fl * 0.3, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  // 이름표(내 차는 생략 — 화면 아래 크게 보이니까)
  if (!c.isMe && sc > 0.25) {
    const fs = Math.max(9, Math.min(13, 11 * sc))
    const label = `${c.fx === 'stun' ? '📧 ' : c.fx === 'spin' ? '💫 ' : ''}${c.name}${c.fin !== null ? ' 🏁' : ''}`
    ctx.font = `600 ${fs}px sans-serif`
    const tw = ctx.measureText(label).width + 10
    const ty = y - bh * 2.3 - fs
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath(); ctx.roundRect(x - tw / 2, ty - 2, tw, fs + 5, (fs + 5) / 2); ctx.fill()
    ctx.fillStyle = '#1F2933'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(label, x, ty)
  } else if (c.isMe && c.fx === 'stun') {
    ctx.font = `${22 * Math.min(1.4, sc)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('📧💫', x, y - bh * 2.2)
  }
}
