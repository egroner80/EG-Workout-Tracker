/**
 * Display formatting for dates and times. English UI with day-month order and
 * a 24-hour clock.
 */
const LOCALE = 'en-GB'

const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
const longDayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })

export const formatDay = (timestamp: number) => dayFormat.format(timestamp)
export const formatLongDay = (timestamp: number) => longDayFormat.format(timestamp)
export const formatTime = (timestamp: number) => timeFormat.format(timestamp)
export const formatShortDate = (timestamp: number) => shortDateFormat.format(timestamp)

export function formatMinutes(durationMs: number): string {
  return `${Math.max(1, Math.round(durationMs / 60_000))} min`
}

/** "Today", "Yesterday", or a short day. */
export function formatRelativeDay(timestamp: number, now = Date.now()): string {
  const day = (t: number) => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const diff = Math.round((day(now) - day(timestamp)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return formatDay(timestamp)
}
