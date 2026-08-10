import type { MemberRole } from '@/lib/data'

export type Member = {
  id: string
  name: string
  role: MemberRole
  color_key: number
  position: string | null
  hired_at: string | null
  gives: string | null
  needs: string | null
}
