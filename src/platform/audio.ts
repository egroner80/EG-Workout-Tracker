/**
 * Synthesized cues (no audio files). iOS only lets audio start inside a user
 * gesture, mutes the default "ambient" session with the silent switch, and can
 * leave a context suspended or wedged after backgrounding; this module handles
 * all three.
 */

export type CueSound = 'tick' | 'go' | 'complete' | 'switch'

type AudioSessionType = 'auto' | 'ambient' | 'playback' | 'transient' | 'transient-solo' | 'play-and-record'

interface AudioSessionNavigator {
  audioSession?: { type: AudioSessionType }
}

type ContextFactory = () => AudioContext

function defaultFactory(): AudioContext {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('Web Audio is not supported')
  return new Ctor()
}

interface Tone {
  frequency: number
  start: number
  duration: number
}

const PATTERNS: Record<CueSound, Tone[]> = {
  tick: [{ frequency: 880, start: 0, duration: 0.09 }],
  go: [{ frequency: 1318, start: 0, duration: 0.18 }],
  complete: [
    { frequency: 988, start: 0, duration: 0.16 },
    { frequency: 1318, start: 0.18, duration: 0.42 },
  ],
  switch: [
    { frequency: 1046, start: 0, duration: 0.12 },
    { frequency: 1046, start: 0.2, duration: 0.12 },
    { frequency: 1046, start: 0.4, duration: 0.12 },
  ],
}

export interface AudioController {
  /** Call synchronously inside a tap: resumes the context and plays a silent buffer. */
  unlock: () => void
  play: (sound: CueSound) => void
  /** "Always audible" plays through the silent switch but pauses other audio. */
  setAlwaysAudible: (enabled: boolean) => void
  /** On returning to the app: resume, and mark a context whose clock is frozen for replacement. */
  revive: () => Promise<void>
  readonly state: () => AudioContextState | 'none'
}

export function createAudio(factory: ContextFactory = defaultFactory): AudioController {
  let context: AudioContext | null = null
  let replaceOnNextUnlock = false

  const ensure = (): AudioContext | null => {
    try {
      if (!context || replaceOnNextUnlock) {
        void context?.close().catch(() => {})
        context = factory()
        replaceOnNextUnlock = false
      }
      return context
    } catch {
      return null
    }
  }

  return {
    unlock() {
      const ctx = ensure()
      if (!ctx) return
      if (ctx.state !== 'running') void ctx.resume().catch(() => {})
      try {
        const buffer = ctx.createBuffer(1, 1, 22050)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start(0)
      } catch {
        // Silent unlock is best effort.
      }
    },

    play(sound) {
      const ctx = context
      if (!ctx || ctx.state !== 'running') return
      const t0 = ctx.currentTime + 0.01
      for (const tone of PATTERNS[sound]) {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = tone.frequency
        const start = t0 + tone.start
        const end = start + tone.duration
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.9, start + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, end)
        oscillator.connect(gain).connect(ctx.destination)
        oscillator.start(start)
        oscillator.stop(end + 0.02)
      }
    },

    setAlwaysAudible(enabled) {
      const session = (navigator as Navigator & AudioSessionNavigator).audioSession
      if (!session) return
      try {
        session.type = enabled ? 'playback' : 'ambient'
      } catch {
        // Older Safari: leave the default.
      }
    },

    async revive() {
      const ctx = context
      if (!ctx) return
      if (ctx.state !== 'running') {
        await Promise.race([ctx.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))])
      }
      // A context can report "running" while its clock is frozen; replace it on the next tap.
      const before = ctx.currentTime
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (ctx.state !== 'running' || ctx.currentTime === before) replaceOnNextUnlock = true
    },

    state: () => context?.state ?? 'none',
  }
}
