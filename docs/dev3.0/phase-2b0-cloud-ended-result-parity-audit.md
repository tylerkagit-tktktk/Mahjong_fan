# Phase 2B-0 — Multiplayer / Cloud Ended Result Parity Audit

Date: 2026-08-10

Branch: `dev3.0`

Baseline HEAD: `d1784b3 style(dev3): refine local dashboard spacing`

## 1. Executive summary

**Verdict: choose Option C — build a strict Cloud canonical adapter before changing the Cloud result UI.**

The current Cloud archive contains enough raw information to reproduce the happy-path result for the current four-seat HK flow: immutable-at-creation rules JSON, one-based hands, per-hand lineup versions, lineup boundary records, member/temporary-player names, winner/discarder identities, fan, and dealer action. The current screen already replays those fields into balances, statistics, round labels, and hand deltas.

It is not yet a trustworthy result authority:

- no Cloud-to-canonical adapter exists;
- `CloudArchiveDetailScreen` independently reimplements replay, ranking, statistics, dealer progression, grouping, and share formatting;
- malformed or semantically inconsistent archives are not strictly parsed or validated;
- archive payloads have no schema version or integrity digest;
- Cloud ties are rendered as `1, 2, 3, 4`, including an all-zero game, rather than local competition ranks;
- temporary-player merge destructively rewrites historical lineups and hands without a version increment;
- Cloud source hands and lineups remain mutable by the host after end/archive under current Firestore rules;
- the rules permit an active member to atomically append a hand and move an ended/archived room back to `active` if bypassing the app service;
- archive persistence is a client-side, multi-step best-effort process, not an atomic or server-guaranteed end snapshot;
- the 48-hour value is only written to `expiresAt`; repository-controlled enforcement is absent.

The frozen local Dashboard must remain unchanged. Phase 2B-1 should create and characterize a pure Cloud adapter and canonical result projection, with no visual refactor and no multiplayer correction feature yet.

## 2. Audit baseline and constraints

Initial repository checks:

```text
## dev3.0...origin/dev3.0 [ahead 14]
?? docs/current-feature-inventory-v2.1.md
```

`git log -8 --oneline` starts with `d1784b3`; `git diff --check` was clean. The existing untracked `docs/current-feature-inventory-v2.1.md` was not read for implementation input, modified, staged, or committed.

This checkpoint changes documentation only. Production code, tests, Firestore rules, and Cloud data were not changed.

## 3. Frozen local ended-Dashboard contract

The local reference is `GameDashboardScreen`, fed by `buildLocalDashboardProjection` and the canonical local replay when that replay is authoritative.

### 3.1 App bar and hero

- Navigation provides the back affordance.
- The app bar exposes one native Share action on ended games (`GameDashboardScreen.tsx:394-429`).
- The hero displays the result label, ended badge, game title, stored current/final round label, hands played, and game date (`GameDashboardScreen.tsx:532-555`).

### 3.2 Ranking

- Final balances come from the selected dashboard projection, canonical when the ended local replay is authoritative (`localDashboardProjection.ts:270-376`).
- `rankDashboardPlayers` sorts by balance, then deterministic name and identity tie-breakers, while assigning competition ranks (`dashboardResultPresentation.ts:17-37`).
- Equal totals therefore render `1, 1, 3, 4`; four zero totals render `1, 1, 1, 1`.

### 3.3 Game statistics

- The visible summary is hands, draws, most self-draws, and most discards (`GameDashboardScreen.tsx:592-612`).
- `getTopDashboardPlayers` returns every tied leader and returns `null` when the category maximum is zero (`dashboardResultPresentation.ts:39-49`).
- The canonical projection counts by stable player identity, not current seat (`localDashboardProjection.ts:308-340`).

### 3.4 Hand history

- One global “牌局紀錄 · N 鋪” disclosure is collapsed by default (`GameDashboardScreen.tsx:142`, `614-630`).
- Effective hands are sorted chronologically by zero-based `handIndex` and grouped by the hand's current wind (`GameDashboardScreen.tsx:238-264`).
- Rows show the hand's current round label, event-first summary, and winner amount only; draws show stay/pass but no money (`GameDashboardScreen.tsx:431-480`).
- The disclosure exposes button role, expanded/disabled state, and a count-aware accessibility label (`GameDashboardScreen.tsx:266-274`, `614-624`).
- Ranking names are single-line and ellipsized (`GameDashboardScreen.tsx:581-587`).

### 3.5 Rules and sharing

- Rules are read-only and collapsed by default (`GameDashboardScreen.tsx:143`, `634-662`).
- Share is concise native text: title/date, competition-ranked balances, hands/draws, top self-draw, and top discard. It excludes settlement directions, full hand history, and a rules dump (`GameDashboardScreen.tsx:355-392`).
- Share has an in-flight guard and visible failure alert.

## 4. Exact multiplayer end and archive flow

```text
active Firestore room
  -> any active room member taps End Game
  -> endRoom transaction writes room.status = ended,
     archiveReadyAt, archiveVersion + 1, updatedAt
  -> the same client calls archiveRoomToLocal
     OR every other connected table client observes ended and calls it
  -> buildArchivePayload reads the ended room, active members,
     temporary players, every hand, and every lineup version
  -> markRoomArchived changes ended -> archived and sets expiresAt
  -> SQLite cloud_archives INSERT OR REPLACE stores payloadJson
  -> profile stats are attempted (failure is swallowed for later retry)
  -> the actor's member document is marked archive-synced
  -> navigation replaces the table with CloudArchiveDetail
  -> History later lists the local cloud_archives row
```

Primary code path:

- End button and confirmation: `MultiplayerGameTableScreen.tsx:848-896`, rendered for every table user at `1152-1167`.
- End transaction: `roomRepo.ts:596-605`.
- Other clients' automatic archive path: `MultiplayerGameTableScreen.tsx:245-280`.
- Archive build/persist/sync sequence: `archiveRepo.ts:22-76`.
- SQLite row: `cloudArchiveRepo.ts:49-84`.
- History query and route: `HistoryScreen.tsx:250-256`, `373-438`.
- Result read: `CloudArchiveDetailScreen.tsx:298-316` -> local SQLite `payloadJson`, not Firestore result data.

### 4.1 Required end-flow answers

1. **Who can end?** Every active member. The button is not host-gated, `endRoom` accepts an active member, and Firestore `isMemberEnd` does the same (`roomRepo.ts:596-604`; `firestore.rules:102-108`, `215-220`). A seated user is not required for end.
2. **Does end immediately create an archive?** The UI immediately attempts it, but end and archive are separate transactions/calls. `endRoom` writes no result payload.
3. **Client or server?** Entirely client-side in this repository. No Cloud Function or server archive writer was found.
4. **Guaranteed?** Best effort. Multiple connected clients improve the chance, but there is no atomic end+snapshot guarantee.
5. **Immutable?** No. The local copy is a snapshot but can be replaced by room ID or manually deleted. The Cloud hands/lineups/temp players can still be changed by the host under current rules.
6. **App closes between end and local persistence?** Firestore remains `ended` or `archived`; no local History row exists until retry. A guest with an active joined-room pointer is routed back through the table and can retry (`HomeScreen.tsx:122-154`). Host recovery instead clears its hosted pointer for ended/archived rooms and does not itself archive (`roomRepo.ts:308-329`), so host-only relaunch recovery has a gap.
7. **Another member ends first?** The listener observes `ended`; each connected member attempts its own local archive and navigates to the detail. Calling `endRoom` after the room is already ended/archived returns success without incrementing again.
8. **Duplicate data?** Each member/device intentionally writes its own local copy. On one device, SQLite has one primary-key row per `roomId`, so retries replace rather than duplicate. The room's archived transition is idempotent for the same `archiveVersion` (`roomRepo.ts:608-638`).
9. **Result data source?** Local `cloud_archives.payloadJson`. The detail screen subscribes to Firestore members only for cleanup progress (`CloudArchiveDetailScreen.tsx:318-333`, `380-407`).
10. **Offline?** Yes after successful local archive persistence. Result rendering itself uses SQLite. Cloud cleanup progress/deletion is not available offline.

### 4.2 Crash windows and ordering

`archiveRoomToLocal` marks the Cloud room archived **before** SQLite persistence (`archiveRepo.ts:61-68`). A crash or local-write failure in that window leaves Cloud `archived` without a local archive for that client. The retry is supported while the table remains reachable and is covered by `archiveFlow.test.ts:135-149`, but it is not server-driven.

Profile stats are deliberately best effort after local persistence (`archiveRepo.ts:69-74`). Archive-synced is written last, so the normal service does not report successful synchronization before local storage succeeds.

## 5. Cloud result surfaces

| Surface | Entry point | Data source | Lifecycle | Production? |
|---|---|---|---|---|
| `MultiplayerGameTableScreen` | Active room / joined-room recovery | Firestore room, current lineup, timeline + local recovery cache | Active; bridge for ended/archived auto-archive | Yes |
| End confirmation alert | End button on multiplayer table | Current room/session | Active only by normal UI | Yes, action only; not a result summary |
| `CloudArchiveDetailScreen` | Successful archive navigation or History row | Local SQLite `cloud_archives.payloadJson`; Firestore members only for cleanup | Archived local result | Yes, formal result screen |
| Cloud archive row in `HistoryScreen` | “所有戰績” | Local SQLite summary columns | Archived | Yes |
| Archived notice in `RoomLobbyScreen` | Existing lobby route | Live room | Archived status only | Yes, not a result surface |
| Profile lifetime stats | Profile | Firestore `profileStats/{uid}` | Cross-game aggregate | Yes, not a per-game result surface |

`CloudArchiveDetail` is registered in `RootNavigator.tsx:105-109` and `navigation/types.ts:23`. No alternate legacy Cloud result route, end-summary modal, or dead Cloud summary screen was found.

## 6. Cloud data contract

### 6.1 Live Firestore source

**Room** (`models/cloud.ts:29-46`): identity/title/host, lifecycle, capacity/count, `currentVersion`, `currentHandIndex`, `activeLineupVersion`, `rulesSnapshot`, archive timestamps/version, created/updated timestamps. It stores no starting dealer field, current dealer, round progress, final totals, result status, or result summary.

**Hand** (`models/cloud.ts:133-147`): one-based index/ID, outcome, submitter UID, base/server versions, lineup version, winner/discarder player IDs, draw dealer action, fan, and timestamp. It stores no settlement deltas, dealer-before state, wind/round label, next-round label, or per-hand rules version.

**Lineup** (`models/cloud.ts:92-101`): explicit version, effective hand-index boundary, four player IDs, creator, base version, and timestamp. Player names are not embedded; they resolve from members/temp players.

**Identity** (`models/cloud.ts:59-90`): a real member's player identity is Firebase `uid`; a temporary player's identity is `tempPlayerId`. Seat ownership is held separately in lineups.

### 6.2 Local Cloud archive source

`CloudArchivePayload` contains room, active members, temporary players, all lineups, all hands, archived timestamp, and archive version (`models/cloud.ts:168-176`). The SQLite row additionally indexes title/times/version/member count/hand count and stores the full JSON (`schema.ts:132-145`).

The archive does **not** contain:

- an archive schema version;
- canonical record/replay version;
- precomputed totals or statistics;
- final dealer/round state;
- stored per-hand settlement deltas;
- starting dealer as an explicit field;
- mutation/revision version;
- digest/signature or source completeness proof.

### 6.3 Derived presentation data

Ranking, totals, stats, hand deltas, hand round labels, final/current round, wind groups, and share lines are all reconstructed in `CloudArchiveDetailScreen`, not stored in the archive (`CloudArchiveDetailScreen.tsx:139-249`, `346-424`).

## 7. Hand-index and version semantics

| Question | Finding |
|---|---|
| First Cloud hand index | `1` |
| `currentHandIndex` before a hand | `0` |
| Does `currentVersion` equal hand count? | No. Room starts at 1; starting lineup, every hand, and every lineup change increment it. |
| Successful hand version increment | Exactly once in the room+hand transaction. |
| Reseat/lineup increment | Yes, once. |
| End increment | No. Temp-player add and destructive temp merge also do not increment it. |
| Contiguous indexes | Normal service guarantees `1..currentHandIndex`; timeline sync rejects gaps. Host rule-level mutation can later break this. |
| IDs independent from indexes | No. Hand document ID and `handId` are `String(nextHandIndex)`. |
| Ordering | Explicit `handIndex`, not timestamp (`handRepo.ts:13-28`). |
| Retry duplicate logical index | Normal transaction/version checks prevent it; a stale retry conflicts. |

Evidence: room initialization `roomRepo.ts:179-188`; hand transaction `handRepo.ts:31-57`; lineup write `roomRepo.ts:478-499`; end `roomRepo.ts:596-605`; timeline continuity guard `roomTimelineRepo.ts:19-51`.

`currentVersion` is therefore an optimistic concurrency token for selected writes, not a hand count and not a complete mutation ledger.

**Current UI defect:** real Cloud hands are one-based, but the archive history renders `#${handIndex + 1}` (`CloudArchiveDetailScreen.tsx:638-641`). The first production hand displays `#2`. The screen test fixture incorrectly uses hand index `0` (`CloudArchiveDetailScreen.test.tsx:118-133`), masking the production mismatch.

## 8. Player identity and lineup semantics

### 8.1 Current behavior

- Permanent real-player identity: Firebase UID.
- Temporary-player identity: generated `temp_*` ID, not a UID (`roomRepo.ts:100-121`, `420-462`).
- “Left” exists in the type, but no production leave transition was found. Member self-update rules require `membershipStatus` to remain unchanged; host deletion is the practical removal authority (`firestore.rules:248-274`). Archive collection uses active members only (`roomRepo.ts:385-388`).
- Seat swaps/replacements are new versioned lineups effective on the next Cloud hand (`roomRepo.ts:478-499`).
- Every hand stores the exact `lineupVersion` used.
- Archive building requires every lineup version through the active version (`archiveRepo.ts:31-47`; `roomTimelineRepo.ts:61-79`).
- Archive display first resolves exact hand lineup version, then falls back heuristically to an effective boundary if the exact version is absent (`helpers.ts:36-44`). Silent fallback is unsuitable for authoritative replay.
- A temp-to-member “merge” rewrites every historical lineup and winner/discarder reference, deletes the temp identity, and does not increment `currentVersion` (`roomRepo.ts:505-530`).

### 8.2 Required scenarios

| Scenario | Reconstructable? | Finding |
|---|---|---|
| A. Same four users all game | Yes, if archive is complete and unmodified | Initial lineup + per-hand version is unambiguous. |
| B. Seat swap | Yes | New lineup has an explicit next-hand boundary; old hands retain their lineup version. |
| C. Member replaced by temporary player | Yes | The new lineup records the temporary ID and boundary; prior member remains a separate identity. |
| D. Temporary player replaced by member | **Not historically unambiguous when Merge is used** | A normal lineup replacement would be reconstructable. The shipped Merge path instead rewrites history, erases the temp identity, and retroactively credits the member. Only the post-merge identity story survives. |
| E. Lineup change after latest hand, before next hand | Yes as a pending boundary | New lineup is archived and effective at `currentHandIndex + 1`; no completed hand references it yet. The result screen nevertheless initializes every player found in every lineup, so a never-played incoming identity may appear at zero in ranking. |

Cloud can reconstruct effective seats for each normal hand because it stores `lineupVersion`, but this guarantee is procedural rather than immutable: current Firestore rules let the host update/delete the underlying history.

## 9. Cloud canonical adapter status

**Status A: no Cloud adapter exists.**

Searches for Cloud adapter names, `CanonicalGameRecordSnapshot`, replay entry points, and canonical imports in Cloud/multiplayer paths found no production or experimental adapter. The canonical replay is used by the local adapter/service only. Cloud live and archive screens use independent reducers.

## 10. Current Cloud result calculation authority

| Value | Current authority |
|---|---|
| Rules | `parseRules(payload.room.rulesSnapshot.serializedRules, 'HK')`; malformed/unsupported input silently becomes default HK rules. |
| Totals | Screen loops sorted hands, resolves lineup, calls `computeHkSettlement`, accumulates by player ID. |
| Ranking | Screen sorts total descending then name, and displays array index. |
| Draw/win/zimo/discard stats | Screen reducer. |
| “Most” stats | Screen sorts count then name and selects one entry. |
| Hand order | Sorted by `handIndex`. |
| Hand round label | Derived before applying the hand's dealer transition. |
| Final/current round | Derived after all hands. |
| Hand deltas | Fresh `computeHkSettlement` result. |
| Names | Archive members and temp players. |
| Share | Screen formatter using its own ranking array. |

The screen independently owns result semantics at `CloudArchiveDetailScreen.tsx:110-249` and share semantics at `409-424`. It does not call canonical replay, local dashboard projection, `computeGameStats`, or local rank/leader helpers.

Invalid winner/discarder/lineup combinations are silently skipped for money and stats; the screen can still display a plausible partial result. There is no `isValid`, parity status, diagnostic panel, or authoritative gate.

## 11. Local-versus-Cloud parity matrix

Severity: P0 = correctness/misleading result; P1 = major UX inconsistency; P2 = polish/parity.

| Area | Frozen local baseline | Current Cloud | Gap | Severity |
|---|---|---|---|---|
| App Bar Share | One header action | Bottom full-width button | Different placement and scrolling requirement | P1 |
| Result hero | Title/status/current round/hands/date | Similar | Cloud date is archive/end date; local displays game created date | P2 |
| Ranking | Canonical/validated projection | Screen replay with silent skips | No authority/validation gate | P0 |
| Tie ranking | Competition `1,1,3,4` | Array positions `1,2,3,4` | Misrepresents ties | P1 |
| All-zero ranking | `1,1,1,1` | `1,2,3,4` | Invents an order in a tied game | P1 |
| Stats summary | Hands/draws/top zimo/top discard | Full per-player table plus two single leaders | Different information hierarchy | P1 |
| Stats ties | Every tied leader | One name by locale sort | Drops tied leaders | P1 |
| Stats zero | `—` | `—` | Parity | — |
| Hand count | Projection effective count | Sorted archive array length | No validation against room index at read time | P0 |
| History default | One global collapsed disclosure | Every wind section separately collapsed; filters/card always visible | Not the frozen interaction | P1 |
| History grouping | Wind groups | Wind groups | Broad parity | — |
| Hand number | Local zero-based + 1 | Cloud one-based + 1 | First Cloud hand displays #2 | P1 |
| Current hand round | Stored/canonical hand-before label | Derived hand-before label | Semantically correct on valid data; starting dealer implicit | P0 data-contract risk |
| Winner amount | One secondary winner amount | Four seat delta chips | Dense and unlike local | P1 |
| Draw presentation | Event + stay/pass, no amount | Event + stay/pass + four `—` chips | Extra noise | P1 |
| Rules | Read-only, collapsed | Read-only, always expanded | Major layout mismatch | P1 |
| Share payload | Date, ranked balances, hands/draws, tied top stats | Round/hands and index-ranked balances only | Missing date/draws/highlights; ties wrong | P1 |
| Share reliability | In-flight guard + failure alert | No guard; rejection only logged | Double tap and invisible failure | P1 |
| Accessibility | Global disclosure state/count and row labels | Basic pressables; wind disclosures lack explicit role/state/labels | Incomplete parity | P1 |
| Long names | Ranking ellipsis | Ranking/stat lines have no truncation policy | Overflow risk | P2 |
| Dynamic Type | Simpler rows/grid | Dense stat lines and four fixed delta chips | Higher clipping/wrapping risk; no dedicated coverage found | P2 |

## 12. Ranking findings

Cloud ranking is:

```ts
totals -> sort(total desc, name asc) -> render index + 1
```

(`CloudArchiveDetailScreen.tsx:223-229`, `470-479`).

For `+100, +100, -50, -150`, Cloud renders `1, 2, 3, 4`; for `0, 0, 0, 0`, it also renders `1, 2, 3, 4`. Its deterministic name sort is suitable only as display ordering inside a tie, not as rank assignment. This is P1 because the balances remain correct but the displayed placing is false.

The local pure helper already implements the required behavior and is safe to reuse once Cloud totals come from a trustworthy projection.

## 13. Statistics findings

- Hands: `sortedHands.length`.
- Draws: every hand whose type is `draw`.
- Wins/zimo/discards: counted only when a non-draw hand resolves to a valid lineup and valid winner/discarder seat (`CloudArchiveDetailScreen.tsx:163-205`).
- Identity: counters are keyed by player ID, so normal reseats follow identities rather than seats.
- Most zimo/discard: only the first maximum survives; equal leaders are name-sorted and silently reduced to one (`121-137`, `239-246`).
- All-zero categories correctly show `—` because zero counts are filtered out.
- Profile lifetime stats separately use each hand's exact lineup version and UID (`profileRepo.ts:90-107`), with an idempotency marker per room/archive version (`110-138`). Temporary players have no profile stat document. Destructive Merge can retroactively shift temporary history to a member UID.

The screen and profile reducers are separate implementations, so they can drift.

## 14. Round-label findings

Cloud stores neither dealer state nor round labels. Both live table and archive start at dealer seat `0` and derive progression from hands (`MultiplayerGameTableScreen.tsx:513-600`; `CloudArchiveDetailScreen.tsx:151-220`).

On structurally valid data the archive screen labels the **current hand before its transition**, which is the correct semantic:

- East-East, dealer loses: hand row remains `東風東局`; next state becomes `東風南局`.
- Draw + stay: next hand remains the same dealer/label.
- Draw + pass: current row uses the old dealer; next state advances.
- East-North that advances: row is `東風北局`; final/current summary becomes `南風東局`.

The hero's summary label is intentionally the state after all archived hands (`CloudArchiveDetailScreen.tsx:231-237`, `459-463`).

The correctness risk is contractual: starting dealer `0` is implicit, malformed/missing lineups can suppress dealer advancement, and no strict replay diagnostic blocks display. The future archive must persist starting dealer explicitly or formally version the fixed-seat-zero rule.

## 15. Hand-history findings

Current Cloud UX (`CloudArchiveDetailScreen.tsx:602-688`):

- All / Win / Draw filters;
- one disclosure per wind group, each collapsed by default;
- chronological order by hand index;
- event badge and event text;
- detailed summary;
- four seat delta chips on every hand, including `—` values for draws;
- no one-line global “Hand history · N hands” disclosure;
- incorrect `handIndex + 1` presentation for one-based Cloud records.

It has no jump chips or permanently expanded hand rows, but the filters and all wind headers occupy the page even while history is collapsed. Cloud should ultimately adopt the local interaction exactly: one global disclosure, wind groups after expansion, event-first rows, one winner amount, and no draw amount. That work should consume a canonical Cloud dashboard projection rather than the current screen reducer.

## 16. Share findings

Current Cloud share (`CloudArchiveDetailScreen.tsx:409-424`, `690-698`) contains:

```text
room title
final/current round · hands played

player ranking:
1. name balance
...
```

Findings:

- CTA is bottom-only; there is no app-bar Share.
- No duplicate CTA exists.
- Rank numbers inherit the tie bug.
- It omits game date, draws, top self-draw, and top discard from the local target.
- It correctly omits settlement directions, full history, rules, and the per-player stats table.
- There is no double-tap/in-flight guard.
- rejection is only logged by the button callback; the user gets no failure alert.
- native share cancellation is not treated as an error, which is acceptable.

## 17. Rules snapshot findings

The room is created with a serialized full `RulesV1` snapshot (`NewGameStepperScreen.tsx:1081-1092`; `rules.ts:19-44`, `92-94`). Current HK configuration includes minimum fan, scoring preset, gun mode, stake preset, unit per fan, cap, and dealer multiplier.

Firestore room-update allowlists do not include `rulesSnapshot`, so normal and rule-authorized clients cannot alter it after room creation (`firestore.rules:117-125`). The archive copies the room object. Under current model this preserves traditional presets and the custom linear unit/cap configuration. There is no arbitrary custom paytable array in `RulesV1` to preserve.

However, `CloudArchiveDetailScreen` calls tolerant `parseRules`; absent, malformed, or unsupported rules silently become current default HK rules (`rules.ts:106-200`). A corrupted archive can therefore show recomputed money under rules that were never used. Canonical Cloud adaptation must parse strictly and reject authority instead of defaulting.

## 18. Archive integrity and compatibility

| Property | Current state |
|---|---|
| Payload schema version | None |
| Strict parser | None; `JSON.parse(...) as CloudArchivePayload` |
| Structural validation | None on load |
| Timeline validation at creation | Good procedural check: contiguous hands and all lineups required |
| Timeline validation on later read | Screen sorts and tolerates/skips invalid data |
| Corruption handling | Invalid JSON becomes a load error; shape/rule corruption may crash or silently miscalculate |
| Forward compatibility | None |
| Integrity digest | None |
| Immutable local snapshot | No; row can be deleted or `INSERT OR REPLACE`d |
| Duplicate policy | Primary key `roomId`; latest local save replaces regardless of archive-version ordering |

Evidence: `cloudArchiveRepo.ts:49-84`, `100-113`; pending-stats list silently drops invalid JSON at `116-137`.

Malformed JSON is caught by the screen load path and produces an error view. Structurally malformed JSON is more dangerous: spreads such as `[...payload.hands]` occur after loading, outside a schema boundary. Rules corruption silently falls back. Archive version currently means end/archive generation, not payload schema.

## 19. Retention and TTL

**Finding: field only / not proven enforced.**

- `ARCHIVE_RETENTION_MS` is 48 hours (`roomRepo.ts:29-31`).
- `expiresAt` is set only when a client changes `ended` to `archived` (`roomRepo.ts:621-635`). An ended room that no client archives has no 48-hour timestamp.
- No Firestore TTL configuration, Cloud Function, scheduler, or client expiry worker exists in this repository.
- Normal manual deletion waits for every active real member to mark its local archive and then requires host action (`roomRepo.ts:661-681`).
- Even a Firestore TTL policy on the room document alone would not establish recursive deletion of its subcollections; this repository puts no expiry field on every child and contains no server recursive cleanup.

The product must not claim guaranteed 48-hour Cloud deletion based on current repository evidence.

## 20. Firestore authority findings

### 20.1 Direct answers

1. **Can a client mutate an already-written hand?** Host: yes, arbitrary update. Non-host: no (`firestore.rules:286-301`).
2. **Can host delete a hand?** Yes, at any lifecycle status.
3. **Can non-host delete a hand?** No.
4. **Are ended rooms write-locked?** No.
5. **Can archived data be altered?** Yes: host can write temp players/lineups and update/delete hands; host room update is broad; member archive-sync fields are client-writable.
6. **Can room result fields change after end?** There are no stored result fields. Host can alter allowed lifecycle/version/archive fields, including status, because `isHostRoomUpdate` does not enforce a state machine beyond excluding `cancelling`.
7. **Aligned with future host-only correction?** No. Current host authority is destructive in-place editing, not a constrained revision transaction.

### 20.2 P0 rule gap

`isHandAdvance` requires the new status to be `active` but does not require the old room status to be `active` (`firestore.rules:87-100`). Nested hand-create rules also omit a lifecycle check (`286-299`). A malicious active seated member can therefore submit a hand plus room increment and transition an `ended` or `archived` room back to `active`, even though `submitHand` correctly blocks this in app code (`handRepo.ts:31-37`).

Other authority gaps:

- host can create/update/delete any lineup without schema, sequence, boundary, lifecycle, or matching room-version validation (`firestore.rules:281-284`);
- host can write temp players after end/archive (`276-279`);
- host hand updates/deletes have no field allowlist or lifecycle gate;
- member archive sync update restricts changed field names but not that the supplied archive version equals the room's current archive version (`248-272`);
- rules do not enforce the service-level “all members synced before delete” policy; a host can call allowed deletes directly when other preconditions permit.

## 21. Multiplayer correction readiness

**Overall: NOT READY.**

| Requirement | Readiness | Blocker |
|---|---|---|
| Stable effective timeline | Partially ready | Explicit hand/lineup history exists, but host can mutate/delete it. |
| Identity boundaries | Partially ready | UID/temp identities are separate, but Merge erases the historical boundary. |
| Canonical Cloud adapter | Not ready | None exists. |
| Replay parity | Not ready | Screen-side replay has no canonical/parity gate. |
| Independent mutation version | Not ready | `currentVersion` conflates hand and lineup writes and omits other mutations. |
| Hand-index semantics | Partially ready | One-based and contiguous in service, but needs explicit normalization and is already misrendered. |
| Immutable revision destination | Not ready | No correction/revision collection or append-only event. |
| Firestore rules | Not ready | Broad in-place host mutation and lifecycle bypass. |
| Listener/recovery behavior | Partially ready | Cache/retry exists; host ended-archive relaunch gap remains. |
| Archive after correction | Not ready | No mutation-aware archive generation, digest, invalidation, or version ordering policy. |

This finding does not invalidate completed local correction functionality. It means Cloud correction must not begin until the Cloud source can be adapted and replayed authoritatively and mutations have an explicit revision contract.

## 22. Shared presentation opportunities

| Piece | Classification | Reason |
|---|---|---|
| Competition ranking helper | SAFE TO SHARE NOW | Pure totals-to-ranks behavior; local helper is already characterized. |
| Stats leader helper | SAFE TO SHARE NOW | Pure identity-count behavior with tie/zero semantics. |
| Generic disclosure row | SAFE TO SHARE NOW | Presentation-only if no result semantics are embedded. |
| Result hero | SHARE AFTER CLOUD ADAPTER | Requires trustworthy final/current round and hand count. |
| Ranking card | SHARE AFTER CLOUD ADAPTER | Must receive authoritative ranked projection, not raw Cloud totals. |
| Stats card | SHARE AFTER CLOUD ADAPTER | Meanings/ties must come from one projection. |
| Hand timeline row | SHARE AFTER CLOUD ADAPTER | Requires normalized index, effective seats, current-hand round, and deltas. |
| Rules summary | SHARE AFTER CLOUD ADAPTER | Must receive strict, validated historical rules. |
| Share text formatter | SHARE AFTER CLOUD ADAPTER | Should format one common result projection. |
| Cloud sync/cleanup card | KEEP SEPARATE | Cloud-only lifecycle and Firestore member state. |
| Screen loading/navigation/data retrieval | KEEP SEPARATE | Local SQLite game and Cloud archive lifecycles differ. |

Do not first extract the two current screens into shared components: that would preserve duplicated, unreliable Cloud semantics behind common visuals.

## 23. Recommended architecture

### Selected Option C — Canonical Cloud adapter first

```text
Firestore room or local Cloud archive
  -> strict Cloud source parser
  -> Cloud canonical adapter
  -> canonical replay + validation diagnostics
  -> Cloud dashboard projection
  -> shared pure ranking/stats/share semantics
  -> local-style Cloud result presentation
```

Option A is rejected because raw data and rules authority are not sufficiently protected. Option B would centralize the current screen reducer but still duplicate replay and leave Cloud correction without the required canonical contract.

### 23.1 Required future Cloud adapter contract

1. **Inputs:** accept a frozen source object containing room, all members including historical participants, temp identities, all lineups, and all hands. Support both live-frozen and local archive sources through one strict source type.
2. **Schema:** add explicit archive/source schema version and canonical adapter version. Reject unsupported forward versions.
3. **Hand index:** validate Cloud `1..N`, normalize to canonical `0..N-1`, and retain original index/ID for traceability.
4. **Hand ID:** stop treating ID and index as one semantic in the canonical layer; require unique stable IDs independently of normalized order.
5. **Player identity:** namespace/preserve member UID and temporary ID as stable identities. Never infer identity from display name or current seat.
6. **Temp merge:** represent an identity alias/claim as an explicit versioned event or define a frozen pre-game-only merge window. Do not rewrite completed hand history silently.
7. **Lineup boundaries:** require exact `hand.lineupVersion`; normalize initial Cloud boundary `0` to canonical `0`, and later Cloud effective index `k` to canonical `k - 1`. Validate no overlap/gap/unknown identity and preserve pending final boundary separately when no hand uses it.
8. **Starting dealer:** persist it explicitly in room/archive. Until migrated, adapter may map the current fixed seat-zero rule only under a known source version; absence in unknown sources is a diagnostic.
9. **Rules:** require a complete supported serialized snapshot and map it strictly to canonical HK rules. No default-rule fallback may be authoritative.
10. **Outcome:** map `zimo`, `discard`, and `draw`; validate winner/discarder membership, fan, and draw dealer action.
11. **Stored deltas:** current Cloud source has none, so canonical replay derives them. If added later, treat stored deltas as diagnostic comparison data, not the calculation authority.
12. **Versions:** keep optimistic command `currentVersion`, hand index, and independent monotonic `recordMutationVersion` separate.
13. **Correction:** append an immutable host-authorized revision targeting the last effective hand/event; never update/delete the original hand in place.
14. **Terminal lifecycle:** end must be terminal for gameplay. Post-end changes can only be authorized revisions that produce a new result/archive generation without reopening the room.
15. **Archive source:** archive a validated frozen source plus source/mutation/archive versions and integrity digest. Local persistence must reject older replacement generations.
16. **Authority:** a Cloud result projection is authoritative only when parser, index, identity, lineup, rules, lifecycle, and canonical replay validation all pass.

## 24. Proposed Phase 2B-1 checkpoint

**Phase 2B-1 — Pure Cloud Canonical Adapter and Result Characterization**

Scope:

- define strict, versioned Cloud source parsing without changing the frozen local Dashboard;
- implement a pure Cloud archive/live-source adapter into the existing canonical replay input;
- normalize one-based indexes and lineup boundaries;
- preserve UID/temp identities and reject ambiguous/destructively incomplete histories;
- map rules strictly and surface stable diagnostics rather than fallback calculations;
- produce a Cloud dashboard projection with local competition-rank and leader semantics;
- characterize scenarios A-E, tie/all-zero ranking, draw stay/pass, East-North -> South-East, malformed rules, missing lineup, non-contiguous hands, and more-than-four historical participants;
- compare current happy-path Cloud settlements against canonical replay golden fixtures;
- keep `CloudArchiveDetailScreen` on its current path until adapter tests prove authority.

Explicitly out of scope for 2B-1:

- visual parity refactor;
- multiplayer correction UI/mutations;
- in-place migration of existing archives;
- Cloud cleanup/TTL infrastructure;
- broad shared-component extraction.

Before any correction release, a following hardening checkpoint must close the P0 Firestore lifecycle gap, replace broad host hand/lineup mutation with append-only revision authority, and define archive regeneration/versioning.

## 25. Simulator audit

Read-only checks confirmed:

- booted device: iPhone 17 (`iPhone18,3`);
- runtime: iOS 26.5;
- Debug app bundle: `com.tylerkagit.mahjongfan`;
- app was running at Home;
- the simulator app's local `cloud_archives` table contained zero rows.

Therefore no safe existing Cloud ended fixture was available. No production Cloud room was created, ended, archived, or modified, and QA-A was not touched. No Cloud result screenshot could be captured without manufacturing audit data. UI findings rely on production render code and existing `CloudArchiveDetailScreen`, `MultiplayerGameTableScreen.endGame`, `HistoryScreen`, and archive-flow tests.

## 26. Exact reference index

- Local reference UI: `src/screens/GameDashboardScreen.tsx:135-667`
- Local canonical/legacy projection authority: `src/domain/gameRecord/localDashboardProjection.ts:270-385`
- Local tie/leader semantics: `src/domain/gameRecord/dashboardResultPresentation.ts:17-49`
- Tie tests: `__tests__/domain/gameRecord/dashboardResultPresentation.test.ts:13-40`
- Cloud model: `src/models/cloud.ts:24-213`
- Hand writes/index/version: `src/services/cloud/handRepo.ts:13-58`
- Lineup writes and destructive temp merge: `src/services/cloud/roomRepo.ts:478-530`
- End/archive/sync/delete service: `src/services/cloud/roomRepo.ts:596-685`
- Archive payload and local persistence sequence: `src/services/cloud/archiveRepo.ts:22-90`
- Archive SQLite parser/replacement: `src/db/cloudArchiveRepo.ts:49-137`
- SQLite schema: `src/db/schema.ts:132-145`, `280-296`
- Timeline completeness checks: `src/services/cloud/roomTimelineRepo.ts:19-86`
- Active table replay and auto archive: `src/screens/cloud/MultiplayerGameTableScreen.tsx:245-280`, `485-625`, `848-972`
- Cloud result reducer and UI: `src/screens/cloud/CloudArchiveDetailScreen.tsx:110-249`, `284-700`
- Cloud helper dealer/lineup logic: `src/screens/cloud/helpers.ts:10-44`
- History integration: `src/screens/HistoryScreen.tsx:250-339`, `373-438`
- Guest recovery and host recovery difference: `src/screens/HomeScreen.tsx:122-154`; `src/services/cloud/roomRepo.ts:308-329`
- Profile stats: `src/services/cloud/profileRepo.ts:90-138`
- Firestore authority: `firestore.rules:87-125`, `206-301`
- Archive behavior tests: `__tests__/services/cloud/archiveFlow.test.ts:63-262`
- End/retry tests: `__tests__/screens/MultiplayerGameTableScreen.endGame.test.tsx:219-449`
- Current Cloud result fixture test: `__tests__/screens/CloudArchiveDetailScreen.test.tsx:57-203`

## 27. Completion verdict

The Cloud raw timeline is promising and mostly reconstructable for normal lineup changes, but current result authority, archive guarantees, identity merge behavior, integrity handling, and Firestore lifecycle rules are not strong enough for visual-only parity or multiplayer correction. Phase 2B-1 should establish a strict canonical Cloud adapter and characterized projection first.
