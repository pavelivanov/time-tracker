const range = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})
const month = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/** `Sep 28 – Oct 4, 2026` for `[from, to)`. */
export const weekTitle = (from: number, to: number): string => range.formatRange(from, to - 1)

/** `October 2026` */
export const monthTitle = (t: number): string => month.format(t)

/** `Mon` */
export const weekdayShort = (t: number): string => weekday.format(t)

export const cx = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ')
