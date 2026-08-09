# Phase 2A.3 — Collapsible Hand History

## Screenshot-driven reason

Phase 2A.2 made the ended-game timeline readable, but keeping every hand open by default let even a six-hand record dominate the result page. A normal 15–30+ hand game would read primarily as a History screen, pushing Ranking, Stats, and Rules away from the concise ended-game summary hierarchy.

Phase 2A.3 changes only the timeline's disclosure behaviour. The Phase 2A.2 expanded timeline remains the visual and presentation authority.

## Global disclosure design

Hand history is one lightweight disclosure row on the warm page background:

```text
牌局紀錄 · 6 鋪                         ＋
```

It starts collapsed each time the Dashboard bundle loads. One tap expands the complete history and changes the indicator to `－`; a second tap collapses it. There is no per-wind state, preview row, filter, jump control, partial count, pagination, or load-more path.

The whole row is tappable and has a minimum 44-point target. Its flexible title protects the trailing disclosure at larger text sizes. History remains a reading-flow section; Rules remains its existing white summary card and starts collapsed independently.

## Count authority and edge cases

The displayed count is `handDisplayList.length`, the same sorted effective projection collection used to construct the rendered timeline sections. It is not sourced from the persisted `games.handsCount`, a fresh SQLite read, or a separate cache.

- Zero hands displays `牌局紀錄 · 0 鋪`, disables disclosure, and renders no blank timeline.
- One hand uses localized singular English (`1 hand`) and the established Chinese `鋪` terminology.
- Multi-hand and 30-hand records stay compact while collapsed and expose the complete section data when expanded.

## SectionList and rendering

The existing Dashboard `SectionList` architecture is preserved. Summary content remains its header, Rules remains its footer, and the Phase 2A.2 wind groups remain its sections. Collapsed state passes no timeline sections; expanded state restores the existing grouped sections. This avoids mounting hand rows while hidden and preserves virtualization for long histories without adding a nested vertical scroller.

No timeline row formatter, chronology, round label, event summary, winner amount, draw layout, separator, or wind-heading style changed.

## Accessibility

The disclosure is one coherent button with a localized title-and-count label and `accessibilityState.expanded`. The zero-hand state also exposes `disabled`. Expansion is not communicated only through the visual `＋` / `－` indicator. Existing coherent timeline-row summaries and Rules accessibility remain unchanged.

## Verification coverage

Focused renderer tests cover default collapsed hierarchy, whole-history expansion and re-collapse, hidden rows and wind headings, preserved chronology and Phase 2A.2 row content, SectionList section switching, 0/1/2/5/30-hand counts, disabled empty state, full long-history section data, disclosure accessibility, and retained Share/Ranking/Stats/Rules/read-only behaviour. Locale coverage verifies English, Traditional Chinese, and Simplified Chinese count terminology, including English singular.

## Simulator QA

Simulator QA used iPhone 17 / iOS 26.5 and the existing seven-hand `Drudging` ended fixture without modifying QA-A or game data. Traditional Chinese first open read as a result summary: Ranking and Stats remained primary, followed by one compact `牌局紀錄 · 7 鋪` row and collapsed Rules. Expanding exposed the unchanged East/South timeline and all seven accessible hand summaries; the final South hands flowed naturally into Rules. A second tap returned the page to the short collapsed state.

English `Hand history · 7 hands` and Simplified Chinese `牌局记录 · 7 铺` both remained on one line with a clear trailing disclosure. With the app's Large text setting, the Traditional Chinese title/count and `＋` stayed separated without clipping or collision. Language and text size were restored to Traditional Chinese and Default after QA, and the Simulator was returned to Home.

Captures remain outside Git:

- Default collapsed Dashboard: `/tmp/mahjong-phase2a3-dashboard-collapsed-zh-HK.png`
- Expanded timeline start: `/tmp/mahjong-phase2a3-history-expanded-zh-HK.png`
- Expanded final hands and Rules: `/tmp/mahjong-phase2a3-history-bottom-zh-HK.png`
- Collapsed again with Rules: `/tmp/mahjong-phase2a3-dashboard-recollapsed-zh-HK.png`
- English collapsed header: `/tmp/mahjong-phase2a3-dashboard-collapsed-en.png`
- Simplified Chinese collapsed header: `/tmp/mahjong-phase2a3-dashboard-collapsed-zh-CN.png`
- Traditional Chinese Large text disclosure: `/tmp/mahjong-phase2a3-dashboard-collapsed-large-zh-HK.png`

## Known limitations

React Native renderer tests can verify structure, state, content, section authority, and accessibility but not pixel-perfect wrapping. SectionList intentionally virtualizes long histories, so not every row is mounted simultaneously even though all section data remains scroll-accessible. Expansion state is screen-session only and is not persisted. Simulator coverage used a seven-hand fixture; 30-hand behaviour is covered structurally through the virtualized section data rather than by creating or modifying QA game data.

## Out of scope

No `LocalDashboardProjection`, canonical replay, HK scoring/settlement, SQLite/schema, lifecycle, correction/undo/reopen, History navigation, share payload, ranking/statistics, round-label authority, Cloud/Firestore/multiplayer, dependency, package-version, animation, or global-theme change is included.
