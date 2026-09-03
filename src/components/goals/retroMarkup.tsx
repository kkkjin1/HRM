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
