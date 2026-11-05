// 🏎 퇴근 레이싱 랜덤 코스 — 레이스 시드로 코스 하나를 고른다(모두에게 같다, 통신 추가 없음).
// 코스 = 배경 테마(그림) + 장애물 비중(mix) + 줄 간격(gap). 그림은 전부 canvas 코드라 코스를 늘려도 용량이 거의 안 는다.
// 2026-11-05 추가. 테마 그리기는 components/playground/raceChase.ts(drawSkyline·drawWeather·도로 색).

import { CLASSIC_MIX, makeTrack, type Thing, type TrackMix } from '@/lib/race'

export type Skyline =
  | 'city' | 'brick' | 'tech' | 'tower' | 'hanok' | 'mountain' | 'sea' | 'dunes' | 'trees' | 'stadium' | 'bridge' | 'space' | 'alley'
export type Weather = 'none' | 'rain' | 'snow' | 'petals' | 'leaves' | 'stars' | 'fog' | 'dust' | 'neon'

export type Theme = {
  sky: [string, string, string] // 위 → 지평선
  orb?: { color: string; x: number; r: number; moon?: boolean } // 해·달(x = 화면 가로 비율)
  skyline: Skyline
  far: string // 먼 건물·산 색
  far2?: string // 두 번째 색(창문·불빛·눈 덮인 꼭대기 등)
  ground: [string, string] // 도로 밖 땅(줄무늬 두 색)
  road: [string, string]
  curb: [string, string]
  lane: string
  side: string[] // 길가 장식(이모지)
  weather: Weather
  bg: string // 화면 뒤 바탕색(캔버스 밖)
}

const THEME_DEFS = {
  sunset: { // 기존 퇴근길 노을
    sky: ['#F59E0B', '#FDBA74', '#FDE68A'], orb: { color: '#FB923C', x: 0.72, r: 26 }, skyline: 'city', far: '#9A6B4F', far2: '#FEF3C7',
    ground: ['#65A30D', '#5B9A0C'], road: ['#4B5563', '#475569'], curb: ['#EF4444', '#F9FAFB'], lane: 'rgba(249,250,251,0.75)',
    side: ['🌳', '🚏', '🌳', '🏢'], weather: 'none', bg: '#5B8C3A',
  },
  seongsu: { // 성수동: 붉은 벽돌 공장·카페 거리, 서울숲
    sky: ['#7DD3FC', '#BAE6FD', '#F0F9FF'], orb: { color: '#FDE68A', x: 0.2, r: 20 }, skyline: 'brick', far: '#B4532A', far2: '#3F2A1E',
    ground: ['#A8A29E', '#9C9590'], road: ['#57534E', '#4F4A45'], curb: ['#B4532A', '#E7E5E4'], lane: 'rgba(250,250,249,0.8)',
    side: ['☕', '🧱', '🛍️', '🌳', '🎨', '🥐'], weather: 'none', bg: '#8B8580',
  },
  seongsuNight: { // 성수동 밤: 카페 불빛
    sky: ['#0F172A', '#1E293B', '#92400E'], orb: { color: '#FEF3C7', x: 0.8, r: 14, moon: true }, skyline: 'brick', far: '#5B2A1C', far2: '#FCD34D',
    ground: ['#44403C', '#3E3A36'], road: ['#292524', '#25211F'], curb: ['#9A3412', '#D6D3D1'], lane: 'rgba(253,230,138,0.7)',
    side: ['☕', '🍷', '🛍️', '💡', '🥐'], weather: 'stars', bg: '#2A2522',
  },
  hangang: { // 한강 야경: 다리 + 강 건너 불빛
    sky: ['#0F172A', '#1E3A5F', '#3B5B85'], orb: { color: '#F1F5F9', x: 0.25, r: 15, moon: true }, skyline: 'bridge', far: '#1E293B', far2: '#FDE68A',
    ground: ['#166534', '#14532D'], road: ['#334155', '#2E3A4D'], curb: ['#F59E0B', '#E2E8F0'], lane: 'rgba(226,232,240,0.7)',
    side: ['🌳', '🚲', '🏕️', '🍜'], weather: 'stars', bg: '#14281C',
  },
  pangyo: { // 판교 테크노밸리: 유리 빌딩
    sky: ['#38BDF8', '#7DD3FC', '#E0F2FE'], orb: { color: '#FEF9C3', x: 0.6, r: 22 }, skyline: 'tech', far: '#6B93B8', far2: '#DBEAFE',
    ground: ['#4ADE80', '#3FCF73'], road: ['#4B5563', '#475569'], curb: ['#2563EB', '#F9FAFB'], lane: 'rgba(249,250,251,0.8)',
    side: ['🌳', '💻', '🏢', '☕'], weather: 'none', bg: '#3FA864',
  },
  gangnam: { // 강남대로 밤: 높은 빌딩 불빛
    sky: ['#020617', '#0F172A', '#1E3A5F'], skyline: 'tower', far: '#1F2937', far2: '#FDE047',
    ground: ['#27272A', '#232326'], road: ['#18181B', '#1C1C20'], curb: ['#F43F5E', '#F4F4F5'], lane: 'rgba(244,244,245,0.7)',
    side: ['🏢', '🚕', '💡', '🛍️'], weather: 'neon', bg: '#18181B',
  },
  jeju: { // 제주 해안도로: 바다·한라산
    sky: ['#0EA5E9', '#7DD3FC', '#E0F2FE'], orb: { color: '#FEF08A', x: 0.3, r: 24 }, skyline: 'sea', far: '#0369A1', far2: '#4D7C0F',
    ground: ['#3F3F46', '#36363C'], road: ['#57534E', '#4F4A45'], curb: ['#FB923C', '#F9FAFB'], lane: 'rgba(253,224,71,0.85)',
    side: ['🍊', '🌴', '🗿', '🌼'], weather: 'none', bg: '#2E2E33',
  },
  cherry: { // 여의도 벚꽃길
    sky: ['#FBCFE8', '#FCE7F3', '#FFF7ED'], orb: { color: '#FFFFFF', x: 0.7, r: 20 }, skyline: 'trees', far: '#F9A8D4', far2: '#FDF2F8',
    ground: ['#86EFAC', '#7BE29F'], road: ['#6B7280', '#646B78'], curb: ['#F472B6', '#FDF2F8'], lane: 'rgba(255,255,255,0.85)',
    side: ['🌸', '🌸', '🌳', '📸'], weather: 'petals', bg: '#79C98F',
  },
  autumn: { // 단풍 산길
    sky: ['#FCD34D', '#FDE68A', '#FEF3C7'], orb: { color: '#F97316', x: 0.8, r: 22 }, skyline: 'mountain', far: '#B45309', far2: '#DC2626',
    ground: ['#A16207', '#975B07'], road: ['#57534E', '#4F4A45'], curb: ['#DC2626', '#FEF3C7'], lane: 'rgba(254,243,199,0.8)',
    side: ['🍁', '🍂', '🌲', '🍄'], weather: 'leaves', bg: '#7C4A06',
  },
  winter: { // 눈 내리는 겨울
    sky: ['#94A3B8', '#CBD5E1', '#F1F5F9'], skyline: 'mountain', far: '#64748B', far2: '#F8FAFC',
    ground: ['#F1F5F9', '#E2E8F0'], road: ['#64748B', '#5E6B80'], curb: ['#DC2626', '#FFFFFF'], lane: 'rgba(255,255,255,0.8)',
    side: ['🌲', '⛄', '🎄', '🧣'], weather: 'snow', bg: '#CBD5E1',
  },
  desert: { // 사막
    sky: ['#F97316', '#FDBA74', '#FEF3C7'], orb: { color: '#FEF08A', x: 0.5, r: 30 }, skyline: 'dunes', far: '#D97706', far2: '#B45309',
    ground: ['#FCD34D', '#F6C93F'], road: ['#78716C', '#716A65'], curb: ['#B45309', '#FEF3C7'], lane: 'rgba(254,243,199,0.8)',
    side: ['🌵', '🐪', '🌵', '🦂'], weather: 'dust', bg: '#E8B93A',
  },
  rain: { // 장마철 퇴근길
    sky: ['#334155', '#475569', '#64748B'], skyline: 'city', far: '#1E293B', far2: '#FDE68A',
    ground: ['#3F6212', '#38570F'], road: ['#1F2937', '#243041'], curb: ['#F59E0B', '#CBD5E1'], lane: 'rgba(203,213,225,0.7)',
    side: ['☂️', '🌳', '🚏', '☔'], weather: 'rain', bg: '#2F4A12',
  },
  neon: { // 사이버 네온 고속도로
    sky: ['#020617', '#0C4A6E', '#9F1239'], skyline: 'tower', far: '#0F172A', far2: '#22D3EE',
    ground: ['#0B1020', '#0E1428'], road: ['#111827', '#0F172A'], curb: ['#22D3EE', '#F472B6'], lane: 'rgba(34,211,238,0.8)',
    side: ['💡', '🤖', '🛸', '📡'], weather: 'neon', bg: '#0B1020',
  },
  beach: { // 해변 도로
    sky: ['#38BDF8', '#BAE6FD', '#F0F9FF'], orb: { color: '#FDE047', x: 0.15, r: 26 }, skyline: 'sea', far: '#0284C7', far2: '#FDE68A',
    ground: ['#FDE68A', '#F8DE7E'], road: ['#6B7280', '#646B78'], curb: ['#38BDF8', '#FFFFFF'], lane: 'rgba(255,255,255,0.85)',
    side: ['🌴', '⛱️', '🏄', '🐚'], weather: 'none', bg: '#F2D573',
  },
  stadium: { // 야구장 가는 길
    sky: ['#1D4ED8', '#3B82F6', '#93C5FD'], orb: { color: '#FFFFFF', x: 0.85, r: 16 }, skyline: 'stadium', far: '#475569', far2: '#FEF9C3',
    ground: ['#16A34A', '#15913F'], road: ['#4B5563', '#475569'], curb: ['#1D4ED8', '#F9FAFB'], lane: 'rgba(249,250,251,0.8)',
    side: ['⚾', '🧢', '🌭', '📣', '🍺'], weather: 'none', bg: '#15803D',
  },
  euljiro: { // 을지로 노포 골목
    sky: ['#7C2D12', '#C2410C', '#FDBA74'], skyline: 'alley', far: '#44403C', far2: '#FBBF24',
    ground: ['#57534E', '#4F4A45'], road: ['#3F3F46', '#38383E'], curb: ['#FBBF24', '#E7E5E4'], lane: 'rgba(251,191,36,0.75)',
    side: ['🏮', '🍺', '🔩', '🍖'], weather: 'none', bg: '#3F3A36',
  },
  hanok: { // 북촌 한옥마을
    sky: ['#93C5FD', '#BFDBFE', '#EFF6FF'], orb: { color: '#FEF3C7', x: 0.4, r: 20 }, skyline: 'hanok', far: '#3F3F46', far2: '#A16207',
    ground: ['#A8A29E', '#9F9994'], road: ['#78716C', '#716A65'], curb: ['#57534E', '#E7E5E4'], lane: 'rgba(231,229,228,0.7)',
    side: ['🏯', '🌳', '🪷', '👘'], weather: 'none', bg: '#8F8984',
  },
  space: { // 우주 고속도로(보너스)
    sky: ['#000000', '#0B1026', '#0F172A'], skyline: 'space', far: '#0EA5E9', far2: '#F59E0B',
    ground: ['#0B1026', '#0D1330'], road: ['#1F2937', '#1A2230'], curb: ['#F59E0B', '#E5E7EB'], lane: 'rgba(229,231,235,0.7)',
    side: ['🪐', '🛰️', '☄️', '👽'], weather: 'stars', bg: '#05060F',
  },
} satisfies Record<string, Theme>
export type ThemeKey = keyof typeof THEME_DEFS
export const THEMES: Record<ThemeKey, Theme> = THEME_DEFS

export type Course = { key: string; name: string; theme: ThemeKey; mix: TrackMix; gap?: number }

// 40코스. 같은 테마라도 장애물 구성이 다르다(웅덩이 구간·공사 구간·동물 출몰 등).
export const COURSES: Course[] = [
  { key: 'classic', name: '🌇 퇴근길 노을', theme: 'sunset', mix: CLASSIC_MIX },
  { key: 'sunset-road', name: '🌇 퇴근길 도로공사', theme: 'sunset', mix: { cone: 0.3, barrier: 0.3, pothole: 0.2, pad: 0.2 } },
  { key: 'sunset-rush', name: '🌇 퇴근 러시아워', theme: 'sunset', mix: { cone: 0.3, scooter: 0.25, bump: 0.25, pad: 0.2 }, gap: 0.92 },

  { key: 'seongsu', name: '🧱 성수동 카페거리', theme: 'seongsu', mix: { crowd: 0.3, coffee: 0.25, scooter: 0.2, pad: 0.15, pigeon: 0.1 } },
  { key: 'seongsu-popup', name: '🛍️ 성수동 팝업 대란', theme: 'seongsu', mix: { crowd: 0.5, trash: 0.15, coffee: 0.15, pad: 0.2 }, gap: 0.92 },
  { key: 'seongsu-forest', name: '🌳 서울숲 산책로', theme: 'seongsu', mix: { pigeon: 0.3, puddle: 0.25, scooter: 0.25, pad: 0.2 } },
  { key: 'seongsu-night', name: '🌙 성수동 밤 골목', theme: 'seongsuNight', mix: { crowd: 0.25, trash: 0.2, coffee: 0.2, pothole: 0.15, pad: 0.2 } },

  { key: 'hangang', name: '🌉 한강 야경 드라이브', theme: 'hangang', mix: { duck: 0.3, puddle: 0.2, cone: 0.25, pad: 0.25 } },
  { key: 'hangang-bike', name: '🚲 한강 자전거길', theme: 'hangang', mix: { scooter: 0.35, pigeon: 0.2, bump: 0.25, pad: 0.2 } },

  { key: 'pangyo', name: '💻 판교 테크노밸리', theme: 'pangyo', mix: { scooter: 0.3, cone: 0.25, coffee: 0.25, pad: 0.2 } },
  { key: 'pangyo-build', name: '🏗️ 판교 신사옥 공사', theme: 'pangyo', mix: { barrier: 0.35, tire: 0.2, mud: 0.25, pad: 0.2 } },

  { key: 'gangnam', name: '🌃 강남대로 불금', theme: 'gangnam', mix: { cone: 0.3, trash: 0.2, bump: 0.25, pad: 0.25 } },
  { key: 'gangnam-jam', name: '🚕 강남 퇴근 정체', theme: 'gangnam', mix: { barrier: 0.3, crowd: 0.2, pothole: 0.25, pad: 0.25 }, gap: 0.92 },

  { key: 'jeju', name: '🍊 제주 해안도로', theme: 'jeju', mix: { rock: 0.3, crab: 0.25, sand: 0.2, pad: 0.25 } },
  { key: 'jeju-wind', name: '🌬️ 제주 바람길', theme: 'jeju', mix: { rock: 0.35, leaves: 0.25, crab: 0.2, pad: 0.2 } },

  { key: 'cherry', name: '🌸 여의도 벚꽃길', theme: 'cherry', mix: { crowd: 0.3, pigeon: 0.2, puddle: 0.25, pad: 0.25 } },
  { key: 'cherry-picnic', name: '🧺 벚꽃 피크닉 인파', theme: 'cherry', mix: { crowd: 0.4, trash: 0.2, coffee: 0.2, pad: 0.2 } },

  { key: 'autumn', name: '🍁 단풍 산길', theme: 'autumn', mix: { leaves: 0.3, rock: 0.25, deer: 0.2, pad: 0.25 } },
  { key: 'autumn-storm', name: '🍂 낙엽 폭풍', theme: 'autumn', mix: { leaves: 0.45, deer: 0.2, mud: 0.15, pad: 0.2 } },

  { key: 'winter', name: '❄️ 눈 내리는 퇴근길', theme: 'winter', mix: { ice: 0.35, snowman: 0.25, cone: 0.15, pad: 0.25 } },
  { key: 'winter-ice', name: '🧊 꽁꽁 빙판길', theme: 'winter', mix: { ice: 0.55, snowman: 0.2, pad: 0.25 } },
  { key: 'winter-deer', name: '🦌 겨울 산골짜기', theme: 'winter', mix: { deer: 0.3, ice: 0.25, rock: 0.2, pad: 0.25 } },

  { key: 'desert', name: '🐪 사막 횡단', theme: 'desert', mix: { sand: 0.35, cactus: 0.3, rock: 0.15, pad: 0.2 } },
  { key: 'desert-dune', name: '🏜️ 모래 폭풍', theme: 'desert', mix: { sand: 0.5, cactus: 0.25, pad: 0.25 } },

  { key: 'rain', name: '☔ 장마철 퇴근', theme: 'rain', mix: { puddle: 0.4, cone: 0.2, oil: 0.15, pad: 0.25 } },
  { key: 'rain-flood', name: '💦 물웅덩이 지옥', theme: 'rain', mix: { puddle: 0.55, pothole: 0.2, pad: 0.25 } },
  { key: 'rain-construction', name: '🚧 빗길 공사구간', theme: 'rain', mix: { barrier: 0.3, mud: 0.25, puddle: 0.2, pad: 0.25 } },

  { key: 'neon', name: '🌆 네온 고속도로', theme: 'neon', mix: { cone: 0.3, oil: 0.25, scooter: 0.2, pad: 0.25 }, gap: 0.95 },
  { key: 'neon-boost', name: '⚡ 부스터 파티', theme: 'neon', mix: { pad: 0.5, oil: 0.25, tire: 0.25 } },

  { key: 'beach', name: '🏖️ 해변 도로', theme: 'beach', mix: { crab: 0.3, sand: 0.3, trash: 0.15, pad: 0.25 } },
  { key: 'beach-surf', name: '🏄 서핑 가는 길', theme: 'beach', mix: { crab: 0.25, puddle: 0.25, crowd: 0.25, pad: 0.25 } },

  { key: 'stadium', name: '⚾ 야구장 가는 길', theme: 'stadium', mix: { ball: 0.3, crowd: 0.25, trash: 0.2, pad: 0.25 } },
  { key: 'stadium-final', name: '🏆 한국시리즈 직관 대란', theme: 'stadium', mix: { crowd: 0.35, ball: 0.3, bump: 0.15, pad: 0.2 }, gap: 0.92 },

  { key: 'euljiro', name: '🏮 을지로 노포 골목', theme: 'euljiro', mix: { tire: 0.3, trash: 0.2, oil: 0.25, pad: 0.25 } },
  { key: 'euljiro-alley', name: '🔩 을지로 공구상가', theme: 'euljiro', mix: { tire: 0.35, barrier: 0.2, pothole: 0.2, pad: 0.25 } },

  { key: 'hanok', name: '🏯 북촌 한옥길', theme: 'hanok', mix: { crowd: 0.3, bump: 0.25, pigeon: 0.2, pad: 0.25 } },
  { key: 'hanok-rain', name: '🪷 비 갠 한옥마을', theme: 'hanok', mix: { puddle: 0.35, crowd: 0.2, rock: 0.2, pad: 0.25 } },

  { key: 'space', name: '🪐 우주 고속도로', theme: 'space', mix: { rock: 0.35, ice: 0.2, pad: 0.3, tire: 0.15 } },
  { key: 'space-meteor', name: '☄️ 유성우 구간', theme: 'space', mix: { rock: 0.5, pad: 0.3, oil: 0.2 }, gap: 0.92 },

  { key: 'mixed', name: '🎲 뒤죽박죽 대혼란', theme: 'sunset', mix: { cone: 0.1, puddle: 0.1, scooter: 0.1, ice: 0.1, crowd: 0.1, sand: 0.1, duck: 0.1, coffee: 0.1, pad: 0.2 } },
]

// 시드 → 코스(모두에게 같다). makeTrack이 쓰는 rng와 겹치지 않게 시드를 섞어서 고른다.
export function courseOf(seed: number): Course {
  const h = Math.imul((seed ^ 0x9e3779b9) >>> 0, 2654435761) >>> 0
  return COURSES[h % COURSES.length]
}
export const themeOf = (c: Course): Theme => THEMES[c.theme]
export const trackOf = (seed: number, c: Course = courseOf(seed)): Thing[] => makeTrack(seed, c.mix, c.gap ?? 1)
