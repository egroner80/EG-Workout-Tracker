import { useRef, useState } from 'react'
import { formatDay } from '../../app/format'
import { useHasDemo, useMeta } from '../../app/liveData'
import { Button } from '../../components/Button'
import { Sheet } from '../../components/Sheet'
import type { ImportPlan } from '../../data/backup'
import { applyImport, clearDemoData, createBackup, previewImport, recordBackup } from '../../services/dataCommands'
import styles from './Settings.module.css'
import { shareOrDownloadJson } from './exportFile'

const PERSIST_TEXT = {
  granted: 'Protected from automatic clearing.',
  denied: 'The browser may clear data when storage runs low — back up regularly.',
  unsupported: 'Install the app to protect your data from clearing.',
} as const

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export function DataSettings() {
  const meta = useMeta()
  const hasDemo = useHasDemo()
  const fileInput = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [busy, setBusy] = useState(false)

  const backUp = async () => {
    setMessage(null)
    setBusy(true)
    try {
      const backup = await createBackup(Date.now())
      const result = await shareOrDownloadJson(`overload-backup-${new Date().toISOString().slice(0, 10)}.json`, backup)
      if (result !== 'cancelled') {
        await recordBackup(Date.now())
        const saved = backup.sessions.filter((session) => session.status === 'completed' && session.deletedAt === undefined)
        setMessage({ tone: 'ok', text: `Backed up ${plural(saved.length, 'workout')}. A workout in progress isn't included.` })
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Backup failed' })
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setMessage(null)
    try {
      setPlan(await previewImport(await file.text()))
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That file could not be read' })
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!plan) return
    try {
      await applyImport(plan)
      setMessage({
        tone: 'ok',
        text: `Restored ${plan.preview.newWorkouts} new and ${plural(plan.preview.updatedWorkouts, 'updated workout')}.`,
      })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Restore failed' })
    } finally {
      setPlan(null)
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-data">
      <h2 id="settings-data" className={styles.sectionTitle}>
        Your data
      </h2>
      <div className={styles.group}>
        <div className={styles.stackRow}>
          <p>
            <span className={styles.rowLabel}>Backup</span>
            <span className={styles.rowHint}>
              Last backup: {meta?.lastBackupAt ? formatDay(meta.lastBackupAt) : 'never'}. History lives only on this phone.
            </span>
          </p>
          <Button variant="primary" block disabled={busy} onClick={() => void backUp()}>
            Back up now
          </Button>
          <Button block onClick={() => fileInput.current?.click()}>
            Restore from a backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Backup file"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </div>
        {message && (
          <p className={message.tone === 'ok' ? styles.ok : styles.error} role={message.tone === 'ok' ? 'status' : 'alert'}>
            {message.text}
          </p>
        )}
        <div className={styles.stackRow}>
          <p>
            <span className={styles.rowLabel}>Storage</span>
            <span className={styles.rowHint}>{PERSIST_TEXT[meta?.persistResult ?? 'unsupported']}</span>
          </p>
        </div>
        {hasDemo && (
          <div className={styles.stackRow}>
            <p>
              <span className={styles.rowLabel}>Demo history</span>
              <span className={styles.rowHint}>Sample workouts that show how History and Progress look.</span>
            </p>
            <Button variant="danger" block onClick={() => setConfirmDemo(true)}>
              Clear demo data
            </Button>
          </div>
        )}
      </div>

      <Sheet
        open={plan !== null}
        title="Restore this backup?"
        description="Restoring only adds and updates. Nothing on this phone is deleted, and newer local changes win."
        onClose={() => setPlan(null)}
        footer={
          <>
            <Button variant="primary" block onClick={() => void confirmImport()}>
              Restore
            </Button>
            <Button block onClick={() => setPlan(null)}>
              Cancel
            </Button>
          </>
        }
      >
        {plan && (
          <ul className={styles.preview}>
            <li>{plural(plan.preview.workouts, 'workout')} in the file</li>
            {plan.preview.firstWorkoutAt && plan.preview.lastWorkoutAt && (
              <li>
                From {formatDay(plan.preview.firstWorkoutAt)} to {formatDay(plan.preview.lastWorkoutAt)}
              </li>
            )}
            <li>{plan.preview.newWorkouts} new · {plan.preview.updatedWorkouts} updated · {plan.preview.skippedWorkouts} already up to date</li>
            <li>{plural(plan.preview.overrides, 'manual target')}</li>
            {plan.conflicts.length > 0 && (
              <li>{plural(plan.conflicts.length, 'workout')} differ from this phone’s copy and are kept as they are here</li>
            )}
          </ul>
        )}
      </Sheet>

      <Sheet
        open={confirmDemo}
        title="Clear demo data?"
        description="Removes the sample workouts from History and Progress. Your own workouts are not touched."
        onClose={() => setConfirmDemo(false)}
        footer={
          <>
            <Button
              variant="danger"
              block
              onClick={() => {
                setConfirmDemo(false)
                void clearDemoData()
              }}
            >
              Clear demo data
            </Button>
            <Button block onClick={() => setConfirmDemo(false)}>
              Keep it
            </Button>
          </>
        }
      >
        {null}
      </Sheet>
    </section>
  )
}
