// 개인업무 자유노트는 markdown이 아니라 contentEditable이 만든 HTML을 그대로 저장한다(글자크기/색상/형광펜은
// HTML이라야 자연스럽다). 저장 전·렌더 전 둘 다 여기를 거쳐 위험한 태그·속성을 제거한다.
// DOM API 없이 정규식만 쓴다 — 서버(API 라우트, Node)와 브라우저 양쪽에서 똑같이 동작해야 해서.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'DIV', 'P', 'BR', 'UL', 'OL', 'LI', 'MARK', 'H2', 'H3'])
const ALLOWED_STYLE_PROPS = /^(color|background-color|font-weight|font-style|text-decoration)\s*:/i

export function sanitizeNoteHtml(html: string): string {
  let out = html
  // 1) 내용째 위험한 태그 제거
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, '')
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
  // 2) on* 이벤트 속성 제거
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // 3) javascript: 등 위험 스킴 제거
  out = out.replace(/\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '')
  // 4) 허용 목록 밖 태그는 벗겨내고(텍스트는 남김), 허용 태그는 style 중 안전한 속성만 남긴다
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const upper = tag.toUpperCase()
    if (!ALLOWED_TAGS.has(upper)) return ''
    if (full.startsWith('</')) return `</${upper.toLowerCase()}>`
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i)
    if (!styleMatch) return `<${upper.toLowerCase()}>`
    const safeProps = styleMatch[1].split(';').map(p => p.trim()).filter(p => ALLOWED_STYLE_PROPS.test(p))
    return safeProps.length ? `<${upper.toLowerCase()} style="${safeProps.join('; ')}">` : `<${upper.toLowerCase()}>`
  })
  return out
}
