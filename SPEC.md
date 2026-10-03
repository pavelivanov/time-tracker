# Time Tracker — Product & Technical Spec (v1)

> Status: **Approved — in implementation** · 2026-10-03
> Scope: personal use, single user, single Mac (Apple Silicon, macOS 26).
> Visual reference: [docs/reference/week-view.webp](docs/reference/week-view.webp)
> Resolved decisions: [§18](#18-resolved-decisions)

---

## 0. TL;DR

- Menu-bar-first macOS app. Tray shows a stopwatch icon when idle; while running it shows **only the elapsed time** `hh:mm`. Menu has **Start / Stop** (+ Open Calendar, Quit).
- Calendar window with **Week** (7-day time grid) and **Month** (calendar days with daily totals) views. Week cards = tracked intervals; the only label is the **duration**. Totals per **day / week / month**.
- Edits: **resize top/bottom edges** (Week view) and **right-click → Delete**. No creating, no moving, no titles.
- A timer left running through a **> 5 h** sleep / shutdown / quit is auto-stopped at the moment that gap began.
- Local JSON storage, minute granularity, atomic writes + daily backups.
- Electron 44 + React 19 + TypeScript + electron-vite + electron-builder. Calendar is custom-built (no calendar library).

---

## 1. Goals / Non-goals

**Goals**
1. One click to start/stop from the menu bar; running time always visible.
2. Visual history with exact daily, weekly, monthly totals.
3. Fix mistakes by resizing or deleting intervals.
4. No data loss: survives quit, crash, sleep, reboot.
5. Near-zero idle cost (no polling while idle).

**Non-goals (v1)**
Titles/projects/tags/notes · creating entries from the calendar · drag-moving entries · multiple parallel timers · sync/cloud/multi-device · reports/charts · Windows/Linux · App Store, notarization, auto-update.

---

## 2. Key decisions

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| D1 | Timestamps are **minute-aligned** (floored at Start/Stop) | Card labels, day/week/month totals always add up exactly; tray ticks in sync with the system clock; edges align to grid | Second precision → rounding drift (`45m + 45m` cards vs `1h 31m` total) |
| D2 | **JSON file**, atomic writes, daily backups | ~2k entries/year ≈ 100 KB; no native modules; human-readable | SQLite (`better-sqlite3` needs native rebuilds; overkill) |
| D3 | **Custom calendar** components | Requirements are mostly anti-features (no create/move/titles/all-day/overlap layout); edge-resize needs custom clamping anyway | FullCalendar / react-big-calendar (fighting styling + behavior) |
| D4 | **Main process is the single source of truth** | Tray works with no window open; one validation choke point | Renderer-owned state |
| D5 | **Agent app**; Dock icon only while the window is open | Menu-bar-first; no Dock clutter | Always in Dock |
| D6 | Window **destroyed on close** | Frees ~100 MB renderer when not in use | Hide (instant reopen, more memory) |
| D7 | Entries **never overlap**; resize **clamps** to neighbors | Totals are plain sums; trivial layout (no side-by-side packing) | Allow overlap |
| D8 | Entry crossing midnight stays **one record**, split only when rendering/aggregating | Data fidelity | Auto-split on Stop |
| D9 | **Quit keeps the timer running** (state lives in the file) | Crash-safe, one consistent model; > 5 h gaps auto-stop forgotten timers | Auto-stop on Quit |
| D10 | **electron-vite + electron-builder** | Mature React-TS template, DMG, `extendInfo`, fuses | Electron Forge 8 `vite-typescript` (equally valid) |

---

## 3. Glossary

- **Entry** — one tracked interval `[start, end)`. No title.
- **Running entry** — entry with `end = null`. At most one.
- **Segment** — the part of an entry inside one local calendar day. An entry crossing midnight renders as 2+ segments.
- **Gap** — time the app could not observe: Mac asleep, Mac shut down, or app quit.
- **Day / Week / Month** — local-time calendar ranges. Week = 7 days starting **Monday**.
- **`floorMinute(t)`** — `t − (t % 60_000)`.

---

## 4. Scope (MoSCoW)

| ID | Feature | Priority | Origin |
|---|---|---|---|
| F1 | Tray icon: idle icon / running `hh:mm` | Must | Requested |
| F2 | Tray menu: Start, Stop | Must | Requested |
| F3 | Local persistent storage | Must | Requested |
| F4 | Calendar window — Week view (7 days) | Must | Requested |
| F5 | Calendar window — Month view (days + daily totals) | Must | Requested |
| F6 | Totals per day / week / month | Must | Requested |
| F7 | Resize entries by top/bottom edges | Must | Requested |
| F8 | Cards show duration only; no create; no move | Must | Requested |
| F9 | Tray: Open Calendar, Quit | Must | Implied (need to open window / exit) |
| F10 | Single instance, crash-safe running state | Must | Implied (data integrity) |
| F11 | Delete entry: right-click → context menu → **Delete** (immediate) | Must | Requested (Q4) |
| F12 | Auto-stop after a > 5 h gap while running | Must | Requested (Q3) |
| F13 | Launch at login | Should | Proposed |
| F14 | Today / this-week totals inside tray menu | Should | Proposed |
| F15 | Dark mode, keyboard navigation, now-line | Should | Proposed |
| F16 | Undo (⌘Z) for resize and delete | Should | Proposed — Delete has no confirmation |
| F17 | CSV export, "Reveal Data Folder" | Could | Proposed |
| F18 | Global hotkey to toggle timer | Could | Proposed |
| F19 | Heartbeat so F12 also catches crash / power-loss gaps | Could | Proposed |
| F20 | Idle detection (Mac awake, user away) | Won't (v1) | — |
| — | Titles/projects, create from calendar, drag-move, sync, entry blocks in Month view | Won't | Explicitly excluded |

---

## 5. Menu bar (Tray)

### 5.1 States

| State | Image | Title |
|---|---|---|
| Idle | stopwatch template icon | — |
| Running | none (`nativeImage.createEmpty()`) | elapsed `hh:mm` — time only (Q1) |

- Icon: template image `resources/tray/stopwatchTemplate.png` (16×16) + `stopwatchTemplate@2x.png` (32×32). macOS tints it for light/dark/highlighted menu bar.
- Running title: `tray.setTitle('01:23', { fontType: 'monospacedDigit' })` — fixed-width digits, no jitter when the value changes.
- Format `HH:MM`, hours zero-padded to 2, unbounded: `00:00`, `09:41`, `100:05`.
- Elapsed = `floorMinute(now) − start` → the value changes exactly on wall-clock minute boundaries, in sync with the macOS clock.
- Never set an empty image **and** an empty title at the same time (item becomes invisible).
- `new Tray(image, TRAY_GUID)` with a fixed UUID → macOS remembers the item's position (⌘-drag) across relaunches.
- `tray.setIgnoreDoubleClickEvents(true)` → every click opens the menu immediately.
- Tooltip: idle `Time Tracker — not running`; running `Running since 2:05 PM`.

### 5.2 Tick scheduling (main process)

- While running: `setTimeout(tick, 60_000 − (Date.now() % 60_000) + 50)`, re-armed every tick (no drift). Idle: no timer at all.
- `powerMonitor` `resume` / `unlock-screen` → run the F12 check, then re-render immediately and re-arm (timers are suspended during sleep).

### 5.3 Menu

Built fresh on every click — `tray.on('click' | 'right-click', () => tray.popUpContextMenu(buildMenu()))`, no `setContextMenu` — so labels are never stale.

```
Running · since 2:05 PM                (disabled status line, see below)
Today 3h 12m · Week 21h 5m             (disabled, F14)
──────────────────────
Start                                  enabled only when idle
Stop                                   enabled only when running
──────────────────────
Open Calendar
Launch at Login                  ✓     (F13)
──────────────────────
Quit Time Tracker                ⌘Q
```

Status line variants: `Running · since 2:05 PM` · `Not running` · `Stopped automatically at 6:02 PM` (after F12, until the next Start; time prefixed with the weekday if not today; in-memory only).

Start and Stop are both always listed; the one that doesn't apply is disabled.

### 5.4 Acceptance

- **AC-T1** Idle → Start: title shows `00:00` within 200 ms, icon hidden, entry persisted.
- **AC-T2** Title increments at each wall-clock minute boundary (±1 s).
- **AC-T3** Stop: icon restored, title cleared, entry persisted.
- **AC-T4** After 30 min of sleep while running, the title is correct within 1 s of wake (sleep time counted).
- **AC-T5** Quit + relaunch within 5 h while running: title resumes with correct elapsed time.
- **AC-T6** Mac asleep > 5 h while running: on wake the tray is idle, the entry ends at the moment the Mac went to sleep, and the menu status line says `Stopped automatically at …`.

---

## 6. Timer semantics

### 6.1 Rules

| Action | Precondition | Effect |
|---|---|---|
| Start | idle | Create `{ id, start: max(floorMinute(now), last.end ?? −∞), end: null }`, persist, tray → running |
| Stop | running | `end = floorMinute(now)`; if `end ≤ start` → delete entry (sub-minute); persist; tray → idle |
| Quit | any | Running entry stays running (Q7); `lastAliveAt` recorded → F12 applies on next launch |
| Launch | — | Load file; F12 check; running entry still present → tray shows running immediately |

- `max(…, last.end)` protects against the system clock moving backwards → overlap impossible.
- No auto-merge with an adjacent previous entry: a new Start always shows `00:00`.
- Both edges floored → error ≤ 1 min per edge, unbiased on average.
- UTC minute boundary = local minute boundary (all current UTC offsets are multiples of 15 min), so `% 60_000` and ≤ 15-min snapping are valid in local time.

### 6.2 Auto-stop after a long gap (F12)

Problem: timer left running while the Mac sleeps / is shut down / the app is quit → one huge bogus entry.

- Record `lastAliveAt = now` on `powerMonitor` `suspend`, `shutdown`, and app `before-quit`. Persist it synchronously — the process may freeze or exit right after.
- On `resume` and on launch, if a timer is running, compute `gap = now − lastAliveAt`:

| Gap | Effect |
|---|---|
| `> 5 h` | Stop automatically: `end = floorMinute(lastAliveAt)` (discard if `end ≤ start`). No dialog, no notification. Tray status line → `Stopped automatically at …` |
| `≤ 5 h` | Keep running; the gap counts as tracked time |

- Clear `lastAliveAt` after each evaluation.
- Each gap is evaluated on its own — several short sleeps never add up to an auto-stop.
- Crash / power loss records no `lastAliveAt` → not detected in v1 (F19 heartbeat would fix it).
- Threshold constant `AUTO_STOP_GAP_MS = 5 * 60 * 60 * 1000` in `src/shared`.

---

## 7. Calendar window

### 7.1 Lifecycle & Dock

- Info.plist `LSUIElement = true` → launches as agent (no Dock icon, no flash).
- **Open Calendar** → `app.setActivationPolicy('regular')` (Dock icon, app menu, ⌘-Tab) → create window → focus.
- Window closed (⌘W / red button) → destroyed → `app.setActivationPolicy('accessory')`. App stays in the menu bar. Quit only via tray Quit or ⌘Q.
- `app.requestSingleInstanceLock()`; `second-instance` and `activate` → open window.
- Very first launch (no data file yet) opens the window once; afterwards launches are tray-only.
- `show: false` + show on `ready-to-show`; `backgroundColor` per theme (no white flash in dark mode).
- Default 1100×760, min 760×520. Bounds persisted; restored only if still on a connected display, else centered on primary.
- `titleBarStyle: 'hiddenInset'`; toolbar sits in the title-bar area (drag region; controls are no-drag).

### 7.2 Toolbar

```
● ● ●    ‹  Today  ›    Sep 28 – Oct 4, 2026 · 21h 51m               [ Week | Month ]
```

- Period title + period total (week total in Week view, month total in Month view).
- `‹ ›` previous/next period; **Today** jumps to the current period.
- Segmented control Week | Month; selection persisted.
- No Start/Stop in the window — the tray is the only place that starts/stops.

### 7.3 App menu (only while the window is open)

| Menu | Items |
|---|---|
| Time Tracker | About · Launch at Login · Hide ⌘H · Quit ⌘Q |
| Edit | Undo ⌘Z (F16) |
| View | Week ⌘1 · Month ⌘2 · Today ⌘T · Previous ⌘← · Next ⌘→ · Zoom In ⌘= · Zoom Out ⌘− · Default Zoom ⌘0 |
| Window | Minimize ⌘M · Close ⌘W |

- Plain `←` `→` `T` also work while the window is focused.
- Chromium page zoom disabled (no zoom roles in menu; `webContents.setVisualZoomLevelLimits(1, 1)`); ⌘= / ⌘− drive hour-height zoom instead.

---

## 8. Week view

### 8.1 Layout

```
┌────────┬──────────────┬──────────────┬──────────────┬─── … ───┬──────────────┐
│  −  +  │ 28 Mon       │ 29 Tue       │ 30 Wed       │         │ 4 Sun        │
│        │ –            │ 45m          │ 3h 53m       │         │ –            │
├────────┼──────────────┼──────────────┼──────────────┼─── … ───┼──────────────┤
│ 1 PM   │              │              │              │         │              │
│        │              │              │ ┌──────────┐ │         │              │
│ 2 PM   │              │              │ │ ⏱ 1h 15m │ │         │              │
│        │              │              │ │          │ │         │              │
│ 3 PM   │              │              │ └──────────┘ │         │              │
│        │              │ ┌──────────┐ │              │         │              │
│ 4 PM   │              │ │ ⏱ 45m    │ │              │         │              │
│        │ ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ now (today column only)     │
```

- All 7 columns Mon→Sun (Q2); full 24 h vertical axis; vertical scroll; header row and hour gutter sticky.
- Header cell: large date number, weekday, **day total** in accent color (`–` when zero, as in the screenshot). Today: date number in an accent circle.
- Corner cell: zoom `−` `+` (as in the screenshot).
- Gutter: hour labels in the macOS 12/24-hour format — the explicit "24-hour time" toggle, else the region's default (e.g. region Russia → `13:00`). Resolved in main (`systemPreferences` + `app.getLocaleCountryCode()`) and handed to the renderer via `additionalArguments`, because Chromium's Intl only knows the language (`en-US` → `1:00 PM`).
- Hour lines only; weekend columns subtly shaded; **no all-day row**.
- Now-line (accent dot + 1 px line) in today's column, updated each minute.

### 8.2 Zoom & scroll

- Hour heights `[24, 32, 48, 64, 96, 144]` px, default **48** (≈ screenshot). Persisted.
- Zoom keeps the time under the viewport center fixed.
- Initial scroll: current week → now-line at ~⅓ of viewport height; other weeks → earliest segment − 1 h, or 8:00 if empty.

### 8.3 Entry card

- Vertical position by **wall-clock minutes**: `top = wallMin(segStart) × pxPerMin`, `height = (wallMin(segEnd) − wallMin(segStart)) × pxPerMin`; a segment ending at next midnight uses 1440.
- Content: duration only — `⏱ 1h 15m`, top-left, muted. No title, no icons. Label hidden when the card is < 16 px tall (tooltip still works). Min visual height 4 px.
- Inset 4 px from both column edges (no right-side gap — there's no create affordance).
- Hover: tooltip `2:05 PM – 3:20 PM · 1h 15m`, slightly darker background, small resize pills on resizable edges.
- Cursor: default over the body; `ns-resize` over edge zones.
- Click, double-click, body drag: **nothing**. Empty grid click/drag: **nothing**.
- Right-click: native context menu with a single item **Delete** (§8.4).
- Cross-midnight segments: the cut edge is square (no radius) and has no handle; label shows the **segment's** duration (consistent with that day's total); tooltip shows the full entry range and duration.
- Running entry: accent-tinted, bottom grows each minute, **no bottom handle**, live label, small pulsing dot.

### 8.4 Delete & undo

- Right-click a card → native menu (`Menu.popup`) with one item: **Delete**. Choosing it removes the whole entry immediately — no confirmation. Deleting a cross-midnight segment removes the entire entry; deleting the running entry also stops the timer (tray → idle).
- **Undo ⌘Z** (F16): main keeps the last 20 calendar edits in memory as `{ before: Entry | null, after: Entry | null }` (resize: before/after; delete: before/`null`). Undo restores `before` only if invariants still hold against the current data (e.g. a deleted running entry can't come back after a newer timer was started); otherwise `shell.beep()` and the item is dropped. Start/Stop/auto-stop are not undoable. Stack cleared on quit. No redo.
- Last-resort recovery: daily backups (§12.4).

### 8.5 Acceptance

- **AC-W1** Each header total equals the sum of that day's card labels (including the running entry).
- **AC-W2** Toolbar week total equals the sum of the 7 header totals.
- **AC-W3** An entry 10:30 PM → 1:15 AM renders as two segments; each day counts only its part.
- **AC-W4** No gesture on the grid creates an entry; no gesture moves an entry.
- **AC-W5** Zoom level survives app restart.
- **AC-W6** Right-click → Delete removes the entry and updates all totals at once; ⌘Z brings it back.

---

## 9. Resize interaction

Snapping and constraints as below were confirmed (Q6).

### 9.1 Gesture

1. `pointerdown` in an edge zone (top/bottom, `min(6 px, height / 3)`) → `setPointerCapture`; remember grab offset (pointer y − edge y) so the edge doesn't jump.
2. Drag threshold 3 px — below it nothing changes (a click on an edge is not an edit).
3. `pointermove` → pointer y (+ scrollTop − grab offset) → wall-clock time in the column's day → **snap** → **clamp** → preview: card resizes, floating pill `2:00 PM – 3:30 PM · 1h 30m`, header/toolbar totals update live.
4. `pointerup` → commit (preview kept until main confirms).
5. `Esc`, window blur, or `lostpointercapture` without `pointerup` → cancel and revert.
6. Auto-scroll when the pointer is within 40 px of the viewport's top/bottom; speed ∝ proximity.

Pointer → time conversion uses the wall-clock constructor (`new Date(y, m, d, 0, minutes)`), not `addMinutes(dayStart, …)`, so DST days map correctly.

### 9.2 Snapping

| Hour height | Step |
|---|---|
| ≤ 48 px | 15 min |
| 64–96 px | 5 min |
| 144 px | 1 min |
| any, with ⌥ held | 1 min |

- Absolute grid: `round(t / step) × step` (valid locally, see §6.1).
- **Original-value magnet**: while `|proposed − original| < step / 2` the edge keeps its original value — small wiggles never shift an off-grid time (e.g. `3:20`) to the grid.

### 9.3 Constraints (clamp, never reject)

Neighbors = previous/next entries in the global sorted list. Column day `D` = `[dayStart(D), dayEnd(D))`.

**Top edge → `start`** (only on the entry's first segment):
- `≥ max(dayStart(D), prev.end)`
- `≤ end − 1 min` and `≤ dayEnd(D) − 1 min` (closed entry)
- `≤ floorMinute(now)` and `≤ dayEnd(D) − 1 min` (running entry)

**Bottom edge → `end`** (only on the last segment of a closed entry):
- `≥ max(start + 1 min, dayStart(D) + 1 min)`
- `≤ min(dayEnd(D), next.start, floorMinute(now))`

Consequences: no overlap, no future end, min 1 min, the dragged segment never vanishes mid-gesture, and a resize can't push an edge across midnight (v1 limitation — see E11).

### 9.4 Commit

- Renderer → `entries:resize { id, edge, time }`. Main re-runs the same pure `clampResize()` from `src/shared` against authoritative state, persists, pushes an undo item, broadcasts `entries:changed`, returns the saved entry.
- Unchanged value → no write. Unknown id → error → renderer reverts + `shell.beep()`.
- `entries:changed` arriving mid-gesture is queued and applied after the gesture ends.

### 9.5 Acceptance

- **AC-R1** At 48 px/h, dragging the bottom of a 2:05–3:20 PM entry down ~1 h snaps to 4:15 PM; label `2h 10m`; header total updates live; persisted on release.
- **AC-R2** Extending into the next entry stops flush at its start.
- **AC-R3** End can't pass the current minute.
- **AC-R4** Duration can't go below 1 min.
- **AC-R5** `Esc` mid-drag restores the original.
- **AC-R6** ⌥-drag moves in 1-min steps.
- **AC-R7** Running entry: only the top edge is resizable.

---

## 10. Month view

Shows only calendar days with each day's total time, if any (Q5).

### 10.1 Layout

```
‹  Today  ›    October 2026 · 132h 5m                                [ Week | Month ]

     Mon       Tue       Wed       Thu       Fri       Sat       Sun
  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
  │         │         │         │ 1       │ 2       │ 3       │ 4       │
  │         │         │         │ 6h 44m  │ 7h 9m   │         │         │
  ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
  │ 5       │ 6       │ 7       │ 8       │ 9       │ 10      │ 11      │
  │ 4h 2m   │ 45m     │         │ 5h 30m  │ 3h 10m  │         │         │
  ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
  │ …       │         │         │         │         │         │         │
```

- Grid of the month's days, Monday-first, 4–6 rows. Cells before the 1st and after the last day are **blank** (no date, no total) — every number on screen belongs to this month.
- Cell: date number; **day total** in accent color **only if > 0** — days without tracked time show just the date.
- Today: date number in an accent circle (same as Week view).
- Toolbar: month title + **month total**.
- Nothing else: no entry blocks, strips, lists, tooltips, or week-total column. Weekly totals live in the Week view toolbar.
- Click a day → Week view of the week containing it (navigation, not creation). No editing in this view.

### 10.2 Acceptance

- **AC-M1** Month total = sum of the month's day totals.
- **AC-M2** Day totals match the Week view for the same days.
- **AC-M3** Clicking a day opens the Week view containing it.
- **AC-M4** Days with zero time show only the date; out-of-month cells are blank.

---

## 11. Totals & formatting

- `overlap(e, [a, b), now) = max(0, min(e.end ?? floorMinute(now), b) − max(e.start, a))`
- Day total = Σ overlap over `[startOfDay(d), startOfDay(d + 1))`; week = Σ of its 7 days; month = Σ of its days.
- Inputs are minute-aligned → every total is an exact sum of displayed card values.
- Running entry counts up to `floorMinute(now)`; all totals tick every minute (same moment as the tray).
- Ranges via date-fns in local time (`startOfDay`, `addDays`, `startOfWeek({ weekStartsOn: 1 })`, `startOfMonth`) → correct 23 h / 25 h DST days.

| Minutes | `formatDuration` | `formatHHMM` (tray) |
|---|---|---|
| 0 | Week header `–` · Month cell hidden · card / toolbar `0m` | `00:00` |
| 45 | `45m` | `00:45` |
| 60 | `1h` | `01:00` |
| 233 | `3h 53m` | `03:53` |
| 7853 | `130h 53m` (no "days" unit) | `130:53` |

All numbers render with `font-variant-numeric: tabular-nums`.

---

## 12. Data & persistence

### 12.1 Location

`app.getPath('userData')` → `~/Library/Application Support/Time Tracker/`

```
data.json                       entries + meta (source of truth)
prefs.json                      UI prefs + window bounds (frequent, low-value writes kept apart)
backups/data-YYYY-MM-DD.json    daily snapshot, keep last 30
```

- Dev builds use `Time Tracker (Dev)/` — development never touches real data.
- `TT_DATA_DIR` env var overrides the directory (tests/fixtures).

### 12.2 Schema

```ts
// data.json
interface DataFile {
  schemaVersion: 1;
  entries: Entry[];       // sorted by start, ascending
  lastAliveAt?: number;   // F12 auto-stop: when the current gap began
}

interface Entry {
  id: string;             // crypto.randomUUID()
  start: number;          // epoch ms (UTC), minute-aligned
  end: number | null;     // epoch ms (UTC), minute-aligned; null = running
}

// prefs.json
interface Prefs {
  view: 'week' | 'month';
  hourHeight: number;     // px, one of the zoom steps
  windowBounds?: { x: number; y: number; width: number; height: number };
}
```

Week start (Monday) is a constant. Launch-at-login state is read from macOS login items, not stored.

### 12.3 Invariants (enforced only in main)

1. `start % 60_000 === 0`; `end % 60_000 === 0`.
2. Closed entry: `end − start ≥ 60_000`.
3. At most one running entry, and it is the last one.
4. Sorted by `start`; `entries[i].end ≤ entries[i + 1].start` (touching allowed).
5. `end ≤ floorMinute(now)`; running `start ≤ floorMinute(now)`.

### 12.4 Writes

- Every mutation (start, stop, resize, delete, undo, auto-stop, `lastAliveAt`) writes immediately and **synchronously** — the file is tiny and writes follow rare user actions, so writes can never interleave or be cut short by quit/sleep.
- Atomic: write `data.json.tmp` → `fsync` → `rename` over `data.json`.
- First write of each day copies the previous file to `backups/`; prune beyond 30.

### 12.5 Load & recovery

- Parse + zod validation.
- Unparseable / wrong shape → move to `data.corrupt-<ts>.json`, restore newest valid backup, inform via dialog. A corrupt file is never overwritten.
- Valid shape but invariant violation → copy to `data.pre-repair-<ts>.json`, deterministic repair (sort; drop zero/negative lengths; trim overlaps by setting earlier `end = later.start`; keep only the latest running entry, close others at the next entry's start), log it.
- `schemaVersion` gate + ordered migration functions for future changes.

---

## 13. Architecture

### 13.1 Processes

```
┌──────────────────── Main (Node) — owns all state & rules ────────────────────┐
│  EntryStore ──── TimerService ──── TrayController                            │
│      │                 └── AutoStop (powerMonitor, F12)                      │
│      ├──── History (undo stack, F16)                                         │
│      └──── IpcHandlers ──── WindowController ──── Prefs ──── AppMenu         │
└───────────────▲──────────────────────────────────────┬───────────────────────┘
        invoke  │                                      │  entries:changed
┌───────────────┴────── Preload (contextBridge → window.tt) ──────────────────┐
└───────────────▲──────────────────────────────────────┬───────────────────────┘
┌───────────────┴────── Renderer (React) — view + gestures only ──────────────┐
│  Toolbar · WeekView · MonthView · useEntries · useNow · useResize            │
└──────────────────────────────────────────────────────────────────────────────┘
```

- `src/shared` — pure code used by both sides: types, time math, `clampResize`, formatters, invariants, constants. Clock injected (`now()`) everywhere for tests.
- Renderer never touches the filesystem; it only requests mutations.

### 13.2 IPC contract

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `entries:list` | R → M | `{ from, to }` | `Entry[]` overlapping the range (running = open-ended) |
| `entries:resize` | R → M | `{ id, edge: 'start' \| 'end', time }` | saved `Entry` (clamped) |
| `entries:contextMenu` | R → M | `{ id }` | — main pops native menu (**Delete**) → removes entry → broadcasts |
| `prefs:get` / `prefs:set` | R → M | `Partial<Prefs>` | `Prefs` |
| `entries:changed` | M → R | — | renderer refetches its visible range |
| `menu:command` | M → R | `MenuCommand` | View-menu shortcuts (week, month, today, prev, next, zoom) |

- ⌘Z (F16) is an app-menu item handled entirely in main — no IPC.
- The 12/24-hour cycle reaches the preload as a `--tt-hour-cycle=` argument (`additionalArguments`) and is exposed as `window.tt.hourCycle`.
- Range query is sufficient for clamping: resize bounds are always tighter than the visible column day.
- Every payload zod-validated; sender frame URL checked against the app's own URL.
- Renderer computes running elapsed from `start` + its own minute tick — no per-minute IPC.

### 13.3 Renderer state

- No state library: plain React state + three hooks.
- `useNow()` — minute tick aligned to the wall clock; refresh on `focus` / `visibilitychange`.
- `useEntries(range, hold)` — fetch on range change and on `entries:changed`; held while a resize is in progress; optimistic `patch()` after a commit so the card doesn't flicker back.
- `useResize()` — one closure per gesture: threshold → drag (snap, clamp, auto-scroll) → commit or cancel.

### 13.4 Security hygiene

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- CSP `default-src 'self'` in production (relaxed in dev for Vite HMR). No network access needed at all.
- `will-navigate` → `preventDefault`; `setWindowOpenHandler(() => ({ action: 'deny' }))`.
- Electron fuses: RunAsNode off, NodeOptions off, NodeCliInspect off, OnlyLoadAppFromAsar on, EmbeddedAsarIntegrityValidation on.

---

## 14. Tech stack & build

| Layer | Choice | Latest on npm (2026-10-03) |
|---|---|---|
| Runtime | Electron | 44.5.1 |
| UI | React + TypeScript 5.9 (typescript-eslint supports < 6.1) | 19.3.0 |
| Dev/build | electron-vite + Vite 7 (electron-vite 5 doesn't support Vite 8 yet) | 5.0.0 · 7.3.6 |
| Packaging | electron-builder | 26.15.3 |
| Dates | date-fns | 4.4.0 |
| Validation | zod | 4.6.5 |
| Styling | Tailwind CSS v4 + CSS-variable tokens | 4.3.3 |
| Tests | Vitest · Playwright (`_electron`) | 5.0.3 · 1.63.0 |

- Calendar: custom, ~500–800 LOC estimated. No component library needed (~5 controls); shadcn/ui optional for toolbar buttons/segmented control.
- Target: macOS **arm64 only**.

### 14.1 Packaging

- `productName: "Time Tracker"`, `appId: com.pavelivanov.timetracker`; category Productivity; `mac.extendInfo: { LSUIElement: true }`.
- Output `.dmg` + `.zip`; install by dragging into /Applications.
- **Ad-hoc signing**, no notarization: a locally built app carries no quarantine attribute, so Gatekeeper doesn't block it. Apple Silicon refuses binaries with an invalid signature, so the app must be re-signed ad-hoc after Info.plist changes (electron-builder `mac.identity: "-"`). Verify with `codesign -dv --verbose=2`.
- Launch at login (F13): `app.setLoginItemSettings({ openAtLogin })` (SMAppService on macOS 13+); reflect `getLoginItemSettings().status` (e.g. `requires-approval`). Verify early with the ad-hoc build in /Applications.
- macOS 26 lets users hide third-party menu bar items (System Settings → Menu Bar) — first place to check if the tray item "disappears".

### 14.2 Project layout

```
time-tracker/
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ playwright.config.ts · vitest.config.ts
├─ build/icon.png                   1024×1024 → .icns (generated)
├─ resources/tray/                  stopwatchTemplate.png, @2x (generated)
├─ scripts/
│  ├─ make-icons.mjs                draws tray + app icons (SDF, no deps)
│  └─ seed-dev.mjs                  sample data for the dev data dir
├─ src/
│  ├─ shared/     types · constants · time · resize · format · invariants
│  ├─ main/       index · store · timer · autoStop · history · tray · window · menu
│  │              ipc · prefs · locale · clock
│  ├─ preload/    index.ts · index.d.ts
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx · App.tsx (Calendar state, commands, keyboard)
│        ├─ hooks/       useNow · useEntries · useResize
│        ├─ lib/labels.ts
│        ├─ components/  Toolbar · Icons
│        │  ├─ week/     WeekView (header, gutter, zoom) · DayColumn (now-line, pill) · EntryCard
│        │  └─ month/    MonthView
│        └─ styles/index.css   tokens + Tailwind
├─ tests/   unit/ (Vitest) · e2e/ (Playwright)
└─ docs/reference/week-view.webp
```

---

## 15. Visual design

From the screenshot — **keep**: header layout (large date + weekday + accent total), `− +` zoom in the corner, light-gray rounded cards, `⏱ duration` label, light hour grid, hour labels.
**Drop**: titles ("New task"), people icon, all-day row, empty right-side gap in columns.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FFFFFF` | `#1E1E1E` |
| `--grid` | `#ECECEC` | `#2E2E2E` |
| `--text` | `#1D1D1F` | `#F5F5F7` |
| `--text-muted` | `#8E8E93` | `#98989D` |
| `--card` | `#E8E8E8` | `#3A3A3C` |
| `--card-hover` | `#DEDEDE` | `#444446` |
| `--accent` (totals) | `#A23BB0` | `#D27BE0` |
| `--running-bg` | accent @ 14% | accent @ 24% |
| `--now` | `#FF3B30` | `#FF453A` |

- System font (`-apple-system`, SF Pro), tabular numerals.
- Card radius 8–10 px, padding 6×8 px, label 12–13 px muted.
- Month cell: date number top-left (13 px, `--text`); total below it (15 px, semibold, `--accent`); thin `--grid` borders; hover background `--card` at low opacity to hint "click to open week".
- Follows system appearance (`prefers-color-scheme`).

---

## 16. Edge cases

| # | Case | Behavior |
|---|---|---|
| E1 | Start and Stop within the same minute | Entry discarded |
| E2 | Quit while running | Keeps running (Q7). Relaunch within 5 h → continues; later → auto-stopped at quit time |
| E3 | Sleep / shutdown while running | ≤ 5 h → keeps counting (gap counted); > 5 h → auto-stopped at the moment the gap began |
| E4 | Entry crosses midnight | One record, 2+ segments, each day counts its part, handles only on real edges |
| E5 | Entry crosses week/month boundary | Each range total counts only its part |
| E6 | DST spring-forward / fall-back | Durations exact (epoch math); positions by wall clock — skipped hour is blank, repeated hour may overlap visually |
| E7 | Time-zone change (travel) | Stored UTC; re-bucketed into new local days on next render |
| E8 | System clock goes backwards | New start clamped to ≥ last end |
| E9 | Running > 99 h | Tray shows `100:00` and up |
| E10 | Resize hits neighbor / now / 1-min floor / column bounds | Clamped flush |
| E11 | Extend an edge across midnight by resizing | Not supported in v1 (clamped at the column's 00:00 / 24:00) |
| E12 | Data change arrives mid-drag | Deferred until the gesture ends |
| E13 | Second launch | Single-instance lock → first instance opens its window |
| E14 | Corrupt / invalid data file | Quarantine + restore backup, or deterministic repair; never silently overwritten |
| E15 | Window open across midnight | Today highlight, now-line, running segments move on the minute tick; viewed period unchanged |
| E16 | Saved bounds on a disconnected display | Centered on the primary display |
| E17 | Very short entry (< 16 px) | Label hidden, tooltip only; edge zones shrink to height / 3 |
| E18 | Delete the running entry | Removed immediately, timer stops; ⌘Z restores it only if no newer timer was started meanwhile |
| E19 | Tray item hidden by macOS 26 settings or notch overflow | Outside app control; title kept ≤ 6 chars |
| E20 | Empty period | Week: grid with `–` headers; Month: dates only |
| E21 | Several short sleeps adding up to > 5 h | Not auto-stopped (each gap evaluated alone) |
| E22 | Timer started < 1 min before a > 5 h gap | Auto-stop yields zero length → entry discarded |
| E23 | Crash / power loss while running | Not detected as a gap in v1 (no `lastAliveAt`) → keeps running; fix by resize or Delete (F19 later) |

---

## 17. Testing

- **Unit (Vitest, injected clock)**: `floorMinute`, day segmentation, totals incl. running entry, `clampResize` (every bound), formatters, store load/repair/atomic write (temp dir), timer rules, auto-stop boundaries (gap exactly 5 h → keeps running; 5 h + 1 min → stopped at `lastAliveAt`; quit → relaunch path; zero-length discard), undo invariant checks. DST suites run under `TZ=Europe/Berlin` and `TZ=America/New_York` on transition dates.
- **E2E (Playwright `_electron.launch` + `TT_DATA_DIR` fixtures, `npm run test:e2e`)**: week totals + midnight split; bottom-edge drag snaps, updates totals live and persists; top edge stops at the previous entry; Esc cancels and body drags do nothing; month totals and day → week navigation.
- `TT_TEST=1` exposes main's internals on `globalThis.__tt` for `electronApp.evaluate()` (main process only — unreachable from the renderer) and opens windows without stealing focus.
- Native menus (tray, context menu) aren't drivable by Playwright → `TrayController` tested against a fake `Tray` (mocked `electron`); delete/undo covered by store + history unit tests.
- **Manual checklist**: sleep < 5 h and > 5 h, light/dark menu bar, login item, multi-display, ⌥ snapping, auto-scroll, right-click → Delete → ⌘Z.

---

## 18. Resolved decisions

Answered 2026-10-03.

| # | Question | Decision |
|---|---|---|
| Q1 | Running tray display | Time only (`01:23`), no icon |
| Q2 | Week view days | All 7 days, Monday first |
| Q3 | Forgotten timer after sleep / shutdown / quit | No prompt. Gap > 5 h → auto-stop at the moment the gap began; shorter gaps count as tracked time |
| Q4 | Deleting entries | Right-click → context menu → **Delete** (immediate; ⌘Z undo as safety net) |
| Q5 | Month view content | Calendar days + each day's total if any; nothing else |
| Q6 | Snapping | 15 min (≤ 48 px/h), 5 min (64–96 px/h), 1 min (144 px/h); ⌥ = 1 min |
| Q7 | Quit while running | Keep running |
| Q8 | App name / bundle id | "Time Tracker" / `com.pavelivanov.timetracker` |

Q3 interpretation (gap-based, not entry-length-based) and Q8 confirmed.

---

## 19. Milestones

| M | Deliverable | Exit criteria | Status (2026-10-03) |
|---|---|---|---|
| M0 | Scaffold: electron-vite React-TS, builder config (`LSUIElement`, ad-hoc sign), Vitest, single instance, dev data dir | `npm run dev` shows tray icon; packaged app runs from /Applications | Done — installed and running from /Applications |
| M1 | Core: shared time utils, EntryStore (atomic writes, backups, validation), TimerService, AutoStop, Tray (icon, title, tick, menu) | Usable tracker without a window; AC-T1…T6 | Done |
| M2 | Window + read-only Week view: Dock policy, toolbar, navigation, header totals, cards, now-line, zoom, scroll | AC-W1…W5 | Done |
| M3 | Edits: resize (edge zones, snapping, clamping, auto-scroll, preview pill, commit/cancel, main re-validation), context-menu Delete, undo | AC-R1…R7, AC-W6 | Done — Delete/⌘Z need a manual check (native menu) |
| M4 | Month view: day grid, daily totals, month total, click → week | AC-M1…M4 | Done |
| M5 | Should-haves: launch at login, tray totals, dark mode, shortcuts, app icon | Daily-drivable v1 | Done — launch at login unverified until installed |
| M6 | Could-haves: CSV export, global hotkey, heartbeat | Optional | Not started |

---

## 20. Risks

| Risk | Mitigation |
|---|---|
| Activation-policy switching quirks (menu bar not showing, focus not taken) | `app.focus({ steal: true })` after switching to `regular`; fallback `app.dock.show()` |
| Resizing short cards is fiddly | Zoom + ⌥ precision; edge zones scale with height; original-value magnet |
| "Forgot to stop" inflation | Auto-stop after > 5 h gaps; shorter gaps and awake-but-idle time still count (fix by resize; idle detection later) |
| Immediate Delete without confirmation | ⌘Z undo; daily backups |
| Electron footprint for a tray app (~60–100 MB idle) | Accepted with the stack; window destroyed on close; no timers while idle |
| Data loss | Atomic writes, daily backups, single instance, dev/prod data split |
| Login item with an ad-hoc signed app | Verify in M0/M5; fallback: add manually in System Settings → Login Items |
