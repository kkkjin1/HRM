'use client'

// 오늘의 운동장 무대 그림 — 퇴근길(모드)마다 배경(StageArt)과 게임 장치(ModeLayer)가 다르다.
// 가로 구역은 모두 같다: 출발(0~MTN_L) → 도전 구간(MTN_L~PEAK_X, 결승선) → 도착 쪽(PEAK_X~W). 높이는 surfaceY(x, mode).
// 로직·판정은 lib/playground.ts, 여기는 그리기만.

import {
  ARCH_BOX, ARCH_LINE, ARCH_PASS, ARCH_SHOTS, ARENA_L, ARENA_R, BACK_X, BOW_H, CURL_PASS, CURL_STONES, GY, H, HACK_BOX, HACK_X, HOG_X,
  HOUSE_R, HOUSE_X, MTN_L, MTN_R, PEAK_X, ROPE_L, ROPE_R, SHOOTER_X, TARGET_R, TARGET_X, W, surfaceY,
  type BossLook, type LiveShot, type Mode,
} from '@/lib/playground'

export type DodgeView = { shots: LiveShot[]; survived: number | null } // survived = 내가 버틴 ms(주차장 밖이면 null)
// 양궁: 바람·과녁 높이, 내 조준(각도 고정 전/힘 고정 전), 날아가는 화살들, 이번 판 점수
export type ArcheryView = {
  wind: number; targetH: number; aim: { phase: 'angle' | 'power'; angle: number; power: number } | null
  arrows: { id: string; x: number; h: number; rot: number }[]; scores: number[]; atLine: boolean
}
// 컬링: 내 스톤(미끄러지는 중/멈춤), 스위핑 중인지, 투구 힘 막대, 이번 판 점수
export type CurlingView = { stone: { x: number } | null; sweeping: boolean; power: number | null; scores: number[] }
export type RopeView = { angle: number; streak: number; need: number; inside: number }

const GROUND_TOP = GY - 26 // 앞뒤로 엇갈려 선 캐릭터까지 덮는 땅 윗선

// ── 배경 ─────────────────────────────────────────────────────────
export function StageArt({ mode }: { mode: Mode }) {
  if (mode === 'patrol') return <CorridorArt />
  return (
    <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <OutdoorSky mode={mode} />
      <rect x="0" y={GROUND_TOP} width={W} height={H} fill={mode === 'curling' ? '#E2E8F0' : 'url(#pg-ground)'} />
      <rect x="0" y={GY + 2} width={W} height={H} fill="#000" opacity="0.12" />
      <Office />
      {mode === 'landslide' && <MountainArt />}
      {mode === 'dodge' && <ParkingArt />}
      {mode === 'archery' && <RooftopArt />}
      {mode === 'curling' && <CurlingArt />}
      {mode === 'rope' && <PlazaArt />}
      <Home />
    </svg>
  )
}

function OutdoorSky({ mode }: { mode: Mode }) {
  return (
    <>
      <defs>
        <linearGradient id="pg-sky" x1="0" y1="0" x2="1" y2="0">
          {mode === 'curling' ? (
            <><stop offset="0" stopColor="#0F172A" /><stop offset="0.6" stopColor="#334155" /><stop offset="1" stopColor="#64748B" /></>
          ) : mode === 'rope' ? (
            <><stop offset="0" stopColor="#1E1B4B" /><stop offset="0.5" stopColor="#9F1239" /><stop offset="1" stopColor="#F59E0B" /></>
          ) : (
            <><stop offset="0" stopColor="#0B1430" /><stop offset="0.4" stopColor="#24345E" /><stop offset="0.62" stopColor="#E9876A" /><stop offset="1" stopColor="#FDD9A8" /></>
          )}
        </linearGradient>
        <linearGradient id="pg-ground" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2F4A3A" /><stop offset="0.5" stopColor="#4F6E43" /><stop offset="1" stopColor="#8DBB5E" />
        </linearGradient>
        <linearGradient id="pg-mtn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4B4238" /><stop offset="0.5" stopColor="#6E604F" /><stop offset="1" stopColor="#8D7B63" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#pg-sky)" />
      {[0.05, 0.16, 0.25, 0.34, 0.43, 0.5, 0.11, 0.38, 0.56].map((f, i) => <circle key={i} cx={W * f} cy={14 + ((i * 37) % 70)} r={1.2} fill="#fff" opacity={0.8} />)}
      <circle cx={W * 0.3} cy={36} r={13} fill="#FDF6C8" /><circle cx={W * 0.3 + 6} cy={32} r={12} fill={mode === 'curling' ? '#1E293B' : '#1F2E55'} />
      {mode !== 'curling' && <circle cx={W - 80} cy={104} r={24} fill="#FB923C" opacity={0.85} />}
    </>
  )
}

function Office() {
  return (
    <g transform={`translate(14 ${GROUND_TOP - 130})`}>
      <text x="66" y="-6" textAnchor="middle" fontSize="10" fontWeight="700" fill="#CBD5E1">🏢 야근 사무실</text>
      <rect width="132" height="130" fill="#1A2440" stroke="#3B4B75" />
      {Array.from({ length: 24 }, (_, i) => (
        <rect key={i} x={10 + (i % 6) * 20} y={12 + Math.floor(i / 6) * 22} width="12" height="13" fill={i % 5 === 2 ? '#2B3A63' : '#FDE68A'} opacity={0.92} />
      ))}
      <rect x="52" y="104" width="28" height="26" fill="#0F172A" />
    </g>
  )
}

function Home() {
  return (
    <g transform={`translate(${W - 104} ${GROUND_TOP - 62})`}>
      <text x="40" y="-6" textAnchor="middle" fontSize="10" fontWeight="700" fill="#7C2D12">🏠 칼퇴</text>
      <polygon points="0,26 40,0 80,26" fill="#C2410C" />
      <rect x="8" y="26" width="64" height="36" fill="#FFF7ED" stroke="#9A3412" />
      <rect x="34" y="38" width="13" height="24" fill="#9A3412" />
      <rect x="14" y="34" width="12" height="10" fill="#FDE68A" stroke="#9A3412" strokeWidth="0.8" />
    </g>
  )
}

function MountainArt() {
  const peakY = surfaceY(PEAK_X, 'landslide')
  return (
    <>
      <polygon points={`${MTN_L - 10},${H} ${MTN_L},${GY} ${PEAK_X},${peakY} ${MTN_R},${GY} ${MTN_R + 10},${H}`} fill="url(#pg-mtn)" />
      <polyline points={`${MTN_L},${GY} ${PEAK_X},${peakY} ${MTN_R},${GY}`} fill="none" stroke="#3A3128" strokeWidth="2" />
      <polygon points={`${PEAK_X - 34},${peakY + 27} ${PEAK_X},${peakY} ${PEAK_X + 34},${peakY + 27} ${PEAK_X + 16},${peakY + 21} ${PEAK_X},${peakY + 30} ${PEAK_X - 16},${peakY + 21}`} fill="#F8FAFC" />
      {[[0.2, 30], [0.42, 46], [0.63, 28], [0.85, 52], [0.33, 70], [0.72, 80]].map(([f, d], i) => {
        const x = MTN_L + (PEAK_X - MTN_L) * f
        return <ellipse key={i} cx={x} cy={surfaceY(x, 'landslide') + d} rx={11} ry={5} fill="#3A3128" opacity="0.45" />
      })}
      <Flag x={PEAK_X} y={peakY} label="칼퇴선" />
      <text x={PEAK_X} y={H - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#F8FAFC" opacity="0.85">⛰ 퇴근산</text>
    </>
  )
}

function Flag({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <>
      <line x1={x} y1={y} x2={x} y2={y - 26} stroke="#E5E7EB" strokeWidth="2" />
      <polygon points={`${x},${y - 26} ${x + 18},${y - 20} ${x},${y - 14}`} fill="#FB923C" />
      <text x={x} y={y - 30} textAnchor="middle" fontSize="10" fontWeight="800" fill="#FFF7ED">{label}</text>
    </>
  )
}

// 수 — 회사 주차장: 주차선·차, 오른쪽 끝에 부장님(탄막 발사)
function ParkingArt() {
  return (
    <>
      <rect x={ARENA_L - 10} y={GY - 26} width={ARENA_R - ARENA_L + 60} height={H} fill="#475569" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={ARENA_L + i * 44} y1={GY - 24} x2={ARENA_L + i * 44 - 14} y2={H} stroke="#F8FAFC" strokeWidth="2" opacity="0.55" />
      ))}
      {[0, 1, 2].map(i => (
        <g key={i} transform={`translate(${ARENA_L + 30 + i * 120} ${GY - 76})`} opacity="0.55">
          <rect x="0" y="14" width="70" height="22" rx="6" fill={['#DC2626', '#2563EB', '#F59E0B'][i]} />
          <rect x="12" y="2" width="44" height="16" rx="5" fill={['#DC2626', '#2563EB', '#F59E0B'][i]} />
          <circle cx="16" cy="38" r="6" fill="#111827" /><circle cx="54" cy="38" r="6" fill="#111827" />
        </g>
      ))}
      <rect x={ARENA_L - 2} y={GY - 120} width={4} height={94} fill="#FACC15" />
      <rect x={ARENA_R + 2} y={GY - 120} width={4} height={94} fill="#FACC15" />
      <text x={(ARENA_L + ARENA_R) / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#F8FAFC">🅿️ 회사 주차장 — 20초 버티기</text>
      <Flag x={PEAK_X + 48} y={GY} label="칼퇴선" />
    </>
  )
}

// 목 — 회사 옥상: 난간, 사대(발사 자리), 과녁 받침대
function RooftopArt() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect key={i} x={MTN_L + 60 + i * 110} y={GY - 150 - ((i * 37) % 60)} width={60} height={150} fill="#1E293B" opacity="0.45" />
      ))}
      <rect x={MTN_L - 20} y={GY - 26} width={TARGET_X - MTN_L + 120} height={H} fill="#64748B" />
      <line x1={MTN_L - 20} y1={GY - 44} x2={TARGET_X + 100} y2={GY - 44} stroke="#CBD5E1" strokeWidth="3" />
      {Array.from({ length: 20 }, (_, i) => <line key={i} x1={MTN_L - 20 + i * 36} y1={GY - 44} x2={MTN_L - 20 + i * 36} y2={GY - 26} stroke="#CBD5E1" strokeWidth="2" />)}
      <rect x={ARCH_LINE - ARCH_BOX} y={GY - 26} width={ARCH_BOX * 2} height={30} fill="rgba(250,204,21,0.25)" stroke="#FACC15" strokeDasharray="5 4" />
      <text x={ARCH_LINE} y={GY + 22} textAnchor="middle" fontSize="10" fontWeight="800" fill="#FEF9C3">🏹 사대</text>
      {/* 과녁 받침대 */}
      <line x1={TARGET_X - 16} y1={GY} x2={TARGET_X} y2={GY - 100} stroke="#78350F" strokeWidth="4" />
      <line x1={TARGET_X + 16} y1={GY} x2={TARGET_X} y2={GY - 100} stroke="#78350F" strokeWidth="4" />
      <text x={(ARCH_LINE + TARGET_X) / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#F8FAFC">🏙 회사 옥상 — 3발 합계 {ARCH_PASS}점 이상이면 칼퇴</text>
    </>
  )
}

// 컬링 — 회사 앞 빙판 시트: 투구 자리(핵), 호그라인, 하우스(동심원), 백라인
function CurlingArt() {
  const rings = [
    { r: HOUSE_R, c: '#2563EB' }, { r: 36, c: '#F8FAFC' }, { r: 26, c: '#DC2626' }, { r: 15, c: '#F8FAFC' }, { r: 6, c: '#1E3A8A' },
  ]
  return (
    <>
      <rect x={MTN_L - 20} y={GY - 26} width={BACK_X - MTN_L + 60} height={H} fill="#DBEAFE" />
      {rings.map((g, i) => <ellipse key={i} cx={HOUSE_X} cy={GY - 8} rx={g.r} ry={g.r * 0.32} fill={g.c} opacity="0.9" />)}
      <line x1={HOG_X} y1={GY - 26} x2={HOG_X} y2={GY + 10} stroke="#DC2626" strokeWidth="3" strokeDasharray="6 4" />
      <text x={HOG_X} y={GY + 24} textAnchor="middle" fontSize="9" fontWeight="800" fill="#991B1B">호그라인</text>
      <line x1={BACK_X} y1={GY - 26} x2={BACK_X} y2={GY + 10} stroke="#334155" strokeWidth="2" />
      <text x={BACK_X} y={GY + 24} textAnchor="middle" fontSize="9" fontWeight="800" fill="#334155">백라인</text>
      <rect x={HACK_X - HACK_BOX} y={GY - 26} width={HACK_BOX * 2} height={30} fill="rgba(250,204,21,0.25)" stroke="#CA8A04" strokeDasharray="5 4" />
      <text x={HACK_X} y={GY + 24} textAnchor="middle" fontSize="9" fontWeight="800" fill="#854D0E">🥌 투구 자리</text>
      {Array.from({ length: 30 }, (_, i) => (
        <circle key={i} cx={(i * 97) % W} cy={(i * 53) % (H - 60)} r={1.6} fill="#fff" opacity="0.8"
          style={{ animation: `pg-snow ${4 + (i % 5)}s linear ${-(i % 7)}s infinite` }} />
      ))}
      <text x={(HACK_X + HOUSE_X) / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">🥌 퇴근 컬링 — 3투 합계 {CURL_PASS}점 이상이면 칼퇴</text>
    </>
  )
}

// 금 — 회사 앞 광장(노을), 줄 돌리는 기둥
function PlazaArt() {
  return (
    <>
      <rect x={MTN_L - 10} y={GROUND_TOP} width={PEAK_X - MTN_L + 20} height={H} fill="#A8A29E" opacity="0.5" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={MTN_L + i * 36} y1={GROUND_TOP} x2={MTN_L + i * 36 - 20} y2={H} stroke="#78716C" strokeWidth="1" opacity="0.5" />
      ))}
      {['#F43F5E', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7'].map((c, i) => (
        <path key={i} d={`M ${MTN_L + 40 + i * 70} 30 q 35 18 70 0`} fill="none" stroke={c} strokeWidth="2" opacity="0.7" />
      ))}
      <text x={(ROPE_L + ROPE_R) / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFF7ED">🎆 불금 광장</text>
      <Flag x={PEAK_X} y={GY} label="칼퇴선" />
    </>
  )
}

// 화 — 사무실 복도(안쪽): 책상 줄, 끝에 출입문
function CorridorArt() {
  return (
    <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <rect width={PEAK_X + 48} height={H} fill="#E7E5E4" />
      <rect width={PEAK_X + 48} height={40} fill="#D6D3D1" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={30 + i * 74} y={14} width={44} height={6} fill="#FEF9C3" />)}
      {/* 창문(밤) */}
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={40 + i * 96} y={60} width={60} height={70} fill="#1E293B" stroke="#A8A29E" strokeWidth="4" />)}
      {/* 칸막이 책상 */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = 24 + i * 64
        return (
          <g key={i}>
            <rect x={x} y={GROUND_TOP - 44} width={52} height={10} fill="#A16207" />
            <rect x={x + 4} y={GROUND_TOP - 34} width={4} height={34} fill="#78716C" />
            <rect x={x + 44} y={GROUND_TOP - 34} width={4} height={34} fill="#78716C" />
            <rect x={x + 14} y={GROUND_TOP - 66} width={24} height={20} fill="#1F2937" stroke="#6B7280" />
            <rect x={x + 16} y={GROUND_TOP - 64} width={20} height={14} fill={i % 3 === 0 ? '#38BDF8' : '#334155'} />
          </g>
        )
      })}
      <rect x="0" y={GROUND_TOP} width={PEAK_X + 48} height={H} fill="#A8A29E" />
      {Array.from({ length: 16 }, (_, i) => <line key={i} x1={i * 40} y1={GROUND_TOP} x2={i * 40 - 30} y2={H} stroke="#78716C" strokeWidth="1" opacity="0.5" />)}
      <text x={60} y={GROUND_TOP - 80} textAnchor="middle" fontSize="10" fontWeight="700" fill="#57534E">🏢 야근 사무실</text>
      {/* 출입문 + 비상구 표시 */}
      <rect x={PEAK_X - 8} y={GROUND_TOP - 100} width={56} height={100 + 26} fill="#78350F" />
      <rect x={PEAK_X - 2} y={GROUND_TOP - 94} width={44} height={94 + 26} fill="#B45309" />
      <circle cx={PEAK_X + 34} cy={GROUND_TOP - 40} r={3} fill="#FDE68A" />
      <rect x={PEAK_X - 4} y={GROUND_TOP - 122} width={48} height={16} fill="#16A34A" rx="2" />
      <text x={PEAK_X + 20} y={GROUND_TOP - 110} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">🚪 EXIT</text>
      {/* 문 밖 = 밤거리 */}
      <defs>
        <linearGradient id="pg-out" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1F2E55" /><stop offset="1" stopColor="#FDD9A8" /></linearGradient>
      </defs>
      <rect x={PEAK_X + 48} y="0" width={W - PEAK_X - 48} height={H} fill="url(#pg-out)" />
      <rect x={PEAK_X + 48} y={GROUND_TOP} width={W - PEAK_X - 48} height={H} fill="#6B8E4E" />
      <Home />
    </svg>
  )
}

// ── 게임 장치 ────────────────────────────────────────────────────
export function ModeLayer({ mode, look, curling, dodge, archery, rope }: {
  mode: Mode; look: BossLook; curling: CurlingView | null; dodge: DodgeView | null; archery: ArcheryView | null; rope: RopeView | null
}) {
  if (mode === 'patrol') return <PatrolLayer look={look} />
  if (mode === 'curling' && curling) return <CurlingLayer c={curling} />
  if (mode === 'dodge' && dodge) return <DodgeLayer dodge={dodge} />
  if (mode === 'archery' && archery) return <ArcheryLayer a={archery} />
  if (mode === 'rope' && rope) return <RopeLayer rope={rope} />
  return null
}

// 부장님: 출입문 앞 책상에서 모니터를 보다가 돌아본다. 돌아보면 복도에 빨간 시야.
function PatrolLayer({ look }: { look: BossLook }) {
  const bx = PEAK_X - 34
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-[15]" width={W} height={H} aria-hidden>
        <rect x={bx - 26} y={GROUND_TOP - 40} width={52} height={10} fill="#7C2D12" />
        <rect x={bx + 2} y={GROUND_TOP - 62} width={22} height={18} fill="#1F2937" />
        {look !== 'away' && (
          <polygon points={`${bx - 6},${GY - 44} ${MTN_L - 10},${GY - 110} ${MTN_L - 10},${GY + 20}`}
            fill={look === 'look' ? 'rgba(239,68,68,0.2)' : 'none'} stroke={look === 'look' ? 'rgba(239,68,68,0.55)' : '#EAB308'}
            strokeWidth="2" strokeDasharray={look === 'look' ? undefined : '6 5'} />
        )}
      </svg>
      <div className="pointer-events-none absolute z-[26] flex flex-col items-center" style={{ left: bx, top: GY - 18, transform: 'translate(-50%, -100%)' }}>
        <span className={`mb-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-black shadow ${look === 'look' ? 'bg-[#E11D48] text-white' : look === 'warn' ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/90 text-[#5B6472]'}`}>
          {look === 'look' ? '👀 누구야?' : look === 'warn' ? '흠?' : '⌨️ 결재 중'}
        </span>
        <span className="text-[30px] leading-none" style={{ transform: look === 'away' ? 'scaleX(-1)' : undefined }}>🧑‍💼</span>
      </div>
    </>
  )
}

// 컬링: 미끄러지는 스톤(스위핑 중이면 빗자루 반짝), 힘 막대, 점수판
function CurlingLayer({ c }: { c: CurlingView }) {
  return (
    <>
      {c.stone && (
        <div className="pointer-events-none absolute z-[26] text-[22px] leading-none" style={{ left: c.stone.x, top: GY - 4, transform: 'translate(-50%, -100%)' }}>
          🥌{c.sweeping && <span className="absolute -left-5 top-1 text-[16px]" style={{ animation: 'pg-bob 200ms ease-in-out infinite' }}>🧹✨</span>}
        </div>
      )}
      {c.power !== null && (
        <div className="pointer-events-none absolute z-[27] h-[50px] w-[8px] rounded-sm bg-[#0F172A]/70" style={{ left: HACK_X - 30, top: GY - 70 }}>
          <div className="absolute bottom-0 w-full rounded-sm bg-[#22C55E]" style={{ height: `${c.power * 100}%` }} />
        </div>
      )}
      <div className="pointer-events-none absolute z-[29] flex flex-col items-center" style={{ left: (HACK_X + HOUSE_X) / 2, top: 30, transform: 'translateX(-50%)' }}>
        <span className="rounded-lg bg-[#0F172A]/85 px-3 py-1 text-[14px] font-black text-white">
          🥌 {Array.from({ length: CURL_STONES }, (_, i) => (c.scores[i] ?? '_')).join(' · ')} = {c.scores.reduce((x, y) => x + y, 0)} / {CURL_PASS}
        </span>
      </div>
    </>
  )
}

// 탄막: 오른쪽 끝 부장님이 쏘고, 위에서 떨어지는 건 땅에 그림자(점점 진해짐)
function DodgeLayer({ dodge }: { dodge: DodgeView }) {
  return (
    <>
      <div className="pointer-events-none absolute z-[24] flex flex-col items-center" style={{ left: SHOOTER_X + 8, top: GY, transform: 'translate(-50%, -100%)' }}>
        <span className="mb-0.5 rounded-md bg-[#E11D48] px-1.5 py-0.5 text-[10.5px] font-black text-white shadow">📢 이것도 해와!</span>
        <span className="text-[30px] leading-none" style={{ transform: 'scaleX(-1)' }}>🧑‍💼</span>
      </div>
      {dodge.shots.map(s => (
        s.kind === 'drop' ? (
          <div key={s.id}>
            <div className="pointer-events-none absolute z-[14] rounded-full bg-black" style={{ left: s.x - s.w / 2 - 2, top: GY - 4, width: s.w + 4, height: 7, opacity: 0.15 + 0.5 * (1 - s.bottom / 230) }} />
            <div className="pointer-events-none absolute z-[24] flex items-center justify-center rounded-md border border-[#7C5A3A] bg-[#FFF7ED]/95"
              style={{ left: s.x - s.w / 2, top: GY - s.top, width: s.w, height: s.w, fontSize: s.w * 0.75 }}>{s.label}</div>
          </div>
        ) : (
          <div key={s.id} className="pointer-events-none absolute z-[24] flex items-center justify-center rounded-md border"
            style={{
              left: s.x - s.w / 2, top: GY - s.top, width: s.w, height: s.top - s.bottom, fontSize: 14,
              background: s.kind === 'high' ? 'rgba(254,226,226,0.95)' : 'rgba(255,247,237,0.95)', borderColor: s.kind === 'high' ? '#E11D48' : '#7C5A3A',
            }}>{s.label}</div>
        )
      ))}
      {dodge.survived !== null && (
        <div className="pointer-events-none absolute z-[29] rounded-lg bg-[#0F172A]/80 px-3 py-1 text-[15px] font-black text-white" style={{ left: (ARENA_L + ARENA_R) / 2, top: 34, transform: 'translateX(-50%)' }}>
          ⏱ {(dodge.survived / 1000).toFixed(1)} / 20초
        </div>
      )}
    </>
  )
}

// 양궁: 과녁(위아래로 움직임), 바람 깃발, 내 조준선·힘 막대, 날아가는 화살, 점수판
function ArcheryLayer({ a }: { a: ArcheryView }) {
  const cy = GY - a.targetH
  const rings = ['#F8FAFC', '#111827', '#2563EB', '#DC2626', '#FACC15']
  const bowX = ARCH_LINE + 10, bowY = GY - BOW_H
  const windTxt = a.wind === 0 ? '바람 없음' : `${a.wind > 0 ? '뒷바람 →' : '← 맞바람'} ${Math.abs(a.wind).toFixed(1)}`
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-[15]" width={W} height={H} aria-hidden>
        {rings.map((c, i) => <circle key={i} cx={TARGET_X} cy={cy} r={TARGET_R - i * 7} fill={c} stroke="#475569" strokeWidth="0.8" />)}
        <text x={TARGET_X} y={cy + 5} textAnchor="middle" fontSize="12">🧑‍💼</text>
        {/* 바람 깃발 */}
        <line x1={(ARCH_LINE + TARGET_X) / 2} y1={GY - 26} x2={(ARCH_LINE + TARGET_X) / 2} y2={GY - 120} stroke="#E5E7EB" strokeWidth="2" />
        <polygon fill="#F43F5E" points={`${(ARCH_LINE + TARGET_X) / 2},${GY - 120} ${(ARCH_LINE + TARGET_X) / 2 + 30 * a.wind + (a.wind >= 0 ? 4 : -4)},${GY - 112} ${(ARCH_LINE + TARGET_X) / 2},${GY - 104}`} />
        {a.aim && (
          <>
            <line x1={bowX} y1={bowY} x2={bowX + 70 * Math.cos(a.aim.angle)} y2={bowY - 70 * Math.sin(a.aim.angle)} stroke="#FACC15" strokeWidth="2" strokeDasharray={a.aim.phase === 'angle' ? '4 3' : undefined} />
            {a.aim.phase === 'power' && (
              <>
                <rect x={bowX - 30} y={bowY - 64} width={8} height={50} fill="#0F172A" opacity="0.7" />
                <rect x={bowX - 30} y={bowY - 14 - 50 * a.aim.power} width={8} height={50 * a.aim.power} fill="#22C55E" />
              </>
            )}
          </>
        )}
        {a.arrows.map(ar => (
          <g key={ar.id} transform={`translate(${ar.x} ${GY - ar.h}) rotate(${ar.rot})`}>
            <line x1={-16} y1={0} x2={4} y2={0} stroke="#78350F" strokeWidth="2" />
            <polygon points="4,-3 10,0 4,3" fill="#475569" />
            <polygon points="-16,-3 -12,0 -16,3" fill="#F43F5E" />
          </g>
        ))}
      </svg>
      <div className="pointer-events-none absolute z-[29] flex flex-col items-center gap-1" style={{ left: (ARCH_LINE + TARGET_X) / 2, top: 30, transform: 'translateX(-50%)' }}>
        <span className="rounded-lg bg-[#0F172A]/85 px-3 py-1 text-[14px] font-black text-white">
          🎯 {Array.from({ length: ARCH_SHOTS }, (_, i) => (a.scores[i] ?? '_')).join(' · ')} = {a.scores.reduce((x, y) => x + y, 0)} / {ARCH_PASS}
        </span>
        <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10.5px] font-bold text-[#1F2933]">🚩 {windTxt}</span>
      </div>
    </>
  )
}

// 줄넘기: 양쪽 기둥 사이로 줄이 돈다(아래쪽 반바퀴는 캐릭터 앞에 그린다). 위쪽에 연속 횟수.
function RopeLayer({ rope }: { rope: RopeView }) {
  const hy = GY - 40
  // 줄 가운데 높이: 바닥(GY-2) ↔ 머리 위(GY-130). 2차 곡선 가운데 = (양끝 + 조절점)/2 이므로 조절점 = 2*가운데 - 양끝
  const midY = GY - 66 + 64 * Math.cos(rope.angle)
  const front = Math.cos(rope.angle) > 0
  const path = `M ${ROPE_L - 16} ${hy} Q ${(ROPE_L + ROPE_R) / 2} ${2 * midY - hy} ${ROPE_R + 16} ${hy}`
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-[15]" width={W} height={H} aria-hidden>
        {[ROPE_L - 16, ROPE_R + 16].map((x, i) => (
          <g key={i}>
            <rect x={x - 3} y={hy} width={6} height={GY - hy} fill="#7C2D12" />
            <circle cx={x} cy={hy} r={5} fill="#FDE68A" />
          </g>
        ))}
        {!front && <path d={path} fill="none" stroke="#F43F5E" strokeWidth="3" />}
      </svg>
      {front && (
        <svg className="pointer-events-none absolute inset-0 z-[28]" width={W} height={H} aria-hidden>
          <path d={path} fill="none" stroke="#F43F5E" strokeWidth="3" />
        </svg>
      )}
      <div className="pointer-events-none absolute z-[29] flex flex-col items-center" style={{ left: (ROPE_L + ROPE_R) / 2, top: 34, transform: 'translateX(-50%)' }}>
        <span className="rounded-lg bg-[#0F172A]/80 px-3 py-1 text-[16px] font-black text-white">🪢 {rope.streak} / {rope.need}</span>
        <span className="mt-0.5 text-[10.5px] font-bold text-white/90">{rope.inside > 0 ? `줄 안 ${rope.inside}명 · 다 같이 넘으면 칼퇴` : '줄 안에 들어가면 시작'}</span>
      </div>
    </>
  )
}

export const STAGE_KEYFRAMES = `
@keyframes pg-snow { from { transform: translateY(-40px) } to { transform: translateY(${H}px) } }
`

