# Product UX #1 — Home Game Entry Redesign

## Previous problem

Home made local scoring easy to find but hid multiplayer creation behind the New Game setup. A first-time player could not immediately distinguish one-phone scoring, starting a group game, or joining a friend's game.

## New hierarchy

1. Brand and existing Mahjong artwork.
2. Primary `開始記分` card with `一部手機，立即開枱`.
3. `多人同步` with separate `開多人枱` and `加入牌局` cards.
4. One lightweight `所有戰績` entry.
5. Settings in the top-right corner.

No recent-history section, tab bar, tools navigation, account status, or technical Cloud wording was added.

## Navigation mapping

- `開始記分` keeps the existing active-local-game guard, then navigates to `NewGameStepper`.
- `開多人枱` navigates to `NewGameStepper` with transient `entryMode: 'multiplayer'`.
- The multiplayer intent scrolls to the existing player/sync area and surfaces its existing create-room control. It does not create a room, bypass validation, or persist intent data.
- `加入牌局` navigates to the existing `JoinInvite` route.
- `所有戰績` and Settings retain their existing routes.

## Visual, accessibility, and localization

- The existing warm background, Mahjong tiles, dice, green palette, and generous whitespace are retained.
- The main card is visually dominant; multiplayer cards use muted green and warm cream with in-app SVG line icons, not emoji.
- All five visible Home actions are labelled buttons. The three game-entry actions include their purpose in their accessibility labels.
- New Home and multiplayer-entry strings are present in Traditional Chinese, Simplified Chinese, and English.

## QA and verification

- iPhone 17 / iOS 26.5 Debug build: default and Large text passed visual review; text size was restored to Standard afterwards.
- Multiplayer entry was opened from Home and confirmed to reach the existing setup UI without creating a room.
- Focused Home tests, complete Jest suite, ESLint, TypeScript, and diff checks passed.

Screenshots:

- `/private/tmp/product-ux-1-home-default.png`
- `/private/tmp/product-ux-1-home-large.png`

## Deferred

Product UX #2 remains intentionally deferred: New Game rules/player setup is unchanged apart from presenting its existing sync action when it is explicitly entered from Home's multiplayer card.
