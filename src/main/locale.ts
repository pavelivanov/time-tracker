import { app, systemPreferences } from 'electron'
import type { HourCycle } from '@shared/format'

/**
 * The 12/24-hour clock macOS uses. Chromium/Node Intl only know the language (e.g. en-US),
 * not the region (e.g. Russia → 24 h) or the explicit "24-hour time" toggle.
 */
export function systemHourCycle(): HourCycle {
  if (systemPreferences.getUserDefault('AppleICUForce24HourTime', 'boolean')) return 'h23'
  if (systemPreferences.getUserDefault('AppleICUForce12HourTime', 'boolean')) return 'h12'
  try {
    const locale = new Intl.Locale(`und-${app.getLocaleCountryCode()}`).maximize().toString()
    const sample = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
    const cycle = sample.resolvedOptions().hourCycle
    return cycle === 'h11' || cycle === 'h12' ? 'h12' : 'h23'
  } catch {
    return 'h12'
  }
}
