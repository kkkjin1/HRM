'use client'

// 3D 스프라이트 그림(sprite.ts)을 쓰는 캐릭터 — three.js는 처음 쓸 때 지연 로딩.
// 그림이 준비되기 전이나 WebGL을 못 쓰면 2D 그림(GearPreview)을 그대로 보여준다.
// <CharacterSprite>는 HTML(운동장·대결), <CharacterSpriteSvg>는 SVG 안(경기 화면 선수 카드)용.

import { useEffect, useState } from 'react'
import { GearPreview } from '@/components/baseball/gear'
import { useWebGL } from '@/components/baseball/three/webgl'
import type { Equip } from '@/lib/baseballGear'
import type { SpriteKind } from '@/components/baseball/three/sprite'

type Props = { equip: Equip; name: string; number?: number; kind?: SpriteKind; build?: number; size: number; colorBg?: string; colorFg?: string }

// 그림 비율 160×200 = GearPreview(1 : 1.25)와 같아 자리 바꿔치기가 자연스럽다
function useSprite(p: Props) {
  const webgl = useWebGL()
  const [url, setUrl] = useState<string | null>(null)
  const kind = p.kind ?? 'batter'
  const slotsKey = JSON.stringify(p.equip.slots)
  useEffect(() => {
    if (!webgl) return
    let active = true
    let off: (() => void) | null = null
    import('@/components/baseball/three/sprite').then(m => {
      if (!active) return
      const look = { equip: p.equip, name: p.name, number: p.number ?? 0, build: p.build }
      const listener = (u: string) => { if (active) setUrl(u) }
      const u = m.spriteOf(look, kind, listener)
      if (u) setUrl(u)
      off = () => m.unsubscribeSprite(look, kind, listener)
    })
    return () => { active = false; off?.() }
    // 장비(slots)·이름·종류가 바뀔 때만 다시 — equip 객체는 매번 새로 만들어질 수 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, slotsKey, p.name, p.number, p.build, kind])
  return webgl ? url : null
}

export function CharacterSprite(p: Props) {
  const url = useSprite(p)
  if (!url) return <GearPreview equip={p.equip} size={p.size} colorBg={p.colorBg} colorFg={p.colorFg} pitcher={p.kind === 'pitcher'} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" width={p.size} height={p.size * 1.25} draggable={false} style={{ display: 'block', pointerEvents: 'none' }} />
}

export function CharacterSpriteSvg(p: Props) {
  const url = useSprite(p)
  if (!url) return <GearPreview equip={p.equip} size={p.size} colorBg={p.colorBg} colorFg={p.colorFg} pitcher={p.kind === 'pitcher'} />
  return <image href={url} width={p.size} height={p.size * 1.25} />
}
