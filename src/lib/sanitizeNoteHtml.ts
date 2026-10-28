// 개인업무 자유노트는 markdown이 아니라 에디터(Tiptap)가 만든 HTML을 그대로 저장한다(글자크기/색상/형광펜/표/체크리스트는
// HTML이라야 자연스럽다). 저장 전·렌더 전 둘 다 여기를 거쳐 허용 목록 밖의 태그·속성을 제거한다.
// DOM API 없이 정규식만 쓴다 — 서버(API 라우트, Node)와 브라우저 양쪽에서 똑같이 동작해야 해서.
// 예전 contentEditable 버전이 만든 <div>/<span style> 노트도 그대로 통과한다(에디터가 열면서 문단으로 바꿔 읽는다).
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'SPAN', 'DIV', 'P', 'BR', 'UL', 'OL', 'LI', 'MARK',
  'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'A',
  'TABLE', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
])
const VOID_TAGS = new Set(['BR', 'HR', 'COL'])
const ALLOWED_STYLE_PROPS = /^(color|background-color|font-weight|font-style|text-decoration|text-align|min-width|width)\s*:/i
const UNSAFE_STYLE_VALUE = /url\s*\(|expression\s*\(|javascript:|[<>]/i
const SAFE_HREF = /^(https?:\/\/|mailto:)/i
const COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i

// 태그별로 남길 속성 → 값 검사기. style은 모든 허용 태그에 공통으로 따로 처리한다.
const ATTR_RULES: Record<string, Record<string, (v: string) => boolean>> = {
  A: {
    href: v => SAFE_HREF.test(v.trim()),
    target: v => v === '_blank',
    rel: v => /^[a-z\s]+$/i.test(v),
  },
  UL: { 'data-type': v => v === 'taskList' },
  OL: { start: v => /^\d{1,5}$/.test(v), type: v => /^[1aAiI]$/.test(v) },
  LI: { 'data-type': v => v === 'taskItem', 'data-checked': v => v === 'true' || v === 'false' },
  MARK: { 'data-color': v => COLOR_VALUE.test(v.trim()) },
  CODE: { class: v => /^language-[\w-]+$/.test(v) },
  TH: { colspan: v => /^\d{1,2}$/.test(v), rowspan: v => /^\d{1,2}$/.test(v), colwidth: v => /^[\d,]{1,40}$/.test(v) },
  TD: { colspan: v => /^\d{1,2}$/.test(v), rowspan: v => /^\d{1,2}$/.test(v), colwidth: v => /^[\d,]{1,40}$/.test(v) },
}

const ATTR_RE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function escapeAttr(v: string) {
  return v.replace(/&(?!(?:amp|quot|lt|gt|#\d+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cleanAttrs(tag: string, attrs: string): string {
  const rules = ATTR_RULES[tag] ?? {}
  const out: string[] = []
  for (const m of attrs.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    if (name === 'style') {
      const safe = value.split(';').map(p => p.trim()).filter(p => ALLOWED_STYLE_PROPS.test(p) && !UNSAFE_STYLE_VALUE.test(p))
      if (safe.length) out.push(`style="${escapeAttr(safe.join('; '))}"`)
      continue
    }
    const check = rules[name]
    if (check && check(value)) out.push(`${name}="${escapeAttr(value)}"`)
  }
  return out.length ? ' ' + out.join(' ') : ''
}

export function sanitizeNoteHtml(html: string): string {
  let out = html
  // 1) 주석·내용째 위험한 태그 제거
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|template|svg|math|textarea|select)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  out = out.replace(/<\/?(script|style|iframe|object|embed|link|meta|template|svg|math|textarea|select)[^>]*>/gi, '')
  // 2) 허용 목록 밖 태그는 벗겨내고(텍스트는 남김), 허용 태그는 태그별 허용 속성만 다시 써서 남긴다
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const upper = tag.toUpperCase()
    if (!ALLOWED_TAGS.has(upper)) return ''
    const lower = upper.toLowerCase()
    if (full.startsWith('</')) return VOID_TAGS.has(upper) ? '' : `</${lower}>`
    return `<${lower}${cleanAttrs(upper, attrs)}>`
  })
  return out
}

// 목록 미리보기용 순수 텍스트 — 블록 경계는 공백으로 바꿔 단어가 붙지 않게 한다.
export function noteHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-3]|li|blockquote|pre|tr|td|th)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
