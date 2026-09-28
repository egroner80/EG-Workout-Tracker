import { useState } from 'react'
import { Button } from '../../components/Button'
import styles from './Settings.module.css'

/** Tap the name to rename; Enter or Save commits, an empty name is ignored. */
export function NameField({ name, label, onSave }: { name: string; label: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <button type="button" className={styles.nameButton} onClick={() => setDraft(name)} aria-label={`Rename ${name}`}>
        <span className={styles.nameText}>{name}</span>
        <span className={styles.nameHint} aria-hidden="true">
          Rename
        </span>
      </button>
    )
  }
  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) onSave(trimmed)
    setDraft(null)
  }
  return (
    <form
      className={styles.renameForm}
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <input
        className={styles.input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDraft(null)
        }}
        aria-label={label}
        maxLength={60}
        autoFocus
      />
      <Button size="md" variant="primary" type="submit">
        Save
      </Button>
    </form>
  )
}
