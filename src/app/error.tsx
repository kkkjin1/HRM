'use client'

// 앱 전역 에러 화면.

import { useEffect } from 'react'

export default function TeamLogError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5] px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 w-full max-w-sm text-center">
        <p className="text-sm text-gray-700 mb-4">일시적인 오류가 발생했습니다.</p>
        <button
          onClick={reset}
          className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
