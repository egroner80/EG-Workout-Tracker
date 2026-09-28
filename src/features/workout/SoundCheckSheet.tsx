import { useState } from 'react'
import { useMeta } from '../../app/liveData'
import { Button } from '../../components/Button'
import { Sheet } from '../../components/Sheet'
import { saveSettings, updateMeta } from '../../data/repositories/settingsRepo'
import { feedback } from '../../platform/feedback'
import { useWorkoutStore } from '../../state/workoutStore'

/**
 * A one-time check after the first START (which played a chime). The iPhone
 * silent switch mutes web app sounds unless "Always audible" is on.
 */
export function SoundCheckSheet() {
  const meta = useMeta()
  const [step, setStep] = useState<'ask' | 'explain'>('ask')
  const open = meta !== undefined && !meta.soundCheckDone

  const done = () => void updateMeta({ soundCheckDone: true })
  const enableAlwaysAudible = async () => {
    const settings = { ...useWorkoutStore.getState().settings, alwaysAudible: true, updatedAt: Date.now() }
    useWorkoutStore.getState().setSettings(settings)
    await saveSettings(settings)
    feedback()?.testSound()
  }

  if (step === 'explain') {
    return (
      <Sheet
        open={open}
        title="Make cues audible"
        description="On iPhone the silent switch mutes sounds from web apps. “Always audible” plays cues in silent mode, but it pauses music while the app is open. A screen flash marks every cue either way."
        onClose={done}
        footer={
          <>
            <Button variant="primary" block onClick={() => void enableAlwaysAudible().then(done)}>
              Turn on Always audible
            </Button>
            <Button block onClick={() => feedback()?.testSound()}>
              Play the chime again
            </Button>
            <Button variant="ghost" block onClick={done}>
              Keep it off
            </Button>
          </>
        }
      />
    )
  }

  return (
    <Sheet
      open={open}
      title="Did you hear a chime?"
      description="The warm-up and rest timers chime at the end of every countdown."
      onClose={done}
      footer={
        <>
          <Button variant="primary" block onClick={done}>
            Yes, I heard it
          </Button>
          <Button block onClick={() => setStep('explain')}>
            No
          </Button>
        </>
      }
    />
  )
}
