# dev3.0 Phase 0B-1 — Replay Decisions and Characterization Contract

## Product theme

**可信牌局：可修正、可復原、可帶走** — internal theme: **Reliable Game Records**.

Phase 1 begins only after the existing local record behavior is characterized. It must not introduce a second interpretation of settlement, dealer progression, player identity, or result summaries.

## Replay engine responsibility

The future pure replay engine will accept storage-independent source input and return the canonical interpretation of the current effective timeline:

- validate structure, rules, player identity, chronology and stored settlement data;
- calculate per-hand settlement in quarter units (`Q`);
- derive player totals, dealer/round progression, next-hand round label, ranking, statistics and settlement directions;
- report stable validation issues rather than repository/Firebase-specific errors;
- never write SQLite, Firestore, React state, translations, or UI strings.

Existing behavior references: `src/domain/hk/settlement.ts`, `src/models/dealer.ts`, `src/models/seatRotation.ts`, `src/models/gameStats.ts`, and `src/db/repo.ts:646-818`.

## Canonical input contract

`src/domain/gameRecord/types.ts` defines the contract without importing React Native, SQLite, Firebase, database rows, or Firestore documents.

`CanonicalGameRecordSnapshot` contains:

- HK rules snapshot (`CanonicalHkRules`) or an opaque unsupported/corrupt rule representation;
- `CanonicalPlayer` identities without seat ownership;
- initial seat assignments separated from player identity;
- `startingDealerSeatIndex`, including for an empty timeline so first/next dealer state is derivable;
- ordered `CanonicalTimelineEntry` values;
- lifecycle state.

`CanonicalTimelineEntry` is either:

- `CanonicalHandInput`: `zimo`, `discard`, or `draw`; with fan, winner/discarder identity, draw stay/pass, persisted source deltas, dealer seat and stable hand index; or
- `CanonicalSeatBoundary`: an explicit effective-from-hand seat/lineup mapping.

This is intentionally HK-only. It has no tile recognition, fan-name fields, TW/PMA-specific data, UI copy, backup format, or arbitrary-history edit API.

## Replay output contract

`ReplayResult` must preserve both source and derived data:

- `source`: untouched canonical input;
- per-hand `ReplayHandProjection`: effective seats, derived deltas, next-hand round projection and issues;
- per-player `ReplayPlayerProjection`: total `Q`, wins, zimo and discard counts;
- final `ReplayRoundProjection`: dealer state and `nextRoundLabelZh`;
- `ReplayStatistics`;
- stable validation issues at hand and record level.

`ReplayRoundProjection.nextRoundLabelZh` always means the **next** hand. This matches `getRoundLabel` and the current `games.currentRoundLabelZh` update in `src/db/repo.ts:745-763`.

## Stable validation categories

The future engine returns these storage-independent `ReplayValidationCode` values:

- `INVALID_PLAYER_COUNT`
- `DUPLICATE_PLAYER_IDENTITY`
- `DUPLICATE_SEAT_IDENTITY`
- `INVALID_HAND_INDEX`
- `NON_SEQUENTIAL_HAND_INDEX`
- `UNKNOWN_WINNER`
- `UNKNOWN_DISCARDER`
- `WINNER_EQUALS_DISCARDER`
- `INVALID_FAN_VALUE`
- `BELOW_MINIMUM_FAN`
- `INVALID_DRAW_ACTION`
- `NON_ZERO_SUM_SETTLEMENT`
- `MALFORMED_STORED_DELTAS`
- `INVALID_SEAT_BOUNDARY`
- `STORED_SETTLEMENT_MISMATCH`
- `DEALER_STATE_MISMATCH`
- `HAND_AFTER_TERMINAL_LIFECYCLE`
- `CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT`
- `UNSUPPORTED_RULE_VARIANT`
- `CORRUPTED_RULES_SNAPSHOT`

Phase 1A implements the replay-core categories through `DEALER_STATE_MISMATCH`. `HAND_AFTER_TERMINAL_LIFECYCLE` and `CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT` remain mutation/repository-layer reserved codes.

## Local last-hand correction rules

- Only `active` local games may replace or remove the last hand.
- The target must be the last effective timeline event. A later reseat/seat boundary makes correction ineligible; no automatic identity rollback is allowed.
- Replace retains the final hand index. Remove decreases effective hand count by one.
- Arbitrary historical editing, middle insertion and redo are out of scope.
- Any later implementation must derive all affected values through canonical replay and commit the mutation atomically.

## Local reopen lifecycle

- `ended` may become `active` only through explicit user action.
- Reopen invalidates the old `resultSummaryJson`/result snapshot before correction.
- The user must manually end the game again after correction.
- `abandoned` cannot reopen in 3.0.
- A zero-hand end remains `abandoned` under current behavior (`src/db/repo.ts:1423-1456`), so it has no correction/reopen path.

## Multiplayer correction policy

- Only the host may replace or remove the last hand.
- Correction is allowed only when room status is `active`.
- No player vote is required.
- `ended` and `archived` rooms cannot reopen or correct.
- The current policy remains: any active member may end a room (`src/services/cloud/roomRepo.ts:596-605`, `firestore.rules:102-108`). End authority and correction authority are separate.
- This checkpoint changes no Cloud model, transaction, listener, or rule.

## Revision and audit model

Future Cloud correction uses **current effective timeline + immutable revision log**.

`RevisionRecord` defines the required logical fields:

- action: `replace` or `remove`;
- target hand ID/index;
- before snapshot;
- after snapshot (`null` for remove);
- editor identity/time;
- base and resulting server mutation versions;
- optional reason.

The eventual Firestore document placement is intentionally not decided here. The current `HandLog` only retains `submittedByUid`; it has no revision fields (`src/models/cloud.ts`, `src/services/cloud/handRepo.ts:47-53`).

## Version versus hand-index semantics

For future multiplayer correction:

- `currentVersion` is a monotonically increasing mutation version.
- `currentHandIndex` is the final effective hand index, independent from mutation version.
- Replace: increment `currentVersion`; keep `currentHandIndex`.
- Remove: increment `currentVersion`; decrement `currentHandIndex`.
- Revision records retain the original target index even when later remove changes current index.

## Reseat and lineup boundary rule

A hand is correctable only if no later effective timeline event exists. Seat rotation/reseat/lineup changes are first-class effective events in the canonical contract. If one occurs after the candidate hand, correction is rejected with `CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT`.

The current local representation infers player remapping at completed wind cycles from `nextRoundLabelZh` (`src/models/seatRotation.ts:35-69`); the canonical contract makes a future explicit boundary possible without changing present behavior.

## SQLite version 300/reset policy

Future schema policy:

- fresh 3.0 DB: initialize schema, then set `PRAGMA user_version = 300`;
- `user_version = 0` with legacy 2.1 tables: TestFlight policy permits an explicit rebuild/reset; no 2.1 test data migration is required;
- `user_version > 300`: safely refuse; never downgrade or automatically clear;
- this checkpoint does not add `PRAGMA user_version`, reset code, or schema changes.

The integration hook is `initializeSchema` in `src/db/schema.ts`, reached through `openDb` in `src/db/sqlite.ts`.

## Schema Version 300 Implementation Outcome

- `src/db/schema.ts` now exports `CURRENT_SCHEMA_VERSION = 300`, the storage-layer typed errors `UnsupportedOlderSchemaVersionError`, `ForwardSchemaVersionError`, and `SchemaInitializationError`, plus the explicit app-owned object manifest.
- The owned SQLite objects are tables `games`, `players`, `hands`, `cloud_archives`; indexes `idx_hands_game_handIndex`, `idx_games_createdAt`, `idx_players_game`, `idx_cloud_archives_createdAt`, `idx_games_endedAt`, `idx_games_resultStatus`; there are currently no app-owned triggers or views.
- Initialization reads `PRAGMA user_version` before any destructive work. Version `0` with an owned table logs a clearly labelled pre-launch TestFlight warning, drops only the hard-coded owned objects in a transaction, recreates/verifies the schema, then stamps `300` last. Version `0` without owned tables is fresh and is created/stamped without a reset.
- Version `300` performs idempotent create/column/index verification without deleting rows or restamping. Versions `1...299` reject with the older-version error; versions above `300` reject with the forward-version error. Neither branch drops, creates, backfills, or changes the version.
- Create, defensive columns, backfill, indexes, and required-table verification run before the version stamp. A failure rolls back the schema transaction, leaves an unversioned DB at a non-300 version, and `src/db/sqlite.ts` leaves `schemaReady` false so the same open connection can retry. Typed schema errors pass through the database wrapper rather than becoming a generic UI-facing error.
- `__tests__/db/schema.version300.test.ts` uses a real temporary SQLite database to cover fresh, legacy reset, current/idempotent, older, forward, failure/retry, system-table detection, WAL and foreign-key setup. The adapter is test-only at `test-support/sqlite/actualSqliteDatabase.ts`.
- This destructive reset is a **pre-launch TestFlight-only** policy. After formal launch, automatic destructive reset must not be used as a general migration strategy; supported upgrades require an explicit non-destructive migration decision.

## Legacy Route Removal Outcome

- Removed the unreferenced `AddHand` and `Summary` routes from `src/navigation/RootNavigator.tsx` and `src/navigation/types.ts`, and deleted `src/screens/AddHandScreen.tsx` and `src/screens/SummaryScreen.tsx`.
- The full source search covered route registration/types, `navigate`/`replace`/`push`, deep links, startup recovery, local takeover, History, tests/mocks, dynamic imports, and barrel-style exports. No in-repo runtime caller or external route mapping was found; the only production references were the legacy screen registrations/types and the screens themselves.
- Removed only locale keys used exclusively by the deleted screens (`nav.addHand`, `nav.summary`, `summary.title`, `summary.ended`, `summary.overview`, and AddHand-only input/realtime/share/type keys) consistently from all three locale files. Shared `addHand.*` labels and `errors.addHand` remain because formal `GameTableScreen`, `MultiplayerGameTableScreen`, and reseat/error flows still use them.
- The formal replacements remain `GameTableScreen` for hand entry and `GameDashboardScreen` for ended-game detail. `History` continues to open `GameDashboard`; `JoinInvite` deep linking and the multiplayer/cloud routes are unchanged.
- `__tests__/navigation/rootRoutes.test.ts` verifies that the two legacy routes are absent while Home, NewGameStepper, GameTable, GameDashboard, History, JoinInvite, RoomLobby, MultiplayerGameTable, and CloudArchiveDetail remain registered. No unresolved in-repo caller risk remains; external URLs or automation outside the repository cannot be proven by static search.

## Phase 1A Replay Engine Outcome

- `src/domain/gameRecord/replay.ts` now exports pure, deterministic `replayGameRecord(input, options)`. It has no React Native, SQLite, Firebase, storage, clock, random, network, translation, or UI dependency. `src/domain/gameRecord/types.ts` adds the minimum required starting dealer input plus derived dealer, ranking, settlement-direction, validity, final-seat, and storage-independent summary projections.
- Canonical hand indexes are now enforced as zero-based contiguous `0..n-1`. Seat boundaries are applied before `effectiveFromHandIndex`, may target `0` or `handCount`, preserve dealer/round/totals, and are rejected when mappings conflict or source placement contradicts effective timeline order.
- Replay validates record structure first, then timeline structure, then replays once in order. It reuses `computeHkSettlement`, `getNextDealerSeatIndex`, and `getRoundLabelFromDealerState`; the latter is a behavior-preserving pure extraction from `src/models/dealer.ts` to keep replay O(n).
- Persisted deltas and source dealer fields are diagnostics only. Derived settlement, derived dealer, player identity totals, ranking, statistics, and directions are canonical. Valid stored data is compared for `STORED_SETTLEMENT_MISMATCH`; malformed/non-zero-sum source deltas report their own stable codes without replacing derived values. Any issue makes `isValid` false and suppresses the persistence-ready `summary`.
- Implemented replay-core validation codes: `INVALID_PLAYER_COUNT`, `DUPLICATE_PLAYER_IDENTITY`, `DUPLICATE_SEAT_IDENTITY`, `INVALID_HAND_INDEX`, `NON_SEQUENTIAL_HAND_INDEX`, `UNKNOWN_WINNER`, `UNKNOWN_DISCARDER`, `WINNER_EQUALS_DISCARDER`, `INVALID_FAN_VALUE`, `BELOW_MINIMUM_FAN`, `INVALID_DRAW_ACTION`, `MALFORMED_STORED_DELTAS`, `NON_ZERO_SUM_SETTLEMENT`, `STORED_SETTLEMENT_MISMATCH`, `DEALER_STATE_MISMATCH`, `INVALID_SEAT_BOUNDARY`, `UNSUPPORTED_RULE_VARIANT`, and `CORRUPTED_RULES_SNAPSHOT`. `HAND_AFTER_TERMINAL_LIFECYCLE` and `CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT` remain reserved for the future mutation layer.
- `__tests__/domain/gameRecord/replay.test.ts` covers existing golden settlement fixtures, dealer/wind/draw progression, explicit reseat identity totals, ended ranking/statistics/raw-summary parity, all-draw and 128-hand timelines, invalid/corrupt inputs, mismatch diagnostics, determinism, and input immutability.
- Contract gap resolved: the previous snapshot could not derive an empty game or non-East starting dealer, so `startingDealerSeatIndex` is now required. A Phase 1B local adapter must also make the existing implicit wind-wrap rotation explicit as canonical boundaries. Some legacy fixture rows intentionally demonstrate why source deltas cannot be authoritative when they disagree with their rule snapshot; adapters must surface that as a mismatch instead of silently preserving it.
- This checkpoint does not call replay from repositories, GameTable, GameDashboard, Cloud, archive, SQLite, or Firestore. Phase 1B remains responsible for read-only local adapter/parity integration.

## Characterization fixtures

`test-support/gameRecord/fixtures.ts` is deterministic: fixed IDs, players and timestamps only. It records the following existing 2.1 scenarios:

1. empty game;
2. dealer zimo/stay;
3. non-dealer win/advance through dealer helper assertions;
4. half-gun discard;
5. full-gun discard;
6. draw stay;
7. draw pass;
8. four dealer advances into the next wind;
9. four-player zero-sum cumulative totals;
10. existing wind-cycle seat rotation identity mapping;
11. custom unit-per-fan with cap;
12. minimum-fan boundary;
13. 13-fan normalization and cap-ten behavior;
14. all-draw timeline;
15. ended ranking/statistics/result summary;
16. malformed non-zero-sum stored deltas as future rejection input.

`buildGameResultSummarySnapshot` was minimally extracted from `updateGameResultSnapshot` in `src/db/repo.ts`. It is a pure export of the identical existing calculation, used by the existing writer and characterization test; it does not change runtime output or persistence behavior.

## Phase 1 acceptance matrix

| Area | Existing source of truth | Phase 1 canonical output | Parity requirement |
| --- | --- | --- | --- |
| Settlement | `src/domain/hk/settlement.ts` | Per-hand deltas `Q` | Exact |
| Dealer | `src/models/dealer.ts` | Next dealer | Exact |
| Round label | `getRoundLabel` | Next-hand label | Exact |
| Totals | `aggregatePlayerTotalsQByTimeline` | Player totals `Q` | Exact |
| Stats | `computeGameStats` | Canonical stats | Exact |
| Reseat | Seat rotation timeline helpers | Identity totals | Exact |
| Result snapshot | `buildGameResultSummarySnapshot` / end-game writer | Cacheable summary | Exact |
| Cloud lineup | Multiplayer screen timeline loop | Canonical adapter output | Deferred, contract-defined |

Phase 1 must not begin undo UI until all of the following are true:

1. golden fixtures pass;
2. canonical replay has local parity with existing behavior;
3. corruption cases return stable codes;
4. repository mutation can roll back transactionally;
5. Cloud adapter semantics are specified.

## Explicitly out of scope

- replay implementation (completed in Phase 1A);
- undo/replace/remove repository functions or UI;
- arbitrary historical edits, middle insertion, redo;
- Firestore model/rules/transaction/listener changes;
- Cloud room reopening;
- TW/PMA support;
- tile/fan recognition;
- backup format and UI;
- AddHand/Summary removal (completed in Phase 0B-3);
- startup recovery/History UX changes.

## Current behavior ambiguities retained for Phase 1

1. Current local seat rotation aggregation infers a rotation after a North-to-East round-label wrap; it does not persist a first-class local seat-boundary event. Phase 1 must preserve parity before deciding whether to persist boundaries.
2. The existing `buildGameResultSummarySnapshot` is exact for ended bundles but the repository keeps its result cache separately. Reopen/mutation invalidation is a Phase 1 repository concern.
3. Cloud hand indexes start at 1 while local `hands.handIndex` starts at 0. The canonical adapter must normalize this explicitly; this type contract intentionally does not choose the adapter conversion.
