/**
 * Hands a JSON file to the user. The share sheet is preferred because plain
 * downloads are unreliable in iOS Home Screen apps; Android Chrome cannot
 * share JSON files and falls back to a download.
 */
export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled'

export async function shareOrDownloadJson(filename: string, data: unknown): Promise<DeliveryResult> {
  const text = JSON.stringify(data, null, 2)
  const file = new File([text], filename, { type: 'application/json' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Fall through to a download when sharing fails for another reason.
    }
  }
  downloadJson(filename, data)
  return 'downloaded'
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
