import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDay } from '../../app/format'
import { db } from '../../data/db'
import { hasDemoSessions } from '../../data/repositories/sessions'
import { getMeta, updateMeta } from '../../data/repositories/settingsRepo'
import { createBackup } from '../../services/dataCommands'
import { completeWorkout, renderAt, resetApp } from '../../test/workoutHarness'
import { HomeScreen } from '../home/HomeScreen'
import { DataSettings } from './DataSettings'
import { shareOrDownloadJson } from './exportFile'

vi.mock('./exportFile', () => ({ shareOrDownloadJson: vi.fn(), downloadJson: vi.fn() }))

const jsonFile = (content: string) => new File([content], 'backup.json', { type: 'application/json' })

beforeEach(async () => {
  await resetApp()
  await updateMeta({ soundCheckDone: true, installTipDismissed: true })
})

afterEach(() => {
  vi.mocked(shareOrDownloadJson).mockReset()
})

describe('data settings', () => {
  it('records the last backup date once the file is delivered', async () => {
    const user = userEvent.setup({ delay: null })
    vi.mocked(shareOrDownloadJson).mockResolvedValue('shared')
    await completeWorkout()
    renderAt(<DataSettings />, '/settings')
    expect(await screen.findByText(/Last backup: never/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back up now' }))
    expect(await screen.findByText("Backed up 1 workout. A workout in progress isn't included.")).toBeInTheDocument()
    expect(await screen.findByText(new RegExp(`Last backup: ${formatDay(Date.now())}`))).toBeInTheDocument()
    expect(shareOrDownloadJson).toHaveBeenCalledWith(
      expect.stringMatching(/^overload-backup-\d{4}-\d{2}-\d{2}\.json$/),
      expect.objectContaining({ format: 'overload-backup', counts: { sessions: 1, overrides: 0 } }),
    )
    expect((await getMeta()).workoutsSinceBackup).toBe(0)
  })

  it('leaves the last backup date unchanged when the share is cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    vi.mocked(shareOrDownloadJson).mockResolvedValue('cancelled')
    renderAt(<DataSettings />, '/settings')
    await user.click(await screen.findByRole('button', { name: 'Back up now' }))
    await vi.waitFor(() => expect(shareOrDownloadJson).toHaveBeenCalled())
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled())
    expect((await getMeta()).lastBackupAt).toBeUndefined()
    expect(screen.getByText(/Last backup: never/)).toBeInTheDocument()
    expect(screen.queryByText(/Backed up/)).not.toBeInTheDocument()
  })

  it('previews a backup before restoring anything', async () => {
    const user = userEvent.setup({ delay: null })
    await completeWorkout()
    const backup = await createBackup(Date.now())
    const startedAt = backup.sessions[0].startedAt
    await resetApp()

    renderAt(<DataSettings />, '/settings')
    await user.upload(await screen.findByLabelText('Backup file'), jsonFile(JSON.stringify(backup)))
    const preview = await screen.findByRole('dialog', { name: 'Restore this backup?' })
    expect(preview).toHaveTextContent('1 workout in the file')
    expect(preview).toHaveTextContent(`From ${formatDay(startedAt)} to ${formatDay(startedAt)}`)
    expect(preview).toHaveTextContent('1 new · 0 updated · 0 already up to date')
    expect(await db.sessions.count()).toBe(0)

    await user.click(within(preview).getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Restored 1 new and 0 updated workouts.')).toBeInTheDocument()
    expect(await db.sessions.count()).toBe(1)
  })

  it('rejects an invalid file or one from a newer app version and changes nothing', async () => {
    const user = userEvent.setup({ delay: null })
    await completeWorkout()
    const backup = await createBackup(Date.now())
    renderAt(<DataSettings />, '/settings')
    const input = await screen.findByLabelText('Backup file')

    await user.upload(input, jsonFile('this is not json'))
    expect(await screen.findByRole('alert')).toHaveTextContent('not a valid backup')

    await user.upload(input, jsonFile(JSON.stringify({ ...backup, schemaVersion: 99 })))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('newer version of the app'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.sessions.count()).toBe(1)
  })

  it('clears demo data after confirming, which also removes the demo banner', async () => {
    const user = userEvent.setup({ delay: null })
    await resetApp({ demo: true })
    await updateMeta({ soundCheckDone: true, installTipDismissed: true, keepDemo: true })
    const home = renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('complementary', { name: 'Demo data' })).toBeInTheDocument()
    home.unmount()

    const view = renderAt(<DataSettings />, '/settings')
    await user.click(await screen.findByRole('button', { name: 'Clear demo data' }))
    const confirm = await screen.findByRole('dialog', { name: 'Clear demo data?' })
    await user.click(within(confirm).getByRole('button', { name: 'Clear demo data' }))
    await vi.waitFor(async () => expect(await hasDemoSessions()).toBe(false))
    await vi.waitFor(() => expect(screen.queryByText('Demo history')).not.toBeInTheDocument())
    view.unmount()

    renderAt(<HomeScreen />, '/')
    await screen.findByRole('button', { name: 'Start workout' })
    expect(screen.queryByRole('complementary', { name: 'Demo data' })).not.toBeInTheDocument()
  })

  it('shows whether storage is protected from clearing', async () => {
    await updateMeta({ persistResult: 'granted' })
    renderAt(<DataSettings />, '/settings')
    expect(await screen.findByText('Protected from automatic clearing.')).toBeInTheDocument()
  })
})
