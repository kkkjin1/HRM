// 마크다운 → 노트 HTML. 편집기(NoteEditor)에 마크다운 글(AI 답변·메모장 정리본 등)을 붙여넣을 때 서식으로 바꾸고,
// R&R 피드백처럼 글상자로 쓴 글을 보여줄 때 쓴다. 결과는 항상 sanitizeNoteHtml을 거친다(허용 태그만 남김).
import { marked } from 'marked'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'

export function markdownToHtml(md: string): string {
  const html = marked.parse(md, { gfm: true, breaks: true, async: false }) as string
  return sanitizeNoteHtml(html)
}

// 붙여넣은 일반 글이 마크다운처럼 보이는지 — 그냥 문장을 붙여넣을 땐 기존처럼 글자 그대로 넣는다.
const MD_LINE = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s|```|\|.*\||\s*- \[[ x]\]\s|---\s*$)/m
const MD_INLINE = /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/
export function looksLikeMarkdown(text: string) {
  return MD_LINE.test(text) || MD_INLINE.test(text)
}
