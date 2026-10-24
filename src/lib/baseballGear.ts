// 비거리 야구 꾸미기(코스튬) — 아이템은 모두 (KBO 10개 구단 × 아이템 종류). 운동장·대결·야구 캐릭터가 같이 입는다.
// 아이템 종류는 슬롯(머리·얼굴·상의·손·장갑·이펙트)에 하나씩만 입는다. 종류 목록은 서버 baseball_parts와 맞춘다
// (supabase/add_costume_slots.sql) — 새 아이템 = 거기 INSERT 한 줄 + GEAR_PARTS 한 줄 + gear.tsx 그림.
// 크레딧 = 이번 달(KST) 팀 나무 물주기 횟수 − 이번 달 보낸 상자 × BOX_COST. 달이 바뀌면 0부터(보통 20영업일 ≈ 상자 2개).
// 크레딧 상자는 남에게만·구단/부위 완전 랜덤, 관리자(김진일) 선물은 크레딧 없이 구단/부위를 직접 고른다.
// 잔액 계산·상자 뽑기는 서버 함수(supabase/add_baseball_gear.sql)가 하므로 숫자를 바꾸면 SQL도 같이 바꿔야 한다.
// 로고(public/kbo/*.png)는 위키미디어의 구단 모자 로고 — 팀원 4명만 쓰는 내부 앱이라 공식 로고를 그대로 쓴다.

export const BOX_COST = 10

export type GearSlot = 'head' | 'face' | 'top' | 'hand' | 'acc' | 'effect'
export const GEAR_SLOTS: { key: GearSlot; label: string; emoji: string }[] = [
  { key: 'head', label: '머리', emoji: '🧢' },
  { key: 'face', label: '얼굴', emoji: '😎' },
  { key: 'top', label: '상의', emoji: '👕' },
  { key: 'hand', label: '손', emoji: '🏏' },
  { key: 'acc', label: '장갑', emoji: '✋' },
  { key: 'effect', label: '이펙트', emoji: '✨' },
]

// 희귀도 — 상자에서 나올 확률(가중치)은 서버 baseball_parts.weight가 정한다(일반 10 · 희귀 4 · 전설 3)
export type Rarity = 'common' | 'rare' | 'legend'
export const RARITY: Record<Rarity, { label: string; color: string; star: string }> = {
  common: { label: '일반', color: '#C4CBD2', star: '' },
  rare: { label: '희귀', color: '#4C7FE0', star: '★' },
  legend: { label: '전설', color: '#D4A017', star: '🌟' },
}
// 시즌 한정: 그 기간에만 상자에서 나온다(이미 가진 건 언제든 입음). from/to = MMDD, 연말을 넘으면 from > to
export type Season = { from: number; to: number; label: string }

export type GearPart =
  | 'cap' | 'helmet' | 'eyeblack' | 'shades' | 'uniform' | 'away' | 'military' | 'retro' | 'autumn' | 'holiday' | 'bat' | 'cheer' | 'gloves'
  | 'goldglove' | 'notes' | 'firework' | 'confetti' | 'ring'
// reward = 상자에서 안 나오고 기록 달성으로만 받는 아이템(REWARDS)
export const GEAR_PARTS: { key: GearPart; label: string; emoji: string; slot: GearSlot; rarity: Rarity; season?: Season; reward?: boolean }[] = [
  { key: 'cap', label: '모자', emoji: '🧢', slot: 'head', rarity: 'common' },
  { key: 'helmet', label: '헬멧', emoji: '⛑', slot: 'head', rarity: 'rare' },
  { key: 'eyeblack', label: '아이블랙', emoji: '➖', slot: 'face', rarity: 'common' },
  { key: 'shades', label: '선글라스', emoji: '🕶', slot: 'face', rarity: 'rare' },
  { key: 'uniform', label: '홈 유니폼', emoji: '👕', slot: 'top', rarity: 'common' },
  { key: 'away', label: '원정 유니폼', emoji: '🎽', slot: 'top', rarity: 'rare' },
  { key: 'military', label: '밀리터리', emoji: '🪖', slot: 'top', rarity: 'rare' },
  { key: 'retro', label: '레트로', emoji: '📻', slot: 'top', rarity: 'rare' },
  { key: 'autumn', label: '가을야구', emoji: '🍂', slot: 'top', rarity: 'legend', season: { from: 1001, to: 1130, label: '10~11월 한정' } },
  { key: 'holiday', label: '홀리데이', emoji: '🎄', slot: 'top', rarity: 'legend', season: { from: 1201, to: 115, label: '12월~1/15 한정' } },
  { key: 'bat', label: '방망이', emoji: '🏏', slot: 'hand', rarity: 'common' },
  { key: 'cheer', label: '응원봉', emoji: '🪄', slot: 'hand', rarity: 'rare' },
  { key: 'gloves', label: '배팅 장갑', emoji: '✋', slot: 'acc', rarity: 'common' },
  { key: 'goldglove', label: '골든글러브', emoji: '🏆', slot: 'acc', rarity: 'legend', reward: true },
  { key: 'notes', label: '응원가', emoji: '🎶', slot: 'effect', rarity: 'rare' },
  { key: 'firework', label: '홈런 불꽃', emoji: '🎆', slot: 'effect', rarity: 'legend', reward: true },
  { key: 'confetti', label: '칼퇴 꽃가루', emoji: '🎉', slot: 'effect', rarity: 'rare', reward: true },
  { key: 'ring', label: '우승 반지', emoji: '💍', slot: 'effect', rarity: 'legend', reward: true },
]
const PART_MAP = new Map(GEAR_PARTS.map(p => [p.key, p]))
export function partInfo(part: string | null | undefined) {
  return part ? PART_MAP.get(part as GearPart) ?? null : null
}
// 기록 보상 — 조건 검사·지급은 서버 함수(claim_baseball_reward, supabase/add_costume_step3.sql)가 한다. 숫자를 바꾸면 SQL도 같이.
export type RewardProgress = {
  homeruns: number; off_days: number; titles: number
  last_month: string; last_month_hr: number; last_month_top: number; last_month_leader: boolean
}
export const REWARDS: { part: GearPart; title: string; how: string; progress: (p: RewardProgress) => { cur: number; goal: number; done: boolean } }[] = [
  { part: 'firework', title: '🎆 홈런 불꽃', how: '개인전 누적 홈런 10개', progress: p => ({ cur: p.homeruns, goal: 10, done: p.homeruns >= 10 }) },
  { part: 'ring', title: '💍 우승 반지', how: '토너먼트 우승 1회', progress: p => ({ cur: p.titles, goal: 1, done: p.titles >= 1 }) },
  { part: 'confetti', title: '🎉 칼퇴 꽃가루', how: '퇴근길 칼퇴 성공 5일', progress: p => ({ cur: p.off_days, goal: 5, done: p.off_days >= 5 }) },
  {
    part: 'goldglove', title: '🏆 골든글러브', how: '지난달 개인전 홈런 1위(동률 포함)',
    progress: p => ({ cur: p.last_month_hr, goal: Math.max(1, p.last_month_top), done: p.last_month_leader }),
  },
]

// 같은 구단 아이템을 3자리 이상 입으면 "풀세트" — 이름표·선수 카드에 구단 색으로 표시
export function fullSetTeam(e: Equip | null | undefined): KboTeam | null {
  if (!e) return null
  const count = new Map<TeamKey, number>()
  for (const s of Object.values(e.slots)) if (s) count.set(s.team, (count.get(s.team) ?? 0) + 1)
  let best: TeamKey | null = null
  for (const [t, n] of count) if (n >= 3 && (!best || n > (count.get(best) ?? 0))) best = t
  return teamOf(best)
}

// date = YYYY-MM-DD(KST). 시즌 없는 아이템은 늘 true
export function inSeason(part: GearPart, date: string) {
  const s = PART_MAP.get(part)?.season
  if (!s) return true
  const md = Number(date.slice(5, 7)) * 100 + Number(date.slice(8, 10))
  return s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to
}
export function rarityOf(part: string | null | undefined): Rarity {
  return partInfo(part)?.rarity ?? 'common'
}
export function slotOf(part: GearPart): GearSlot {
  return PART_MAP.get(part)?.slot ?? 'head'
}

export type TeamKey = 'lg' | 'doosan' | 'kia' | 'samsung' | 'ssg' | 'lotte' | 'hanwha' | 'nc' | 'kt' | 'kiwoom'

export type KboTeam = {
  key: TeamKey
  name: string        // 한글 구단명
  wordmark: string    // 유니폼 가슴 글씨
  cap: string         // 모자 색 (로고 배경이 있는 구단은 그 배경색과 맞춤)
  primary: string     // 유니폼 소매·글씨·방망이 손잡이
  secondary: string   // 보조 색 (유니폼 테두리·방망이 띠)
  jersey: string      // 유니폼 바탕
  pinstripe?: boolean // LG 홈 핀스트라이프 · 레트로 유니폼
  pattern?: 'camo' | 'snow' // 밀리터리 위장 무늬 · 홀리데이 눈송이
  bat: string         // 방망이 몸통
}

export const KBO_TEAMS: KboTeam[] = [
  { key: 'lg', name: 'LG 트윈스', wordmark: 'TWINS', cap: '#1A1A1A', primary: '#C30452', secondary: '#1A1A1A', jersey: '#FFFFFF', pinstripe: true, bat: '#1A1A1A' },
  { key: 'doosan', name: '두산 베어스', wordmark: 'DOOSAN', cap: '#131230', primary: '#131230', secondary: '#ED1C24', jersey: '#FFFFFF', bat: '#2B2A55' },
  { key: 'kia', name: 'KIA 타이거즈', wordmark: 'TIGERS', cap: '#111111', primary: '#EA0029', secondary: '#06141F', jersey: '#FFFFFF', bat: '#B8862F' },
  { key: 'samsung', name: '삼성 라이온즈', wordmark: 'SAMSUNG', cap: '#0066B3', primary: '#074CA1', secondary: '#C0C5CC', jersey: '#FFFFFF', bat: '#D9B77E' },
  { key: 'ssg', name: 'SSG 랜더스', wordmark: 'SSG', cap: '#C91432', primary: '#CE0E2D', secondary: '#FFB81C', jersey: '#FFFFFF', bat: '#1A1A1A' },
  { key: 'lotte', name: '롯데 자이언츠', wordmark: 'GIANTS', cap: '#041E42', primary: '#041E42', secondary: '#D00F31', jersey: '#FFFFFF', bat: '#C89B5C' },
  { key: 'hanwha', name: '한화 이글스', wordmark: 'EAGLES', cap: '#172B4B', primary: '#FF6600', secondary: '#172B4B', jersey: '#FFFFFF', bat: '#3A2A1E' },
  { key: 'nc', name: 'NC 다이노스', wordmark: 'DINOS', cap: '#26476C', primary: '#315288', secondary: '#C7A079', jersey: '#FFFFFF', bat: '#C7A079' },
  { key: 'kt', name: 'KT 위즈', wordmark: 'kt wiz', cap: '#000000', primary: '#000000', secondary: '#EB1C24', jersey: '#FFFFFF', bat: '#000000' },
  { key: 'kiwoom', name: '키움 히어로즈', wordmark: 'HEROES', cap: '#570514', primary: '#820024', secondary: '#B07C83', jersey: '#FFFFFF', bat: '#570514' },
]

const TEAM_MAP = new Map(KBO_TEAMS.map(t => [t.key, t]))
export function teamOf(key: string | null | undefined): KboTeam | null {
  return key ? TEAM_MAP.get(key as TeamKey) ?? null : null
}
export function logoUrl(key: TeamKey) {
  return `/kbo/${key}.png`
}
export function partLabel(part: string) {
  return PART_MAP.get(part as GearPart)?.label ?? part
}

// 슬롯별로 입은 아이템. 서버 baseball_equip.slots(jsonb) 그대로.
export type EquipSlots = Partial<Record<GearSlot, { part: GearPart; team: TeamKey }>>
// 장착 상태. cap/uniform/bat은 예전 그림 코드용 요약(머리 구단·상의 구단·방망이 구단) — 헬멧도 cap 구단 색으로 그린다.
// 원정 유니폼처럼 종류에 따라 모양이 다른 건 slots를 직접 보거나 uniformTeam()을 쓴다.
export type Equip = { cap: TeamKey | null; uniform: TeamKey | null; bat: TeamKey | null; slots: EquipSlots }

// 서버 값이 이상해도(슬롯에 안 맞는 종류·모르는 구단) 화면이 깨지지 않게 걸러서 만든다
export function equipFromSlots(raw: unknown): Equip {
  const slots: EquipSlots = {}
  if (raw && typeof raw === 'object') {
    for (const [slot, v] of Object.entries(raw as Record<string, unknown>)) {
      const item = v as { part?: string; team?: string } | null
      const info = partInfo(item?.part)
      if (!info || info.slot !== slot || !teamOf(item?.team)) continue
      slots[slot as GearSlot] = { part: info.key, team: item!.team as TeamKey }
    }
  }
  return {
    cap: slots.head?.team ?? null,
    uniform: slots.top?.team ?? null,
    bat: slots.hand?.part === 'bat' ? slots.hand.team : null,
    slots,
  }
}
export const NO_EQUIP: Equip = equipFromSlots({})

// 상의 종류별 색 — 구단 글씨·로고는 그대로 두고 바탕·트림만 바꾼다. 홈이면 구단 그대로.
// 원정 = 구단 색 바탕 + 흰 글씨 · 밀리터리 = 올리브 위장 무늬 · 레트로 = 크림 바탕 + 구단 색 핀스트라이프
// 가을야구 = 검정 바탕 + 금색 글씨 · 홀리데이 = 빨강 바탕 + 흰 글씨 + 초록 트림 + 눈송이
export function uniformTeam(e: Equip | null | undefined): KboTeam | null {
  const t = teamOf(e?.uniform)
  if (!t) return null
  const dark = t.primary === '#000000' || t.primary === '#1A1A1A'
  switch (e?.slots.top?.part) {
    case 'away': return { ...t, jersey: t.primary, primary: '#FFFFFF', pinstripe: false }
    case 'military': return { ...t, jersey: '#6B7A45', primary: '#2A3318', secondary: '#8F9C66', pinstripe: false, pattern: 'camo' }
    case 'retro': return { ...t, jersey: '#F1E6CC', secondary: t.primary, pinstripe: true }
    case 'autumn': return { ...t, jersey: '#151A22', primary: '#D4A017', secondary: dark ? '#8A6D1A' : t.primary, pinstripe: false }
    case 'holiday': return { ...t, jersey: '#B42318', primary: '#FFFFFF', secondary: '#15803D', pinstripe: false, pattern: 'snow' }
    default: return t
  }
}

// 장착 중인 구단들(중복 제거, 슬롯 순서)
export function equippedTeams(e: Equip): TeamKey[] {
  return [...new Set(GEAR_SLOTS.map(s => e.slots[s.key]?.team).filter((t): t is TeamKey => !!t))]
}
// 야구 위젯 배경 로고 구단 — 하나라도 장착하면 그 구단, 섞여 있으면 본인이 고른 구단(안 골랐으면 모자 쪽)
export function backgroundTeam(e: Equip, chosen: TeamKey | null): TeamKey | null {
  const teams = equippedTeams(e)
  if (teams.length === 0) return null
  return chosen && teams.includes(chosen) ? chosen : teams[0]
}

export type GiftBox = {
  id: string
  kind: 'credit' | 'admin' | 'ticket' // ticket = 관리자가 준 선물권으로 보낸 상자(유니폼 고정·구단 랜덤)
  sender_id: string
  recipient_id: string
  cost: number
  message: string | null
  preset_team: TeamKey | null
  preset_part: GearPart | null
  created_at: string
  opened_at: string | null
  item_team: TeamKey | null
  item_part: GearPart | null
  duplicate: boolean | null
}

// 선물권: 관리자가 팀원에게 1장씩 준다. 가진 사람은 남에게만 상자를 보낼 수 있다(supabase/add_baseball_tickets.sql)
export type GiftTicket = { id: string; owner_id: string; granted_by: string | null; created_at: string; used_at: string | null; box_id: string | null }

export type OwnedGear = { member_id: string; team: TeamKey; part: GearPart; acquired_at: string }

// 일일권: 관리자가 아이템 하나를 오늘 자정(KST)까지만 입혀 준다(supabase/add_baseball_trials.sql). 주는 순간 바로 장착되고,
// prev_item = 그때 그 자리에 입고 있던 것 — 만료되면 화면에서 그걸로 되돌린다(서버는 그대로 두고 그릴 때 거른다)
export type GearTrial = {
  id: string; member_id: string; team: TeamKey; part: GearPart; prev_item: { part?: string; team?: string } | null
  granted_by: string | null; created_at: string; expires_at: string
}

// 장착 원본(slots jsonb)에서 만료된 일일권 아이템을 걷어낸다 — 그 아이템을 진짜로 갖고 있으면 그대로 둔다.
// 되돌릴 이전 아이템도 만료된 일일권이면 비운다(기본 장비)
export function applyTrials(raw: unknown, trials: GearTrial[], owns: (team: string, part: string) => boolean, nowMs: number): unknown {
  if (!raw || typeof raw !== 'object' || trials.length === 0) return raw
  const expired = (team?: string, part?: string) =>
    !!team && !!part && !owns(team, part) &&
    trials.some(t => t.team === team && t.part === part) &&
    !trials.some(t => t.team === team && t.part === part && Date.parse(t.expires_at) > nowMs)
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  for (const [slot, v] of Object.entries(out)) {
    const item = v as { part?: string; team?: string } | null
    if (!expired(item?.team, item?.part)) continue
    // 가장 최근에 준 그 아이템 일일권의 이전 아이템으로
    const t = [...trials].reverse().find(x => x.team === item!.team && x.part === item!.part)
    const prev = t?.prev_item
    if (prev && !expired(prev.team, prev.part) && !(prev.team === item!.team && prev.part === item!.part)) out[slot] = prev
    else delete out[slot]
  }
  return out
}

// 서버 함수가 raise 하는 코드 → 화면 문구
export function gearErrorText(message: string) {
  if (message.includes('NOT_ENOUGH_CREDIT')) return `크레딧이 부족해요 (상자 1개 = ${BOX_COST}크레딧)`
  if (message.includes('SELF_GIFT')) return '자기 자신에게는 보낼 수 없어요'
  if (message.includes('BOX_NOT_FOUND')) return '상자를 찾을 수 없어요'
  if (message.includes('NOT_OWNED')) return '가지고 있지 않은 장비예요'
  if (message.includes('NO_TICKET')) return '남은 선물권이 없어요'
  if (message.includes('baseball_gift_tickets') || message.includes('send_baseball_ticket_box') || message.includes('admin_grant_baseball_ticket')) return '선물권 기능이 아직 준비 중이에요 (DB 설정 필요)'
  if (message.includes('ALREADY_CLAIMED')) return '이미 받은 보상이에요'
  if (message.includes('NOT_YET')) return '아직 조건을 채우지 못했어요'
  if (message.includes('claim_baseball_reward') || message.includes('baseball_reward_progress')) return '기록 보상 기능이 아직 준비 중이에요 (DB 설정 필요)'
  if (message.includes('equip_baseball_slot') || message.includes('BAD_SLOT')) return '새 코스튬 기능이 아직 준비 중이에요 (DB 설정 필요)'
  if (message.includes('baseball_gear_trials') || message.includes('admin_grant_baseball_trial')) return '일일권 기능이 아직 준비 중이에요 (DB 설정 필요)'
  if (message.includes('NOT_ADMIN')) return '관리자만 보낼 수 있어요'
  return message
}
