// 🏎 퇴근 레이싱 — 시상식(레이스 끝) 그리기. canvas 2D, 순수 함수.
// 1·2·3등 차를 단상(2-1-3 배치) 위에 크게 그린다. 차 그림은 레이스·차고와 같은 drawKart(뒤에서 본 외관 그대로).
// 이름·기록 글자는 RaceArena가 HTML로 얹는다(PODIUM 좌표를 같이 쓴다).

import { drawKart, type ChaseCar } from '@/components/playground/raceChase'
import type { Theme } from '@/lib/raceCourses'

export const PODIUM_GROUND = 0.86 // 땅 높이(화면 높이 비율)
export const PODIUM_KART_SC = 2.3
// 순위별 단상(가운데 x 오프셋·높이·색) — 0 = 1등
export const PODIUM = [
  { dx: 0, h: 92, color: '#FACC15', edge: '#CA8A04' },
  { dx: -210, h: 62, color: '#E2E8F0', edge: '#94A3B8' },
  { dx: 210, h: 44, color: '#F59E0B', edge: '#B45309' },
]
const BLOCK_W = 170

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }

// top = 1~3등(순서대로, 없으면 빈 단상), wall = 애니메이션 시각
export function drawPodium(ctx: CanvasRenderingContext2D, w: number, h: number, th: Theme, top: ChaseCar[], wall: number) {
  const gy = Math.round(h * PODIUM_GROUND)
  // 하늘
  const sky = ctx.createLinearGradient(0, 0, 0, gy)
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(0.6, th.sky[1]); sky.addColorStop(1, th.sky[2])
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, gy + 1)
  // 조명 빛줄기
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const [x0, sw] of [[w / 2 - 300, 1], [w / 2 + 300, -1]] as const) {
    const a = 0.1 + Math.sin(wall / 700 + sw) * 0.04
    const g = ctx.createLinearGradient(x0, 0, w / 2, gy)
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(x0 - 20, 0); ctx.lineTo(x0 + 20, 0); ctx.lineTo(w / 2 + sw * 180 + 140, gy); ctx.lineTo(w / 2 + sw * 180 - 140, gy); ctx.fill()
  }
  ctx.restore()
  // 땅(레드카펫)
  ctx.fillStyle = th.ground[0]; ctx.fillRect(0, gy, w, h - gy)
  ctx.fillStyle = '#B91C1C'
  ctx.beginPath(); ctx.moveTo(w / 2 - 330, h); ctx.lineTo(w / 2 + 330, h); ctx.lineTo(w / 2 + 290, gy); ctx.lineTo(w / 2 - 290, gy); ctx.fill()

  // 단상 + 차(뒤 단상부터)
  for (const i of [1, 2, 0]) {
    const p = PODIUM[i]
    const cx = w / 2 + p.dx, ty = gy - p.h
    // 윗면
    ctx.fillStyle = p.edge
    ctx.beginPath(); ctx.moveTo(cx - BLOCK_W / 2, ty); ctx.lineTo(cx + BLOCK_W / 2, ty); ctx.lineTo(cx + BLOCK_W / 2 - 12, ty - 10); ctx.lineTo(cx - BLOCK_W / 2 + 12, ty - 10); ctx.fill()
    // 앞면
    const g = ctx.createLinearGradient(0, ty, 0, gy)
    g.addColorStop(0, p.color); g.addColorStop(1, p.edge)
    ctx.fillStyle = g; ctx.fillRect(cx - BLOCK_W / 2, ty, BLOCK_W, p.h)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.font = `900 ${i === 0 ? 40 : 30}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), cx, ty + p.h / 2 + 2)
    const c = top[i]
    if (!c) continue
    const bounce = i === 0 ? Math.abs(Math.sin(wall / 260)) * 5 : 0
    drawKart(ctx, cx, ty - 6 - bounce, PODIUM_KART_SC, { ...c, fx: '' }, wall, false)
  }

  // 꽃가루
  const cols = ['#F87171', '#FACC15', '#34D399', '#60A5FA', '#FB923C', '#F9FAFB']
  for (let i = 0; i < 70; i++) {
    const sp = 0.03 + hash(i + 3) * 0.05
    const x = ((hash(i) * w + Math.sin(wall / 600 + i) * 20) % w + w) % w
    const y = ((hash(i + 11) * h + wall * sp) % (h + 20)) - 10
    ctx.save(); ctx.translate(x, y); ctx.rotate(wall / 300 + i)
    ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-3, -1.5, 6, 3)
    ctx.restore()
  }
}
