# KAIROS Web Console (Phase 4)

The public KAIROS web interface. **Phase 4: Web interface — skeleton
complete with live streaming, multi-view navigation and a delegation
demo.**

## Design system

Visual direction is generated and persisted with the `ui-ux-pro-max`
skill (searchable design-intelligence database):

- Source of truth: [`design-system/kairos/MASTER.md`](../design-system/kairos/MASTER.md)
- Style: **AI-Native UI** (conversational, streaming-text, minimal chrome)
- Typography: **Inter** (300–700) — technical, precision mood
- Palette: AI purple `#7C3AED` primary, cyan `#0891B2` accent, with the
  full light/dark token set inlined as CSS custom properties in
  `index.html`
- Density dial: 8/10 (dashboard spacing scale), motion 5/10 (standard)

When building new pages, check `design-system/kairos/pages/<page>.md`
first (page overrides beat Master), otherwise apply Master rules.

## Surfaces

KAIROS targets three form factors from one design system:

| Surface | Location | Status |
|---|---|---|
| **Web console** | `web/index.html` (this skeleton) | Skeleton |
| **Desktop** | `packages/vscode` (VS Code extension) | Existing package |
| **Mobile** | Responsive web (375px+), bottom nav ≤5 items, safe-area insets | Skeleton is mobile-first |

## Run locally

```bash
# Static preview (any static server works)
npx serve web

# Or against the live KAIROS API: the composer posts to POST /run on the
# same origin; run the KAIROS HTTP server and point a proxy at it.
```

## Views & page overrides

Three hash-deep-linked views (`#console`, `#agents`, `#evals`), each
backed by a persisted page override from the ui-ux-pro-max skill:

| View | Override file | Key rules applied |
|---|---|---|
| **Console** | `MASTER.md` | Streaming activity log, delegation board, composer |
| **Agents** | `pages/agents.md` | Responsive profile card grid (≤1200px); status pills carry a dot **and** a text label — never color alone |
| **Memory** | `MASTER.md` | Search + type filter + per-agent scope (metadata.agentId), tag metadata per memory |
| **Status** | `MASTER.md` | PULSE-style three-state health (shape + color + label), probe detail, live experience trail |
| **Evals** | `pages/evals.css` rules inline | Highlighted "checks" column (accent tint), row hover, horizontal-scroll wrapper so wide tables never break layout |

## Live streaming

The composer prefers `POST /stream` (Server-Sent Events) and falls back
to `POST /run` JSON when the stream is unavailable. SSE events handled:

- `start` — `{ sessionId, goal }` → logged as session start
- `result` — full `MultiCycleResult` → logged with status/cycles/termination
- `error` — `{ error }` → logged; delegation rows flip to `failed`

The **delegation board** previews ATLAS's smart-strategy routing
client-side (clause split + keyword→role matching mirroring
`src/agents/executive/decomposition.ts`) and animates each worker chip
through `pending → running → done/failed` as events arrive.

## Demo mode

When the API is unreachable (topbar shows "API offline (demo mode)"),
submitting an objective runs a **clearly labeled simulated** delegation
choreography: the same routing preview drives the board so the flow is
demonstrable without a backend.

## API contract

The console expects the existing KAIROS HTTP server contract:

- `POST /stream` — `{ goal, maxCycles? }` → SSE (`start`, `result`, `done`, `error`)
- `POST /run` — `{ goal, maxCycles?, decompose?, sessionId? }` → `MultiCycleResult` JSON (fallback)
- `GET /memory?query=&type=&limit=` — memory records; the Memory view
  filters per-agent scope client-side by `metadata.agentId` (the
  `AgentScopedMemoryStore` contract)
- `GET /experience?limit=5` — API liveness check, audit trail on the
  Status view, per-agent trails via `?sessionId=<agentId>`

## E2E tests

Playwright specs live in `tests/e2e/console.spec.mjs` (15 tests): hash
routing across all five views, agents/evals content, memory-inspector
offline behavior, the delegation demo choreography, and accessibility
invariants (aria-live regions, touch targets, reduced-motion). Run:

```bash
npx playwright test          # starts tests/e2e/static-server.mjs on :4173
```

The E2E run deliberately exercises the console's offline demo mode so
no backend is needed in CI; a separate smoke pass against a live KAIROS
server is a future addition.

## Accessibility & interaction rules applied

From the ui-ux-pro-max guideline database (verified matches):

- Visible `:focus-visible` rings on every control (WCAG focus-visible)
- `aria-live="polite"` activity log so orchestration updates are announced
- `prefers-reduced-motion` disables the pulse/stagger animations
- 44×44px minimum touch targets (composer button, bottom nav)
- Bottom nav ≤5 items with hash deep links (`#console`, `#agents`,
  `#memory`, `#evals`) and `aria-current="page"` state
- Inline SVG glyphs (Heroicons/Lucide style) — no emoji as icons
- Contrast: foreground/background pairs meet 4.5:1 in both light and
  dark token sets
