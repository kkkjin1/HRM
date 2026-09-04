import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { ARCHIVE_CATEGORIES, type ArchiveCategory } from '@/lib/archiveCategories'

const SELECT_COLS = 'id, title, category, situation, conclusion, keywords, slack_url, author, created_at'

function isCategory(v: unknown): v is ArchiveCategory {
  return typeof v === 'string' && (ARCHIVE_CATEGORIES as readonly string[]).includes(v)
}

function parseKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const words = v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)
  return Array.from(new Set(words.map(w => (w.startsWith('#') ? w : `#${w}`)))).slice(0, 20)
}

function parsePayload(body: unknown) {
  const b = body as Record<string, unknown> | null
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : ''
  const category = isCategory(b?.category) ? b.category : null
  if (!title || !category) return null
  return {
    title,
    category,
    situation: typeof b?.situation === 'string' ? b.situation.slice(0, 4000) : '',
    conclusion: typeof b?.conclusion === 'string' ? b.conclusion.slice(0, 4000) : '',
    keywords: parseKeywords(b?.keywords),
    slack_url: typeof b?.slack_url === 'string' ? b.slack_url.trim().slice(0, 500) : '',
    author: typeof b?.author === 'string' ? b.author.trim().slice(0, 40) : '',
  }
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_archive_cases').select(SELECT_COLS).order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cases: data })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const payload = parsePayload(body)
  if (!payload) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_archive_cases').insert(payload).select(SELECT_COLS).single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, case: data })
}
