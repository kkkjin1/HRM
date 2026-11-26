// 🗨 호떡 한마디 — 홈 카드에서 가끔 말풍선으로 말한다.
// 세 종류: 들어왔을 때 이름 불러 인사 · 상태에 맞춘 조르기(누르면 그 행동) · 그냥 수다(시간대·요일·나이).
// 판정은 화면만(서버 기록 없음). 같은 말이 연달아 나오지 않게 직전 말은 뺀다.
import { SHOP, decoPieces, shortName, stageOf, STAGES, unlockLeft, walkLeft, openMealSlot, type PetState } from '@/lib/pet'

export type TalkAction = 'feed' | 'poop' | 'snack' | 'play' | 'pat' | 'shop' | 'walk'
export type Talk = { text: string; action?: TalkAction }

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

function kstNow(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3600_000)
  return { h: d.getUTCHours(), dow: d.getUTCDay() } // 0=일
}

// 들어왔을 때 한 번 — 최애면 반갑게, 서운하면 새침하게
export function greetLine(s: PetState, myName: string, best: string | null, worst: string | null): Talk {
  const n = shortName(myName)
  if (best === s.me) return pick([{ text: `${n}님!! 제일 보고 싶었어요 💛` }, { text: `${n}님 왔다!! 꼬리 붕붕 💛` }])
  if (worst === s.me) return pick([{ text: `…${n}님 왔어요? 흥 💢` }, { text: `${n}님… 요즘 서운해요 🥺` }])
  const { h } = kstNow(s.now)
  if (h < 11) return pick([{ text: `${n}님 좋은 아침이에요 ☀️` }, { text: `${n}님 출근했다멍! 🐾` }])
  if (h < 14) return pick([{ text: `${n}님 점심 맛있게 드셨어요? 🍱` }, { text: `${n}님 왔다멍! 🐾` }])
  if (h < 18) return pick([{ text: `${n}님 오후도 힘내요 멍! 💪` }, { text: `${n}님 놀러 왔어요? 🐾` }])
  return pick([{ text: `${n}님 아직 일해요…? 🌙` }, { text: `${n}님 야근 금지 멍! 🌙` }])
}

// 지금 상태로 할 수 있는 조르기들
export function requestLines(s: PetState, myName: string): Talk[] {
  const n = shortName(myName)
  const out: Talk[] = []
  const open = openMealSlot(s)
  if (open && !open.feeders.includes(s.me)) out.push(pick([{ text: `${n}님, 밥 주세요! 🍚`, action: 'feed' as const }, { text: '배고파요… 한 숟갈만 🥣', action: 'feed' as const }]))
  if (s.poops.length) out.push({ text: '똥 쌌어요… 치워 주세요 💩', action: 'poop' })
  if (walkLeft(s)) out.push({ text: '산책 가요!! 지금 가요!! 🦮', action: 'walk' })
  if (unlockLeft(s, 'snack').left > 0) out.push(pick([{ text: '간식… 간식 주세요 🦴', action: 'snack' as const }, { text: '킁킁 간식 냄새 나요 🦴', action: 'snack' as const }]))
  if (unlockLeft(s, 'play').left > 0) out.push({ text: '놀아 주세요! 심심해요 🎾', action: 'play' })
  if (unlockLeft(s, 'pat').left > 0) out.push({ text: '쓰담쓰담 해 주세요~ ✋', action: 'pat' })
  const owned = new Set(s.items.map(i => i.item))
  if (!SHOP.some(x => x.house && owned.has(x.key))) out.push(pick([{ text: '제 집 사 주세요… 🏠', action: 'shop' as const }, { text: '밖에서 자기 추워요… 집 🏠', action: 'shop' as const }]))
  if (!SHOP.some(x => !x.house && !x.deco && owned.has(x.key))) out.push({ text: '장난감 갖고 싶어요 🧸', action: 'shop' })
  // 거의 다 모인 물건이 있으면 콕 집어서
  const near = SHOP.filter(x => !owned.has(x.key)).map(x => {
    const funded = (s.funds ?? []).filter(f => f.item === x.key).reduce((a, f) => a + f.amount, 0)
    return { x, funded, left: x.price - funded }
  }).filter(v => v.funded > 0 && v.left > 0 && !(v.x.deco && decoPieces(s, v.x.key).got === 0 && v.funded < 10)).sort((a, b) => a.left - b.left)[0]
  if (near) out.push({ text: `${near.x.icon} ${near.x.label}, 🪙${near.left}만 더 모으면 돼요!`, action: 'shop' })
  else if (s.coins >= 10) out.push({ text: `${n}님 코인 있잖아요… 상점 가요 🪙`, action: 'shop' })
  if ((s.miss_streak?.[s.me] ?? 0) >= 2) out.push({ text: `${n}님… 저 잊었어요? 밥… 😢`, action: open ? 'feed' : undefined })
  return out
}

// 그냥 수다
export function chatLines(s: PetState, myName: string, bestName: string | null): Talk[] {
  const n = shortName(myName)
  const age = Math.max(1, s.pet?.age ?? 1)
  const st = stageOf(age)
  const next = STAGES.find(x => x.from > age)
  const { h, dow } = kstNow(s.now)
  const xs: string[] = [
    '오늘도 파이팅 멍! 🐾', '꼬리 흔드는 중~ 🐕', '인사팀 최고 멍! 👍', '결재는 멍멍 도장으로 🐾',
    '회의 너무 길지 않아요…? 🥱', `${n}님 오늘 표정 좋아 보여요!`, '물 마시는 거 잊지 마요 💧', '스트레칭 한 번 해요~ 🙆',
    `벌써 D+${age}! 쑥쑥 크는 중 🌱`, `저 ${st.rank}이에요! 열심히 할게요 멍`,
  ]
  if (next) xs.push(`${next.from - age}일 뒤에 ${next.rank} 승진해요! 🎉`)
  if (bestName && bestName !== myName) xs.push(`${shortName(bestName)}님 보고 싶다… 💛`)
  if (h < 11) xs.push('아침엔 산책이 최고예요 ☀️', '모닝 커피 대신 모닝 간식? 🦴')
  else if (h < 14) xs.push('점심 뭐 먹었어요? 냄새 나요 킁킁')
  else if (h < 17) xs.push('오후엔 졸려요… 🥱', '3시엔 간식 시간 아닌가요? 🦴')
  else xs.push('퇴근 언제 해요? 🌆', '오늘 하루 수고했어요 멍 🌙')
  if (dow === 1) xs.push('월요일… 같이 힘내요 멍 😤')
  if (dow === 5) xs.push('불금이다멍!! 🎉')
  return xs.map(text => ({ text }))
}

// 자는 중 잠꼬대
export const SLEEP_TALK: Talk[] = [{ text: '쿨쿨… 간식… 💤' }, { text: '음냐… 공… 💤' }, { text: '…산책… 💤' }]
