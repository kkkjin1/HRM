'use client'

// 팀 탭 "우리 팀 이해" — 팀을 하나의 단위로 읽는 화면. 데이터는 받기만 하고 그린다(조회·저장은 TeamDynamicsSection).
// 읽는 순서: ① 우리 팀은 어떤 팀인가 → ② 잘 맞고 보완하는 지점 → ③ 실제 협업 경험(R0) → ④ 확인·개선이 필요한 부분.
// 성향 차이(잠재 가설)와 R0 응답(실제 경험)은 항상 따로 표시하고, 모든 문장 옆에 근거(문항·사람)를 붙인다.

import { NEED_SUPPLY_MAP, lowestLayer, profileChips, type CheckKind, type Profile, type TeamAnalysis } from '@/lib/team/composition'
import type { RoundView } from '@/lib/team/rounds'

export type PersonView = { id: string; name: string }

type Props = {
  people: PersonView[]
  analysis: TeamAnalysis
  profiles: Record<string, Profile | undefined>
  round: RoundView | null          // 지금 보여 줄 진단 회차(R0 또는 진행 중인 회차). 없으면 미실시
  isLead: boolean
  busy?: boolean
  error?: string | null
  unavailable?: boolean            // 진단 목록을 못 불러옴 — 상태를 모르므로 시작 버튼을 숨긴다
  onStart?: () => void
  onRespond?: () => void
  onClose?: () => void
  onShowResponses?: () => void
}

const card = 'bg-white rounded-2xl border border-[#EEF0F2] p-5'
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '')

function Names({ ids, nameOf }: { ids: string[]; nameOf: (id: string) => string }) {
  return <span className="text-[#7A8491]">{ids.map(nameOf).join(', ')}</span>
}

function SectionTitle({ n, title, sub, badge }: { n: number; title: string; sub: string; badge?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-6 h-6 rounded-full bg-[#1F2933] text-white text-[11.5px] font-semibold flex items-center justify-center flex-shrink-0">{n}</span>
        <p className="text-[15px] font-semibold text-[#1F2933]">{title}</p>
        {badge}
      </div>
      <p className="text-[12px] text-[#7A8491] mt-1 sm:ml-8">{sub}</p>
    </div>
  )
}

function SourceBadge({ source, date }: { source: TeamAnalysis['source']; date?: string }) {
  return source === 'r0'
    ? <span className="text-[11px] font-medium text-[#059669] bg-[#ECFDF5] rounded-full px-2 py-0.5">R0 응답 기준{date ? ` · ${date}` : ''}</span>
    : <span className="text-[11px] font-medium text-[#B45309] bg-[#FFF7ED] rounded-full px-2 py-0.5">현재 ‘나와 일하는 법’ 기준 · R0 전 가설</span>
}

function Bar({ value, max, tone = 'bg-[#4C7FE0]' }: { value: number; max: number; tone?: string }) {
  return (
    <div className="flex-1 h-2 bg-[#F0F2F5] rounded-full overflow-hidden min-w-[60px]">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  )
}

const CHECK_STYLE: Record<CheckKind, { label: string; cls: string; desc: string }> = {
  watch: { label: '함께 살펴보기', cls: 'bg-[#FDECEC] text-[#B42318]', desc: '성향 차이가 있고 불편을 겪었다는 응답도 있습니다. 불편이 이 차이 때문인지는 함께 이야기해 확인해야 합니다.' },
  other_cause: { label: '원인 확인', cls: 'bg-[#FFF7ED] text-[#B45309]', desc: '선호는 비슷한데 불편 경험이 있습니다 — 방식 차이 말고 다른 원인을 함께 확인해 볼 지점입니다.' },
  latent: { label: '잠재', cls: 'bg-[#EEF4FF] text-[#3A5BC7]', desc: '성향 차이는 있지만 지금은 불편 경험이 거의 없습니다 — 가설로만 두고 지켜봅니다.' },
  stable: { label: '이번 응답에선 신호 없음', cls: 'bg-[#ECFDF5] text-[#047857]', desc: '선호가 비슷하고 이번 R0에서 불편을 답한 사람이 없습니다(한 번의 응답 기준).' },
}

export default function TeamUnderstanding({ people, analysis: a, profiles, round, isLead, busy, error, unavailable, onStart, onRespond, onClose, onShowResponses }: Props) {
  const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? '알 수 없음'
  const r0Date = round?.status === 'closed' ? fmtDate(round.closed_at) : undefined
  const exp = a.experience
  const low = exp ? lowestLayer(exp.layers) : null

  return (
    <div className="space-y-5">
      {/* ── R0 상태 ── */}
      <RoundStatus round={round} isLead={isLead} busy={busy} error={error} unavailable={unavailable} onStart={onStart} onRespond={onRespond} onClose={onClose} onShowResponses={onShowResponses} />

      {/* ── ① 우리 팀은 어떤 팀인가 ── */}
      <section className={card}>
        <SectionTitle n={1} title="우리 팀은 어떤 팀인가" sub={`${a.n}명이 공통으로 가진 일하는 방식과, 서로 다른 지점입니다.`} badge={<SourceBadge source={a.source} date={r0Date} />} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] font-semibold text-[#1F2933] mb-2">공통으로 나타나는 성향 <span className="font-normal text-[#B0B8C1]">· 응답자 과반(2명 이상)이 같은 선택</span></p>
            {a.common.length === 0 ? <p className="text-[12.5px] text-[#B0B8C1]">과반이 같은 선택을 한 항목이 없습니다 — 일하는 방식이 고르게 다양한 팀입니다.</p> : (
              <ul className="space-y-1.5">
                {a.common.map(c => (
                  <li key={c.key} className="text-[12.5px] text-[#3A4249] bg-[#FAFBFC] rounded-lg px-3 py-2">
                    <span className="mr-1">{c.icon}</span><b className="font-semibold">{c.title}: {c.group.label}</b>
                    <span className="text-[#7A8491]"> · {c.group.memberIds.length}/{c.n}명</span>
                    <p className="text-[11.5px] mt-0.5">근거: <Names ids={c.group.memberIds} nameOf={nameOf} /></p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#1F2933] mb-2">서로 다른 성향 <span className="font-normal text-[#B0B8C1]">· 선택이 2가지 이상으로 나뉜 항목</span></p>
            {a.diverse.length === 0 ? <p className="text-[12.5px] text-[#B0B8C1]">모든 항목에서 선호가 같습니다.</p> : (
              <ul className="space-y-1.5">
                {a.diverse.map(d => (
                  <li key={d.key} className="text-[12.5px] text-[#3A4249] bg-[#FAFBFC] rounded-lg px-3 py-2">
                    <span className="mr-1">{d.icon}</span><b className="font-semibold">{d.title}</b>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px]">
                      {d.groups.map(g => <span key={g.value}>{g.label} <Names ids={g.memberIds} nameOf={nameOf} /></span>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {a.topGives.length > 0 && (
          <div className="mt-4">
            <p className="text-[12px] font-semibold text-[#1F2933] mb-2">팀원들이 보탠다고 답한 강점 <span className="font-normal text-[#B0B8C1]">· ‘보태는 것’ 응답 인원</span></p>
            <div className="flex flex-wrap gap-1.5">
              {a.topGives.map(g => (
                <span key={g.value} className="text-[12px] bg-[#F0F9F4] text-[#047857] border border-[#A7F3D0] rounded-full px-2.5 py-1" title={g.memberIds.map(nameOf).join(', ')}>
                  {g.label} <b>{g.memberIds.length}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── ② 잘 맞고 보완하는 지점 ── */}
      <section className={card}>
        <SectionTitle n={2} title="서로 보완할 수 있는 지점" sub="누군가 기대하는 것을 팀 안의 다른 사람이 보탤 수 있다고 답한 곳입니다. 응답을 이은 가능성이고, 실제로 도움이 오가는지는 대화와 다음 진단으로 확인합니다." />
        {a.complements.length === 0 && a.unmetNeeds.length === 0 ? <p className="text-[12.5px] text-[#B0B8C1]">‘기대하는 것’ 응답이 아직 없습니다.</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[12px] font-semibold text-[#1F2933] mb-2">팀 안에서 채울 수 있는 기대</p>
              {a.complements.length === 0 ? <p className="text-[12.5px] text-[#B0B8C1]">아직 없습니다.</p> : (
                <ul className="space-y-1.5">
                  {a.complements.map(c => (
                    <li key={c.need} className="text-[12.5px] text-[#3A4249] bg-[#FAFBFC] rounded-lg px-3 py-2">
                      <b className="font-semibold">‘{c.need}’</b>을 기대 — <Names ids={c.demand} nameOf={nameOf} />
                      <div className="text-[11.5px] mt-0.5">
                        ↳ 관련 강점을 보탠다고 답한 사람: {c.supply.map(s => <span key={s.tag} className="mr-2">{s.tag} <Names ids={s.memberIds} nameOf={nameOf} /></span>)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#1F2933] mb-2">팀 안에서 보탤 사람이 보이지 않는 기대</p>
              {a.unmetNeeds.length === 0 && a.emptyGives.length === 0 ? <p className="text-[12.5px] text-[#B0B8C1]">응답 기준으로는 모든 기대에 관련 강점을 보탠다고 답한 사람이 있습니다.</p> : (
                <ul className="space-y-1.5">
                  {a.unmetNeeds.map(u => (
                    <li key={u.need} className="text-[12.5px] text-[#3A4249] bg-[#FFFBF5] rounded-lg px-3 py-2">
                      <b className="font-semibold">‘{u.need}’</b>을 기대 — <Names ids={u.demand} nameOf={nameOf} />
                      <p className="text-[11.5px] text-[#B45309] mt-0.5">관련 강점({NEED_SUPPLY_MAP[u.need].join('·')})을 보탠다고 답한 사람이 없습니다 — 팀 밖 지원이나 운영 방식으로 채울지 이야기해 볼 지점입니다.</p>
                    </li>
                  ))}
                  {a.emptyGives.length > 0 && (
                    <li className="text-[11.5px] text-[#7A8491] px-1">기대는 있지만 아무도 고르지 않은 강점: {a.emptyGives.join(', ')}</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
        <details className="mt-3">
          <summary className="text-[11.5px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">연결 기준 보기</summary>
          <p className="text-[11.5px] text-[#7A8491] mt-2 leading-relaxed">
            개인 간 궁합 점수는 만들지 않습니다. ‘기대하는 것’과 ‘보태는 것’ 응답을 아래 규칙으로만 잇습니다(응답 기준의 가능성이며 실제 성과를 뜻하지 않습니다) —{' '}
            {Object.entries(NEED_SUPPLY_MAP).map(([n, g]) => `${n} ← ${g.join('·')}`).join(' / ')}. ‘자율성’은 동료가 채우는 능력보다 팀 운영 방식의 문제라 잇지 않습니다.
          </p>
        </details>
        <div className="mt-4">
          <p className="text-[12px] font-semibold text-[#1F2933] mb-2">서로 알아 두면 좋은 협업 방식 <span className="font-normal text-[#B0B8C1]">· 각자의 ‘나와 일하는 법’</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {people.map(p => (
              <div key={p.id} className="border border-[#EEF0F2] rounded-lg px-3 py-2">
                <p className="text-[12.5px] font-medium text-[#1F2933] mb-1">{p.name}</p>
                <div className="flex flex-wrap gap-1">
                  {profileChips(profiles[p.id]).map(c => <span key={c.key} className="text-[10.5px] bg-[#F0F2F5] text-[#3A4249] rounded-full px-1.5 py-0.5">{c.icon} {c.label}</span>)}
                  {profileChips(profiles[p.id]).length === 0 && <span className="text-[11px] text-[#C4CBD2]">아직 작성 전</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ③ 실제 협업 경험 ── */}
      <section className={card}>
        <SectionTitle n={3} title="팀원들이 실제로 경험하는 협업" sub="R0에서 팀원들이 직접 답한 결과입니다(실명 응답, 마감 후 공개)." badge={exp ? <SourceBadge source="r0" date={r0Date} /> : undefined} />
        {!exp ? (
          <p className="text-[12.5px] text-[#7A8491] bg-[#FAFBFC] rounded-lg px-4 py-6 text-center">
            {round?.status === 'open' ? 'R0 진행 중입니다. 전원이 제출해 마감되면 여기에 결과가 공개됩니다.' : 'R0를 마치면 팀원들이 직접 답한 강점·협업 경험이 여기에 표시됩니다.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <p className="text-[12px] font-semibold text-[#1F2933] mb-2">우리 팀이 잘하고 있다고 꼽은 것 <span className="font-normal text-[#B0B8C1]">· {exp.n}명 응답</span></p>
              <ul className="space-y-1.5">
                {exp.strengths.slice(0, 5).map(s => (
                  <li key={s.key} className="flex items-center gap-2 text-[12.5px] text-[#3A4249]">
                    <span className="w-[150px] flex-shrink-0 truncate">{s.label}</span><Bar value={s.count} max={exp.n} tone="bg-[#10B981]" /><span className="text-[11.5px] text-[#7A8491] w-9 text-right">{s.count}명</span>
                  </li>
                ))}
              </ul>
              {exp.peerTraits.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12px] font-semibold text-[#1F2933] mb-1.5">동료들이 서로에게서 가장 많이 본 강점 <span className="font-normal text-[#B0B8C1]">· 조하리 동료 선택 횟수</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {exp.peerTraits.map(t => <span key={t.key} className="text-[12px] bg-[#EEF1FE] text-[#3A5BC7] rounded-full px-2.5 py-1">{t.label} <b>{t.count}회</b></span>)}
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#1F2933] mb-2">팀 기능 5층 <span className="font-normal text-[#B0B8C1]">· Lencioni 약식(검증된 척도 아님), 5점</span></p>
              <ul className="space-y-1.5">
                {[...exp.layers].reverse().map(l => (
                  <li key={l.layer.key} className="flex items-center gap-2 text-[12.5px] text-[#3A4249]">
                    <span className="w-[90px] flex-shrink-0">{l.layer.level}. {l.layer.name}</span>
                    <Bar value={l.score} max={5} tone={low?.layer.key === l.layer.key ? 'bg-[#E8B84B]' : 'bg-[#4C7FE0]'} />
                    <span className="text-[11.5px] text-[#7A8491] w-9 text-right">{l.responses ? l.score.toFixed(1) : '-'}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] font-semibold text-[#1F2933] mt-4 mb-2">방식 차이로 불편했던 경험 <span className="font-normal text-[#B0B8C1]">· 최근 한 달, ‘한두 번’ 이상 답한 인원 / 잦음 = ‘몇 번’·‘자주’</span></p>
              <ul className="space-y-1.5">
                {exp.friction.map(f => {
                  const d = a.dimensions.find(x => x.key === f.key)!
                  return (
                    <li key={f.key} className="flex items-center gap-2 text-[12.5px] text-[#3A4249]">
                      <span className="w-[90px] flex-shrink-0">{d.icon} {d.title}</span>
                      <Bar value={f.experienced} max={f.n} tone={f.frequent > 0 ? 'bg-[#E8837A]' : 'bg-[#E8B84B]'} />
                      <span className="text-[11.5px] text-[#7A8491] w-[92px] text-right whitespace-nowrap">{f.experienced}/{f.n}명{f.frequent ? ` · 잦음 ${f.frequent}` : ''}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ── ④ 확인·개선이 필요한 부분 ── */}
      <section className={card}>
        <SectionTitle n={4} title="앞으로 확인하거나 함께 다룰 부분" sub="성향 차이(잠재)와 실제 경험(R0)을 나란히 놓고, 어디를 먼저 이야기해 볼지 정리했습니다. 원인이나 결론을 판정하는 것이 아니라 대화의 출발점입니다." />
        <ul className="space-y-2">
          {a.checks.map(c => {
            const d = a.dimensions.find(x => x.key === c.key)!
            const st = c.kind ? CHECK_STYLE[c.kind] : null
            return (
              <li key={c.key} className="border border-[#EEF0F2] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-[#1F2933]">{d.icon} {c.title}</span>
                  {st ? <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    : <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-[#F0F2F5] text-[#7A8491]">R0로 확인 필요</span>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-1.5 text-[11.5px] text-[#3A4249]">
                  <p><span className="text-[#B0B8C1]">잠재 · 성향</span>{' '}
                    {c.differs ? d.groups.map(g => `${g.label} ${g.memberIds.length}`).join(' / ') : `모두 ${d.groups[0]?.label ?? '미응답'}`}
                  </p>
                  <p><span className="text-[#B0B8C1]">실제 · R0 경험</span>{' '}
                    {c.experience ? `불편 경험 ${c.experience.experienced}/${c.experience.n}명` : '아직 응답 없음'}
                  </p>
                </div>
                <p className="text-[11.5px] text-[#7A8491] mt-1">{st ? st.desc : c.differs ? `가설: ${c.hypothesis}` : '이 항목은 선호가 같습니다. 실제 경험은 R0 응답으로 확인합니다.'}</p>
              </li>
            )
          })}
        </ul>
        {exp && (exp.change.length > 0 || low) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {exp.change.length > 0 && (
              <div className="bg-[#FAFBFC] rounded-lg px-4 py-3">
                <p className="text-[12px] font-semibold text-[#1F2933] mb-1.5">팀원들이 함께 바꾸고 싶다고 꼽은 것</p>
                <ul className="space-y-1 text-[12.5px] text-[#3A4249]">
                  {exp.change.slice(0, 4).map(c => <li key={c.key}>• {c.label} <span className="text-[#7A8491]">{c.count}명</span></li>)}
                </ul>
              </div>
            )}
            {low && (
              <div className="bg-[#FAFBFC] rounded-lg px-4 py-3">
                <p className="text-[12px] font-semibold text-[#1F2933] mb-1.5">팀 기능 중 가장 낮게 응답된 층</p>
                <p className="text-[12.5px] text-[#3A4249]">{low.layer.level}. {low.layer.name} <span className="text-[#7A8491]">{low.score.toFixed(1)}점 · {low.responses}개 응답 기준</span></p>
                <p className="text-[11.5px] text-[#7A8491] mt-1">이 층이 약할 때 흔히 보이는 신호(참고): {low.layer.symptom}</p>
              </div>
            )}
          </div>
        )}
        <details className="mt-3">
          <summary className="text-[11.5px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">분류 기준 보기</summary>
          <p className="text-[11.5px] text-[#7A8491] mt-2 leading-relaxed">
            잠재 = 같은 항목에서 선택이 2가지 이상으로 나뉨. 실제 = R0에서 1명 이상이 ‘한두 번’ 이상 불편을 답함.
            두 가지가 모두 있으면 ‘함께 살펴보기’, 선호는 같은데 불편 응답이 있으면 ‘원인 확인’, 차이만 있으면 ‘잠재’, 둘 다 없으면 ‘이번 응답에선 신호 없음’.
            한 번의 응답(5명)으로 원인을 확정할 수 없으므로 판정이 아니라 우선순위 정리입니다.
          </p>
        </details>
        <p className="text-[11.5px] text-[#B0B8C1] mt-3">이 내용을 바탕으로 함께 다룰 주제와 실험은 다음 단계에서 팀이 같이 정합니다.</p>
      </section>
    </div>
  )
}

function RoundStatus({ round, isLead, busy, error, unavailable, onStart, onRespond, onClose, onShowResponses }: Pick<Props, 'round' | 'isLead' | 'busy' | 'error' | 'unavailable' | 'onStart' | 'onRespond' | 'onClose' | 'onShowResponses'>) {
  const btn = 'text-[12.5px] font-medium rounded-lg px-3.5 py-2 disabled:opacity-40'
  if (unavailable) {
    return (
      <section className="rounded-2xl border border-[#EEF0F2] bg-white p-5">
        <p className="text-[11.5px] font-semibold text-[#7A8491]">팀 진단</p>
        <p className="text-[13px] text-[#3A4249] mt-1">{error}</p>
      </section>
    )
  }
  return (
    <section className="rounded-2xl border border-[#D9E3F7] bg-[#F5F8FE] p-5">
      {!round && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold text-[#4C7FE0]">R0 최초 팀 진단 · 아직 시작 전</p>
            <p className="text-[15px] font-semibold text-[#1F2933] mt-0.5">우리 팀의 기준점을 만듭니다</p>
            <p className="text-[12px] text-[#5B6472] mt-1 leading-relaxed">전원이 실명으로 답하는 약 15분 진단입니다. 일하는 방식, 실제 협업 경험, 함께 지킬 행동을 묻고, 이후 변화를 이 결과와 비교합니다.</p>
          </div>
          {isLead ? <button onClick={onStart} disabled={busy} className={`${btn} text-white bg-[#4C7FE0] hover:bg-[#3A6CC8]`}>R0 시작하기</button>
            : <p className="text-[12px] text-[#7A8491]">팀장이 시작하면 여기서 응답할 수 있습니다.</p>}
        </div>
      )}
      {round?.status === 'open' && (
        <div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-[#4C7FE0]">{round.title} · 진행 중</p>
              <p className="text-[15px] font-semibold text-[#1F2933] mt-0.5">{round.submitted_n}/{round.roster_n}명 제출</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {round.in_roster && (
                <button onClick={onRespond} disabled={busy} className={`${btn} text-white bg-[#4C7FE0] hover:bg-[#3A6CC8]`}>
                  {round.my_submitted ? '내 응답 수정' : '응답하기'}
                </button>
              )}
              {isLead && (round.kind === 'baseline' ? round.submitted_n === round.roster_n : round.submitted_n > 0) && (
                <button onClick={onClose} disabled={busy} className={`${btn} text-[#5B6472] border border-[#D0D7E2] bg-white hover:bg-[#F7F8F8]`}>
                  {round.kind === 'baseline' ? '마감하기' : '지금 마감'}
                </button>
              )}
            </div>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden mt-3">
            <div className="h-full bg-[#4C7FE0] rounded-full" style={{ width: `${(round.submitted_n / round.roster_n) * 100}%` }} />
          </div>
          <p className="text-[11.5px] text-[#7A8491] mt-2">
            {round.in_roster ? (round.my_submitted ? '내 응답은 제출됐습니다. 마감 전까지 고칠 수 있어요. ' : '아직 제출하지 않았습니다. ') : ''}
            마감 전에는 각자 자기 응답과 제출 인원만 보입니다(팀장 포함). 전원이 제출하면 자동으로 마감되고 결과가 모두에게 공개됩니다.
            {round.kind === 'baseline' && ' R0는 팀의 첫 기준점이라 일부만 받고 마감하지 않습니다.'}
            {round.kind === 'baseline' && isLead && ' 장기 부재 등으로 참여자를 바꿔야 하면 예외 절차(사유 기록)로만 조정합니다.'}
          </p>
        </div>
      )}
      {round?.status === 'closed' && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold text-[#059669]">{round.title} · 완료</p>
            <p className="text-[15px] font-semibold text-[#1F2933] mt-0.5">{fmtDate(round.closed_at)} 마감 · {round.submitted_n}/{round.roster_n}명 응답</p>
            <p className="text-[12px] text-[#5B6472] mt-1">이 결과가 앞으로 팀 변화를 비교할 기준점입니다. 응답은 이 회차의 기록으로 보존되며 개인 프로필은 바뀌지 않습니다.{round.close_reason === 'manual' ? ' (팀장이 전원 제출 전에 마감)' : ''}</p>
          </div>
          <button onClick={onShowResponses} className={`${btn} text-[#3A5BC7] border border-[#C7D6F5] bg-white hover:bg-[#EEF1FE]`}>개인별 응답 보기</button>
        </div>
      )}
      {error && <p className="text-[12px] text-red-500 mt-2">{error}</p>}
    </section>
  )
}

