import type { ReactNode } from 'react'
import { Button } from './Button'
import { Sheet } from './Sheet'

interface ConfirmSheetProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  confirmVariant?: 'danger' | 'primary'
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}

/** A bottom sheet asking to confirm one action; the second button just closes it. */
export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  cancelLabel = 'Keep it',
  onConfirm,
  onClose,
  children,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant={confirmVariant} block onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button block onClick={onClose}>
            {cancelLabel}
          </Button>
        </>
      }
    >
      {children}
    </Sheet>
  )
}
