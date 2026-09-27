import { useEffect, useRef, type ReactNode } from 'react'
import { IconMinus, IconPlus } from './icons'
import styles from './Stepper.module.css'

const REPEAT_DELAY_MS = 420
const REPEAT_INTERVAL_MS = 110

/**
 * A press-and-hold repeating button. Pointer events drive the repeat so a
 * long press walks the value; a normal tap fires once via click (which also
 * keeps it keyboard accessible).
 */
export function RepeatButton({
  onStep,
  disabled,
  label,
  className,
  children,
}: {
  onStep: () => void
  disabled?: boolean
  label: string
  className?: string
  children: ReactNode
}) {
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({})
  const repeated = useRef(false)
  const onStepRef = useRef(onStep)
  useEffect(() => {
    onStepRef.current = onStep
  }, [onStep])

  const stop = () => {
    clearTimeout(timers.current.delay)
    clearInterval(timers.current.repeat)
    timers.current = {}
  }
  useEffect(() => stop, [])
  // A disabled button gets no pointerup, so a hold that reaches the limit must end here.
  useEffect(() => {
    if (disabled) stop()
  }, [disabled])

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={className}
      onPointerDown={() => {
        repeated.current = false
        stop()
        timers.current.delay = setTimeout(() => {
          repeated.current = true
          onStepRef.current()
          timers.current.repeat = setInterval(() => onStepRef.current(), REPEAT_INTERVAL_MS)
        }, REPEAT_DELAY_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A long press already stepped; don't add one more on release.
        if (repeated.current) {
          repeated.current = false
          return
        }
        onStep()
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  )
}

export interface StepperProps {
  value: ReactNode
  onDecrement: () => void
  onIncrement: () => void
  canDecrement?: boolean
  canIncrement?: boolean
  label: string
  orientation?: 'horizontal' | 'vertical'
  size?: 'md' | 'lg'
  /** Rendered between the buttons in place of the plain value, e.g. a tappable rep chip. */
  center?: ReactNode
  tone?: 'default' | 'changed'
}

export function Stepper({
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  label,
  orientation = 'horizontal',
  size = 'lg',
  center,
  tone = 'default',
}: StepperProps) {
  const classes = [styles.stepper, styles[orientation], styles[size], tone === 'changed' ? styles.changed : '']
    .filter(Boolean)
    .join(' ')
  const minus = (
    <RepeatButton label={`Decrease ${label}`} onStep={onDecrement} disabled={!canDecrement} className={styles.button}>
      <IconMinus size={size === 'lg' ? 26 : 22} />
    </RepeatButton>
  )
  const plus = (
    <RepeatButton label={`Increase ${label}`} onStep={onIncrement} disabled={!canIncrement} className={styles.button}>
      <IconPlus size={size === 'lg' ? 26 : 22} />
    </RepeatButton>
  )
  return (
    <div className={classes} role="group" aria-label={label}>
      {orientation === 'vertical' ? plus : minus}
      {center ?? (
        <output className={styles.value} aria-live="polite">
          {value}
        </output>
      )}
      {orientation === 'vertical' ? minus : plus}
    </div>
  )
}
