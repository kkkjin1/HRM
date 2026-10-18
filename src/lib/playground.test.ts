import { describe, expect, it } from 'vitest'
import {
  CLIMB_SPEED, GRAB_REACH, GRAVITY, JUMP_V, MTN_L, PATROL_CYCLE_MS, PEAK_X,
  ANGLE_MAX, ANGLE_MIN, ARCH_LINE, BOW_H, DODGE_WAVE_MS, ROPE_CLEAR, ROPE_HALF_MS, ROPE_PERIOD_MS, TARGET_X,
  STONE_VMAX, STONE_X0, arrowPos, bossCatching, bossLook, curlScore, dodgeWave, grabTarget, hitBy, liveObstacles, modeOf, ropeBeat, ropeNeed, stoneStep,
  slopeHeight, waveOf, type Mode,
} from '@/lib/playground'

// 사람 흉내 봇: → 를 계속 누르고 오르며, 다가오는 땅 장애물이 "체공 절반 시점에 겹치도록" 뛴다(정규분포 오차 sd ms).
// 날아오는 💬는 뛰지 않고 지나가게 둔다. 실제 사람은 멈추거나 물러설 수도 있어서 이 봇보단 조금 유리하다.
const deaths: Record<string, number> = {}
function climb(day: string, t0: number, sdMs: number, rnd: () => number, mode: Mode = 'landslide') {
  const dt = 1 / 120
  const half = JUMP_V / GRAVITY
  let x = MTN_L + 1, jy = 0, vy = 0, t = t0
  let planned: { at: number; id: string } | null = null
  const jumped = new Set<string>()
  while (x < PEAK_X) {
    const obs = liveObstacles(day, t, [], mode)
    if (jy === 0 && !planned) {
      const next = obs.filter(o => o.kind !== 'ping' && o.x > x && !jumped.has(o.id)).sort((a, b) => a.x - b.x)[0]
      if (next) {
        const meet = (next.x - x) / (next.speed + CLIMB_SPEED)
        if (meet < half + 0.25) {
          const g = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())
          planned = { at: t + Math.max(0, (meet - half) * 1000 + g * sdMs), id: next.id }
        }
      }
    }
    if (planned && t >= planned.at && jy === 0) { vy = JUMP_V; jumped.add(planned.id); planned = null }
    if (vy !== 0 || jy > 0) {
      jy += vy * dt
      vy -= GRAVITY * dt
      if (jy <= 0) { jy = 0; vy = 0 }
    }
    x += CLIMB_SPEED * dt
    t += dt * 1000
    const h = hitBy(x, jy, obs)
    if (h) { deaths[h.kind + (jy > 0 ? "-air" : "-ground")] = (deaths[h.kind + (jy > 0 ? "-air" : "-ground")] ?? 0) + 1; return false }
  }
  return true
}

describe('퇴근산 장애물 흐름', () => {
  it('같은 날짜·묶음이면 모두 같은 장애물을 본다', () => {
    expect(waveOf('2026-10-16', 42)).toEqual(waveOf('2026-10-16', 42))
    expect(waveOf('2026-10-16', 42)).not.toEqual(waveOf('2026-10-17', 42))
  })

  it('난이도 리포트(반응 오차별 한 번에 넘을 확률)', () => {
    let r = 7
    const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 }
    const rates: Record<number, number> = {}
    for (const sd of [0, 25, 40, 60]) {
      let win = 0
      const N = 600
      for (let i = 0; i < N; i++) if (climb('2026-10-16', 1_000_000 + i * 7919, sd, rnd)) win++
      rates[sd] = win / N
      console.log(`sd ${sd}ms → 한 번에 넘을 확률 ${(win / N * 100).toFixed(1)}%`, JSON.stringify(deaths)); for (const k in deaths) delete deaths[k]
    }
    // 완벽하게 하면 어느 정도는 넘을 수 있어야 한다(운에만 맡기는 게임이 되지 않게)
    expect(rates[0]).toBeGreaterThan(0.15)
  })
})

describe('붙잡기', () => {
  const at = (x: number, jy = 0, tumbling = false) => ({ x, jy, tumbling })
  it('바로 앞(정상 쪽) 사람만, 가장 가까운 사람을 잡는다', () => {
    const me = at(300)
    expect(grabTarget(me, [{ id: 'a', ...at(300 + GRAB_REACH) }, { id: 'b', ...at(310) }])).toBe('b')
    expect(grabTarget(me, [{ id: 'behind', ...at(290) }])).toBeNull()
    expect(grabTarget(me, [{ id: 'far', ...at(300 + GRAB_REACH + 1) }])).toBeNull()
  })
  it('내가 공중이거나, 상대가 높이 뛰었거나 굴러떨어지는 중이면 못 잡는다', () => {
    expect(grabTarget(at(300, 5), [{ id: 'a', ...at(310) }])).toBeNull()
    expect(grabTarget(at(300), [{ id: 'a', ...at(310, 30) }])).toBeNull()
    expect(grabTarget(at(300), [{ id: 'a', ...at(310, 0, true) }])).toBeNull()
  })
  it('산 밖(평지)에서는 안 된다', () => {
    expect(grabTarget(at(MTN_L - 20), [{ id: 'a', ...at(MTN_L - 5) }])).toBeNull()
  })
})

describe('요일별 방식', () => {
  it('요일 → 퇴근길 (월·주말 산사태, 화 복도 탈출, 수 탄막 피하기, 목 양궁, 금 줄넘기)', () => {
    expect(modeOf('2026-10-19')).toBe('landslide') // 월
    expect(modeOf('2026-10-20')).toBe('patrol')
    expect(modeOf('2026-10-21')).toBe('dodge')
    expect(modeOf('2026-10-22')).toBe('archery')
    expect(modeOf('2026-10-16')).toBe('rope')
    expect(modeOf('2026-10-17')).toBe('landslide') // 토
  })

  it('장애물(산사태)은 월요일 산에만 — 다른 퇴근길엔 없다', () => {
    for (const mode of ['patrol', 'dodge', 'archery', 'curling', 'rope'] as Mode[]) {
      for (let k = 0; k < 50; k++) expect(waveOf('2026-10-20', k, mode)).toEqual([])
    }
  })

  it('무대 높이: 산사태 = 산, 나머지(컬링 포함)는 평지', () => {
    expect(slopeHeight(PEAK_X, 'landslide')).toBeGreaterThan(0)
    expect(slopeHeight(PEAK_X, 'curling')).toBe(0)
    for (const mode of ['patrol', 'dodge', 'archery', 'rope'] as Mode[]) expect(slopeHeight(PEAK_X, mode)).toBe(0)
  })

  it('부장님: 주기마다 경고(흠?) 뒤에만 돌아보고, 돌아본 직후는 봐준다', () => {
    const day = '2026-10-20'
    let looks = 0, fakes = 0
    for (let k = 100; k < 300; k++) {
      const states: string[] = []
      for (let t = k * PATROL_CYCLE_MS; t < (k + 1) * PATROL_CYCLE_MS; t += 10) states.push(bossLook(day, t))
      const firstWarn = states.indexOf('warn'), firstLook = states.indexOf('look')
      expect(firstWarn).toBeGreaterThan(0)
      if (firstLook < 0) fakes++
      else {
        looks++
        expect(firstLook).toBeGreaterThan(firstWarn) // 경고 없이 돌아보지 않는다
        const t0 = k * PATROL_CYCLE_MS + firstLook * 10
        expect(bossCatching(day, t0)).toBe(false) // 돌아본 순간은 봐줌
        expect(bossCatching(day, t0 + 200)).toBe(true)
      }
    }
    expect(fakes).toBeGreaterThan(20)
    expect(looks).toBeGreaterThan(fakes)
  })
})

describe('퇴근 컬링', () => {
  // 힘 power로 밀고, sweepFrom~sweepTo(초) 동안 스위핑했을 때 멈추는 x
  function slide(power: number, sweepFrom = 0, sweepTo = 0) {
    let st = { x: STONE_X0, v: power * STONE_VMAX }, t = 0
    while (st.v > 0) { st = stoneStep(st, t >= sweepFrom && t < sweepTo, 1 / 120); t += 1 / 120 }
    return st.x
  }
  it('스위핑 없이도 딱 맞는 힘이면 10점, 너무 약하면 호그라인 0점, 너무 세면 백라인 0점', () => {
    let best = 0
    for (let pw = 0.3; pw <= 1; pw += 0.002) best = Math.max(best, curlScore(slide(pw)))
    expect(best).toBe(10)
    expect(curlScore(slide(0.3))).toBe(0)
    expect(curlScore(slide(1))).toBe(0)
  })
  it('살짝 약하게 민 스톤도 스위핑으로 하우스까지 보낼 수 있다', () => {
    const weak = 0.6
    expect(curlScore(slide(weak))).toBeLessThan(6)
    let best = 0
    for (let from = 0; from < 3; from += 0.05) best = Math.max(best, curlScore(slide(weak, from, from + 1.2)))
    expect(best).toBeGreaterThanOrEqual(8)
  })
})

describe('업무 탄막 피하기', () => {
  it('옆에서 오는 탄은 묶음 경계를 넘어서도 600ms 이상 간격(낮은·높은 탄 동시 도착 없음)', () => {
    for (const day of ['2026-10-21', '2026-10-28', '2026-11-04']) {
      const starts: number[] = []
      for (let k = 0; k < 300; k++) for (const s of dodgeWave(day, k)) if (s.kind !== 'drop') starts.push(s.start)
      starts.sort((a, b) => a - b)
      for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(599)
      expect(starts.length / 300).toBeGreaterThan(1) // 2초 묶음마다 평균 1발 넘게
      expect(DODGE_WAVE_MS).toBe(2000)
    }
  })
})

describe('옥상 양궁', () => {
  it('바람·과녁 높이가 어떻든 정확히 쏘면 정중앙(오차 7px 안)을 맞힐 각도·힘 조합이 있다', () => {
    for (const wind of [-1, -0.5, 0, 0.5, 1]) {
      for (const th of [50, 72, 94]) {
        let best = Infinity
        for (let a = ANGLE_MIN; a <= ANGLE_MAX; a += 0.005) {
          for (let pw = 0.35; pw <= 1; pw += 0.005) {
            for (let s = 0; s < 3; s += 1 / 240) {
              const p = arrowPos(ARCH_LINE + 10, a, pw, wind, s)
              if (p.h <= 0) break
              if (p.x >= TARGET_X) { best = Math.min(best, Math.abs(p.h - th)); break }
            }
          }
        }
        expect(best, `wind ${wind} target ${th}`).toBeLessThan(7)
      }
    }
    expect(BOW_H).toBeGreaterThan(0)
  })
})

describe('단체 줄넘기', () => {
  it('어려워졌지만 사람이 넘을 수 있는 박자다(한 번 뛰고 착지해 다음 박자에 다시 뛸 수 있음)', () => {
    const airtime = (2 * 430) / 1500 * 1000 // JUMP_V / GRAVITY 기준 체공 ms
    expect(ROPE_PERIOD_MS).toBeLessThan(900)
    expect(ROPE_PERIOD_MS).toBeGreaterThan(airtime + 100)
    // 바닥에 닿기 전후 ROPE_HALF_MS 동안 ROPE_CLEAR 위에 있을 수 있는 점프 시작 구간이 0.2초 이상
    const above = (h: number) => { const a = -750, b = 430, c = -h; const d = Math.sqrt(b * b - 4 * a * c); return [(-b + d) / (2 * a), (-b - d) / (2 * a)] }
    const [t1, t2] = above(ROPE_CLEAR)
    expect((t2 - t1) * 1000 - 2 * ROPE_HALF_MS).toBeGreaterThan(200)
    expect(ropeNeed(1)).toBeGreaterThanOrEqual(16)
  })

  it('가장 가까운 박자 기준 오프셋, 인원이 많을수록 목표 횟수는 적다', () => {
    expect(ropeBeat(ROPE_PERIOD_MS * 7 + 30)).toEqual({ k: 7, off: 30 })
    expect(ropeBeat(ROPE_PERIOD_MS * 7 - 30)).toEqual({ k: 7, off: -30 })
    expect(ropeNeed(1)).toBeGreaterThan(ropeNeed(2))
    expect(ropeNeed(2)).toBeGreaterThan(ropeNeed(5))
  })
})
