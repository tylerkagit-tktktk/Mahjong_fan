# dev3.0 Product UX Audit

## Context

- Baseline: `0374d4c fix(dev3): validate multiplayer result flow`
- Device: iPhone 17 Simulator, iOS 26.5, current Debug build
- Lens: normal Hong Kong Mahjong player; product UX only
- The development Fast Refresh banner was treated as simulator noise, not a product finding.

## Journeys tested

- Home → History → reopen an ended local result.
- Home → New Game → local rules and player setup → confirmation → active table.
- Active table → self-draw hand → draw hand → end confirmation → result → History.
- New Game → 加入同步玩家 → room creation → host-name confirmation → multiplayer lobby.
- A second member and a full multiplayer game were not repeated because the recent Phase 2B-3 E2E already covered that path.

## Top 1

**Problem**

Home only exposes `開新枱` and `所有戰績`. There is no visible `開多人牌局` or `加入牌局` entry. Multiplayer is discovered only after entering the New Game setup and understanding the secondary label `加入同步玩家`.

**Why it matters**

A first-time group cannot tell which path is for one-table scoring, creating a multiplayer room, or joining an existing room. The product's most important starting choices are hidden behind a setup screen and technical-sounding language.

**Recommended direction**

Expose three clear Home actions: `單機記分`, `開多人牌局`, and `加入牌局`. Keep the existing rules/player setup, but enter it with the selected mode already explained in plain player language.

**Estimated scope**

```text
Medium
```

**Do now?**

```text
YES
```

## Top 2

**Problem**

New Game combines game title, scoring model, gun mode, stake preset, minimum fan, cap, seat mode, four names, synchronization, and a second confirmation sheet in one long setup. The main start action is fixed at the bottom, while the player and multiplayer controls require scrolling and interpretation.

**Why it matters**

Four players sitting down to keep score must make many decisions before the first hand. The default Hong Kong rules are sensible, but the screen still asks users to process advanced options before they know whether they need them; the confirmation repeats much of the same information.

**Recommended direction**

Make the common path a short two-step flow: game name/players, then optional rules. Keep the current Hong Kong defaults, move advanced scoring controls behind a compact `進階設定`, and reserve confirmation for unusual rules or a concise final summary.

**Estimated scope**

```text
Medium
```

**Do now?**

```text
YES
```

## Top 3

**Problem**

On the active table, the most common winning-hand action is discovered by tapping a player score card. The cards are visually presented as score panels, and their accessibility descriptions only expose seat/name/amount; there is no visible `記錄食糊` cue. After a hand was recorded, the normal screen exposed `流局` and `結束牌局`, but no clearly findable last-hand correction action.

**Why it matters**

This is the screen used repeatedly during a real game. A new scorer can hesitate over which card to tap, worry about changing a score accidentally, and have no obvious recovery path after a mistaken entry.

**Recommended direction**

Add one explicit primary action such as `記錄食糊`, with `自摸／出銃` choices inside the flow. Keep player cards as selectable shortcuts only when their affordance is labelled. Make `改正最後一鋪` visibly available after at least one active hand, separated from the destructive `結束牌局` action.

**Estimated scope**

```text
Medium
```

**Do now?**

```text
YES
```

## Backlog notes

- History rows are useful and recent games are easy to find; a more explicit Local/Cloud badge can wait until the multiplayer lifecycle wording is revisited.
- The result hierarchy is readable and ranking appears first; no result architecture change is recommended from this audit.
- The Debug-only `加入虛擬真人玩家` control should not be exposed in a release build, but it was not ranked as a normal-player UX issue.

## Screenshot evidence

- `/private/tmp/product-ux-audit-home.png`
- `/private/tmp/product-ux-audit-new-game.png`
- `/private/tmp/product-ux-audit-active-game.png`
- `/private/tmp/product-ux-audit-result.png`
- `/private/tmp/product-ux-audit-history.png`
- `/private/tmp/product-ux-audit-multiplayer-lobby.png`

## Recommendation for next implementation checkpoint

Start with a focused **Phase 2B-4 / Product UX checkpoint** covering Home entry-point clarity, a shorter New Game common path, and explicit active-table hand-entry/correction actions. Re-run the existing multiplayer E2E after the entry-point changes; do not expand Cloud correction or archive architecture in this checkpoint.
