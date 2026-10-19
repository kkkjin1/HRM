// 오늘의 운동장 아이콘 — 🎮 이모지는 Windows에서 보라색으로 그려져서 색을 지정할 수 있는 SVG로 그린다.
export default function GamepadIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M7.2 6h9.6c2.5 0 4.4 1.9 4.9 4.4l.9 5.2c.4 2.1-1.2 4-3.3 4-1.1 0-2.1-.6-2.7-1.5L15.4 16H8.6l-1.2 2.1c-.6.9-1.6 1.5-2.7 1.5-2.1 0-3.7-1.9-3.3-4l.9-5.2C2.8 7.9 4.7 6 7.2 6Z"
      />
      <path fill="#fff" d="M7 9.5h1.4v1.6H10v1.4H8.4v1.6H7v-1.6H5.4v-1.4H7z" />
      <circle cx="16.2" cy="10.4" r="1.05" fill="#fff" />
      <circle cx="18" cy="12.6" r="1.05" fill="#fff" />
    </svg>
  )
}
