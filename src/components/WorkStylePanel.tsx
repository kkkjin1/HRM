'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { DOODLE_PALETTE } from '@/lib/data'
import {
  GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS, EMPTY_DRAFT, isFilledEnough, labelOf,
  type WorkStyle, type WorkStyleDraft,
} from '@/lib/workStyle'

export type WorkStyleMap = Map<string, WorkStyle>

function TagChip({ label, color = '#4C7FE0' }: { label: string; color?: string }) {
  return (
    <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#F0F2F5] text-[#3A4249]">{label}</span>
  )
}

function StyleChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#EEF0F2] text-[#3A4249]">
      <span>{icon}</span>{label}
    </span>
  )
}

function MemberStyleCard({ member, style, isMe, onEdit }: {
  member: { id: string; name: string; color_key: number }
  style: WorkStyle | null
  isMe: boolean
  onEdit: () => void
}) {
  const palette = DOODLE_PALETTE[member.color_key % 8]
  const filled = style ? isFilledEnough(style) : false

  return (
    <div className="border border-[#EEF0F2] rounded-xl p-3.5 bg-white">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9.5px] font-semibold flex-shrink-0" style={{ background: palette.bg, color: palette.fg }}>
            {member.name.slice(-2, -1) || member.name.slice(0, 1)}
          </span>
          <span className="text-[13px] font-medium text-[#1F2933]">{member.name}</span>
        </div>
        {isMe && (
          <button onClick={onEdit} className="text-[11px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] flex-shrink-0">
            {filled ? '편집' : '작성하기'}
          </button>
        )}
      </div>

      {!filled ? (
        <p className="text-[11.5px] text-[#C4CBD2]">{isMe ? '내 협업 스타일을 채워보세요.' : '아직 작성 전입니다.'}</p>
      ) : (
        <div className="space-y-2">
          {/* 협업 방식 */}
          {WORK_STYLE_QUESTIONS.some(q => style?.[q.key]) && (
            <div className="flex flex-wrap gap-1">
              {WORK_STYLE_QUESTIONS.map(q => {
                const val = style?.[q.key]
                if (!val) return null
                return <StyleChip key={q.key} icon={q.icon} label={labelOf(q.key, val) ?? ''} />
              })}
            </div>
          )}

          {/* 보태는 것 */}
          {style?.gives_tags.length ? (
            <div>
              <p className="text-[10px] font-medium text-[#059669] mb-0.5">보태는 것</p>
              <div className="flex flex-wrap gap-1">
                {style.gives_tags.map(t => <TagChip key={t} label={t} />)}
              </div>
            </div>
          ) : null}

          {/* 기대하는 것 */}
          {style?.needs_tags.length ? (
            <div>
              <p className="text-[10px] font-medium text-[#B45309] mb-0.5">기대하는 것</p>
              <div className="flex flex-wrap gap-1">
                {style.needs_tags.map(t => <TagChip key={t} label={t} />)}
              </div>
            </div>
          ) : null}

          {/* 못하는 것 + 부탁 */}
          {style?.growth_edge && (
            <p className="text-[11px] text-[#7A8491] leading-relaxed">
              <span className="text-[#B0B8C1]">못하는 것 · </span>{style.growth_edge}
            </p>
          )}
          {style?.team_request && (
            <p className="text-[11px] text-[#7A8491] leading-relaxed">
              <span className="text-[#B0B8C1]">팀에 부탁 · </span>{style.team_request}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TagPicker({ label, tags, selected, onChange }: {
  label: string
  tags: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  function toggle(t: string) {
    onChange(selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t])
  }
  return (
    <div>
      <p className="text-[12px] font-semibold text-[#1F2933] mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => {
          const active = selected.includes(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`text-[11.5px] px-2.5 py-1 rounded-full border transition-colors ${
                active ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'
              }`}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function WorkStylePanel({ onRowsChange }: { onRowsChange?: (map: WorkStyleMap) => void }) {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [styles, setStyles] = useState<WorkStyle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<WorkStyleDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('work_styles').select('*')
      if (!active) return
      if (data) setStyles(data as WorkStyle[])
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!onRowsChange) return
    onRowsChange(new Map(styles.map(s => [s.member_id, s])))
  }, [styles, onRowsChange])

  useEffect(() => {
    if (!editorOpen) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setEditorOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [editorOpen])

  const myStyle = me ? styles.find(s => s.member_id === me.id) ?? null : null

  function openEditor() {
    setDraft(myStyle ? {
      gives_tags: myStyle.gives_tags,
      needs_tags: myStyle.needs_tags,
      when_stuck: myStyle.when_stuck,
      feedback_pref: myStyle.feedback_pref,
      focus_time: myStyle.focus_time,
      meeting_pref: myStyle.meeting_pref,
      growth_edge: myStyle.growth_edge,
      team_request: myStyle.team_request,
    } : EMPTY_DRAFT)
    setEditorOpen(true)
  }

  async function save() {
    if (!me || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('work_styles')
      .upsert({ member_id: me.id, ...draft, updated_at: new Date().toISOString() })
      .select().single()
    if (data) {
      const row = data as WorkStyle
      setStyles(prev => [...prev.filter(s => s.member_id !== row.member_id), row])
    }
    setEditorOpen(false)
    setBusy(false)
  }

  if (!loaded || !membersLoaded) {
    return <div className="bg-white rounded-xl border border-[#EEF0F2] p-5"><p className="text-[13px] text-[#B0B8C1]">불러오는 중...</p></div>
  }

  const filledCount = styles.filter(s => members.some(m => m.id === s.member_id) && isFilledEnough(s)).length

  return (
    <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[13px] font-semibold text-[#1F2933]">나와 일하는 법</p>
          <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">
            협업 스타일 · {filledCount}/{members.length}명 작성
          </p>
        </div>
        {me && (
          <button
            onClick={openEditor}
            className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
          >
            {myStyle && isFilledEnough(myStyle) ? '내 스타일 편집' : '내 스타일 작성'}
          </button>
        )}
      </div>

      <p className="text-[12px] text-[#7A8491] leading-relaxed mb-4">
        유형 라벨이 아니라 <b>실제로 어떻게 일하는지</b>를 채워두면, 새 팀원도 기존 팀원도 협업 방식을 빠르게 파악할 수 있습니다.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {members.map(m => (
          <MemberStyleCard
            key={m.id}
            member={m}
            style={styles.find(s => s.member_id === m.id) ?? null}
            isMe={me?.id === m.id}
            onEdit={openEditor}
          />
        ))}
      </div>

      {/* 편집 모달 */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center px-4" onClick={() => setEditorOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[600px] max-h-[85vh] flex flex-col">
            <div className="flex-shrink-0 px-5 py-4 border-b border-[#EEF0F2]">
              <p className="text-[15px] font-semibold text-[#1F2933]">나와 일하는 법</p>
              <p className="text-[12px] text-[#7A8491] mt-0.5">팀원들이 나와 협업할 때 알면 좋은 것들을 채워주세요.</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* 협업 방식 선택 */}
              <div className="space-y-3">
                {WORK_STYLE_QUESTIONS.map(q => (
                  <div key={q.key}>
                    <p className="text-[12px] font-semibold text-[#1F2933] mb-1.5">
                      {q.icon} {q.label}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {q.options.map(opt => {
                        const active = draft[q.key] === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDraft(prev => ({ ...prev, [q.key]: active ? null : opt.value }))}
                            className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${
                              active ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#EEF0F2] pt-4 space-y-4">
                <TagPicker
                  label="보태는 것 — 내가 있어서 팀이 덜 걱정하는 영역"
                  tags={GIVES_TAGS}
                  selected={draft.gives_tags}
                  onChange={gives_tags => setDraft(prev => ({ ...prev, gives_tags }))}
                />
                <TagPicker
                  label="기대하는 것 — 누군가 채워주면 힘이 되는 것"
                  tags={NEEDS_TAGS}
                  selected={draft.needs_tags}
                  onChange={needs_tags => setDraft(prev => ({ ...prev, needs_tags }))}
                />
              </div>

              <div className="border-t border-[#EEF0F2] pt-4 space-y-3">
                <div>
                  <p className="text-[12px] font-semibold text-[#1F2933] mb-1">팀에서 내가 잘 못하는 것</p>
                  <input
                    value={draft.growth_edge ?? ''}
                    onChange={e => setDraft(prev => ({ ...prev, growth_edge: e.target.value || null }))}
                    placeholder="예: 마감 직전 우선순위 재조정, 갈등 상황에서 직접 말하기"
                    className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0]"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[#1F2933] mb-1">팀에 부탁하고 싶은 것</p>
                  <input
                    value={draft.team_request ?? ''}
                    onChange={e => setDraft(prev => ({ ...prev, team_request: e.target.value || null }))}
                    placeholder="예: 막혔을 때 먼저 말 걸어줘도 돼, 결정 전에 한번 물어봐줘"
                    className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0]"
                  />
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 px-5 py-4 border-t border-[#EEF0F2] flex items-center gap-2">
              <button
                onClick={save}
                disabled={busy}
                className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-4 py-2"
              >
                저장
              </button>
              <button onClick={() => setEditorOpen(false)} className="text-[13px] font-medium text-[#7A8491] px-4 py-2">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
