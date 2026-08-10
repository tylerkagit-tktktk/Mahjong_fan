# Phase 2B-2 — Cloud Ended Result Canonical Integration and UI Parity

Date: 2026-08-10

Baseline: `0d52cfc feat(dev3): add cloud canonical replay foundation`

## Executive verdict

`CloudArchiveDetailScreen` now renders result truth from the Phase 2B-1 pure pipeline:

```text
SQLite CloudArchivePayload
  -> buildCloudCanonicalResult(unknown)
  -> strict source parse
  -> exact Cloud canonical adapter
  -> replayGameRecord()
  -> CloudCanonicalProjection
  -> ended-result presentation
```

The old screen-owned settlement, lineup fallback, dealer/round progression, totals, ranking, statistics and participant reducer has been removed. The screen now owns loading, safe errors, presentation, disclosures, sharing, accessibility, and the existing Cloud cleanup lifecycle only.

## Canonical production authority

The production screen passes the loaded local archive directly to `buildCloudCanonicalResult`. It does not import or call `computeHkSettlement`, tolerant `parseRules`, Cloud round/dealer helpers, or heuristic lineup lookup. It consumes:

- `projection.ranking` for competition-ranked final balances;
- `projection.statistics` for hand/draw counts and all tied leaders;
- `projection.hands` for canonical current-hand round, outcome identity, fan, draw action, effective seats and replay-derived winner gain;
- `projection.finalRound` for the result Hero's final next-hand state;
- `projection.rules` for the historical strict rules summary.

Phase 2B-1's pure hand projection was minimally extended with outcome presentation fields and `winnerGainQ`. Winner gain is selected inside the pure canonical projection from replay-derived deltas and the exact effective lineup, so the screen does not become a second result engine.

## Invalid and loading behavior

Archive loading remains one stable state until the local SQLite payload resolves and the synchronous canonical pipeline completes. The screen never renders a tolerant legacy result before replacing it with canonical output.

Archive read/not-found errors retain a separate back-only state. A loaded archive with `canonicalValid = false` receives the localized safe state:

```text
暫時無法確認牌局結果

部分牌局資料不完整，
為避免顯示錯誤分數，
暫時未能產生可靠結果。
```

No legacy fallback ranking, default rules, partial totals, raw diagnostic code, retry/re-sync mechanism, or repair path is shown. `legacy_unverified` remains internal metadata and does not produce a user-facing warning badge when canonical replay is valid.

## Ended-result hierarchy

The Cloud result now follows the frozen Local hierarchy:

```text
App Bar Share
Result Hero
Player Ranking
Game Stats
Hand History · N hands (collapsed)
Rules Summary (collapsed)
Cloud cleanup (secondary footer)
```

The visual implementation follows the existing Local spacing, typography, card, disclosure, long-name and trailing-amount conventions. No Local Dashboard code or rendered behavior was changed.

## Hero and date semantics

The Hero uses archive title metadata, canonical completed-hand count, and canonical final next-hand round state. Current-hand labels remain exclusive to timeline rows.

Cloud displays the most meaningful available completion timestamp:

```text
room.archiveReadyAt ?? archivedFromCloudAt
```

It does not pretend that this is the Local game's creation date, and no schema field is added.

## Ranking and historical participants

Ranking renders `projection.ranking` without screen sorting or `index + 1`. Equal totals use competition ranks (`1,1,3,4`), and all-zero games use `1,1,1,1`. Deterministic name/identity ordering within a tie remains the characterized domain behavior.

The list extends vertically for every identity that participated in a completed hand, including legitimate histories with more than four identities. It does not truncate to four and does not include an identity present only in a pending post-final lineup. Names ellipsize in ranking while balances remain visible and tabular.

Balances format the canonical quarter-unit total using the validated historical currency symbol. The screen only converts Q to display currency; it never recalculates hands.

## Statistics

The former dense per-player wins/zimo/discard table is removed. Cloud now shows the same compact 2x2 result summary as Local:

- hands;
- draws;
- most self-draws;
- most discards.

All tied leaders are displayed together with their count. A category whose maximum is zero displays `—`, not an invented player.

## Hand history

Hand history is one global 44-point disclosure on the page background and resets collapsed whenever an archive loads. A zero-hand result shows the canonical count and disables expansion. Expanded state supplies canonical wind sections to the existing `SectionList`; collapsed state supplies no sections. There is no persisted disclosure state or nested vertical scroll view.

Removed Cloud controls and density:

- All / Win / Draw filters;
- per-wind disclosure;
- partial counts;
- four-player delta chips;
- card-per-hand treatment.

Canonical source Hand 1 becomes canonical index 0 and displays `第 1 鋪` / `Hand 1`, fixing the former production `#2` defect without source-specific UI arithmetic.

Wind headings are quiet visual grouping only. Each row uses `projection.hands[].currentRound` and displays:

- zimo: winner, self-draw event, fan, and one right-aligned replay-derived winner gain;
- discard: winner, discarder, fan, and one right-aligned winner gain;
- draw: draw plus dealer stays/passes and no amount.

Long summaries use `flex: 1`, `minWidth: 0`, natural wrapping and a non-shrinking tabular amount. Large canonical amounts remain visible.

## Rules

Rules is a separate white card and defaults collapsed. Expanded content uses `projection.rules`, which already passed strict Phase 2B-1 parsing. The screen does not reparse `serializedRules` and cannot show default fallback values for malformed archives.

Traditional HK displays variant, currency, minimum fan, preset, gun mode, stake and cap. Custom HK displays its validated unit, multiplier summary and cap.

## Share

Cloud Share moved to the App Bar using the same native/cross-platform pattern as Local, including the plain iOS SF Symbol item and 44-point fallback control. The bottom full-width Share button is removed, leaving one visible entry point.

Share uses the same canonical projection as the screen and includes:

- room title and Cloud completion/archive date;
- competition-ranked balances;
- hands and draws;
- all tied top self-draw players;
- all tied top discard players.

It excludes hand history, deltas, settlement directions, rules and Cloud cleanup metadata. A synchronous ref blocks same-tick duplicate calls, native dismissal is normal, actual rejection shows the existing localized failure Alert, and unmount protection prevents a late state update.

## Accessibility and localization

The App Bar action has a localized Share-result label. Ranking rows expose rank/name/balance. History and Rules are buttons with explicit expanded/disabled state. Timeline rows expose one coherent localized round/event summary. The disclosure never relies on `＋` / `－` alone.

Shared Local result keys are reused for ranking, stats, history, rules, timeline events, dealer action and Share. Only the canonical-invalid title/body are new, with English, Traditional Chinese and Simplified Chinese translations.

## Cloud-only lifecycle content

Cloud archive-sync progress and host cleanup remain useful because they govern safe deletion of the remote archived room. They remain Cloud-specific and are moved after the complete shared result hierarchy. Raw room/version/source-trust/diagnostic metadata remains developer-only and is not rendered.

No cleanup repository, ordering, TTL, deletion, member subscription, or permission behavior changed.

## Test coverage

Production-realistic screen fixtures use one-based Cloud hand indexes and run through the actual parser/adapter/replay/projection path. Focused coverage includes:

- valid canonical integration and final Hero state;
- first source Hand 1 displaying as Hand 1;
- canonical-invalid timeline/rules with no fallback ranking;
- separate archive read failure;
- competition ties, all-zero ties and deterministic ordering;
- more than four historical participants and pending-player exclusion;
- hands/draws, all tied zimo/discard leaders and zero-leader behavior;
- default collapse, canonical total, expand/re-collapse, zero disabled state and wind grouping;
- zimo/discard/draw-stay/draw-pass event rows, winner-only amount and no draw amount;
- absence of filters, per-wind disclosure, delta grids and bottom Share;
- strict Rules collapse/expand;
- App Bar accessibility, canonical Share payload, synchronous guard, cancellation and rejection;
- long Firebase names, large amounts, flexible summary and non-shrinking amount styles;
- retained Local Dashboard and Phase 2B-1 domain regression suites.

## Simulator QA and limitation

The required **iPhone 17 / iOS 26.5** Simulator was booted. A read-only inspection of the installed app's `cloud_archives` table found no rows. The repository has no established safe development Cloud-archive fixture route, and Phase 2B-2 explicitly forbids creating/modifying real Cloud data or adding a permanent debug route solely for screenshots.

Visual Cloud screenshots therefore were not captured. Canonical integration, hierarchy, disclosure, long-name/large-amount layout contracts, accessibility and Share behavior were verified through the focused React Native renderer suite. QA-A and all Simulator game/archive data remained unchanged. Default/Large Dynamic Type visual confirmation remains a manual follow-up when a naturally created local Cloud archive is available.

## Deliberately unchanged and deferred

The following remain unchanged:

- `GameDashboardScreen` and Local result behavior;
- `MultiplayerGameTableScreen`, active hand submission, listeners, version conflicts, recovery, lineups and end flow;
- Firestore rules and ended/archive authority;
- archive payload format, SQLite schema/repository, archive writer, digest, TTL and cleanup architecture;
- temp-player Merge behavior and identity revision history;
- multiplayer correction, undo, replace, remove, revision and reopen behavior.

The next smallest product checkpoint should be a safe visual QA/release-hardening pass once a naturally generated canonical-valid local Cloud archive exists. Firestore/archive integrity and multiplayer correction remain separate architectural work and must not be folded into visual polish.
