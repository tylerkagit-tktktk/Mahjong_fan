# Game Lifecycle

## State Machine

- `draft`: game created, no hands recorded.
- `active`: at least one hand recorded, game not ended.
- `ended`: game ended with `handsCount > 0`.
- `abandoned`: game ended with `handsCount == 0`.

## Allowed Actions by State

- `insertHand`
  - allowed in `draft`, `active`
  - rejected in `ended`, `abandoned`
- `endGame`
  - allowed in `draft`, `active`
  - sets `abandoned` if no hands, otherwise `ended`
- `reseatPrompt`
  - UI-only prompt when wrap detected (`北風 -> 東風`)
  - can occur while game is `active`
- `reseatApply`
  - explicit user action only (no automatic rotation in repo)
  - updates `games.seatRotationOffset`

## Invariants

- `games.handsCount` equals persisted hand rows for the game.
- `games.currentRoundLabelZh` means **next hand** round label computed by `getRoundLabel(startingDealerSeatIndex, hands)`.
- `games.seatRotationOffset` means effective seat mapping offset for future hands/UI mapping.
- Repo must never auto-increment `seatRotationOffset` on wrap.

## Wrap Detection

- Wrap is defined as previous round label starts with `北風` and next round label starts with `東風`.
- Trigger source:
  - previous: `games.currentRoundLabelZh`
  - next: `getRoundLabel(startingDealerSeatIndex, handsAfterInsert).labelZh`
- On wrap:
  - UI may prompt for reseat.
  - Repo still writes hand/round label normally and keeps `seatRotationOffset` unchanged unless user applies reseat.
