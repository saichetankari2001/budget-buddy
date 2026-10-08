# Design Tokens

Source of truth: `tailwind.config.ts`'s `theme.extend.colors`.

| Token | Value | Role |
|---|---|---|
| `trust` | `#2563EB` | Primary interactive/brand color: buttons, active nav state, focus rings, and neutral data (chart lines that aren't AI-generated insight — the cash-flow trajectory, the 6-month spend trend). |
| `primary` | `#8b5cf6` | Reserved **exclusively** for Money Coach / AI surfaces — chat bubbles, the Coach panel's accent, AI-generated insight callouts. Never used for plain data or ordinary UI chrome. |
| `success` | `#34d399` | Positive money states: under budget, income landing, bill paid, balance trending up. |
| `destructive` | `#f87171` | Negative money states: over budget, overdue, balance dropping. |
| `accent` | `#22d3ee` | Legacy — being phased out of new chart work in favor of `trust`; still present in older components not touched by this plan. |
| `background`, `card`, `foreground`, `muted`, `border` | — | Neutral chrome, unchanged by any color-trend work to date. |
| `glass-1`/`glass-2`/`glass-3`/`border-glass` | — | Liquid-glass elevation tiers (2026-09-29 redesign), unrelated to the money-semantic tokens above. |

**Rule:** a new chart line, button, or data point that represents real financial data (not an AI-generated suggestion) uses `trust`, `success`, or `destructive` depending on its semantic meaning — never `primary`/violet. `primary` means "this came from the AI," nothing else.
