# dev3.0 Phase 0A — Repository Baseline Audit

**Scope:** audit only. No production code, SQLite schema, Firestore rules, route, UI, dependency, version, commit, or push changes were made.

**Audit baseline:** `dev3.0` at `60ffed96b1bef41ba8fb2a7619cfd9a7447e8d0a` (`60ffed9`).

**Audit date:** 2026-08-06 (Asia/Hong_Kong)

## 1. Executive Summary

The repository is a healthy 2.1 baseline for a local-first Hong Kong mahjong score recorder with optional Firebase room sync. Local writes are serialised and transactional; hand settlement data is persisted; several read-time computations already replay part of the history.

The codebase is **not yet ready to add edit/undo by directly modifying `hands`**. Its local repository owns insert-only lifecycle updates (`handsCount`, `currentRoundLabelZh`, state), while Cloud hand submission owns append-only version increments. A 3.0 correction workflow must first define one canonical replay/projection contract, then make every local and Cloud mutation use it.

Top findings:

1. `currentRoundLabelZh` is already deterministically recomputed from all local hands on insert, but there is no reusable complete local timeline replay API for payouts, player totals, dealer state, round state, and validation together.
2. The multiplayer screen has a separate client-side replay loop for Cloud hands and lineups. Local dashboard, Cloud archive detail, and multiplayer table contain overlapping ranking/stat/share/history projection logic.
3. `AddHand` and `Summary` are registered routes with route types, but code search found no normal navigation call, deep link, or recovery flow that reaches them. They are legacy candidates, not yet proven safe to remove without a focused route-removal change.
4. Firestore rules allow the host to update/delete a hand document, but the client has no correction transaction to atomically reconcile the room version, hand indexes, lineups, derived projections, recovery snapshot, and archives.
5. The 48-hour archive retention field is written, but no Firestore TTL configuration, Cloud Function, scheduler, or client expiry worker is present in the repository. **Design exists, operational enforcement unconfirmed.**

## 2. Baseline Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Current branch | Pass: `dev3.0`, tracking `origin/dev3.0` | `git status --short --branch` |
| Expected HEAD | Pass: `60ffed96b1bef41ba8fb2a7619cfd9a7447e8d0a` | `git rev-parse HEAD` |
| Expected package version | Pass: `2.1.0` | `package.json:3` |
| Runtime stack | Matches requested baseline | `package.json:14-28`, `package.json:36-53` |
| Baseline code modifications | No tracked production modifications observed before this audit | `git status --short --branch` at start |
| Pre-existing working-tree file | `docs/current-feature-inventory-v2.1.md` was untracked before this audit; preserved, not treated as baseline code | Initial `git status --short --branch` |

Dependencies confirmed from `package.json`:

- React Native `0.83.1`
- React `19.2.0`
- TypeScript `^5.8.3`
- `react-native-sqlite-storage` `6.0.1`
- `@react-native-firebase/app`, `auth`, and `firestore` `^24.1.1`
- React Navigation native stack `^7.x`

Scripts confirmed:

- `npm test` → `jest`
- `npm run lint` → `eslint .`
- `npm run test:firestore-rules` → installs the nested test dependencies then runs the Firestore emulator test command
- `npm run ios`, `npm run android`, `npm start`

**Finding: baseline matches the requested 2.1 source baseline.**

- Evidence: `git rev-parse HEAD` returned `60ffed9…`; package version is `2.1.0`.
- Current behavior: audit starts on the expected branch and commit.
- Risk: the existing untracked inventory document means a future commit needs deliberate staging, not blanket `git add`.
- Recommendation: keep audit and planning documents explicitly named under `docs/dev3.0/`; stage only intended files later.
- Confidence: High.

## 3. Test, Lint, and Rules Results

| Command | Result | Detail |
| --- | --- | --- |
| `npm test` | Pass | 50 passed suites of 51 total; 1 skipped suite; 233 passed tests of 234 total; 0 failures; 3.923 seconds |
| `npm run lint` | Pass | `eslint .` returned exit code 0 with no findings |
| `npm run test:firestore-rules` (sandbox) | Not executable in sandbox | Firestore emulator could not bind ports 4400, 4500, 8089, and 9150 (`EPERM`) |
| `npm --prefix firestore-tests run test:rules` (approved local emulator execution) | Pass | 3 suites, 16 passed tests, 0 failed, 0 skipped; emulator started and stopped successfully |

The skipped Jest suite is `__tests__/db/repo.roundlabel.int.test.ts`, guarded by an environment condition (`describe.skip` path). It is not a failure but means the integration-style round-label path was not included in this machine's default Jest result.

Jest uses React Native mocks for Firebase (`jest.config.js:1-9`). Firestore rules are separately tested against an emulator (`firestore-tests/package.json:4-6`). Expected permission-denied log entries in the rules test output correspond to negative authorization assertions; the command exited 0.

**Finding: unit/screen coverage is green; rules coverage is green when an emulator may bind local ports.**

- Evidence: command results above; `firestore-tests/package.json:4-6`.
- Current behavior: all required audit commands were run; the rules suite required a non-sandbox local emulator execution.
- Risk: a restricted CI/sandbox environment can report a false operational failure for rules tests if ports cannot be opened.
- Recommendation: document emulator port requirements in CI and keep a separate command result from `npm test`.
- Confidence: High.

## 4. Navigation and Deprecated Routes

### Route registry and actual entrances

`src/navigation/RootNavigator.tsx:76-112` registers every requested route. `Home` is the navigator initial route (`RootNavigator.tsx:61-63`). `src/navigation/linking.ts:4-14` maps the only configured deep link, `mahjongfan://join`, to `JoinInvite`.

| Route | Registered | Confirmed practical entrance |
| --- | --- | --- |
| Home | Yes | Initial route |
| NewGameStepper | Yes | Home; recovery/local fallback flows |
| GameTable | Yes | Home continues active local game; local game creation; local takeover |
| GameDashboard | Yes | History for ended local games; GameTable after ending |
| History | Yes | Home |
| Settings | Yes | History |
| About | Yes | Settings |
| Profile | Yes | Lobby/profile actions |
| JoinInvite | Yes | `mahjongfan://join` deep link |
| RoomLobby | Yes | Room creation/join and hosted-room recovery |
| MultiplayerGameTable | Yes | Lobby and joined-room recovery |
| CloudArchiveDetail | Yes | Multiplayer end/archive and History |
| AddHand | Yes | No direct `navigate`/`replace`/`push` result found |
| Summary | Yes | No direct `navigate`/`replace`/`push` result found |

`HomeScreen` provides the normal local entry and continues the active local game (`src/screens/HomeScreen.tsx:175-203`). It routes to History at `HomeScreen.tsx:242-247`. `HistoryScreen` only opens an ended game through `GameDashboard` (`src/screens/HistoryScreen.tsx:515-524`); an in-progress row is intentionally disabled. `GameTableScreen` owns current local hand recording and its end action.

### AddHand and Summary audit

**Finding: `AddHand` and `Summary` are registered legacy routes, with no discovered normal route caller.**

- Evidence: routes and types at `src/navigation/RootNavigator.tsx:97-98` and `src/navigation/types.ts:17-18`; source search found their screens but no `navigation.navigate/replace/push('AddHand'|'Summary')`; deep linking only targets `JoinInvite` (`src/navigation/linking.ts:7-14`).
- Current behavior: `AddHandScreen` still implements an alternative hand-entry form and writes through `insertHand` (`src/screens/AddHandScreen.tsx:32`, `:230-344`). `SummaryScreen` remains a typed registered component (`src/screens/SummaryScreen.tsx:13`). Neither is a normal app-path destination.
- Risk: removing them without a focused change could break an unsearched external/manual navigation caller, type tests, translations, or legacy documentation; retaining them risks duplicated recording semantics.
- Recommendation: Phase 0B should first add a route inventory/absence test, then remove or explicitly quarantine them in one focused change. Do not let Phase 1 add correction behavior to both `GameTable` and `AddHand`.
- Confidence: High for absence of in-repo navigation calls; Medium for removal safety outside the repository.

Affected files/tests for a later removal assessment:

- `src/navigation/RootNavigator.tsx`
- `src/navigation/types.ts`
- `src/screens/AddHandScreen.tsx`
- `src/screens/SummaryScreen.tsx`
- locale keys used only by those screens (requires an exact reference scan at removal time)
- `__tests__/App.test.tsx`, navigation tests, and any screen tests added for those routes

## 5. SQLite and Local Game Data Flow

### Database initialisation and schema

`src/db/sqlite.ts:45-67` lazily opens a single database named `mahjong_be_fd.db`. The first open invokes `initializeSchema`; a shared `dbPromise` prevents duplicate opening, and `schemaReady` prevents repeat schema setup in process.

`src/db/schema.ts:4-58` creates:

- `games`: immutable-ish game setup plus mutable lifecycle/round/result snapshots
- `players`: base player identity and seat
- `hands`: append-only local hand records and persisted settlement metadata
- `cloud_archives`: serialized completed Cloud room payloads and archive metadata

The initialiser enables foreign keys and WAL when supported (`schema.ts:68-70`), uses repeated `ensureColumn` additions (`:76-103`), and performs idempotent default/lifecycle backfill (`:138-167`).

`src/db/repo.ts:247-280` serialises writes using `runWithWriteLock`, then executes `BEGIN IMMEDIATE`, callback work, `COMMIT`, and `ROLLBACK` on failure.

### Local game lifecycle

1. `NewGameStepperScreen` builds a local HK rules payload and calls `createGameWithPlayers`.
2. `createGameWithPlayers` wraps creation in the repository transaction (`src/db/repo.ts:283-307`).
3. `GameTableScreen` validates the player choice and calls `computeHkSettlement`, then `insertHand` (`src/screens/GameTableScreen.tsx:660-759`). Draws call the same repository through a draw payload (`:799-842`).
4. `insertHand` delegates to `__testOnly_insertHandWithTx` within the write transaction (`src/db/repo.ts:821-835`).
5. The insert transaction validates the game is mutable, finds effective players using the current seat rotation, assigns sequential `handIndex`, persists hand input/deltas/computed metadata, reloads ordered hands, derives next round label, then increments `handsCount` and updates game state/current label (`src/db/repo.ts:646-818`).
6. `endGame` transitions to `ended` or `abandoned`, then creates a persisted result snapshot for ended games (`src/db/repo.ts:1399-1456`, `:1458+`).
7. `HistoryScreen` opens an ended local game in `GameDashboard`; the dashboard loads `GameBundle` and projects ranking/statistics/hand sections at read time.

### Payout, dealer, wind, round and labels

| Concern | Current source of truth |
| --- | --- |
| Hong Kong payout | `src/domain/hk/settlement.ts:68-125`, dispatching to `computeSettlementHkV1` or custom payout logic |
| GameTable call site | `src/screens/GameTableScreen.tsx:681-690` |
| Persisted per-hand payouts | `hands.deltasJson` and `computedJson`, written at `src/db/repo.ts:721-740` |
| Next dealer | `getNextDealerSeatIndex` / `getDealerSeatIndexForNextHand`, `src/models/dealer.ts:19-58` |
| Round/wind replay | `getRoundLabel`, `src/models/dealer.ts:87-125` |
| Next-round snapshot | `games.currentRoundLabelZh`, recomputed from all ordered hands and updated at `src/db/repo.ts:745-763` |
| User-facing meaning | It represents the **next hand's** label, not the last completed hand's label |
| Seat identity across reseats | `src/models/seatRotation.ts`, especially timeline aggregation; explicit reseat only |

**Finding: local insert is append-only and derives the next round label from the entire hand list.**

- Evidence: `src/db/repo.ts:693-763`; `src/models/dealer.ts:87-125`.
- Current behavior: a successful insert reloads all hands, calls `getRoundLabel(startingDealerSeatIndex, hands)`, stores the result on the hand and game, and increments `handsCount` inside the same transaction.
- Risk: a future delete/edit cannot safely update only its own row; all following labels, dealer/round interpretation, state snapshot, rankings and result snapshots may become stale.
- Recommendation: mutations must invoke a canonical replay and atomically replace all affected derived fields; never hand-edit only `deltasJson` or a single label.
- Confidence: High.

### Persisted versus derived balances and statistics

- Per-hand deltas are **persisted** in `hands.deltasJson`.
- `GameTableScreen` keeps running totals in component state for the current session.
- `computeGameStats` parses stored deltas and computes totals, ranking, wins, self-draws, discards and draws at read time (`src/models/gameStats.ts:30-170`). Player totals use `aggregatePlayerTotalsQByTimeline` to account for reseats.
- `endGame` also writes a result summary snapshot to `games.resultSummaryJson` for ended games (`src/db/repo.ts:1458+`). This is an optimization/history summary, not the sole Dashboard model.
- `GameDashboardScreen` loads the full bundle and computes presentation data; it does not use a dedicated immutable replay projection shared with Cloud archive detail.

**Finding: balances are both persisted per hand and derived at read time; statistics are primarily read-time projections.**

- Evidence: `src/db/repo.ts:721-763`, `src/models/gameStats.ts:84-170`, `src/db/repo.ts:1458+`.
- Current behavior: hand deltas are stored, while player totals and stats are re-aggregated from the timeline; an end snapshot is additionally stored.
- Risk: multiple partial computations can diverge when edit/undo/reopen is introduced.
- Recommendation: define a canonical `GameRecordProjection` with explicit inputs and make persisted snapshots cache that projection, never compete with it.
- Confidence: High.

### Existing replay capability and recommended boundary

There is no single public function that starts from hand 0 and returns every validated hand projection, derived player balances, dealer/round state, lifecycle state, and errors together.

Existing partial replay pieces are:

- `getRoundLabel` replaying dealer/wind state from local hands (`src/models/dealer.ts:87-125`).
- `getDealerSeatIndexForNextHand` replaying only the final dealer (`src/models/dealer.ts:40-58`).
- `aggregatePlayerTotalsQByTimeline` replaying player balances through reseat boundaries (`src/models/seatRotation.ts:74+`).
- `computeGameStats` re-aggregating local game totals/statistics (`src/models/gameStats.ts:84+`).
- The Cloud multiplayer screen replays Cloud hands plus lineups in a screen effect (`src/screens/cloud/MultiplayerGameTableScreen.tsx:495-625`).

**Finding: replay capability exists as duplicated partial projections, not as a canonical domain engine.**

- Evidence: modules above; Cloud loop calls settlement per hand and applies lineup-specific deltas.
- Current behavior: each consumer selects pieces of history and produces its own projection.
- Risk: undo/edit may behave differently in local GameTable, Dashboard, Cloud live table, archive detail, and local takeover.
- Recommendation: Phase 1 should add a pure domain boundary such as `src/domain/gameRecord/replay.ts` that accepts a canonical normalized timeline and produces hand projections, player totals, dealer/round state, lifecycle readiness, invariant failures, ranking/statistics, and settlement directions. UI/repository/Cloud adapters should supply storage-specific inputs.
- Confidence: High.

### `PRAGMA user_version` integration point

The most appropriate single integration point is the beginning of `initializeSchema(db)` in `src/db/schema.ts:68`, called exactly once per process after database opening in `src/db/sqlite.ts:45-61`.

No `PRAGMA user_version` or schema version variable currently exists in the repository (code search returned no result).

## 6. Cloud Archive Data Flow

1. A room reaches `ended` through `endRoom` (`src/services/cloud/roomRepo.ts:596-605`).
2. `archiveRoomToLocal` builds a payload from remote state or recovery data and writes it through `saveCloudArchive` (`src/services/cloud/archiveRepo.ts:22-79`; `src/db/cloudArchiveRepo.ts:49-84`).
3. The local `cloud_archives.payloadJson` stores the room, members, temporary players, lineups, hands and archive metadata; it is a separate storage model from `games/players/hands`.
4. `CloudArchiveDetailScreen` reads the payload and independently projects ranking, statistics, settlement directions, grouped history, and share text.
5. Archive sync status is written per member; when all members have saved local archive, the host may permanently delete remote room data (`roomRepo.ts:641-682`).

### Shared / Duplicated Domain Logic

### Local Game versus Cloud Archive read models

| Projection | Local Game | Cloud Archive | Audit result |
| --- | --- | --- | --- |
| Ranking | `GameDashboardScreen` + `computeGameStats` | `CloudArchiveDetailScreen` local helpers | Duplicated domain/presentation computation |
| Statistics | `computeGameStats` | Archive-specific helper logic | Duplicated domain computation |
| Settlement directions | Dashboard transfer helper | Archive-specific transfer helper | Duplicated domain computation |
| Rules summary | Local `RulesV1` parser | Cloud `rulesSnapshot` normalisation | Similar but storage adapters differ |
| Grouped hand history | Local `Hand` / `nextRoundLabelZh` sections | `HandLog` / lineup-aware archive sections | Similar UI, different chronology data |
| Share text | Dashboard-specific formatter | Archive-specific formatter | Duplicated presentation/domain boundary |
| Storage | normalized SQLite tables | one serialized archive payload | Should remain separate initially |

**Finding: projections are duplicated; storage models should not be force-merged before canonical projection exists.**

- Evidence: `src/screens/GameDashboardScreen.tsx:1-300`, `src/screens/cloud/CloudArchiveDetailScreen.tsx:1-250`, `src/screens/cloud/helpers.ts`, `src/db/cloudArchiveRepo.ts:49-116`.
- Current behavior: both views independently parse/format hands, calculate totals/statistics and build share text.
- Risk: a correction/replay implementation may fix local results but leave archive or Cloud results semantically different.
- Recommendation: introduce adapters to a `CanonicalGameRecordSnapshot`, then shared pure projections for ranking/stats/directions/history/share. Keep `games/players/hands` and `cloud_archives.payloadJson` as separate persistence formats in the first iteration; merging tables is a materially larger migration than sharing read models.
- Confidence: High for duplicate projections; Medium for exact refactor size because presentation formatting depends on localization.

Target direction:

```text
Local Game tables ───────┐
                         ├─ CanonicalGameRecordSnapshot
Cloud Archive payload ───┘
                                  ↓
                         shared pure projections
                                  ↓
                  Dashboard / Stats / Share / Export
```

## 7. Multiplayer Lifecycle and Permissions

### Lifecycle map

1. `createRoom` creates a guarded room, host membership, rules snapshot, and invite (`src/services/cloud/roomRepo.ts:100-237`).
2. `joinWithInvite` validates an expiring bearer invite and atomically creates membership via a join ticket (`roomRepo.ts:332-377`).
3. Host manages members, temporary players and lineups; lineups hold four active seats (`roomRepo.ts:420-533`; Firestore rules `:276-284`).
4. An active seated real member submits a hand using a Firestore transaction (`src/services/cloud/handRepo.ts:31-58`).
5. The transaction checks `baseVersion == currentVersion`, makes hand index/version sequential, writes the hand and updates room current version atomically.
6. `MultiplayerGameTableScreen` subscribes to room state and hand timeline, then recomputes client totals/dealer/round/reseat prompts (`src/screens/cloud/MultiplayerGameTableScreen.tsx:179-237`, `:495-625`).
7. An active member can end the room; members archive locally; all members acknowledge archive; host may delete the room.
8. The host can create a local takeover from a complete recovery snapshot (`src/services/cloud/localTakeoverRepo.ts:276-293`).

### Role and rule consistency

| Action | Client behavior | Firestore rules | Result |
| --- | --- | --- | --- |
| Submit a hand | Only a user occupying an active lineup seat may submit | `isActiveMember` + `isSeatPlayer`, sequential hand/version checks | Consistent |
| End room | Client enables the action for an active room member | `isMemberEnd` permits active member | Consistent; not host-only |
| Change lineup/temp players | Host tools | Host-only writes | Consistent |
| Archive ended room | Active member | `isMemberArchive` permits active member | Consistent |
| Mark own archive synced | Current member | Own member doc only | Consistent |
| Delete archived room | Host only, after all sync | Host delete only | Consistent |
| Update/delete a hand | No UI/client operation | Host is allowed | Policy/client mismatch by design/unused capability |

**Finding: every active member may end a room; host-only is not the current end-game policy.**

- Evidence: `src/services/cloud/roomRepo.ts:596-605`; `firestore.rules:102-108`; multiplayer UI end action does not require `room.hostUid === uid`.
- Current behavior: any active member can end an active room; host-only applies to lineup, cleanup and local takeover.
- Risk: a future host-only correction feature must not assume end-game authority already belongs to the host.
- Recommendation: decide whether correction authority is independent from end authority. Document and test both policies explicitly before changing rules.
- Confidence: High.

**Finding: Firestore permits host update/delete of hands, but no safe correction protocol exists.**

- Evidence: `firestore.rules:286-300`; no update/delete hand repository function or screen action was found; `submitHand` is append-only at `src/services/cloud/handRepo.ts:31-58`.
- Current behavior: the host has raw rules permission while client data flow only creates the next hand and increments room counters.
- Risk: a direct host write could leave `currentVersion`, `currentHandIndex`, live listener projections, recovery snapshot, archive, and downstream lineups inconsistent.
- Recommendation: do not expose that permission through UI until a host correction transaction atomically specifies the new canonical timeline/version/revision model. Consider narrowing the rule during the design period if direct external client access is a concern; this audit makes no rule change.
- Confidence: High.

### Revision/audit state

Cloud `HandLog` has `submittedByUid`, `baseVersion`, `serverVersion`, `lineupVersion`, and `createdAt` (`src/models/cloud.ts`). It has no revision number, replacement reference, editor identity, reason, or audit array. Local `Hand` similarly has no revision/audit fields (`src/models/db.ts`).

**Finding: there is no revision/audit model.**

- Evidence: `src/models/cloud.ts` `HandLog`; `src/models/db.ts` `Hand`; `submitHand` construction at `src/services/cloud/handRepo.ts:47-53`.
- Current behavior: only original submitter identity is stored for a Cloud hand.
- Risk: host corrections cannot be transparently attributed or reliably conflict-checked with an append-only history alone.
- Recommendation: select either append-only events plus supersession, or a current-hand document plus immutable revision subcollection. The choice blocks Firestore transaction/rules design.
- Confidence: High.

### Last-hand correction impact assessment

A future host-only last-hand replacement/removal changes at least:

- `rooms/{roomId}`: `currentVersion`, `currentHandIndex`, status constraints and possibly a timeline/revision counter.
- `rooms/{roomId}/hands/{handId}`: current hand/revision representation.
- `src/services/cloud/handRepo.ts`: correction transaction and conflict results.
- `src/services/cloud/roomRepo.ts`: archive/lifecycle guard semantics.
- `firestore.rules`: host correction authorization plus exact atomic before/after validation.
- `src/screens/cloud/MultiplayerGameTableScreen.tsx`: listeners, cached timeline reset, correction UX and conflict refresh.
- `src/services/cloud/storage.ts`: recovery snapshot schema and invalidation/version check.
- `src/services/cloud/archiveRepo.ts` and `src/db/cloudArchiveRepo.ts`: archive must use the corrected canonical timeline only.
- Firestore emulator tests, timeline tests, archive tests, local takeover tests, and UI end-game tests.

## 8. Retention Enforcement

`ARCHIVE_RETENTION_MS` is set to 48 hours in `src/services/cloud/roomRepo.ts:30`. `markRoomArchived` writes `rooms/{roomId}.expiresAt` if unset (`roomRepo.ts:608-639`). The field is copied to local archive metadata (`src/services/cloud/archiveRepo.ts:49-58`, `src/db/cloudArchiveRepo.ts:49-84`).

Repository evidence does **not** show:

- a Firestore TTL field configuration;
- a Firebase/Cloud Function or scheduler;
- a client-side timer/query that deletes rooms at `expiresAt`;
- Firestore TTL settings in `firebase.json`.

Manual deletion after all member archives is implemented in `deleteArchivedRoomAfterSync` (`roomRepo.ts:671-682`) and the archive detail UI.

**Finding: Design exists, operational enforcement unconfirmed.**

- Evidence: 48-hour constant and `expiresAt` write above; `firebase.json` only contains emulator configuration; no scheduled cleanup source was found.
- Current behavior: retention is represented as data and manual host cleanup, not a demonstrated automatic deletion mechanism.
- Risk: archived room data may outlive 48 hours indefinitely if members never complete cleanup or no external TTL is configured.
- Recommendation: before presenting a retention guarantee, verify Firebase console TTL / deployed infrastructure outside this repo. If retention is a hard product requirement, add an observable enforcement mechanism and tests in a later scoped phase.
- Confidence: High for repository absence; Low for external deployed Firebase settings (Unknown).

## 9. Startup Recovery Risks

### Current paths

- SQLite is lazy: the first repository call opens and initializes it (`src/db/sqlite.ts:45-67`). There is no app-level database readiness gate in `App.tsx`.
- `App.tsx` starts i18n and preferences asynchronously (`App.tsx:38-45`) and renders navigation immediately.
- `HomeScreen` checks a local active game only when the user starts a new game, then routes to `GameTable` (`HomeScreen.tsx:175-203`).
- `HomeScreen` also reads the last joined room pointer, fetches the room, and replaces navigation with Lobby or multiplayer table (`HomeScreen.tsx:120-162`).
- `NavigationContainer` deep-link hydration routes `mahjongfan://join` to `JoinInvite` (`src/navigation/linking.ts:7-14`), where the invite flow creates/uses an anonymous session and joins the room.
- `MultiplayerGameTableScreen` first applies cached recovery snapshot and then starts live subscriptions (`src/screens/cloud/MultiplayerGameTableScreen.tsx:179-237`).

### Risks

| Scenario | Finding | Confidence |
| --- | --- | --- |
| Active local game plus joined room pointer | Home has separate local-game and room-recovery mechanisms; it does not define a single startup priority policy | Medium; inference from independent effects |
| Join deep link during Home recovery | Deep-link navigation and Home's async `navigation.replace` have no visible centralized coordinator/token | Medium; inference; needs device-level navigation test |
| Cached room deleted | Home clears/returns from the joined pointer path when remote room is missing; recovery snapshot behavior depends on later screen activation | High for pointer logic, Medium for all race outcomes |
| Firebase offline | Home recovery catches errors and logs; multiplayer screen may show cached state and pause writes | High |
| Database not yet initialized | Lazy `openDb` awaits `initializeSchema`; repository callers are protected, but navigation itself is not blocked on startup hydration | High |

**Finding: startup recovery has multiple asynchronous navigation owners and no explicit arbitration policy.**

- Evidence: `App.tsx:38-45`; `HomeScreen.tsx:120-162`, `:175-203`; `src/navigation/linking.ts:7-14`.
- Current behavior: i18n, preferences, local game access, joined-room recovery, and deep linking can begin independently.
- Risk: duplicate/late navigation or a user being moved away from a deep-link action is plausible, especially on cold start or poor network. This is an inference; no reproduced device trace was collected.
- Recommendation: Phase 0B should define one startup coordinator and precedence policy before adding correction/recovery routes. Add integration tests for cold start with each competing source.
- Confidence: Medium.

## 10. History UX Gap

History deliberately lists active local games but does not make them openable. It sets `canOpenDetail` only for ended, non-abandoned games and routes only those to `GameDashboard` (`src/screens/HistoryScreen.tsx:454-547`). `GameDashboard` itself labels non-ended data read-only (`src/screens/GameDashboardScreen.tsx:728-775`). The Home prompt is the supported resume route (`src/screens/HomeScreen.tsx:175-203`).

**Finding: active games appear in History but cannot be resumed from History.**

- Evidence: `src/screens/HistoryScreen.tsx:454-547`; `src/screens/GameDashboardScreen.tsx:728-775`.
- Current behavior: tapping an active row is a no-op/disabled; Home owns continuation.
- Risk: users discover an apparently actionable active record but have no direct continuation; a future correction flow will need a clear distinction between live table and read-only detail.
- Recommendation: Phase 0B can add a direct “Continue” target to `GameTable` for active rows, or remove active rows from History in favour of an explicit active-game card. Test both behavior and accessibility state.
- Confidence: High.

Likely files/tests for a direct continuation:

- `src/screens/HistoryScreen.tsx`
- `__tests__/screens/HistoryScreen.test.tsx`
- optionally `src/screens/GameTableScreen.tsx` only if it needs explicit resume/hydration states
- navigation tests if adding a new testID or route assertion

## 11. Test Coverage Matrix

| Required invariant | Existing evidence | Coverage assessment |
| --- | --- | --- |
| Four active seats | `roomRepo.validateSeatSelection`; `__tests__/services/cloud/roomHandRepo.test.ts`; lineup tests | Partial/high for Cloud lineup; local creation assumes fixed four players |
| Each hand delta zero-sum | HK payout tests, e.g. `__tests__/domain/hk/computeSettlementHkV1.test.ts`, `hk_traditional_allFans_paytable.test.ts`; import validation at `repo.ts:329-335` | High for engine and import validation |
| `handsCount` equals stored hand count | `__tests__/db/repo.invariant.test.ts`, `repo.createGame.invariant.test.ts`; transaction code `repo.ts:745-763` | High |
| `currentRoundLabelZh` means next hand | dealer/repo lifecycle tests; `__tests__/db/repo.roundlabel.int.test.ts` exists but is skipped in this default run | Medium: direct unit coverage plus skipped integration suite |
| Reseat requires user confirmation | `__tests__/screens/ReseatFlow.test.tsx`; `GameTableScreen.reseat.timeline.test.tsx`; `docs/game-lifecycle.md` | High for UI flow |
| Ended/abandoned cannot add hand | `__tests__/db/repo.lifecycle.reseat.test.ts`; `assertGameMutable` path in `repo.ts:646-668` | High |
| Multiplayer optimistic concurrency | `__tests__/services/cloud/roomHandRepo.test.ts`; `handRepo.ts:31-58` | High at repository/mock level; no correction conflict coverage |
| Deleted Cloud room leaves local archive readable | `__tests__/services/cloud/archiveFlow.test.ts`; local archive repo tests | High for current archive flow |
| Local app does not require Firebase login | local GameTable/repo flows do not import auth; Home local flow uses SQLite | Medium: architecture evidence, no named regression test located |

### Required Phase 1 replay/undo test additions

1. Golden timeline fixtures covering normal wins, self-draws, discards, draw stick/pass, four dealer advances, full wind cycle and explicit reseat.
2. Replay parity tests: the projection must reproduce existing persisted local hand deltas, next labels, totals, ranking, stats and result snapshot for fixture games.
3. Corrupted-timeline rejection: non-sequential indexes, unknown players, malformed deltas, non-zero-sum deltas, invalid draw action, invalid lineup references.
4. Repository transaction rollback when replay/mutation validation fails midway.
5. Last-hand replace and remove parity for active local game; ensure no orphaned labels/results.
6. Reopened lifecycle tests for ended/abandoned semantics, if reopening is approved.
7. Cloud correction version conflict tests under the Firestore emulator.
8. Archive replay/projection parity tests.
9. Local takeover replay tests with reseat and draw edge cases.
10. No-hand, all-draw, seat-rotation, and zero-total edge cases.

## 12. Replay Engine Integration Points

Recommended Phase 1 boundary:

```ts
replayGameRecord(input: CanonicalGameRecordSnapshot): ReplayResult
```

The input should normalize, but not expose, storage differences:

- rules snapshot;
- initial seats/player identities;
- ordered timeline entries;
- per-hand outcome (winner/discarder/draw action/fan);
- seat/lineup effective-from boundaries;
- optional current lifecycle state.

The result should include:

- validated hand sequence and canonical derived hand data;
- deltas and running player totals;
- dealer, dealer advance count, wind/round and next round label;
- reseat/lineup interpretation;
- ranking, statistics and settlement directions;
- invariant failures with stable codes;
- cacheable result summary payload.

Integration order:

1. Adapt existing local `GameBundle` to canonical input.
2. Verify parity with existing `getRoundLabel`, `aggregatePlayerTotalsQByTimeline`, `computeGameStats`, and settlement engine.
3. Make local insert/end/mutation transactions obtain all derived updates from replay.
4. Adapt `CloudArchivePayload` to canonical input and replace archive duplicated projections.
5. Move `MultiplayerGameTableScreen` timeline loop to call the same pure replay engine through a Cloud adapter.
6. Only then implement last-hand correction/revision persistence.

The existing best source modules to preserve as lower-level utilities are:

- `src/domain/hk/settlement.ts`
- `src/models/dealer.ts`
- `src/models/seatRotation.ts`
- `src/models/gameStats.ts` (candidate to be subsumed/retained as wrapper)

## 13. Proposed 3.0 Schema Version Strategy

The product decision permits a 3.0 reset/incompatible database because the app is pre-launch TestFlight. That should not translate into an implicit uncontrolled drop/recreate.

### Proposed approach

1. Add a single `CURRENT_SCHEMA_VERSION` constant once the 3.0 schema is finalized (for example a major-oriented numeric value such as `300`; exact number is a team decision).
2. At the beginning of `initializeSchema(db)`, read `PRAGMA user_version`.
3. Treat `user_version = 0` as legacy/unversioned 2.1 and detect it before applying any 3.0 assumptions.
4. Choose one explicit product-approved path for legacy local data:
   - present an incompatible-data/reset flow; or
   - invoke a deliberate, logged re-create action after approval; or
   - retain a narrow one-time importer if policy changes later.
5. On a fresh/recreated 3.0 database, create schema, verify required tables/indexes, then set `PRAGMA user_version = CURRENT_SCHEMA_VERSION` inside the same initialization unit.
6. On later 3.x versions, use ordered version transitions rather than unbounded `ensureColumn`/backfill behavior.
7. Add schema-version tests for fresh DB, legacy/unversioned DB, interrupted initialization, and forward-version refusal.

**Finding: `initializeSchema` is the correct hook, but no version/reset policy is currently implemented.**

- Evidence: `src/db/sqlite.ts:45-61`; `src/db/schema.ts:68-112`; repository-wide search found no `user_version` handling.
- Current behavior: schema evolution is additive `ensureColumn` plus backfill.
- Risk: an incompatible 3.0 timeline/revision schema could accidentally coexist with partially backfilled 2.1 records.
- Recommendation: make the reset/compatibility decision explicit and testable before Phase 1 mutates storage.
- Confidence: High.

## 14. Recommended Phase 0B Backlog

### Must before Phase 1

#### P0B-01 — Freeze canonical replay contract and golden fixtures

- **Problem/Evidence:** local and Cloud each replay only parts of timeline; see Sections 5 and 7.
- **Recommended change:** write a small design contract for `CanonicalGameRecordSnapshot` and `ReplayResult`, then add fixture-only tests that state expected existing 2.1 behavior before refactoring.
- **Files affected:** new `src/domain/gameRecord/*` test fixtures and tests; references to `dealer.ts`, `seatRotation.ts`, `gameStats.ts`, HK settlement.
- **Tests required:** golden parity, zero-sum, dealer/wind, draw action, reseat, malformed timeline.
- **Risk:** High; defines all correction semantics.
- **Dependency:** none.
- **Blocks Phase 1:** Yes.

#### P0B-02 — Decide correction authority and Cloud revision representation

- **Problem/Evidence:** host may update/delete hands by rule, but no client protocol/revision field exists (`firestore.rules:286-300`, `handRepo.ts:31-58`).
- **Recommended change:** choose host-only last-hand policy, whether corrections are replacement events or revisions, room version semantics, and archive invalidation policy.
- **Files affected:** design decision only in 0B; later `models/cloud.ts`, `handRepo.ts`, `roomRepo.ts`, `firestore.rules`, Cloud screen/tests.
- **Tests required:** design-level acceptance matrix; Phase 1 emulator version-conflict/revision tests.
- **Risk:** High; security and data consistency.
- **Dependency:** P0B-01.
- **Blocks Phase 1:** Yes.

#### P0B-03 — Decide explicit 3.0 database reset/version policy

- **Problem/Evidence:** no `PRAGMA user_version`; existing migration is additive/backfill only.
- **Recommended change:** approve exact legacy 2.1 behaviour (reset prompt, forced rebuild, or temporary importer), target schema version number, and forward-version failure behaviour.
- **Files affected:** design only in 0B; later `src/db/schema.ts`, `src/db/sqlite.ts`, database tests.
- **Tests required:** acceptance cases for fresh, legacy, interrupted, and forward schema versions.
- **Risk:** High; prevents accidental data mixing.
- **Dependency:** product decision.
- **Blocks Phase 1:** Yes.

#### P0B-04 — Define local mutation/lifecycle semantics

- **Problem/Evidence:** current state machine is insert-only; ended/abandoned reject hand insertion (`repo.ts:646-668`, `:1423-1456`).
- **Recommended change:** decide last-hand remove/replace scope, whether arbitrary historical edits are out of scope, when a game can reopen, and exact result snapshot invalidation/rebuild behaviour.
- **Files affected:** lifecycle documentation/tests now; later repo, GameTable, Dashboard, History.
- **Tests required:** last-hand only, no-hand, reopened lifecycle, transaction rollback.
- **Risk:** High.
- **Dependency:** P0B-01 and P0B-03.
- **Blocks Phase 1:** Yes.

### Should fix in Phase 0B

#### P0B-05 — Make startup navigation precedence explicit

- **Problem/Evidence:** deep link, Home room recovery, i18n/preferences and lazy database start independently.
- **Recommended change:** document/select precedence and add a startup coordinator or navigation guard in a separate implementation task.
- **Files affected:** `App.tsx`, `HomeScreen.tsx`, navigation/linking tests, recovery tests.
- **Tests required:** cold start active local + pointer, cold start join link + pointer, deleted room, offline room, slow DB.
- **Risk:** Medium.
- **Dependency:** none.
- **Blocks Phase 1:** No, but strongly recommended before adding correction/recovery paths.

#### P0B-06 — Resolve or remove unused AddHand/Summary routes

- **Problem/Evidence:** route registration/type exists without in-repo caller.
- **Recommended change:** confirm no external dependency, then remove or mark them internal; consolidate any remaining useful test coverage into GameTable/Dashboard.
- **Files affected:** `RootNavigator.tsx`, `navigation/types.ts`, legacy screens/locales/tests.
- **Tests required:** route inventory and app navigation regression.
- **Risk:** Medium.
- **Dependency:** manual product decision on alternative AddHand UI.
- **Blocks Phase 1:** No, but prevents duplicate mutation surfaces.

#### P0B-07 — Specify active History continuation UX

- **Problem/Evidence:** active local games are shown but disabled in History.
- **Recommended change:** add a direct continue affordance or hide active rows behind a dedicated active-game section.
- **Files affected:** `HistoryScreen.tsx`, History tests.
- **Tests required:** active tap/action, ended detail route, abandoned disabled route, accessibility state.
- **Risk:** Low.
- **Dependency:** none.
- **Blocks Phase 1:** No.

### Can defer

#### P0B-08 — Verify/enforce actual Cloud retention

- **Problem/Evidence:** `expiresAt` is not proven to trigger deletion.
- **Recommended change:** verify external TTL configuration; later add an observable scheduled cleanup policy if retention is contractual.
- **Files affected:** potentially Firebase deployment config/infrastructure, room repo, emulator tests.
- **Tests required:** expiry enforcement integration test when a mechanism exists.
- **Risk:** Medium privacy/operations; not a replay blocker.
- **Dependency:** Firebase deployment access.
- **Blocks Phase 1:** No.

#### P0B-09 — Unify local and archive storage models

- **Problem/Evidence:** storage formats differ substantially.
- **Recommended change:** defer physical unification; first use canonical snapshot adapters/shared projections.
- **Files affected:** many database and archive files.
- **Tests required:** broad migration/parity suite.
- **Risk:** High scope.
- **Dependency:** stable replay/projection API.
- **Blocks Phase 1:** No.

## 15. Files Likely to Change in Phase 1

The exact set depends on 0B decisions. Expected core files:

- `src/domain/gameRecord/replay.ts` (new) and fixtures/tests (new)
- `src/domain/hk/settlement.ts`
- `src/models/dealer.ts`
- `src/models/seatRotation.ts`
- `src/models/gameStats.ts`
- `src/models/db.ts`
- `src/db/repo.ts`
- `src/db/schema.ts`
- `src/db/sqlite.ts`
- `src/screens/GameTableScreen.tsx`
- `src/screens/GameDashboardScreen.tsx`
- `src/screens/HistoryScreen.tsx`

Conditional Cloud correction scope:

- `src/models/cloud.ts`
- `src/services/cloud/handRepo.ts`
- `src/services/cloud/roomRepo.ts`
- `src/services/cloud/storage.ts`
- `src/services/cloud/archiveRepo.ts`
- `src/services/cloud/localTakeoverRepo.ts`
- `src/screens/cloud/MultiplayerGameTableScreen.tsx`
- `src/screens/cloud/CloudArchiveDetailScreen.tsx`
- `firestore.rules`
- `firestore-tests/firestore.rules.test.cjs`
- Cloud repository, archive, recovery, local takeover and screen tests

## 16. Risks and Unknowns

| Topic | Status | Detail |
| --- | --- | --- |
| External Firestore TTL deployment | Unknown | Repository has `expiresAt`, but cannot prove Firebase console TTL, Cloud Function, or scheduler configuration |
| External consumers of AddHand/Summary | Unknown | No in-repo caller/deep link found; external manual/automation callers cannot be ruled out by code search |
| Cold-start navigation race reproduction | Inference | Independent async navigation sources indicate risk; no physical-device reproduction was run in this audit |
| 2.1 local data preservation | Product decision: not required | Future implementation may reset/rebuild, but must make that action explicit and versioned |
| Firestore emulator sandbox failure | Environment-specific | Sandbox blocked local port binding; approved local execution passed 16/16 |
| Runtime dynamic imports/hidden route strings | Low-confidence unknown | Static source search found no AddHand/Summary caller; no dynamic route dispatcher was found in inspected navigation code |

## 17. Audit Completion Checklist

- [x] Verified requested branch, commit, package version and dependency baseline.
- [x] Recorded working-tree state and preserved pre-existing untracked documentation.
- [x] Ran Jest, lint, and Firestore rules tests; recorded sandbox restriction and successful emulator rerun.
- [x] Audited requested navigation routes and legacy route reachability.
- [x] Traced local SQLite create/insert/round/end/dashboard data flow.
- [x] Compared local Game and Cloud Archive projection/storage flow.
- [x] Audited Cloud roles, rules, concurrency, archive, takeover and correction impact.
- [x] Assessed retention, startup recovery and History behavior.
- [x] Proposed replay boundary, schema-version approach and Phase 0B backlog.
- [x] Did not implement 3.0 functionality or modify production behavior.
