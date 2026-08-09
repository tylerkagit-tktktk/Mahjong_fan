# Phase 2A — Ended Dashboard Result UX Polish

## Scope

Phase 2A improves the local, ended-game Dashboard as a read-only result surface. It does not change replay, scoring, persistence, schema, Cloud / Firestore, multiplayer, navigation, or lifecycle policy. The existing untracked feature inventory remains outside this work.

## Result-first hierarchy

The Dashboard now presents, in order:

1. final result header with its single Share action;
2. player ranking;
3. settlement directions;
4. compact result highlights;
5. existing wind-grouped hand history; and
6. collapsed rules / game information.

The former footer Share action is removed. Hand history remains the existing filtered, jumpable, collapsed-by-default SectionList; this phase only changes its relative weight in the page.

## Single presentation authority

`buildLocalDashboardProjection` remains the sole selected presentation source for both canonical replays and legacy fallbacks. Dashboard rendering and its text-share payload consume that one selected projection. They do not reread SQLite, recalculate totals, invoke HK settlement, or calculate a second result.

Canonical directions continue to come directly from replay. Legacy rows did not previously carry directions, so the final-balance transfer allocation formerly embedded in Dashboard sharing now belongs to the legacy projection. Consequently the visible settlement card and text share use the same direction list in both paths.

## Ranking, settlement, and highlights

`dashboardResultPresentation.ts` supplies deterministic competition ranking: equal final balances share a rank, and the next rank skips by the tied positions (`1, 1, 3, 4`). Names and stable player IDs only break display order; they never change the shared rank. An all-zero table is therefore four-way rank 1.

The settlement card appears immediately after ranking. It renders payer, receiver, and amount from projection directions; an empty direction list means only that no settlement is needed, not that a real-world payment was completed.

The compact two-by-two highlights contain only existing data: hands played, draws, top self-draws, and top discards. Tied leaders are all shown; an all-zero leader count is rendered as `—` rather than inventing a winner.

## Text sharing and accessibility

Native text sharing is retained. Its concise payload is game title/date, result ranking, settlement, hands/draws, and the two top highlights. Detailed per-player wins/self-draw/discard lines, rules, and hand-by-hand history are excluded.

Sharing has both a disabled visual state and a synchronous pending lock, so duplicate taps cannot start two native share calls. Native cancellation is treated as the normal resolved result; an actual rejection shows a localized Alert. The unmount guard prevents a late completion from setting screen state.

Ranking rows expose rank, player name, and final balance to assistive technology. Settlement rows expose payer, receiver, and amount. Hand-history and rules toggles expose button roles plus their expanded state. Long player names may truncate visually while the balance remains fixed-width and the full name remains available in accessibility text.

## Verification

- Focused helper, projection, Dashboard, and locale coverage verifies shared ranks (including all-zero and three-way ties), tied/zero highlights, selected-projection settlement, concise sharing, rejection feedback, pending double taps, and expanded-state accessibility.
- The iPhone 17 / iOS 26.5 Debug build was installed and cold-launched successfully. The first workspace build-output path was an incomplete bundle without `Info.plist` / bundle ID, so installation used the valid current Xcode DerivedData product. No screenshot or image capture was taken.
- The current Simulator accessibility bridge exposes the app home but no actionable History navigation, and there is no separately safe ended-game fixture exposed for inspection. QA-A is retained unchanged; no game was created, recorded, ended, or shared. Focused UI coverage remains the verification for the ended Dashboard ordering and interactive states.

## Follow-up

Manual device review remains useful for Dynamic Type and English/Simplified Chinese wrapping. Image result cards, Cloud result presentation, revision history, and any new statistics remain out of scope.
