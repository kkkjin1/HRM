'use client'

// PC 시계 대신 서버 시각 기준으로 "오늘"·레이스 출발 순간을 맞추기 위한 오프셋(서버 시각 = Date.now() + offset).
// 1순위: /api/time(서버 Date.now(), ms 단위)을 5번 재서 왕복이 가장 짧은 값 — 왕복 절반만큼 보정해 오차 수십 ms.
// 2순위(실패 시): 정적 파일(HEAD /icon.png)의 Date 헤더 — 초 단위라 ±0.5초.
// 2026-11-05: 예전엔 Date 헤더만 써서 PC마다 최대 1초 어긋나 레이스 출발이 제각각이었다.
// 앱 전체에서 한 번만 잰다.

let offsetPromise: Promise<number> | null = null

async function byApi(): Promise<number | null> {
  const samples: { off: number; rtt: number }[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now()
    const res = await fetch(`/api/time?t=${t0}`, { cache: 'no-store' })
    const t1 = Date.now()
    if (!res.ok) return null
    const j = (await res.json().catch(() => null)) as { now?: number } | null
    if (typeof j?.now !== 'number') return null
    samples.push({ off: j.now - (t0 + t1) / 2, rtt: t1 - t0 })
  }
  return samples.sort((a, b) => a.rtt - b.rtt)[0].off
}

async function byDateHeader(): Promise<number> {
  const samples: { off: number; rtt: number }[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    const res = await fetch(`/icon.png?t=${t0}`, { method: 'HEAD', cache: 'no-store' })
    const t1 = Date.now()
    const d = res.headers.get('date')
    if (d) samples.push({ off: new Date(d).getTime() + 500 - (t0 + t1) / 2, rtt: t1 - t0 })
  }
  return samples.length ? samples.sort((a, b) => a.rtt - b.rtt)[0].off : 0
}

export function getServerOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = (async () => {
      try {
        const off = await byApi()
        if (off !== null) return off
      } catch { /* 아래로 */ }
      try { return await byDateHeader() } catch { return 0 }
    })()
  }
  return offsetPromise
}

// 한국 날짜(YYYY-MM-DD)
export function kstDate(ms: number) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
