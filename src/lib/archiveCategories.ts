export const ARCHIVE_CATEGORIES = ['근태·휴가', '급여·보상', '계약·고용', '퇴직', '노무', '채용', '평가', '기타'] as const
export type ArchiveCategory = typeof ARCHIVE_CATEGORIES[number]

export type ArchiveCase = {
  id: string
  title: string
  category: ArchiveCategory
  situation: string
  conclusion: string
  keywords: string[]
  slack_url: string
  author: string
  created_at: string
}

export const ARCHIVE_CATEGORY_COLOR: Record<ArchiveCategory, string> = {
  '근태·휴가': '#4C7FE0',
  '급여·보상': '#D97706',
  '계약·고용': '#7C3AED',
  '퇴직': '#EF4444',
  '노무': '#059669',
  '채용': '#0891B2',
  '평가': '#DB2777',
  '기타': '#6B7280',
}
