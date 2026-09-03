import { Fragment, type ReactNode } from 'react'

// **볼드**, *기울임*, "- " 목록만 지원하는 아주 단순한 서식 렌더러.
// 원본은 그대로 일반 텍스트(마크다운 표기 포함)로 저장되고, 보기 모드에서만 이 함수로 변환한다.
function renderInline(line: string, keyPrefix: string): ReactNode {
  const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(t => t !== '')
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{token.slice(2, -2)}</strong>
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return <em key={`${keyPrefix}-${i}`}>{token.slice(1, -1)}</em>
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{token}</Fragment>
  })
}

export function renderRetroMarkup(text: string): ReactNode {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let listBuffer: string[] = []

  function flushList() {
    if (listBuffer.length === 0) return
    const items = listBuffer
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-0.5">
        {items.map((item, i) => <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>)}
      </ul>
    )
    listBuffer = []
  }

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2))
      return
    }
    flushList()
    blocks.push(<div key={`l-${i}`}>{line ? renderInline(line, `l-${i}`) : ' '}</div>)
  })
  flushList()

  return blocks
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineToHtml(line: string) {
  const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(t => t !== '')
  return tokens.map(token => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return `<strong>${escapeHtml(token.slice(2, -2))}</strong>`
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return `<em>${escapeHtml(token.slice(1, -1))}</em>`
    }
    return escapeHtml(token)
  }).join('')
}

// contentEditable 초기 마운트 전용 — renderRetroMarkup과 동일한 규칙을 HTML 문자열로 생성한다.
// 편집 중 실시간 갱신에는 쓰지 않는다(그건 브라우저 네이티브 편집이 그대로 담당).
export function markupToHtml(text: string): string {
  if (!text) return ''
  const lines = text.split('\n')
  const blocks: string[] = []
  let listBuffer: string[] = []

  function flushList() {
    if (listBuffer.length === 0) return
    blocks.push(`<ul>${listBuffer.map(item => `<li>${inlineToHtml(item)}</li>`).join('')}</ul>`)
    listBuffer = []
  }

  lines.forEach(line => {
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2))
      return
    }
    flushList()
    blocks.push(`<div>${line ? inlineToHtml(line) : '<br>'}</div>`)
  })
  flushList()

  return blocks.join('')
}
