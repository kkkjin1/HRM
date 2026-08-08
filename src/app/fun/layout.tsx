'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/fun', label: '일상' },
  { href: '/fun/stats', label: '기록' },
]

export default function FunLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      <aside className="fixed left-0 top-0 h-screen w-[240px] flex flex-col bg-[#FFFFFF] border-r border-[#E8E8E4] p-5">
        <Link href="/" className="text-[12px] text-[#9C9C96] hover:text-[#5B54C4] mb-6">‹ HRM 홈</Link>
        <p className="text-[15px] font-semibold text-[#1F1F1D] mb-5">인사기획팀 쉼터</p>
        <nav className="space-y-1 flex-1">
          {NAV.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-[14px] transition-colors ${
                  active ? 'bg-[#EEEDFE] text-[#5B54C4] font-medium' : 'text-[#6B6B66] hover:bg-[#F7F7F5]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <Link
          href="/fun/settings/members"
          className={`px-3 py-2 rounded-lg text-[13px] border-t border-[#E8E8E4] mt-3 pt-4 transition-colors ${
            pathname === '/fun/settings/members' ? 'text-[#5B54C4] font-medium' : 'text-[#9C9C96] hover:text-[#5B54C4]'
          }`}
        >
          ⚙ 멤버 관리
        </Link>
      </aside>

      <main className="ml-[240px] px-8 py-8 min-h-screen">{children}</main>
    </div>
  )
}
