// 비거리 야구 난이도 점검용 타율 시뮬레이터 — node scripts/baseball-sim.cjs
// baseball.ts 규칙(judgeSwing·simulateGame·randomPitch)을 그대로 떼어 가상 타자로 수천 타석을 돌린다.
// 목표(2026-09-30): 아주 정확한 타자(±8~12ms) ≈ 3할, 보통(±35ms) ≈ 2할. HIT_RATE 등을 바꾸면 이걸로 다시 확인.
// 타자 모델: 스윙 타이밍 오차 ~ N(0, sigma) ms. 존 밖 공엔 chaseRate 확률로 헛손질(나머지는 참음), 존 안 공은 항상 스윙.
/* eslint-disable @typescript-eslint/no-require-imports -- 빌드와 무관한 순수 node 점검 스크립트 */
const fs = require('fs')
const path = require('path')
const HRM = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [HRM] }))
const src = fs.readFileSync(path.join(HRM, 'src/lib/baseball.ts'), 'utf8').replace(/^export /gm, '') +
  '\nmodule.exports = { judgeSwing, simulateGame, randomPitch, pitchHeight, ZONE_EDGE }'
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const m = { exports: {} }
new Function('module', 'exports', js)(m, m.exports)
const B = m.exports

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }

function run(sigma, chaseRate, games = 4000) {
  let ab = 0, hits = 0, hr = 0, k = 0, bb = 0, pa = 0, go = 0, fo = 0
  for (let g = 0; g < games; g++) {
    const events = []
    for (let n = 0; n < 60; n++) {
      const st = B.simulateGame(events)
      if (st.finished) break
      const p = B.randomPitch()
      const outZone = p.type === 'ball' || Math.abs(B.pitchHeight(p)) > B.ZONE_EDGE
      const swing = p.type === 'hbp' ? false : outZone ? Math.random() < chaseRate : true
      const r = B.judgeSwing(swing ? gauss() * sigma : null, p)
      events.push({ type: p.type, speed: p.speed, outcome: r.outcome, distance: r.distance, offset: 0 })
    }
    const st = B.simulateGame(events)
    for (const r of st.results) {
      pa++
      if (r.kind === 'BB' || r.kind === 'HBP') { bb++; continue }
      ab++
      if (r.kind === '1B' || r.kind === '2B' || r.kind === 'HR') hits++
      if (r.kind === 'HR') hr++
      if (r.kind === 'K') k++
      if (r.kind === 'GO') go++
      if (r.kind === 'FO') fo++
    }
  }
  return { sigma, chaseRate, AVG: (hits / ab).toFixed(3), HRpct: (hr / ab).toFixed(3), K: (k / pa).toFixed(2), BB: (bb / pa).toFixed(2), GO: (go / ab).toFixed(2), FO: (fo / ab).toFixed(2) }
}

for (const [sigma, chase] of [[8, 0.1], [12, 0.2], [20, 0.3], [35, 0.4], [60, 0.5]]) console.log(JSON.stringify(run(sigma, chase)))
