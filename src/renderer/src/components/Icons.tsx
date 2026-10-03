interface IconProps {
  className?: string
}

/** Same glyph as the tray icon (scripts/make-icons.mjs). */
export function StopwatchIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
        <circle cx="8" cy="9" r="5.5" />
        <path d="M8 9V5.75M6.75 1.5h2.5M8 1.5v2M12.2 4.8l.9-.9" />
      </g>
    </svg>
  )
}

export function ChevronIcon({
  dir,
  className
}: IconProps & { dir: 'left' | 'right' }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d={dir === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}
