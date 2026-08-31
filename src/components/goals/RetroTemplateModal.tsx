'use client'

import { useEffect, useState } from 'react'
import RetroTextarea from './RetroTextarea'

// 개인 회고 작성 시 참고하는 공통 질문 양식 팝업. 월/작성자 구분 없이 팀 전체가 공유하는 문서 한 장이라
// 회고 본문과 달리 연/월 파라미터 없이 단일 콘텐츠를 불러오고 저장한다.
export default function RetroTemplateModal({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/goal-retro-template')
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (json.ok) setContent(json.content)
      setLoaded(true)
    })()
  }, [])

  async function save(next: string) {
    setContent(next)
    const res = await fetch('/api/goal-retro-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: next }),
    })
    if (res.status === 401) window.location.href = '/login'
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-lg space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#1F2933]">회고 양식</h2>
          <button type="button" onClick={onClose} className="text-[13px] text-[#B0B8C1] hover:text-[#7A8491] px-1">✕</button>
        </div>
        <p className="text-[12px] text-[#7A8491]">매달 개인 회고 작성 시 참고하는 공통 질문입니다.</p>

        {!loaded ? (
          <p className="text-[13px] text-[#7A8491] py-6 text-center">불러오는 중...</p>
        ) : (
          <RetroTextarea
            key="retro-template"
            value={content}
            placeholder="개인 회고를 쓸 때 공통으로 참고할 질문을 적어주세요."
            rows={14}
            onSave={save}
          />
        )}
      </div>
    </div>
  )
}
