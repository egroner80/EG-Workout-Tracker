import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatShortDate } from '../../app/format'
import styles from './LineChart.module.css'

export interface ChartPoint {
  date: number
  value: number
}

interface LineChartProps {
  title: string
  points: readonly ChartPoint[]
  formatValue: (value: number) => string
  /** Discrete values (loads) step between workouts instead of sloping. */
  step?: boolean
  /** Dates to mark, e.g. when the load went up. */
  markers?: readonly number[]
  markerLabel?: string
}

const WIDTH = 340
const HEIGHT = 160
const PAD = { top: 18, right: 14, bottom: 24, left: 46 }

function niceTicks(min: number, max: number): number[] {
  if (min === max) return [min]
  const span = max - min
  const raw = span / 2
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= 3) ?? raw
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let t = start; t <= max + step * 0.001; t += step) ticks.push(Math.round(t * 100) / 100)
  return ticks.length >= 2 ? ticks : [min, max]
}

/**
 * A small single-series chart: 2px line, ringed markers, hairline grid, the
 * last value labeled, and a crosshair tooltip on touch, mouse, or arrow keys.
 * The log list below each chart is its table view.
 */
export function LineChart({ title, points, formatValue, step = false, markers = [], markerLabel }: LineChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()

  if (points.length === 0) {
    return (
      <figure className={styles.figure}>
        <figcaption className={styles.title}>{title}</figcaption>
        <p className={styles.empty}>No workouts yet — this fills in as you train.</p>
      </figure>
    )
  }

  const values = points.map((p) => p.value)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const yMin = Math.min(...ticks, ...values)
  const yMax = Math.max(...ticks, ...values)
  const x0 = points[0].date
  const x1 = points.at(-1)!.date
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (date: number) => PAD.left + (x1 === x0 ? plotW / 2 : ((date - x0) / (x1 - x0)) * plotW)
  const y = (value: number) => PAD.top + (yMax === yMin ? plotH / 2 : (1 - (value - yMin) / (yMax - yMin)) * plotH)

  let path = ''
  points.forEach((p, i) => {
    if (i === 0) path += `M${x(p.date)},${y(p.value)}`
    else if (step) path += `H${x(p.date)}V${y(p.value)}`
    else path += `L${x(p.date)},${y(p.value)}`
  })

  const nearest = (clientX: number, rect: DOMRect) => {
    const svgX = ((clientX - rect.left) / rect.width) * WIDTH
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - svgX) < Math.abs(x(points[best].date) - svgX)) best = i
    })
    return best
  }
  const onPointer = (event: PointerEvent<SVGSVGElement>) => setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? points.length) - 1))
    else if (event.key === 'ArrowRight') setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1))
    else if (event.key === 'Escape') setActive(null)
    else return
    event.preventDefault()
  }

  const last = points.at(-1)!
  const activePoint = active !== null ? points[active] : null
  const markerSet = new Set(markers)
  const summary = `${title}: ${formatValue(points[0].value)} on ${formatShortDate(x0)} to ${formatValue(last.value)} on ${formatShortDate(x1)}, ${points.length} workouts.`

  return (
    <figure className={styles.figure}>
      <figcaption id={titleId} className={styles.title}>
        {title}
      </figcaption>
      <div
        className={styles.frame}
        tabIndex={0}
        role="group"
        aria-labelledby={titleId}
        aria-description={`${summary} Use the arrow keys to read each workout.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={styles.svg}
          role="img"
          aria-label={summary}
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line className={styles.grid} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
              <text className={styles.axis} x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
                {formatValue(tick)}
              </text>
            </g>
          ))}
          <text className={styles.axis} x={PAD.left} y={HEIGHT - 6} textAnchor="start">
            {formatShortDate(x0)}
          </text>
          {x1 !== x0 && (
            <text className={styles.axis} x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end">
              {formatShortDate(x1)}
            </text>
          )}
          <path className={styles.line} d={path} />
          {points
            .filter((p) => markerSet.has(p.date))
            .map((p) => (
              <circle key={p.date} className={styles.marker} cx={x(p.date)} cy={y(p.value)} r={4.5}>
                <title>{`${markerLabel ?? 'Marked'}: ${formatShortDate(p.date)}`}</title>
              </circle>
            ))}
          <circle className={styles.marker} cx={x(last.date)} cy={y(last.value)} r={4.5} />
          <text className={styles.endLabel} x={x(last.date)} y={y(last.value) - 10} textAnchor="end">
            {formatValue(last.value)}
          </text>
          {activePoint && (
            <g>
              <line className={styles.crosshair} x1={x(activePoint.date)} x2={x(activePoint.date)} y1={PAD.top - 6} y2={HEIGHT - PAD.bottom} />
              <circle className={styles.activeDot} cx={x(activePoint.date)} cy={y(activePoint.value)} r={5.5} />
            </g>
          )}
        </svg>
        {activePoint && (
          <div
            className={styles.tooltip}
            style={{ left: `${(x(activePoint.date) / WIDTH) * 100}%` }}
            role="status"
          >
            <strong>{formatValue(activePoint.value)}</strong>
            <span>{formatShortDate(activePoint.date)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}
