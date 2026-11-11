// Step-away detection. With permission, Chrome's Idle Detection API reports
// only two things, system-wide: whether you are active or idle, and whether the
// screen is locked. Nothing about what you are doing or which app is open.
// Without permission, the island asks "Still studying?" every 20 minutes.
import { IDLE_THRESHOLD } from './game'

interface IdleDetectorLike extends EventTarget {
  userState: 'active' | 'idle' | null
  screenState: 'locked' | 'unlocked' | null
  start(o: { threshold: number; signal?: AbortSignal }): Promise<void>
}
declare global {
  interface Window {
    IdleDetector?: {
      new (): IdleDetectorLike
      requestPermission(): Promise<'granted' | 'denied'>
    }
  }
}

export const idleSupported = () => typeof window.IdleDetector === 'function'

export interface PresenceHandlers {
  idle: () => void
  locked: () => void
  active: () => void
}

let controller: AbortController | null = null

/** Must be called from a click. Resolves true when the detector is running. */
export async function enableIdleDetection(h: PresenceHandlers) {
  if (!window.IdleDetector) return false
  try {
    const p = await window.IdleDetector.requestPermission()
    if (p !== 'granted') return false
    return startIdleDetection(h)
  } catch {
    return false
  }
}

/** Start without asking (permission was granted before). */
export async function startIdleDetection(h: PresenceHandlers) {
  if (!window.IdleDetector) return false
  try {
    controller?.abort()
    controller = new AbortController()
    const d = new window.IdleDetector()
    d.addEventListener('change', () => {
      if (d.screenState === 'locked') h.locked()
      else if (d.userState === 'idle') h.idle()
      else h.active()
    })
    await d.start({ threshold: IDLE_THRESHOLD * 1000, signal: controller.signal })
    return true
  } catch {
    return false
  }
}

export function stopIdleDetection() {
  controller?.abort()
  controller = null
}
