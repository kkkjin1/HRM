'use client'

import { useEffect, useState } from 'react'
import { ARCHIVE_CATEGORIES, type ArchiveCategory, type ArchiveCase } from '@/lib/archiveCategories'

const INPUT_CLASS = 'w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0]'
const LABEL_CLASS = 'block text-[12px] text-[#7A8491] mb-1.5'

export default function ArchiveCaseModal({
  initial, onClose, onSubmit,
}: {
  initial?: ArchiveCase
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<ArchiveCategory>(initial?.category ?? ARCHIVE_CATEGORIES[0])
  const [situation, setSituation] = useState(initial?.situation ?? '')
  const [conclusion, setConclusion] = useState(initial?.conclusion ?? '')
  const [keywordsText, setKeywordsText] = useState(initial?.keywords.join(' ') ?? '')
  const [slackUrl, setSlackUrl] = useState(initial?.slack_url ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('사례명을 입력해주세요.'); return }

    setSubmitting(true)
    setErrorMsg('')
    const keywords = keywordsText.split(/\s+/).map(w => w.trim()).filter(Boolean)
    const payload = { title: title.trim(), category, situation, conclusion, keywords, slack_url: slackUrl.trim() }

    const res = await onSubmit(payload)
    setSubmitting(false)
    if (!res.ok) { setErrorMsg(res.error ?? '저장에 실패했습니다.'); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-lg space-y-3.5 max-h-[85vh] overflow-y-auto">
        <h2 className="text-[15px] font-semibold text-[#1F2933]">{initial ? '사례 수정' : '새 사례 등록'}</h2>

        <div>
          <label className={LABEL_CLASS}>사례명</label>
          <input className={INPUT_CLASS} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} autoFocus placeholder="예) 출산휴가 중 계약 종료 통보 건" />
        </div>

        <div>
          <label className={LABEL_CLASS}>유형</label>
          <select className={`${INPUT_CLASS} bg-white`} value={category} onChange={e => setCategory(e.target.value as ArchiveCategory)}>
            {ARCHIVE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>상황</label>
          <textarea className={`${INPUT_CLASS} resize-none`} rows={4} value={situation} onChange={e => setSituation(e.target.value)} placeholder="어떤 상황이었는지 작성해주세요." />
        </div>

        <div>
          <label className={LABEL_CLASS}>결론</label>
          <textarea className={`${INPUT_CLASS} resize-none`} rows={4} value={conclusion} onChange={e => setConclusion(e.target.value)} placeholder="어떻게 처리/결론났는지 작성해주세요." />
        </div>

        <div>
          <label className={LABEL_CLASS}>키워드</label>
          <input className={INPUT_CLASS} value={keywordsText} onChange={e => setKeywordsText(e.target.value)} placeholder="#출산휴가 #계약종료 (공백으로 구분)" />
        </div>

        <div>
          <label className={LABEL_CLASS}>원문 슬랙 링크</label>
          <input className={INPUT_CLASS} value={slackUrl} onChange={e => setSlackUrl(e.target.value)} placeholder="https://...slack.com/..." />
        </div>

        {errorMsg && <p className="text-[12px] text-red-500">{errorMsg}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={submitting} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5 disabled:opacity-50">
            저장
          </button>
          <button type="button" onClick={onClose} className="text-[12.5px] font-medium text-[#7A8491] px-3 py-1.5">취소</button>
        </div>
      </form>
    </div>
  )
}
