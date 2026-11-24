'use client'

// 🐶 팀 강아지(호떡) — 상태는 DB 함수 pet_state() 하나로 받고, 행동은 pet_act()로만 한다(규칙은 DB가 판정).
// 홈 박스·상단 알림 알약·상세 창이 같은 상태를 보므로 여기 한 곳(모듈 저장소)에서 한 번만 받고 실시간 1채널로 맞춘다.
import { useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'

export type SlotKey = 'b' | 'l' | 'd'
export type PetSlot = { slot: SlotKey; key: string; open_at: string; close_at: string; state: 'off' | 'before' | 'open' | 'closed'; feeders: string[] }
export type PetRow = {
  id: number; species: string; breed: string; name: string; born_on: string
  status: 'active' | 'runaway' | 'graduated'; runaway_on: string | null; returned_on: string | null
  paused_days: number; outfit: string; outfit_by: string | null; age: number
}
export type PetState = {
  now: string; today: string; workday: boolean; me: string
  pet: PetRow | null
  slots: PetSlot[]
  poops: { key: string; slot: SlotKey }[]
  mine: Partial<Record<'snack' | 'play' | 'pat' | 'walk' | 'train' | 'search' | 'walk_success', number>>
  affection: { member_id: string; points: number }[]
  team_total: number; today_total: number; train_total: number; search_total: number
  searchers: { member_id: string; n: number }[]
  recent: { member_id: string; kind: string; result: string | null; points: number; created_at: string }[]
}

export const SLOT_LABEL: Record<SlotKey, string> = { b: '아침밥', l: '점심밥', d: '저녁밥' }
export const SLOT_RANGE: Record<SlotKey, string> = { b: '9~11시', l: '12~14시', d: '17~19시' }

// 성장 단계 = 직급(인사팀 강아지). 1~30일 외형이 바뀌고, 31일부터는 옷·개인기를 쌓는다.
export const STAGES = [
  { from: 1, stage: '갓난 새끼', rank: '인턴' },
  { from: 6, stage: '아기', rank: '사원' },
  { from: 13, stage: '어린이', rank: '주임' },
  { from: 21, stage: '청소년', rank: '대리' },
  { from: 30, stage: '성견', rank: '과장' },
] as const
export function stageOf(age: number) {
  const a = Math.max(1, age)
  return [...STAGES].reverse().find(s => a >= s.from)!
}

export const LIMITS = { snack: 2, play: 3, pat: 5, walk: 2, train: 3, search: 60 } as const
export const POINTS = { snack: 2, play: 2, pat: 1, train: 2 } as const
export const SEARCH_GOAL = 300

export type OutfitKey = 'none' | 'scarf' | 'badge' | 'santa' | 'shades'
export const OUTFITS: { key: OutfitKey; label: string; need: number }[] = [
  { key: 'none', label: '맨몸', need: 0 },
  { key: 'scarf', label: '빨간 목도리', need: 250 },
  { key: 'badge', label: '사원증', need: 400 },
  { key: 'santa', label: '산타 모자', need: 550 },
  { key: 'shades', label: '선글라스', need: 700 },
]

export type TrickKey = 'sit' | 'paw' | 'down' | 'bang' | 'spin' | 'highfive' | 'fetch'
export const TRICKS: { key: TrickKey; label: string; need: number; say: string }[] = [
  { key: 'sit', label: '앉아', need: 6, say: '앉아! 🐾' },
  { key: 'paw', label: '손', need: 15, say: '손! ✋' },
  { key: 'down', label: '엎드려', need: 27, say: '엎드려~' },
  { key: 'bang', label: '빵야', need: 42, say: '빵야! 💥' },
  { key: 'spin', label: '한 바퀴', need: 60, say: '빙글~ 🌀' },
  { key: 'highfive', label: '하이파이브', need: 80, say: '하이파이브! 🙌' },
  { key: 'fetch', label: '사원증 물어오기', need: 105, say: '사원증 가져왔어요! 🪪' },
]
export const learnedTricks = (trainTotal: number) => TRICKS.filter(t => trainTotal >= t.need)

const ERROR_TEXT: Record<string, string> = {
  NOT_MEMBER: '팀원 계정으로 로그인해야 해요',
  NO_PET: '아직 키우는 동물이 없어요',
  RUNAWAY: '호떡이 가출했어요… 먼저 찾아 주세요',
  NOT_RUNAWAY: '호떡은 집에 있어요',
  OFF_DAY: '주말·휴일엔 펫시터가 밥을 줘요',
  NOT_YET: '아직 배고프지 않대요',
  CLOSED: '이번 밥 시간은 끝났어요',
  DONE: '이미 했어요',
  NO_POOP: '치울 똥이 없어요',
  LIMIT: '오늘은 여기까지! 내일 또 해 주세요',
  TOO_YOUNG: '31일이 지나야 할 수 있어요',
  LOCKED_ITEM: '팀 친밀도가 더 필요해요',
}
export function petErrorText(msg: string) {
  const code = Object.keys(ERROR_TEXT).find(k => msg.includes(k))
  return code ? ERROR_TEXT[code] : '잠시 후 다시 해 주세요'
}

/* ───────── 모듈 저장소(앱 전체 1개) ───────── */
type Store = { state: PetState | null; loaded: boolean; error: boolean }
let store: Store = { state: null, loaded: false, error: false }
const listeners = new Set<() => void>()
let users = 0
let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null
let loadSeq = 0
let lastLoadAt = 0

function emit(next: Partial<Store>) {
  store = { ...store, ...next }
  listeners.forEach(l => l())
}

export async function reloadPet() {
  const seq = ++loadSeq
  lastLoadAt = Date.now()
  const { data, error } = await createClient().rpc('pet_state')
  if (seq !== loadSeq) return
  if (error || !data) { emit({ loaded: true, error: true }); return }
  emit({ state: data as PetState, loaded: true, error: false })
}

function scheduleReload(ms = 250) {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => { reloadTimer = null; void reloadPet() }, ms)
}

function onVisible() {
  if (document.visibilityState === 'visible' && Date.now() - lastLoadAt > 20_000) void reloadPet()
}

function start() {
  const supabase = createClient()
  void reloadPet()
  channel = supabase
    .channel('pet-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pet_actions' }, () => scheduleReload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pets' }, () => scheduleReload())
    .subscribe(status => { if (status === 'SUBSCRIBED') scheduleReload(50) })
  // 밥 시간이 열리고 닫히는 건 시간이 흘러서 바뀐다 — 1분마다 다시 맞춘다(화면이 보일 때만)
  timer = setInterval(() => { if (document.visibilityState === 'visible') void reloadPet() }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
}

function stop() {
  if (channel) { void createClient().removeChannel(channel); channel = null }
  if (timer) { clearInterval(timer); timer = null }
  if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null }
  document.removeEventListener('visibilitychange', onVisible)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const getSnapshot = () => store
const getServerSnapshot = () => store

export function usePet(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    users += 1
    if (users === 1) start()
    return () => { users -= 1; if (users === 0) stop() }
  }, [enabled])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export async function petAct(kind: string, slot: string | null = null, success: boolean | null = null): Promise<{ ok: true; points: number; [k: string]: unknown } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc('pet_act', { p_kind: kind, p_slot: slot, p_success: success })
  if (error) return { ok: false, error: petErrorText(error.message) }
  void reloadPet()
  return data as { ok: true; points: number }
}

/* ───────── 화면 판정 도우미 ───────── */
export function openMealSlot(s: PetState | null) {
  return s?.slots.find(x => x.state === 'open') ?? null
}
// 상단 알약: 내가 할 수 있는 공용 일(밥·똥·찾기)이 있으면 무엇인지
export function petCallout(s: PetState | null): string | null {
  if (!s?.pet) return null
  if (s.pet.status === 'runaway') return (s.mine.search ?? 0) < LIMITS.search ? '🐶 호떡 가출! 찾아 주세요' : null
  const open = openMealSlot(s)
  if (open && !open.feeders.includes(s.me)) return `🍚 ${s.pet.name} 배고파요`
  if (s.poops.length > 0) return '💩 똥 치워 주세요'
  return null
}
// 서울 시각(시)
export function kstHour(iso: string) {
  return (new Date(iso).getUTCHours() + 9) % 24
}
