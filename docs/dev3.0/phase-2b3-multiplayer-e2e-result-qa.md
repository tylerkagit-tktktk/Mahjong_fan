# Phase 2B-3 Multiplayer End-to-End Result QA

Date: 2026-08-10 (Asia/Hong_Kong)

## Scope and baseline

- Repository: `dev3.0`, baseline `b45c936` (`feat(dev3): align cloud ended result experience`), working tree was 17 commits ahead of `origin/dev3.0` before this QA.
- Device coverage: iPhone 17 and iPhone 17 Pro simulators, both iOS 26.5.
- App bundle: `com.tylerkagit.mahjongfan`.
- Firebase project used by the Debug build: `mahjong-fan`.
- This was a controlled production-flow QA run. No Firestore or SQLite records were manually edited.

## Valid Cloud run

Room: `room_1786337060551_hvq1qz`

Title: `QA-2B3-CLOUD`

Rules selected in the app:

- 香港牌／傳統番數
- 全銃制
- 二五雞
- 最低 3 番
- 爆棚 10 番
- HKD

The valid run used two authenticated anonymous simulator members plus two temporary players. The requested host plus three temporary-player setup cannot start as Cloud: the product deliberately falls back to local when there is only one real member, and the room repository also requires at least two real seats. This constraint is recorded below rather than bypassed.

Initial lineup created through the normal lobby flow:

| Seat | Player | Identity |
| --- | --- | --- |
| 東 | Host-A | authenticated host |
| 南 | 測試玩家 A | temporary |
| 西 | 測試玩家 B | temporary |
| 北 | Host-A | second authenticated simulator member |

The two authenticated simulator profiles had the same display name. This produced a React duplicate-key warning and makes the result text ambiguous, but the underlying player IDs remained distinct and the canonical replay stayed valid.

## Deterministic hand sequence

Seven hands were submitted through the Cloud table UI:

1. 東風東局 — 東 Host-A 自摸, 3 番; 留莊.
2. 東風東局 — 南 測試玩家 A 食糊, 3 番; 東 Host-A 出銃.
3. 東風南局 — 流局; 留莊.
4. 東風南局 — 流局; 過莊.
5. 東風西局 — 西 測試玩家 B 自摸, 3 番; 留莊.
6. 東風西局 — 北 Host-A 食糊, 3 番; 西 測試玩家 B 出銃.
7. 東風北局 — 流局; 留莊.

The per-hand result gains shown in the expanded history were +HK$12, +HK$8, +HK$12 and +HK$8. The final four-way balance is 0 because those four winning settlements cancel exactly; this was independently confirmed by replaying the archived production-like payload through `buildCloudCanonicalResult`.

## Result and persistence checks

- Cloud table completed all 7 submissions and ended through the normal confirmation dialog.
- `CloudArchiveDetail` loaded the canonical result with 7 hands and 3 draws.
- Expanded history showed all seven events, including both draw actions and both discarders.
- Expanded rules showed HK / HK$ / 3 番 / 傳統番數 / 全銃 / 二五雞 / 爆棚 10.
- The native share sheet opened successfully and was canceled without publishing.
- Read-only SQLite verification found one `cloud_archives` row for the room with `archiveVersion=1`, `memberCount=4`, `handCount=7`, and applied stats version 1. The archive payload contained 2 authenticated members, 2 temporary players, 1 lineup, and 7 hands.
- History displayed `雲端封存`, `已封存到本機`, `7 手`, and `v1`.
- Reopening from History returned to the same Cloud result page.
- After terminating and relaunching the app, History still contained the Cloud archive and reopening it again returned the same 7-hand result.
- Large text was selected in Settings for a visual pass; the result page remained readable without visible clipping. The simulator preference was restored to 標準 afterwards.
- An offline toggle was not performed because no safe, straightforward network control was available in this environment. SQLite persistence plus cold relaunch covered the local reopen path.

Captured QA screenshots:

- `/private/tmp/qa-2b3-cloud-result-top.png`
- `/private/tmp/qa-2b3-cloud-history-expanded.png`
- `/private/tmp/qa-2b3-cloud-rules.png`
- `/private/tmp/qa-2b3-cloud-large-text.png`

## Findings and scope blockers

### Fixed in the working tree

The New Game setup was filtering temporary players out of its joined-player projection even though Firestore had accepted them. The minimal fix keeps both authenticated and temporary joined players visible, with focused coverage in `__tests__/screens/newGameSyncHelpers.test.ts` and helper code in `src/screens/newGameSyncHelpers.ts`. This change is intentionally uncommitted for handoff.

### Not fixed in this QA

- Host plus three temporary players cannot produce a Cloud game because the current flow requires at least two real members and otherwise converts to local. The first attempted `QA-2B3` run therefore became a local game and is not counted as Cloud evidence.
- Active-table lineup replacement was not achievable within seven hands. `ReseatFlow` only appears after a full North-to-East wind cycle and only reorders the existing four identities; it cannot introduce a new replacement identity. The active table also has no normal route back to the lobby host tools. No new replacement UI was added because this phase explicitly excludes feature redesign.
- The second simulator inherited the display name `Host-A`, producing the duplicate React key warning. This should be resolved through a normal profile/name flow before treating duplicate-name multiplayer QA as clean.
- The host archive remained at `1/2` authenticated members synchronized locally because the second member was not given a normal post-end archive route. The Cloud deletion control correctly stayed disabled; the room was not forcibly deleted.

## Verdict

Cloud canonical result, local SQLite archive, share entry, History reopen, cold relaunch, rules disclosure, and large-text result presentation all passed for the valid two-real-member run. Phase 2B-3 should not be marked fully green/frozen yet: replacement coverage and the duplicate authenticated display-name path remain product-flow blockers, and the residual Cloud room should be cleaned only after the normal member synchronization flow is available.
