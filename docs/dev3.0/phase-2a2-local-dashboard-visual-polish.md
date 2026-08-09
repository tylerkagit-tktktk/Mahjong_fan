# Phase 2A.2 — Local Ended Dashboard Visual Polish

## Screenshot-driven reason

Phase 2A.1 established the correct local ended-game hierarchy, but iPhone 17 / iOS 26.5 review still showed a prominent white Share background and a large white history slab that read like an accounting table. Phase 2A.2 keeps every product and data decision intact while refining the result page into a quieter reading flow.

## App Bar Share

The native `square.and.arrow.up` item remains in the trailing App Bar position with its existing pending, cancellation, failure, and unmount guards. On iOS 26 it now requests a plain item and hides the shared navigation background, so the symbol has no visible white circle while retaining the native touch target. The existing 44-by-44 transparent cross-platform fallback is unchanged.

## Timeline reading flow

The Hand history title, wind headings, rows, and separators now sit directly on the warm page background. The former large white rectangle is gone; Hero, Ranking, Stats, and Rules remain cards because they are summaries rather than chronology.

Wind headings are quiet subgroup labels. The first section starts compactly, while later winds receive extra top spacing instead of a heavy divider. Hand separators use the existing low-contrast border token, and the final hand in each wind has no forced divider.

## Hand-row hierarchy and responsiveness

Each hand uses two compact lines:

```text
東風東局                         第 1 鋪
Fd 自摸 · 3 番                  +HK$12
```

The round remains primary and the localized hand number is a lower-weight caption (`Hand 1`, `第 1 鋪`, `第 1 铺`). A winning amount no longer repeats the winner name. Draws render no amount.

The event summary is the flexible column and may wrap for long identities. The amount keeps its intrinsic width, stays right-aligned, and uses tabular numbers. This avoids truncating the event into meaninglessness or allowing a large amount to overlap it. Unit coverage exercises long winner/discarder names and `+HK$1280` without asserting fake pixel geometry.

## Accessibility

The visual restructuring does not split a hand into separate VoiceOver fragments: each row remains one accessible round-plus-event sentence. The Share label and disabled state, Ranking semantics, and Rules expanded state are unchanged.

## Verification and screenshots

Simulator QA used iPhone 17 / iOS 26.5 and the existing seven-hand `Drudging` ended fixture without changing QA-A or production game data. Traditional Chinese default size showed a plain Share symbol, unchanged summary cards, the history reading directly on the page background, quiet East/South grouping, aligned amounts, and a collapsed Rules card with safe bottom spacing. The app's Large text setting kept every amount and localized hand number visible without overlap. English event copy wrapped within its flexible column, and Simplified Chinese showed complete keys and clean alignment.

Captures remain outside Git:

- Dashboard top: `/tmp/mahjong-phase2a2-dashboard-top-zh-HK.png`
- Stats and timeline start: `/tmp/mahjong-phase2a2-stats-timeline-start-zh-HK.png`
- East-to-South transition: `/tmp/mahjong-phase2a2-wind-transition-zh-HK.png`
- Bottom and collapsed Rules: `/tmp/mahjong-phase2a2-bottom-rules-zh-HK.png`
- Large text timeline: `/tmp/mahjong-phase2a2-large-text-timeline-zh-HK.png`
- English timeline: `/tmp/mahjong-phase2a2-timeline-en.png`
- Simplified Chinese timeline: `/tmp/mahjong-phase2a2-timeline-zh-CN.png`

## Known limitations

React Native renderer tests verify flex-safe structure, content, and accessibility but cannot prove pixel layout. Simulator review remains the visual authority. Cloud ended results intentionally retain their separate presentation for a later checkpoint.

## Out of scope

No canonical replay, `LocalDashboardProjection` semantics, scoring, settlement, SQLite, schema, lifecycle, correction, undo, History navigation, share payload, ranking/statistics logic, chronology, round-label authority, Cloud/Firestore, multiplayer, dependency, package version, or global design-system change is included.
