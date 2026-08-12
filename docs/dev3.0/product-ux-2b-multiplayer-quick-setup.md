# Product UX #2B — Multiplayer Quick Setup

## Previous flow

The Multiplayer entry previously reused the full New Game form. Rules, four Local-style player fields, sync enablement, and a generic Local `建立牌局` action appeared together before a room existed. Room creation then required a routine host-name confirmation modal.

## Two-phase model

Multiplayer now has two explicit states inside the existing `NewGameStepper` host flow:

1. Pre-room: title, inline host name, compact rules summary, and `建立多人牌局`.
2. Room created: share-invite action, joined-player/host status, four seats, temporary-player entry, seat mode, rules summary, and `開始牌局`.

Invited players continue to use `JoinInvite → RoomLobby`. Local Quick Setup remains separate and unchanged.

## Persistence boundary and identity

Entering from Home, editing the title/host name, and editing pre-room rules do not create a room, member, invite, or hosted-room pointer. The explicit `建立多人牌局` action validates setup, ensures the current session, persists the host profile name, and calls the existing guarded room-creation path.

The host name is initialized from the existing signed-in profile when available. Typing does not persist profile changes. The former routine host-name confirmation modal is no longer used by normal room creation.

## Rules

Both phases reuse the Product UX #2A state-derived summary and focused rules editor. A host may update the existing `rulesSnapshot` while an open room is being configured; the room schema is unchanged, and updates are limited to the host before start.

## Players, seats, and temporary players

Authenticated members are shown as joined players with visible Host/You labels. Four Mahjong seats remain available for manual or automatic arrangement, including the existing select, reseat/takeover, and bench behavior.

Temporary names are entered only through the deliberate `加入臨時玩家` sheet after room creation. These names remain local draft state until a validated start; existing temporary-player records are created only as part of the start path.

## Minimum joined-player boundary

Multiplayer still requires at least two joined members, including the host. Starting with only the host now opens an explicit prompt:

- `邀請朋友` keeps the room and opens the existing invite flow.
- `返回單機記分` explicitly deletes the hosted room through the existing cleanup path, then returns to Local Quick Setup with the title and rules prefilled.

There is no silent Multiplayer-to-Local conversion. With enough joined and seated members, the existing confirmation, temporary-player completion, lineup write, `startRoom`, and `MultiplayerGameTable` transition remain in use.

## Recovery, accessibility, and Dynamic Type

An existing open hosted room is restored directly into the room-created host state. Active rooms still return to `MultiplayerGameTable`.

Host name, invite action, joined/host status, player chips, seat rows, status labels, temporary-player controls, rule editing, insufficient-player choices, and primary actions have explicit accessibility semantics. Cards and rows retain 44pt minimum targets and allow wrapping/growth for Large Text.

## Verification

Focused coverage verifies pre-room rendering and no early write, explicit room creation, host setup and recovery, rules persistence, joined/temporary player handling, the two-member boundary, explicit Local return, normal Multiplayer start, Local 2A regression, JoinInvite/RoomLobby compatibility, and all three locales.

Simulator evidence:

- `/private/tmp/product-ux-2b-final-pre-room.png`
- `/private/tmp/product-ux-2b-final-host-room.png`
- `/private/tmp/product-ux-2b-final-insufficient-players.png`
- `/private/tmp/product-ux-2b-final-large.png`
- `/private/tmp/product-ux-2b-final-header.png`

Disposable room `room_1786553769146_roppmm` was created through the supported app flow and removed through the normal host cleanup flow after QA. A fresh Multiplayer entry returned to pre-room setup rather than recovering the deleted room. The creation guard retains only its intentional cooldown timestamp with `activeRoomId` released; it is not an orphan room pointer.

Header micro-pass room `room_1786554875221_4qzyow` was likewise removed through the exact-room host cleanup flow. Fresh re-entry confirmed that its hosted-room pointer no longer recovered a room.

## Deferred

RoomLobby visual redesign and any change to the existing room identifier/invite-code format remain outside Product UX #2B.
