// 💣 폭탄 놀이터 내 캐릭터 — STEP 2에서는 이 브라우저에만 저장(팀원별 키). STEP 3에서 DB(코인·상점)로 옮긴다.
// 받은 값(방송·저장소)은 믿지 않고 sanitizeLook으로 걸러 쓴다.

import { BACKS, BODY_COLORS, FACES, HATS, OUTFITS, SPECIES, type CritterLook } from '@/components/playground/bomb/Critter'
import { mulberry32 } from './bomb'

const KEY = (memberId: string) => `hrm-bomb-look:${memberId}`

export function sanitizeLook(v: unknown): CritterLook | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const sp = SPECIES.find(s => s.key === o.species)
  if (!sp) return null
  const pick = <T extends string>(list: [T, string][], x: unknown): T => (list.some(([k]) => k === x) ? (x as T) : list[0][0])
  return {
    species: sp.key,
    color: typeof o.color === 'string' && BODY_COLORS.includes(o.color) ? o.color : undefined,
    hat: pick(HATS, o.hat),
    face: pick(FACES, o.face),
    back: pick(BACKS, o.back),
    outfit: pick(OUTFITS, o.outfit),
  }
}

export function loadLook(memberId: string): CritterLook | null {
  try {
    const raw = window.localStorage.getItem(KEY(memberId))
    return raw ? sanitizeLook(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveLook(memberId: string, look: CritterLook) {
  try {
    window.localStorage.setItem(KEY(memberId), JSON.stringify(look))
  } catch {
    // 저장이 막혀 있어도 이번 접속 동안은 쓸 수 있게 둔다
  }
}

// 아직 안 고른 사람(다른 사람 화면에 보일 때)용 기본 모습 — id로 고정
export function fallbackLook(id: string): CritterLook {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { species: SPECIES[h % SPECIES.length].key }
}

// CPU 모습·이름 (시드로 고정)
export function cpuLook(seed: number): { look: CritterLook; name: string } {
  const r = mulberry32(seed)
  const sp = SPECIES[Math.floor(r() * SPECIES.length)]
  const hats = HATS.filter(h => h[0] !== 'none')
  return {
    look: { species: sp.key, hat: r() < 0.6 ? hats[Math.floor(r() * hats.length)][0] : 'none', outfit: OUTFITS[Math.floor(r() * OUTFITS.length)][0] },
    name: `${sp.name}봇`,
  }
}
