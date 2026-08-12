# Product UX 2A — Local Quick Setup

## Outcome

Local new-game setup now presents only the choices needed for a normal one-device game: game title, four players, seat mode, a compact rules summary, and the primary start action. The previous explanatory copy and multiplayer sync entry are omitted from this Local path.

## Rules editing

The summary is derived directly from the existing scoring state and updates as rules change. Selecting **Edit** opens the existing complete scoring controls in a focused bottom sheet; no second rule model or persisted navigation intent was introduced.

## Creation behavior

After existing validation succeeds, Local Quick Setup calls the existing local game creation path directly and navigates to the game table. The routine confirmation step is skipped for Local only.

## Multiplayer compatibility

`entryMode: 'multiplayer'` retains the established full inline rules, sync setup, validation, confirmation, and cloud room flow. A recovered room draft also remains on that established flow.

## Accessibility and localization

Player fields have seat-specific accessibility labels. The rules editor action announces the current rules, controls retain minimum touch targets, and all newly introduced copy is available in Traditional Chinese, Simplified Chinese, and English.
