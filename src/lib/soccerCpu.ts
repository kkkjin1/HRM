// ⚽ 미니 축구 CPU — 사람과 똑같은 입력(SoccerInput)만 만든다. 반응 지연·조준 오차가 있어 완벽하지 않다.
//   공 가짐: 상대 골대 쪽으로 몰고 가다 수비가 앞에 붙으면 개인기/패스, 슛 거리면 골대 구석을 노려 힘 모아 슛
//   우리 편이 가짐: 앞쪽 빈 곳으로 올라가 패스 받을 자리
//   상대가 가짐: 가장 가까운 CPU가 압박 → 가까우면 태클/박치기, 나머지는 공과 우리 골대 사이
//   굴러가는 공: 가장 가까운 사람이 쫓아감

import {
  CHARGE_SEC, FIELD_H, FIELD_W, GOAL_BOT, GOAL_TOP, NO_INPUT, PR, attackDir, evading, goalOf, homeSpot, ownGoalOf, ownerOf,
  type SoccerInput, type SoccerPlayer, type SoccerState,
} from './soccer'

export interface SoccerCpuMem {
  rnd: () => number
  thinkAt: number // 다음 판단 시각(반응 지연)
  plan: SoccerInput
  chargeUntil: number | null // 슛 힘 모으는 중 → 이 시각에 뗀다
  aimY: number // 노리는 골대 높이
  passAt: number
  actAt: number // 태클·박치기 다음 가능 시각(너무 자주 안 하게)
  skill: number // 0~1 (높을수록 빠르고 정확)
}

export function newSoccerCpuMem(rnd: () => number, skill = 0.6): SoccerCpuMem {
  return { rnd, thinkAt: 0, plan: { ...NO_INPUT }, chargeUntil: null, aimY: FIELD_H / 2, passAt: 0, actAt: 0, skill }
}

const len = (x: number, y: number) => Math.hypot(x, y)

function toward(p: SoccerPlayer, x: number, y: number, stopAt = 6): { dx: number; dy: number } {
  const dx = x - p.x, dy = y - p.y
  const d = len(dx, dy)
  if (d < stopAt) return { dx: 0, dy: 0 }
  return { dx: dx / d, dy: dy / d }
}

export function soccerCpuInput(s: SoccerState, p: SoccerPlayer, m: SoccerCpuMem): SoccerInput {
  const t = s.t
  const b = s.ball
  if (s.phase !== 'play') return { ...NO_INPUT }
  const owner = ownerOf(s)
  const mine = owner?.id === p.id

  // 힘 모으는 중이면 끝까지
  if (m.chargeUntil !== null) {
    if (!mine) m.chargeUntil = null
    else {
      const g = goalOf(p.team)
      const aim = toward(p, g.x, m.aimY, 0)
      if (t >= m.chargeUntil) {
        m.chargeUntil = null
        return { dx: aim.dx, dy: aim.dy, sprint: false, kick: false, act: false, pass: false }
      }
      return { dx: aim.dx * 0.2, dy: aim.dy * 0.2 + 0.0001, sprint: false, kick: true, act: false, pass: false }
    }
  }

  // 반응 지연: 판단은 가끔, 그 사이엔 마지막 계획대로 (버튼은 한 번만)
  const react = 0.12 + (1 - m.skill) * 0.18
  if (t < m.thinkAt) return { ...m.plan, act: false, pass: false, kick: false }
  m.thinkAt = t + react * (0.7 + m.rnd() * 0.6)

  const mates = s.players.filter(o => o.team === p.team && o.id !== p.id)
  const foes = s.players.filter(o => o.team !== p.team)
  const dir = attackDir(p.team)
  let plan: SoccerInput = { ...NO_INPUT }

  if (mine) {
    const g = goalOf(p.team)
    const distGoal = len(g.x - p.x, g.y - p.y)
    // 앞을 막는 수비
    const blocker = foes
      .map(f => ({ f, d: len(f.x - p.x, f.y - p.y), ahead: (f.x - p.x) * dir }))
      .filter(o => o.ahead > -10 && o.d < 90)
      .sort((a, z) => a.d - z.d)[0]
    // 슛
    if (distGoal < 300 + m.skill * 60 && Math.abs(p.y - g.y) < 230) {
      m.aimY = m.rnd() < 0.5 ? GOAL_TOP + 16 + m.rnd() * 22 : GOAL_BOT - 16 - m.rnd() * 22
      // 실력이 낮으면 조준이 흔들림
      m.aimY += (m.rnd() - 0.5) * (1 - m.skill) * 120
      const power = 0.55 + m.rnd() * 0.4
      m.chargeUntil = t + CHARGE_SEC * power
      const aim = toward(p, g.x, m.aimY, 0)
      m.plan = { dx: aim.dx, dy: aim.dy, sprint: false, kick: false, act: false, pass: false }
      return { dx: aim.dx, dy: aim.dy, sprint: false, kick: true, act: false, pass: false }
    }
    // 막히면: 개인기 or 패스
    if (blocker && blocker.d < 55) {
      const danger = blocker.f.act === 'tackle' || blocker.f.act === 'check' || blocker.d < 40
      if (danger && t >= p.dodgeCool && m.rnd() < 0.35 + m.skill * 0.4) {
        // 수비 옆으로 피하기
        const side = p.y < blocker.f.y ? -1 : 1
        plan = { dx: dir * 0.6, dy: side, sprint: true, kick: false, act: true, pass: false }
        m.plan = { ...plan, act: false }
        return plan
      }
      const free = mates.find(o => foes.every(f => len(f.x - o.x, f.y - o.y) > 60))
      if (free && t >= m.passAt && m.rnd() < 0.5) {
        const to = toward(p, free.x, free.y, 0)
        m.passAt = t + 1.2
        plan = { dx: to.dx, dy: to.dy, sprint: false, kick: false, act: false, pass: true }
        m.plan = { ...plan, pass: false }
        return plan
      }
    }
    // 몰고 가기 — 수비를 피해 휘어서
    const tx = g.x - dir * 60
    let ty = g.y + (p.y < FIELD_H / 2 ? -40 : 40)
    if (blocker) ty = p.y + (p.y < blocker.f.y ? -90 : 90)
    ty = Math.max(40, Math.min(FIELD_H - 40, ty))
    const mv = toward(p, tx, ty)
    plan = { dx: mv.dx, dy: mv.dy, sprint: p.stamina > 0.35 && !blocker, kick: false, act: false, pass: false }
    m.plan = plan
    return plan
  }

  // 공을 쫓을 사람: 우리 팀(사람 포함) 중 공에 가장 가까운 사람
  const myD = len(b.x - p.x, b.y - p.y)
  const closestMate = mates.every(o => len(b.x - o.x, b.y - o.y) > myD - 4)

  if (owner && owner.team === p.team) {
    // 지원: 공 가진 사람보다 앞, 반대쪽 높이
    const tx = Math.max(60, Math.min(FIELD_W - 60, owner.x + dir * 130))
    const ty = owner.y < FIELD_H / 2 ? owner.y + 150 : owner.y - 150
    const mv = toward(p, tx, Math.max(50, Math.min(FIELD_H - 50, ty)), 18)
    plan = { dx: mv.dx, dy: mv.dy, sprint: p.stamina > 0.6, kick: false, act: false, pass: false }
  } else if (owner && owner.team !== p.team) {
    if (closestMate) {
      // 압박: 공 가진 사람의 앞(우리 골대 쪽)을 막으며 붙기
      const og = ownGoalOf(p.team)
      const lead = 0.18 + (1 - m.skill) * 0.1
      const tx = owner.x + owner.vx * lead + (og.x - owner.x) * 0.06
      const ty = owner.y + owner.vy * lead
      const d = len(owner.x - p.x, owner.y - p.y)
      const mv = toward(p, tx, ty, 0)
      plan = { dx: mv.dx, dy: mv.dy, sprint: p.stamina > 0.25, kick: false, act: false, pass: false }
      if (t >= m.actAt && !evading(owner, t)) {
        if (d < PR * 2 + 34 && d > PR * 2 + 6 && m.rnd() < 0.35 + m.skill * 0.25) {
          m.actAt = t + 0.9 + m.rnd() * 0.8
          plan = { ...plan, kick: true } // 태클
          m.plan = { ...plan, kick: false }
          return plan
        }
        if (d < PR * 2 + 16 && t >= p.checkCool && m.rnd() < 0.5) {
          m.actAt = t + 0.6
          plan = { ...plan, act: true } // 박치기
          m.plan = { ...plan, act: false }
          return plan
        }
      }
    } else {
      // 커버: 공과 우리 골대 사이
      const og = ownGoalOf(p.team)
      const k = 0.45
      const tx = owner.x + (og.x - owner.x) * k
      const ty = owner.y + (og.y - owner.y) * k + (p.slot % 2 ? 40 : -40)
      const mv = toward(p, tx, ty, 14)
      plan = { dx: mv.dx, dy: mv.dy, sprint: p.stamina > 0.5, kick: false, act: false, pass: false }
    }
  } else {
    // 굴러가는 공
    if (closestMate || myD < 60) {
      const lead = Math.min(0.5, myD / 400)
      const mv = toward(p, b.x + b.vx * lead, b.y + b.vy * lead, 0)
      plan = { dx: mv.dx, dy: mv.dy, sprint: p.stamina > 0.2, kick: false, act: false, pass: false }
    } else {
      const h = homeSpot(p.team, p.slot, s.size)
      const tx = h.x + (b.x - h.x) * 0.45
      const ty = h.y + (b.y - h.y) * 0.35
      const mv = toward(p, tx, ty, 14)
      plan = { dx: mv.dx, dy: mv.dy, sprint: false, kick: false, act: false, pass: false }
    }
  }
  // 조금 흔들기
  plan.dx += (m.rnd() - 0.5) * (1 - m.skill) * 0.4
  plan.dy += (m.rnd() - 0.5) * (1 - m.skill) * 0.4
  m.plan = plan
  return plan
}
