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
  { key: 'acc', label: '장갑', emoji: '🧤' },
  { key: 'effect', label: '이펙트', emoji: '✨' },
]

export type GearPart = 'cap' | 'helmet' | 'eyeblack' | 'shades' | 'uniform' | 'away' | 'bat' | 'cheer' | 'gloves'
export const GEAR_PARTS: { key: GearPart; label: string; emoji: string; slot: GearSlot }[] = [
  { key: 'cap', label: '모자', emoji: '🧢', slot: 'head' },
  { key: 'helmet', label: '헬멧', emoji: '⛑', slot: 'head' },
  { key: 'eyeblack', label: '아이블랙', emoji: '➖', slot: 'face' },
  { key: 'shades', label: '선글라스', emoji: '🕶', slot: 'face' },
  { key: 'uniform', label: '홈 유니폼', emoji: '👕', slot: 'top' },
  { key: 'away', label: '원정 유니폼', emoji: '🎽', slot: 'top' },
  { key: 'bat', label: '방망이', emoji: '🏏', slot: 'hand' },
  { key: 'cheer', label: '응원봉', emoji: '🪄', slot: 'hand' },
  { key: 'gloves', label: '배팅 장갑', emoji: '🧤', slot: 'acc' },
]
const PART_MAP = new Map(GEAR_PARTS.map(p => [p.key, p]))
export function partInfo(part: string | null | undefined) {
  return part ? PART_MAP.get(part as GearPart) ?? null : null
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
  pinstripe?: boolean // LG 홈 핀스트라이프
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

// 원정 유니폼 = 구단 색 바탕 + 흰 글씨(핀스트라이프 없음). 홈이면 구단 그대로.
export function uniformTeam(e: Equip | null | undefined): KboTeam | null {
  const t = teamOf(e?.uniform)
  if (!t) return null
  if (e?.slots.top?.part !== 'away') return t
  return { ...t, jersey: t.primary, primary: '#FFFFFF', pinstripe: false }
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

// 서버 함수가 raise 하는 코드 → 화면 문구
export function gearErrorText(message: string) {
  if (message.includes('NOT_ENOUGH_CREDIT')) return `크레딧이 부족해요 (상자 1개 = ${BOX_COST}크레딧)`
  if (message.includes('SELF_GIFT')) return '자기 자신에게는 보낼 수 없어요'
  if (message.includes('BOX_NOT_FOUND')) return '상자를 찾을 수 없어요'
  if (message.includes('NOT_OWNED')) return '가지고 있지 않은 장비예요'
  if (message.includes('NO_TICKET')) return '남은 선물권이 없어요'
  if (message.includes('baseball_gift_tickets') || message.includes('send_baseball_ticket_box') || message.includes('admin_grant_baseball_ticket')) return '선물권 기능이 아직 준비 중이에요 (DB 설정 필요)'
  if (message.includes('equip_baseball_slot') || message.includes('BAD_SLOT')) return '새 코스튬 기능이 아직 준비 중이에요 (DB 설정 필요)'
  if (message.includes('NOT_ADMIN')) return '관리자만 보낼 수 있어요'
  return message
}
