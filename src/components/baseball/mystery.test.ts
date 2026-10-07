import { describe, it, expect } from 'vitest'
import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FieldScene, MYSTERY_TELL_FADE_MS, arrivalOf, mysteryBallScale, mysteryTellOpacity, type Anim } from './scene'
import { GaugeBar } from './DuelBits'
import { LINEUP, MYSTERY_TRAVEL_MUL, pitchTravelMs, simulateGame, travelMs, type MysteryKind, type Pitch } from '@/lib/baseball'
import { makeDuelPitch } from '@/lib/baseballDuel'

// 미스터리 피치 화면 — 예고(!?)·특별 게이지는 "발동 여부"만, 공 종류는 릴리스 뒤 공 크기로만

const pitch = (mystery?: MysteryKind): Pitch => ({ id: 'p1', type: 'fastball', speed: 140, alt: 1, slot: 'mid', windup: 1000, height: 0, side: 0, ...(mystery ? { mystery } : {}) })
const anim = (p: Pitch): Anim => ({ pitch: p, start: 0, result: null, resultStart: null, paEnded: null, selfResolve: true })
const scene = (p: Pitch, now: number, viewpoint: 'catcher' | 'pitcher' = 'catcher') => renderToStaticMarkup(createElement(FieldScene, {
  anim: anim(p), now, st: simulateGame([]), prevLandings: [], batter: { name: '타자', nickname: null, color_key: 1, avatar_url: null },
  lineup: LINEUP[1], mode: 'duel', viewpoint, pitcherName: '투수',
}))
const ballR = (html: string) => Number(/<circle[^>]*r="([\d.]+)"[^>]*data-ball/.exec(html)?.[1] ?? NaN)

describe('투수 머리 위 예고(!?)', () => {
  it('미스터리 공만, 공이 나타난 순간부터 보이고 릴리스 직전 200ms 동안 사라진다', () => {
    expect(mysteryTellOpacity(anim(pitch()), 0)).toBe(0)
    expect(mysteryTellOpacity(null, 0)).toBe(0)
    const a = anim(pitch('GIANT'))
    expect(mysteryTellOpacity(a, 0)).toBe(1)
    expect(mysteryTellOpacity(a, 1000 - MYSTERY_TELL_FADE_MS)).toBe(1)
    expect(mysteryTellOpacity(a, 1000 - MYSTERY_TELL_FADE_MS / 2)).toBeCloseTo(0.5, 5)
    expect(mysteryTellOpacity(a, 1000)).toBe(0) // 릴리스
    expect(mysteryTellOpacity(a, 1300)).toBe(0)
  })
  it('타자 화면(포수 시점): 미스터리일 때만 !? 표시, 일반 공엔 없음', () => {
    expect(scene(pitch('MINI'), 300)).toContain('data-mystery-tell')
    expect(scene(pitch(), 300)).not.toContain('data-mystery-tell')
    expect(scene(pitch('MINI'), 1050)).not.toContain('data-mystery-tell') // 릴리스 뒤 사라짐
  })
  it('릴리스 전 화면은 MINI·NORMAL·GIANT가 완전히 같다 — 종류가 드러나지 않는다', () => {
    for (const t of [0, 300, 900]) {
      const [a, b, c] = (['MINI', 'NORMAL', 'GIANT'] as const).map(k => scene(pitch(k), t))
      expect(b).toBe(a)
      expect(c).toBe(a)
      expect(a).not.toMatch(/MINI|GIANT|NORMAL|미니|자이언트/)
    }
  })
  it('릴리스 뒤에는 공 크기로만 드러난다: MINI < NORMAL(=일반 공) < GIANT (같은 비행 진행률에서 비교)', () => {
    const at = (p: Pitch) => 1000 + pitchTravelMs(p) * 0.5 // 비행 절반 지점
    const [mini, normal, giant, plain] = [pitch('MINI'), pitch('NORMAL'), pitch('GIANT'), pitch()].map(p => scene(p, at(p)))
    expect(ballR(mini)).toBeLessThan(ballR(normal))
    expect(ballR(giant)).toBeGreaterThan(ballR(normal))
    expect(ballR(normal)).toBe(ballR(plain))
    expect(mysteryBallScale(anim(pitch('GIANT')))).toBe(3.5)
  })
  it('투수 본인 화면(투수 시점)엔 !?가 없다 — 투수는 특별 게이지로 안다', () => {
    expect(scene(pitch('GIANT'), 300, 'pitcher')).not.toContain('data-mystery-tell')
  })
})

describe('미스터리 공 체류 시간', () => {
  it('미스터리 공은 투수 손 → 홈플레이트 시간이 1.5배(종류 무관), 일반 공은 그대로', () => {
    expect(pitchTravelMs(pitch())).toBe(travelMs(140))
    for (const k of ['MINI', 'NORMAL', 'GIANT'] as const) expect(pitchTravelMs(pitch(k))).toBe(Math.round(travelMs(140) * MYSTERY_TRAVEL_MUL))
  })
  it('판정 기준 도착 시각도 같은 값 — 화면의 공이 홈플레이트에 닿는 순간 = 스윙 타이밍 0ms', () => {
    const a = anim(pitch('GIANT'))
    expect(arrivalOf(a)).toBe(a.start + 1000 + pitchTravelMs(a.pitch))
    expect(arrivalOf(anim(pitch()))).toBe(1000 + travelMs(140))
  })
})

describe('투수 특별 게이지 — 모양만 다르고 구간·속도는 같다', () => {
  const bar = (mystery: boolean, running = true) => renderToStaticMarkup(createElement(GaugeBar, {
    trackRef: createRef<HTMLDivElement>(), markerRef: createRef<HTMLDivElement>(),
    runKey: running ? 1 : null, periodMs: 700, stoppedPos: running ? null : 0.5, feedback: null, mystery,
  }))
  const bands = (html: string) => [...html.matchAll(/left:([\d.]+)%;width:([\d.]+)%/g)].map(m => `${m[1]}/${m[2]}`)
  const anim700 = (html: string) => /bb-gauge 700ms linear infinite/.test(html)
  it('일반 공은 기존 게이지, 미스터리는 특별 게이지(문구·보라 테두리)', () => {
    expect(bar(false)).toContain('data-gauge-kind="normal"')
    expect(bar(false)).not.toContain('MYSTERY')
    expect(bar(true)).toContain('data-gauge-kind="mystery"')
    expect(bar(true)).toContain('🎲 MYSTERY PITCH')
  })
  it('좋음·완벽 구간 위치와 막대 왕복 속도는 같다(제구 난이도 동일)', () => {
    expect(bands(bar(true))).toEqual(bands(bar(false)))
    expect(bands(bar(true)).length).toBeGreaterThanOrEqual(2)
    expect(anim700(bar(true))).toBe(true)
    expect(anim700(bar(false))).toBe(true)
  })
  it('특별 게이지에도 공 종류는 없다', () => {
    expect(bar(true) + bar(true, false)).not.toMatch(/MINI|GIANT|NORMAL|미니|자이언트/)
  })
})

describe('투수·타자가 같은 미스터리 상태', () => {
  it('투수가 실은 공(pitch.mystery)이 타자 예고의 유일한 근거', () => {
    const armed = makeDuelPitch('curve', 'mid', 'normal', 0, () => 0.3, 'mid', 'NORMAL')
    const plain = makeDuelPitch('curve', 'mid', 'normal', 0, () => 0.3, 'mid')
    expect(mysteryTellOpacity(anim(armed), 0)).toBe(1) // NORMAL도 예고는 뜬다(속임수)
    expect(mysteryTellOpacity(anim(plain), 0)).toBe(0)
  })
})
