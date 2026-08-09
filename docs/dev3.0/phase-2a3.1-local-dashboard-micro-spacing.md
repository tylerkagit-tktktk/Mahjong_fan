# Phase 2A.3.1 — Local Dashboard Micro Spacing Polish

## Scope

Phase 2A.3.1 is a small visual pass on the existing ended local Dashboard. The Phase 2A.3 hierarchy and disclosure behaviour remain authoritative:

```text
Result Hero
Player Ranking
Game Stats
Hand history · N hands   +
Rules Summary             +
```

No data, projection, replay, settlement, or navigation contract changed.

## Adjustments

- The transparent History disclosure row now uses the existing 10-point spacing token vertically, while retaining a minimum 44-point whole-row touch target.
- The History title remains aligned with the page content. The trailing `＋` / `－` receives a small existing-token inset, a stable minimum visual width, centered text alignment, and the same body typography weight as Rules' disclosure indicator.
- The Rules card uses the existing 16-point section spacing above and below. It remains a white Card; History remains transparent and is not wrapped in a card, border, pill, shadow, or animation.
- Existing `ScreenContainer` bottom safe-area handling and `SectionList` content bottom padding remain in place, so short collapsed pages retain comfortable space above the Home indicator without an iPhone-specific hard-coded height.

## Locked unchanged areas

Result, Ranking, Stats, card radius/background/typography, history count authority, accessibility role/state, zero-hand disabled behaviour, Share, Rules semantics, expanded timeline rows, wind headings, chronology, amounts, separators, and SectionList virtualization are unchanged.

## Verification

Focused tests keep the disclosure state and accessibility contract, and assert only the minimum touch/spacing layout contract and Rules section token. Simulator QA on iPhone 17 / iOS 26.5 uses the existing four-hand `Hhhh` ended fixture: the collapsed view shows Stats, History, Rules, and bottom safe-area breathing room; one expansion confirms no timeline regression. Large Text keeps the disclosure title/count and indicator separated, with Rules still clear of the Home indicator.

Captures remain outside Git:

- Collapsed Dashboard: `/tmp/mahjong-phase2a31-dashboard-collapsed-zh-HK.png`
- Expanded timeline: `/tmp/mahjong-phase2a31-dashboard-expanded-zh-HK.png`
- Expanded bottom and Rules: `/tmp/mahjong-phase2a31-dashboard-expanded-bottom-zh-HK.png`
- Collapsed footer and safe area: `/tmp/mahjong-phase2a31-dashboard-collapsed-footer-zh-HK.png`
- Large Text footer: `/tmp/mahjong-phase2a31-dashboard-large-footer-zh-HK.png`

## Out of scope

No `LocalDashboardProjection`, replay, scoring, settlement, SQLite/schema, lifecycle, correction/undo, share payload, ranking/statistics, Cloud/Firestore, multiplayer, dependency, theme refactor, animation, new card, or new feature change is included.
