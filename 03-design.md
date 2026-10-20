# 03 · Design system & screen specs — Dishpatch

> Role: UI designer. The clickable source of truth is `design/mockup.html` (open it in a browser; every screen is at `#<id>` and every key state at `#<id>/<state>`, add `?shot=1` to hide the mockup nav). PNGs in `design/screens/` were rendered from it with Playwright 1.56 (Chromium) at 1440×900 (desktop) and 390×844 (mobile). The render sandbox couldn't reach Google Fonts, so the same font files were served locally from Fontsource 5.3.0 during rendering — what you see in the PNGs is the real typography.

## Visual direction

**Mood:** a kitchen-table sign-up sheet that came alive — warm, tactile and a little festive, but calm enough to read at a glance on a phone between shifts.

**Reference keywords:** *sticker labels* · *recipe card* · *market chalkboard*.

**Signature element:** claimed slots are **sticker cards**: a white card with a thick category-coloured left edge, a 0.5° tilt and a soft shadow, so a filled board looks like a fridge covered in labels. Open slots are dashed outlines ("a gap on the sheet"). A new claim "pops" in (320 ms scale + tilt, disabled under `prefers-reduced-motion`). Everything else stays quiet: one accent colour (saffron), one display face for headings.

Avoided on purpose: the cream + terracotta + serif look and dark + acid-green look that read as template defaults.

## Design tokens

Tokens are CSS custom properties defined in `apps/web/src/styles/tokens.css` (copy them from the `:root` block of `design/mockup.html`). Tailwind v4 reads them through `@theme` (see 04-architecture.md).

### Colour — light

| Token | Hex | Use | Contrast (measured) |
|---|---|---|---|
| `--bg` | `#F6F7F2` | Page background (pale sage) | — |
| `--surface` | `#FFFFFF` | Cards, dialogs, inputs | — |
| `--surface-2` | `#EEF1EA` | Tags, link boxes, skeleton base | — |
| `--ink` | `#1B2421` | Body text, headings | 14.77:1 on bg |
| `--muted` | `#56635E` | Secondary text | 5.84:1 on bg, 6.28:1 on surface |
| `--border` | `#D9DED6` | Card borders (decorative) | — |
| `--border-ui` | `#8A968F` | Input/button outlines, dashed slots | 3.07:1 on surface (UI component ≥ 3:1) |
| `--primary` | `#1F6F5C` | Basil green: primary buttons, links, focus of "mine" | 6.02:1 white-on-primary |
| `--primary-soft` | `#DDEFE8` | Pressed chip background | ink 13.31:1 |
| `--accent` | `#F2B33D` | Saffron: logo, avatars, highlight | ink-on-accent 8.55:1 |
| `--error` | `#B3261E` | Errors, destructive | 6.54:1 on surface |
| `--err-bg` / `--err-ink` | `#FBE3E0` / `#8C1D18` | Error banner | 7.45:1 |
| `--warn-bg` / `--warn-ink` | `#FDF0D2` / `#7A4B00` | Warning banner, "Thin" status, hints | 6.55:1 |
| `--ok-bg` / `--ok-ink` | `#DDF3E6` / `#14532D` | Success banner, "Covered" status | 7.83:1 |
| `--focus` | `#2160A8` | Focus ring (3 px) | 6.36:1 on surface |

### Colour — dark

| Token | Hex | Contrast (measured) |
|---|---|---|
| `--bg` | `#101614` | — |
| `--surface` | `#18201D` | — |
| `--surface-2` | `#1F2925` | — |
| `--ink` | `#E8EEEA` | 15.56:1 on bg |
| `--muted` | `#A3B1AB` | 8.23:1 on bg, 7.47:1 on surface |
| `--border` / `--border-ui` | `#2C3833` / `#5E6E67` | border-ui 3.09:1 on surface |
| `--primary` / `--on-primary` | `#5CC8A8` / `#0B1F19` | 8.40:1; primary on surface 8.14:1 |
| `--accent` | `#F2C35B` | ink-on-accent 9.64:1 |
| `--error` | `#FF8A7A` | 7.26:1 on surface |
| `--err-bg` / `--err-ink` | `#3A1512` / `#FFB4A9` | 9.53:1 |
| `--warn-bg` / `--warn-ink` | `#2E2410` / `#F7D27A` | 10.50:1 |
| `--ok-bg` / `--ok-ink` | `#10281C` / `#8EE0B5` | 10.04:1 |
| `--focus` | `#86B7F0` | 7.95:1 on surface |

### Category colours (sticker edges, dots)

| Category | Light bg / on | Contrast | Dark bg / on | Contrast |
|---|---|---|---|---|
| main | `#1F6F5C` / `#FFFFFF` | 6.02 | `#5CC8A8` / `#0B1F19` | 8.40 |
| side | `#F2B33D` / `#1B2421` | 8.55 | `#F2C35B` / `#1B2421` | 9.64 |
| salad | `#4D7A12` / `#FFFFFF` | 5.11 | `#9CCB5A` / `#0F1A05` | 9.49 |
| dessert | `#B4245D` / `#FFFFFF` | 6.27 | `#F28DB5` / `#2A0716` | 8.11 |
| drinks | `#2160A8` / `#FFFFFF` | 6.36 | `#86B7F0` / `#06162B` | 8.68 |
| other (reserved, not in the MVP enum) | `#5B6470` / `#FFFFFF` | 6.00 | `#B6BEC8` / `#111418` | 9.84 |

Category is never conveyed by colour alone: every group has a text heading ("Mains 2/3") and every slot's accessible name includes the category.

### Typography

Self-hosted via Fontsource (no Google Fonts request at runtime; the mockup uses Google Fonts only for convenience).

| Role | Family | Size / line-height | Weight |
|---|---|---|---|
| Display XL (landing hero) | Bricolage Grotesque | 56/58 desktop, 38/40 mobile | 800 |
| H1 | Bricolage Grotesque | 40/44 desktop, 30/34 mobile | 800 |
| H2 | Bricolage Grotesque | 24/29 | 800 |
| H3 | Bricolage Grotesque | 18/23 | 600 |
| Body | Atkinson Hyperlegible Next | 16/24 | 400 |
| Body strong / labels | Atkinson Hyperlegible Next | 14–16 | 700 |
| Small | Atkinson Hyperlegible Next | 14/20 | 400–600 |
| XS / eyebrow | Atkinson Hyperlegible Next | 12/16, +0.02em, uppercase for eyebrows | 700 |
| Mono (links, tokens) | JetBrains Mono | 14/20 | 500 |

Atkinson Hyperlegible Next was picked for body text because guests read the board on small phones in noisy places; its letterforms keep 1/l/I and 0/O distinct.

### Spacing, radii, elevation, motion

| Token | Value |
|---|---|
| Spacing `--s1…--s8` | 4, 8, 12, 16, 24, 32, 48, 64 px |
| Radii | `--r-sm` 6 px · `--r-md` 10 px (buttons, inputs) · `--r-lg` 16 px (cards, dialogs) · `--r-pill` 999 px (chips, tags) |
| Elevation | `--e1` 0 1 2 / 8% (cards) · `--e2` 0 4 12 / 10% (sticker cards) · `--e3` 0 12 32 / 18% (dialogs, toasts); dark mode uses 40–60% black |
| Motion | `--dur-fast` 120 ms (press) · `--dur-base` 200 ms (hover, switch) · `--dur-slow` 320 ms (claim pop) · easing `cubic-bezier(.2,.8,.2,1)` |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` removes all animation/transition (skeleton shimmer becomes static) |

### Breakpoints (web)

| Name | Range | Layout |
|---|---|---|
| mobile | ≤ 720 px | Single column, 16 px gutter, slots 2-up, coverage sidebar replaced by a warning banner linking to `coverage`, claim dialog becomes a bottom sheet |
| tablet | 721–1023 px | Board grid 1 column + coverage sidebar below; slots 3-up |
| desktop | ≥ 1024 px | Content max-width 1200 px, board 2 columns (`1fr 340px`), slots 3-up |

Designed and rendered at 390×844 and 1440×900.

## Components

| Component | Variants | States |
|---|---|---|
| `Button` | primary, secondary (outline), ghost (text), danger; sizes md (48 px) / sm (40 px) | default, hover (brightness +8% / surface-2 bg), pressed (translateY 1 px), focus-visible (3 px focus ring), disabled (60% opacity, `not-allowed`), loading (spinner + label "Claiming…", `aria-busy`) |
| `TextField` | text, datetime-local | default, focus, error (red border + message linked with `aria-describedby`), disabled |
| `Stepper` | slot count per category | default, at-min (− disabled), at-max (+ disabled), disabled (board locked), error (host: can't remove claimed slot) |
| `Chip` (toggle) | dietary need / dish tag | default, hover, pressed (`aria-pressed=true`, ✓ prefix, primary-soft bg), focus-visible, disabled |
| `Tag` | read-only label on cards and guest list | default only |
| `SlotCard` | open, claimed, mine (outline), optimistic (70% opacity), just-claimed (pop), with hint chip | open: default/hover/focus/disabled (Closed / Paused); claimed: default, mine with release ✕, releasing (spinner), host view with remove ✕ |
| `CategoryGroup` | one per category | default, all-claimed ("3/3 ✓"), empty |
| `CoverageMeter` | compact (sidebar), full (coverage screen) | loading (skeleton), empty (no needs), ok / thin / gap per need |
| `ConnectionIndicator` | header pill | live (green dot + "Live · N here"), reconnecting (red dot + "Reconnecting…"), hidden (pages without a board) |
| `Banner` | ok, warn, error | static, with action link |
| `Toast` | info, error, with action | enter/leave (fade 200 ms), auto-dismiss 5 s (errors stay until dismissed), `role=status` or `role=alert` |
| `Dialog` | centered (desktop) / bottom sheet (mobile); alertdialog variant for destructive | open (focus trapped, first field focused), submitting, error; closes on Esc and scrim click (not alertdialog) |
| `LinkBox` | invite, host | default, copied (toast), copy failed (select text fallback) |
| `Switch` | lock board | off, on, pending (disabled while request is in flight), error (reverts + toast) |
| `Avatar` | guest (saffron), host (primary) | initials, `aria-hidden` (name is always next to it) |
| `Skeleton` | card, block | shimmer (static under reduced motion) |

## Screen specs

Each screen lists layout, components, every state, interactions and accessibility. Dark-mode PNGs have the `-dark` suffix, mobile `-mobile`.

### `create` — Create board (F1)

![create](design/screens/create.png)

Mobile: ![create mobile](design/screens/create-mobile.png) · Dark: ![create dark](design/screens/create-dark.png) · Error: ![create error](design/screens/create-error.png)

- **Layout:** desktop two columns (hero copy + two example sticker cards left, form card right); mobile single column with the hero shortened and stickers hidden.
- **Components:** TextField ×4 (event name, date & time `datetime-local`, location optional, your name), Stepper ×5 (mains 3, sides 3, salads 2, desserts 2, drinks 2 as defaults; 0–12 each, total 1–40), Button primary "Create board", footnote about 14-day deletion.
- **States:** default; error (`create/error`: summary banner "Fix 2 fields…", field errors on date "Pick a date in the future." and name "Add a name so guests know who's hosting."); submitting (button loading "Creating…", fields read-only); rate limited (error banner with minutes); offline (error banner + "Try again").
- **Interactions:** Enter submits; steppers respond to click and ArrowUp/ArrowDown when focused; on success navigate to `share`.
- **Accessibility:** form `aria-describedby` points to the summary banner; on failed submit focus moves to the banner (`role=alert`); each stepper button has a label ("More mains"); count is announced via `aria-live=polite`.

### `share` — Share links (F1)

![share](design/screens/share.png)

Mobile: ![share mobile](design/screens/share-mobile.png) · Dark: ![share dark](design/screens/share-dark.png) · Copied: ![share copied](design/screens/share-copied.png)

- **Layout:** centered card (max 640 px): eyebrow "Board created", title, meta line, invite LinkBox, host LinkBox with explanation, warning banner, primary "Go to the board".
- **Components:** LinkBox ×2, Button secondary sm "Copy" ×2, Banner warn, Button primary, Toast.
- **States:** default; copied (`share/copied` toast "Invite link copied"); copy failed (Clipboard API rejected → the link text is selected and the toast says "Press Ctrl/⌘+C to copy").
- **Interactions:** Copy uses `navigator.clipboard.writeText`; the host link exists only in memory on this screen (never in localStorage); leaving the screen shows `beforeunload` confirm if the host link wasn't copied.
- **Accessibility:** links are in `<code>` elements labelled by their field labels; the toast is `role=status`.

### `join` — Join board (F2)

![join](design/screens/join.png)

Mobile: ![join mobile](design/screens/join-mobile.png) · Dark: ![join dark](design/screens/join-dark.png) · Error: ![join error](design/screens/join-error.png)

- **Layout:** centered card: "Mina invited you to", title, meta (date, location, guests going), name field, dietary chip group, primary "Join the board".
- **Components:** TextField, Chip ×6 (Vegetarian, Vegan, Gluten-free, Dairy-free, Nut-free, Halal), Button primary, helper texts.
- **States:** loading (card skeleton while GET preview runs); default; submitting ("Joining…"); name taken (inline error on name); board full (error banner); error (`join/error`: plate illustration, "This invite link doesn't work anymore", secondary "Start your own board") — same screen for invalid, rotated and expired so the response doesn't reveal which.
- **Interactions:** chips toggle on click/Space/Enter; Enter in the name field submits.
- **Accessibility:** chip group is a `<fieldset>` with legend "Anything you can't eat?"; chips are `<button aria-pressed>`; error card is `role=alert` and receives focus.

### `board` — Live board (F3, F4, F5)

![board](design/screens/board.png)

Mobile: ![board mobile](design/screens/board-mobile.png) · Dark: ![board dark](design/screens/board-dark.png)

States: Loading ![board loading](design/screens/board-loading.png) · Empty ![board empty](design/screens/board-empty.png) · Offline ![board offline](design/screens/board-offline.png) · Locked ![board locked](design/screens/board-locked.png) · Conflict ![board conflict](design/screens/board-conflict.png) · Empty dark ![board empty dark](design/screens/board-empty-dark.png) · Offline dark ![board offline dark](design/screens/board-offline-dark.png)

- **Layout:** header row (H1 title, meta: date, location, "6 of 12 claimed"; Host settings button for the host). Desktop: groups column + 340 px sidebar (coverage card, "Who's coming" card). Mobile: a warning banner summarising the top coverage issue ("No vegan main yet · nut-free: nothing yet. See coverage") above the groups; sidebar hidden; slots 2-up.
- **Components:** ConnectionIndicator (header), CategoryGroup ×n, SlotCard (open/claimed/mine), CoverageMeter (compact), guest list with Avatar + Tag, Banner (offline, locked, empty), Toast (conflict).
- **States:**
  - loading (`board/loading`): skeleton slots and meter, no counts.
  - empty (`board/empty`): every slot open, banner "Nothing claimed yet. Be the first — pick any open slot.", coverage shows "Nothing yet" for every need with guests.
  - success (default): sticker cards, hint chip "Vegan would help" on open mains (US-11).
  - offline (`board/offline`): error banner "Connection lost. Reconnecting… Claims are paused until you're back.", header "Reconnecting…", open slots show "Paused" and are disabled; claimed cards remain visible.
  - locked (`board/locked`): warn banner "Mina locked the board…", open slots "Closed", release buttons hidden.
  - conflict (`board/conflict`): another guest's claim pops into the slot the user was looking at; toast "Sam just took the last dessert slot." (`role=alert`).
  - error (snapshot 5xx): full-width error banner with "Try again"; 401/404 → `notfound`.
- **Interactions:** click/Enter on an open slot opens `claim`; ✕ on my card opens a confirm popover ("Release 'Garlic green beans'?"); the host sees ✕ on every card ("Remove Reza's claim?"); presence updates every ≤ 5 s; new claims animate with `pop`.
- **Accessibility:** each group is a `<section aria-label="Mains">`; each claimed card is an `<article>` with accessible name "Mains slot 1: Ghormeh sabzi, brought by Reza"; open slots are `<button>` "Claim open Mains slot 3"; live changes are announced through one polite live region ("Reza claimed Ghormeh sabzi in Mains"), throttled to one announcement per 2 s so a busy board doesn't flood screen readers; offline/locked banners are `role=status`.

### `claim` — Claim dialog (F4, F5)

![claim](design/screens/claim.png)

Mobile: ![claim mobile](design/screens/claim-mobile.png) · Dark: ![claim dark](design/screens/claim-dark.png) · Submitting: ![claim submitting](design/screens/claim-submitting.png) · Error: ![claim error](design/screens/claim-error.png) · Error mobile: ![claim error mobile](design/screens/claim-error-mobile.png) · Error dark: ![claim error dark](design/screens/claim-error-dark.png)

- **Layout:** modal dialog (520 px) over a dimmed board on desktop; bottom sheet on mobile with full-width stacked buttons (primary on top).
- **Components:** eyebrow (category dot + "slot 2 of 3"), H2 "What are you bringing?", TextField "Dish", Chip ×6 "It's suitable for…", Banner ok "This covers the vegan main gap for 2 guests." (live preview using the shared coverage function), Buttons "Cancel" / "Claim slot".
- **States:** default; invalid (dish empty/too long → inline error); submitting (`claim/submitting`: spinner "Claiming…", inputs disabled); error (`claim/error`: banner "Jonah just claimed this slot. Pick another open main — the third one is still free.", primary becomes "Back to board"); claim limit (banner "You're already bringing 3 dishes…"); locked (dialog closes, board shows locked).
- **Interactions:** opens with focus in Dish; Esc or scrim click cancels; if an SSE `slot.claimed` arrives for this slot while open, the dialog switches to the error state without the user submitting.
- **Accessibility:** `role=dialog aria-modal=true aria-labelledby`; focus trap; focus returns to the slot button on close; the error banner is `role=alert`.

### `coverage` — Dietary coverage (F5)

![coverage](design/screens/coverage.png)

Mobile: ![coverage mobile](design/screens/coverage-mobile.png) · Dark: ![coverage dark](design/screens/coverage-dark.png) · Empty: ![coverage empty](design/screens/coverage-empty.png)

- **Layout:** single column (max 760 px): back link, H1, intro, CoverageMeter (full), "How we decide" rules card.
- **Components:** CoverageMeter rows: need name, "2 guests need it · 2 dishes fit", status pill (Covered / Thin message / Nothing yet), bar (width = min(100, dishes × 25)%).
- **States:** loading (skeleton rows); empty (`coverage/empty`: ok banner "No one has listed dietary needs yet…"); success (default); live update (rows re-sort: gap first, then thin, then ok; ties by guest count).
- **Interactions:** none besides back; updates live from the same SSE stream as the board.
- **Accessibility:** the status is text (not colour-only); the bar is `role=img` with label "Vegan: 2 compatible dishes".

### `host` — Host settings (F6)

![host](design/screens/host.png)

Mobile: ![host mobile](design/screens/host-mobile.png) · Dark: ![host dark](design/screens/host-dark.png) · Confirm delete: ![host confirm](design/screens/host-confirm.png) · Confirm mobile: ![host confirm mobile](design/screens/host-confirm-mobile.png)

- **Layout:** single column (max 760 px) of setting cards: Lock (Switch), New invite link (secondary button), Slots (Stepper per category with "· 2 claimed"), Delete board (danger card).
- **Components:** Switch, Button secondary/danger, Stepper, alertdialog with TextField confirm.
- **States:** default; pending (control disabled while saving); saved (toast "Board locked" / "New invite link ready" with Copy); error (control reverts, toast "Couldn't save — try again"); can't remove a claimed slot (stepper − disabled when open slots = 0, tooltip "Remove a claim first"); confirm (`host/confirm`: "Delete for everyone" disabled until the typed name matches exactly).
- **Interactions:** switch toggles on click/Space; New link replaces the invite link and shows it in a LinkBox inline; delete success → `create` with toast "Board deleted".
- **Accessibility:** switch `role=switch aria-checked`; alertdialog doesn't close on scrim click; focus starts in the confirm field.

### `notfound` — Not found (F1, F2, F6)

![notfound](design/screens/notfound.png)

Mobile: ![notfound mobile](design/screens/notfound-mobile.png) · Dark: ![notfound dark](design/screens/notfound-dark.png)

- **Layout:** centered plate illustration with "404", H1 "Nothing on this plate", explanation, primary "Start a new board".
- **States:** single state; shown for unknown routes, bad host links, deleted boards and boards without a session (same copy for all, so it doesn't confirm a board exists).
- **Accessibility:** illustration `aria-hidden`; H1 gets focus on route change.

## Platform specifics (web)

- **Responsive:** mobile-first CSS; breakpoints above; touch targets ≥ 48 px for primary controls and ≥ 40 px for chips/small buttons with ≥ 8 px spacing (meets WCAG 2.2 target size minimum 24 px; aims at 44–48 px for primaries).
- **Keyboard:** everything reachable in DOM order; visible 3 px focus ring (`--focus`); dialogs trap focus and restore it; Esc closes non-destructive dialogs; skip link "Skip to board" on `board`.
- **Theme:** follows `prefers-color-scheme`; no manual toggle in MVP (the mockup's ◐ link is for review only).
- **Live regions:** one polite region for board changes, one assertive (`role=alert`) for errors only.
- **Time:** dates are stored in UTC and shown with `Intl.DateTimeFormat` in the viewer's locale and time zone.
