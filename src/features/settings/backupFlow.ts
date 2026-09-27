import type { BackupFile } from '../../data/backup'
import { createBackup, recordBackup } from '../../services/dataCommands'
import { shareOrDownloadJson, type DeliveryResult } from './exportFile'

/**
 * Builds a backup and hands it to the share sheet (or a download). The backup
 * date is recorded only once the file was delivered, never on a cancelled share.
 */
export async function backUpNow(now = Date.now()): Promise<{ result: DeliveryResult; backup: BackupFile }> {
  const backup = await createBackup(now)
  const result = await shareOrDownloadJson(`overload-backup-${new Date(now).toISOString().slice(0, 10)}.json`, backup)
  if (result !== 'cancelled') await recordBackup(Date.now())
  return { result, backup }
}
