# Product UX #3 — Active Table Core Actions

## Action hierarchy

The four player cards remain the Local game's primary scoring entry: tap the winner, choose the existing settlement flow, then save. Before the first recorded round, the table shows a lightweight winner-tap hint. `流局` remains a directly available secondary action.

After a saved round, the footer shows a compact, authoritative `上一鋪` card with the latest persisted result and a `修正` entry. Replacing or deleting the latest round reloads the canonical Local bundle, so the card updates immediately; deleting the only round restores the recording hint.

## Lower-frequency actions

`結束牌局` moved from the footer to the accessible right-top `更多選項` menu. It still invokes the existing destructive end-game confirmation and lifecycle. The menu also provides read-only `牌局資料` and `規則說明`; neither surface changes scoring rules, game metadata, or seats.

## Player-facing terminology

Hong Kong Chinese user-facing Mahjong-round references use `鋪` (Simplified: `铺`), including previous-round correction labels and next-round text. Internal `hand`/`lastHand` model vocabulary remains unchanged. Unrelated meanings of `手` are not changed.

## Accessibility and QA

Player cards announce that tapping records that player as winner. The winner-tap helper is not an extra VoiceOver stop, the previous-round card announces its summary and edit action, and the overflow control is labelled `更多選項`. The info sheets scroll for Dynamic Type.

Focused coverage validates initial guidance, persisted self-draw/discard/draw summaries, immediate summary refresh, delete-to-guidance behavior, overflow read-only surfaces, end-game confirmation, reseat regression, and locale copy. Simulator captures are kept in `/private/tmp/product-ux-3-final-*.png`.
