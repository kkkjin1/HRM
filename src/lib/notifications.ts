export type NotificationMeta = { section?: string; date?: string }

export type NotificationRow = {
  id: string
  member_id: string
  kind: string
  body: string
  meta: NotificationMeta | null
  read: boolean
  created_at: string
}
