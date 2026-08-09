'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5]">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 w-full max-w-sm">
        <p className="font-semibold text-gray-900 text-sm mb-1">비밀번호 찾기</p>
        <p className="text-xs text-gray-400 mb-6">가입한 이메일로 재설정 링크를 보내드립니다.</p>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-3 text-center">
              메일을 발송했습니다. 받은편지함을 확인해주세요.
            </p>
            <Link href="/login" className="block text-center text-xs text-[#4C7FE0] hover:underline">
              로그인으로 돌아가기
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] bg-white placeholder-gray-300"
                placeholder="name@company.com"
                required
              />
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? '발송 중...' : '재설정 링크 보내기'}
            </button>

            <Link href="/login" className="block text-center text-xs text-gray-400 hover:text-gray-600">
              로그인으로 돌아가기
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
