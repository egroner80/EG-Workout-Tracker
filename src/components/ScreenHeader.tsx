import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconChevronLeft } from './icons'
import styles from './ScreenHeader.module.css'

export function ScreenHeader({
  title,
  eyebrow,
  backTo,
  backLabel = 'Back',
  children,
}: {
  title: string
  eyebrow?: string
  backTo?: string
  backLabel?: string
  children?: ReactNode
}) {
  return (
    <header className={styles.header}>
      {backTo && (
        <Link to={backTo} className={styles.back}>
          <IconChevronLeft size={22} />
          {backLabel}
        </Link>
      )}
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
      {children}
    </header>
  )
}
