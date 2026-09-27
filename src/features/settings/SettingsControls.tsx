import type { ReactNode } from 'react'
import { IconArrowDown, IconArrowUp } from '../../components/icons'
import styles from './Settings.module.css'

/** A labeled settings row; `stacked` puts the control under the label. */
export function Field({ label, stacked = false, children }: { label: string; stacked?: boolean; children: ReactNode }) {
  return (
    <div className={stacked ? styles.stackRow : styles.fieldRow}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? styles.segmentOn : styles.segment}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Large up/down buttons; reordering never needs drag and drop. */
export function ReorderButtons({
  name,
  first,
  last,
  onMove,
}: {
  name: string
  first: boolean
  last: boolean
  onMove: (direction: -1 | 1) => void
}) {
  return (
    <>
      <button type="button" className={styles.iconButton} disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}>
        <IconArrowUp size={22} />
      </button>
      <button type="button" className={styles.iconButton} disabled={last} onClick={() => onMove(1)} aria-label={`Move ${name} down`}>
        <IconArrowDown size={22} />
      </button>
    </>
  )
}
