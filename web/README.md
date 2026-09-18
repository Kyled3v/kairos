# KAIROS Web Console (Phase 4 skeleton)

The public KAIROS web interface skeleton. **Phase 4: Web interface —
skeleton in place.**

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

## API contract

The skeleton composer expects the existing KAIROS HTTP server contract:

- `POST /run` — `{ goal: string }` → orchestration result JSON
- `GET /experience?sessionId=<agentId>` — per-agent audit trail
- `GET /memory?...` — memory inspection

The console degrades gracefully when the API is unreachable: the
activity panel echoes the objective and reports the skeleton state.

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
