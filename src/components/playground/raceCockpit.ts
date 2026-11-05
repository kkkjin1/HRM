// 🏎 퇴근 레이싱 — 운전석 1인칭 그리기(실내 꾸미기 반영). canvas 2D, 도로·차는 drawChase(cam = COCKPIT_CAM)가 먼저 그리고 그 위에 덮는다.
// 부위마다 고른 구단 색·로고로 그린다(lib/raceInterior.ts). 차고 미리보기와 레이스가 같은 함수를 쓴다(보이는 그대로).
// 2026-11-05 목업(/mock/cockpit)에서 옮김.

import { H, W } from '@/lib/playground'
import { logoUrl, type TeamKey } from '@/lib/baseballGear'
import { ITEMS, V_BOOST, type Item } from '@/lib/race'
import { palOf, shade, type Equip, type Interior, type Pal, type SlotKey } from '@/lib/raceInterior'
import type { ChaseCam } from '@/components/playground/raceChase'

// 2026-11-05 시야 조정(목업 C안): 눈높이 32→55·지평선 0.36→0.28·대시보드 0.6→0.66 — 도로가 세로로 약 2배 보이게
export const COCKPIT_CAM: ChaseCam = { back: 6, h: 55, follow: 1, horizon: 0.28, focal: 330, hideMe: true, carMaxSc: 3.2 }
export const DASH_TOP = 0.66 // 대시보드 윗선(화면 높이 비율) — 낮출수록 도로가 더 보인다
// 운전석에선 레이더를 작게 오른쪽 위로(사이드미러 위)
export const COCKPIT_RADAR = { x: W - 96, y: 44, w: 56, h: 140 }

// me = 내 차(속도·아이템), others = 다른 차(거울에 비침), steer = 부드럽게 따라가는 조향(-1~1), total = 참가 대수
export type CockpitOv = { me: { x: number; y: number; v: number; item: Item | null }; steer: number; others: { x: number; y: number; color: string }[]; rank: number; total: number; wall: number }
type Ov = CockpitOv
const kmh = (v: number) => Math.round(v / 4)
const imgs = new Map<string, HTMLImageElement>()
function img(src: string) {
  let i = imgs.get(src)
  if (!i) { i = new Image(); i.src = src; imgs.set(src, i) }
  return i.complete && i.naturalWidth > 0 ? i : null
}
// 구단 로고(없으면 H) — 흰 원 배지 위에
function badge(ctx: CanvasRenderingContext2D, team: TeamKey | null, cx: number, cy: number, r: number, pal: Pal, ring = true) {
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  if (ring) { ctx.strokeStyle = pal.accent; ctx.lineWidth = Math.max(1, r * 0.14); ctx.stroke() }
  const lg = team ? img(logoUrl(team)) : null
  if (lg) ctx.drawImage(lg, cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44)
  else { ctx.fillStyle = pal.main; ctx.font = `900 ${Math.round(r * 0.9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', cx, cy + 1) }
}
function emojiAt(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, px: number) {
  ctx.font = `${px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y)
}

// n = 부위별 (종류, 구단). 부위마다 색·로고를 따로 쓴다. hl = 강조할 부위(꾸미기 중 고른 부위)
export function drawCockpit(ctx: CanvasRenderingContext2D, n: Equip, o: Ov, hl: SlotKey | null = null, dashTop = DASH_TOP) {
  const w = W, h = H
  const L = (k: SlotKey): Interior => ({ team: n[k].team, wheel: n.wheel.v, dash: n.dash.v, screen: n.screen.v, charm: n.charm.v, frame: n.frame.v, doll: n.doll.v, hands: n.hands.v })
  const it = L('dash')
  const pal = palOf(n.dash.team) // 대시보드 구단 = 지붕·기둥·거울 틀·송풍구 색
  const top = h * dashTop
  // 지붕·A필러
  const pillar = shade(pal.dash, -0.35)
  ctx.fillStyle = pillar
  ctx.fillRect(0, 0, w, 12)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(80, 0); ctx.lineTo(34, top + 2); ctx.lineTo(0, top + 14); ctx.fill()
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - 80, 0); ctx.lineTo(w - 34, top + 2); ctx.lineTo(w, top + 14); ctx.fill()
  // 룸미러 + 장식
  const mx = w / 2 - 95, my = 16, mw = 190, mh = 38
  const fs: FrameStyle = { v: n.frame.v, team: n.frame.team, pal: palOf(n.frame.team), base: pillar }
  mirror(ctx, mx, my, mw, mh, o, 0, fs)
  drawCharm(ctx, L('charm'), palOf(n.charm.team), w / 2 + 70, my + mh + 2, o)

  // ── 대시보드(종류별 질감, 색은 구단) ──
  const dashPath = () => { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, top + 26); ctx.quadraticCurveTo(w / 2, top - 46, w, top + 26); ctx.lineTo(w, h); ctx.closePath() }
  const dg = ctx.createLinearGradient(0, top - 30, 0, h)
  dg.addColorStop(0, shade(pal.dash, 0.18)); dg.addColorStop(0.35, pal.dash); dg.addColorStop(1, shade(pal.dash, -0.5))
  ctx.fillStyle = dg; dashPath(); ctx.fill()
  ctx.save(); dashPath(); ctx.clip()
  if (it.dash === 'carbon') {
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    for (let x = -h; x < w; x += 9) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke() }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    for (let x = 0; x < w + h; x += 9) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x - h, 0); ctx.stroke() }
  } else if (it.dash === 'wood') {
    const by = top + 34
    const wg = ctx.createLinearGradient(0, by - 30, 0, by + 30); wg.addColorStop(0, '#B45309'); wg.addColorStop(1, '#78350F')
    ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(0, by + 26); ctx.quadraticCurveTo(w / 2, by - 44, w, by + 26); ctx.lineTo(w, by + 48); ctx.quadraticCurveTo(w / 2, by - 22, 0, by + 48); ctx.fill()
    ctx.strokeStyle = 'rgba(253,230,138,0.25)'; ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, by + 30 + i * 5); ctx.quadraticCurveTo(w / 2, by - 40 + i * 5, w, by + 30 + i * 5); ctx.stroke() }
  }
  ctx.restore()
  if (it.dash === 'stitch' || it.dash === 'wood') {
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 5])
    ctx.beginPath(); ctx.moveTo(0, top + 40); ctx.quadraticCurveTo(w / 2, top - 30, w, top + 40); ctx.stroke(); ctx.setLineDash([])
  }
  // 위 테두리 포인트 선(모든 종류)
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(0, top + 26); ctx.quadraticCurveTo(w / 2, top - 46, w, top + 26); ctx.stroke()

  // 사이드미러
  mirror(ctx, 40, top + 4, 120, 46, o, -1, fs)
  mirror(ctx, w - 160, top + 4, 120, 46, o, 1, fs)
  // 송풍구
  for (const vx of [w / 2 - 330, w / 2 - 270]) {
    ctx.fillStyle = shade(pal.dash, -0.5); ctx.beginPath(); ctx.roundRect(vx, top + 44, 44, 24, 8); ctx.fill()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(vx + 4, top + 44 + i * 6); ctx.lineTo(vx + 40, top + 44 + i * 6); ctx.stroke() }
  }
  // 인형(대시보드 위, 왼쪽)
  drawDoll(ctx, L('doll'), palOf(n.doll.team), w / 2 + 120, top - 10, o)
  // 가운데 화면
  drawScreen(ctx, L('screen'), palOf(n.screen.team), w / 2 + 175, top + 18, 170, 84, o)
  // 계기판(핸들 왼쪽 — 핸들 가운데 로고가 보이게 비켜 둠)
  const gx = w / 2 - 175, gy = top + 98
  ctx.fillStyle = shade(pal.dash, -0.6); ctx.beginPath(); ctx.ellipse(gx, gy + 2, 52, 40, 0, Math.PI, Math.PI * 2); ctx.fill()
  gauge(ctx, gx, gy, 34, o.me.v, pal.accent)
  if (o.me.v > V_BOOST - 60) { ctx.fillStyle = '#FDBA74'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('🚀 BOOST', gx, gy - 44) }
  // 핸들 + 손
  drawWheel(ctx, L('wheel'), palOf(n.wheel.team), o, L('hands'), palOf(n.hands.team))
  if (hl) drawHighlight(ctx, n, hl, o)
}

function drawWheel(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, o: Ov, hIt: Interior, hPal: Pal) {
  const w = W, h = H
  ctx.save(); ctx.translate(w / 2, h + 24); ctx.rotate(o.steer * 0.55)
  ctx.lineCap = 'round'
  let R = 128, handY = -70, handX = R - 4
  const stroke = (lw: number, color: string, path: () => void) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); path(); ctx.stroke() }
  if (it.wheel === 'toy') {
    // 동글 장난감 — 아주 두툼한 고리 + 굵은 살 + 큰 버튼
    const ring = () => ctx.arc(0, 0, R, Math.PI * 1.04, Math.PI * 1.96)
    stroke(34, shade(pal.main, -0.35), ring); stroke(28, pal.main, ring); stroke(6, 'rgba(255,255,255,0.28)', () => ctx.arc(0, 0, R + 6, Math.PI * 1.12, Math.PI * 1.5))
    stroke(22, pal.main, () => { ctx.moveTo(-R + 14, -40); ctx.lineTo(-30, -44); ctx.moveTo(R - 14, -40); ctx.lineTo(30, -44) })
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.arc(0, -40, 40, 0, Math.PI * 2); ctx.fill()
    badge(ctx, it.team, 0, -42, 25, pal)
    ctx.fillStyle = pal.accent
    for (const a of [0.2, 0.4, 0.6, 0.8]) { ctx.beginPath(); ctx.arc(Math.cos(Math.PI * (1 + a)) * R, Math.sin(Math.PI * (1 + a)) * R, 4, 0, Math.PI * 2); ctx.fill() }
  } else if (it.wheel === 'race') {
    // 레이싱 — D컷 + 12시 포인트 + 작은 허브
    const arcs = () => { ctx.arc(0, 0, R, Math.PI * 1.06, Math.PI * 1.36); ctx.moveTo(Math.cos(Math.PI * 1.64) * R, Math.sin(Math.PI * 1.64) * R); ctx.arc(0, 0, R, Math.PI * 1.64, Math.PI * 1.94) }
    const flat = () => { ctx.moveTo(Math.cos(Math.PI * 1.36) * R, Math.sin(Math.PI * 1.36) * R); ctx.lineTo(Math.cos(Math.PI * 1.64) * R, Math.sin(Math.PI * 1.64) * R) }
    stroke(22, shade(pal.main, 0.3), arcs); stroke(22, shade(pal.main, 0.3), flat)
    stroke(17, '#111827', arcs); stroke(17, '#111827', flat)
    stroke(5, pal.accent, () => { ctx.moveTo(0, -R - 10); ctx.lineTo(0, -R + 9) })
    stroke(12, '#111827', () => { ctx.moveTo(-R + 10, -44); ctx.lineTo(-30, -44); ctx.moveTo(R - 10, -44); ctx.lineTo(30, -44) })
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(0, -40, 32, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = pal.main; ctx.lineWidth = 4; ctx.stroke()
    badge(ctx, it.team, 0, -40, 20, pal, false)
  } else {
    // 큰 버스 핸들 — 크고 얇게, 살 여러 개
    R = 172; handY = -112; handX = R - 30
    const ring = () => ctx.arc(0, 0, R, Math.PI * 1.08, Math.PI * 1.92)
    stroke(14, shade(pal.main, -0.4), ring); stroke(10, shade(pal.main, 0.35), ring)
    for (const a of [1.25, 1.5, 1.75]) stroke(7, shade(pal.main, 0.15), () => { ctx.moveTo(0, -40); ctx.lineTo(Math.cos(Math.PI * a) * R, Math.sin(Math.PI * a) * R) })
    ctx.fillStyle = shade(pal.main, 0.15); ctx.beginPath(); ctx.arc(0, -40, 30, 0, Math.PI * 2); ctx.fill()
    badge(ctx, it.team, 0, -40, 20, pal)
  }
  for (const sx of [-1, 1]) drawHand(ctx, hIt, hPal, sx * handX, handY, sx)
  ctx.restore()
}

function drawHand(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, sx: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(sx * 0.45)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5
  if (it.hands === 'mitt') {
    // 야구 글러브 — 갈색 큰 장갑 + 구단 색 끈 + 로고 패치
    ctx.fillStyle = '#9A5B2A'; ctx.beginPath(); ctx.ellipse(0, -4, 22, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -26); ctx.lineTo(i * 7, -14); ctx.stroke() }
    badge(ctx, it.team, 0, 4, 8, pal)
  } else if (it.hands === 'mitten') {
    // 벙어리장갑 — 구단 색 + 흰 털 소매
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.ellipse(0, -6, 17, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(-sx * 14, -2, 7, 10, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F8FAFC'; ctx.beginPath(); ctx.roundRect(-16, 10, 32, 10, 5); ctx.fill()
    ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(0, -8, 4, 0, Math.PI * 2); ctx.fill()
  } else {
    // 운전 장갑 — 포인트 색 + 손등 로고
    ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.ellipse(0, 0, 16, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.roundRect(-14, 12, 28, 8, 3); ctx.fill()
    badge(ctx, it.team, 0, -2, 7, pal, false)
  }
  ctx.restore()
}

function drawScreen(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, dx: number, dy: number, dw: number, dh: number, o: Ov) {
  const item = o.me.item ? ITEMS[o.me.item].emoji : ''
  const rankTxt = `${o.rank}등`
  if (it.screen === 'tv') {
    // 레트로 TV — 구단 색 두꺼운 틀 + 안테나
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(dx + dw / 2, dy - 4); ctx.lineTo(dx + dw / 2 - 26, dy - 26); ctx.moveTo(dx + dw / 2, dy - 4); ctx.lineTo(dx + dw / 2 + 22, dy - 28); ctx.stroke()
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.roundRect(dx - 8, dy - 6, dw + 16, dh + 12, 18); ctx.fill()
    ctx.fillStyle = '#0F172A'; ctx.beginPath(); ctx.roundRect(dx + 4, dy + 4, dw - 40, dh - 8, 14); ctx.fill()
    badge(ctx, it.team, dx + 4 + (dw - 40) / 2, dy + dh / 2 - 8, 22, pal)
    ctx.fillStyle = '#FDE68A'; ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(rankTxt, dx + 4 + (dw - 40) / 2, dy + dh - 8)
    ctx.fillStyle = pal.accent; for (const yy of [dy + 18, dy + 38]) { ctx.beginPath(); ctx.arc(dx + dw - 16, yy, 6, 0, Math.PI * 2); ctx.fill() }
    if (item) emojiAt(ctx, item, dx + dw - 16, dy + 62, 16)
    return
  }
  ctx.fillStyle = '#020617'; ctx.beginPath(); ctx.roundRect(dx - 4, dy - 4, dw + 8, dh + 8, 12); ctx.fill()
  if (it.screen === 'led') { drawLed(ctx, it.team, pal, dx, dy, dw, dh, o, item); return }
  if (it.screen === 'cheer') {
    // 응원 띠 — 구단 색 바탕에 글씨가 흐름
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 9); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 9); ctx.clip()
    const msg = `${pal.word} 화이팅! ★ `
    ctx.font = '900 18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF'
    const tw = ctx.measureText(msg).width
    const off = (o.wall / 20) % tw
    for (let x = dx - off; x < dx + dw; x += tw) ctx.fillText(msg, x, dy + 24)
    ctx.restore()
    badge(ctx, it.team, dx + 26, dy + 60, 16, pal)
    ctx.fillStyle = '#FDE68A'; ctx.font = '900 18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(rankTxt, dx + 50, dy + 61)
    if (item) emojiAt(ctx, item, dx + dw - 22, dy + 61, 18)
    return
  }
  // 기본 화면
  const sg = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh); sg.addColorStop(0, '#0F172A'); sg.addColorStop(1, shade(pal.main, -0.5))
  ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 9); ctx.fill()
  badge(ctx, it.team, dx + 40, dy + 42, 28, pal)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#FDE68A'; ctx.font = '900 24px sans-serif'; ctx.fillText(rankTxt, dx + 82, dy + 38)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 10px sans-serif'; ctx.fillText(`/ ${o.total}대`, dx + 128, dy + 38)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(dx + 82, dy + 46, 30, 30, 7); ctx.stroke()
  if (item) emojiAt(ctx, item, dx + 97, dy + 62, 20)
}

function drawCharm(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, o: Ov) {
  if (it.charm === 'none') return
  const sw = Math.sin(o.wall / 260) * 0.25 + o.steer * -0.35
  ctx.save(); ctx.translate(x, y); ctx.rotate(sw)
  ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.stroke()
  if (it.charm === 'pennant') {
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.moveTo(-16, 18); ctx.lineTo(16, 18); ctx.lineTo(0, 56); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.stroke()
    badge(ctx, it.team, 0, 30, 9, pal, false)
  } else {
    emojiAt(ctx, it.charm === 'ball' ? '⚾' : '⭐', 0, 34, 28)
    badge(ctx, it.team, 10, 44, 8, pal)
  }
  ctx.restore()
}

function drawDoll(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, o: Ov) {
  if (it.doll === 'none') return
  const e = it.doll === 'dog' ? '🐶' : it.doll === 'penguin' ? '🐧' : '🦆'
  // 받침 + 스프링
  ctx.fillStyle = shade(pal.dash, -0.5); ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 2
  ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(x + (i % 2 ? 4 : -4), y + 4 - i * 2.4); ctx.stroke()
  // 고개가 까딱
  ctx.save(); ctx.translate(x, y - 12); ctx.rotate(Math.sin(o.wall / 140) * 0.22 + o.steer * -0.3)
  emojiAt(ctx, e, 0, -14, 34)
  // 구단 모자
  ctx.fillStyle = pal.main; ctx.beginPath(); ctx.ellipse(0, -28, 15, 10, 0, Math.PI, Math.PI * 2); ctx.fill()
  ctx.fillRect(-2, -29, 20, 3)
  badge(ctx, it.team, 0, -33, 5, pal, false)
  ctx.restore()
}

// 거울: side 0 = 룸미러(뒤 전체), -1 = 왼쪽, 1 = 오른쪽
// 거울 테두리 — 기본(차 안 색) / 크롬 / 구단 줄무늬 / 네온(포인트 색 빛) / 금테(+로고). 룸미러·양쪽 사이드미러에 똑같이
type FrameStyle = { v: string; team: TeamKey | null; pal: Pal; base: string }
function mirror(ctx: CanvasRenderingContext2D, x: number, y: number, mw: number, mh: number, o: Ov, side: -1 | 0 | 1, fs: FrameStyle) {
  const fx = x - 5, fy = y - 5, fw = mw + 10, fh = mh + 10
  const rr = () => { ctx.beginPath(); ctx.roundRect(fx, fy, fw, fh, 13) }
  if (fs.v === 'chrome') {
    const g = ctx.createLinearGradient(fx, fy, fx, fy + fh); g.addColorStop(0, '#F8FAFC'); g.addColorStop(0.45, '#94A3B8'); g.addColorStop(0.55, '#CBD5E1'); g.addColorStop(1, '#475569')
    ctx.fillStyle = g; rr(); ctx.fill()
    ctx.strokeStyle = fs.pal.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x - 2, y - 2, mw + 4, mh + 4, 10); ctx.stroke() // 구단 색 가는 테
  } else if (fs.v === 'stripe') {
    ctx.save(); rr(); ctx.clip()
    ctx.fillStyle = fs.pal.main; ctx.fillRect(fx, fy, fw, fh)
    ctx.strokeStyle = fs.pal.accent; ctx.lineWidth = 4
    for (let k = -fh; k < fw; k += 11) { ctx.beginPath(); ctx.moveTo(fx + k, fy + fh); ctx.lineTo(fx + k + fh, fy); ctx.stroke() }
    ctx.restore()
  } else if (fs.v === 'neon') {
    ctx.fillStyle = '#0B0F19'; rr(); ctx.fill()
    ctx.save(); ctx.shadowColor = fs.pal.accent; ctx.shadowBlur = 12 + Math.sin(o.wall / 300) * 4
    ctx.strokeStyle = fs.pal.accent; ctx.lineWidth = 2.5; rr(); ctx.stroke(); ctx.restore()
  } else if (fs.v === 'gold') {
    const g = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh); g.addColorStop(0, '#FDE68A'); g.addColorStop(0.35, '#D4A017'); g.addColorStop(0.6, '#FEF3C7'); g.addColorStop(1, '#A16207')
    ctx.fillStyle = g; rr(); ctx.fill()
  } else { ctx.fillStyle = fs.base; rr(); ctx.fill() }
  const g = ctx.createLinearGradient(0, y, 0, y + mh); g.addColorStop(0, '#BAE6FD'); g.addColorStop(0.5, '#94A3B8'); g.addColorStop(1, '#475569')
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, mw, mh, 9); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, mw, mh, 9); ctx.clip()
  for (const k of o.others) {
    const back = o.me.x - k.x, dy = k.y - o.me.y
    if (back < -30 || back > 420) continue
    if (side === -1 && dy > -8) continue
    if (side === 1 && dy < 8) continue
    const sc = Math.max(0.35, 1 - Math.max(0, back) / 480)
    const px = side === 0 ? x + mw / 2 - dy * 0.5 : x + mw / 2 - side * 20 + side * Math.min(mw / 2 - 14, Math.abs(dy) * 0.2)
    ctx.fillStyle = k.color
    ctx.beginPath(); ctx.roundRect(px - 10 * sc, y + mh - 10 - 18 * sc, 20 * sc, 13 * sc, 3); ctx.fill()
  }
  // 유리 반사광
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(x + mw * 0.15, y); ctx.lineTo(x + mw * 0.3, y); ctx.lineTo(x + mw * 0.12, y + mh); ctx.lineTo(x - 2, y + mh); ctx.fill()
  ctx.restore()
  if ((fs.v === 'gold' || fs.v === 'stripe') && side === 0) badge(ctx, fs.team, x + mw + 1, y + mh / 2, 11, fs.pal)
}

function gauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: number, accent: string) {
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.stroke()
  const p = Math.min(1, v / V_BOOST)
  ctx.strokeStyle = p > 0.75 ? '#F97316' : accent
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * (1 + p)); ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = '900 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(kmh(v)), cx, cy - 4)
  ctx.font = '700 8px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('km/h', cx, cy + 6)
}

// ── 부위 위치(운전석 그림 좌표) — 강조 그리기와 미리보기 클릭 판정이 같이 쓴다 ──
const TOP = H * DASH_TOP
const wheelGeom = (v: string) => (v === 'bus' ? { R: 172, handX: 142, handY: -112 } : { R: 128, handX: 124, handY: -70 })
function handSpots(n: Equip) { const g = wheelGeom(n.wheel.v); return [-1, 1].map(sx => ({ x: W / 2 + sx * g.handX, y: H + 24 + g.handY })) }
export function hitSlot(n: Equip, x: number, y: number): SlotKey | null {
  if (x >= W / 2 + 165 && x <= W / 2 + 355 && y >= TOP + 8 && y <= TOP + 112) return 'screen'
  if ((x >= W / 2 - 100 && x <= W / 2 + 100 && y >= 10 && y <= 58) || (y >= TOP - 2 && y <= TOP + 56 && (x <= 166 || x >= W - 166))) return 'frame'
  if (Math.hypot(x - (W / 2 + 70), y - 86) < 34) return 'charm'
  if (Math.hypot(x - (W / 2 + 120), y - (TOP - 40)) < 30) return 'doll'
  if (handSpots(n).some(p => Math.hypot(x - p.x, y - p.y) < 30)) return 'hands'
  const g = wheelGeom(n.wheel.v), d = Math.hypot(x - W / 2, y - (H + 24))
  if (y > TOP - 10 && (Math.abs(d - g.R) < 22 || d < 75)) return 'wheel'
  if (y > TOP - 10 && y <= H) return 'dash'
  return null
}
function drawHighlight(ctx: CanvasRenderingContext2D, n: Equip, k: SlotKey, o: Ov) {
  const a = 0.55 + Math.sin(o.wall / 180) * 0.35
  ctx.save()
  ctx.strokeStyle = `rgba(250,204,21,${a})`; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.shadowColor = 'rgba(250,204,21,0.8)'; ctx.shadowBlur = 10
  ctx.beginPath()
  if (k === 'screen') ctx.roundRect(W / 2 + 163, TOP + 6, 194, 108, 14)
  else if (k === 'charm') ctx.arc(W / 2 + 70, 86, 32, 0, Math.PI * 2)
  else if (k === 'frame') { ctx.roundRect(W / 2 - 104, 7, 208, 56, 15); ctx.roundRect(31, TOP - 5, 138, 64, 15); ctx.roundRect(W - 169, TOP - 5, 138, 64, 15) }
  else if (k === 'doll') ctx.arc(W / 2 + 120, TOP - 38, 28, 0, Math.PI * 2)
  else if (k === 'hands') for (const p of handSpots(n)) { ctx.moveTo(p.x + 28, p.y); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2) }
  else if (k === 'wheel') { const g = wheelGeom(n.wheel.v); ctx.arc(W / 2, H + 24, g.R + 24, Math.PI * 1.02, Math.PI * 1.98) }
  else { ctx.moveTo(4, TOP + 22); ctx.quadraticCurveTo(W / 2, TOP - 52, W - 4, TOP + 22) }
  ctx.stroke()
  ctx.restore()
}

// ── 🔆 전광판: 글씨를 작은 버퍼에 그린 뒤 픽셀마다 LED 점으로 ──
let ledBuf: HTMLCanvasElement | null = null
function drawLed(ctx: CanvasRenderingContext2D, team: TeamKey | null, pal: Pal, dx: number, dy: number, dw: number, dh: number, o: Ov, item: string) {
  // 금속 베젤 + 볼트
  const bz = ctx.createLinearGradient(dx, dy - 8, dx, dy + dh + 8); bz.addColorStop(0, '#4B5563'); bz.addColorStop(0.5, '#1F2937'); bz.addColorStop(1, '#111827')
  ctx.fillStyle = bz; ctx.beginPath(); ctx.roundRect(dx - 8, dy - 8, dw + 16, dh + 16, 10); ctx.fill()
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(dx - 8, dy - 8, dw + 16, dh + 16, 10); ctx.stroke()
  ctx.fillStyle = '#9CA3AF'
  for (const [bx, by] of [[dx - 3, dy - 3], [dx + dw + 3, dy - 3], [dx - 3, dy + dh + 3], [dx + dw + 3, dy + dh + 3]]) { ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = '#05070A'; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 4); ctx.fill()
  // 점 판
  const P = 3, cellW = 34 // 오른쪽 아이템 칸
  const cols = Math.floor((dw - cellW - 6) / P), rows = Math.floor((dh - 6) / P)
  if (!ledBuf) ledBuf = document.createElement('canvas')
  if (ledBuf.width !== cols || ledBuf.height !== rows) { ledBuf.width = cols; ledBuf.height = rows }
  const b = ledBuf.getContext('2d', { willReadFrequently: true })!
  b.clearRect(0, 0, cols, rows)
  b.textBaseline = 'top'; b.textAlign = 'left'
  // 위 줄: 구단 이름이 흐른다
  b.font = '700 10px Arial, sans-serif'; b.fillStyle = pal.accent
  const msg = `${pal.word} ★ `
  const tw = Math.ceil(b.measureText(msg).width)
  const off = Math.floor(o.wall / 70) % tw
  for (let x = -off; x < cols; x += tw) b.fillText(msg, x, 1)
  // 아래 줄: 순위(호박색)
  b.font = '700 11px Arial, sans-serif'; b.fillStyle = '#FBBF24'
  b.fillText(`${o.rank}등`, 2, 13)
  b.fillStyle = '#F87171'; b.fillText(`/${o.total}`, 2 + Math.ceil(b.measureText(`${o.rank}등`).width) + 2, 13)
  const px = b.getImageData(0, 0, cols, rows).data
  const ox = dx + 3 + P / 2, oy = dy + 3 + P / 2
  // 꺼진 점 한 번에
  ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.beginPath()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (px[(r * cols + c) * 4 + 3] < 110) { ctx.moveTo(ox + c * P + 1.1, oy + r * P); ctx.arc(ox + c * P, oy + r * P, 1.1, 0, Math.PI * 2) }
  ctx.fill()
  // 켜진 점: 번짐 + 알맹이
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = (r * cols + c) * 4
    if (px[i + 3] < 110) continue
    const col = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`
    ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + c * P, oy + r * P, 2.3, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(ox + c * P, oy + r * P, 1.25, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  // 아이템 칸 + 구단 로고(작게)
  const cx = dx + dw - cellW + 2
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 3, dy + 6); ctx.lineTo(cx - 3, dy + dh - 6); ctx.stroke()
  badge(ctx, team, cx + cellW / 2 - 3, dy + 20, 11, pal)
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx + 2, dy + 40, cellW - 10, cellW - 10, 5); ctx.stroke()
  if (item) emojiAt(ctx, item, cx + cellW / 2 - 3, dy + 52, 16)
}
