import type { TrackerApi } from '@shared/types'

declare global {
  interface Window {
    tt: TrackerApi
  }
}

export {}
