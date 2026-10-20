# 02 · User flows — Dishpatch

> Role: UX. Screen ids match `design/mockup.html#<id>` and `design/screens/<id>.png`.

## Screen / page inventory

| id | Name | Route (SPA) | Purpose | Entry points | Features |
|---|---|---|---|---|---|
| `create` | Create board | `/` | Landing + form to create a board with slot counts | Direct visit, "Start a new board" on notfound/join error | F1 |
| `share` | Share links | `/events/:eventId/share` | Shows the guest invite link and the one-time host link | After successful create | F1 |
| `join` | Join board | `/e/:inviteToken` | Event preview, name + dietary needs form | Invite link from chat | F2 |
| `board` | Live board | `/events/:eventId` | Slots by category, claims, live status, coverage sidebar (desktop), guest list | After join/create, returning visit with session cookie, host link | F3, F4, F5 |
| `claim` | Claim dialog | `/events/:eventId?claim=:slotId` (modal over board) | Dish name + tags for one open slot | Tap/click an open slot | F4, F5 |
| `coverage` | Dietary coverage | `/events/:eventId/coverage` | Full per-need breakdown + rules | Sidebar "Details →" (desktop), banner "See coverage" (mobile) | F5 |
| `host` | Host settings | `/events/:eventId/host` | Lock, rotate invite, edit slots, delete | "Host settings" button (host only) | F6 |
| `notfound` | Not found | any unknown route, `/h/:bad`, unauthorized board | Generic "nothing on this plate", no existence leak | Bad links, deleted board, no session | F1, F2, F6 |

Host link route `/h/:hostToken` has no screen of its own: it exchanges the token for a host session and redirects to `board` (or `notfound`).

## Flow A — Host creates a board (F1 · US-01, US-02)

```mermaid
flowchart TD
  A0([Host opens /]) --> A1[create: fill title, date, name, slot counts]
  A1 --> A2{Client validation<br/>zod CreateEventInput}
  A2 -- invalid --> A3[create/error: inline field errors + summary banner]
  A3 --> A1
  A2 -- valid --> A4[POST /api/events]
  A4 -- 201 --> A5[Set host session cookie<br/>store host link in memory only]
  A5 --> A6[share: invite link + host link + warning]
  A6 --> A7{Copy?}
  A7 -- copy --> A8[share/copied toast]
  A7 -- go to board --> B9([board])
  A4 -- 400 VALIDATION --> A3
  A4 -- 429 RATE_LIMITED --> A9[Banner: try again in N minutes]
  A9 --> A1
  A4 -- network error / offline --> A10[Banner: you're offline, nothing was created<br/>button: Try again]
  A10 --> A4
  A4 -- 5xx --> A11[Banner: something broke on our side<br/>request id shown]
  A11 --> A1
```

## Flow B — Guest joins (F2 · US-03, US-04)

```mermaid
flowchart TD
  B0([Guest opens /e/:inviteToken]) --> B1{Session cookie<br/>for this event?}
  B1 -- yes --> B9([board])
  B1 -- no --> B2[GET /api/invites/:token]
  B2 -- 200 --> B3[join: preview + name + dietary chips]
  B2 -- 404 INVITE_INVALID<br/>invalid, rotated or expired --> B4[join/error: link doesn't work anymore]
  B4 --> B5([create via 'Start your own board'])
  B2 -- 429 --> B6[Banner: too many tries, wait a minute]
  B2 -- network error --> B7[Banner: offline, Retry]
  B7 --> B2
  B3 --> B8[POST /api/invites/:token/join]
  B8 -- 201 + cookie --> B10[history.replaceState to /events/:eventId]
  B10 --> B9
  B8 -- 409 NAME_TAKEN --> B11[Inline error on name field]
  B11 --> B3
  B8 -- 409 EVENT_FULL --> B12[Banner: board is full - 100 people]
  B8 -- 400 VALIDATION --> B11
  B8 -- 404 INVITE_INVALID --> B4
```

## Flow C — Live board, live updates and reconnect (F3, F5 · US-05, US-06, US-10)

```mermaid
flowchart TD
  C0([Open /events/:eventId]) --> C1[board/loading skeleton]
  C1 --> C2[GET /api/events/:eventId snapshot]
  C2 -- 401/404 --> C3([notfound])
  C2 -- 200 --> C4{Any claims?}
  C4 -- no --> C5[board/empty: 'Be the first' banner]
  C4 -- yes --> C6[board: cards + coverage + guests]
  C5 --> C7[Open EventSource /api/events/:eventId/stream]
  C6 --> C7
  C7 --> C8{Message}
  C8 -- slot.* / participant.* / event.updated --> C9[Apply to query cache by seq<br/>recompute coverage]
  C9 --> C8
  C8 -- presence --> C10[Update 'Live · N here']
  C10 --> C8
  C8 -- event.updated locked=true --> C11[board/locked banner, slots Closed]
  C11 --> C8
  C8 -- event.deleted --> C3
  C8 -- resync --> C2
  C7 -- error / drop --> C12{Reconnected<br/>within 2 s?}
  C12 -- yes --> C8
  C12 -- no --> C13[board/offline: banner, slots Paused]
  C13 --> C14[EventSource auto-retry, retry: 3000<br/>sends Last-Event-ID]
  C14 -- replay ok --> C8
  C14 -- gap too old --> C2
  C14 -- 401 session gone --> C3
```

## Flow D — Claim a slot, including the race (F4, F5 · US-07, US-08, US-11)

```mermaid
flowchart TD
  D0([board: tap open slot]) --> D1{Board locked<br/>or offline?}
  D1 -- yes --> D2[Slot disabled: Closed / Paused]
  D1 -- no --> D3[claim dialog: dish + tags<br/>gap hint shown]
  D3 --> D4{Valid?}
  D4 -- no --> D5[Inline error: dish name 1-60 chars]
  D5 --> D3
  D4 -- yes --> D6[claim/submitting<br/>optimistic card on board]
  D6 --> D7[POST /api/events/:id/slots/:slotId/claim]
  D7 -- 200 --> D8[Keep card, close dialog,<br/>pop animation, coverage updates]
  D7 -- 409 SLOT_TAKEN --> D9[Roll back optimistic card<br/>claim/error: 'Jonah just claimed this slot']
  D9 --> D10([board with winner's card])
  D7 -- 409 CLAIM_LIMIT --> D11[Dialog error: already bringing 3]
  D7 -- 423 BOARD_LOCKED --> D12[Roll back, board/locked]
  D7 -- 401/404 --> D13([notfound])
  D7 -- network error --> D14[Roll back, toast: 'Couldn't reach Dishpatch - try again']
  D14 --> D3
  D15([Someone else claims the slot<br/>while my dialog is open]) --> D16[SSE slot.claimed for this slot]
  D16 --> D9
```

## Flow E — Release my claim (F4 · US-09)

```mermaid
flowchart TD
  E0([board: ✕ on my card]) --> E1[Confirm popover: Release 'Garlic green beans'?]
  E1 -- cancel --> E2([board])
  E1 -- confirm --> E3[Optimistic: slot shows open]
  E3 --> E4[DELETE /api/events/:id/slots/:slotId/claim]
  E4 -- 200 --> E5([board: slot open for everyone])
  E4 -- 403 NOT_OWNER --> E6[Roll back, toast: that isn't your claim]
  E4 -- 423 BOARD_LOCKED --> E7[Roll back, board/locked]
  E4 -- network error --> E8[Roll back, toast + retry]
```

## Flow F — Host controls (F6 · US-12, US-13, US-14)

```mermaid
flowchart TD
  F0([board: Host settings]) --> F1{Am I host?}
  F1 -- no --> F2[Button hidden; direct URL shows notfound]
  F1 -- yes --> F3[host screen]
  F3 --> F4[Toggle lock] --> F5[PATCH /api/events/:id locked]
  F5 -- 200 --> F6[All viewers: board/locked or unlocked]
  F3 --> F7[New invite link] --> F8[POST /api/events/:id/invite/rotate]
  F8 -- 200 --> F9[Show new link + copy; old link → join/error]
  F3 --> F10[Slot stepper +/-] --> F11[POST or DELETE /api/events/:id/slots]
  F11 -- 409 SLOT_CLAIMED --> F12[Inline: remove the claim first]
  F11 -- 409 SLOT_LIMIT --> F15[Inline: max 40 slots]
  F3 --> F13[Remove claim on board card ✕ as host] --> E4
  F3 --> F14[Delete board] --> F16[host/confirm dialog: type event name]
  F16 -- name mismatch --> F17[Delete button stays disabled]
  F16 -- match --> F18[DELETE /api/events/:id]
  F18 -- 204 --> F19([create, toast: Board deleted])
  F5 & F8 & F11 & F18 -- 403 HOST_ONLY --> F2
  F5 & F8 & F11 & F18 -- network error --> F20[Toast: couldn't save, retry]
```

## Flow G — Host reopens the board on another device (F1 · US-02)

```mermaid
flowchart TD
  G0([Open /h/:hostToken]) --> G1[POST /api/host-links/:token/session]
  G1 -- 200 + cookie --> G2[history.replaceState → /events/:eventId]
  G2 --> G3([board as host])
  G1 -- 404 --> G4([notfound])
  G1 -- 429 --> G5[notfound + 'Too many attempts' note]
```

## Navigation map

```mermaid
flowchart LR
  create -- Create board --> share
  share -- Go to the board --> board
  invite([Invite link /e/:token]) --> join
  hostlink([Host link /h/:token]) --> board
  hostlink -. bad token .-> notfound
  join -- Join --> board
  join -. bad/expired link .-> joinerr[join/error]
  joinerr -- Start your own --> create
  board -- open slot --> claim
  claim -- Claim / Cancel / Esc --> board
  board -- Details / See coverage --> coverage
  coverage -- Back --> board
  board -- Host settings (host) --> host
  host -- Back --> board
  host -- Delete confirmed --> create
  board -. deleted / no session .-> notfound
  notfound -- Start a new board --> create
```
