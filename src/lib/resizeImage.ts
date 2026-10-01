// 폰 사진(2~4MB)을 그대로 올리면 Vercel 요청 한도(4.5MB)에 걸리거나 업로드·표시가 느려서,
// 올리기 전에 브라우저에서 긴 변 maxSide px JPEG로 줄인다. 움짤(GIF)은 애니메이션이 깨지므로 그대로 둔다.
export async function resizeImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // PNG 투명 배경이 JPEG에서 검게 되지 않도록 흰 바탕을 먼저 깐다
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
