'use client'

import { useCallback, useSyncExternalStore, type TextareaHTMLAttributes } from 'react'
import type { PreviewSource } from '@/lib/useFieldLocks'

// 입력 중인 글(draft)을 부모 state가 아니라 외부 저장소(ref + 칸별 구독)에서 읽는 textarea.
// 회의 서랍의 팀원별 진행사항 칸처럼 거대한 page 컴포넌트 안에 있는 입력칸에서, 글자 하나마다 페이지 전체가
// 다시 그려지지 않게 한다 — 키를 치면 이 칸만 다시 그려진다.
// 화면 값 = preview(잠금 중 남이 치는 글) ?? draft(내가 쓰는 중) ?? serverText.

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue'> & {
  draftKey: string
  subscribeDraft: (key: string, listener: () => void) => () => void
  getDraft: (key: string) => string | undefined
  serverText: string
  // 잠겨 있을 때(남이 쓰는 중) 그 사람이 치는 글 — 칸별 구독으로 읽어 이 칸만 다시 그려진다.
  previewField?: string | null
  previews?: PreviewSource
}

const noopSubscribe = () => () => {}

export default function DraftTextarea({ draftKey, subscribeDraft, getDraft, serverText, previewField, previews, ...rest }: Props) {
  const subscribe = useCallback((listener: () => void) => subscribeDraft(draftKey, listener), [subscribeDraft, draftKey])
  const draft = useSyncExternalStore(subscribe, () => getDraft(draftKey), () => undefined)
  const subscribePreview = previews?.subscribePreview
  const subscribePv = useCallback(
    (listener: () => void) => (previewField && subscribePreview ? subscribePreview(previewField, listener) : noopSubscribe()),
    [subscribePreview, previewField],
  )
  const preview = useSyncExternalStore(subscribePv, () => (previewField && previews ? previews.getPreview(previewField) : undefined), () => undefined)
  const value = preview ?? draft ?? serverText
  return <textarea {...rest} value={value} />
}
