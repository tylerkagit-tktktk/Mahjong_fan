# Phase 2A.1 — Dashboard Simplification

## Product decision

Real-device review of Phase 2A on iPhone 17 / iOS 26.5 showed that the ended Dashboard still read like an accounting and filtering tool. Phase 2A.1 therefore simplifies only the local ended-game presentation. Phase 2A's visible settlement design is superseded by Phase 2A.1 after real-device visual review; replay and projection settlement data remain intact for other consumers.

## Result hierarchy

The final page order is:

1. native App Bar with back, centred match title, and trailing Share action;
2. result metadata hero;
3. player ranking;
4. compact game statistics;
5. chronological hand-history timeline; and
6. collapsed rules summary.

Share is no longer inside the hero or repeated in the footer. The App Bar uses the native iOS `square.and.arrow.up` symbol, with the existing screen-header fallback on other platforms. Its synchronous pending lock, cancellation handling, rejection Alert, and unmount guard are unchanged.

## Settlement and text sharing

The Dashboard no longer renders a settlement card or a no-settlement message. Text sharing likewise omits settlement headings and direction rows. The concise payload retains title/date, competition ranking, final balances, hands/draws, top self-draws, and top discards.

`LocalDashboardProjection.settlementDirections` is deliberately retained. No settlement engine, canonical replay, parity, persistence, or Cloud behaviour changes in this phase.

## Game statistics and hand history

The former Highlights heading is now Game stats / 牌局統計 / 牌局统计. The existing two-by-two values and tie/zero semantics remain unchanged.

The former interactive Hands area is now Hand history / 牌局紀錄 / 牌局记录. Filter chips, jump chips, partial-count labels, and collapsed wind controls are removed. The existing `SectionList` remains for long-history performance: all hands render chronologically, with wind sections as non-interactive visual headings.

Each timeline row prioritizes the event:

- self-draw: player, self-draw, fan;
- discard win: winner, discarder, fan;
- draw: draw plus dealer stays/passes.

The four-player delta ledger is removed from each row. A win may show only the winning player's existing projected delta as a low-weight secondary line; draws show no four-way zero values. Final balances remain authoritative in Ranking.

## Round-label authority

Replay's `roundAfterHand.nextRoundLabelZh` is explicitly a next-hand label. The Dashboard projection now derives each presentation-safe current-hand label from the state before that hand: the starting dealer for hand zero, then the preceding replay projection's next label. Legacy projection follows the equivalent pre-hand dealer state. Replay semantics are unchanged.

## Accessibility and localization

The App Bar Share action has a localized Share result label and exposes its pending disabled state. Ranking semantics and competition ties remain unchanged. Every timeline row exposes one complete round-plus-event accessibility summary, so VoiceOver does not need to assemble delta chips. Wind headings are intentionally non-interactive. Rules retain button role and expanded state.

Dashboard-only settlement, jump, and partial-count locale keys were removed after whole-repository usage checks. Filter labels remain because Cloud Archive still consumes them. Timeline copy and titles are complete in English, Traditional Chinese, and Simplified Chinese.

## Verification and known limitations

- Focused Dashboard, projection, and locale tests cover App Bar sharing, hierarchy, omitted settlement, concise share payload, shared ranks, chronological visibility, multi-wind grouping, self-draw/discard/draw summaries, stay/pass actions, explicit boundaries, legacy rendering, long names, large values, and accessibility.
- Full verification passed: 62 Jest suites and 339 tests passed, with one existing skip; ESLint, TypeScript, and `git diff --check` passed.
- The current Debug binary was built, installed, and loaded through Metro on iPhone 17 / iOS 26.5. The project again emitted an incomplete workspace product without `Info.plist`; installation used the valid current Xcode DerivedData product after its bundle ID and timestamps were checked. Existing third-party build warnings were unchanged.
- Visual QA used the existing safe ended fixture `Drudging` with seven hands. Captures covered the Dashboard top, statistics plus timeline start, and lower timeline plus collapsed Rules. Share stayed in the App Bar; Hero, Ranking, stats, seven chronological rows, 東/南 visual grouping, winner-only gains, dividers, Rules, scrolling, and safe areas rendered cleanly. No game data was created or changed, and QA-A was untouched.
- Simulator QA remained in Traditional Chinese at the existing text-size setting. English, Simplified Chinese, and larger Dynamic Type are covered structurally by locale/tests but remain useful manual visual follow-up.
- Cloud result presentation remains intentionally different and is a later checkpoint.

## Out of scope

No scoring, HK settlement, canonical replay, schema 303, SQLite, lifecycle, Cloud / Firestore, multiplayer, backup/import, image card/sharing, revision viewer, redo, dependency, package version, or navigation contract changes are included.
