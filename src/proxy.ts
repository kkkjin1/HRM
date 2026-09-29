import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/mock')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser()는 매 요청마다 Supabase Auth 서버에 네트워크 왕복을 한다(페이지·API 요청 전부 여기를 거침).
  // 이 프로젝트 JWT는 비대칭 키(ES256)라 getClaims()가 캐시된 공개키로 서명·만료를 로컬 검증한다 —
  // 만료 토큰 갱신(쿠키 재발급)은 내부 getSession()이 그대로 처리한다.
  // 트레이드오프: 다른 기기에서 로그아웃해도 이미 발급된 access token은 만료(기본 1시간)까지 유효.
  const { data: claimsData } = await supabase.auth.getClaims()
  const user = claimsData?.claims ?? null
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isAuthPage = pathname.startsWith('/auth/')
  const isMockPage = pathname.startsWith('/mock')

  if (!user && !isLoginPage && !isAuthPage && !isMockPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
