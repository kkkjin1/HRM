'use client'

// PC 시계 대신 서버 시각 기준으로 "오늘"을 정하기 위한 오프셋. 같은 출처 정적 파일(HEAD /icon.png,
// proxy 인증 대상 아님)의 Date 헤더를 3번 재서 왕복이 가장 짧은 값을 쓴다(초 단위 헤더라 ±0.5초).
// 앱 전체에서 한 번만 잰다.

let offsetPromise: Promise<number> | null = null

export function getServerOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = (async () => {
      try {
        const samples: { off: number; rtt: number }[] = []
        for (let i = 0; i < 3; i++) {
          const t0 = Date.now()
          const res = await fetch(`/icon.png?t=${t0}`, { method: 'HEAD', cache: 'no-store' })
          const t1 = Date.now()
          const d = res.headers.get('date')
          if (d) samples.push({ off: new Date(d).getTime() + 500 - (t0 + t1) / 2, rtt: t1 - t0 })
        }
        return samples.length ? samples.sort((a, b) => a.rtt - b.rtt)[0].off : 0
      } catch {
        return 0
      }
    })()
  }
  return offsetPromise
}

// 한국 날짜(YYYY-MM-DD)
export function kstDate(ms: number) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
