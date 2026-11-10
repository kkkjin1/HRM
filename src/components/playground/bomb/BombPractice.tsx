'use client'

// 💣 폭탄 놀이터 — 혼자 하는 연습판. 상자를 다 부수면 끝. 화면은 BombArena(mode='practice').

import { useState } from 'react'
import BombArena, { type BombResult } from './BombArena'
import type { CritterLook } from './Critter'
import type { BombState, MapId } from '@/lib/bomb'

export default function BombPractice({ look, name = '나', map = 'forest', onExit, onEnd, exitLabel = '← 꾸미기로', prepare }: { look: CritterLook; name?: string; map?: MapId; onExit?: () => void; onEnd?: (r: BombResult) => Promise<string | null>; exitLabel?: string; prepare?: (s: BombState) => void }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [note, setNote] = useState<{ seed: number; text: string | null } | null>(null)
  return (
    <BombArena
      key={seed}
      mode="practice"
      map={map}
      seats={[{ id: 'me', name, look, team: 'A', cpu: false }]}
      myId="me"
      seed={seed}
      prepare={prepare}
      onEnd={onEnd ? r => { void onEnd(r).then(text => setNote({ seed, text })) } : undefined}
      resultNote={note?.seed === seed ? note.text : null}
      onRestart={() => setSeed(Math.floor(Math.random() * 1e9))}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  )
}
