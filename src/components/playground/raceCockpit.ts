// 🏎 퇴근 레이싱 — 운전석 1인칭 그리기(실내 꾸미기 반영). canvas 2D, 도로·차는 drawChase(cam = COCKPIT_CAM)가 먼저 그리고 그 위에 덮는다.
// 부위마다 고른 구단 색·로고로 그린다(lib/raceInterior.ts). 차고 미리보기와 레이스가 같은 함수를 쓴다(보이는 그대로).
// 2026-11-05 목업(/mock/cockpit)에서 옮김.

import { H, W } from '@/lib/playground'
import { logoUrl, type TeamKey } from '@/lib/baseballGear'
import { ITEMS, V_BOOST, type Item } from '@/lib/race'
import { palOf, shade, type Equip, type Interior, type Pal, type Skin, type SlotKey } from '@/lib/raceInterior'
import type { ChaseCam } from '@/components/playground/raceChase'

// 2026-11-05 시야 조정(목업 C안): 눈높이 32→55·지평선 0.36→0.28·대시보드 0.6→0.66 — 도로가 세로로 약 2배 보이게
export const COCKPIT_CAM: ChaseCam = { back: 6, h: 55, follow: 1, horizon: 0.28, focal: 330, hideMe: true, carMaxSc: 3.2 }
export const DASH_TOP = 0.66 // 대시보드 윗선(화면 높이 비율) — 낮출수록 도로가 더 보인다
// 운전석에선 레이더를 작게 오른쪽 위로(사이드미러 위)
export const COCKPIT_RADAR = { x: W - 96, y: 44, w: 56, h: 140 }

// me = 내 차(속도·아이템), others = 다른 차(거울에 비침), steer = 부드럽게 따라가는 조향(-1~1), total = 참가 대수
// react = 경기 중 실내 반응(2026-11-24): passAt = 마지막 추월 시각, firstAt = 1등 된 시각(wall 기준) — 없으면 연출 없음
export type CockpitReact = { passAt: number; firstAt: number }
export type CockpitOv = { me: { x: number; y: number; v: number; item: Item | null }; steer: number; others: { x: number; y: number; color: string }[]; rank: number; total: number; wall: number; react?: CockpitReact }
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
// car = 차종 운전석(lib/raceCars.ts CarRide 일부) — 시야(dashTop·roof·pillar)는 짝(카트·세단 / SUV·쿠페 / 스포츠·슈퍼)끼리 같고, 내장(trim 0~5)은 차마다 다르다
// skin = 차 실내 3종 중 고른 것의 색(lib/raceInterior.ts TRIMS) — 없으면 차 기본색
export type CockpitCar = { dashTop: number; roof: number; pillar: number; trim: number; skin?: Skin }
// 내장 등급(trim 0~9 = 차 등급, lib/raceCars.ts) → 내장 모양
const TRIM_STYLE = ['kart', 'mini', 'compact', 'sedan', 'suv', 'grand', 'coupe', 'lux', 'sport', 'super'] as const
type TrimStyle = (typeof TRIM_STYLE)[number]
const styleOf = (t: number): TrimStyle => TRIM_STYLE[Math.max(0, Math.min(TRIM_STYLE.length - 1, Math.round(t)))]
// 2026-11-24 2차(사용자 "실내가 너무 똑같다, 처음 차는 구려도 되니 점점 고급스럽게"):
//   싼 차일수록 대시보드가 회색 맨 플라스틱으로 덮이고(구단 색이 바래 보임) 기둥은 맨 철판, 앞유리 구석에 먼지
//   카트 = 청테이프로 땜질 · 모닝빵 = '초보운전' 스티커·유리 금 · 그랜절부터 대시 윤곽 무드등 · 벤또부터 디지털 계기판
const GRIME = [0.72, 0.6, 0.45, 0.2, 0.24, 0.08, 0, 0, 0, 0] // 대시보드 회색 플라스틱 덮기(차 등급별)
const DUST = [0.3, 0.24, 0.14, 0, 0, 0, 0, 0, 0, 0] // 앞유리 구석 먼지
// 2026-11-24 3차(사용자 "구단 10개 변주 때문에 대시보드에 큰 특색이 없다"): 대시보드·기둥 바탕색은 차가 정한다.
//   구단은 핸들 가운데 로고·윤곽 포인트 선·꾸미기 부위 색으로만. 룸미러는 시야를 가려서 뺐다(장식은 지붕에 매달림).
const DASH_BASE: Record<TrimStyle, string> = {
  kart: '#3F444C', mini: '#4B5563', compact: '#24282F', sedan: '#5B4636', suv: '#2A2F36',
  grand: '#4A2A18', coupe: '#101114', lux: '#15171C', sport: '#1A1C21', super: '#E9DDC4',
}
const PILLAR: Record<TrimStyle, string> = {
  kart: '#30343B', mini: '#3A3F47', compact: '#2F3640', sedan: '#3B2F26', suv: '#2A2F36',
  grand: '#3A2418', coupe: '#121419', lux: '#121419', sport: '#121419', super: '#1A1410',
}
export const BASIC_COCKPIT: CockpitCar = { dashTop: DASH_TOP, roof: 12, pillar: 80, trim: 0 }
export function drawCockpit(ctx: CanvasRenderingContext2D, n: Equip, o: Ov, hl: SlotKey | null = null, car: CockpitCar = BASIC_COCKPIT) {
  const { dashTop, roof, pillar: pw, trim } = car
  const st = styleOf(trim)
  const racy = st === 'sport' || st === 'super'
  const w = W, h = H
  const L = (k: SlotKey): Interior => ({ team: n[k].team, wheel: n.wheel.v, dash: n.dash.v, screen: n.screen.v, charm: n.charm.v, frame: n.frame.v, doll: n.doll.v, hands: n.hands.v })
  const it = L('dash')
  const sk = car.skin
  const teamPal = palOf(n.dash.team)
  const pal: Pal = sk ? { ...teamPal, accent: sk.accent, dash: sk.base } : teamPal // 포인트 색·바탕 = 실내 3종(구단은 로고·소품)
  const top = h * dashTop
  // 지붕·A필러
  const ti = TRIM_STYLE.indexOf(st)
  const pillar = sk?.pillar ?? PILLAR[st] // 싼 차 = 맨 철판 · 고급 = 검정 헤드라이너(차가 정함)
  const base = sk?.base ?? DASH_BASE[st]
  ctx.fillStyle = pillar
  ctx.fillRect(0, 0, w, roof)
  if (roof > 14) { ctx.fillStyle = shade(pal.dash, -0.5); ctx.beginPath(); ctx.moveTo(0, roof); ctx.quadraticCurveTo(w / 2, roof + 10, w, roof); ctx.lineTo(w, roof - 3); ctx.quadraticCurveTo(w / 2, roof + 6, 0, roof - 3); ctx.fill(); ctx.fillStyle = pillar } // 낮은 앞유리 윗선
  const pb = pw * 0.42 // 기둥 아래쪽 폭
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(pw, 0); ctx.lineTo(pb, top + 2); ctx.lineTo(0, top + 14); ctx.fill()
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - pw, 0); ctx.lineTo(w - pb, top + 2); ctx.lineTo(w, top + 14); ctx.fill()
  if (st === 'super') { // 슈퍼카: 기둥 안쪽 금색 테
    ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(pw, roof); ctx.lineTo(pb, top + 2); ctx.moveTo(w - pw, roof); ctx.lineTo(w - pb, top + 2); ctx.stroke()
  }
  // 룸미러 + 장식
  const mx = w / 2 - 95, my = roof + 4, mw = 190, mh = 38
  const fs: FrameStyle = { v: n.frame.v, team: n.frame.team, pal, base: pillar }
  void mx; void mw; void my; void mh // 룸미러는 그리지 않는다(시야 가림) — 장식은 지붕에 매달림
  drawCharm(ctx, L('charm'), palOf(n.charm.team), w / 2 + 70, roof, o)

  // ── 대시보드(종류별 질감, 색은 구단) ──
  const dashPath = () => { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, top + 26); ctx.quadraticCurveTo(w / 2, top - 46, w, top + 26); ctx.lineTo(w, h); ctx.closePath() }
  const dg = ctx.createLinearGradient(0, top - 30, 0, h)
  dg.addColorStop(0, shade(base, 0.18)); dg.addColorStop(0.35, base); dg.addColorStop(1, shade(base, st === 'super' ? -0.25 : -0.5))
  ctx.fillStyle = dg; dashPath(); ctx.fill()
  if (GRIME[ti]) { ctx.save(); ctx.globalAlpha = GRIME[ti]; ctx.fillStyle = '#5B6068'; dashPath(); ctx.fill(); ctx.restore() }
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

  drawTrimDash(ctx, st, pal, top, w, h, o)
  drawTierExtras(ctx, st, ti, pal, top, w, roof, pw, o, sk?.amb)
  // 사이드미러
  mirror(ctx, 40, top + 4, 120, 46, o, -1, fs)
  mirror(ctx, w - 160, top + 4, 120, 46, o, 1, fs)
  // 송풍구
  for (const vx of [w / 2 - 330, w / 2 - 270]) {
    ctx.fillStyle = shade(base, -0.5); ctx.beginPath(); ctx.roundRect(vx, top + 44, 44, 24, 8); ctx.fill()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(vx + 4, top + 44 + i * 6); ctx.lineTo(vx + 40, top + 44 + i * 6); ctx.stroke() }
  }
  // 인형(대시보드 위, 왼쪽)
  drawDoll(ctx, L('doll'), palOf(n.doll.team), w / 2 + 120, top - 10, o)
  // 가운데 화면
  drawScreen(ctx, L('screen'), sk ? { ...palOf(n.screen.team), main: shade(sk.base, -0.55), dash: shade(sk.base, -0.7), accent: sk.accent } : palOf(n.screen.team), w / 2 + 175, Math.min(top + 18, h - 96), 170, 84, o)
  // 계기판(핸들 왼쪽 — 핸들 가운데 로고가 보이게 비켜 둠)
  const gx = w / 2 - 175, gy = Math.min(top + 98, h - 16) // 대시보드가 낮은 차(SUV)도 속도계가 화면 안에
  ctx.fillStyle = shade(pal.dash, -0.6); ctx.beginPath(); ctx.ellipse(gx, gy + 2, 52, 40, 0, Math.PI, Math.PI * 2); ctx.fill()
  if (ti >= 7) drawCluster(ctx, gx, gy, o.me.v, st, pal) // 벤또부터: 디지털 계기판(회전계 포함)
  else gauge(ctx, gx, gy, 34, o.me.v, ti <= 1 ? '#9CA3AF' : pal.accent)
  if (st === 'super') { drawShiftLights(ctx, gx, gy - 50, o.me.v); drawHud(ctx, w / 2, top - 34, o, pal) }
  if (o.me.v > V_BOOST - 60) { ctx.fillStyle = '#FDBA74'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('🚀 BOOST', gx, gy - 44) }
  // 핸들 + 손
  drawWheel(ctx, L('wheel'), sk ? { ...palOf(n.wheel.team), main: sk.wheelC, accent: sk.accent } : palOf(n.wheel.team), o, L('hands'), palOf(n.hands.team))
  if (st === 'lux' || racy) drawSeats(ctx, st, pal, w, h)
  drawReact(ctx, o, w, h, top, ti, sk, pal, w / 2 + 175, Math.min(top + 18, h - 96))
  if (hl) drawHighlight(ctx, n, hl, o)
}

// ── 실내 등급(trim 0~9 = 차 등급) — 차마다 다른 내장(꾸미기 부위와 별개로 차에 딸린 것) ──
//   2026-11-24 10종: 모닝빵 체크무늬 천·노란 시계 / 아방이 우레탄·디지털 시계 / 그랜절 갈색 가죽·넓은 원목 / 벤또 검정 가죽·색 바뀌는 무드등·터빈 송풍구
//   아래는 예전 번호(1 = 개나타 · 2 = 싼타썰매 · 3 = 스무디 · 4 = 고르쉐 · 5 = 아르기닌)
//   0 카트: 맨 플라스틱·나사 / 1 세단: 크림 가죽 덮개·원목 띠·크롬 테·아날로그 시계
//   2 SUV: 고무 덮개·은색 리벳·주황 박음질·나침반 / 3 쿠페: 피아노 블랙 덮개·알루미늄 테·두 색 무드등·크로노 시계·빨간 박음질
//   4 스포츠: 알칸타라 덮개·카본 띠·빨간 박음질·회전계·버킷 시트 / 5 슈퍼: 크림 퀼팅 가죽 덮개·금장·카본·퀼팅 시트·변속 표시등·앞유리 HUD
function dashCurve(ctx: CanvasRenderingContext2D, w: number, y: number, bend: number) {
  ctx.moveTo(0, y); ctx.quadraticCurveTo(w / 2, y - bend, w, y)
}
type MetalKind = 'chrome' | 'gold' | 'alu' | 'silver'
function metalGrad(ctx: CanvasRenderingContext2D, k: MetalKind, y0: number, y1: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  const c = k === 'gold' ? ['#FEF3C7', '#D4A017', '#92400E'] : k === 'alu' ? ['#E5E7EB', '#9CA3AF', '#D1D5DB'] : k === 'silver' ? ['#CBD5E1', '#64748B', '#334155'] : ['#F8FAFC', '#94A3B8', '#475569']
  g.addColorStop(0, c[0]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[2])
  return g
}
// 대시보드를 가로지르는 띠(두 곡선 사이) — fill 후 안쪽에 무늬를 그릴 수 있게 clip을 건 채로 pattern 호출
function dashBand(ctx: CanvasRenderingContext2D, w: number, y0: number, y1: number, bend: number, fill: string | CanvasGradient, pattern?: () => void) {
  ctx.save()
  ctx.beginPath(); dashCurve(ctx, w, y0, bend); ctx.lineTo(w, y1); ctx.quadraticCurveTo(w / 2, y1 - bend, 0, y1); ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()
  if (pattern) { ctx.clip(); pattern() }
  ctx.restore()
}
function trimLine(ctx: CanvasRenderingContext2D, w: number, y: number, bend: number, style: string | CanvasGradient, lw: number, dash?: number[]) {
  ctx.strokeStyle = style; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash)
  ctx.beginPath(); dashCurve(ctx, w, y, bend); ctx.stroke(); ctx.setLineDash([])
}
function glowLine(ctx: CanvasRenderingContext2D, w: number, y: number, bend: number, color: string, lw: number, blur: number, alpha: number) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.globalAlpha = alpha
  trimLine(ctx, w, y, bend, color, lw); ctx.restore()
}
function ventRims(ctx: CanvasRenderingContext2D, w: number, top: number, k: MetalKind) {
  ctx.strokeStyle = metalGrad(ctx, k, top + 40, top + 70); ctx.lineWidth = 2.5
  for (const vx of [w / 2 - 330, w / 2 - 270]) { ctx.beginPath(); ctx.roundRect(vx - 2, top + 42, 48, 28, 9); ctx.stroke() }
}
// 대시보드 위 작은 원형 계기(시계·나침반·크로노) — 가운데 화면 왼쪽
function miniDial(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rim: MetalKind, face: string, draw: () => void) {
  ctx.save()
  ctx.fillStyle = metalGrad(ctx, rim, cy - r - 3, cy + r + 3); ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = face; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  draw()
  ctx.restore()
}
function hands(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const d = new Date(), hr = (d.getHours() % 12 + d.getMinutes() / 60) / 12, mi = d.getMinutes() / 60
  ctx.strokeStyle = color; ctx.lineCap = 'round'
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hr * Math.PI * 2) * r * 0.5, cy - Math.cos(hr * Math.PI * 2) * r * 0.5); ctx.stroke()
  ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(mi * Math.PI * 2) * r * 0.78, cy - Math.cos(mi * Math.PI * 2) * r * 0.78); ctx.stroke()
}
function ticks(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, n = 12) {
  ctx.strokeStyle = color; ctx.lineWidth = 1
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r * 0.78, cy - Math.cos(a) * r * 0.78); ctx.lineTo(cx + Math.sin(a) * r * 0.92, cy - Math.cos(a) * r * 0.92); ctx.stroke() }
}
// 대시보드 윗면 덮개(가장 잘 보이는 자리 — 화면 가로 전체). 대시보드 윤곽선(top+26, 휨 72)부터 thick만큼 아래까지
function dashCap(ctx: CanvasRenderingContext2D, w: number, top: number, thick: number, fill: string | CanvasGradient, pattern?: () => void) {
  dashBand(ctx, w, top + 26, top + 26 + thick, 72, fill, pattern)
}
function drawTrimDash(ctx: CanvasRenderingContext2D, st: TrimStyle, pal: Pal, top: number, w: number, h: number, o: Ov) {
  void h
  ctx.save()
  ctx.lineCap = 'round'
  const dx = w / 2 - 250, dy = top + 18 // 작은 원형 계기 자리(왼쪽 송풍구 위 — 핸들에 안 가림)
  const g2 = (y0: number, y1: number, a: string, b: string) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g }
  if (st === 'kart') {
    // 카트: 맨 플라스틱 — 덮개 없음, 나사·이음매만
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (const x of [w * 0.2, w * 0.3, w * 0.7, w * 0.8]) { ctx.beginPath(); ctx.arc(x, top + 34, 3, 0, Math.PI * 2); ctx.fill() }
    trimLine(ctx, w, top + 46, 72, 'rgba(0,0,0,0.3)', 1.5)
  } else if (st === 'mini') {
    // 모닝빵: 회색 체크무늬 천 덮개 + 나사 + 동글 장난감 같은 노란 시계
    dashCap(ctx, w, top, 18, '#4B5563', () => {
      ctx.fillStyle = 'rgba(255,255,255,0.09)'
      for (let x = 0; x < w; x += 8) for (let y = top - 30; y < top + 60; y += 8) if (((x + y) / 8) % 2 === 0) ctx.fillRect(x, y, 4, 4)
    })
    trimLine(ctx, w, top + 44, 72, 'rgba(0,0,0,0.35)', 1.5)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (const x of [w * 0.25, w * 0.75]) { ctx.beginPath(); ctx.arc(x, top + 40, 3, 0, Math.PI * 2); ctx.fill() }
    miniDial(ctx, dx, dy, 15, 'silver', '#FDE68A', () => { ticks(ctx, dx, dy, 15, '#92400E', 4); hands(ctx, dx, dy, 15, '#1F2937') })
  } else if (st === 'compact') {
    // 아방이: 검정 우레탄 덮개(잔결) + 은색 얇은 줄 + 디지털 시계
    dashCap(ctx, w, top, 20, '#1F2329', () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) { ctx.beginPath(); dashCurve(ctx, w, top + 28 + i * 2.2, 72); ctx.stroke() }
    })
    trimLine(ctx, w, top + 47, 72, metalGrad(ctx, 'silver', top + 42, top + 50), 1.6)
    ventRims(ctx, w, top, 'silver')
    const d = new Date(), tt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    ctx.fillStyle = '#0B0F17'; ctx.beginPath(); ctx.roundRect(dx - 26, dy - 10, 52, 20, 4); ctx.fill()
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#67E8F9'; ctx.font = '800 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tt, dx, dy + 1)
  } else if (st === 'sedan') {
    // 세단: 크림 가죽 덮개 + 흰 박음질 / 아래 원목 띠 + 크롬 테 / 아날로그 시계
    dashCap(ctx, w, top, 20, g2(top - 12, top + 46, '#F1E4C8', '#BFA273'))
    trimLine(ctx, w, top + 33, 72, 'rgba(120,80,30,0.55)', 1.2, [5, 4])
    const wood = g2(top + 44, top + 60, '#A16207', '#5B2108')
    dashBand(ctx, w, top + 46, top + 58, 72, wood, () => {
      ctx.strokeStyle = 'rgba(253,230,138,0.25)'; ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) { ctx.beginPath(); dashCurve(ctx, w, top + 47 + i * 2.4, 72 + Math.sin(i * 1.7) * 7); ctx.stroke() }
    })
    trimLine(ctx, w, top + 46, 72, metalGrad(ctx, 'chrome', top + 40, top + 50), 2)
    trimLine(ctx, w, top + 59, 72, metalGrad(ctx, 'chrome', top + 54, top + 62), 2)
    ventRims(ctx, w, top, 'chrome')
    miniDial(ctx, dx, dy, 16, 'chrome', '#FEFCE8', () => { ticks(ctx, dx, dy, 16, '#78350F'); hands(ctx, dx, dy, 16, '#1F2937') })
  } else if (st === 'suv') {
    // SUV: 고무 덮개(점 질감) + 은색 리벳 + 주황 박음질 / 나침반
    dashCap(ctx, w, top, 22, '#2A2F36', () => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      for (let x = 3; x < w; x += 6) for (let y = top - 20; y < top + 50; y += 6) { ctx.beginPath(); ctx.arc(x + ((y / 6) % 2 ? 3 : 0), y, 1.1, 0, Math.PI * 2); ctx.fill() }
    })
    trimLine(ctx, w, top + 37, 72, '#F97316', 1.4, [6, 4])
    // 리벳(덮개 아래 줄)
    for (let i = 1; i < 14; i++) {
      const t = i / 14, x = w * t, y = top + 26 + 22 - 72 * 2 * t * (1 - t) + 2
      ctx.fillStyle = metalGrad(ctx, 'silver', y - 3, y + 3); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill()
    }
    glowLine(ctx, w, top + 52, 72, pal.accent, 1.5, 6, 0.4)
    ventRims(ctx, w, top, 'silver')
    miniDial(ctx, dx, dy, 16, 'silver', '#0F172A', () => {
      ticks(ctx, dx, dy, 16, 'rgba(255,255,255,0.5)', 8)
      const a = o.steer * 0.6 + Math.sin(o.wall / 1500) * 0.08
      ctx.translate(dx, dy); ctx.rotate(-a)
      ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(3.5, 0); ctx.lineTo(-3.5, 0); ctx.fill()
      ctx.fillStyle = '#E5E7EB'; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(3.5, 0); ctx.lineTo(-3.5, 0); ctx.fill()
    })
    ctx.fillStyle = '#FDE68A'; ctx.font = '800 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', dx, dy - 21)
  } else if (st === 'grand') {
    // 그랜절: 갈색 나파 가죽 덮개 + 크림 박음질 / 넓은 원목 띠 + 크롬 테 두 줄 / 은은한 호박색 무드등 / 크롬 아날로그 시계
    dashCap(ctx, w, top, 22, g2(top - 12, top + 48, '#8B5A3C', '#4A2A18'))
    trimLine(ctx, w, top + 34, 72, 'rgba(253,230,200,0.6)', 1.2, [5, 4])
    const wood = g2(top + 48, top + 70, '#B45309', '#5B2108')
    dashBand(ctx, w, top + 49, top + 67, 72, wood, () => {
      ctx.strokeStyle = 'rgba(253,230,138,0.28)'; ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) { ctx.beginPath(); dashCurve(ctx, w, top + 50 + i * 2.2, 72 + Math.sin(i * 1.3) * 9); ctx.stroke() }
    })
    trimLine(ctx, w, top + 49, 72, metalGrad(ctx, 'chrome', top + 43, top + 53), 2.2)
    trimLine(ctx, w, top + 68, 72, metalGrad(ctx, 'chrome', top + 63, top + 71), 2.2)
    glowLine(ctx, w, top + 72, 72, '#FBBF24', 2, 12, 0.55)
    ventRims(ctx, w, top, 'chrome')
    miniDial(ctx, dx, dy, 17, 'chrome', '#FFFBEB', () => { ticks(ctx, dx, dy, 17, '#78350F'); hands(ctx, dx, dy, 17, '#1F2937') })
  } else if (st === 'coupe') {
    // 쿠페: 피아노 블랙 덮개(지나가는 반사광) + 알루미늄 테 + 두 색 무드등 + 빨간 박음질 / 크로노 시계
    dashCap(ctx, w, top, 20, g2(top - 12, top + 46, '#3A3A42', '#050507'), () => {
      const sx = ((o.wall / 14) % (w + 500)) - 250
      const g = ctx.createLinearGradient(sx - 140, 0, sx + 140, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g; ctx.fillRect(0, top - 40, w, 120)
    })
    trimLine(ctx, w, top + 46, 72, metalGrad(ctx, 'alu', top + 40, top + 50), 2)
    const a = 0.7 + Math.sin(o.wall / 600) * 0.2
    glowLine(ctx, w, top + 49, 72, pal.accent, 2.5, 14, a)
    glowLine(ctx, w, top + 55, 72, '#22D3EE', 1.8, 12, 1.4 - a)
    trimLine(ctx, w, top + 62, 72, '#EF4444', 1.2, [5, 4])
    ventRims(ctx, w, top, 'alu')
    miniDial(ctx, dx, dy, 16, 'alu', '#0B0F17', () => {
      ticks(ctx, dx, dy, 16, 'rgba(255,255,255,0.75)')
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(dx, dy + 6, 4.5, 0, Math.PI * 2); ctx.stroke()
      hands(ctx, dx, dy, 16, '#F8FAFC')
      const sec = ((o.wall / 1000) % 60) / 60
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.sin(sec * Math.PI * 2) * 14, dy - Math.cos(sec * Math.PI * 2) * 14); ctx.stroke()
    })
  } else if (st === 'lux') {
    // 벤또: 검정 가죽 덮개 + 은색 박음질 / 색이 천천히 바뀌는 무드등 두 줄 / 크롬 원형(터빈) 송풍구 / 유리 시계 판
    dashCap(ctx, w, top, 22, g2(top - 12, top + 48, '#2A2D34', '#0E0F13'), () => {
      ctx.fillStyle = 'rgba(255,255,255,0.035)'
      for (let i = 0; i < 700; i++) { const x = (i * 131) % w, y = top - 14 + ((i * 37) % 64); ctx.fillRect(x, y, 1.2, 1.2) }
    })
    trimLine(ctx, w, top + 35, 72, 'rgba(203,213,225,0.55)', 1.2, [5, 4])
    const hue = (o.wall / 40) % 360
    glowLine(ctx, w, top + 48, 72, `hsl(${hue} 90% 62%)`, 2.5, 16, 0.85)
    glowLine(ctx, w, top + 56, 72, `hsl(${(hue + 120) % 360} 90% 62%)`, 1.6, 12, 0.6)
    trimLine(ctx, w, top + 62, 72, metalGrad(ctx, 'chrome', top + 57, top + 65), 2)
    for (const vx of [w / 2 - 330, w / 2 - 270]) { // 원형 터빈 송풍구(기본 송풍구 위에 덮음)
      const cx = vx + 22, cy = top + 56
      ctx.fillStyle = '#0B0D11'; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = metalGrad(ctx, 'chrome', cy - 16, cy + 16); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 1.4
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + o.wall / 3000; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); ctx.stroke() }
    }
    ctx.fillStyle = 'rgba(15,23,42,0.92)'; ctx.beginPath(); ctx.roundRect(dx - 46, dy - 12, 92, 24, 6); ctx.fill()
    ctx.strokeStyle = metalGrad(ctx, 'chrome', dy - 12, dy + 12); ctx.lineWidth = 1.5; ctx.stroke()
    const d = new Date()
    ctx.fillStyle = '#E2E8F0'; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}  ☀ 21°`, dx, dy + 1)
  } else {
    // 스포츠(4): 알칸타라(스웨이드) 덮개 + 빨간 박음질 + 카본 띠
    // 슈퍼(5): 크림 다이아 퀼팅 가죽 덮개 + 금 테두리 + 카본 띠 + 금색 무드등 + 금 엠블럼 판
    const sup = st === 'super'
    if (sup) {
      dashCap(ctx, w, top, 22, g2(top - 12, top + 48, '#FFF7E6', '#D9C29A'), () => {
        ctx.strokeStyle = 'rgba(160,110,40,0.45)'; ctx.lineWidth = 1
        for (let x = -80; x < w + 80; x += 14) { ctx.beginPath(); ctx.moveTo(x, top - 40); ctx.lineTo(x + 70, top + 60); ctx.moveTo(x + 70, top - 40); ctx.lineTo(x, top + 60); ctx.stroke() }
        ctx.fillStyle = 'rgba(212,160,23,0.7)'
        for (let x = -80; x < w + 80; x += 14) for (let y = top - 40; y < top + 60; y += 20) { ctx.beginPath(); ctx.arc(x + 35, y + 10, 1, 0, Math.PI * 2); ctx.fill() }
      })
      trimLine(ctx, w, top + 26, 72, metalGrad(ctx, 'gold', top - 14, top + 30), 2.5)
    } else {
      dashCap(ctx, w, top, 20, '#22252B', () => {
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        for (let i = 0; i < 900; i++) { const x = (i * 97) % w, y = top - 14 + ((i * 53) % 64); ctx.fillRect(x, y, 1.5, 1.5) }
      })
      trimLine(ctx, w, top + 34, 72, '#EF4444', 1.5, [6, 4])
    }
    dashBand(ctx, w, top + 48, top + 64, 72, '#111317', () => {
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      for (let x = -60; x < w + 60; x += 8) { ctx.beginPath(); ctx.moveTo(x, top + 80); ctx.lineTo(x + 60, top - 40); ctx.stroke() }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      for (let x = -60; x < w + 60; x += 8) { ctx.beginPath(); ctx.moveTo(x, top - 40); ctx.lineTo(x + 60, top + 80); ctx.stroke() }
    })
    trimLine(ctx, w, top + 47, 72, metalGrad(ctx, sup ? 'gold' : 'chrome', top + 40, top + 50), sup ? 3 : 2)
    trimLine(ctx, w, top + 65, 72, metalGrad(ctx, sup ? 'gold' : 'chrome', top + 60, top + 68), sup ? 2.5 : 1.5)
    glowLine(ctx, w, top + 70, 72, sup ? '#FACC15' : pal.accent, sup ? 3 : 2, sup ? 16 : 10, 0.65 + Math.sin(o.wall / 700) * 0.2)
    ventRims(ctx, w, top, sup ? 'gold' : 'chrome')
    if (sup) {
      ctx.fillStyle = metalGrad(ctx, 'gold', top + 4, top + 18); ctx.beginPath(); ctx.roundRect(dx - 40, dy - 8, 80, 16, 8); ctx.fill()
      ctx.fillStyle = '#422006'; ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SUPERCAR', dx, dy)
    } else {
      ctx.fillStyle = '#111317'; ctx.beginPath(); ctx.roundRect(dx - 36, dy - 8, 72, 16, 4); ctx.fill()
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = '#F8FAFC'; ctx.font = 'italic 900 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SPORT', dx, dy)
    }
  }
  ctx.restore()
}
// 차 등급별 덧그림: 먼지·청테이프·스티커·유리 금(싼 차) / 대시 윤곽 무드등·기둥 무드등(고급 차)
function drawTierExtras(ctx: CanvasRenderingContext2D, st: TrimStyle, ti: number, pal: Pal, top: number, w: number, roof: number, pw: number, o: Ov, ambSkin?: string) {
  ctx.save()
  if (DUST[ti]) { // 앞유리 구석 먼지(양 위 구석 + 대시 위)
    for (const cx of [pw * 0.9, w - pw * 0.9]) {
      const g = ctx.createRadialGradient(cx, roof, 0, cx, roof, 260)
      g.addColorStop(0, `rgba(120,100,70,${DUST[ti]})`); g.addColorStop(1, 'rgba(120,100,70,0)')
      ctx.fillStyle = g; ctx.fillRect(cx - 260, roof, 520, top - roof)
    }
    const g2 = ctx.createLinearGradient(0, top - 40, 0, top + 10)
    g2.addColorStop(0, 'rgba(120,100,70,0)'); g2.addColorStop(1, `rgba(120,100,70,${DUST[ti] * 0.8})`)
    ctx.fillStyle = g2; ctx.fillRect(0, top - 40, w, 50)
  }
  if (st === 'kart') { // 청테이프 땜질 두 군데 + 삐져나온 전선
    for (const [x, y, a, len] of [[w * 0.66, top + 38, -0.14, 96], [w * 0.31, top + 50, 0.1, 64]] as const) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a)
      ctx.fillStyle = '#A8B0BA'; ctx.fillRect(-len / 2, -9, len, 18)
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
      for (let i = -len / 2 + 4; i < len / 2; i += 7) { ctx.beginPath(); ctx.moveTo(i, -9); ctx.lineTo(i + 3, 9); ctx.stroke() }
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-len / 2, 6, len, 3)
      ctx.restore()
    }
    ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.42, top + 70); ctx.bezierCurveTo(w * 0.44, top + 90, w * 0.4, top + 96, w * 0.43, top + 112); ctx.stroke()
    ctx.strokeStyle = '#FACC15'; ctx.beginPath(); ctx.moveTo(w * 0.425, top + 72); ctx.bezierCurveTo(w * 0.45, top + 92, w * 0.43, top + 100, w * 0.455, top + 110); ctx.stroke()
  }
  if (st === 'mini') { // '초보운전' 스티커 + 유리 오른쪽 위 작은 금
    ctx.save(); ctx.translate(w * 0.64, top + 42); ctx.rotate(-0.08)
    ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.roundRect(-38, -11, 76, 22, 5); ctx.fill()
    ctx.strokeStyle = '#CA8A04'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#1F2937'; ctx.font = '900 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('초보운전', 0, 1)
    ctx.restore()
    const cx = w - pw - 60, cy = roof + 46
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1
    for (const [dx, dy] of [[-26, -10], [-14, 18], [10, 22], [24, -6], [6, -20]]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke() }
  }
  // 대시보드 윤곽 무드등(그랜절부터) — 차마다 색: 호박 · 구단 · 무지개 · 빨강 · 금
  const rainbow = `hsl(${(o.wall / 40) % 360} 90% 62%)`
  const amb = ambSkin ? (ambSkin === 'rainbow' ? rainbow : ambSkin)
    : st === 'grand' ? '#FBBF24' : st === 'coupe' ? pal.accent : st === 'lux' ? rainbow : st === 'sport' ? '#EF4444' : st === 'super' ? '#FACC15' : null
  if (amb) {
    if (ti >= 5) { // 그랜절부터: 대시보드 아래쪽까지 은은한 빛(무료 1번도 '오?')
      ctx.save(); ctx.globalAlpha = 0.18; ctx.shadowColor = amb; ctx.shadowBlur = 30; ctx.strokeStyle = amb; ctx.lineWidth = 6
      ctx.beginPath(); dashCurve(ctx, w, top + 80, 72); ctx.stroke(); ctx.restore()
    }
    glowLine(ctx, w, top + 26, 72, amb, ti >= 7 ? 3 : 2, ti >= 7 ? 22 : 14, 0.55 + Math.sin(o.wall / 900) * 0.15)
    if (ti >= 7) { // 기둥 안쪽 무드등
      const pb = pw * 0.42
      ctx.save(); ctx.shadowColor = amb; ctx.shadowBlur = 12; ctx.strokeStyle = amb; ctx.globalAlpha = 0.7; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(pw - 3, roof + 2); ctx.lineTo(pb - 2, top); ctx.moveTo(w - pw + 3, roof + 2); ctx.lineTo(w - pb + 2, top); ctx.stroke(); ctx.restore()
    }
  }
  if ((st === 'sport' || st === 'super') && amb) { // 빵: 대시 윤곽을 따라 빛 두 줄기가 달린다 + 앞유리 아래 빛 번짐
    for (const off of [0, 0.5]) {
      const u = ((o.wall / (st === 'super' ? 1600 : 2000)) + off) % 1
      const x = u * w, y = top + 26 - 72 * 2 * u * (1 - u)
      const g = ctx.createRadialGradient(x, y, 0, x, y, 70)
      g.addColorStop(0, amb); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.fillRect(x - 70, y - 70, 140, 140); ctx.restore()
    }
    const bl = ctx.createLinearGradient(0, top - 50, 0, top + 20)
    bl.addColorStop(0, 'rgba(0,0,0,0)'); bl.addColorStop(1, amb)
    ctx.save(); ctx.globalAlpha = 0.12 + Math.sin(o.wall / 500) * 0.05; ctx.fillStyle = bl; ctx.fillRect(pw, top - 50, w - pw * 2, 70); ctx.restore()
  }
  if (st === 'super') { // 아르기닌: 다이아처럼 반짝이는 점들
    for (let i = 0; i < 14; i++) {
      const ph = (o.wall / 700 + i * 0.37) % 1, a = Math.sin(ph * Math.PI)
      const x = ((i * 137) % (w - 200)) + 100, y = top + 30 + ((i * 53) % 40)
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#FFF7D6'
      ctx.beginPath(); ctx.moveTo(x, y - 5 * a); ctx.lineTo(x + 1.5, y); ctx.lineTo(x, y + 5 * a); ctx.lineTo(x - 1.5, y); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(x - 5 * a, y); ctx.lineTo(x, y + 1.5); ctx.lineTo(x + 5 * a, y); ctx.lineTo(x, y - 1.5); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  }
  if (st === 'super') { // 아르기닌: 대시 위 금 엠블럼 띠 반짝
    const sx = ((o.wall / 9) % (w + 400)) - 200
    const g = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0); g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, 'rgba(255,240,180,0.35)'); g.addColorStop(1, 'rgba(255,240,180,0)')
    ctx.fillStyle = g; ctx.beginPath(); dashCurve(ctx, w, top + 26, 72); ctx.lineTo(w, top + 48); ctx.quadraticCurveTo(w / 2, top - 24, 0, top + 48); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}
// 디지털 계기판(벤또·고르쉐·아르기닌) — 큰 숫자 속도 + 막대 + (스포츠 이상) 회전 막대
function drawCluster(ctx: CanvasRenderingContext2D, gx: number, gy: number, v: number, st: TrimStyle, pal: Pal) {
  const rim = st === 'super' ? '#D4A017' : st === 'sport' ? '#EF4444' : '#CBD5E1'
  const x = gx - 74, y = gy - 46, cw = 148, ch = 50
  ctx.save()
  ctx.fillStyle = '#05070B'; ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.fill()
  ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.stroke()
  const g = ctx.createLinearGradient(x, y, x, y + ch); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, cw - 4, ch / 2, 8); ctx.fill()
  const p = Math.min(1, v / V_BOOST)
  ctx.fillStyle = st === 'super' ? '#FDE68A' : '#F8FAFC'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(kmh(v)), x + 10, y + 30)
  ctx.font = '700 8px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('km/h', x + 12, y + 41)
  // 속도 막대
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 62, y + 12, 76, 5)
  ctx.fillStyle = st === 'lux' ? pal.accent : rim; ctx.fillRect(x + 62, y + 12, 76 * p, 5)
  if (st !== 'lux') { // 회전 막대(초록→빨강)
    const n = 12, rpm = 0.25 + 0.7 * p
    for (let i = 0; i < n; i++) { ctx.fillStyle = i / n < rpm ? (i < 7 ? '#22C55E' : i < 10 ? '#FACC15' : '#EF4444') : 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 62 + i * 6.4, y + 24, 5, 8) }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 7px sans-serif'; ctx.fillText('RPM', x + 62, y + 43)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '700 9px sans-serif'; ctx.fillText('D  ·  COMFORT', x + 62, y + 34)
  }
  ctx.restore()
}
// 변속 표시등(슈퍼카) — 속도가 오를수록 초록 → 노랑 → 빨강, 최고속이면 깜빡
function drawShiftLights(ctx: CanvasRenderingContext2D, cx: number, y: number, v: number) {
  const n = 10, p = Math.min(1, v / V_BOOST) * 1.25
  const blink = p >= 1.2 && Math.floor(Date.now() / 90) % 2 === 0
  for (let i = 0; i < n; i++) {
    const on = !blink && i / n < p
    const col = i < 4 ? '#22C55E' : i < 7 ? '#FACC15' : '#EF4444'
    ctx.fillStyle = on ? col : 'rgba(255,255,255,0.08)'
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 6 }
    ctx.beginPath(); ctx.arc(cx - 45 + i * 10, y, 3, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }
}
// 앞유리 HUD(슈퍼카) — 속도·순위가 도로 위에 반투명하게 떠 보임
function drawHud(ctx: CanvasRenderingContext2D, cx: number, y: number, o: Ov, pal: Pal) {
  ctx.save()
  ctx.globalAlpha = 0.78
  ctx.shadowColor = pal.accent; ctx.shadowBlur = 8
  ctx.fillStyle = '#A7F3D0'; ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(kmh(o.me.v)), cx - 34, y)
  ctx.font = '700 9px sans-serif'; ctx.fillText('km/h', cx - 34, y + 11)
  ctx.font = '900 16px sans-serif'; ctx.fillText(`P${o.rank}`, cx + 34, y)
  ctx.font = '700 9px sans-serif'; ctx.fillText(`/${o.total}`, cx + 34, y + 11)
  ctx.strokeStyle = '#A7F3D0'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(cx - 8, y - 12); ctx.lineTo(cx, y - 18); ctx.lineTo(cx + 8, y - 12); ctx.stroke()
  ctx.restore()
}
// 버킷 시트 날개(스포츠 이상) — 화면 아래 양쪽 모서리. 슈퍼카는 다이아 퀼팅 + 금색 박음질
function drawSeats(ctx: CanvasRenderingContext2D, st: TrimStyle, pal: Pal, w: number, h: number) {
  const gold = st === 'super', lux = st === 'lux'
  for (const sx of [-1, 1]) {
    ctx.save()
    const x0 = sx < 0 ? 0 : w
    ctx.beginPath(); ctx.moveTo(x0, h - 90); ctx.quadraticCurveTo(x0 - sx * 70, h - 70, x0 - sx * 96, h); ctx.lineTo(x0, h); ctx.closePath()
    const g = ctx.createLinearGradient(x0, h - 90, x0 - sx * 96, h)
    g.addColorStop(0, '#1F2937'); g.addColorStop(1, '#0B0F17')
    ctx.fillStyle = g; ctx.fill(); ctx.clip()
    if (gold || lux) {
      ctx.strokeStyle = gold ? 'rgba(212,160,23,0.55)' : 'rgba(203,213,225,0.35)'; ctx.lineWidth = 1
      for (let k = -120; k < 160; k += 14) { ctx.beginPath(); ctx.moveTo(x0 - sx * k, h - 100); ctx.lineTo(x0 - sx * (k + 100), h); ctx.moveTo(x0 - sx * (k + 100), h - 100); ctx.lineTo(x0 - sx * k, h); ctx.stroke() }
    }
    ctx.strokeStyle = gold ? '#D4A017' : lux ? '#CBD5E1' : pal.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(x0, h - 80); ctx.quadraticCurveTo(x0 - sx * 62, h - 62, x0 - sx * 84, h); ctx.stroke()
    ctx.restore()
  }
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

// ── 경기 중 실내 반응 — 비싼 실내(3종 중 2·3번)·높은 등급 차일수록 크다 ──
//   🚀 부스터: 무드등(없으면 포인트 색)이 대시보드를 따라 번쩍 / 🏁 추월: 화면에 '추월!' + 반짝 + 인형 춤 / 👑 1등: 꽃가루
function drawReact(ctx: CanvasRenderingContext2D, o: Ov, w: number, h: number, top: number, ti: number, sk: Skin | undefined, pal: Pal, sx: number, sy: number) {
  const r = o.react
  if (!r) return
  const k = 0.55 + (sk?.lvl ?? 0) * 0.3 + ti * 0.03 // 연출 크기
  const glowC = sk?.amb === 'rainbow' ? `hsl(${(o.wall / 30) % 360} 95% 60%)` : sk?.amb ?? pal.accent
  if (o.me.v > V_BOOST - 60) { // 🚀
    const a = (0.25 + Math.abs(Math.sin(o.wall / 90)) * 0.35) * k
    const g = ctx.createLinearGradient(0, top - 70, 0, top + 30)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, glowC); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.save(); ctx.globalAlpha = Math.min(0.85, a); ctx.fillStyle = g; ctx.fillRect(0, top - 70, w, 100)
    ctx.shadowColor = glowC; ctx.shadowBlur = 24 * k; ctx.strokeStyle = glowC; ctx.lineWidth = 3 + 3 * k
    ctx.beginPath(); dashCurve(ctx, w, top + 4, 70); ctx.stroke(); ctx.restore()
  }
  const sincePass = o.wall - r.passAt
  if (sincePass >= 0 && sincePass < 1500) { // 🏁 추월!
    const p = sincePass / 1500, pop = Math.min(1, p * 6) * (1 - Math.max(0, p - 0.7) / 0.3)
    ctx.save(); ctx.globalAlpha = pop
    ctx.fillStyle = 'rgba(2,6,23,0.85)'; ctx.beginPath(); ctx.roundRect(sx - 2, sy - 2, 174, 88, 10); ctx.fill()
    ctx.fillStyle = glowC; ctx.shadowColor = glowC; ctx.shadowBlur = 18 * k
    ctx.font = `900 ${Math.round(28 + 8 * k * (1 - p))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('추월!', sx + 85, sy + 34)
    ctx.shadowBlur = 0; ctx.fillStyle = '#FDE68A'; ctx.font = '800 14px sans-serif'; ctx.fillText(`${o.rank}등`, sx + 85, sy + 64)
    const n = Math.round(6 + 10 * k)
    for (let i = 0; i < n; i++) { // 화면에서 튀는 반짝이
      const a = (i / n) * Math.PI * 2, d = 20 + p * 110 * k
      ctx.fillStyle = i % 2 ? glowC : '#FFF7D6'
      ctx.beginPath(); ctx.arc(sx + 85 + Math.cos(a) * d, sy + 40 + Math.sin(a) * d * 0.6, 3 * (1 - p) + 1, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
  const sinceFirst = o.wall - r.firstAt
  if (o.rank === 1 && sinceFirst >= 0 && sinceFirst < 3200) { // 👑 1등 꽃가루
    const cols = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#F472B6', glowC]
    const n = Math.round(30 + 50 * k)
    const fade = sinceFirst > 2500 ? 1 - (sinceFirst - 2500) / 700 : 1
    ctx.save(); ctx.globalAlpha = fade
    for (let i = 0; i < n; i++) {
      const sx0 = ((i * 977) % 1000) / 1000 * w, sp = 0.18 + ((i * 37) % 10) / 40
      const y = -20 + sinceFirst * sp - ((i * 53) % 200)
      if (y < -10 || y > h) continue
      const x = sx0 + Math.sin(sinceFirst / 300 + i) * 18
      ctx.save(); ctx.translate(x, y); ctx.rotate(sinceFirst / 200 + i)
      ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-4, -2, 8, 4); ctx.restore()
    }
    ctx.fillStyle = '#FDE68A'; ctx.font = `900 ${Math.round(30 + 10 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = '#F59E0B'; ctx.shadowBlur = 16; ctx.fillText('👑 1등!', w / 2, top - 120)
    ctx.restore()
  }
}

function drawDoll(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, o: Ov) {
  if (it.doll === 'none') return
  const pass = o.react ? o.wall - o.react.passAt : Infinity
  const dance = pass >= 0 && pass < 1500 // 추월하면 인형이 춤춘다(통통 뛰며 빙글)
  if (dance) y -= Math.abs(Math.sin(pass / 90)) * 16
  const e = it.doll === 'dog' ? '🐶' : it.doll === 'penguin' ? '🐧' : '🦆'
  // 받침 + 스프링
  ctx.fillStyle = shade(pal.dash, -0.5); ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 2
  ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(x + (i % 2 ? 4 : -4), y + 4 - i * 2.4); ctx.stroke()
  // 고개가 까딱
  ctx.save(); ctx.translate(x, y - 12); ctx.rotate(dance ? Math.sin(pass / 70) * 0.7 : Math.sin(o.wall / 140) * 0.22 + o.steer * -0.3)
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
  if (y >= TOP - 2 && y <= TOP + 56 && (x <= 166 || x >= W - 166)) return 'frame'
  if (Math.hypot(x - (W / 2 + 70), y - 46) < 34) return 'charm'
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
  else if (k === 'charm') ctx.arc(W / 2 + 70, 46, 32, 0, Math.PI * 2)
  else if (k === 'frame') { ctx.roundRect(31, TOP - 5, 138, 64, 15); ctx.roundRect(W - 169, TOP - 5, 138, 64, 15) }
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
