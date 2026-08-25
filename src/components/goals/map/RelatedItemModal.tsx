'use client'

import { useEffect, useState } from 'react'
import { RELATED_ITEM_TYPE_LABEL, type RelatedItem, type RelatedItemType } from './mapTypes'

const TYPES: RelatedItemType[] = ['memo', 'action', 'idea', 'link', 'free']
const INPUT_CLASS = 'w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0]'
const LABEL_CLASS = 'block text-[12px] text-[#7A8491] mb-1.5'

export default function RelatedItemModal({ initial, onClose, onSubmit }: {
  initial?: RelatedItem
  onClose: () => void
  onSubmit: (payload: { type: RelatedItemType; title: string; content: string; url: string }) => Promise<{ ok: boolean; error?: string }>
}) {
  const [type, setType] = useState<RelatedItemType>(initial?.type ?? 'memo')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('제목을 입력해주세요.'); return }
    setSubmitting(true)
    setErrorMsg('')
    const res = await onSubmit({ type, title: title.trim(), content, url })
    setSubmitting(false)
    if (!res.ok) { setErrorMsg(res.error ?? '저장에 실패했습니다.'); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-xs space-y-3">
        <h2 className="text-[14px] font-semibold text-[#1F2933]">{initial ? '연관 항목 수정' : '연관 항목 추가'}</h2>

        <div>
          <label className={LABEL_CLASS}>유형</label>
          <select className={`${INPUT_CLASS.replace('px-3 py-2', 'px-2.5 py-1.5')} bg-white`} value={type} onChange={e => setType(e.target.value as RelatedItemType)}>
            {TYPES.map(t => <option key={t} value={t}>{RELATED_ITEM_TYPE_LABEL[t]}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>제목</label>
          <input className={INPUT_CLASS} value={title} onChange={e => setTitle(e.target.value)} maxLength={100} autoFocus />
        </div>

        {type === 'link' && (
          <div>
            <label className={LABEL_CLASS}>URL</label>
            <input className={INPUT_CLASS} value={url} onChange={e => setUrl(e.target.value)} maxLength={500} placeholder="https://" />
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>내용(선택)</label>
          <textarea className={`${INPUT_CLASS} resize-none`} rows={3} maxLength={500} value={content} onChange={e => setContent(e.target.value)} />
        </div>

        {errorMsg && <p className="text-[12px] text-red-500">{errorMsg}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={submitting} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5 disabled:opacity-50">저장</button>
          <button type="button" onClick={onClose} className="text-[12.5px] font-medium text-[#7A8491] px-3 py-1.5">취소</button>
        </div>
      </form>
    </div>
  )
}
