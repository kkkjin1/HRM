// 회의록 글 칸 — 줄 맨 앞에 "- "(대시+띄어쓰기)를 치면 원형 블릿 "• "으로 바꾼다.
// 글자 수가 같아(2자) 커서 위치는 그대로 두면 되고, 바뀐 값을 textarea에 먼저 넣어 두면 React가 같은 값으로 다시 그려도 커서가 안 튄다.
export function dashToBullet(el: HTMLTextAreaElement): string {
  const v = el.value
  const c = el.selectionStart
  if (c >= 2 && el.selectionEnd === c && v[c - 1] === ' ' && v[c - 2] === '-' && (c === 2 || v[c - 3] === '\n')) {
    const next = `${v.slice(0, c - 2)}• ${v.slice(c)}`
    el.value = next
    el.setSelectionRange(c, c)
    return next
  }
  return v
}
