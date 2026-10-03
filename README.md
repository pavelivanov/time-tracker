# Time Tracker

Minimal personal time tracker for macOS. Start/stop from the menu bar; review and fix tracked
time in a week/month calendar. See [SPEC.md](SPEC.md) for behavior and design decisions.

- **Menu bar**: stopwatch icon when idle; elapsed `HH:MM` while running. Menu: Start, Stop,
  Open Calendar, Launch at Login, Quit.
- **Calendar**: Week (7-day time grid) and Month (daily totals). Drag the top/bottom edge of a
  card to change its start/end (snaps to 15 min; hold ⌥ for 1 min; Esc cancels). Right-click →
  Delete; ⌘Z undoes calendar edits.
- **Auto-stop**: a timer left running through more than 5 h of sleep, shutdown or quit is
  stopped at the moment that gap began.

## Data

`~/Library/Application Support/Time Tracker/data.json` (plain JSON, written atomically) plus
daily snapshots in `backups/` (last 30 kept). Development builds use
`Time Tracker (Dev)/` instead; `TT_DATA_DIR` overrides the location.

## Development

```bash
npm install
npm run dev          # app with HMR (dev data dir)
npm test             # unit tests (Vitest)
npm run test:e2e     # builds, then drives the app with Playwright
npm run typecheck && npm run lint
node scripts/seed-dev.mjs   # sample data in the dev data dir (app not running)
npm run icons        # regenerate tray/app icons
```

## Build & install

```bash
npm run build:mac
```

Produces `dist/time-tracker-<version>-arm64.dmg` (ad-hoc signed, not notarized — it runs on the
Mac that built it). Open the DMG and drag **Time Tracker** into Applications.
