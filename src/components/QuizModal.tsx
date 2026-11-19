'use client'

// 연상퀴즈를 홈에서 탭 이동 없이 바로 하는 창(2026-11-19). 게임 본체는 그대로 iframe(/drawing-game.html).
// [🖼 지난 판] 탭은 quiz_history(서버 트리거가 판 끝날 때 한 줄씩 남김)를 넘겨 본다.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type HistoryRow = {
  id: number; word: string | null; drawers: string[]; guesser: string | null; guess: string | null
  correct: boolean | null; drawings: string[]; skipped: string[]; started_by: string | null; finished_at: string
}

function fmtDay(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function Gallery() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    createClient().from('quiz_history')
      .select('id, word, drawers, guesser, guess, correct, drawings, skipped, started_by, finished_at')
      .order('finished_at', { ascending: false }).limit(30)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setFailed(true); return }
        setRows((data ?? []) as HistoryRow[])
        if (data?.length) setOpen(data[0].id)
      })
    return () => { alive = false }
  }, [])

  if (failed) return <p className="text-[13px] text-gray-400 p-6">지난 판을 불러오지 못했습니다.</p>
  if (!rows) return <p className="text-[13px] text-gray-400 p-6">불러오는 중…</p>
  if (!rows.length) return <p className="text-[13px] text-gray-400 p-6">아직 기록된 판이 없어요. 오늘부터 끝난 판이 여기에 쌓입니다.</p>

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2.5">
      {rows.map(r => {
        const isOpen = open === r.id
        const skipped = new Set(r.skipped ?? [])
        return (
          <div key={r.id} className="border border-[#E8E8E4] rounded-xl bg-white">
            <button onClick={() => setOpen(isOpen ? null : r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="text-[15px] font-bold text-[#1F1F1D]">{r.word}</span>
              <span className={`text-[12px] font-semibold ${r.correct ? 'text-emerald-600' : 'text-rose-500'}`}>
                {r.correct ? '정답 ✅' : `오답 ❌ · "${r.guess ?? ''}"`}
              </span>
              <span className="ml-auto text-[11.5px] text-gray-400 flex-shrink-0">{fmtDay(r.finished_at)}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <div className="flex items-start gap-2 overflow-x-auto pb-1">
                  {(r.drawings ?? []).map((url, i) => (
                    <div key={i} className="flex items-start gap-2 flex-shrink-0">
                      {i > 0 && <span className="text-gray-300 mt-12">→</span>}
                      <div className="w-[180px]">
                        <img src={url} alt="" className="w-full rounded-lg border border-gray-100" />
                        <p className="text-[12px] text-gray-600 mt-1 text-center">
                          {r.drawers?.[i]}{skipped.has(r.drawers?.[i] ?? '') && <span className="text-gray-400"> · ⏭ 건너뜀</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-2 flex-shrink-0">
                    <span className="text-gray-300 mt-12">→</span>
                    <div className="w-[120px] h-[120px] rounded-lg bg-stone-50 border border-gray-100 flex flex-col items-center justify-center text-center px-2">
                      <p className="text-[11px] text-gray-400">정답자 {r.guesser}{skipped.has(r.guesser ?? '') ? ' · ⏭' : ''}</p>
                      <p className="text-[14px] font-bold text-[#1F1F1D] mt-1 break-all">{r.guess}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function QuizModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'game' | 'gallery'>('game')

  const frameRef = useRef<HTMLIFrameElement>(null)

  // Esc로 닫기 — 게임(iframe) 안에 포커스가 있어도 먹게 iframe 창에도 같은 키를 건다(같은 출처)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    let inner: Window | null = null
    const attach = () => {
      try { inner?.removeEventListener('keydown', onKey); inner = frameRef.current?.contentWindow ?? null; inner?.addEventListener('keydown', onKey) } catch { inner = null }
    }
    const frame = frameRef.current
    attach()
    frame?.addEventListener('load', attach)
    return () => {
      window.removeEventListener('keydown', onKey)
      frame?.removeEventListener('load', attach)
      try { inner?.removeEventListener('keydown', onKey) } catch { /* 닫힌 iframe */ }
    }
  }, [onClose])

  return (
    // 바깥 클릭으로는 안 닫는다 — 그리는 중에 실수로 닫히면 그림이 날아간다(× 또는 Esc로만)
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-[#FAFAF8] rounded-2xl shadow-2xl w-full max-w-[1100px] h-full max-h-[860px] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-[#E8E8E4] bg-white flex-shrink-0">
          <p className="text-[14px] font-semibold text-[#1F1F1D] mr-2">🎨 연상퀴즈</p>
          {(['game', 'gallery'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] px-3 py-1 rounded-full ${tab === t ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
              {t === 'game' ? '게임' : '🖼 지난 판'}
            </button>
          ))}
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 text-[20px] leading-none px-2" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0">
          {/* 게임은 지난 판을 보는 동안에도 계속 연결돼 있게 숨기기만 한다 */}
          <iframe ref={frameRef} src="/drawing-game.html" className={`w-full h-full border-0 ${tab === 'game' ? 'block' : 'hidden'}`} allow="clipboard-write" />
          {tab === 'gallery' && <Gallery />}
        </div>
      </div>
    </div>
  )
}
