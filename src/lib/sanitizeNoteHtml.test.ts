import { describe, expect, it } from 'vitest'
import { noteHtmlToText, sanitizeNoteHtml } from './sanitizeNoteHtml'

describe('sanitizeNoteHtml', () => {
  it('위험한 태그·이벤트 속성·스킴을 제거한다', () => {
    expect(sanitizeNoteHtml('<p>a<script>alert(1)</script>b</p>')).toBe('<p>ab</p>')
    expect(sanitizeNoteHtml('<p onclick="x()">a</p>')).toBe('<p>a</p>')
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeNoteHtml('<a href=" JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeNoteHtml('<img src=x onerror=alert(1)>t')).toBe('t')
    expect(sanitizeNoteHtml('<svg><script>x</script></svg>t')).toBe('t')
    expect(sanitizeNoteHtml('<span style="background: url(javascript:x); color: red">t</span>')).toBe('<span style="color: red">t</span>')
  })

  it('Tiptap이 만드는 서식은 그대로 둔다', () => {
    const task = '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><div><p>할 일</p></div></li></ul>'
    expect(sanitizeNoteHtml(task)).toBe(task)
    const link = '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/?a=1&amp;b=2">링크</a>'
    expect(sanitizeNoteHtml(link)).toBe(link)
    const mark = '<mark data-color="#FEF08A" style="background-color: #FEF08A; color: inherit">형광</mark>'
    expect(sanitizeNoteHtml(mark)).toBe(mark)
    const table = '<table style="min-width: 75px"><colgroup><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>a</p></th></tr></tbody></table>'
    expect(sanitizeNoteHtml(table)).toBe(table)
    expect(sanitizeNoteHtml('<pre><code class="language-ts">x</code></pre>')).toBe('<pre><code class="language-ts">x</code></pre>')
    expect(sanitizeNoteHtml('<p style="text-align: center">가운데</p>')).toBe('<p style="text-align: center">가운데</p>')
    expect(sanitizeNoteHtml('<h1>제목</h1><blockquote><p>인용</p></blockquote><hr>')).toBe('<h1>제목</h1><blockquote><p>인용</p></blockquote><hr>')
  })

  it('예전 contentEditable 노트 형식도 통과한다', () => {
    const legacy = '<div><b>굵게</b> <span style="color: rgb(220, 38, 38);">빨강</span></div><div><br></div>'
    expect(sanitizeNoteHtml(legacy)).toBe(legacy.replace('38);', '38)'))
  })
})

describe('noteHtmlToText', () => {
  it('블록 경계를 공백으로 바꾸고 엔티티를 푼다', () => {
    expect(noteHtmlToText('<h1>제목</h1><p>a &amp; b</p><ul><li><p>하나</p></li></ul>')).toBe('제목 a & b 하나')
  })
})
