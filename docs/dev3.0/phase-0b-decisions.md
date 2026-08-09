# dev3.0 Phase 0B-1 — Replay Decisions and Characterization Contract

## Product theme

**可信牌局：可修正、可追溯、可分享** — internal theme: **Reliable Game Records**.

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

## Local terminal lifecycle

- This section was superseded by Phase 1I: local `ended` and `abandoned` games are permanently terminal and cannot become `active` again.
- A zero-hand end remains `abandoned`, and both terminal states have no recording, correction, undo, or reopen path.

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

## SQLite version 300 foundation/reset policy (historical)

Future schema policy:

- the Phase 0B foundation schema was version `300`; Phase 1C added `301`, Phase 1E added `302`, and Phase 1F supersedes them with current schema `303`;
- `user_version = 0` with legacy 2.1 tables: TestFlight policy permits an explicit rebuild/reset; no 2.1 test data migration is required;
- a version newer than the supported current schema is safely refused; never downgrade or automatically clear;
- this checkpoint does not add `PRAGMA user_version`, reset code, or schema changes.

The integration hook is `initializeSchema` in `src/db/schema.ts`, reached through `openDb` in `src/db/sqlite.ts`.

## Schema Version 300 Foundation Outcome (historical)

- The foundation introduced the typed errors `UnsupportedOlderSchemaVersionError`, `ForwardSchemaVersionError`, and `SchemaInitializationError`, plus the explicit app-owned object manifest. Current schema version is now `303`; versions `300`, `301`, and `302` are supported non-destructive migration sources.
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

## Phase 1B Local Adapter Outcome

Phase 1B adds a read-only bridge from the current local `GameBundle` to the Phase 1A contract:

- `src/domain/gameRecord/localAdapter.ts` exports `adaptLocalGameBundle(bundle)`. It is pure and storage-independent: no SQLite query, write, React/React Native, Firebase, clock, random value, console output, or UI copy.
- `src/domain/gameRecord/localParity.ts` exports `compareLocalReplayParity(bundle, replay)`. It compares current local projections with canonical replay and returns item-level `exact`, `mismatch`, or `notComparable` results rather than a boolean.
- `src/services/localGameReplay.ts` exports `replayLocalGameBundle(bundle)` and the unused-by-production `loadAndReplayLocalGame(gameId)` read entrypoint. The latter delegates loading to `getGameBundle`; it does not duplicate SQL, reconcile, update result snapshots, or scan games.

### Local mapping decisions

- `Game.players[].id` is the permanent canonical identity and `name` becomes `displayName`. The current stored `seatIndex` values become the initial/base seat assignment; identity and seat are never merged into one canonical player field.
- Local `hands[].handIndex` is already canonical zero-based. The adapter sorts a copied hand array for deterministic output and rejects duplicates, gaps, negative values, or non-zero-based indexes; it never adds or subtracts one.
- `winnerPlayerId` and `discarderPlayerId` are copied as identity fields. `winnerSeatIndex` is retained only as a source consistency constraint: if it does not point to the stored winner identity under the inferred historical mapping, the adapter returns `AMBIGUOUS_SEAT_ROTATION_HISTORY` and `ok: false` rather than guessing.
- Rules JSON is parsed strictly. Only local HK `RulesV1` with `traditionalFan`/`customTable`, supported half/full gun modes, supported stake presets, explicit minimum fan, unit-per-fan, cap and currency symbol is normalized. The adapter does not call fallback-based `parseRules`, infer missing values, or open TW/PMA.
- `computedJson.settlementType`, `fan`, and explicit draw `dealerAction` provide the hand input. `createdAt` is source metadata only. Stored deltas are parsed as source evidence and passed to replay for validation; they never replace derived settlement.

### Implicit rotation boundary algorithm

The current local model does not persist a historical reseat/boundary event. To preserve `aggregatePlayerTotalsQByTimeline` exactly, the adapter starts with the current stored player seat mapping and offset `0`, then scans copied hands in canonical order:

1. Use the previous next-hand label, initially `東風東局`.
2. When the current hand's `nextRoundLabelZh` changes from `北風…` to `東風…`, increment the inferred offset after that hand.
3. Emit one `CanonicalSeatBoundary` with `effectiveFromHandIndex = handIndex + 1`, using the rotated identity mapping. A final wind wrap therefore emits a boundary at `handCount`; no dealer, wind, round, or total is reset.
4. Never emit a second boundary for the same effective hand index.

`game.seatRotationOffset` is retained as current-state source metadata only. It is not treated as proof of historical boundaries because a manual reseat resets it and the database has no event history. A mismatch between the stored winner identity/effective seat and the label-derived mapping is therefore non-authoritative instead of being repaired. The final current-seat mapping is an informational parity item, not a required proof of historical identity.

### Adapter diagnostics

Diagnostics are deterministic, storage-specific records with `code`, `severity`, `gameId`, optional `handIndex`, `sourceField`, and stable detail data. They contain no translated messages. The implemented coverage includes:

- `MALFORMED_RULES_JSON`, `UNSUPPORTED_LOCAL_RULE_VARIANT`, `CORRUPTED_RULES_SNAPSHOT`;
- `MISSING_STARTING_DEALER`, `INVALID_STARTING_DEALER`, `INVALID_LOCAL_PLAYER`, `DUPLICATE_LOCAL_PLAYER`, `DUPLICATE_LOCAL_SEAT`;
- `INVALID_LOCAL_HAND`, `DUPLICATE_HAND_INDEX`, `NON_CONTIGUOUS_HAND_INDEX`, `MALFORMED_HAND_INPUT_JSON`, `MALFORMED_DELTA_JSON`, `MISSING_HAND_PLAYER_IDENTITY`;
- `AMBIGUOUS_SEAT_ROTATION_HISTORY`, `PERSISTED_HANDS_COUNT_MISMATCH`, `PERSISTED_CURRENT_ROUND_LABEL_MISMATCH`, `MALFORMED_RESULT_SUMMARY_JSON`, and `PERSISTED_RESULT_SUMMARY_MISMATCH`;
- `CURRENT_SEAT_ROTATION_OFFSET_SOURCE_ONLY` as an informational note when the current offset cannot be proven to be historical evidence.

Structural/rules/identity ambiguity returns `ok: false` with no snapshot. Stale persisted count, label, or result cache data can still be replayed for diagnostics, but prevents an authoritative result.

### Parity and authoritative policy

Required parity items compare:

- hand count and every zero-based hand index;
- persisted delta versus replay-derived delta per hand;
- player totals `Q`, ranking, wins, zimo count, discard count and draw count;
- next dealer, current next-hand round label and zero-sum totals;
- ended result summary structure, including source-cache versus existing local projection and existing local projection versus replay.

Informational items report settlement directions, final effective seat mapping, and rules normalization. Stored `winnerText`/`loserText` are intentionally not copied into the report because they are UI-formatted; numeric/identity summary fields are compared instead. The report exposes `requiredStatus`, `informationalStatus`, overall `status`, and all item records.

`authoritative` is true only when the adapter is `ok`, all adapter diagnostics are informational, replay `isValid` is true, and every required parity item is `exact`. A legacy row with a valid stored delta shape but a rules mismatch therefore remains source-preserved, produces `STORED_SETTLEMENT_MISMATCH`, marks the delta parity item `mismatch`, and cannot be used as an authoritative projection. No SQLite summary or source row is changed.

### Read-only repository verification and restrictions

`__tests__/services/localGameReplay.test.ts` uses `ActualSqliteDatabase` and the real repository write/read path only to construct a temporary local game. It then loads the bundle through `getGameBundle`, runs adapter/replay/parity, and asserts games, players and hands rows are byte-for-byte equal before and after the read. Missing games return `LocalGameReplayReadError('NOT_FOUND')`; schema initialization errors continue to pass through as the existing typed schema errors.

`GameTableScreen`, `GameDashboardScreen`, `HistoryScreen`, `endGame`, result snapshot writes, Firestore, Cloud adapters, navigation, undo, replace, remove, reopen and startup reconciliation remain outside the Phase 1B read-only projection path.

### Local data limitations carried into Phase 1C

- SQLite has no first-class historical reseat event. A manual reseat cannot be uniquely reconstructed when stored identity/seat constraints do not expose the change; the adapter reports ambiguity instead of fabricating a boundary.
- Legacy winning rows without a strict `fan` source or draw rows without explicit `dealerAction` cannot safely be converted. They remain readable by existing production code but are not authoritative under this adapter.
- Persisted `handsCount`, `currentRoundLabelZh`, and ended result summary are caches. Stale values are surfaced as diagnostics; no repair or rewrite is attempted.
- Phase 1C now persists confirmed local boundaries and flags old rows; screen/statistics projection replacement remains out of scope.

## Phase 1C Persisted Local Boundary Outcome

- Phase 1C introduced schema `301`: fresh databases at that checkpoint created `game_seat_boundaries`, the `idx_game_seat_boundaries_game_effective` index, `games.seatBoundaryHistoryMode`, and `games.initialSeatMappingJson`. Phase 1E added hand revisions at `302`; Phase 1F extends the owned-object manifest to current schema `303`. Legacy reset still drops only hard-coded app-owned objects and preserves unknown/system SQLite objects.
- `300 → 301` is a dedicated non-destructive transaction: it adds the two game columns, creates/verifies the boundary table/index, backfills every existing game as `legacy_inferred`, then writes `PRAGMA user_version = 301` last. Games, players, hands, cloud archives, and unknown objects are retained. A failure rolls back columns/table/index/version so the same database can retry.
- A new local game is explicitly marked `explicit` and saves an immutable initial identity→seat baseline in `games`. A boundary row stores a complete canonical seat→player-ID mapping, `effectiveFromHandIndex`, `confirmed_reseat`, and creation time. The baseline is required because the existing confirmed reseat flow updates `players.seatIndex`; without it, pre-reseat identity mapping cannot be reconstructed.
- `updateGamePlayerSeats` is the confirmed local reseat transaction. It checks the game is mutable, verifies persisted versus actual hand count and four unique player identities/seats, updates player seats and offset, then inserts/upserts the one pending `(gameId, handsCount)` boundary. Any failure rolls back player seats, offset, and boundary. A second confirmation before another hand safely replaces that pending mapping; normal `insertHand`, cancellation, and the North→East prompt alone do not write a boundary.
- The adapter uses only persisted boundaries for `explicit` games. It validates complete mappings, player ownership, indexes, duplicate boundaries, reason, and the original baseline; it never scans a North→East label to fill an explicit gap. Relevant stable diagnostics are `MALFORMED_PERSISTED_SEAT_BOUNDARY`, `DUPLICATE_PERSISTED_SEAT_BOUNDARY`, `INVALID_PERSISTED_SEAT_BOUNDARY_INDEX`, `UNKNOWN_BOUNDARY_PLAYER`, `INCOMPLETE_BOUNDARY_MAPPING`, and `MISSING_EXPLICIT_BOUNDARY_HISTORY`.
- Migrated `legacy_inferred` games retain the Phase 1B label-inference compatibility path without database writes or silent upgrades. They emit informational `LEGACY_INFERRED_BOUNDARY_HISTORY`; any replay that actually relies on an inferred boundary is not authoritative, even if required parity is otherwise exact. Persisted confirmations after migration can be used where present, but they cannot prove earlier missing history.
- Parity now attributes stored deltas using explicit boundary mappings, including a final boundary at `handCount`, and compares the persisted final mapping with replay. Read-only replay continues to write nothing. Phase 1C production behavior was limited to fresh-game history mode, confirmed reseat persistence, and safe 300→301 migration; the later Phase 1E repository mutation capability is recorded below. Dashboard/GameTable projection, scoring semantics, reopen, Firestore/Cloud, navigation, and UI copy remain unchanged.
- Real SQLite coverage in `__tests__/db/schema.version300.test.ts` covers fresh/current/legacy reset, 300/301/302 preservation and migration, migration rollback/retry, 299/304 rejection, boundary/revision objects, cascade, WAL/foreign keys, and unknown/system preservation. `__tests__/db/repo.seatBoundaries.test.ts` covers explicit creation, confirmed write/upsert, ordinary hand non-write, invalid/terminal guards, transaction rollback, and cascade. Adapter/service tests cover explicit persisted boundaries, end-of-timeline boundaries, legacy compatibility, no explicit fallback inference, malformed boundaries, deterministic input, and read-only replay.

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

## Phase 1D Dashboard Canonical Read Projection

`src/domain/gameRecord/localDashboardProjection.ts` is the single presentation-neutral selector for the local finished-game Dashboard. It accepts the already-loaded `GameBundle` and the read-only `LocalGameReplayResult`, returns exactly one immutable-shaped `LocalDashboardProjection`, and never invokes SQLite, repository writers, or UI APIs.

- The selector chooses `canonical` only where `gameState === 'ended'`, the local replay is valid, parity is exact, and `authoritative === true`. It exposes canonical player totals/ranking, statistics, final seats, effective per-hand seats, outcome/fan/dealer action, rule summary, and replay settlement directions.
- Every other row remains `legacy`, with the previous `computeGameStats` / progressive round-label presentation behaviour. The result carries a stable reason: `NOT_DASHBOARD_LIFECYCLE`, `ADAPTER_NOT_OK`, `REPLAY_INVALID`, `PARITY_MISMATCH`, `LEGACY_INFERRED_HISTORY`, or `NOT_AUTHORITATIVE`. There is no user-visible source badge.
- `GameDashboardScreen` reads the bundle once, computes the replay once from that in-memory bundle, and renders/filter/groups/ranks from the selected projection only. Its canonical share payload uses the canonical settlement directions; its legacy share payload keeps the prior net-final-total formatting. A repository read error remains an error screen and is never converted into a legacy dashboard.
- Phase 1C summary parity now attributes stored totals using persisted explicit boundaries before comparing the result summary. This makes an explicit boundary at `effectiveFromHandIndex === handsCount` valid: it changes the final current-seat mapping while leaving all prior hands untouched. Legacy-inferred aggregation is retained unchanged.
- Tests cover authoritative explicit canonical projection, final-boundary attribution, non-authoritative and active fallbacks, immutable input, canonical Dashboard rendering/single read, and repository-read failure. Existing Dashboard and replay characterization coverage remains the legacy compatibility check.

This phase is read-only. It does not change `GameTableScreen`, hand/result writes, `endGame`, database schema/migrations, Firestore/cloud/multiplayer, navigation contracts, or undo/replace/remove/reopen flows. Phase 1E remains responsible for any mutation and recovery work.

## Phase 1E Local Last-Hand Mutation Outcome

- At the Phase 1E checkpoint the local schema was `302`: `300` remained the replay foundation source, `301` added explicit seat boundaries, and `302` added immutable local hand-revision storage. Phase 1F supersedes this with `303`; every migration verifies its objects before its version stamp, and failures roll back with the prior version and rows intact.
- `game_hand_revisions` is app-owned and cascades with its game. It has a per-game monotonic `revisionIndex`, action (`replace` or `remove`), immutable target identity, versioned `beforeHandJson` / optional `afterHandJson`, `local_user` actor type, nullable actor ID, optional reason, and creation time. `LocalHandRevisionSnapshotV1` stores the complete raw persisted `Hand`; malformed stored snapshots are rejected by `getGameHandRevisions` rather than ignored.
- `planLocalLastHandMutation` is a pure, deterministic planner. It accepts only stale-target guards plus replacement intent (outcome, fan, winner/discarder identity, or draw action), adapts/replays the current bundle, requires current authoritative parity, creates a prospective canonical timeline, and derives the replacement row, deltas, dealer snapshot, labels and game cache. It neither reads/writes SQLite nor allocates production IDs/timestamps.
- `replaceLastHand` and `removeLastHand` acquire the existing write lock and use `BEGIN IMMEDIATE`. Inside that transaction they reload game/players/hands/boundaries, re-run the planner, update/delete only the current last hand, invalidate active-game result cache fields, and insert the revision record before committing. Any planner, SQL, serialization, revision-index, or commit failure rolls back all affected rows.
- The typed guard results distinguish inactive/no-hand/stale/count-mismatch/later-boundary/non-authoritative/invalid-input/prospective-replay failures. A boundary at the old `handsCount` is a later effective event and blocks correction; one effective at the target hand starts before that hand and is retained. Ended/abandoned reopening, arbitrary history edits, redo, UI wiring, revision UI/export, Cloud/Firestore, multiplayer, and backup changes remain excluded.
- Real SQLite tests cover schema chain/cascade/rollback and repository replace/remove/revision/rollback behavior; pure tests cover canonical replace/remove, intent validation, stale targets, post-hand boundaries, non-authoritative data, determinism and input immutability. Mutation is now available only as a repository runtime capability; no existing screen calls it.

## Phase 1F Historical Ended Game Reopen Outcome (superseded by Phase 1I)

- Current schema is `303`: `300` is the replay foundation, `301` explicit seat boundaries, `302` immutable local hand revisions, and `303` lifecycle revisions plus shared mutation order. Migration chains `300 → 301 → 302 → 303`, `301 → 302 → 303`, and `302 → 303` are non-destructive. The 303 migration backfills every hand revision by `revisionIndex + 1` and sets each game `recordMutationVersion` to its last hand-revision version before creating the lifecycle audit objects.
- Schema `303` remains unchanged for compatibility. It introduced lifecycle revision storage and the shared mutation-order field; its non-destructive migrations remain part of the supported migration chain.
- The old `reopen` audit value, snapshot parser, table, and read API remain only so existing schema-303 rows stay readable. Phase 1I removes every production lifecycle writer and does not alter historical rows.
- The old reopen planner/repository/UI flow and its tests were removed. `recordMutationVersion` remains the per-game sequence for Phase 1E replace/remove revisions; ordinary hand insertion, reseat, and end do not increment it.

## Phase 1G Historical Reopen and Last-Hand Correction UI Outcome (reopen portion superseded by Phase 1I)

- Phase 1I removes the Dashboard reopen control and all supporting action state. Ended games now remain read-only on Dashboard.
- `GameTableScreen` now offers **Correct last hand** only as an active-local-table entry point with at least one hand. The modal reads the final hand summary and emits only an outcome plus winner/discarder identity and fan, or draw dealer action. `replaceLastHand` / `removeLastHand` receive the current last-hand ID/index and hand-count guards; the repository remains the sole planner and settlement authority.
- Correction is unavailable for non-authoritative/stale timelines and is specifically blocked when a seat boundary begins at `handsCount`, because that boundary is a later effective event. The modal explains that boundary case; it does not attempt to roll identities back automatically. Ended, abandoned, empty, and Cloud/multiplayer games gain no correction path.
- After a successful replace/remove, the table rereads SQLite and requires an authoritative replay before displaying the new state. There is no optimistic correction, locally calculated settlement, or legacy-state reuse. If the mutation commits but refresh fails, normal table mutations are blocked and an explicit reload action is required. Request ordering and unmount guards prevent late reads from overwriting newer or disposed screen state.
- The correction strings remain in English, Traditional Chinese, and Simplified Chinese. Reopen strings and Dashboard reopen coverage were removed; correction tests continue to cover guarded intent and canonical reload.
- This UI checkpoint changes no schema, migration, Cloud/Firestore behavior, multiplayer route, scoring engine, ordinary hand-entry workflow, revision browser, redo, or historical/middle-hand editing. Phase 2 may decide broader recovery, audit, Cloud authority, or revision-history UX.

## Explicitly out of scope

- replay implementation (completed in Phase 1A);
- arbitrary historical edits, middle insertion, redo;
- Firestore model/rules/transaction/listener changes;
- Cloud room correction or reopening;
- TW/PMA support;
- tile/fan recognition;
- backup format and UI;
- AddHand/Summary removal (completed in Phase 0B-3);
- startup recovery/History UX changes.

## Current behavior ambiguities retained for Phase 1

1. New explicit local records persist their initial seat mapping and confirmed seat boundaries. Migrated legacy records can still rely on the North-to-East round-label inference path, so a replay that depends on that inference is intentionally not authoritative for correction.
2. The existing `buildGameResultSummarySnapshot` is exact for ended bundles but the repository keeps its result cache separately. Active correction invalidation is a Phase 1 repository concern; terminal result snapshots remain locked after Phase 1I.
3. Cloud hand indexes start at 1 while local `hands.handIndex` starts at 0. The canonical adapter must normalize this explicitly; this type contract intentionally does not choose the adapter conversion.

## Phase 1H Local Correction QA Outcome

- QA ran on the existing **iPhone 17 / iOS 26.5** Simulator. The current Debug app was built with `xcodebuild -quiet -workspace ios/mahjong_be_fd.xcworkspace -configuration Debug -scheme mahjong_be_fd -destination id=C67ED042-1A60-4984-A429-3CF3E519E16A build`, installed with `simctl`, and cold-launched against Metro. Build succeeded with existing third-party `react-native-svg` warnings only; no app crash, unhandled rejection, duplicate SQLite transaction, or sensitive payload logging was observed during launch and local hand entry.
- QA-A was created as an explicit local game with 東家／南家／西家／北家, then a deterministic draw/stick hand was recorded. Simulator SQLite inspection confirmed `games.handsCount = 1`, a single zero-based `hands.handIndex = 0`, zero-sum `Q` values, matching next-round label (`東風東局` for draw/stick), and no duplicate seat boundary. This validates the normal local persistence and hydration path across a cold launch.
- A transient QA observation was that the first CLI invocation had booted a previously installed app binary while its Xcode build continued in the background. The table therefore did not expose the new correction entry. Root cause was incomplete build/install orchestration, not game data or replay: installing the completed Debug product resolved it. No product code change was required; direct builds must not run concurrently because Xcode locks its build database.
- Regression coverage remains focused on the correction contract: availability tests cover active/authoritative/final-boundary gates; the Dashboard test covers terminal read-only behaviour; the GameTable test covers guarded replacement intent, one submission, and authoritative reload. Repository schema/revision/lifecycle tests cover mutation order, stale guards, rollback and replay parity.
- Device-automation limitation: the Simulator accessibility bridge collapses the pre-existing ordinary hand-entry modal into one accessibility element and History intentionally disables active-game cards. This prevented completing every permutation of the manual matrix by automation alone without adding a debug route or modifying user data. The Phase 1G correction modal itself carries explicit named action controls/test IDs and is covered by the focused UI regression suite. Manual device verification remains recommended for keyboard, large Dynamic Type, English/Simplified Chinese wrapping, and all outcome permutations before release.
- Phase 1H introduces no schema, Cloud/Firestore, multiplayer, scoring, redo, revision-restore, arbitrary historical edit, dependency, commit, or push change.

## Phase 1I Permanent Ended Lifecycle Outcome

- **Superseded internal framing:** 「可信牌局：可修正、可復原、可帶走」. The 3.0 focus is now correction, auditability, and result sharing.
- Local lifecycle is now one-way: a `draft` game is writable only while setting up its first hand, an `active` game supports ordinary recording plus last-hand correction/undo, and `ended` or `abandoned` games are permanently read-only. `isLocalGameMutable` centralizes the repository-level terminal guard.
- `localLifecycle` now contains only that pure mutability predicate. The reopen planner, availability selector, repository transaction/writer, Dashboard state/action, dedicated reopen tests, and three-locale reopen strings were removed.
- Schema remains at `303`. `game_lifecycle_revisions`, `LocalGameLifecycleRevisionAction`, snapshots, and `getGameLifecycleRevisions` are retained solely for read compatibility with pre-existing audit rows; no new lifecycle revision is written and no historical data is migrated or changed.
- End Game confirmation now states that the result becomes locked and that editing, undoing, and reopening are unavailable. After confirmation the Dashboard stays read-only, with sharing preserved and no reopen action. History continues to keep active cards non-resumable; no route, Cloud, Firestore, multiplayer, scoring, settlement, or schema behavior changed.
- Focused tests cover the pure guard, terminal repository mutations, terminal Dashboard rendering, terminal correction absence, strong end-copy semantics, and the retained schema-303 migration path. Phase 2A may add richer read-only history/audit presentation, but never a local reopen path unless product policy is explicitly revisited.
- Future roadmap: **Phase 2A — Shareable Result Experience** (result cards, image sharing, and Share Sheet improvements). Multiplayer correction, a revision viewer, redo, historical editing, and raw backup/export remain optional future work; local reopen is not on the roadmap.

## Phase 2A Ended Dashboard Result UX Outcome

- The local ended Dashboard now follows a result-first order: final header with one first-screen Share action, ranking, visible settlement, compact highlights, the existing collapsed hand history, then collapsed rules. There is no duplicate footer Share action and no image result card.
- The selected `LocalDashboardProjection` remains the only Dashboard/share presentation authority. Canonical settlement directions continue to come from replay. Legacy settlement directions are now built inside the legacy projection from the same final balances, replacing the former screen-only sharing allocation; Dashboard rendering and sharing do not independently recalculate totals or settlement.
- A pure presentation helper implements deterministic competition ranks (`1, 1, 3, 4`), including all-zero four-way ties. Highlight leaders preserve ties and show `—` when every relevant count is zero. The user-visible settlement card says `無需找數` / natural localized equivalent only when there are no projection directions.
- Native sharing now uses a concise result payload (title/date, ranking, settlement, hands/draws, top self-draws, top discards). A synchronous pending lock prevents same-tick double taps; native cancellation remains normal, while an actual rejection gets a localized Alert. Accessibility labels cover ranking, payment directions, and collapsed/expanded history/rules controls.
- Phase 2A changes no schema, replay, HK scoring/settlement semantics, repository writes, Cloud/Firestore/multiplayer, dependency, navigation, terminal lifecycle, or history architecture. The iPhone 17 / iOS 26.5 Debug build was installed and cold-launched successfully without any screenshot/image capture. The workspace output path was an incomplete app bundle, so installation used the valid current DerivedData product. The accessibility bridge exposed Home but no actionable History navigation or safely inspectable ended fixture; QA-A was left unchanged and no game data was created, altered, ended, or shared. Focused UI regression coverage remains the validation for the ended Dashboard presentation and actions.

## Phase 2A.1 Dashboard Simplification Outcome

- **Superseded presentation:** Phase 2A's visible settlement card and settlement rows in text sharing were removed after real-device visual review. Settlement data remains in `LocalDashboardProjection` and replay; no settlement, scoring, parity, or persistence semantics changed.
- Share moved from the result hero to the native App Bar trailing position, using the iOS share symbol plus a cross-platform header fallback. Pending/double-tap, cancellation, rejection Alert, and unmount guards remain intact. The hero now contains result metadata only.
- `戰果重點` is now `牌局統計`. The former filtered/collapsed Hands tool is now an always-visible chronological `牌局紀錄` SectionList: no local filters, wind jumps, partial counts, or expand controls. Wind grouping is visual only.
- Timeline rows lead with the current round and event summary (self-draw, discard win, or draw with dealer action). Four-player delta chips and detail expansion were removed; a winning hand may show only the winner's projected gain as a secondary line. Ranking remains the final-balance authority.
- Dashboard projection now distinguishes the current hand label from replay's documented next-hand label. It uses pre-hand dealer state for legacy rows and the prior canonical projection's next label for subsequent canonical rows, without changing replay semantics.
- English, Traditional Chinese, and Simplified Chinese cover Share result, Game stats, Hand history, timeline events, dealer action, and timeline accessibility. Dashboard-only settlement/jump/partial-count keys were removed; Cloud-shared filter keys remain.
- Phase 2A.1 changes no schema, SQLite, lifecycle, scoring, replay, Cloud/Firestore/multiplayer, dependency, package version, backup/import, or image sharing behaviour.
- Full verification passed with 62 Jest suites / 339 tests, one existing skip, ESLint, TypeScript, and diff checks. The current Debug build was installed on iPhone 17 / iOS 26.5 and visually checked against the existing seven-hand `Drudging` ended fixture at the Dashboard top, timeline start, and Rules footer. QA-A and all game data remained unchanged. Traditional Chinese was visually checked; English, Simplified Chinese, and larger Dynamic Type remain manual visual follow-up.

## Phase 2A.2 Local Dashboard Visual Polish Outcome

- Phase 2A.1's local ended Dashboard architecture and behavior remain locked. Phase 2A.2 changes presentation only: no replay/projection, scoring/settlement, schema/SQLite, lifecycle, share payload, ranking/statistics, chronology, Cloud/Firestore, or multiplayer semantics changed.
- The iOS Share action remains the native `square.and.arrow.up` item but now uses the plain variant with its iOS 26 shared background hidden. Its native target and all pending, cancellation, rejection, unmount, disabled, and accessibility behavior remain intact.
- Hand history now reads directly on the warm page background rather than as one large white table. Wind changes use spacing, rows use subtle separators, and the summary cards and Rules card retain the established card language.
- Each row keeps the current round primary, lowers the localized hand-number hierarchy, and places the flexible event summary beside a right-aligned tabular winner amount. The amount no longer repeats the winner name; draws continue to show no amount. Long identities wrap while the amount remains visible.
- Focused tests cover the plain Share contract, transparent history presentation, localized hand number, flex-safe event row, winner-only amount, draw omission, long names, large amount, chronology, wind grouping, and existing accessibility semantics. iPhone 17 / iOS 26.5 Simulator QA covers Traditional Chinese, English, Simplified Chinese, and the app's larger text setting without modifying QA-A.

## Phase 2A.3 Collapsible Hand History Outcome

- Hand history is now one global lightweight disclosure on the warm Dashboard background and starts collapsed whenever the Dashboard bundle loads. The row displays the total effective hand count, has a full-width 44-point touch target, and exposes localized button, expanded, and zero-hand disabled semantics. Rules remains a separate collapsed footer card.
- The count comes directly from the same sorted `handDisplayList` that supplies timeline sections. Zero hands cannot expand; English distinguishes `1 hand` from plural counts. No SQLite reread, persisted expansion state, preview row, per-wind disclosure, filter, jump control, partial display, pagination, or automatic scroll was introduced.
- The existing Dashboard `SectionList` remains the virtualization boundary: collapsed state supplies no timeline sections and expanded state restores every existing wind group. Phase 2A.2 timeline visual design remains authoritative when expanded. Phase 2A.3 changes only default disclosure behavior; chronology, current-round labels, event copy, winner amounts, draw layout, separators, and wind styling are unchanged.
- Focused coverage includes default collapse, expand/re-collapse, hidden rows, 0/1/multi/30-hand counts, complete long-history section data, accessibility, localization, and retained Share/Ranking/Stats/Rules/terminal behaviour. iPhone 17 / iOS 26.5 Simulator QA verified the existing seven-hand fixture in collapsed, expanded, final-row/Rules, and re-collapsed states, plus English, Simplified Chinese, and app Large text header fit; settings were restored afterwards. This checkpoint changes no projection/replay/scoring/settlement/schema/lifecycle/Cloud/Firestore/multiplayer semantics.

## Phase 2A.3.1 Local Dashboard Micro Spacing Outcome

- Phase 2A.3's hierarchy and disclosure interaction remain locked. The transparent History row now has 10-point vertical breathing room, a minimum 44-point full-row touch target, a small existing-token trailing inset, and centered `＋` / `－` typography aligned with Rules' disclosure weight.
- History remains on the warm page background without card/border/pill/shadow treatment. The Rules card remains white and uses the existing 16-point section spacing. Existing `ScreenContainer` bottom safe-area handling and `SectionList` bottom padding remain authoritative; no iPhone-specific bottom height was added.
- Focused tests retain default collapsed/expand/re-collapse, disabled empty state, Share/Ranking/Stats/Rules, and accessibility coverage while checking only the minimum touch and spacing contracts. iPhone 17 / iOS 26.5 QA confirmed collapsed bottom breathing room and one expanded timeline pass; Large Text retained a clear title/count-to-indicator separation.
- This checkpoint changes no projection/replay/scoring/settlement/schema/lifecycle/Cloud/Firestore/multiplayer semantics and does not alter Phase 2A.2 timeline rows.
