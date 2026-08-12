# Product UX #2C — Join Entry

## Previous behavior

Home opened `JoinInvite` with no parameters, so a normal `加入牌局` tap was presented as an incomplete deep link.

## Join Landing

Home now opens a dedicated Join Landing. It accepts only the complete existing invite URL, provides local inline format feedback, and forwards structurally valid `roomId` and `token` parameters to the existing `JoinInvite` route.

The Home subtitle now describes the available capability as `使用邀請連結`; it no longer claims QR scanning or short-code entry.

## Parser and validation boundary

The local parser trims input, requires the `mahjongfan://join` route, and extracts non-empty `roomId` and `token` query parameters. It does not validate invite existence, expiry, room state, capacity, or membership.

Actual validation and joining remain in `JoinInvite → joinWithInvite`, including anonymous session setup, invite lookup, join ticket, member creation, room count update, joined-room pointer, and `RoomLobby` navigation.

Typing, editing, and local parsing on Join Landing perform no Firebase or Firestore work.

## Direct links and deferred capabilities

React Navigation still maps direct `mahjongfan://join?roomId=…&token=…` links straight to `JoinInvite`; they do not pass through Join Landing.

QR display/share remains available to hosts, but scanning is deferred because there is no camera/scanner dependency. Short codes remain deferred because no player-facing short-code model or lookup exists.

## Localization, accessibility, and QA

Join Landing and the corrected Home subtitle support zh-Hant, zh-Hans, and English. The screen uses an announced heading, labelled URL input with a paste hint, accessible live error text, localized CTA, existing navigation back action, and scrollable Dynamic Type-safe content.

Focused tests cover Home routing/copy, parser structure, empty and malformed input, valid navigation, the no-Cloud pre-submit boundary, route registration, direct-link routing, and existing `JoinInvite` behavior.

Simulator evidence:

- `/private/tmp/product-ux-2c-join-landing.png`
- `/private/tmp/product-ux-2c-join-invalid.png`
- `/private/tmp/product-ux-2c-join-valid-input.png`
